/**
 * Shared Socket.IO singleton — one connection for the entire app session.
 * Both useGroupSocket and useDmSocket import from here so Groups + Messages
 * share a single WebSocket connection (not two).
 */

import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../../backend/src/lib/socketEvents";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let _socket: AppSocket | null = null;

export function getSharedSocket(token: string): AppSocket {
  if (!_socket || _socket.disconnected) {
    _socket = io(import.meta.env.VITE_API_URL ?? "http://localhost:3001", {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });
  }
  return _socket;
}
