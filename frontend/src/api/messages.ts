/**
 * Messages API — calls go to the Express backend.
 * Direct supabase.from("messages") inserts removed from frontend.
 */
import { apiPost, apiGet } from "./client";

export const sendMessage = (content: string, chatId: string, opts?: {
  mediaType?: string;
  mediaUrl?: string;
  replyToId?: string;
}) => {
  if (!content.trim()) return Promise.resolve(null);
  return apiPost<any>("/api/messages", { content, chatId, ...opts });
};

export const getMessages = (chatId: string, cursor?: string) =>
  apiGet<any[]>(`/api/messages/${chatId}${cursor ? `?cursor=${cursor}` : ""}`);

export const hideConversation = (chatId: string) =>
  apiPost(`/api/messages/${chatId}/hide`);
