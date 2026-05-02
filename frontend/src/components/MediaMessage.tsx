import React, { useEffect, useRef, useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import { shouldAutoDownload } from "@/lib/mediaPrefs";
import { ProgressRing, fmtBytes } from "@/components/ProgressRing";
import { useMediaLoader } from "@/hooks/useMediaLoader";

interface MediaMessageProps {
  url: string;
  onClick?: () => void;
  /** fill=true: image fills a parent container with explicit dimensions (MediaCollage cells) */
  fill?: boolean;
}

// localStorage-backed revealed set — persists across refreshes
const REVEALED_KEY = "prolifier_img_revealed";
function loadRevealedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(REVEALED_KEY) || "[]")); }
  catch { return new Set(); }
}
const revealedSet = loadRevealedSet();
function markRevealedPersist(url: string) {
  revealedSet.add(url);
  try {
    const arr = [...revealedSet].slice(-800);
    localStorage.setItem(REVEALED_KEY, JSON.stringify(arr));
  } catch {}
}

export function MediaMessage({ url, onClick, fill = false }: MediaMessageProps) {
  const [isRevealed, setRevealed] = useState(() => revealedSet.has(url));
  const [portrait, setPortrait] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for stable observer callbacks
  const isRevealedRef = useRef(isRevealed);
  useEffect(() => { isRevealedRef.current = isRevealed; }, [isRevealed]);

  const reveal = () => {
    markRevealedPersist(url);
    setRevealed(true);
  };

  // IntersectionObserver — auto-reveal when setting allows
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isRevealedRef.current && shouldAutoDownload()) {
          reveal();
          observer.disconnect();
        }
      },
      { rootMargin: "250px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    if (!isRevealed) {
      reveal();
    } else {
      onClick?.();
    }
  };

  // ── FILL MODE (MediaCollage fixed-height cells) ───────────────────────────
  const fillStyle: React.CSSProperties = {
    position: "absolute", inset: 0,
    width: "100%", height: "100%",
    objectFit: "cover", display: "block",
    filter: isRevealed ? "none" : "blur(8px)",
    transform: isRevealed ? "none" : "scale(1.08)",
    transition: "filter 0.22s ease, transform 0.22s ease",
  };

  if (fill) {
    return (
      <div
        ref={containerRef}
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "pointer" }}
        onClick={handleClick}
      >
        <img src={url} alt="" style={fillStyle} draggable={false} />
        {!isRevealed && <DownloadOverlay />}
      </div>
    );
  }

  // ── DEFAULT MODE ──────────────────────────────────────────────────────────
  // The <img> is always in the DOM — the browser loads it and the element
  // defines the container height (natural aspect ratio, no fixed box).
  // We only control the CSS filter (blurred ↔ clear).
  // Portrait images (h > 1.2× w) get the 3:4 crop, same as original.
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        borderRadius: 10,
        cursor: isRevealed && onClick ? "pointer" : "pointer",
      }}
      onClick={handleClick}
    >
      <img
        src={url}
        alt=""
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: portrait ? "3/4" : undefined,
          objectFit: portrait ? "cover" : undefined,
          objectPosition: portrait ? "center top" : undefined,
          // Blur until revealed — scale hides the fuzzy edges blur creates
          filter: isRevealed ? "none" : "blur(8px)",
          transform: isRevealed ? "none" : "scale(1.06)",
          transition: "filter 0.22s ease, transform 0.22s ease",
        }}
        draggable={false}
        onLoad={e => {
          const img = e.currentTarget;
          setPortrait(img.naturalHeight > img.naturalWidth * 1.2);
        }}
      />
      {!isRevealed && <DownloadOverlay />}
    </div>
  );
}

function DownloadOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 14px rgba(0,0,0,0.45)",
      }}>
        <Download size={20} color="#fff" strokeWidth={2.2} />
      </div>
    </div>
  );
}
