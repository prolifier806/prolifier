import React, { useEffect, useRef, useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import { useMediaLoader } from "@/hooks/useMediaLoader";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";

interface MediaMessageProps {
  url: string;
  onClick?: () => void;
  /** fill=true: image fills a parent container with explicit dimensions (MediaCollage cells) */
  fill?: boolean;
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

function Overlay({
  state,
  progress,
}: {
  state: "idle" | "downloading" | "error";
  progress: { loaded: number; total: number } | null;
}) {
  return (
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
              {fmtBytes(progress.loaded)}{progress.total ? ` / ${fmtBytes(progress.total)}` : ""}
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
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 14px rgba(0,0,0,0.45)",
        }}>
          <Download size={20} color="#fff" strokeWidth={2.2} />
        </div>
      )}
    </div>
  );
}

export function MediaMessage({ url, onClick, fill = false }: MediaMessageProps) {
  const { state, objectUrl, progress, startDownload, cancelDownload } = useMediaLoader(url, url);
  // Portrait detection — matches original Groups ImageMsg behaviour
  const [portrait, setPortrait] = useState(false);

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

  const handleClick = () => {
    if (state === "idle" || state === "error") startDownload();
    else if (state === "loaded") onClick?.();
  };

  // ── FILL MODE (MediaCollage fixed-height cells) ───────────────────────────
  if (fill) {
    return (
      <div
        ref={containerRef}
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "pointer" }}
        onClick={handleClick}
      >
        {state === "loaded" && objectUrl ? (
          <img
            src={objectUrl}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            draggable={false}
          />
        ) : (
          <Placeholder />
        )}
        {state !== "loaded" && <Overlay state={state as any} progress={progress} />}
      </div>
    );
  }

  // ── DEFAULT MODE ──────────────────────────────────────────────────────────
  //
  // LOADED: image at natural size — width 100%, height auto.
  // Portrait images (taller than 1.2× width) are cropped to 3:4,
  // exactly matching the original Groups ImageMsg behaviour.
  //
  // NOT LOADED: placeholder with 4:3 spacer so the chat doesn't collapse
  // to zero height while waiting. Spacer is removed once the real image
  // renders, so final size is always the image's natural dimensions.

  if (state === "loaded" && objectUrl) {
    return (
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          overflow: "hidden",
          borderRadius: 10,
          cursor: onClick ? "pointer" : "default",
        }}
        onClick={handleClick}
      >
        <img
          src={objectUrl}
          alt=""
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            // Portrait crop — same as original
            aspectRatio: portrait ? "3/4" : undefined,
            objectFit: portrait ? "cover" : undefined,
            objectPosition: portrait ? "center top" : undefined,
          }}
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget;
            setPortrait(img.naturalHeight > img.naturalWidth * 1.2);
          }}
        />
      </div>
    );
  }

  // Placeholder — 4:3 spacer keeps a reasonable slot in chat while loading
  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 10, cursor: "pointer" }}
      onClick={handleClick}
    >
      {/* Aspect-ratio spacer — only present while not yet loaded */}
      <div style={{ paddingTop: "75%", pointerEvents: "none" }} aria-hidden="true" />
      <div style={{ position: "absolute", inset: 0 }}>
        <Placeholder />
        <Overlay state={state as any} progress={progress} />
      </div>
    </div>
  );
}
