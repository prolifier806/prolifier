import React, { useEffect, useRef } from "react";
import { Download, AlertCircle } from "lucide-react";
import { useMediaLoader } from "@/hooks/useMediaLoader";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";

interface MediaMessageProps {
  /** Supabase storage URL — used as both fileId and download URL */
  url: string;
  /** Called when clicking an already-loaded image (lightbox) */
  onClick?: () => void;
  /**
   * fill = true: image fills a parent container with explicit dimensions.
   * fill = false (default): width 100% with fixed 4:3 aspect ratio.
   */
  fill?: boolean;
}

// Blurred gradient placeholder — zero bandwidth cost
const Placeholder = () => (
  <div style={{
    position: "absolute", inset: 0,
    background: "linear-gradient(135deg, #1c1c2e 0%, #16213e 55%, #0f3460 100%)",
    filter: "blur(10px)",
    transform: "scale(1.12)",
    opacity: 0.96,
  }} />
);

export function MediaMessage({ url, onClick, fill = false }: MediaMessageProps) {
  const { state, objectUrl, progress, startDownload, cancelDownload } = useMediaLoader(url, url);

  // Keep latest callbacks in refs so the observer never captures stale closures
  const startRef = useRef(startDownload);
  const cancelRef = useRef(cancelDownload);
  const stateRef = useRef(state);
  useEffect(() => { startRef.current = startDownload; }, [startDownload]);
  useEffect(() => { cancelRef.current = cancelDownload; }, [cancelDownload]);
  useEffect(() => { stateRef.current = state; }, [state]);

  const containerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver — auto-trigger when visible + user pref allows
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (stateRef.current === "idle" && shouldAutoDownload()) {
            startRef.current();
          }
        } else {
          // Scrolled away while downloading — release slot for other items
          if (stateRef.current === "downloading") {
            cancelRef.current();
          }
        }
      },
      { rootMargin: "250px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []); // intentionally empty — refs keep values fresh

  const handleClick = () => {
    if (state === "idle" || state === "error") {
      startDownload();
    } else if (state === "loaded") {
      onClick?.();
    }
  };

  const containerStyle: React.CSSProperties = fill
    ? { position: "relative", width: "100%", height: "100%", overflow: "hidden" }
    : {
        position: "relative",
        width: "100%",
        aspectRatio: "4/3",
        overflow: "hidden",
        borderRadius: 10,
        background: "#111",
      };

  return (
    <div
      ref={containerRef}
      style={{ ...containerStyle, cursor: state === "loaded" && onClick ? "pointer" : state !== "loaded" ? "pointer" : "default" }}
      onClick={handleClick}
    >
      {/* ── LOADED ─────────────────────────────────────── */}
      {state === "loaded" && objectUrl && (
        <img
          src={objectUrl}
          alt=""
          style={{
            width: "100%",
            height: fill ? "100%" : "auto",
            objectFit: fill ? "cover" : undefined,
            display: "block",
          }}
          draggable={false}
        />
      )}

      {/* ── PLACEHOLDER (idle / downloading / error) ───── */}
      {state !== "loaded" && (
        <>
          <Placeholder />

          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 6,
          }}>
            {state === "downloading" ? (
              <>
                <ProgressRing progress={progress} />
                {progress && (
                  <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 11, letterSpacing: 0.2 }}>
                    {fmtBytes(progress.loaded)}
                    {progress.total ? ` / ${fmtBytes(progress.total)}` : ""}
                  </span>
                )}
              </>
            ) : state === "error" ? (
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(200,40,40,0.65)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertCircle size={20} color="#fff" />
              </div>
            ) : (
              /* Idle — download icon */
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 14px rgba(0,0,0,0.45)",
              }}>
                <Download size={20} color="#fff" strokeWidth={2.2} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
