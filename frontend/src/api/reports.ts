/**
 * Reports API
 * Replaces supabase.from("reports").insert() in Feed.tsx
 */
import { apiPost } from "./client";

export const createReport = (body: {
  targetId: string;
  targetType: "post" | "collab" | "comment" | "user" | "group" | "message";
  reason: string;
  details?: string;
}) => apiPost<{ id: string }>("/api/reports", body);
