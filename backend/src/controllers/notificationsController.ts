import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

export const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(50),
  text: z.string().min(1).max(200),
  subtext: z.string().max(200).optional(),
  action: z.string().max(200).optional(),
  actorId: z.string().uuid().optional(),
});

export async function getNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  // Fire fetch + mark-read in parallel — eliminates sequential waterfall
  const [fetchResult] = await Promise.all([
    supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .not("type", "in", "(message,match)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false)
      .not("type", "in", "(message,match)")
      .then(() => {}, (err) => console.warn("[notifications] Failed to mark read:", err)),
  ]);

  const { data, error } = fetchResult;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  res.json({ success: true, data });
}

export async function createNotification(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createNotificationSchema>;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: body.userId,
    type: body.type,
    text: body.text,
    subtext: body.subtext ?? null,
    action: body.action ?? null,
    read: false,
  });

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data: null });
}

export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function deleteNotification(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function clearAllNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("user_id", userId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}
