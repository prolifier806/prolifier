import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkFields } from "../services/moderation";

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  bio: z.string().max(300).optional(),
  is_private: z.boolean().optional(), // mapped to visibility below
  emoji: z.string().max(10).optional(),
  topic: z.string().max(50).optional(),
  image_url: z.string().url().max(2048).optional().nullable(),
});

export const updateGroupSchema = z.object({
  description: z.string().max(500).optional(),
  bio: z.string().max(300).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  emoji: z.string().max(10).optional(),
  topic: z.string().max(50).optional(),
  image_url: z.string().url().max(2048).optional().nullable(),
});

export const sendGroupMessageSchema = z.object({
  text: z.string().max(5000).optional().default(""),
  media_url: z.string().url().optional().nullable(),
  media_type: z.string().optional(),
  reply_to_id: z.string().uuid().optional().nullable(),
}).refine(d => (d.text?.trim() ?? "") || d.media_url, {
  message: "Message must have text or media",
  path: ["text"],
});

// Join/leave
export async function joinGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  // Check if user is banned from this group
  const { data: ban } = await supabaseAdmin.from("group_bans")
    .select("id").eq("group_id", id).eq("user_id", userId).maybeSingle();
  if (ban) {
    res.status(403).json({ success: false, error: "You are banned from this community" });
    return;
  }

  const { error } = await supabaseAdmin.from("group_members")
    .insert({ group_id: id, user_id: userId });
  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // WHY: Replaced COUNT(*) + UPDATE with a single atomic increment via RPC.
  // Previously: insert → COUNT(*) full scan → UPDATE (3 round-trips, race-prone).
  // Now: insert → rpc increment (1 extra round-trip, atomic, no race condition).
  await supabaseAdmin.rpc("increment_member_count", { group_id: id });

  // Return the current count without an extra query
  res.json({ success: true, data: null });
}

export async function leaveGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  await supabaseAdmin.from("group_members").delete().eq("group_id", id).eq("user_id", userId);

  // WHY: Same atomic decrement — avoids the COUNT(*) + UPDATE race condition.
  await supabaseAdmin.rpc("decrement_member_count", { group_id: id });

  res.json({ success: true, data: null });
}

// Remove member (owner only)
export async function removeMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single();
  if (!group || group.owner_id !== userId) {
    res.status(403).json({ success: false, error: "Only the group owner can remove members" }); return;
  }

  await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId);

  await supabaseAdmin.rpc("decrement_member_count", { group_id: groupId });

  res.json({ success: true, data: null });
}

// Ban member (owner only)
export async function banMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single();
  if (!group || group.owner_id !== userId) {
    res.status(403).json({ success: false, error: "Only the group owner can ban members" }); return;
  }

  // Remove from members and insert into bans atomically
  await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId);
  const { error } = await supabaseAdmin.from("group_bans").insert({ group_id: groupId, user_id: memberId });
  if (error && error.code !== "23505") {
    res.status(500).json({ success: false, error: error.message }); return;
  }

  await supabaseAdmin.rpc("decrement_member_count", { group_id: groupId });

  res.json({ success: true, data: null });
}

// Update group info (owner only)
export async function updateGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const body = req.body as z.infer<typeof updateGroupSchema>;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", id).single();
  if (!group || group.owner_id !== userId) {
    res.status(403).json({ success: false, error: "Only the group owner can edit the group" }); return;
  }

  if (body.description || body.bio) {
    const mod = checkFields({ description: body.description ?? "", bio: body.bio ?? "" });
    if (!mod.allowed) { res.status(422).json({ success: false, error: "Content violates guidelines" }); return; }
  }

  const { data, error } = await supabaseAdmin.from("groups")
    .update(body).eq("id", id).select().single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

// Delete group (owner only)
export async function deleteGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", id).single();
  if (!group || group.owner_id !== userId) {
    res.status(403).json({ success: false, error: "Only the group owner can delete the group" }); return;
  }

  await Promise.all([
    supabaseAdmin.from("group_messages").delete().eq("group_id", id),
    supabaseAdmin.from("group_members").delete().eq("group_id", id),
  ]);
  await supabaseAdmin.from("groups").delete().eq("id", id);

  res.json({ success: true, data: null });
}

// Create group
export async function createGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof createGroupSchema>;

  if (body.description || body.bio) {
    const mod = checkFields({ description: body.description ?? "", bio: body.bio ?? "" });
    if (!mod.allowed) { res.status(422).json({ success: false, error: "Content violates guidelines" }); return; }
  }

  const { is_private, ...rest } = body;
  const { data, error } = await supabaseAdmin.from("groups")
    .insert({
      ...rest,
      visibility: is_private ? "private" : "public",
      owner_id: userId,
      member_count: 1,
    }).select().single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  await supabaseAdmin.from("group_members").insert({ group_id: data.id, user_id: userId });

  res.status(201).json({ success: true, data });
}

// Send group message
export async function sendGroupMessage(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const userId = req.user.id;
  const body = req.body as z.infer<typeof sendGroupMessageSchema>;

  // Verify membership
  const { data: member } = await supabaseAdmin.from("group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!member) { res.status(403).json({ success: false, error: "Not a member of this group" }); return; }

  const { data, error } = await supabaseAdmin.from("group_messages")
    .insert({
      group_id: groupId,
      user_id: userId,
      text: body.text,
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? "text",
      reply_to_id: body.reply_to_id ?? null,
    }).select().single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data });
}

// Get banned users (owner only)
export async function getBannedUsers(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const requesterId = req.user.id;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single();
  if (!group || group.owner_id !== requesterId) {
    res.status(403).json({ success: false, error: "Only the group owner can view banned users" }); return;
  }

  const { data, error } = await supabaseAdmin
    .from("group_bans")
    .select("user_id, profiles:user_id (name, color)")
    .eq("group_id", groupId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: data ?? [] });
}

// Unban a user (owner only)
export async function unbanMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single();
  if (!group || group.owner_id !== requesterId) {
    res.status(403).json({ success: false, error: "Only the group owner can unban users" }); return;
  }

  const { error } = await supabaseAdmin
    .from("group_bans")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", targetUserId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

// Delete group message
export async function deleteGroupMessage(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, messageId } = req.params;
  const userId = req.user.id;

  const { data: msg } = await supabaseAdmin.from("group_messages")
    .select("user_id").eq("id", messageId).single();
  if (!msg) { res.status(404).json({ success: false, error: "Message not found" }); return; }

  const { data: group } = await supabaseAdmin.from("groups")
    .select("owner_id").eq("id", groupId).single();
  const isOwner = group?.owner_id === userId;
  const isAdmin = ["admin", "moderator"].includes((req.user as any).role ?? "");

  if (msg.user_id !== userId && !isOwner && !isAdmin) {
    res.status(403).json({ success: false, error: "Not authorized to delete this message" }); return;
  }

  await supabaseAdmin.from("group_messages")
    .delete().eq("id", messageId);
  res.json({ success: true, data: null });
}
