import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth";
import {
  uploadAvatarHandler, removeAvatarHandler,
  uploadPostImage, uploadVideoHandler, getVideoStatus,
} from "../controllers/uploadsController";

const router = Router();
router.use(requireAuth as any);

// Multer — store files in memory for processing with sharp
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB hard limit
  fileFilter: (_, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB hard limit
  fileFilter: (_, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/x-m4v"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/avatar", imageUpload.single("file"), uploadAvatarHandler as any);
router.delete("/avatar", removeAvatarHandler as any);
router.post("/image", imageUpload.single("file"), uploadPostImage as any);
router.post("/video", videoUpload.single("file"), uploadVideoHandler as any);
router.get("/video/:id/status", getVideoStatus as any);

// Generic file upload for message attachments (voice notes, files)
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});
router.post("/file", fileUpload.single("file"), (async (req: any, res: any) => {
  const file = req.file;
  if (!file) { res.status(400).json({ success: false, error: "No file provided" }); return; }
  const { supabaseAdmin } = await import("../lib/supabase");
  const safeName = `${req.user.id}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabaseAdmin.storage
    .from("messages")
    .upload(safeName, file.buffer, { contentType: file.mimetype });
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  const { data } = supabaseAdmin.storage.from("messages").getPublicUrl(safeName);
  res.json({ success: true, data: { url: data.publicUrl } });
}) as any);

// Lookup video HLS info by fallback URL (used by SmartVideo component)
router.get("/video/by-url", (async (req: any, res: any) => {
  const { fallback_url } = req.query;
  if (!fallback_url) { res.status(400).json({ success: false, error: "fallback_url required" }); return; }
  const { supabaseAdmin } = await import("../lib/supabase");
  const { data } = await supabaseAdmin
    .from("videos")
    .select("id, hls_url, thumbnail_url, status")
    .eq("fallback_url", fallback_url)
    .eq("status", "ready")
    .maybeSingle();
  res.json({ success: true, data });
}) as any);

export default router;
