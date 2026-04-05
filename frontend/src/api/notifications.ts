/**
 * Notifications API — all calls go to the Express backend.
 * Direct supabase.from("notifications") inserts removed from frontend.
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

export const getNotifications      = () => apiGet<any[]>("/api/notifications");
export const markRead              = (id: string) => apiPatch(`/api/notifications/${id}/read`, {});
export const deleteNotification    = (id: string) => apiDelete(`/api/notifications/${id}`);
export const clearAllNotifications = () => apiDelete("/api/notifications");

export async function createNotification({
  userId,
  type,
  text,
  subtext,
  action,
  actorId,
}: {
  userId: string;
  type: string;
  text: string;
  subtext?: string;
  action?: string;
  actorId?: string;
}): Promise<void> {
  if (!userId) return;
  try {
    await apiPost("/api/notifications", { userId, type, text, subtext, action, actorId });
  } catch (err) {
    console.error("createNotification failed:", err);
  }
}
