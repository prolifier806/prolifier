/**
 * process-video — Supabase Edge Function
 *
 * Triggered by the client immediately after a raw video is uploaded.
 * Runs in Deno on Supabase's edge infrastructure.
 *
 * Flow:
 *   1.  Receive POST { video_id }
 *   2.  Mark row as "processing"
 *   3.  Download raw file from videos-raw bucket
 *   4.  Transcode to 480p / 720p / 1080p using @ffmpeg/ffmpeg (WASM)
 *   5.  Generate HLS playlists + .ts segments for each quality
 *   6.  Build master playlist
 *   7.  Extract thumbnail at t=1s (720px wide, WebP)
 *   8.  Upload all outputs to videos bucket
 *   9.  Update videos row: status=ready, hls_url, thumbnail_url
 *   10. Delete raw file from videos-raw
 *
 * Timeout note:
 *   Supabase free plan: 150 s.  Paid plans: up to 400 s.
 *   Works for videos up to ~30 MB in practice.
 *   For larger files, run this as a dedicated worker (same code, Node + system FFmpeg).
 *
 * Deploy:
 *   supabase functions deploy process-video --no-verify-jwt
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FFmpeg } from "https://esm.sh/@ffmpeg/ffmpeg@0.12.10";
import { fetchFile } from "https://esm.sh/@ffmpeg/util@0.12.1";

// ── Supabase admin client (bypasses RLS) ──────────────────────────────────

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// ── Quality ladder ────────────────────────────────────────────────────────

interface Quality {
  label: string;     // "1080p" | "720p" | "480p"
  height: number;
  videoBitrate: string; // e.g. "4500k"
  audioBitrate: string; // e.g. "128k"
}

const QUALITY_LADDER: Quality[] = [
  { label: "1080p", height: 1080, videoBitrate: "4500k", audioBitrate: "128k" },
  { label: "720p",  height: 720,  videoBitrate: "2500k", audioBitrate: "128k" },
  { label: "480p",  height: 480,  videoBitrate:  "800k", audioBitrate:  "96k" },
];

// ── Helper: run ffmpeg command ────────────────────────────────────────────

async function ffmpegRun(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  await ffmpeg.exec(args);
}

// ── Helper: upload a file from WASM FS → Supabase Storage ─────────────────

async function uploadFromWasm(
  ffmpeg: FFmpeg,
  wasmPath: string,
  bucket: string,
  storagePath: string,
  contentType: string,
): Promise<string> {
  const data = await ffmpeg.readFile(wasmPath);
  const blob = new Blob([data as Uint8Array], { type: contentType });

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, blob, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed (${storagePath}): ${error.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

// ── Helper: pick qualities that fit the source resolution ─────────────────

function selectQualities(srcHeight: number): Quality[] {
  return QUALITY_LADDER.filter(q => q.height <= srcHeight + 50);
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let videoId: string;
  try {
    const body = await req.json();
    videoId = body.video_id;
    if (!videoId) throw new Error("Missing video_id");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }

  // ── 1. Fetch the video record ────────────────────────────────────────────

  const { data: video, error: fetchErr } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single();

  if (fetchErr || !video) {
    return new Response(
      JSON.stringify({ error: fetchErr?.message ?? "Video not found" }),
      { status: 404 },
    );
  }

  if (!video.raw_path) {
    return new Response(JSON.stringify({ error: "raw_path not set" }), { status: 400 });
  }

  // ── 2. Mark as processing ────────────────────────────────────────────────

  await supabase
    .from("videos")
    .update({ status: "processing" })
    .eq("id", videoId);

  try {
    // ── 3. Download raw file from its public fallback URL ────────────────
    //    The client uploads to the `posts` or `messages` bucket (public),
    //    and stores that URL as fallback_url. We fetch it directly.

    if (!video.fallback_url) throw new Error("fallback_url not set on video row");

    const rawResponse = await fetch(video.fallback_url);
    if (!rawResponse.ok) throw new Error(`Download failed: HTTP ${rawResponse.status}`);
    const rawBuffer = await rawResponse.arrayBuffer();

    const rawBytes = new Uint8Array(rawBuffer);

    // ── 4. Init FFmpeg WASM ──────────────────────────────────────────────

    const ffmpeg = new FFmpeg();

    // Load WASM core from jsDelivr CDN (cached by Deno Deploy's edge)
    await ffmpeg.load({
      coreURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
      wasmURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
    });

    // Write input to WASM virtual FS
    await ffmpeg.writeFile("input.mp4", rawBytes);

    // ── 5. Extract thumbnail at t=1s ─────────────────────────────────────

    await ffmpegRun(ffmpeg, [
      "-i", "input.mp4",
      "-ss", "00:00:01",
      "-vframes", "1",
      "-vf", "scale=720:-1",
      "-q:v", "80",
      "thumb.webp",
    ]);

    const thumbPath = `${videoId}/thumb.webp`;
    const thumbnailUrl = await uploadFromWasm(ffmpeg, "thumb.webp", "videos", thumbPath, "image/webp");

    // ── 6. Get source dimensions ─────────────────────────────────────────
    //    We probe by reading the raw file's metadata via ffprobe output.
    //    Since ffprobe isn't separately available, we use the dimensions
    //    already stored on the row (set by the client during validation).

    const srcHeight: number = video.height ?? 1080;

    const qualities = selectQualities(srcHeight);
    const playlistPaths: { label: string; m3u8Url: string; bandwidth: number; resolution: string }[] = [];

    // ── 7. Transcode each quality ────────────────────────────────────────

    for (const q of qualities) {
      // Calculate scaled width (keep aspect ratio, even width)
      const scale = `scale=-2:${q.height}`;
      const segPattern = `${q.label}_%04d.ts`;
      const m3u8Name   = `${q.label}.m3u8`;

      await ffmpegRun(ffmpeg, [
        "-i", "input.mp4",
        "-vf", scale,
        "-c:v", "libx264",
        "-preset", "fast",
        "-profile:v", "high",
        "-level", "4.0",
        "-b:v", q.videoBitrate,
        "-maxrate", q.videoBitrate,
        "-bufsize", (parseInt(q.videoBitrate) * 2) + "k",
        "-c:a", "aac",
        "-b:a", q.audioBitrate,
        "-ar", "44100",
        "-hls_time", "6",
        "-hls_list_size", "0",
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", segPattern,
        "-f", "hls",
        m3u8Name,
      ]);

      // Upload .m3u8
      const m3u8Data = await ffmpeg.readFile(m3u8Name);
      const m3u8Blob = new Blob([m3u8Data as Uint8Array], { type: "application/vnd.apple.mpegurl" });
      const m3u8StorePath = `${videoId}/${q.label}/${m3u8Name}`;
      await supabase.storage.from("videos").upload(m3u8StorePath, m3u8Blob, {
        contentType: "application/vnd.apple.mpegurl",
        upsert: true,
      });

      // Upload .ts segments
      // List all files in WASM FS that match the pattern
      const files = await ffmpeg.listDir("/");
      const segments = (files as Array<{ name: string; isDir: boolean }>)
        .filter(f => !f.isDir && f.name.startsWith(`${q.label}_`) && f.name.endsWith(".ts"));

      for (const seg of segments) {
        const segData = await ffmpeg.readFile(seg.name);
        const segBlob = new Blob([segData as Uint8Array], { type: "video/MP2T" });
        await supabase.storage.from("videos").upload(
          `${videoId}/${q.label}/${seg.name}`,
          segBlob,
          { contentType: "video/MP2T", upsert: true },
        );
        // Clean up WASM FS to save memory
        await ffmpeg.deleteFile(seg.name);
      }

      // Rewrite the m3u8 to use absolute CDN URLs for segments
      const m3u8Text = new TextDecoder().decode(m3u8Data as Uint8Array);
      const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/videos/${videoId}/${q.label}/`;
      const rewrittenM3u8 = m3u8Text
        .split("\n")
        .map(line => line.endsWith(".ts") ? baseUrl + line.trim() : line)
        .join("\n");

      // Re-upload rewritten m3u8
      const rewrittenBlob = new Blob([rewrittenM3u8], { type: "application/vnd.apple.mpegurl" });
      await supabase.storage.from("videos").upload(m3u8StorePath, rewrittenBlob, {
        contentType: "application/vnd.apple.mpegurl",
        upsert: true,
      });

      const { data: m3u8UrlData } = supabase.storage.from("videos").getPublicUrl(m3u8StorePath);

      const bitrateNum = parseInt(q.videoBitrate) * 1000;
      playlistPaths.push({
        label: q.label,
        m3u8Url: m3u8UrlData.publicUrl,
        bandwidth: bitrateNum,
        resolution: q.height === 1080 ? "1920x1080" : q.height === 720 ? "1280x720" : "854x480",
      });

      // Clean up WASM FS
      await ffmpeg.deleteFile(m3u8Name);
    }

    // ── 8. Build master playlist ─────────────────────────────────────────

    const masterLines = ["#EXTM3U", "#EXT-X-VERSION:3", ""];
    for (const p of playlistPaths) {
      masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${p.resolution},NAME="${p.label}"`);
      masterLines.push(p.m3u8Url);
      masterLines.push("");
    }
    const masterM3u8 = masterLines.join("\n");
    const masterBlob = new Blob([masterM3u8], { type: "application/vnd.apple.mpegurl" });
    const masterPath = `${videoId}/master.m3u8`;

    await supabase.storage.from("videos").upload(masterPath, masterBlob, {
      contentType: "application/vnd.apple.mpegurl",
      upsert: true,
    });
    const { data: masterUrlData } = supabase.storage.from("videos").getPublicUrl(masterPath);

    // ── 9. Update videos row ─────────────────────────────────────────────

    await supabase
      .from("videos")
      .update({
        status: "ready",
        hls_url: masterUrlData.publicUrl,
        thumbnail_url: thumbnailUrl,
        width: video.width,
        height: video.height,
        duration_secs: video.duration_secs,
        raw_path: null, // free reference (actual file still in storage for now)
      })
      .eq("id", videoId);

    // ── 10. Optionally delete raw file ───────────────────────────────────
    //  Uncomment when you're confident processing always succeeds:
    // await supabase.storage.from("videos-raw").remove([video.raw_path]);

    return new Response(
      JSON.stringify({ success: true, video_id: videoId, hls_url: masterUrlData.publicUrl }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    console.error("process-video error:", err);

    // Mark as failed in DB
    await supabase
      .from("videos")
      .update({ status: "failed", error_msg: err.message ?? "Unknown error" })
      .eq("id", videoId);

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
