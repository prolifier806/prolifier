/**
 * Upload API
 * Replaces direct supabase.storage calls in ProfileSetup.tsx, Feed.tsx, Messages.tsx
 * Files go through the backend which validates, compresses, and stores them.
 */
import { apiUpload, apiDelete, apiGet, API_URL } from "./client";
import { supabase } from "@/lib/supabase";

export interface UploadedImage {
  url: string;
  filename: string;
  sizeBytes: number;
}

export interface UploadedVideo {
  storagePath: string;
  fallbackUrl: string;
  videoId: string;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export async function uploadAvatar(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const data = await apiUpload<{ url: string }>("/api/uploads/avatar", form);
  return data.url;
}

export const removeAvatar = () => apiDelete("/api/uploads/avatar");

// ── Post image ────────────────────────────────────────────────────────────────

export async function uploadPostImage(
  file: File,
  context: "feed" | "chat" = "feed"
): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<UploadedImage>(`/api/uploads/image?context=${context}`, form);
}

// ── Video ────────────────────────────────────────────────────────────────────

export async function uploadVideo(
  file: File,
  context: "feed" | "chat" = "feed",
  onProgress?: (pct: number) => void
): Promise<UploadedVideo> {
  // Use XHR so we get progress events
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/uploads/video?context=${context}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (json.success) resolve(json.data);
        else reject(new Error(json.error ?? "Upload failed"));
      } catch {
        reject(new Error("Invalid response from server"));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during video upload"));
    xhr.send(form);
  });
}

// ── Generic file ─────────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<{ url: string }>("/api/uploads/file", form);
}

// ── Video processing status ───────────────────────────────────────────────────

export async function pollVideoStatus(videoId: string, timeoutMs = 300_000): Promise<{
  hls_url: string;
  fallback_url: string;
  thumbnail_url: string;
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await apiGet<any>(`/api/uploads/video/${videoId}/status`);
    if (data.status === "ready") return data;
    if (data.status === "failed") throw new Error("Video processing failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Video processing timed out");
}
