/**
 * VideoPlayer.tsx
 *
 * Adaptive HLS video player with native fallback.
 *
 * Priority:
 *   1. HLS via hls.js (Chrome / Firefox / Android)
 *   2. HLS via native (Safari / iOS — supports HLS natively)
 *   3. Direct MP4 fallback (when HLS not yet ready or processing failed)
 *
 * Install: npm install hls.js
 * Types:   npm install -D @types/hls.js
 */

import { useEffect, useRef, useState } from "react";

interface VideoPlayerProps {
  /** Master HLS playlist URL (.m3u8). If null, falls back to `fallbackSrc`. */
  hlsSrc: string | null;
  /** Direct MP4 URL — always served while video processes, and as permanent fallback. */
  fallbackSrc: string | null;
  /** WebP / JPEG thumbnail shown before playback. */
  poster?: string | null;
  className?: string;
  /** Compact mode for chat bubbles */
  compact?: boolean;
}

export default function VideoPlayer({
  hlsSrc,
  fallbackSrc,
  poster,
  className = "",
  compact = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<unknown>(null); // hls.js instance
  const [quality, setQuality] = useState<string>("Auto");
  const [levels, setLevels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);

    // ── Path 1: No HLS available — use raw MP4 ────────────────────────────
    if (!hlsSrc) {
      if (fallbackSrc) video.src = fallbackSrc;
      return;
    }

    // ── Path 2: Browser natively supports HLS (Safari) ────────────────────
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsSrc;
      return;
    }

    // ── Path 3: Load hls.js dynamically ──────────────────────────────────
    let destroyed = false;

    (async () => {
      try {
        const { default: Hls } = await import("hls.js");

        if (destroyed) return;

        if (!Hls.isSupported()) {
          // Last resort: try direct MP4
          if (fallbackSrc) video.src = fallbackSrc;
          return;
        }

        const hls = new Hls({
          // Start on the lowest quality to reduce initial buffer time
          startLevel: -1, // auto
          // Cap max buffer to 30 s to keep memory reasonable
          maxBufferLength: 30,
          // Aggressive quality switching for mobile networks
          abrEwmaFastLive: 3,
          abrEwmaSlowLive: 9,
        });

        hlsRef.current = hls;

        hls.loadSource(hlsSrc);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event: unknown, data: { levels: Array<{ height: number }> }) => {
          if (destroyed) return;
          const qualityLabels = data.levels.map((l: { height: number }) => `${l.height}p`);
          setLevels(["Auto", ...qualityLabels]);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event: unknown, data: { level: number }) => {
          if (destroyed || !hls) return;
          // @ts-expect-error hls.levels type varies by version
          const lvl = hls.levels?.[data.level];
          if (lvl) setQuality(`${lvl.height}p`);
        });

        hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal: boolean; details: string }) => {
          if (destroyed) return;
          if (data.fatal) {
            setError("Playback error — trying fallback.");
            if (fallbackSrc) video.src = fallbackSrc;
          }
        });
      } catch {
        // hls.js not installed or failed to load
        if (!destroyed && fallbackSrc) video.src = fallbackSrc;
      }
    })();

    return () => {
      destroyed = true;
      // @ts-expect-error hlsRef dynamic
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [hlsSrc, fallbackSrc]);

  // ── Quality change ────────────────────────────────────────────────────────
  const handleQualityChange = (label: string) => {
    setQuality(label);
    // @ts-expect-error hlsRef dynamic
    const hls = hlsRef.current;
    if (!hls) return;
    if (label === "Auto") {
      hls.currentLevel = -1;
    } else {
      // @ts-expect-error hls.levels
      const idx = hls.levels?.findIndex((l: { height: number }) => `${l.height}p` === label);
      if (idx != null && idx >= 0) hls.currentLevel = idx;
    }
  };

  const wrapClass = compact
    ? "relative rounded-2xl overflow-hidden bg-black"
    : "relative rounded-xl overflow-hidden bg-black";

  return (
    <div className={`${wrapClass} ${className}`}>
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className={compact ? "max-w-full max-h-56 w-full" : "w-full max-h-[70vh] object-contain"}
      />

      {/* Quality selector — only shown when hls.js loaded multiple levels */}
      {!compact && levels.length > 1 && (
        <div className="absolute top-2 right-2">
          <select
            value={quality}
            onChange={(e) => handleQualityChange(e.target.value)}
            className="bg-black/60 text-white text-xs rounded px-1.5 py-0.5 border-0 outline-none cursor-pointer"
          >
            {levels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="absolute bottom-2 left-2 text-[10px] text-red-400 bg-black/60 px-2 py-0.5 rounded">
          {error}
        </p>
      )}
    </div>
  );
}
