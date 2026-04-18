import { Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Highlight the first occurrence of the query in text (simple substring match). */
function highlight(text: string, query: string): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  const snippet = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  return snippet;
}

// ── GET /api/search/groups/:groupId — search messages in a single group ───────
export async function searchGroupMessages(req: AuthRequest, res: Response): Promise<void> {
  const { groupId } = req.params;
  const userId = req.user.id;
  const q = ((req.query.q as string) ?? "").trim();
  const limit = Math.min(parseInt((req.query.limit as string) ?? String(DEFAULT_LIMIT), 10), MAX_LIMIT);
  const cursor = (req.query.cursor as string) ?? null; // ISO timestamp — messages before this

  if (q.length < MIN_QUERY_LEN) {
    res.json({ success: true, data: { results: [], hasMore: false } });
    return;
  }

  // Verify user is a member of the group
  const { data: member } = await supabaseAdmin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("owner_id, visibility")
    .eq("id", groupId)
    .single();

  const isOwner = group?.owner_id === userId;
  const isPublic = group?.visibility === "public";
  if (!member && !isOwner && !isPublic) {
    res.status(403).json({ success: false, error: "Not a member of this group" });
    return;
  }

  // Build full-text query — replace spaces with & for AND matching
  const tsQuery = q.trim().split(/\s+/).join(" & ");

  let query = supabaseAdmin
    .from("group_messages")
    .select("id, group_id, user_id, text, media_url, media_type, created_at, is_system, unsent")
    .eq("group_id", groupId)
    .eq("is_system", false)
    .eq("unsent", false)
    .not("text", "is", null)
    .ilike("text", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const hasMore = (rows?.length ?? 0) > limit;
  const results = (rows ?? []).slice(0, limit);

  // Fetch profile data for senders
  const userIds = [...new Set(results.map((r: any) => r.user_id))];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, name, color, avatar_url")
    .in("id", userIds);
  const profileMap: Record<string, any> = {};
  (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

  const formatted = results.map((r: any) => ({
    id: r.id,
    group_id: r.group_id,
    text: r.text,
    snippet: highlight(r.text ?? "", q),
    media_url: r.media_url,
    media_type: r.media_type,
    created_at: r.created_at,
    sender: {
      id: r.user_id,
      name: profileMap[r.user_id]?.name ?? "Unknown",
      color: profileMap[r.user_id]?.color ?? "bg-primary",
      avatar_url: profileMap[r.user_id]?.avatar_url ?? null,
    },
  }));

  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].created_at : null;
  res.json({ success: true, data: { results: formatted, hasMore, nextCursor } });
}

// ── GET /api/search/dms/:peerId — search DMs with a specific user ─────────────
export async function searchDmMessages(req: AuthRequest, res: Response): Promise<void> {
  const { peerId } = req.params;
  const userId = req.user.id;
  const q = ((req.query.q as string) ?? "").trim();
  const limit = Math.min(parseInt((req.query.limit as string) ?? String(DEFAULT_LIMIT), 10), MAX_LIMIT);
  const cursor = (req.query.cursor as string) ?? null;

  if (q.length < MIN_QUERY_LEN) {
    res.json({ success: true, data: { results: [], hasMore: false } });
    return;
  }

  const tsQuery = q.trim().split(/\s+/).join(" & ");

  let query = supabaseAdmin
    .from("messages")
    .select("id, sender_id, receiver_id, text, media_url, media_type, created_at, read")
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${userId})`
    )
    .not("text", "is", null)
    .textSearch("search_vector", tsQuery)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const hasMore = (rows?.length ?? 0) > limit;
  const results = (rows ?? []).slice(0, limit);

  // Fetch peer profile
  const { data: peerProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, name, color, avatar_url")
    .eq("id", peerId)
    .single();

  const { data: myProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, name, color, avatar_url")
    .eq("id", userId)
    .single();

  const profileMap: Record<string, any> = {
    [peerId]: peerProfile,
    [userId]: myProfile,
  };

  const formatted = results.map((r: any) => ({
    id: r.id,
    text: r.text,
    snippet: highlight(r.text ?? "", q),
    media_url: r.media_url,
    media_type: r.media_type,
    created_at: r.created_at,
    read: r.read,
    sender: {
      id: r.sender_id,
      name: profileMap[r.sender_id]?.name ?? "Unknown",
      color: profileMap[r.sender_id]?.color ?? "bg-primary",
      avatar_url: profileMap[r.sender_id]?.avatar_url ?? null,
    },
  }));

  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].created_at : null;
  res.json({ success: true, data: { results: formatted, hasMore, nextCursor } });
}
