import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkFields } from "../services/moderation";

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  bio: z.string().max(300).optional(),
  is_private: z.boolean().optional(),
});

export const updateGroupSchema = z.object({
  description: z.string().max(500).optional(),
  bio: z.string().max(300).optional(),
});

export const sendGroupMessageSchema = z.object({
  text: z.string().min(1).max(5000),
  media_url: z.string().url().optional().nullable(),
  media_type: z.string().optional(),
  reply_to_id: z.string().uuid().optional().nullable(),
});

// Join/leave
export async function joinGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  const { error } = await supabaseAdmin.from("group_members")
    .insert({ group_id: id, user_id: userId, role: "member" });
  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const { count } = await supabaseAdmin.from("group_members")
    .select("*", { count: "exact", head: true }).eq("group_id", id);
  await supabaseAdmin.from("groups").update({ member_count: count ?? 1 }).eq("id", id);

  res.json({ success: true, data: { member_count: count } });
}

export async function leaveGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  await supabaseAdmin.from("group_members").delete().eq("group_id", id).eq("user_id", userId);

  const { count } = await supabaseAdmin.from("group_members")
    .select("*", { count: "exact", head: true }).eq("group_id", id);
  await supabaseAdmin.from("groups").update({ member_count: count ?? 0 }).eq("id", id);

  res.json({ success: true, data: { member_count: count } });
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

  const { count } = await supabaseAdmin.from("group_members")
    .select("*", { count: "exact", head: true }).eq("group_id", groupId);
  await supabaseAdmin.from("groups").update({ member_count: count ?? 0 }).eq("id", groupId);

  res.json({ success: true, data: { member_count: count } });
}

// Promote/demote member (owner only)
export async function updateMemberRole(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;
  const { role } = req.body as { role: string };

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single();
  if (!group || group.owner_id !== userId) {
    res.status(403).json({ success: false, error: "Only the group owner can change roles" }); return;
  }

  const { error } = await supabaseAdmin.from("group_members")
    .update({ role }).eq("group_id", groupId).eq("user_id", memberId);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Demote also removes if not found
  if (role === "member") {
    await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId);
  }

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

  const { data, error } = await supabaseAdmin.from("groups")
    .insert({ ...body, owner_id: userId, member_count: 1 }).select().single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  await supabaseAdmin.from("group_members").insert({ group_id: data.id, user_id: userId, role: "owner" });

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
      sender_id: userId,
      text: body.text,
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? "text",
      reply_to_id: body.reply_to_id ?? null,
    }).select().single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data });
}

// Delete group message
export async function deleteGroupMessage(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, messageId } = req.params;
  const userId = req.user.id;

  const { data: msg } = await supabaseAdmin.from("group_messages")
    .select("sender_id").eq("id", messageId).single();
  if (!msg) { res.status(404).json({ success: false, error: "Message not found" }); return; }

  const { data: group } = await supabaseAdmin.from("groups")
    .select("owner_id").eq("id", groupId).single();
  const isOwner = group?.owner_id === userId;
  const isAdmin = ["admin", "moderator"].includes((req.user as any).role ?? "");

  if (msg.sender_id !== userId && !isOwner && !isAdmin) {
    res.status(403).json({ success: false, error: "Not authorized to delete this message" }); return;
  }

  await supabaseAdmin.from("group_messages")
    .update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
  res.json({ success: true, data: null });
}
