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

import React, { useEffect, useRef, useState } from "react";

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
  onPortrait?: (isPortrait: boolean) => void;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}

export default function VideoPlayer({
  hlsSrc,
  fallbackSrc,
  poster,
  className = "",
  compact = false,
  onPortrait,
  videoRef: externalRef,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [portrait, setPortrait] = useState(false);
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

  return (
    <div className={`relative ${compact ? "rounded-2xl" : "rounded-xl"} overflow-hidden bg-black ${className}`}>
      <video
        ref={el => { (videoRef as any).current = el; if (externalRef) externalRef.current = el; }}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        disablePictureInPicture
        controlsList="nodownload nopictureinpicture noplaybackrate"
        className={compact
          ? "max-w-full max-h-56 w-full"
          : portrait
            ? "max-h-[70vh] w-auto mx-auto block"
            : "w-full max-h-[70vh] object-contain"
        }
        onLoadedMetadata={e => {
          const v = e.currentTarget;
          const isPortrait = v.videoHeight > v.videoWidth;
          setPortrait(isPortrait);
          onPortrait?.(isPortrait);
        }}
      />

      {error && (
        <p className="absolute bottom-2 left-2 text-[10px] text-red-400 bg-black/60 px-2 py-0.5 rounded">
          {error}
        </p>
      )}
    </div>
  );
}
