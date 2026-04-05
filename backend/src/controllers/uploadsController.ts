import { Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import {
  processAndUploadImage,
  uploadAvatar,
  uploadVideo,
  type ImageContext,
  type VideoContext,
} from "../services/storage";

// ── Avatar ────────────────────────────────────────────────────────────────────

export async function uploadAvatarHandler(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;
  if (!file) { res.status(400).json({ success: false, error: "No file provided" }); return; }

  try {
    const url = await uploadAvatar(file.buffer, file.mimetype, req.user.id);

    // Persist URL to profile
    await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", req.user.id);

    res.json({ success: true, data: { url } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function removeAvatarHandler(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  const { data: files } = await supabaseAdmin.storage.from("avatars").list(userId);
  if (files?.length) {
    await supabaseAdmin.storage.from("avatars").remove(files.map((f: any) => `${userId}/${f.name}`));
  }

  await supabaseAdmin.from("profiles").update({ avatar_url: null }).eq("id", userId);

  res.json({ success: true, data: null });
}

// ── Post image ────────────────────────────────────────────────────────────────

export async function uploadPostImage(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;
  if (!file) { res.status(400).json({ success: false, error: "No file provided" }); return; }

  const context = (req.query.context as ImageContext) ?? "feed";
  const validContexts: ImageContext[] = ["feed", "avatar", "chat"];
  if (!validContexts.includes(context)) {
    res.status(400).json({ success: false, error: "Invalid context" }); return;
  }

  try {
    const result = await processAndUploadImage(
      file.buffer,
      file.mimetype,
      context,
      "posts",
      req.user.id
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// ── Video ────────────────────────────────────────────────────────────────────

export async function uploadVideoHandler(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;
  if (!file) { res.status(400).json({ success: false, error: "No file provided" }); return; }

  const context = (req.query.context as VideoContext) ?? "feed";
  if (!["feed", "chat"].includes(context)) {
    res.status(400).json({ success: false, error: "Invalid context" }); return;
  }

  try {
    const result = await uploadVideo(file.buffer, context, req.user.id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// ── Video processing status ──────────────────────────────────────────────────

export async function getVideoStatus(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id, status, hls_url, fallback_url, thumbnail_url")
    .eq("id", id)
    .eq("user_id", req.user.id) // enforce ownership
    .single();

  if (error) { res.status(404).json({ success: false, error: "Video not found" }); return; }
  res.json({ success: true, data });
}
