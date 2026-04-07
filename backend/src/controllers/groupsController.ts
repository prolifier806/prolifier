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

export const assignRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

// Helper: get requester's role in a group
async function getRequesterRole(groupId: string, userId: string) {
  const [{ data: group }, { data: memberRow }] = await Promise.all([
    supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single(),
    supabaseAdmin.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);
  const isOwner = group?.owner_id === userId;
  const isAdmin = isOwner || memberRow?.role === "admin";
  return { isOwner, isAdmin, group };
}

// Join/leave
export async function joinGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

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

  // DB trigger on_group_member_change handles member_count increment
  res.json({ success: true, data: null });
}

export async function leaveGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  await supabaseAdmin.from("group_members").delete().eq("group_id", id).eq("user_id", userId);
  // DB trigger on_group_member_change handles member_count decrement
  res.json({ success: true, data: null });
}

// Remove member — owner or admin can remove, but admins cannot remove other admins
export async function removeMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;

  const { isOwner, isAdmin } = await getRequesterRole(groupId, userId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can remove members" }); return;
  }

  // Admins cannot remove other admins or the owner — only the owner can
  if (!isOwner) {
    const { data: target } = await supabaseAdmin.from("group_members")
      .select("role").eq("group_id", groupId).eq("user_id", memberId).maybeSingle();
    if (target?.role === "admin" || target?.role === "owner") {
      res.status(403).json({ success: false, error: "Admins cannot remove other admins" }); return;
    }
  }

  await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId);
  // DB trigger handles member_count decrement
  res.json({ success: true, data: null });
}

// Ban member — owner or admin can ban, but admins cannot ban other admins
export async function banMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;

  const { isOwner, isAdmin } = await getRequesterRole(groupId, userId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can ban members" }); return;
  }

  if (!isOwner) {
    const { data: target } = await supabaseAdmin.from("group_members")
      .select("role").eq("group_id", groupId).eq("user_id", memberId).maybeSingle();
    if (target?.role === "admin" || target?.role === "owner") {
      res.status(403).json({ success: false, error: "Admins cannot ban other admins" }); return;
    }
  }

  await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId);
  // DB trigger handles member_count decrement
  const { error } = await supabaseAdmin.from("group_bans").insert({ group_id: groupId, user_id: memberId });
  if (error && error.code !== "23505") {
    res.status(500).json({ success: false, error: error.message }); return;
  }

  res.json({ success: true, data: null });
}

// Assign admin role — owner only
export async function assignRole(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;
  const { role } = req.body as z.infer<typeof assignRoleSchema>;

  const { data: group } = await supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single();
  if (!group || group.owner_id !== userId) {
    res.status(403).json({ success: false, error: "Only the owner can assign roles" }); return;
  }
  if (memberId === userId) {
    res.status(400).json({ success: false, error: "Cannot change your own role" }); return;
  }

  const { error } = await supabaseAdmin.from("group_members")
    .update({ role }).eq("group_id", groupId).eq("user_id", memberId);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

// Update group info — owner or admin
export async function updateGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const body = req.body as z.infer<typeof updateGroupSchema>;

  const { isAdmin } = await getRequesterRole(id, userId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can edit the group" }); return;
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
      member_count: 0, // DB trigger on group_members insert will increment to 1
    }).select().single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  await supabaseAdmin.from("group_members").insert({ group_id: data.id, user_id: userId, role: "owner" });
  res.status(201).json({ success: true, data });
}

// Send group message
export async function sendGroupMessage(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const userId = req.user.id;
  const body = req.body as z.infer<typeof sendGroupMessageSchema>;

  const { data: member } = await supabaseAdmin.from("group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!member) { res.status(403).json({ success: false, error: "Not a member of this group" }); return; }

  const { data, error } = await supabaseAdmin.from("group_messages")
    .insert({
      group_id: groupId,
      user_id: userId,
      text: body.text || null,
      media_url: body.media_url ?? null,
      media_type: body.media_type ?? "text",
      reply_to_id: body.reply_to_id ?? null,
    }).select().single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data });
}

// Get banned users — owner or admin
export async function getBannedUsers(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const requesterId = req.user.id;

  const { isAdmin } = await getRequesterRole(groupId, requesterId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can view banned users" }); return;
  }

  // group_bans.user_id references auth.users, not profiles — do a 2-step query
  const { data: bans, error } = await supabaseAdmin
    .from("group_bans")
    .select("user_id")
    .eq("group_id", groupId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  if (!bans || bans.length === 0) { res.json({ success: true, data: [] }); return; }

  const userIds = bans.map((b: any) => b.user_id);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, name, color, avatar_url")
    .in("id", userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

  const result = bans.map((b: any) => ({
    user_id: b.user_id,
    profiles: profileMap[b.user_id] ?? null,
  }));

  res.json({ success: true, data: result });
}

// Unban a user — owner or admin
export async function unbanMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  const { isAdmin } = await getRequesterRole(groupId, requesterId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can unban users" }); return;
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

  const { isAdmin } = await getRequesterRole(groupId, userId);

  if (msg.user_id !== userId && !isAdmin) {
    res.status(403).json({ success: false, error: "Not authorized to delete this message" }); return;
  }

  await supabaseAdmin.from("group_messages").delete().eq("id", messageId);
  res.json({ success: true, data: null });
}
