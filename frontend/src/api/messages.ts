/**
 * Messages API — calls go to the Express backend.
 * Direct supabase.from("messages") inserts removed from frontend.
 */
import { apiPost, apiGet } from "./client";

export const sendMessage = (text: string, chatId: string, opts?: {
  mediaType?: string;
  mediaUrl?: string;
  replyToId?: string;
}) => {
  if (!text.trim()) return Promise.resolve(null);
  return apiPost<any>("/api/messages", { text, chatId, ...opts });
};

export const getMessages = (chatId: string, cursor?: string) =>
  apiGet<any[]>(`/api/messages/${chatId}${cursor ? `?cursor=${cursor}` : ""}`);

export const hideConversation = (chatId: string) =>
  apiPost(`/api/messages/${chatId}/hide`);

export const toggleDmReaction = (messageId: string, emoji: string) =>
  apiPost<{ action: "added" | "removed" }>(`/api/messages/${messageId}/reactions`, { emoji });

export const getDmMessageReactions = (messageIds: string[]) =>
  apiGet<Record<string, Record<string, { count: number; userIds: string[] }>>>(
    `/api/messages/reactions?messageIds=${messageIds.join(",")}`
  );

export const editDmMessage = (messageId: string, text: string) =>
  apiPost<null>(`/api/messages/${messageId}/edit`, { text });

export const unsendDmMessage = (messageId: string) =>
  apiPost<null>(`/api/messages/${messageId}/unsend`);
