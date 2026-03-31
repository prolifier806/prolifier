/**
 * videoProcessor.ts
 *
 * Browser-side video validation + chunked XHR upload (with progress) +
 * status polling for server-side processing results.
 *
 * Context    Soft limit   Hard limit   Max duration   Min duration
 * ─────────  ──────────   ──────────   ────────────   ────────────
 * feed       50 MB        200 MB       120 s          3 s
 * chat       20 MB        100 MB       60 s           —
 *
 * Processing happens in the `process-video` Supabase Edge Function.
 * This module only handles client responsibilities:
 *   1. MIME detection via magic bytes (not just extension)
 *   2. File size guard
 *   3. Duration guard via HTMLVideoElement
 *   4. XHR upload with real progress events
 *   5. Poll `videos` table for ready / failed status
 */

export type VideoContext = "feed" | "chat";

export interface VideoMeta {
  duration: number;  // seconds (float)
  width: number;
  height: number;
  mimeType: "video/mp4" | "video/quicktime"; // detected from bytes
}

export interface VideoRecord {
  id: string;
  status: "uploading" | "processing" | "ready" | "failed";
  hls_url: string | null;
  fallback_url: string | null; // public URL of raw MP4 (always set)
  thumbnail_url: string | null;
  duration_secs: number | null;
  width: number | null;
  height: number | null;
  error_msg: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────

const CONFIG = {
  feed: {
    softLimit:   50 * 1024 * 1024,
    hardLimit:  200 * 1024 * 1024,
    maxDuration: 120,
    minDuration: 3,
  },
  chat: {
    softLimit:   20 * 1024 * 1024,
    hardLimit:  100 * 1024 * 1024,
    maxDuration: 60,
    minDuration: undefined,
  },
} satisfies Record<VideoContext, {
  softLimit: number; hardLimit: number;
  maxDuration: number; minDuration: number | undefined;
}>;

// ── MIME detection via magic bytes ────────────────────────────────────────

/**
 * Read the first 12 bytes of the file and detect MP4 / MOV by the ftyp box.
 * Throws if the format is not supported.
 */
async function detectMime(file: File): Promise<"video/mp4" | "video/quicktime"> {
  const buf = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(buf);

  // ISO base media: bytes 4–7 must be "ftyp"
  const marker = String.fromCharCode(b[4], b[5], b[6], b[7]);
  if (marker === "ftyp") {
    // Brand (bytes 8–11) identifies the specific flavour
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
      .replace(/\0/g, "")
      .trim()
      .toLowerCase();

    // QuickTime / MOV brands
    if (brand === "qt  " || brand === "qt" || brand === "moov") {
      return "video/quicktime";
    }
    // Everything else under ftyp is treated as MP4
    return "video/mp4";
  }

  // Some MP4s start with a mdat/moov box before ftyp
  // Check for "moov" or "mdat" at offset 4
  const boxType = String.fromCharCode(b[4], b[5], b[6], b[7]);
  if (boxType === "moov" || boxType === "mdat" || boxType === "wide") {
    return "video/mp4";
  }

  throw new Error(
    "Unsupported video format. Please use MP4 or MOV."
  );
}

// ── Duration + dimensions via HTMLVideoElement ────────────────────────────

function readVideoMeta(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read video metadata — file may be corrupted."));
    };
    video.src = url;
  });
}

// ── Public: validate ──────────────────────────────────────────────────────

/**
 * Validates format, size, and duration.
 * Throws a user-readable Error on any failure.
 * Returns metadata on success.
 */
export async function validateVideo(file: File, context: VideoContext): Promise<VideoMeta> {
  const cfg = CONFIG[context];

  // 1. Hard size limit — fastest check, no I/O
  if (file.size > cfg.hardLimit) {
    const mb = Math.round(cfg.hardLimit / 1024 / 1024);
    throw new Error(`Video too large (max ${mb} MB). Please choose a smaller file.`);
  }

  // 2. MIME type via magic bytes
  const mimeType = await detectMime(file);

  // 3. Duration + dimensions
  const meta = await readVideoMeta(file);

  // 4. Duration bounds
  if (cfg.minDuration != null && meta.duration < cfg.minDuration) {
    throw new Error(`Video too short (minimum ${cfg.minDuration} seconds).`);
  }
  if (meta.duration > cfg.maxDuration) {
    const max = cfg.maxDuration;
    const label = max >= 60 ? `${max / 60} minute${max / 60 !== 1 ? "s" : ""}` : `${max} seconds`;
    throw new Error(`Video too long (maximum ${label}).`);
  }

  return { duration: meta.duration, width: meta.width, height: meta.height, mimeType };
}

// ── Public: upload with progress ──────────────────────────────────────────

/**
 * Upload `file` to Supabase Storage at `bucket/path` using XHR so we get
 * real upload-progress events.  The caller owns the progress callback.
 *
 * Requires the caller to pass the Supabase URL, anon key, and the current
 * user's access token (from `supabase.auth.getSession()`).
 */
export function uploadVideoXHR(opts: {
  file: File;
  bucket: string;
  path: string;
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  onProgress: (pct: number) => void;
}): Promise<void> {
  const { file, bucket, path, supabaseUrl, anonKey, accessToken, onProgress } = opts;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.message) msg = body.message;
        } catch { /* non-JSON response */ }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed — network error. Please retry."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    xhr.send(file);
  });
}

// ── Public: status polling ────────────────────────────────────────────────

/**
 * Poll the `videos` table every 2 s until the video reaches `ready` or
 * `failed`, or until `timeoutMs` elapses.
 *
 * `onUpdate` is called on every poll with the latest row.
 */
export async function pollVideoStatus(
  videoId: string,
  onUpdate: (record: VideoRecord) => void,
  timeoutMs = 300_000,
): Promise<void> {
  const { supabase } = await import("@/lib/supabase");
  const deadline = Date.now() + timeoutMs;

  const tick = async (): Promise<void> => {
    if (Date.now() > deadline) {
      onUpdate({
        id: videoId,
        status: "failed",
        hls_url: null,
        fallback_url: null,
        thumbnail_url: null,
        duration_secs: null,
        width: null,
        height: null,
        error_msg: "Processing timed out — please retry.",
      });
      return;
    }

    const { data, error } = await (supabase as any)
      .from("videos")
      .select("id, status, hls_url, fallback_url, thumbnail_url, duration_secs, width, height, error_msg")
      .eq("id", videoId)
      .single();

    if (error || !data) {
      // Transient DB error — retry
      await delay(3000);
      return tick();
    }

    onUpdate(data as VideoRecord);

    if (data.status === "uploading" || data.status === "processing") {
      await delay(2000);
      return tick();
    }
    // ready or failed → done
  };

  await tick();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Sanitize filename ─────────────────────────────────────────────────────

/**
 * Returns a storage-safe filename with timestamp. Always ends in .mp4
 * (MOV files will be transcoded to MP4 by the edge function).
 */
export function sanitizeVideoFilename(original: string): string {
  const base = original
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  return `${base}_${Date.now()}.mp4`;
}
