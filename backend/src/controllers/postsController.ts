import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkFields } from "../services/moderation";

const PAGE_SIZE = 20;

// ── Schemas ──────────────────────────────────────────────────────────────────

export const createPostSchema = z.object({
  content: z.string().min(1).max(2000),
  tag: z.string().min(1).max(50),
  location: z.string().max(100).optional(),
  images: z.array(z.string().url()).max(4).optional(),
  video: z.string().url().optional(),
  link: z.string().url().optional(),
});

export const updatePostSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  tag: z.string().max(50).optional(),
});

export const createCollabSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  looking: z.string().min(1).max(200),
  skills: z.array(z.string()).min(1).max(10),
  image: z.string().url().optional(),
  video: z.string().url().optional(),
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

  // Get blocks in parallel
  const [blockedRes, blockerRes] = await Promise.all([
    supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId),
    supabaseAdmin.from("blocks").select("blocker_id").eq("blocked_id", userId),
  ]);

  const blockedIds = new Set([
    ...(blockedRes.data ?? []).map((r: any) => r.blocked_id),
    ...(blockerRes.data ?? []).map((r: any) => r.blocker_id),
  ]);

  let postsQuery = supabaseAdmin
    .from("posts")
    .select(`
      id, user_id, content, tag, location, images, video, link,
      created_at, likes_count, comment_count,
      profiles:user_id (id, name, avatar, color, avatar_url, skills, deleted_at, role)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) postsQuery = postsQuery.lt("created_at", cursor);

  let collabsQuery = supabaseAdmin
    .from("collabs")
    .select(`
      id, user_id, title, description, looking, skills, image, video, created_at,
      profiles:user_id (id, name, avatar, color, avatar_url, skills, deleted_at, role)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) collabsQuery = collabsQuery.lt("created_at", cursor);

  const [postsRes, collabsRes] = await Promise.all([postsQuery, collabsQuery]);

  if (postsRes.error) { res.status(500).json({ success: false, error: postsRes.error.message }); return; }
  if (collabsRes.error) { res.status(500).json({ success: false, error: collabsRes.error.message }); return; }

  const posts = (postsRes.data ?? []).filter((p: any) => !blockedIds.has(p.user_id));
  const collabs = (collabsRes.data ?? []).filter((c: any) => !blockedIds.has(c.user_id));

  // Fetch user's likes/saves/interests for these items
  const postIds = posts.map((p: any) => p.id);
  const collabIds = collabs.map((c: any) => c.id);

  const [likesRes, savedPostsRes, savedCollabsRes, collabInterestsRes] = await Promise.all([
    postIds.length ? supabaseAdmin.from("post_likes").select("post_id").eq("user_id", userId).in("post_id", postIds) : { data: [] },
    postIds.length ? supabaseAdmin.from("saved_posts").select("post_id").eq("user_id", userId).in("post_id", postIds) : { data: [] },
    collabIds.length ? supabaseAdmin.from("saved_collabs").select("collab_id").eq("user_id", userId).in("collab_id", collabIds) : { data: [] },
    collabIds.length ? supabaseAdmin.from("collab_interests").select("collab_id").eq("user_id", userId).in("collab_id", collabIds) : { data: [] },
  ]);

  const likedSet = new Set((likesRes.data ?? []).map((r: any) => r.post_id));
  const savedPostSet = new Set((savedPostsRes.data ?? []).map((r: any) => r.post_id));
  const savedCollabSet = new Set((savedCollabsRes.data ?? []).map((r: any) => r.collab_id));
  const interestedSet = new Set((collabInterestsRes.data ?? []).map((r: any) => r.collab_id));

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

  res.json({ success: true, data: { posts: enrichedPosts, collabs: enrichedCollabs } });
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
      location: body.location ?? null,
      images: body.images ?? [],
      video: body.video ?? null,
      link: body.link ?? null,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

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
    .update({ ...body, updated_at: new Date().toISOString() })
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
  const { data: post } = await supabaseAdmin
    .from("posts")
    .select("user_id, images, video")
    .eq("id", id)
    .single();

  if (!post) { res.status(404).json({ success: false, error: "Post not found" }); return; }

  const isAdmin = ["admin", "moderator"].includes(req.user.role ?? "");
  if (post.user_id !== userId && !isAdmin) {
    res.status(403).json({ success: false, error: "Not authorized to delete this post" });
    return;
  }

  // Soft delete
  const { error } = await supabaseAdmin
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Clean up storage (best-effort)
  const mediaUrls: string[] = [...(post.images ?? [])];
  if (post.video) mediaUrls.push(post.video);

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
    await supabaseAdmin.from("notifications").insert({
      user_id: post.user_id,
      type: "like",
      text: "liked your post",
      actor_id: userId,
      action: `/feed?post=${id}`,
      read: false,
    }).catch(() => {});
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
    .select("id, user_id, text, parent_id, created_at, profiles:user_id (name, avatar, color, avatar_url, role)")
    .eq("post_id", id)
    .is("deleted_at", null)
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
    .insert({ user_id: userId, post_id: postId, text: body.text, parent_id: body.parentId ?? null })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  if (post.user_id !== userId) {
    await supabaseAdmin.from("notifications").insert({
      user_id: post.user_id,
      type: "comment",
      text: "commented on your post",
      subtext: body.text.slice(0, 80),
      actor_id: userId,
      action: `/feed?post=${postId}`,
      read: false,
    }).catch(() => {});
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
    .update({ deleted_at: new Date().toISOString() })
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
    .update({ ...body, updated_at: new Date().toISOString() })
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
    .update({ deleted_at: new Date().toISOString() })
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
    await supabaseAdmin.from("notifications").insert({
      user_id: collab.user_id,
      type: "collab_interest",
      text: "is interested in your collab",
      actor_id: userId,
      action: `/feed?collab=${id}`,
      read: false,
    }).catch(() => {});
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
