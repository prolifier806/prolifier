import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkFields } from "../services/moderation";
import { cacheGet, cacheSet, cacheDel, cacheDelPattern, CK, TTL } from "../lib/cache";

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
  username: z.string().regex(/^[a-z0-9_]{3,20}$/).optional(),
});

export const blockUserSchema = z.object({
  blockedId: z.string().uuid(),
});

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const key = CK.profile(id);

  const cached = await cacheGet<any>(key);
  if (cached) { res.json({ success: true, data: cached }); return; }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, username, avatar, color, avatar_url, location, bio, project, skills, open_to_collab, created_at, role, profile_complete")
    .eq("id", id)
    .single();

  if (error) { res.status(404).json({ success: false, error: "Profile not found" }); return; }

  await cacheSet(key, data, TTL.PROFILE);
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
      const hoursSince = (Date.now() - new Date(current.name_changed_at).getTime()) / 3_600_000;
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        res.status(429).json({
          success: false,
          error: `Name can only be changed once every 24 hours. ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"} remaining.`,
          hoursLeft,
          nameChangedAt: current.name_changed_at,
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

  // Bust cached public profile so viewers see the updated name/avatar immediately
  await cacheDel(CK.profile(userId));

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

  // Cache only the unfiltered first page — this is the most common request
  // (user opens Discover with no filters). Any filter combination bypasses cache.
  const isBaseCase = !cursor && !skills && !rankSkills && !location && !search && !collabOnly;
  if (isBaseCase) {
    const cached = await cacheGet<any[]>(CK.discover(userId));
    if (cached) { return res.json({ success: true, data: cached }); }
  }

  // WHY: When ranking by skills we need a larger pool to sort from so that
  // high-match profiles aren't cut off by the page limit before ranking.
  // We fetch up to 200 candidates then rank and slice to PAGE_SIZE.
  const fetchLimit = rankSkills ? 200 : PAGE_SIZE;

  // Helper: apply common optional filters to any query builder
  const applyCommon = (q: any) => {
    q = q
      .eq("profile_complete", true)
      .is("deleted_at", null)
      .neq("permanently_deleted", true)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
    if (cursor)     q = q.lt("created_at", cursor);
    if (collabOnly) q = q.eq("open_to_collab", true);
    if (location)   q = q.eq("location", location);
    if (skills)     q = q.overlaps("skills", skills.split(","));
    return q;
  };

  const BASE_SELECT = "id, name, username, avatar, color, avatar_url, location, bio, project, skills, open_to_collab, created_at, role";

  let rawData: any[] = [];

  // WHY: Always fire blocks queries concurrently with profile queries — never wait
  // for profiles to finish before starting the blocks fetch.
  const blocksPromise = Promise.all([
    supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId),
    supabaseAdmin.from("blocks").select("blocker_id").eq("blocked_id", userId),
  ]);

  if (search) {
    // WHY: Sanitize to prevent PostgREST filter injection.
    const safe = search.replace(/[%_,.()"']/g, "").slice(0, 100);
    if (safe) {
      const likeVal = `%${safe}%`;
      // WHY: Run text-field search, skill-array search, AND blocks all in parallel.
      // A query for "React" finds profiles that mention React in text fields
      // AND profiles that have React as a tagged skill — results are merged.
      const [textRes, skillRes, [blockedRes, blockerRes]] = await Promise.all([
        applyCommon(supabaseAdmin.from("profiles").select(BASE_SELECT))
          .or(`name.ilike.${likeVal},username.ilike.${likeVal},bio.ilike.${likeVal},location.ilike.${likeVal},project.ilike.${likeVal}`),
        applyCommon(supabaseAdmin.from("profiles").select(BASE_SELECT))
          .overlaps("skills", [safe]),
        blocksPromise,
      ]);
      const merged = [...(textRes.data ?? [])];
      const seen = new Set(merged.map((p: any) => p.id));
      for (const p of (skillRes.data ?? [])) {
        if (!seen.has(p.id)) { merged.push(p); seen.add(p.id); }
      }
      rawData = merged;

      const hiddenIds = new Set([
        userId,
        ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
        ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
      ]);
      let filtered = rawData.filter((p: any) => !hiddenIds.has(p.id));
      // No rankSkills when search is active — return merged results ordered by created_at
      return res.json({ success: true, data: filtered.slice(0, PAGE_SIZE) });
    }
    // safe was empty after sanitisation — fall through to return empty
    await blocksPromise; // drain the promise
    return res.json({ success: true, data: [] });
  } else {
    const [profileRes, [blockedRes, blockerRes]] = await Promise.all([
      applyCommon(supabaseAdmin.from("profiles").select(BASE_SELECT)),
      blocksPromise,
    ]);
    if (profileRes.error) { res.status(500).json({ success: false, error: profileRes.error.message }); return; }
    rawData = profileRes.data ?? [];

    const hiddenIds = new Set([
      userId,
      ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
      ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
    ]);
    let filtered = rawData.filter((p: any) => !hiddenIds.has(p.id));

    // ── Skill-based ranking ─────────────────────────────────────────────────
    if (rankSkills) {
      const wantedRaw = rankSkills.split(",").map(s => s.toLowerCase().trim()).filter(Boolean).slice(0, 20);
      const scored = filtered.map((p: any) => {
        const profileSkills: string[] = (p.skills ?? []).map((s: string) => s.toLowerCase().trim());
        let score = 0;
        for (const want of wantedRaw) {
          for (const have of profileSkills) {
            if (have === want) { score += 2; break; }
            if (have.includes(want) || want.includes(have)) { score += 1; break; }
          }
        }
        return { profile: p, score };
      });
      scored.sort((a, b) => b.score - a.score);
      filtered = scored.map(s => s.profile).slice(0, PAGE_SIZE);
    }

    // Write to cache only for the base (unfiltered) case
    if (isBaseCase) {
      await cacheSet(CK.discover(userId), filtered, TTL.DISCOVER);
    }

    return res.json({ success: true, data: filtered });
  }
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

  // Bust cached search/discover results for both parties — the blocked user
  // must disappear from each other's search and discover immediately.
  await Promise.all([
    cacheDelPattern(`search:users:${userId}:*`),
    cacheDelPattern(`search:users:${blockedId}:*`),
    cacheDel(CK.discover(userId), CK.discover(blockedId)),
  ]);

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

  // Bust search/discover so the unblocked user reappears in results.
  await Promise.all([
    cacheDelPattern(`search:users:${userId}:*`),
    cacheDel(CK.discover(userId)),
  ]);

  res.json({ success: true, data: null });
}

export async function deleteMyAccount(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  // Permanently delete all user data immediately.
  // Messages are intentionally kept so conversation history is preserved;
  // orphaned sender_id will display as "Deleted Account" in the UI.
  await Promise.all([
    supabaseAdmin.from("post_likes").delete().eq("user_id", userId),
    supabaseAdmin.from("comments").delete().eq("user_id", userId),
    supabaseAdmin.from("connections").delete().or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
    supabaseAdmin.from("notifications").delete().eq("user_id", userId),
    supabaseAdmin.from("blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    supabaseAdmin.from("saved_posts").delete().eq("user_id", userId),
    supabaseAdmin.from("saved_collabs").delete().eq("user_id", userId),
    supabaseAdmin.from("collab_interests").delete().eq("user_id", userId),
    supabaseAdmin.from("group_members").delete().eq("user_id", userId),
    supabaseAdmin.from("group_join_requests").delete().eq("user_id", userId),
    supabaseAdmin.from("dm_message_reactions").delete().eq("user_id", userId),
    supabaseAdmin.from("group_message_reactions").delete().eq("user_id", userId),
    supabaseAdmin.from("hidden_conversations").delete().or(`user_id.eq.${userId},other_id.eq.${userId}`),
    supabaseAdmin.from("mutes").delete().or(`muter_id.eq.${userId},muted_id.eq.${userId}`),
  ]);
  await supabaseAdmin.from("posts").delete().eq("user_id", userId);
  await supabaseAdmin.from("collabs").delete().eq("user_id", userId);
  await supabaseAdmin.from("profiles").delete().eq("id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);

  res.json({ success: true, data: null });
}

// Kept as stubs for backward compatibility with older clients.
export async function recoverAccount(_req: AuthRequest, res: Response): Promise<void> {
  res.status(410).json({ success: false, error: "Account recovery is no longer supported. Deletion is immediate and permanent." });
}

export async function purgeExpiredAccount(_req: AuthRequest, res: Response): Promise<void> {
  res.json({ success: true, data: { purged: false } });
}

/** GET /api/users/search?q=xxx
 *  Searches profiles by username (primary) and name (fallback).
 *  Used by the @mention autocomplete and global search.
 *  Returns up to 15 results, blocked users excluded.
 */
export async function searchUsers(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const raw = (req.query.q as string ?? "").toLowerCase().trim().replace(/[%_,.()"']/g, "").slice(0, 50);

  if (!raw) { res.json({ success: true, data: [] }); return; }

  const key = CK.searchUsers(userId, raw);
  const cached = await cacheGet<any[]>(key);
  if (cached) { res.json({ success: true, data: cached }); return; }

  const like = `%${raw}%`;
  const LIMIT = 15;

  const [byUsername, byName, [blockedRes, blockerRes]] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, name, username, avatar, color, avatar_url, role")
      .ilike("username", like)
      .eq("profile_complete", true)
      .is("deleted_at", null)
      .neq("permanently_deleted", true)
      .neq("id", userId)
      .limit(LIMIT),
    supabaseAdmin
      .from("profiles")
      .select("id, name, username, avatar, color, avatar_url, role")
      .ilike("name", like)
      .eq("profile_complete", true)
      .is("deleted_at", null)
      .neq("permanently_deleted", true)
      .neq("id", userId)
      .limit(LIMIT),
    Promise.all([
      supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId),
      supabaseAdmin.from("blocks").select("blocker_id").eq("blocked_id", userId),
    ]),
  ]);

  const hiddenIds = new Set([
    ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
    ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
  ]);

  // Username matches first, then name matches (deduplicated)
  const merged: any[] = [...(byUsername.data ?? [])];
  const seen = new Set(merged.map((p: any) => p.id));
  for (const p of (byName.data ?? [])) {
    if (!seen.has(p.id)) { merged.push(p); seen.add(p.id); }
  }

  const filtered = merged.filter((p: any) => !hiddenIds.has(p.id)).slice(0, LIMIT);
  await cacheSet(key, filtered, TTL.SEARCH_USERS);
  res.json({ success: true, data: filtered });
}
