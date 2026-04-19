/**
 * VideoPlayer.tsx
 *
 * Adaptive HLS video player with native fallback.
 * No npm dependency — hls.js is loaded from CDN at runtime via a <script> tag
 * so the Vite/Rollup build never needs to resolve it.
 *
 * Priority:
 *   1. HLS via hls.js CDN (Chrome / Firefox / Android)
 *   2. HLS via native (Safari / iOS — supports HLS natively)
 *   3. Direct MP4 fallback (when HLS not yet ready or processing failed)
 */

import { useEffect, useRef, useState } from "react";

// ── Load hls.js from CDN once per page (idempotent) ──────────────────────────
const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
let hlsScriptLoaded = false;
let hlsScriptLoading = false;
const hlsReadyCallbacks: Array<() => void> = [];

function loadHlsScript(onReady: () => void) {
  if (hlsScriptLoaded) { onReady(); return; }
  hlsReadyCallbacks.push(onReady);
  if (hlsScriptLoading) return;
  hlsScriptLoading = true;
  const s = document.createElement("script");
  s.src = HLS_CDN;
  s.async = true;
  s.onload = () => {
    hlsScriptLoaded = true;
    hlsScriptLoading = false;
    hlsReadyCallbacks.forEach(cb => cb());
    hlsReadyCallbacks.length = 0;
  };
  s.onerror = () => {
    hlsScriptLoading = false;
    hlsReadyCallbacks.length = 0; // let callers fall back to MP4
  };
  document.head.appendChild(s);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface VideoPlayerProps {
  hlsSrc: string | null;
  fallbackSrc: string | null;
  poster?: string | null;
  className?: string;
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
  const hlsRef = useRef<any>(null);
  const [quality, setQuality] = useState<string>("Auto");
  const [levels, setLevels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);

    // Path 1: No HLS URL yet — play raw MP4 immediately
    if (!hlsSrc) {
      if (fallbackSrc) video.src = fallbackSrc;
      return;
    }

    // Path 2: Safari / iOS — native HLS support
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsSrc;
      return;
    }

    // Path 3: Load hls.js from CDN, then attach
    let destroyed = false;

    const attachHls = () => {
      if (destroyed) return;
      const Hls = (window as any).Hls;
      if (!Hls || !Hls.isSupported()) {
        if (fallbackSrc) video.src = fallbackSrc;
        return;
      }

      const hls = new Hls({ startLevel: -1, maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(hlsSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_: unknown, data: { levels: Array<{ height: number }> }) => {
        if (destroyed) return;
        setLevels(["Auto", ...data.levels.map((l: { height: number }) => `${l.height}p`)]);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_: unknown, data: { level: number }) => {
        if (destroyed) return;
        const lvl = hls.levels?.[data.level];
        if (lvl) setQuality(`${lvl.height}p`);
      });

      hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
        if (destroyed || !data.fatal) return;
        setError("Playback error — using fallback.");
        if (fallbackSrc) video.src = fallbackSrc;
      });
    };

    loadHlsScript(attachHls);

    return () => {
      destroyed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [hlsSrc, fallbackSrc]);

  const handleQualityChange = (label: string) => {
    setQuality(label);
    const hls = hlsRef.current;
    if (!hls) return;
    if (label === "Auto") {
      hls.currentLevel = -1;
    } else {
      const idx = hls.levels?.findIndex((l: { height: number }) => `${l.height}p` === label);
      if (idx != null && idx >= 0) hls.currentLevel = idx;
    }
  };

  return (
    <div className={`relative ${compact ? "rounded-2xl" : "rounded-xl"} overflow-hidden bg-black ${className}`}>
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        disablePictureInPicture
        controlsList="nodownload nopictureinpicture noplaybackrate"
        className={compact ? "max-w-full max-h-56 w-full" : "w-full max-h-[70vh] object-contain"}
      />

      {!compact && levels.length > 1 && (
        <div className="absolute top-2 right-2">
          <select
            value={quality}
            onChange={e => handleQualityChange(e.target.value)}
            className="bg-black/60 text-white text-xs rounded px-1.5 py-0.5 border-0 outline-none cursor-pointer"
          >
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
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
