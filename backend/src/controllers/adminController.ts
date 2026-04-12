import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { invalidateRoleCache } from "../middleware/requireAuth";

export const updateUserStatusSchema = z.object({
  status: z.enum(["active", "suspended", "banned"]),
  reason: z.string().max(500).optional(),
  durationDays: z.number().int().positive().optional(), // for suspensions
});

export const resolveReportSchema = z.object({
  resolution: z.enum(["dismissed", "actioned", "escalated"]),
  notes: z.string().max(500).optional(),
});

// ── User moderation ───────────────────────────────────────────────────────────

export async function updateUserStatus(req: AuthRequest, res: Response): Promise<void> {
  const { id: targetId } = req.params;
  const body = req.body as z.infer<typeof updateUserStatusSchema>;

  if (targetId === req.user.id) {
    res.status(400).json({ success: false, error: "Cannot moderate yourself" });
    return;
  }

  // Check target isn't also an admin
  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", targetId)
    .single();

  if (targetProfile?.role === "admin") {
    res.status(403).json({ success: false, error: "Cannot moderate an admin account" });
    return;
  }

  const updatePayload: Record<string, unknown> = { account_status: body.status };

  if (body.status === "banned") {
    updatePayload.deleted_at = new Date().toISOString();
    // Disable Supabase auth login for this user
    await supabaseAdmin.auth.admin.updateUserById(targetId, { ban_duration: "876600h" }).catch(() => {});
  }

  if (body.status === "suspended" && body.durationDays) {
    const until = new Date(Date.now() + body.durationDays * 86_400_000).toISOString();
    updatePayload.suspended_until = until;
  }

  if (body.status === "active") {
    updatePayload.suspended_until = null;
    // Re-enable auth login
    await supabaseAdmin.auth.admin.updateUserById(targetId, { ban_duration: "none" }).catch(() => {});
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", targetId)
    .select("id, name, account_status")
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // WHY: Invalidate the in-memory role cache for this user immediately.
  // Without this, a banned admin could still hit admin-only endpoints for up to
  // 5 minutes (the cache TTL), because requireAuth would return the cached "admin" role.
  invalidateRoleCache(targetId);

  // Log the action
  try {
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: req.user.id,
      target_id: targetId,
      action: body.status,
      reason: body.reason ?? null,
    });
  } catch (logErr) {
    console.warn("[admin] Failed to log admin action:", logErr);
  }

  res.json({ success: true, data });
}

export async function deleteContent(req: AuthRequest, res: Response): Promise<void> {
  const { type, id } = req.params;
  const validTypes = ["posts", "collabs", "comments", "group_messages"];

  if (!validTypes.includes(type)) {
    res.status(400).json({ success: false, error: "Invalid content type" });
    return;
  }

  const { error } = await supabaseAdmin
    .from(type)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function getReports(req: AuthRequest, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "pending";
  const page = parseInt(req.query.page as string ?? "1");
  const limit = 25;
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("reports")
    .select(`
      id, target_id, target_type, reason, details, status, created_at,
      reporter:reporter_id (id, name),
    `, { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data, total: count });
}

export async function getModerationFlags(req: AuthRequest, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = Math.max(1, parseInt(((req as any).query?.page as string) ?? "1"));
  const limit = 25;
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("moderation_flags")
    .select(`
      id, content_type, content_id, flagged_text, category, matched_pattern, created_at,
      user:user_id (id, name, avatar, color)
    `, { count: "exact" })
    .eq("reviewed", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data, total: count });
}

export async function resolveModerationFlag(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from("moderation_flags")
    .update({ reviewed: true, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function resolveReport(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as z.infer<typeof resolveReportSchema>;

  const { data, error } = await supabaseAdmin
    .from("reports")
    .update({
      status: body.resolution,
      resolved_by: req.user.id,
      resolved_at: new Date().toISOString(),
      notes: body.notes ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

// ── User list ─────────────────────────────────────────────────────────────────

export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  const search = (req.query.search as string) || "";
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 25;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("profiles")
    .select(
      "id, name, avatar, color, role, account_status, suspended_until, created_at, deleted_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = (query as any).ilike("name", `%${search}%`);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Post counts + report counts in parallel
  const userIds = (data || []).map((u: any) => u.id);
  const [postsRes, reportsRes] = await Promise.all([
    supabaseAdmin.from("posts").select("user_id").in("user_id", userIds).is("deleted_at", null),
    supabaseAdmin.from("reports").select("target_id").in("target_id", userIds),
  ]);

  const postCounts: Record<string, number> = {};
  const reportCounts: Record<string, number> = {};
  for (const p of postsRes.data || []) postCounts[p.user_id] = (postCounts[p.user_id] || 0) + 1;
  for (const r of reportsRes.data || []) reportCounts[r.target_id] = (reportCounts[r.target_id] || 0) + 1;

  const users = (data || []).map((u: any) => ({
    ...u,
    postsCount: postCounts[u.id] || 0,
    reportsCount: reportCounts[u.id] || 0,
  }));

  res.json({ success: true, data: users, total: count });
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

export async function getStats(_req: AuthRequest, res: Response): Promise<void> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();

  const [totalUsersRes, activeUsersRes, totalPostsRes, pendingReportsRes,
         bannedUsersRes, suspendedUsersRes, newUsersTodayRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("account_status", "active").is("deleted_at", null),
    supabaseAdmin.from("posts").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabaseAdmin.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("account_status", "banned"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("account_status", "suspended"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", yesterday),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers:      totalUsersRes.count      ?? 0,
      activeUsers:     activeUsersRes.count     ?? 0,
      totalPosts:      totalPostsRes.count      ?? 0,
      pendingReports:  pendingReportsRes.count  ?? 0,
      bannedUsers:     bannedUsersRes.count     ?? 0,
      suspendedUsers:  suspendedUsersRes.count  ?? 0,
      newUsersToday:   newUsersTodayRes.count   ?? 0,
    },
  });
}

// ── Posts list ────────────────────────────────────────────────────────────────

export async function getPosts(req: AuthRequest, res: Response): Promise<void> {
  const search = (req.query.search as string) || "";
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 25;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("posts")
    .select(
      "id, content, tag, created_at, likes, deleted_at, user_id, profiles:user_id(name, avatar)",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = (query as any).ilike("content", `%${search}%`);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const postIds = (data || []).map((p: any) => p.id);
  const { data: reportData } = await supabaseAdmin
    .from("reports")
    .select("target_id")
    .in("target_id", postIds);

  const reportCounts: Record<string, number> = {};
  for (const r of reportData || []) reportCounts[r.target_id] = (reportCounts[r.target_id] || 0) + 1;

  const posts = (data || []).map((p: any) => ({
    id: p.id,
    content: p.content,
    tag: p.tag,
    createdAt: p.created_at,
    userId: p.user_id,
    author: (p.profiles as any)?.name || "Unknown",
    authorAvatar: (p.profiles as any)?.avatar || "?",
    reportsCount: reportCounts[p.id] || 0,
    status: (reportCounts[p.id] || 0) > 0 ? "flagged" : "published",
  }));

  res.json({ success: true, data: posts, total: count });
}

// ── Activity log ──────────────────────────────────────────────────────────────

export async function getActivity(req: AuthRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("admin_actions")
    .select(
      "id, action, reason, created_at, admin:admin_id(name), target:target_id(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data, total: count });
}

// ── Notices CRUD ──────────────────────────────────────────────────────────────

export const createNoticeSchema = z.object({
  title:    z.string().min(1).max(200),
  content:  z.string().min(1).max(2000),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export const updateNoticeSchema = z.object({
  title:    z.string().min(1).max(200).optional(),
  content:  z.string().min(1).max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status:   z.enum(["draft", "published", "archived"]).optional(),
});

export async function getNotices(_req: AuthRequest, res: Response): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("notices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function createNotice(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createNoticeSchema>;
  const { data, error } = await supabaseAdmin
    .from("notices")
    .insert({ title: body.title, content: body.content, priority: body.priority, created_by: req.user.id })
    .select()
    .single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function updateNotice(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as z.infer<typeof updateNoticeSchema>;
  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  if (body.status === "published") updates.published_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("notices").update(updates).eq("id", id).select().single();
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function deleteNotice(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from("notices").delete().eq("id", id);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}
