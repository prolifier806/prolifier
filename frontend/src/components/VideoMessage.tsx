import React, { useEffect, useRef, useState } from "react";
import { Play, AlertCircle } from "lucide-react";
import { useMediaLoader } from "@/hooks/useMediaLoader";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";

interface VideoMessageProps {
  url: string;
  controlsList?: string;
}

export function VideoMessage({ url, controlsList = "nodownload noplaybackrate nopictureinpicture" }: VideoMessageProps) {
  const { state, objectUrl, progress, startDownload, cancelDownload } = useMediaLoader(url, url);
  const [playing, setPlaying] = useState(false);

  const startRef = useRef(startDownload);
  const cancelRef = useRef(cancelDownload);
  const stateRef = useRef(state);
  useEffect(() => { startRef.current = startDownload; }, [startDownload]);
  useEffect(() => { cancelRef.current = cancelDownload; }, [cancelDownload]);
  useEffect(() => { stateRef.current = state; }, [state]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (stateRef.current === "idle" && shouldAutoDownload()) startRef.current();
        } else {
          if (stateRef.current === "downloading") cancelRef.current();
        }
      },
      { rootMargin: "250px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === "idle" || state === "error") startDownload();
    else if (state === "loaded") setPlaying(true);
  };

  // ── After full download: show real video player ───────────────────────────
  if (state === "loaded" && objectUrl) {
    return (
      <div ref={containerRef} style={{ position: "relative", width: "100%", borderRadius: 10, overflow: "hidden" }}>
        {playing ? (
          <video
            src={objectUrl}
            controls
            autoPlay
            controlsList={controlsList}
            disablePictureInPicture
            className="block w-full bg-black"
            style={{ borderRadius: 10 }}
          />
        ) : (
          <>
            {/* Natural-size thumbnail frame */}
            <video
              src={objectUrl}
              preload="metadata"
              className="block w-full bg-black"
              style={{ borderRadius: 10 }}
            />
            <div
              onClick={handleOverlayClick}
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.22)", cursor: "pointer",
              }}
            >
              <PlayBtn />
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Before / during download ──────────────────────────────────────────────
  // Use preload="metadata" on the original URL so the browser fetches only
  // the video header (dimensions + first frame, typically < 100 KB).
  // This gives us the correct aspect ratio immediately with no layout shift,
  // and we show it blurred with an overlay until the full blob is ready.
  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", borderRadius: 10, overflow: "hidden" }}>
      {/* Thumbnail via metadata — defines container height at true video ratio */}
      <video
        src={url}
        preload="metadata"
        className="block w-full bg-black"
        style={{
          borderRadius: 10,
          filter: "blur(8px)",
          transform: "scale(1.06)",
        }}
      />

      {/* Overlay — click triggers full download */}
      <div
        onClick={handleOverlayClick}
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 6, cursor: "pointer",
          background: "rgba(0,0,0,0.18)",
        }}
      >
        {state === "downloading" ? (
          <>
            <ProgressRing progress={progress} size={56} />
            {progress && (
              <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 11, letterSpacing: 0.2 }}>
                {fmtBytes(progress.loaded)}{progress.total ? ` / ${fmtBytes(progress.total)}` : ""}
              </span>
            )}
          </>
        ) : state === "error" ? (
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(200,40,40,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertCircle size={22} color="#fff" />
          </div>
        ) : (
          <PlayBtn />
        )}
      </div>
    </div>
  );
}

function PlayBtn() {
  return (
    <div style={{
      width: 56, height: 56, borderRadius: "50%",
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 18px rgba(0,0,0,0.55)",
    }}>
      <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
    </div>
  );
}
