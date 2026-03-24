import { supabase } from "@/lib/supabase";

// Consolidated notification helper used by all pages.
// Includes notification-preference checking (was previously only in Feed.tsx inline copy).
// This is the single source of truth — do not duplicate this in individual pages.

const TYPE_PREF_MAP: Record<string, string> = {
  like: "likes",
  comment: "comments",
  match: "matches",
  collab: "collabs",
  group: "groups",
  message: "messages",
  trending: "trending",
};

export async function createNotification({
  userId,
  type,
  text,
  subtext,
  action,
}: {
  userId: string;
  type: string;
  text: string;
  subtext?: string;
  action?: string;
}) {
  if (!userId) {
    console.warn("createNotification: userId is empty, skipping");
    return;
  }

  // Check sender's notification preferences before firing
  const prefKey = TYPE_PREF_MAP[type];
  if (prefKey) {
    try {
      const saved = localStorage.getItem("notif_prefs");
      const prefs = saved ? JSON.parse(saved) : {};
      if (prefs[prefKey] === false) return;
    } catch {
      // If localStorage fails, proceed anyway
    }
  }

  const { error } = await (supabase as any).from("notifications").insert({
    user_id: userId,
    type,
    text,
    subtext: subtext || null,
    action: action || null,
    read: false,
  });

  if (error) {
    console.error("createNotification failed:", error, { userId, type, text });
  }
}
