import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkFields } from "../services/moderation";

const PAGE_SIZE = 24;

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  bio: z.string().max(300).optional(),
  location: z.string().max(100).optional(),
  project: z.string().max(200).optional(),
  skills: z.array(z.string()).max(20).optional(),
  open_to_collab: z.boolean().optional(),
  role: z.string().max(50).optional(),
  avatar: z.string().max(10).optional(),
  color: z.string().max(50).optional(),
  startup_stage: z.enum(["Ideation", "MVP", "Traction", "Scaling", "None"]).optional(),
});

export const blockUserSchema = z.object({
  blockedId: z.string().uuid(),
});

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, avatar, color, avatar_url, location, bio, project, skills, open_to_collab, created_at, role, profile_complete")
    .eq("id", id)
    .single();

  if (error) { res.status(404).json({ success: false, error: "Profile not found" }); return; }

  res.json({ success: true, data });
}

export async function getMyProfile(req: AuthRequest, res: Response): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (error) { res.status(404).json({ success: false, error: "Profile not found" }); return; }
  res.json({ success: true, data });
}

export async function updateMyProfile(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof updateProfileSchema>;

  const fieldsToCheck: Record<string, string> = {};
  if (body.bio) fieldsToCheck.bio = body.bio;
  if (body.project) fieldsToCheck.project = body.project;

  if (Object.keys(fieldsToCheck).length > 0) {
    const mod = checkFields(fieldsToCheck);
    if (!mod.allowed) {
      res.status(422).json({ success: false, error: "Profile content violates community guidelines" });
      return;
    }
  }

  // Name change cooldown check
  if (body.name) {
    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("name, name_changed_at")
      .eq("id", userId)
      .single();

    if (current?.name_changed_at) {
      const daysSince = (Date.now() - new Date(current.name_changed_at).getTime()) / 86_400_000;
      if (daysSince < 30) {
        res.status(429).json({
          success: false,
          error: `Name can only be changed every 30 days. ${Math.ceil(30 - daysSince)} days remaining.`,
        });
        return;
      }
    }
  }

  const updatePayload: Record<string, unknown> = { ...body };
  if (body.name) updatePayload.name_changed_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function discoverProfiles(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const cursor      = req.query.cursor      as string | undefined;
  const skills      = req.query.skills      as string | undefined; // hard filter
  const rankSkills  = req.query.rankSkills  as string | undefined; // soft rank
  const location    = req.query.location    as string | undefined;
  const search      = req.query.search      as string | undefined;
  const collabOnly  = req.query.collabOnly  === "true";

  // WHY: When ranking by skills we need a larger pool to sort from so that
  // high-match profiles aren't cut off by the page limit before ranking.
  // We fetch up to 200 candidates then rank and slice to PAGE_SIZE.
  const fetchLimit = rankSkills ? 200 : PAGE_SIZE;

  let query = supabaseAdmin
    .from("profiles")
    .select("id, name, avatar, color, avatar_url, location, bio, project, skills, open_to_collab, created_at, role")
    .eq("profile_complete", true)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (cursor) query = query.lt("created_at", cursor);
  if (collabOnly) query = query.eq("open_to_collab", true);
  if (location) query = query.eq("location", location);
  if (skills) query = query.overlaps("skills", skills.split(","));
  if (search) {
    // WHY: Sanitize to prevent PostgREST filter injection.
    const safe = search.replace(/[%_,.()"']/g, "").slice(0, 100);
    if (safe) {
      const q = `%${safe}%`;
      query = query.or(`name.ilike.${q},bio.ilike.${q},location.ilike.${q}`);
    }
  }

  // Fire blocks and profiles queries in parallel
  const [blockedRes, blockerRes, { data, error }] = await Promise.all([
    supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId),
    supabaseAdmin.from("blocks").select("blocker_id").eq("blocked_id", userId),
    query,
  ]);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const hiddenIds = new Set([
    userId,
    ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
    ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
  ]);

  let filtered = (data ?? []).filter((p: any) => !hiddenIds.has(p.id));

  // ── Skill-based ranking ───────────────────────────────────────────────────
  // WHY: We rank server-side so the client receives profiles already in the
  // correct order on the first response — no visible re-ordering on the page.
  if (rankSkills) {
    // Normalise the requested skills: lowercase + trim + split on comma
    const wantedRaw = rankSkills.split(",").map(s => s.toLowerCase().trim()).filter(Boolean).slice(0, 20);

    // Score each profile: count how many of their skills match any wanted skill.
    // Matching rules (as specified):
    //   • Case-insensitive
    //   • Partial/keyword match — "java" matches "JavaScript" and "Java Spring"
    //   • Exact match scores 2 pts, partial match scores 1 pt
    const scored = filtered.map((p: any) => {
      const profileSkills: string[] = (p.skills ?? []).map((s: string) => s.toLowerCase().trim());
      let score = 0;
      for (const want of wantedRaw) {
        for (const have of profileSkills) {
          if (have === want) { score += 2; break; }         // exact
          if (have.includes(want) || want.includes(have)) { score += 1; break; } // partial
        }
      }
      return { profile: p, score };
    });

    // Stable sort: higher score first, preserve created_at order within same score
    scored.sort((a, b) => b.score - a.score);
    filtered = scored.map(s => s.profile).slice(0, PAGE_SIZE);
  }

  res.json({ success: true, data: filtered });
}

export async function blockUser(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { blockedId } = req.body as z.infer<typeof blockUserSchema>;

  if (blockedId === userId) { res.status(400).json({ success: false, error: "Cannot block yourself" }); return; }

  const { error } = await supabaseAdmin
    .from("blocks")
    .insert({ blocker_id: userId, blocked_id: blockedId });

  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Remove any existing connection
  try {
    await supabaseAdmin
      .from("connections")
      .delete()
      .or(`and(requester_id.eq.${userId},receiver_id.eq.${blockedId}),and(requester_id.eq.${blockedId},receiver_id.eq.${userId})`);
  } catch (connErr) {
    console.warn("[users] Failed to remove connection on block:", connErr);
  }

  res.json({ success: true, data: null });
}

export async function unblockUser(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id: blockedId } = req.params;

  const { error } = await supabaseAdmin
    .from("blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function deleteMyAccount(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  // Disable the auth account
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876600h" })
    .then((r) => r)
    .catch((e) => ({ error: e })) as { error: any };

  if (error) { res.status(500).json({ success: false, error: "Failed to disable account" }); return; }

  res.json({ success: true, data: null });
}
