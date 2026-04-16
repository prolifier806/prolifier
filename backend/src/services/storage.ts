import sharp from "sharp";
import { supabaseAdmin } from "../lib/supabase";

// ── Image ────────────────────────────────────────────────────────────────────

const IMAGE_CONFIG = {
  feed:   { maxWidthPx: 1080, targetKB: 400,  hardLimitMB: 20 },
  avatar: { maxWidthPx: 400,  targetKB: 150,  hardLimitMB: 5  },
  // chat: client controls dimensions via quality selector; backend only enforces
  // a generous upper bound (1920px) and a higher KB budget so 720p/HD aren't re-shrunk.
  chat:   { maxWidthPx: 1920, targetKB: 1500, hardLimitMB: 20 },
} as const;

export type ImageContext = keyof typeof IMAGE_CONFIG;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif", "image/avif",
]);

export interface UploadedImage {
  url: string;
  filename: string;
  sizeBytes: number;
}

export async function processAndUploadImage(
  buffer: Buffer,
  mimetype: string,
  context: ImageContext,
  bucket: string,
  folder: string
): Promise<UploadedImage> {
  if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
    throw new Error(`Unsupported image type: ${mimetype}`);
  }

  const cfg = IMAGE_CONFIG[context];

  if (buffer.length > cfg.hardLimitMB * 1024 * 1024) {
    throw new Error(`File exceeds ${cfg.hardLimitMB}MB limit`);
  }

  // Process with sharp: resize + convert to WebP
  let processed = sharp(buffer).rotate(); // auto-rotate from EXIF

  const meta = await sharp(buffer).metadata();
  if (meta.width && meta.width > cfg.maxWidthPx) {
    processed = processed.resize(cfg.maxWidthPx, undefined, { withoutEnlargement: true });
  }

  // Start at quality 85, reduce until target size is met
  let quality = 85;
  let webpBuffer = await processed.webp({ quality }).toBuffer();

  while (webpBuffer.length > cfg.targetKB * 1024 && quality > 30) {
    quality -= 10;
    webpBuffer = await processed.webp({ quality }).toBuffer();
  }

  const filename = `${folder}/${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}.webp`;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filename, webpBuffer, { contentType: "image/webp", upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);

  return { url: urlData.publicUrl, filename, sizeBytes: webpBuffer.length };
}

// ── Avatar (upsert to fixed path) ────────────────────────────────────────────

export async function uploadAvatar(
  buffer: Buffer,
  mimetype: string,
  userId: string
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
    throw new Error(`Unsupported image type: ${mimetype}`);
  }

  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("Avatar exceeds 5MB limit");
  }

  const webpBuffer = await sharp(buffer)
    .rotate()
    .resize(400, 400, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();

  const path = `${userId}/avatar.webp`;

  const { error } = await supabaseAdmin.storage
    .from("avatars")
    .upload(path, webpBuffer, { contentType: "image/webp", upsert: true });

  if (error) throw new Error(`Avatar upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ── Video ────────────────────────────────────────────────────────────────────

const VIDEO_CONFIG = {
  feed: { maxSizeMB: 200, minDurationS: 3,  maxDurationS: 120 },
  chat: { maxSizeMB: 100, minDurationS: 0,  maxDurationS: 60  },
} as const;

export type VideoContext = keyof typeof VIDEO_CONFIG;

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);

// Magic byte detection — MP4 and MOV share ftyp box at offset 4
function detectVideoMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  const ftyp = buffer.toString("ascii", 4, 8);
  if (ftyp !== "ftyp") return null;
  const brand = buffer.toString("ascii", 8, 12);
  if (["isom", "mp42", "avc1", "iso2", "mmp4"].includes(brand)) return "video/mp4";
  if (["qt  ", "M4V ", "M4A "].includes(brand)) return "video/quicktime";
  return "video/mp4"; // fallback for other ftyp brands
}

export interface UploadedVideo {
  storagePath: string;
  bucket: string;
  fallbackUrl: string;
  videoId: string;
}

export async function uploadVideo(
  buffer: Buffer,
  context: VideoContext,
  userId: string
): Promise<UploadedVideo> {
  const detectedMime = detectVideoMime(buffer);
  if (!detectedMime || !ALLOWED_VIDEO_TYPES.has(detectedMime)) {
    throw new Error("Unsupported video format. Only MP4 and MOV are allowed.");
  }

  const cfg = VIDEO_CONFIG[context];
  if (buffer.length > cfg.maxSizeMB * 1024 * 1024) {
    throw new Error(`Video exceeds ${cfg.maxSizeMB}MB limit`);
  }

  const bucket = context === "feed" ? "posts" : "messages";
  const ext = detectedMime === "video/quicktime" ? ".mov" : ".mp4";
  const path = `${userId}/videos/${Date.now()}${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: detectedMime, upsert: false });

  if (error) throw new Error(`Video upload failed: ${error.message}`);

  const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);

  return {
    storagePath: path,
    bucket,
    fallbackUrl: urlData.publicUrl,
    videoId: path,
  };
}
