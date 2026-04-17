/**
 * Canonical Socket.IO event definitions shared between server and frontend.
 * Keep this file pure types — no imports, no runtime code.
 */

// ── Events emitted by CLIENT → SERVER ────────────────────────────────────────

export interface ClientToServerEvents {
  /** Join a group room to receive its messages */
  "group:join": (groupId: string) => void;

  /** Leave a group room */
  "group:leave": (groupId: string) => void;

  /** Send a new message */
  "message:send": (payload: MessageSendPayload) => void;

  /** Mark a group as fully read */
  "group:read": (groupId: string) => void;

  /** Typing indicator — start */
  "typing:start": (groupId: string) => void;

  /** Typing indicator — stop */
  "typing:stop": (groupId: string) => void;
}

// ── Events emitted by SERVER → CLIENT ────────────────────────────────────────

export interface ServerToClientEvents {
  /** A new message arrived in a group */
  "message:new": (msg: WsMessage) => void;

  /** A message was edited or confirmed (new_id replaces a temp UUID client-id) */
  "message:updated": (msg: Pick<WsMessage, "id" | "group_id" | "text" | "edited" | "unsent" | "removed_by_admin"> & { new_id?: string }) => void;

  /** A message was deleted (hard delete) */
  "message:deleted": (payload: { id: string; group_id: string }) => void;

  /** Delivery confirmation back to the sender with the persisted row */
  "message:ack": (payload: { clientId: string; message: WsMessage }) => void;

  /** A user started typing */
  "typing:start": (payload: { groupId: string; userId: string; userName: string }) => void;

  /** A user stopped typing */
  "typing:stop": (payload: { groupId: string; userId: string }) => void;

  /** Current online presence snapshot for a group */
  "presence:snapshot": (payload: { groupId: string; users: PresenceUser[] }) => void;

  /** A single user joined or left a group's online presence */
  "presence:update": (payload: { groupId: string; user: PresenceUser; online: boolean }) => void;

  /** Unread count update for the current user */
  "unread:update": (payload: { groupId: string; count: number }) => void;

  /** Server error */
  "error": (message: string) => void;
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
