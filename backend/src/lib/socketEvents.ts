/**
 * Canonical Socket.IO event definitions shared between server and frontend.
 * Keep this file pure types — no imports, no runtime code.
 */

// ── Events emitted by CLIENT → SERVER ────────────────────────────────────────

export interface ClientToServerEvents {
  // ── Group chat ──────────────────────────────────────────────────────────
  /** Join a group room to receive its messages */
  "group:join": (groupId: string) => void;

  /** Leave a group room */
  "group:leave": (groupId: string) => void;

  /** Send a new group message */
  "message:send": (payload: MessageSendPayload) => void;

  /** Mark a group as fully read */
  "group:read": (groupId: string) => void;

  /** Group typing indicator — start */
  "typing:start": (groupId: string) => void;

  /** Group typing indicator — stop */
  "typing:stop": (groupId: string) => void;

  // ── Direct messages ─────────────────────────────────────────────────────
  /** Join the DM room with another user */
  "dm:join": (otherId: string) => void;

  /** Leave the DM room with another user */
  "dm:leave": (otherId: string) => void;

  /** Send a direct message */
  "dm:send": (payload: DmSendPayload) => void;

  /** Mark all messages from this user as read */
  "dm:read": (otherId: string) => void;

  /** DM typing indicator — start */
  "dm:typing:start": (otherId: string) => void;

  /** DM typing indicator — stop */
  "dm:typing:stop": (otherId: string) => void;
}

// ── Events emitted by SERVER → CLIENT ────────────────────────────────────────

export interface ServerToClientEvents {
  // ── Group chat ──────────────────────────────────────────────────────────
  /** A new message arrived in a group */
  "message:new": (msg: WsMessage) => void;

  /** A message was edited or confirmed (new_id replaces a temp UUID client-id) */
  "message:updated": (msg: Pick<WsMessage, "id" | "group_id" | "text" | "edited" | "unsent" | "removed_by_admin"> & { new_id?: string }) => void;

  /** A message was deleted (hard delete) */
  "message:deleted": (payload: { id: string; group_id: string }) => void;

  /** Delivery confirmation back to the sender with the persisted row */
  "message:ack": (payload: { clientId: string; message: WsMessage }) => void;

  /** A user started typing in a group */
  "typing:start": (payload: { groupId: string; userId: string; userName: string }) => void;

  /** A user stopped typing in a group */
  "typing:stop": (payload: { groupId: string; userId: string }) => void;

  /** Current online presence snapshot for a group */
  "presence:snapshot": (payload: { groupId: string; users: PresenceUser[] }) => void;

  /** A single user joined or left a group's online presence */
  "presence:update": (payload: { groupId: string; user: PresenceUser; online: boolean }) => void;

  /** Unread count update for the current user */
  "unread:update": (payload: { groupId: string; count: number }) => void;

  // ── Direct messages ─────────────────────────────────────────────────────
  /** A new DM arrived */
  "dm:new": (msg: WsDmMessage) => void;

  /** Delivery confirmation back to the DM sender with the persisted row */
  "dm:ack": (payload: { clientId: string; message: WsDmMessage }) => void;

  /** Replace a temp UUID with the real DB id */
  "dm:updated": (payload: { id: string; new_id: string }) => void;

  /** The other user read your messages */
  "dm:read": (payload: { fromId: string }) => void;

  /** The other user started typing */
  "dm:typing:start": (payload: { fromId: string }) => void;

  /** The other user stopped typing */
  "dm:typing:stop": (payload: { fromId: string }) => void;

  /** A reaction was added or removed on a group message */
  "message:reaction": (payload: { messageId: string; groupId: string; emoji: string; userId: string; action: "added" | "removed" }) => void;

  /** Server error */
  "error": (message: string) => void;

  // ── Login activity ──────────────────────────────────────────────────────
  /** A new login was detected for this user (pushed to all their open sessions) */
  "login:new": (event: LoginEvent) => void;
}

// ── Shared data shapes ────────────────────────────────────────────────────────

export interface MessageSendPayload {
  /** Client-generated UUID v4 — used for dedup and optimistic replacement */
  clientId: string;
  groupId: string;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  replyToId: string | null;
}

export interface WsMessage {
  id: string;
  group_id: string;
  user_id: string;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  edited: boolean;
  unsent: boolean;
  removed_by_admin: boolean;
  is_system: boolean;
  reply_to_id: string | null;
  /** Denormalised — joined from profiles at send time */
  author_name: string;
  author_color: string;
  author_avatar_url: string | null;
  author_role: string | null;
}

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

export interface DmSendPayload {
  /** Client-generated UUID v4 — used for dedup and optimistic replacement */
  clientId: string;
  receiverId: string;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  replyToId: string | null;
  replyToText: string | null;
}

export interface LoginEvent {
  id: string;
  browser: string;
  os: string;
  deviceType: string;
  deviceHash: string;
  country: string | null;
  city: string | null;
  ipAddress: string;
  createdAt: string;
  isNewDevice: boolean;
}

export interface WsDmMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  read: boolean;
  reply_to_id: string | null;
  reply_to_text: string | null;
}
