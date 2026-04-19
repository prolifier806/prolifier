/**
 * useGroupSocket — Socket.IO client for group chat.
 *
 * Primary realtime transport: Socket.IO WebSocket.
 * Supabase Realtime remains as a fallback consistency layer (handled in Groups.tsx).
 *
 * Lifecycle:
 *  - Socket is created once per session (singleton via module-level ref).
 *  - Joins/leaves group rooms as activeGroupId changes.
 *  - Exposes send, typing, and read helpers.
 *  - Cleans up listeners on unmount.
 */

import { useEffect, useRef, useCallback } from "react";
import { getSharedSocket, type AppSocket } from "@/lib/socket";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  WsMessage,
  PresenceUser,
  MessageSendPayload,
} from "../../../backend/src/lib/socketEvents";

export type { WsMessage, PresenceUser };

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseGroupSocketOptions {
  /** Supabase JWT for authentication */
  token: string | null;
  /** Currently open group id — hook joins/leaves this room automatically */
  activeGroupId: string | null;
  /** Called when a new message arrives from another user */
  onMessage: (msg: WsMessage) => void;
  /** Called when the server confirms our own sent message (with real DB id) */
  onAck: (clientId: string, msg: WsMessage) => void;
  /** Called when a message is edited/unsent/removed */
  onMessageUpdated: (partial: Partial<WsMessage> & { id: string; group_id: string }) => void;
  /** Called when a message is hard-deleted */
  onMessageDeleted: (id: string, groupId: string) => void;
  /** Called with current online users for the group */
  onPresenceSnapshot: (groupId: string, users: PresenceUser[]) => void;
  /** Called when a user goes online/offline */
  onPresenceUpdate: (groupId: string, user: PresenceUser, online: boolean) => void;
  /** Called when a user starts typing */
  onTypingStart: (groupId: string, userId: string, userName: string) => void;
  /** Called when a user stops typing */
  onTypingStop: (groupId: string, userId: string) => void;
  /** Called when a reaction is added/removed by another user */
  onReaction?: (payload: { messageId: string; groupId: string; emoji: string; userId: string; action: "added" | "removed" }) => void;
}

export interface UseGroupSocketReturn {
  /** Send a message — returns the clientId used */
  sendMessage: (payload: Omit<MessageSendPayload, "clientId"> & { clientId: string }) => void;
  /** Emit typing:start */
  startTyping: (groupId: string) => void;
  /** Emit typing:stop */
  stopTyping: (groupId: string) => void;
  /** Tell server this group is fully read */
  markRead: (groupId: string) => void;
  /** Whether socket is currently connected */
  connected: boolean;
}

export function useGroupSocket(options: UseGroupSocketOptions): UseGroupSocketReturn {
  const {
    token,
    activeGroupId,
    onMessage,
    onAck,
    onMessageUpdated,
    onMessageDeleted,
    onPresenceSnapshot,
    onPresenceUpdate,
    onTypingStart,
    onTypingStop,
  } = options;

  const socketRef = useRef<AppSocket | null>(null);
  const connectedRef = useRef(false);
  const prevGroupRef = useRef<string | null>(null);

  // Always use latest callbacks without re-running effects
  const cbRef = useRef(options);
  cbRef.current = options;

  // ── Init socket + attach persistent listeners ──────────────────────────
  useEffect(() => {
    if (!token) return;

    const socket = getSharedSocket(token);
    socketRef.current = socket;

    const onConnect = () => { connectedRef.current = true; };
    const onDisconnect = () => { connectedRef.current = false; };
    const onMessageNew = (msg: Parameters<typeof cbRef.current.onMessage>[0]) => cbRef.current.onMessage(msg);
    const onMessageAck = ({ clientId, message }: { clientId: string; message: Parameters<typeof cbRef.current.onAck>[1] }) => cbRef.current.onAck(clientId, message);
    const onMessageUpdated = (partial: Parameters<typeof cbRef.current.onMessageUpdated>[0]) => cbRef.current.onMessageUpdated(partial);
    const onMessageDeleted = ({ id, group_id }: { id: string; group_id: string }) => cbRef.current.onMessageDeleted(id, group_id);
    const onPresenceSnapshot = ({ groupId, users }: { groupId: string; users: Parameters<typeof cbRef.current.onPresenceSnapshot>[1] }) => cbRef.current.onPresenceSnapshot(groupId, users);
    const onPresenceUpdate = ({ groupId, user, online }: { groupId: string; user: Parameters<typeof cbRef.current.onPresenceUpdate>[1]; online: boolean }) => cbRef.current.onPresenceUpdate(groupId, user, online);
    const onTypingStart = ({ groupId, userId, userName }: { groupId: string; userId: string; userName: string }) => cbRef.current.onTypingStart(groupId, userId, userName);
    const onTypingStop = ({ groupId, userId }: { groupId: string; userId: string }) => cbRef.current.onTypingStop(groupId, userId);
    const onMessageReaction = (payload: Parameters<NonNullable<typeof cbRef.current.onReaction>>[0]) => cbRef.current.onReaction?.(payload);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onMessageNew);
    socket.on("message:ack", onMessageAck);
    socket.on("message:updated", onMessageUpdated);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("message:reaction", onMessageReaction);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onMessageNew);
      socket.off("message:ack", onMessageAck);
      socket.off("message:updated", onMessageUpdated);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:reaction", onMessageReaction);
    };
  }, [token]);

  // ── Join / leave group room when activeGroupId changes ─────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (prevGroupRef.current && prevGroupRef.current !== activeGroupId) {
      socket.emit("group:leave", prevGroupRef.current);
    }
    if (activeGroupId) {
      socket.emit("group:join", activeGroupId);
    }
    prevGroupRef.current = activeGroupId;

    return () => {
      if (activeGroupId) {
        socket?.emit("group:leave", activeGroupId);
      }
    };
  }, [activeGroupId]);

  // ── Stable action callbacks ─────────────────────────────────────────────
  const sendMessage = useCallback((payload: Omit<MessageSendPayload, "clientId"> & { clientId: string }) => {
    socketRef.current?.emit("message:send", payload);
  }, []);

  const startTyping = useCallback((groupId: string) => {
    socketRef.current?.emit("typing:start", groupId);
  }, []);

  const stopTyping = useCallback((groupId: string) => {
    socketRef.current?.emit("typing:stop", groupId);
  }, []);

  const markRead = useCallback((groupId: string) => {
    socketRef.current?.emit("group:read", groupId);
  }, []);

  return {
    sendMessage,
    startTyping,
    stopTyping,
    markRead,
    connected: connectedRef.current,
  };
}
