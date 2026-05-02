import React, { useEffect, useRef, useState } from "react";
import { Play, AlertCircle } from "lucide-react";
import { useMediaLoader } from "@/hooks/useMediaLoader";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";

interface VideoMessageProps {
  url: string;
  controlsList?: string;
}

const Placeholder = () => (
  <div style={{
    position: "absolute", inset: 0,
    background: "linear-gradient(135deg, #1c1c2e 0%, #16213e 55%, #0f3460 100%)",
    filter: "blur(10px)",
    transform: "scale(1.12)",
    opacity: 0.96,
  }} />
);

// Every media element shares this rule — container controls size, not media
const MEDIA_FILL: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  background: "#000",
  display: "block",
};

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

  return (
    // Outer wrapper — no explicit height, no aspect-ratio CSS
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 10, background: "#000" }}
    >
      {/* ── Aspect-ratio enforcer: 16:9 = 56.25% ─────────────────────────────
          This div is the ONLY thing that defines container height.
          It is NEVER removed, conditionally styled, or overridden.
          All content is position:absolute so nothing else affects height. */}
      <div style={{ paddingTop: "56.25%", pointerEvents: "none" }} aria-hidden="true" />

      {/* ── Content layer — absolutely fills the spacer ──────────────────── */}
      <div style={{ position: "absolute", inset: 0 }}>

        {/* LOADED */}
        {state === "loaded" && objectUrl && (
          <>
            {playing ? (
              <video
                src={objectUrl}
                controls
                autoPlay
                controlsList={controlsList}
                disablePictureInPicture
                style={MEDIA_FILL}
              />
            ) : (
              /* Thumbnail frame — preload metadata only, no playback */
              <video
                src={objectUrl}
                preload="metadata"
                style={MEDIA_FILL}
              />
            )}

            {/* Play button — shown until user taps play */}
            {!playing && (
              <div
                onClick={handleOverlayClick}
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.22)",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 18px rgba(0,0,0,0.55)",
                }}>
                  <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
                </div>
              </div>
            )}
          </>
        )}

        {/* PLACEHOLDER (idle / downloading / error) */}
        {state !== "loaded" && (
          <>
            <Placeholder />
            <div
              onClick={handleOverlayClick}
              style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 6, cursor: "pointer",
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
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(0,0,0,0.55)",
                  backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 14px rgba(0,0,0,0.5)",
                }}>
                  <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
