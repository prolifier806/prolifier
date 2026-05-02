import React, { useEffect, useRef } from "react";
import { AlertCircle, Download } from "lucide-react";
import { useMediaLoader } from "@/hooks/useMediaLoader";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";

interface VideoMessageProps {
  url: string;
  controlsList?: string;
}

export function VideoMessage({ url, controlsList = "nodownload noplaybackrate nopictureinpicture" }: VideoMessageProps) {
  const { state, objectUrl, progress, startDownload, cancelDownload } = useMediaLoader(url, url);

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
  };

  // ── After full download: video player with controls ───────────────────────
  if (state === "loaded" && objectUrl) {
    return (
      <div ref={containerRef} style={{ width: "100%", borderRadius: 10, overflow: "hidden" }}>
        <video
          src={objectUrl}
          controls
          controlsList={controlsList}
          disablePictureInPicture
          className="block w-full bg-black"
          style={{ borderRadius: 10 }}
        />
      </div>
    );
  }

  // ── Restoring from IDB (state=loaded but objectUrl not ready yet) ─────────
  // Don't fire a network request for preload="metadata" — IDB will resolve shortly.
  if (state === "loaded" && !objectUrl) {
    return (
      <div ref={containerRef} style={{ width: "100%", paddingTop: "56.25%", borderRadius: 10, background: "#111" }} />
    );
  }

  // ── Before / during download ──────────────────────────────────────────────
  // Use a plain div placeholder — no <video src> so the browser makes zero
  // network requests, nothing to cancel when this unmounts after download.
  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#111", borderRadius: 10 }} />

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
          /* Idle — download icon (play only appears after full download) */
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 18px rgba(0,0,0,0.55)",
          }}>
            <Download size={22} color="#fff" strokeWidth={2.2} />
          </div>
        )}
      </div>
    </div>
  );
}

