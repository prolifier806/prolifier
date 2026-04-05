import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

export const sendRequestSchema = z.object({
  receiverId: z.string().uuid(),
});

export async function getConnections(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  const { data, error } = await supabaseAdmin
    .from("connections")
    .select("requester_id, receiver_id, status, created_at")
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function getPendingRequests(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  const { data, error } = await supabaseAdmin
    .from("connections")
    .select("requester_id, created_at, profiles:requester_id (id, name, avatar, color)")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function sendRequest(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { receiverId } = req.body as z.infer<typeof sendRequestSchema>;

  if (receiverId === userId) {
    res.status(400).json({ success: false, error: "Cannot connect with yourself" });
    return;
  }

  // Check receiver exists and is not deleted
  const { data: receiver } = await supabaseAdmin
    .from("profiles")
    .select("id, name")
    .eq("id", receiverId)
    .single();

  if (!receiver) { res.status(404).json({ success: false, error: "User not found" }); return; }

  // Check not blocked
  const { data: block } = await supabaseAdmin
    .from("blocks")
    .select("id")
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${userId})`)
    .maybeSingle();

  if (block) { res.status(403).json({ success: false, error: "Cannot connect: user is blocked" }); return; }

  const { data, error } = await supabaseAdmin
    .from("connections")
    .insert({ requester_id: userId, receiver_id: receiverId, status: "pending" })
    .select()
    .single();

  if (error?.code === "23505") { res.status(409).json({ success: false, error: "Request already sent" }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: receiverId,
      type: "match",
      text: "wants to connect with you",
      action: "/discover",
      read: false,
    });
  } catch {}

  res.status(201).json({ success: true, data });
}

export async function acceptRequest(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { requesterId } = req.params;

  const { data, error } = await supabaseAdmin
    .from("connections")
    .update({ status: "accepted" })
    .eq("requester_id", requesterId)
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  if (!data) { res.status(404).json({ success: false, error: "Pending request not found" }); return; }

  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: requesterId,
      type: "match",
      text: "accepted your connection request",
      action: "/discover",
      read: false,
    });
  } catch {}

  res.json({ success: true, data });
}

export async function declineRequest(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { requesterId } = req.params;

  const { error } = await supabaseAdmin
    .from("connections")
    .delete()
    .eq("requester_id", requesterId)
    .eq("receiver_id", userId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function removeConnection(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { otherId } = req.params;

  const { error } = await supabaseAdmin
    .from("connections")
    .delete()
    .or(
      `and(requester_id.eq.${userId},receiver_id.eq.${otherId}),and(requester_id.eq.${otherId},receiver_id.eq.${userId})`
    );

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function markRequestsRead(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  const { error } = await supabaseAdmin
    .from("connections")
    .update({ read: true })
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .eq("read", false);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}
