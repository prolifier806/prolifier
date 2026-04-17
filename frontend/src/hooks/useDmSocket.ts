/**
 * useDmSocket — Socket.IO client for direct messages.
 *
 * Uses the same singleton socket as useGroupSocket (via @/lib/socket)
 * so Groups + Messages share one WebSocket connection.
 *
 * Lifecycle:
 *  - Joins/leaves the DM room as activeDmId changes.
 *  - Exposes send, typing, and read helpers.
 *  - Cleans up listeners on unmount.
 */

import { useEffect, useRef, useCallback } from "react";
import { getSharedSocket, type AppSocket } from "@/lib/socket";
import type { WsDmMessage, DmSendPayload } from "../../../backend/src/lib/socketEvents";

export type { WsDmMessage };

export interface UseDmSocketOptions {
  /** Supabase JWT for authentication */
  token: string | null;
  /** Currently open conversation (the other user's id) */
  activeDmId: string | null;
  /** Called when a new DM arrives from the other user */
  onMessage: (msg: WsDmMessage) => void;
  /** Called when the server confirms our own sent message with the real DB id */
  onAck: (clientId: string, msg: WsDmMessage) => void;
  /** Called to replace a temp UUID with the real DB id on the receiver's side */
  onUpdated: (payload: { id: string; new_id: string }) => void;
  /** Called when the other user reads our messages */
  onRead: () => void;
  /** Called when the other user starts typing */
  onTypingStart: () => void;
  /** Called when the other user stops typing */
  onTypingStop: () => void;
}

export interface UseDmSocketReturn {
  sendDm: (payload: Omit<DmSendPayload, "clientId"> & { clientId: string }) => void;
  startTyping: (otherId: string) => void;
  stopTyping: (otherId: string) => void;
  markRead: (otherId: string) => void;
}

export function useDmSocket(options: UseDmSocketOptions): UseDmSocketReturn {
  const { token, activeDmId } = options;

  const socketRef = useRef<AppSocket | null>(null);
  const prevDmRef = useRef<string | null>(null);

  // Always use latest callbacks without re-running effects
  const cbRef = useRef(options);
  cbRef.current = options;

  // ── Init socket + attach persistent listeners ──────────────────────────
  useEffect(() => {
    if (!token) return;

    const socket = getSharedSocket(token);
    socketRef.current = socket;

    socket.on("dm:new",          (msg)     => cbRef.current.onMessage(msg));
    socket.on("dm:ack",          ({ clientId, message }) => cbRef.current.onAck(clientId, message));
    socket.on("dm:updated",      (payload) => cbRef.current.onUpdated(payload));
    socket.on("dm:read",         ()        => cbRef.current.onRead());
    socket.on("dm:typing:start", ()        => cbRef.current.onTypingStart());
    socket.on("dm:typing:stop",  ()        => cbRef.current.onTypingStop());

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("dm:new");
      socket.off("dm:ack");
      socket.off("dm:updated");
      socket.off("dm:read");
      socket.off("dm:typing:start");
      socket.off("dm:typing:stop");
    };
  }, [token]);

  // ── Join / leave DM room when activeDmId changes ──────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (prevDmRef.current && prevDmRef.current !== activeDmId) {
      socket.emit("dm:leave", prevDmRef.current);
    }
    if (activeDmId) {
      socket.emit("dm:join", activeDmId);
    }
    prevDmRef.current = activeDmId;

    return () => {
      if (activeDmId) {
        socket?.emit("dm:leave", activeDmId);
      }
    };
  }, [activeDmId]);

  // ── Stable action callbacks ────────────────────────────────────────────
  const sendDm = useCallback((payload: Omit<DmSendPayload, "clientId"> & { clientId: string }) => {
    socketRef.current?.emit("dm:send", payload);
  }, []);

  const startTyping = useCallback((otherId: string) => {
    socketRef.current?.emit("dm:typing:start", otherId);
  }, []);

  const stopTyping = useCallback((otherId: string) => {
    socketRef.current?.emit("dm:typing:stop", otherId);
  }, []);

  const markRead = useCallback((otherId: string) => {
    socketRef.current?.emit("dm:read", otherId);
  }, []);

  return { sendDm, startTyping, stopTyping, markRead };
}
