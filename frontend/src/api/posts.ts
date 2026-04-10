/**
 * Posts + Collabs API
 * Replaces all direct supabase.from("posts"/"collabs"/"comments"/...) calls in Feed.tsx
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

// ── Feed ─────────────────────────────────────────────────────────────────────

export const getFeed = (cursor?: string, mode?: "ranked" | "latest") => {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (mode && mode !== "ranked") params.set("mode", mode);
  const qs = params.toString();
  return apiGet<{ posts: any[]; collabs: any[] }>(`/api/feed${qs ? `?${qs}` : ""}`);
};

// ── Posts ─────────────────────────────────────────────────────────────────────

export const createPost = (body: {
  content: string;
  tag: string;
  image_urls?: string[];
  video_url?: string;
}) => apiPost<any>("/api/feed/posts", body);

export const updatePost = (id: string, body: { content?: string; tag?: string; image_urls?: string[] }) =>
  apiPatch<any>(`/api/feed/posts/${id}`, body);

export const deletePost = (id: string) => apiDelete(`/api/feed/posts/${id}`);

// ── Likes ─────────────────────────────────────────────────────────────────────

export const likePost   = (id: string) => apiPost(`/api/feed/posts/${id}/like`);
export const unlikePost = (id: string) => apiDelete(`/api/feed/posts/${id}/like`);

// ── Saves ──────────────────────────────────────────────────────────────────────

export const savePost   = (id: string) => apiPost(`/api/feed/posts/${id}/save`);
export const unsavePost = (id: string) => apiDelete(`/api/feed/posts/${id}/save`);

// ── Comments ──────────────────────────────────────────────────────────────────

export const getComments = (postId: string) =>
  apiGet<any[]>(`/api/feed/posts/${postId}/comments`);

export const addComment = (postId: string, body: { text: string; parentId?: string | null }) =>
  apiPost<any>(`/api/feed/posts/${postId}/comments`, body);

export const deleteComment = (postId: string, commentId: string) =>
  apiDelete(`/api/feed/posts/${postId}/comments/${commentId}`);

// ── Collabs ────────────────────────────────────────────────────────────────────

export const createCollab = (body: {
  title: string;
  description: string;
  looking: string;
  skills: string[];
  image_url?: string;
  video_url?: string;
}) => apiPost<any>("/api/feed/collabs", body);

export const updateCollab = (id: string, body: Partial<Parameters<typeof createCollab>[0]>) =>
  apiPatch<any>(`/api/feed/collabs/${id}`, body);

export const deleteCollab = (id: string) => apiDelete(`/api/feed/collabs/${id}`);

// ── Collab interactions ────────────────────────────────────────────────────────

export const expressInterest = (id: string) => apiPost(`/api/feed/collabs/${id}/interest`);
export const removeInterest  = (id: string) => apiDelete(`/api/feed/collabs/${id}/interest`);
export const saveCollab      = (id: string) => apiPost(`/api/feed/collabs/${id}/save`);
export const unsaveCollab    = (id: string) => apiDelete(`/api/feed/collabs/${id}/save`);
