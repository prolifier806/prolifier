import { supabase } from "@/lib/supabase";

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
  if (!userId) return;

  // NOTE: Preferences are a recipient-side display concern, not a creation concern.
  // Always insert the notification — the recipient controls their own inbox view.
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
