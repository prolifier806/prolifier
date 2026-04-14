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

export const respondJoinRequestSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

// ── Helper: get requester's role in a group ───────────────────────────────────
async function getRequesterRole(groupId: string, userId: string) {
  const [{ data: group }, { data: memberRow }] = await Promise.all([
    supabaseAdmin.from("groups").select("owner_id").eq("id", groupId).single(),
    supabaseAdmin.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);
  const isOwner = group?.owner_id === userId;
  const isAdmin = isOwner || memberRow?.role === "admin";
  return { isOwner, isAdmin, group };
}

// ── Helper: post a system message into a group ────────────────────────────────
async function postSystemMsg(groupId: string, actingUserId: string, text: string) {
  try {
    await supabaseAdmin.from("group_messages").insert({
      group_id: groupId,
      user_id: actingUserId,
      text,
      is_system: true,
    });
  } catch {
    // fire-and-forget — never let a system message failure block the main action
  }
}

// ── Join / Leave ──────────────────────────────────────────────────────────────
export async function joinGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  const { data: ban } = await supabaseAdmin.from("group_bans")
    .select("id").eq("group_id", id).eq("user_id", userId).maybeSingle();
  if (ban) {
    res.status(403).json({ success: false, error: "You are banned from this community" });
    return;
  }

  // Check if group is private — must have an accepted join request or be invited
  const { data: group } = await supabaseAdmin.from("groups")
    .select("visibility, name").eq("id", id).single();
  if (group?.visibility === "private") {
    const { data: req_ } = await supabaseAdmin.from("group_join_requests")
      .select("status").eq("group_id", id).eq("user_id", userId).maybeSingle();
    if (req_?.status !== "accepted") {
      res.status(403).json({ success: false, error: "This community is private. Request to join first." });
      return;
    }
  }

  const { error } = await supabaseAdmin.from("group_members")
    .insert({ group_id: id, user_id: userId });
  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Get joiner name for system message
  const { data: profile } = await supabaseAdmin.from("profiles").select("name").eq("id", userId).single();
  await postSystemMsg(id, userId, `${profile?.name || "Someone"} joined the community`);

  res.json({ success: true, data: null });
}

export async function leaveGroup(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  const { data: profile } = await supabaseAdmin.from("profiles").select("name").eq("id", userId).single();
  await supabaseAdmin.from("group_members").delete().eq("group_id", id).eq("user_id", userId);
  await postSystemMsg(id, userId, `${profile?.name || "Someone"} left the community`);

  res.json({ success: true, data: null });
}

// ── Remove member ─────────────────────────────────────────────────────────────
export async function removeMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;

  const { isOwner, isAdmin } = await getRequesterRole(groupId, userId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can remove members" }); return;
  }

  if (!isOwner) {
    const { data: target } = await supabaseAdmin.from("group_members")
      .select("role").eq("group_id", groupId).eq("user_id", memberId).maybeSingle();
    if (target?.role === "admin" || target?.role === "owner") {
      res.status(403).json({ success: false, error: "Admins cannot remove other admins" }); return;
    }
  }

  const [{ data: profile }] = await Promise.all([
    supabaseAdmin.from("profiles").select("name").eq("id", memberId).single(),
    supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId),
  ]);

  await postSystemMsg(groupId, userId, `${profile?.name || "A member"} was removed from the community`);
  res.json({ success: true, data: null });
}

// ── Ban member ────────────────────────────────────────────────────────────────
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

  const [{ data: profile }] = await Promise.all([
    supabaseAdmin.from("profiles").select("name").eq("id", memberId).single(),
    supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId),
  ]);

  const { error } = await supabaseAdmin.from("group_bans").insert({ group_id: groupId, user_id: memberId });
  if (error && error.code !== "23505") {
    res.status(500).json({ success: false, error: error.message }); return;
  }

  await postSystemMsg(groupId, userId, `${profile?.name || "A member"} was banned from the community`);
  res.json({ success: true, data: null });
}

// ── Assign admin role — owner can do anything; admin can promote members only ──
export async function assignRole(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, memberId } = req.params;
  const userId = req.user.id;
  const { role } = req.body as z.infer<typeof assignRoleSchema>;

  const { isOwner, isAdmin } = await getRequesterRole(groupId, userId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can manage roles" }); return;
  }
  if (memberId === userId) {
    res.status(400).json({ success: false, error: "Cannot change your own role" }); return;
  }

  // Verify the member exists
  const { data: memberRow } = await supabaseAdmin.from("group_members")
    .select("role").eq("group_id", groupId).eq("user_id", memberId).maybeSingle();
  if (!memberRow) {
    res.status(404).json({ success: false, error: "Member not found in this community" }); return;
  }

  // Admins (non-owners) can only promote plain members — not demote other admins
  if (!isOwner && (memberRow.role === "admin" || memberRow.role === "owner")) {
    res.status(403).json({ success: false, error: "Only the owner can change admin roles" }); return;
  }
  // Nobody can demote the owner
  if (memberRow.role === "owner") {
    res.status(403).json({ success: false, error: "The owner's role cannot be changed" }); return;
  }

  const { error } = await supabaseAdmin.from("group_members")
    .update({ role }).eq("group_id", groupId).eq("user_id", memberId);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const [{ data: actorProfile }, { data: targetProfile }] = await Promise.all([
    supabaseAdmin.from("profiles").select("name").eq("id", userId).single(),
    supabaseAdmin.from("profiles").select("name").eq("id", memberId).single(),
  ]);
  const actorName = actorProfile?.name || "An admin";
  const targetName = targetProfile?.name || "A member";

  if (role === "admin") {
    await postSystemMsg(groupId, userId, `${targetName} was made an admin by ${actorName}`);
  } else {
    await postSystemMsg(groupId, userId, `${targetName} is no longer an admin`);
  }

  res.json({ success: true, data: null });
}

// ── Update group info — owner or admin ────────────────────────────────────────
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

// ── Delete group (owner only) ─────────────────────────────────────────────────
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

// ── Create group ──────────────────────────────────────────────────────────────
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
      member_count: 0,
    }).select().single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  await supabaseAdmin.from("group_members").insert({ group_id: data.id, user_id: userId, role: "owner" });
  res.status(201).json({ success: true, data });
}

// ── Send group message ────────────────────────────────────────────────────────
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

// ── Get banned users — owner or admin ─────────────────────────────────────────
export async function getBannedUsers(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const requesterId = req.user.id;

  const { isAdmin } = await getRequesterRole(groupId, requesterId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can view banned users" }); return;
  }

  const { data: bans, error } = await supabaseAdmin.from("group_bans").select("user_id").eq("group_id", groupId);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  if (!bans || bans.length === 0) { res.json({ success: true, data: [] }); return; }

  const userIds = bans.map((b: any) => b.user_id);
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, name, color, avatar_url").in("id", userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

  const result = bans.map((b: any) => ({ user_id: b.user_id, profiles: profileMap[b.user_id] ?? null }));
  res.json({ success: true, data: result });
}

// ── Unban a user ──────────────────────────────────────────────────────────────
export async function unbanMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  const { isAdmin } = await getRequesterRole(groupId, requesterId);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Only admins can unban users" }); return;
  }

  const [{ data: profile }] = await Promise.all([
    supabaseAdmin.from("profiles").select("name").eq("id", targetUserId).single(),
    supabaseAdmin.from("group_bans").delete().eq("group_id", groupId).eq("user_id", targetUserId),
  ]);

  await postSystemMsg(groupId, requesterId, `${profile?.name || "A user"} was unbanned`);
  res.json({ success: true, data: null });
}

// ── Delete group message ──────────────────────────────────────────────────────
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

// ── Request to join a private community ──────────────────────────────────────
export async function requestToJoin(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const userId = req.user.id;

  const { data: group } = await supabaseAdmin.from("groups")
    .select("visibility, owner_id, name").eq("id", groupId).single();
  if (!group) { res.status(404).json({ success: false, error: "Community not found" }); return; }
  if (group.visibility !== "private") {
    res.status(400).json({ success: false, error: "This community is public — join directly" }); return;
  }

  const { data: ban } = await supabaseAdmin.from("group_bans")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (ban) { res.status(403).json({ success: false, error: "You are banned from this community" }); return; }

  const { error } = await supabaseAdmin.from("group_join_requests")
    .insert({ group_id: groupId, user_id: userId, status: "pending" });
  if (error?.code === "23505") {
    // Already requested — return current status
    const { data: existing } = await supabaseAdmin.from("group_join_requests")
      .select("status").eq("group_id", groupId).eq("user_id", userId).single();
    res.json({ success: true, data: { status: existing?.status ?? "pending" } });
    return;
  }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const { data: requester } = await supabaseAdmin.from("profiles").select("name").eq("id", userId).single();
  const requesterName = requester?.name || "Someone";

  // Post a special system message so admins can see & act on the request in chat.
  // Format: ||JOINREQ||{reqId}||{userId}||{name}  (parsed by the frontend)
  const { data: reqRow } = await supabaseAdmin.from("group_join_requests")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  const reqId = reqRow?.id ?? "unknown";
  await postSystemMsg(groupId, userId, `||JOINREQ||${reqId}||${userId}||${requesterName}`);

  // Notify all admins + owner
  const { data: adminMembers } = await supabaseAdmin.from("group_members")
    .select("user_id, role").eq("group_id", groupId)
    .in("role", ["owner", "admin"]);
  const adminIds = (adminMembers || []).map((m: any) => m.user_id).filter((id: string) => id !== userId);
  if (adminIds.length > 0) {
    try {
      await supabaseAdmin.from("notifications").insert(
        adminIds.map((adminId: string) => ({
          user_id: adminId,
          type: "group",
          text: `${requesterName} wants to join "${group.name}"`,
          action: `group:${groupId}`,
          read: false,
        }))
      );
    } catch { /* non-fatal */ }
  }

  res.status(201).json({ success: true, data: { status: "pending" } });
}

// ── Get join requests — owner/admin only ──────────────────────────────────────
export async function getJoinRequests(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const userId = req.user.id;

  const { isAdmin } = await getRequesterRole(groupId, userId);
  if (!isAdmin) { res.status(403).json({ success: false, error: "Only admins can view join requests" }); return; }

  const { data, error } = await supabaseAdmin.from("group_join_requests")
    .select("id, user_id, status, created_at")
    .eq("group_id", groupId).eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const userIds = (data || []).map((r: any) => r.user_id);
  if (userIds.length === 0) { res.json({ success: true, data: [] }); return; }

  const { data: profiles } = await supabaseAdmin.from("profiles")
    .select("id, name, color, avatar_url").in("id", userIds);
  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

  const result = (data || []).map((r: any) => ({ ...r, profile: profileMap[r.user_id] ?? null }));
  res.json({ success: true, data: result });
}

// ── Respond to join request — owner/admin ─────────────────────────────────────
export async function respondJoinRequest(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId, requestId } = req.params;
  const userId = req.user.id;
  const { status } = req.body as z.infer<typeof respondJoinRequestSchema>;

  const { isAdmin } = await getRequesterRole(groupId, userId);
  if (!isAdmin) { res.status(403).json({ success: false, error: "Only admins can respond to join requests" }); return; }

  const { data: joinReq } = await supabaseAdmin.from("group_join_requests")
    .select("user_id").eq("id", requestId).eq("group_id", groupId).single();
  if (!joinReq) { res.status(404).json({ success: false, error: "Request not found" }); return; }

  await supabaseAdmin.from("group_join_requests").update({ status }).eq("id", requestId);

  // Delete the JOINREQ system message for this request (it served its purpose)
  await supabaseAdmin.from("group_messages")
    .delete()
    .eq("group_id", groupId)
    .eq("is_system", true)
    .ilike("text", `||JOINREQ||${requestId}||%`);

  if (status === "accepted") {
    const { error } = await supabaseAdmin.from("group_members")
      .insert({ group_id: groupId, user_id: joinReq.user_id });
    if (error && error.code !== "23505") {
      res.status(500).json({ success: false, error: error.message }); return;
    }

    const [{ data: requesterProfile }, { data: adminProfile }, { data: group }] = await Promise.all([
      supabaseAdmin.from("profiles").select("name").eq("id", joinReq.user_id).single(),
      supabaseAdmin.from("profiles").select("name").eq("id", userId).single(),
      supabaseAdmin.from("groups").select("name").eq("id", groupId).single(),
    ]);
    const requesterName = requesterProfile?.name || "Someone";
    const adminName = adminProfile?.name || "An admin";

    await postSystemMsg(groupId, userId, `${requesterName} was accepted by ${adminName}`);

    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: joinReq.user_id,
        type: "group",
        text: `Your request to join "${group?.name}" was accepted`,
        action: `group:${groupId}`,
        read: false,
      });
    } catch { /* non-fatal */ }
  }

  res.json({ success: true, data: null });
}

// ── Add member directly (admin adds from connections) ─────────────────────────
export async function addMember(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const adminId = req.user.id;
  const { userId } = req.body as z.infer<typeof addMemberSchema>;

  const { isAdmin } = await getRequesterRole(groupId, adminId);
  if (!isAdmin) { res.status(403).json({ success: false, error: "Only admins can add members" }); return; }

  // Verify the target is a connection of the admin
  const { data: connection } = await supabaseAdmin.from("connections")
    .select("id").eq("status", "accepted")
    .or(`and(requester_id.eq.${adminId},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${adminId})`)
    .maybeSingle();
  if (!connection) {
    res.status(403).json({ success: false, error: "You can only add users from your connections" }); return;
  }

  const { data: ban } = await supabaseAdmin.from("group_bans")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (ban) { res.status(403).json({ success: false, error: "This user is banned from the community" }); return; }

  const { error } = await supabaseAdmin.from("group_members")
    .insert({ group_id: groupId, user_id: userId });
  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const [{ data: profile }, { data: group }] = await Promise.all([
    supabaseAdmin.from("profiles").select("name").eq("id", userId).single(),
    supabaseAdmin.from("groups").select("name").eq("id", groupId).single(),
  ]);

  await postSystemMsg(groupId, adminId, `${profile?.name || "Someone"} was added to the community`);

  // Notify the added user
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "group",
      text: `You were added to "${group?.name}"`,
      action: `group:${groupId}`,
      read: false,
    });
  } catch { /* non-fatal */ }

  res.json({ success: true, data: null });
}

// ── Cancel join request (by the requester) ────────────────────────────────────
export async function cancelJoinRequest(req: AuthRequest, res: Response): Promise<void> {
  const { id: groupId } = req.params;
  const userId = req.user.id;

  // Find the pending request
  const { data: joinReq } = await supabaseAdmin.from("group_join_requests")
    .select("id, status").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!joinReq) { res.status(404).json({ success: false, error: "No pending request found" }); return; }
  if (joinReq.status !== "pending") { res.status(400).json({ success: false, error: "Request is already resolved" }); return; }

  // Delete the request
  await supabaseAdmin.from("group_join_requests").delete().eq("id", joinReq.id);

  // Delete the associated JOINREQ system message
  await supabaseAdmin.from("group_messages")
    .delete()
    .eq("group_id", groupId)
    .eq("is_system", true)
    .ilike("text", `||JOINREQ||${joinReq.id}||%`);

  res.json({ success: true, data: null });
}
