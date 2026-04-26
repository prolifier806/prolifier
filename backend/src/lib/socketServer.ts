import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { supabaseAdmin } from "./supabase";
import * as presence from "./presenceStore";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  MessageSendPayload,
  WsMessage,
  WsDmMessage,
  DmSendPayload,
  PresenceUser,
} from "./socketEvents";

// Augment socket data so we can access the authenticated user on every event
interface SocketData {
  userId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  role: string | null;
}

type AppSocket = import("socket.io").Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// ── Idempotency cache ─────────────────────────────────────────────────────────
// Prevents duplicate DB inserts when a client retries a send.
// Key = clientId (UUID), Value = persisted message id.
// Bounded to last 10 000 entries; entries expire after 10 minutes.
const seen = new Map<string, { msgId: string; expiresAt: number }>();
const DEDUP_TTL = 10 * 60 * 1000;

function markSeen(clientId: string, msgId: string) {
  seen.set(clientId, { msgId, expiresAt: Date.now() + DEDUP_TTL });
  if (seen.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of seen) {
      if (now > v.expiresAt) seen.delete(k);
      if (seen.size <= 8_000) break;
    }
  }
}

function alreadySeen(clientId: string): string | null {
  const entry = seen.get(clientId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { seen.delete(clientId); return null; }
  return entry.msgId;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function authenticate(socket: AppSocket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error("Missing auth token"));

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return next(new Error("Invalid token"));

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("name, color, avatar_url, role, account_status")
    .eq("id", data.user.id)
    .single();

  if ((profile as any)?.account_status === "banned") return next(new Error("Account banned"));

  socket.data.userId   = data.user.id;
  socket.data.name     = profile?.name ?? "Unknown";
  socket.data.color    = profile?.color ?? "bg-primary";
  socket.data.avatarUrl = profile?.avatar_url ?? null;
  socket.data.role     = profile?.role ?? null;

  next();
}

// ── Helper — broadcast message:updated from Supabase Realtime fallback ────────
// Called externally when Supabase fires a CDC event that bypasses Socket.IO
// (e.g. admin direct DB edits). Keeps all clients consistent.
let _io: SocketServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | null = null;

export function broadcastFromDb(groupId: string, event: keyof ServerToClientEvents, payload: any) {
  _io?.to(`group:${groupId}`).emit(event as any, payload);
}

export function emitToUser(userId: string, event: keyof ServerToClientEvents, payload: any) {
  _io?.to(`user:${userId}`).emit(event as any, payload);
}

export function emitToUserExcept(userId: string, exceptSocketId: string, event: keyof ServerToClientEvents, payload: any) {
  _io?.to(`user:${userId}`).except(exceptSocketId).emit(event as any, payload);
}

// ── Main init ─────────────────────────────────────────────────────────────────

export function initSocketServer(httpServer: HttpServer, allowedOrigins: Set<string>) {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: {
        origin: (origin, cb) => {
          if (!origin || allowedOrigins.has(origin)) cb(null, true);
          else cb(new Error(`Socket.IO CORS blocked: ${origin}`));
        },
        credentials: true,
      },
      // Prefer WebSocket, fall back to polling only when WS is unavailable
      transports: ["websocket", "polling"],
      pingInterval: 25_000,
      pingTimeout: 20_000,
    }
  );

  _io = io;

  // ── Auth middleware applies to every connection
  io.use((socket, next) => authenticate(socket as AppSocket, next));

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AppSocket;
    const { userId, name, color, avatarUrl, role } = socket.data;

    // Auto-join personal room so server can push user-specific events (login alerts etc.)
    socket.join(`user:${userId}`);

    // ── group:join ─────────────────────────────────────────────────────────
    socket.on("group:join", (groupId) => {
      socket.join(`group:${groupId}`);
      const user: PresenceUser = { userId, name, color, avatarUrl, role: role ?? null } as any;
      presence.userJoined(groupId, user);

      // Send the new user the current presence snapshot
      socket.emit("presence:snapshot", {
        groupId,
        users: presence.getGroupPresence(groupId),
      });

      // Broadcast the join to everyone else in the room
      socket.to(`group:${groupId}`).emit("presence:update", {
        groupId,
        user,
        online: true,
      });
    });

    // ── group:leave ────────────────────────────────────────────────────────
    socket.on("group:leave", (groupId) => {
      socket.leave(`group:${groupId}`);
      presence.userLeft(groupId, userId);
      io.to(`group:${groupId}`).emit("presence:update", {
        groupId,
        user: { userId, name, color, avatarUrl, role: role ?? null } as any,
        online: false,
      });
    });

    // ── message:send ───────────────────────────────────────────────────────
    socket.on("message:send", async (payload: MessageSendPayload) => {
      const { clientId, groupId, text, mediaUrl, mediaType, replyToId } = payload;

      // Guard: must be in the room (joined the group)
      if (!socket.rooms.has(`group:${groupId}`)) {
        socket.emit("error", "Join the group before sending messages");
        return;
      }

      // Character limit validation
      if (text && text.trim().length > 1500) {
        socket.emit("error", "Message exceeds maximum character limit");
        return;
      }

      // Idempotency: if we already processed this clientId, re-ack without re-inserting
      const existingId = alreadySeen(clientId);
      if (existingId) {
        const { data: existing } = await supabaseAdmin
          .from("group_messages")
          .select("*")
          .eq("id", existingId)
          .single();
        if (existing) {
          socket.emit("message:ack", { clientId, message: dbRowToWsMsg(existing, socket.data) });
        }
        return;
      }

      // ── Broadcast immediately (before DB write) so sender and others see it instantly
      const optimisticMsg: WsMessage = {
        id: clientId, // use clientId as temp id until DB confirms
        group_id: groupId,
        user_id: userId,
        text: text ?? null,
        media_url: mediaUrl ?? null,
        media_type: mediaType ?? null,
        created_at: new Date().toISOString(),
        edited: false,
        unsent: false,
        removed_by_admin: false,
        is_system: false,
        reply_to_id: replyToId ?? null,
        author_name: name,
        author_color: color,
        author_avatar_url: avatarUrl,
        author_role: role ?? null,
      };

      // Broadcast to everyone in the room EXCEPT the sender
      // (sender already has the optimistic message in UI)
      socket.to(`group:${groupId}`).emit("message:new", optimisticMsg);

      // ── Persist to DB
      const { data: row, error } = await supabaseAdmin
        .from("group_messages")
        .insert({
          group_id: groupId,
          user_id: userId,
          text: text || null,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
          reply_to_id: replyToId || null,
          is_system: false,
          edited: false,
          unsent: false,
          removed_by_admin: false,
        })
        .select("*")
        .single();

      if (error || !row) {
        socket.emit("error", "Failed to send message");
        return;
      }

      markSeen(clientId, row.id);

      // Update group's last_message_at (fire-and-forget)
      supabaseAdmin
        .from("groups")
        .update({ last_message_at: row.created_at })
        .eq("id", groupId)
        .then(() => {});

      const confirmedMsg = dbRowToWsMsg(row, socket.data);

      // Ack back to sender with the real DB id/created_at
      socket.emit("message:ack", { clientId, message: confirmedMsg });

      // Broadcast the confirmed message to all room members so they can replace
      // the temp UUID (clientId) with the real DB id (new_id).
      socket.to(`group:${groupId}`).emit("message:updated", {
        id: clientId,     // temp id to find the message in receiver's state
        new_id: row.id,   // real DB id — receiver must update m.id to this
        group_id: groupId,
        text: confirmedMsg.text,
        edited: false,
        unsent: false,
        removed_by_admin: false,
      });
    });

    // ── group:read ─────────────────────────────────────────────────────────
    socket.on("group:read", async (groupId) => {
      const now = new Date().toISOString();
      // Upsert server-side read receipt
      supabaseAdmin
        .from("group_last_read")
        .upsert({ user_id: userId, group_id: groupId, last_read_at: now }, { onConflict: "user_id,group_id" })
        .then(() => {});
    });

    // ── typing:start / typing:stop ─────────────────────────────────────────
    socket.on("typing:start", (groupId) => {
      socket.to(`group:${groupId}`).emit("typing:start", { groupId, userId, userName: name });
    });

    socket.on("typing:stop", (groupId) => {
      socket.to(`group:${groupId}`).emit("typing:stop", { groupId, userId });
    });

    // ── dm:join ────────────────────────────────────────────────────────────
    socket.on("dm:join", (otherId) => {
      socket.join(dmRoom(userId, otherId));
    });

    // ── dm:leave ───────────────────────────────────────────────────────────
    socket.on("dm:leave", (otherId) => {
      socket.leave(dmRoom(userId, otherId));
    });

    // ── dm:send ────────────────────────────────────────────────────────────
    socket.on("dm:send", async (payload: DmSendPayload) => {
      const { clientId, receiverId, text, mediaUrl, mediaType, replyToId, replyToText } = payload;

      // Character limit validation
      if (text && text.trim().length > 1500) {
        socket.emit("error", "Message exceeds maximum character limit");
        return;
      }

      // Idempotency
      const existingId = alreadySeen(clientId);
      if (existingId) {
        const { data: existing } = await supabaseAdmin
          .from("messages").select("*").eq("id", existingId).single();
        if (existing) socket.emit("dm:ack", { clientId, message: dbRowToDmMsg(existing) });
        return;
      }

      const room = dmRoom(userId, receiverId);

      // Broadcast optimistic to receiver instantly
      const optimistic: WsDmMessage = {
        id: clientId,
        sender_id: userId,
        receiver_id: receiverId,
        text: text ?? null,
        media_url: mediaUrl ?? null,
        media_type: mediaType ?? null,
        created_at: new Date().toISOString(),
        read: false,
        reply_to_id: replyToId ?? null,
        reply_to_text: replyToText ?? null,
      };
      socket.to(room).emit("dm:new", optimistic);

      // Persist to DB
      const { data: row, error } = await supabaseAdmin
        .from("messages")
        .insert({
          sender_id: userId,
          receiver_id: receiverId,
          text: text || null,
          media_url: mediaUrl || null,
          media_type: mediaType || "text",
          reply_to_id: replyToId || null,
        })
        .select("*")
        .single();

      if (error || !row) {
        socket.emit("error", "Failed to send message");
        return;
      }

      markSeen(clientId, row.id);

      const confirmed = dbRowToDmMsg(row);

      // Ack sender with real DB id
      socket.emit("dm:ack", { clientId, message: confirmed });

      // Tell receiver to replace UUID temp id with real DB id
      socket.to(room).emit("dm:updated", { id: clientId, new_id: row.id });

      // Notification — fire-and-forget, skip if receiver muted the sender
      supabaseAdmin
        .from("mutes").select("id")
        .eq("muter_id", receiverId).eq("muted_id", userId)
        .maybeSingle()
        .then(({ data: muteCheck }) => {
          if (!muteCheck) {
            supabaseAdmin.from("notifications").insert({
              user_id: receiverId,
              type: "message",
              text: `${name} sent you a message`,
              subtext: text?.slice(0, 60) || null,
              action: `message:${userId}`,
              actor_id: userId,
              read: false,
            }).then(() => {});
          }
        });
    });

    // ── dm:read ────────────────────────────────────────────────────────────
    socket.on("dm:read", (otherId) => {
      // Mark DB rows as read (fire-and-forget)
      supabaseAdmin
        .from("messages")
        .update({ read: true })
        .eq("sender_id", otherId)
        .eq("receiver_id", userId)
        .eq("read", false)
        .then(() => {});
      // Mark message notifications from this sender as read
      supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("type", "message")
        .eq("actor_id", otherId)
        .then(() => {});
      // Tell sender their messages were read
      socket.to(dmRoom(userId, otherId)).emit("dm:read", { fromId: userId });
    });

    // ── dm:typing:start / dm:typing:stop ────────────────────────────────────
    socket.on("dm:typing:start", (otherId) => {
      socket.to(dmRoom(userId, otherId)).emit("dm:typing:start", { fromId: userId });
    });

    socket.on("dm:typing:stop", (otherId) => {
      socket.to(dmRoom(userId, otherId)).emit("dm:typing:stop", { fromId: userId });
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      const affectedGroups = presence.userDisconnected(userId);
      for (const groupId of affectedGroups) {
        io.to(`group:${groupId}`).emit("presence:update", {
          groupId,
          user: { userId, name, color, avatarUrl, role: role ?? null } as any,
          online: false,
        });
      }
    });
  });

  return io;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Consistent DM room name — sort ensures both parties join the same room */
function dmRoom(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

function dbRowToDmMsg(row: any): WsDmMessage {
  return {
    id: row.id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    text: row.text ?? null,
    media_url: row.media_url ?? null,
    media_type: row.media_type ?? null,
    created_at: row.created_at,
    read: row.read ?? false,
    reply_to_id: row.reply_to_id ?? null,
    reply_to_text: row.reply_to_text ?? null,
  };
}

function dbRowToWsMsg(row: any, author: Pick<SocketData, "name" | "color" | "avatarUrl" | "role">): WsMessage {
  return {
    id: row.id,
    group_id: row.group_id,
    user_id: row.user_id,
    text: row.text ?? null,
    media_url: row.media_url ?? null,
    media_type: row.media_type ?? null,
    created_at: row.created_at,
    edited: row.edited ?? false,
    unsent: row.unsent ?? false,
    removed_by_admin: row.removed_by_admin ?? false,
    is_system: row.is_system ?? false,
    reply_to_id: row.reply_to_id ?? null,
    author_name: author.name,
    author_color: author.color,
    author_avatar_url: author.avatarUrl,
    author_role: author.role ?? null,
  };
}
