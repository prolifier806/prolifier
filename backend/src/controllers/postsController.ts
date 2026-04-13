import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkFields, recordModerationFlag } from "../services/moderation";

const PAGE_SIZE = 15;

// ── Schemas ──────────────────────────────────────────────────────────────────

export const createPostSchema = z.object({
  content: z.string().min(1).max(2000),
  tag: z.string().min(1).max(50),
  image_urls: z.array(z.string().url()).max(4).optional(),
  video_url: z.string().url().optional(),
});

export const updatePostSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  tag: z.string().max(50).optional(),
  image_urls: z.array(z.string().url()).max(4).optional(),
});

export const createCollabSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  looking: z.string().min(1).max(200),
  skills: z.array(z.string()).min(1).max(10),
  image_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  candidate_location: z.string().max(100).optional(),
});

export const updateCollabSchema = createCollabSchema.partial();

export const createCommentSchema = z.object({
  text: z.string().min(1).max(1000),
  parentId: z.string().uuid().optional().nullable(),
});

// ── Feed ─────────────────────────────────────────────────────────────────────

export async function getFeed(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const cursor = req.query.cursor as string | undefined;

  let postsQuery = supabaseAdmin
    .from("posts")
    .select(`
      id, user_id, content, tag, image_urls, video_url,
      created_at, likes, comment_count,
      profiles:user_id (id, name, avatar, color, avatar_url, location, skills, role, deleted_at)
    `)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) postsQuery = postsQuery.lt("created_at", cursor);

  let collabsQuery = supabaseAdmin
    .from("collabs")
    .select(`
      id, user_id, title, description, looking, skills, image_url, video_url, created_at, candidate_location,
      profiles:user_id (id, name, avatar, color, avatar_url, location, skills, role, deleted_at)
    `)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) collabsQuery = collabsQuery.lt("created_at", cursor);

  const [
    blockedRes, blockerRes,
    postsRes, collabsRes,
    likesRes, savedPostsRes, savedCollabsRes, collabInterestsRes,
  ] = await Promise.all([
    supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId),
    supabaseAdmin.from("blocks").select("blocker_id").eq("blocked_id", userId),
    postsQuery,
    collabsQuery,
    supabaseAdmin.from("post_likes").select("post_id").eq("user_id", userId),
    supabaseAdmin.from("saved_posts").select("post_id").eq("user_id", userId),
    supabaseAdmin.from("saved_collabs").select("collab_id").eq("user_id", userId),
    supabaseAdmin.from("collab_interests").select("collab_id").eq("user_id", userId),
  ]);

  if (postsRes.error) { res.status(500).json({ success: false, error: postsRes.error.message }); return; }
  if (collabsRes.error) { res.status(500).json({ success: false, error: collabsRes.error.message }); return; }

  const blockedIds = new Set([
    ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
    ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
  ]);

  const posts = (postsRes.data ?? []).filter((p: any) => !blockedIds.has(p.user_id));
  const collabs = (collabsRes.data ?? []).filter((c: any) => !blockedIds.has(c.user_id));

  const postIds = new Set(posts.map((p: any) => p.id));
  const collabIds = new Set(collabs.map((c: any) => c.id));

  const likedSet = new Set((likesRes.data ?? []).filter((r: any) => postIds.has(r.post_id)).map((r: any) => r.post_id));
  const savedPostSet = new Set((savedPostsRes.data ?? []).filter((r: any) => postIds.has(r.post_id)).map((r: any) => r.post_id));
  const savedCollabSet = new Set((savedCollabsRes.data ?? []).filter((r: any) => collabIds.has(r.collab_id)).map((r: any) => r.collab_id));
  const interestedSet = new Set((collabInterestsRes.data ?? []).filter((r: any) => collabIds.has(r.collab_id)).map((r: any) => r.collab_id));

  const enrichedPosts = posts.map((p: any) => ({
    ...p,
    isLiked: likedSet.has(p.id),
    isSaved: savedPostSet.has(p.id),
    isOwn: p.user_id === userId,
  }));

  const enrichedCollabs = collabs.map((c: any) => ({
    ...c,
    isInterested: interestedSet.has(c.id),
    isSaved: savedCollabSet.has(c.id),
    isOwn: c.user_id === userId,
  }));

  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true, data: { posts: enrichedPosts, collabs: enrichedCollabs } });
}

// ── Discover ─────────────────────────────────────────────────────────────────

export async function getDiscover(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const page = Math.max(0, parseInt(req.query.page as string ?? "0", 10));
  const POOL = PAGE_SIZE * 3;
  const OFFSET = page * PAGE_SIZE;

  // Fetch user's skills and connections to allow soft-relevance and network diversity
  const [blockedRes, blockerRes, profileRes, connectionsRes] = await Promise.all([
    supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId),
    supabaseAdmin.from("blocks").select("blocker_id").eq("blocked_id", userId),
    supabaseAdmin.from("profiles").select("skills").eq("id", userId).single(),
    supabaseAdmin
      .from("connections")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
  ]);

  const blockedIds = new Set([
    ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
    ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
  ]);

  const connectedIds = new Set(
    (connectionsRes.data ?? []).map((r: any) =>
      r.requester_id === userId ? r.receiver_id : r.requester_id,
    ),
  );

  const userSkills: string[] = (profileRes.data as any)?.skills ?? [];

  // Fetch a large pool sorted by engagement (trending)
  const [postsRes, collabsRes, likesRes, savedPostsRes, savedCollabsRes, collabInterestsRes] = await Promise.all([
    supabaseAdmin
      .from("posts")
      .select(`
        id, user_id, content, tag, image_urls, video_url,
        created_at, likes, comment_count,
        profiles:user_id (id, name, avatar, color, avatar_url, location, skills, role, deleted_at)
      `)
      .order("likes", { ascending: false })
      .order("comment_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(POOL),
    supabaseAdmin
      .from("collabs")
      .select(`
        id, user_id, title, description, looking, skills, image_url, video_url, created_at, candidate_location,
        profiles:user_id (id, name, avatar, color, avatar_url, location, skills, role, deleted_at)
      `)
      .order("created_at", { ascending: false })
      .limit(POOL),
    supabaseAdmin.from("post_likes").select("post_id").eq("user_id", userId),
    supabaseAdmin.from("saved_posts").select("post_id").eq("user_id", userId),
    supabaseAdmin.from("saved_collabs").select("collab_id").eq("user_id", userId),
    supabaseAdmin.from("collab_interests").select("collab_id").eq("user_id", userId),
  ]);

  if (postsRes.error) { res.status(500).json({ success: false, error: postsRes.error.message }); return; }
  if (collabsRes.error) { res.status(500).json({ success: false, error: collabsRes.error.message }); return; }

  const allPosts = (postsRes.data ?? []).filter((p: any) => !blockedIds.has(p.user_id));
  const allCollabs = (collabsRes.data ?? []).filter((c: any) => !blockedIds.has(c.user_id));

  // Bucket posts: trending (high engagement) | relevant (skill match) | fresh (new creators)
  const seenAuthors = new Set<string>();

  type BucketedPost = { item: any; bucket: "trending" | "relevant" | "fresh" };

  const bucketPost = (p: any): BucketedPost => {
    const isTrending = (p.likes ?? 0) + (p.comment_count ?? 0) * 2 >= 5;
    const isRelevant = userSkills.some(us =>
      (p.tag ?? "").toLowerCase().includes(us.toLowerCase()),
    );
    if (isTrending) return { item: p, bucket: "trending" };
    if (isRelevant) return { item: p, bucket: "relevant" };
    return { item: p, bucket: "fresh" };
  };

  const bucketed = allPosts.map(bucketPost);
  const trending = bucketed.filter(b => b.bucket === "trending").map(b => b.item);
  const relevant = bucketed.filter(b => b.bucket === "relevant" && b.item.likes + (b.item.comment_count ?? 0) < 5).map(b => b.item);
  const fresh = bucketed.filter(b => b.bucket === "fresh").map(b => b.item);

  // Interleave buckets: 2 trending, 1 relevant, 1 fresh (repeating pattern)
  // then fill remainder from trending
  const interleaved: any[] = [];
  let ti = 0, ri = 0, fi = 0;
  while (interleaved.length < POOL) {
    if (ti < trending.length) interleaved.push(trending[ti++]);
    if (ti < trending.length) interleaved.push(trending[ti++]);
    if (ri < relevant.length) interleaved.push(relevant[ri++]);
    if (fi < fresh.length) interleaved.push(fresh[fi++]);
    if (ti >= trending.length && ri >= relevant.length && fi >= fresh.length) break;
  }

  // Inject light randomness: shuffle within windows of 8 to prevent strict determinism
  const shuffled: any[] = [];
  for (let i = 0; i < interleaved.length; i += 8) {
    const window = interleaved.slice(i, i + 8);
    // Fisher-Yates on the window
    for (let j = window.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [window[j], window[k]] = [window[k], window[j]];
    }
    shuffled.push(...window);
  }

  // Enforce author diversity: max 2 per author in the final page, prioritizing new creators
  const authorCount: Record<string, number> = {};
  const diversePosts = shuffled.filter((p: any) => {
    const isNew = !connectedIds.has(p.user_id) && !seenAuthors.has(p.user_id);
    const count = authorCount[p.user_id] ?? 0;
    const maxPerAuthor = isNew ? 1 : 2;
    if (count >= maxPerAuthor) return false;
    authorCount[p.user_id] = count + 1;
    seenAuthors.add(p.user_id);
    return true;
  });

  // Paginate
  const pagedPosts = diversePosts.slice(OFFSET, OFFSET + PAGE_SIZE);
  const pagedCollabs = allCollabs
    .sort((a: any, b: any) => withinTierSort(a, b))
    .slice(OFFSET, OFFSET + PAGE_SIZE);

  const postIds = new Set(pagedPosts.map((p: any) => p.id));
  const collabIds = new Set(pagedCollabs.map((c: any) => c.id));

  const likedSet = new Set((likesRes.data ?? []).filter((r: any) => postIds.has(r.post_id)).map((r: any) => r.post_id));
  const savedPostSet = new Set((savedPostsRes.data ?? []).filter((r: any) => postIds.has(r.post_id)).map((r: any) => r.post_id));
  const savedCollabSet = new Set((savedCollabsRes.data ?? []).filter((r: any) => collabIds.has(r.collab_id)).map((r: any) => r.collab_id));
  const interestedSet = new Set((collabInterestsRes.data ?? []).filter((r: any) => collabIds.has(r.collab_id)).map((r: any) => r.collab_id));

  const enrichedPosts = pagedPosts.map((p: any) => ({
    ...p,
    isLiked: likedSet.has(p.id),
    isSaved: savedPostSet.has(p.id),
    isOwn: p.user_id === userId,
  }));

  const enrichedCollabs = pagedCollabs.map((c: any) => ({
    ...c,
    isInterested: interestedSet.has(c.id),
    isSaved: savedCollabSet.has(c.id),
    isOwn: c.user_id === userId,
  }));

  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  res.json({ success: true, data: { posts: enrichedPosts, collabs: enrichedCollabs, page, hasMore: diversePosts.length > OFFSET + PAGE_SIZE } });
}

// ── Posts CRUD ───────────────────────────────────────────────────────────────

export async function createPost(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof createPostSchema>;

  const mod = checkFields({ content: body.content });
  if (!mod.allowed) {
    res.status(422).json({ success: false, error: "Content violates community guidelines", category: mod.category });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("posts")
    .insert({
      user_id: userId,
      content: body.content,
      tag: body.tag,
      image_urls: body.image_urls ?? [],
      video_url: body.video_url ?? null,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Persist flag for admin review (fire-and-forget, never blocks response)
  if (mod.severity === "flag" && data) {
    recordModerationFlag({
      userId, contentType: "post", contentId: data.id,
      text: body.content, category: mod.category!, matched: mod.matched,
    });
  }

  res.status(201).json({ success: true, data });
}

export async function updatePost(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;
  const body = req.body as z.infer<typeof updatePostSchema>;

  if (body.content) {
    const mod = checkFields({ content: body.content });
    if (!mod.allowed) {
      res.status(422).json({ success: false, error: "Content violates community guidelines" });
      return;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("posts")
    .update({ ...body })
    .eq("id", id)
    .eq("user_id", userId) // enforce ownership
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  if (!data) { res.status(404).json({ success: false, error: "Post not found or not owned by you" }); return; }

  res.json({ success: true, data });
}

export async function deletePost(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;

  // Fetch post to get media URLs for cleanup
  // WHY: was selecting "images"/"video" (wrong column names) — storage cleanup never ran.
  // Correct column names are "image_urls" (array) and "video_url" (text).
  const { data: post } = await supabaseAdmin
    .from("posts")
    .select("user_id, image_urls, video_url")
    .eq("id", id)
    .single();

  if (!post) { res.status(404).json({ success: false, error: "Post not found" }); return; }

  const isAdmin = ["admin", "moderator"].includes(req.user.role ?? "");
  if (post.user_id !== userId && !isAdmin) {
    res.status(403).json({ success: false, error: "Not authorized to delete this post" });
    return;
  }

  // Hard delete
  const { error } = await supabaseAdmin
    .from("posts")
    .delete()
    .eq("id", id);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Clean up storage (best-effort)
  const mediaUrls: string[] = [...((post.image_urls as string[] | null) ?? [])];
  if (post.video_url) mediaUrls.push(post.video_url as string);

  for (const url of mediaUrls) {
    const match = url.match(/\/storage\/v1\/object\/public\/posts\/(.+)/);
    if (match) {
      await supabaseAdmin.storage.from("posts").remove([match[1]]).catch(() => {});
    }
  }

  res.json({ success: true, data: null });
}

// ── Likes ────────────────────────────────────────────────────────────────────

export async function likePost(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;

  // Check if post exists and get owner
  const { data: post } = await supabaseAdmin.from("posts").select("user_id").eq("id", id).single();
  if (!post) { res.status(404).json({ success: false, error: "Post not found" }); return; }

  const { error } = await supabaseAdmin
    .from("post_likes")
    .insert({ user_id: userId, post_id: id });

  if (error?.code === "23505") { // duplicate — already liked
    res.status(409).json({ success: false, error: "Already liked" });
    return;
  }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Create notification for post owner (not self-like)
  if (post.user_id !== userId) {
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: post.user_id,
        type: "like",
        text: "liked your post",
        action: `/feed?post=${id}`,
        read: false,
      });
    } catch (notifErr) {
      console.warn("[posts] Failed to create like notification:", notifErr);
    }
  }

  res.json({ success: true, data: null });
}

export async function unlikePost(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;

  const { error } = await supabaseAdmin
    .from("post_likes")
    .delete()
    .eq("user_id", userId)
    .eq("post_id", id);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function savePost(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const { error } = await supabaseAdmin.from("saved_posts").insert({ user_id: userId, post_id: id });
  if (error?.code === "23505") { res.status(409).json({ success: false, error: "Already saved" }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function unsavePost(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const { error } = await supabaseAdmin.from("saved_posts").delete().eq("user_id", userId).eq("post_id", id);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from("comments")
    .select("id, user_id, text, created_at, profiles:user_id (name, avatar, color, role)")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

export async function addComment(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id: postId } = req.params;
  const body = req.body as z.infer<typeof createCommentSchema>;

  const mod = checkFields({ text: body.text });
  if (!mod.allowed) {
    res.status(422).json({ success: false, error: "Comment violates community guidelines" });
    return;
  }

  const { data: post } = await supabaseAdmin.from("posts").select("user_id").eq("id", postId).single();
  if (!post) { res.status(404).json({ success: false, error: "Post not found" }); return; }

  const { data, error } = await supabaseAdmin
    .from("comments")
    .insert({ user_id: userId, post_id: postId, text: body.text })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  if (mod.severity === "flag" && data) {
    recordModerationFlag({
      userId, contentType: "comment", contentId: data.id,
      text: body.text, category: mod.category!, matched: mod.matched,
    });
  }

  if (post.user_id !== userId) {
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: post.user_id,
        type: "comment",
        text: "commented on your post",
        subtext: body.text.slice(0, 80),
        action: `/feed?post=${postId}`,
        read: false,
      });
    } catch (notifErr) {
      console.warn("[posts] Failed to create comment notification:", notifErr);
    }
  }

  res.status(201).json({ success: true, data });
}

export async function deleteComment(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { commentId } = req.params;
  const isAdmin = ["admin", "moderator"].includes(req.user.role ?? "");

  const { data: comment } = await supabaseAdmin
    .from("comments").select("user_id").eq("id", commentId).single();

  if (!comment) { res.status(404).json({ success: false, error: "Comment not found" }); return; }
  if (comment.user_id !== userId && !isAdmin) {
    res.status(403).json({ success: false, error: "Not authorized" }); return;
  }

  const { error } = await supabaseAdmin
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

// ── Collabs ───────────────────────────────────────────────────────────────────

export async function createCollab(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof createCollabSchema>;

  const mod = checkFields({ title: body.title, description: body.description });
  if (!mod.allowed) {
    res.status(422).json({ success: false, error: "Content violates community guidelines" }); return;
  }

  const { data, error } = await supabaseAdmin
    .from("collabs")
    .insert({ user_id: userId, ...body })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data });
}

export async function updateCollab(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;
  const body = req.body as z.infer<typeof updateCollabSchema>;

  if (body.title || body.description) {
    const mod = checkFields({ title: body.title ?? "", description: body.description ?? "" });
    if (!mod.allowed) { res.status(422).json({ success: false, error: "Content violates guidelines" }); return; }
  }

  const { data, error } = await supabaseAdmin
    .from("collabs")
    .update({ ...body })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  if (!data) { res.status(404).json({ success: false, error: "Collab not found or not owned" }); return; }
  res.json({ success: true, data });
}

export async function deleteCollab(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;
  const isAdmin = ["admin", "moderator"].includes(req.user.role ?? "");

  const { data: collab } = await supabaseAdmin.from("collabs").select("user_id").eq("id", id).single();
  if (!collab) { res.status(404).json({ success: false, error: "Collab not found" }); return; }
  if (collab.user_id !== userId && !isAdmin) { res.status(403).json({ success: false, error: "Not authorized" }); return; }

  const { error } = await supabaseAdmin
    .from("collabs")
    .delete()
    .eq("id", id);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function expressInterest(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { id } = req.params;

  const { data: collab } = await supabaseAdmin.from("collabs").select("user_id").eq("id", id).single();
  if (!collab) { res.status(404).json({ success: false, error: "Collab not found" }); return; }

  const { error } = await supabaseAdmin
    .from("collab_interests")
    .insert({ user_id: userId, collab_id: id });

  if (error?.code === "23505") { res.status(409).json({ success: false, error: "Already expressed interest" }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  if (collab.user_id !== userId) {
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: collab.user_id,
        type: "collab_interest",
        text: "is interested in your collab",
        action: `/feed?collab=${id}`,
        read: false,
      });
    } catch (notifErr) {
      console.warn("[posts] Failed to create collab interest notification:", notifErr);
    }
  }

  res.json({ success: true, data: null });
}

export async function removeInterest(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const { error } = await supabaseAdmin.from("collab_interests").delete().eq("user_id", userId).eq("collab_id", id);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function saveCollab(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const { error } = await supabaseAdmin.from("saved_collabs").insert({ user_id: userId, collab_id: id });
  if (error?.code === "23505") { res.status(409).json({ success: false, error: "Already saved" }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function unsaveCollab(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userId = req.user.id;
  const { error } = await supabaseAdmin.from("saved_collabs").delete().eq("user_id", userId).eq("collab_id", id);
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}
