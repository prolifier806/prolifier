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
