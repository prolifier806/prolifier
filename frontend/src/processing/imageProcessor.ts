/**
 * imageProcessor.ts
 *
 * Browser-side image validation, compression, resize, and WebP conversion.
 * All processing is async via Canvas API — non-blocking for UI.
 *
 * Context       Soft limit   Hard limit   Max width   Target size
 * ─────────     ──────────   ──────────   ─────────   ──────────────
 * feed          5 MB         20 MB        1080 px     200 KB – 500 KB
 * chat          3 MB         20 MB         800 px     100 KB – 300 KB
 */

export type ImageContext = "feed" | "chat";

export interface ProcessedImage {
  blob: Blob;
  /** Sanitized, timestamped filename — always ends in .webp */
  filename: string;
  /** Final size in bytes after compression */
  sizeBytes: number;
  /** Width × height of the final image */
  width: number;
  height: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  "image/webp",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/tif",
  "image/svg+xml",
]);
const HARD_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB

const CONFIG = {
  feed: { softLimit: 5 * 1024 * 1024, maxWidth: 1080, targetMin: 200_000, targetMax: 500_000 },
  chat: { softLimit: 3 * 1024 * 1024, maxWidth: 800,  targetMin: 100_000, targetMax: 300_000 },
} satisfies Record<ImageContext, { softLimit: number; maxWidth: number; targetMin: number; targetMax: number }>;

// ── Validation ────────────────────────────────────────────────────────────

export function validateImage(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Unsupported file format. Please use a photo (JPEG, PNG, WebP, HEIC, GIF, etc.).");
  }
  if (file.size > HARD_LIMIT_BYTES) {
    throw new Error("File too large (max 20 MB). Please choose a smaller image.");
  }
}

// ── Core processing ───────────────────────────────────────────────────────

/**
 * Load a File into an HTMLImageElement (returns natural dimensions too).
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to decode image.")); };
    img.src = url;
  });
}

/**
 * Render image onto a canvas at the given target dimensions.
 */
function drawToCanvas(img: HTMLImageElement, targetW: number, targetH: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width  = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  // Smooth downscaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas;
}

/**
 * Encode canvas → WebP Blob, iterating quality until the result
 * falls within [targetMin, targetMax].  Stops after 6 iterations.
 */
async function encodeWebP(
  canvas: HTMLCanvasElement,
  targetMin: number,
  targetMax: number,
): Promise<Blob> {
  let lo = 0.3, hi = 0.92, quality = 0.82;
  let blob: Blob | null = null;

  for (let i = 0; i < 6; i++) {
    blob = await canvasToBlob(canvas, quality);
    if (!blob) break;
    if (blob.size < targetMin && quality < hi) {
      lo = quality;
      quality = Math.min(hi, quality + (hi - quality) * 0.5);
    } else if (blob.size > targetMax && quality > lo) {
      hi = quality;
      quality = Math.max(lo, quality - (quality - lo) * 0.5);
    } else {
      break;
    }
  }

  if (!blob) throw new Error("Upload failed, try again.");
  return blob;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("Canvas encoding failed.")),
      "image/webp",
      quality,
    );
  });
}

// ── Sanitize filename ─────────────────────────────────────────────────────

function sanitizeFilename(original: string): string {
  // Strip extension, keep only safe chars, add timestamp + .webp
  const base = original
    .replace(/\.[^.]+$/, "")          // remove extension
    .replace(/[^a-zA-Z0-9_-]/g, "_") // replace unsafe chars
    .slice(0, 40);                    // max 40 chars
  return `${base}_${Date.now()}.webp`;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Full pipeline: validate → resize → compress → encode WebP.
 *
 * Throws a user-readable Error on validation failure.
 * All CPU work happens async on the main thread via Canvas API.
 */
export async function processImage(
  file: File,
  context: ImageContext,
): Promise<ProcessedImage> {
  // 1. Validate type + hard size limit
  validateImage(file);

  const cfg = CONFIG[context];

  // 2. Load image into DOM element to get natural dimensions
  const img = await loadImage(file);

  // 3. Compute output dimensions — cap width, maintain aspect ratio
  const { naturalWidth: nw, naturalHeight: nh } = img;
  const scale = nw > cfg.maxWidth ? cfg.maxWidth / nw : 1;
  const targetW = Math.round(nw * scale);
  const targetH = Math.round(nh * scale);

  // 4. Determine whether to compress
  //    - Always convert to WebP
  //    - Only resize/compress if > soft limit OR image is larger than target width
  const needsCompression = file.size > cfg.softLimit || nw > cfg.maxWidth;

  let finalBlob: Blob;

  if (needsCompression || file.type !== "image/webp") {
    // Draw at target dimensions
    const canvas = drawToCanvas(img, targetW, targetH);
    // Encode — binary-search quality to hit target size range
    finalBlob = await encodeWebP(canvas, cfg.targetMin, cfg.targetMax);
  } else {
    // Already WebP and small enough — re-encode at high quality to standardise
    const canvas = drawToCanvas(img, targetW, targetH);
    finalBlob = await encodeWebP(canvas, cfg.targetMin, cfg.targetMax);
  }

  return {
    blob: finalBlob,
    filename: sanitizeFilename(file.name),
    sizeBytes: finalBlob.size,
    width: targetW,
    height: targetH,
  };
}
