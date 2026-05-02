import React, { useEffect, useRef } from "react";
import { Download, AlertCircle } from "lucide-react";
import { useMediaLoader } from "@/hooks/useMediaLoader";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";

interface MediaMessageProps {
  url: string;
  onClick?: () => void;
  /** fill=true — image fills a parent container with explicit dimensions (MediaCollage cells) */
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

// Shared style for every media element — NEVER let media control layout size
const MEDIA_FILL: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

export function MediaMessage({ url, onClick, fill = false }: MediaMessageProps) {
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

  const handleClick = () => {
    if (state === "idle" || state === "error") startDownload();
    else if (state === "loaded") onClick?.();
  };

  // ── FILL MODE (MediaCollage cells already have explicit px dimensions) ──────
  if (fill) {
    return (
      <div
        ref={containerRef}
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "pointer" }}
        onClick={handleClick}
      >
        {state === "loaded" && objectUrl
          ? <img src={objectUrl} alt="" style={MEDIA_FILL} draggable={false} />
          : <Placeholder />
        }
        {state !== "loaded" && <Overlay state={state} progress={progress} />}
      </div>
    );
  }

  // ── DEFAULT MODE — padding-top spacer locks 4:3 with zero layout shift ──────
  //
  // Container has NO explicit height and NO aspect-ratio CSS property.
  // The spacer div (paddingTop: 75%) forces exactly the right height via
  // the block formatting context — works in all browsers without exception.
  // All content layers are position:absolute so they never influence height.
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        borderRadius: 10,
        background: "#111",
        cursor: state === "loaded" && onClick ? "pointer" : state !== "loaded" ? "pointer" : "default",
      }}
      onClick={handleClick}
    >
      {/* Aspect-ratio enforcer — 4:3 = 75% — never removed, never changes */}
      <div style={{ paddingTop: "75%", pointerEvents: "none" }} aria-hidden="true" />

      {/* Content layer — absolutely fills the spacer box */}
      <div style={{ position: "absolute", inset: 0 }}>
        {state === "loaded" && objectUrl
          ? <img src={objectUrl} alt="" style={MEDIA_FILL} draggable={false} />
          : <Placeholder />
        }
        {state !== "loaded" && <Overlay state={state} progress={progress} />}
      </div>
    </div>
  );
}

// ── Shared overlay (download icon / progress ring / error) ───────────────────
function Overlay({
  state,
  progress,
}: {
  state: "idle" | "downloading" | "error";
  progress: ReturnType<typeof useMediaLoader>["progress"];
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
