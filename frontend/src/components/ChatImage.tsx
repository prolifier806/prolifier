import React, { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { getMediaPrefs, isRevealed, markRevealed, PREFS_EVENT, type MediaPrefs } from "@/lib/mediaCache";

interface ChatImageProps {
  url: string;
  /** Called when image is clicked after it has been revealed */
  onClick?: () => void;
  /** Fill parent container — used inside MediaCollage fixed-height cells */
  fill?: boolean;
  style?: React.CSSProperties;
}

export function ChatImage({ url, onClick, fill = false, style }: ChatImageProps) {
  const [revealed, setReveal] = useState(() => isRevealed(url));
  const [portrait, setPortrait] = useState(false);
  const [prefs, setPrefs] = useState<MediaPrefs>(getMediaPrefs);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Sync prefs across Settings toggle
  useEffect(() => {
    const handler = (e: Event) => setPrefs((e as CustomEvent<MediaPrefs>).detail);
    window.addEventListener(PREFS_EVENT, handler);
    return () => window.removeEventListener(PREFS_EVENT, handler);
  }, []);

  // IntersectionObserver — auto-reveal when Wi-Fi auto-download is ON
  useEffect(() => {
    if (revealed || !prefs.autoDownloadWifi) return;
    const el = containerRef.current;
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          markRevealed(url);
          setReveal(true);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observerRef.current.observe(el);
    return () => { observerRef.current?.disconnect(); };
  }, [revealed, prefs.autoDownloadWifi, url]);

  const handleClick = (e: React.MouseEvent) => {
    if (!revealed) {
      e.stopPropagation();
      markRevealed(url);
      setReveal(true);
    } else {
      onClick?.();
    }
  };

  // Dimensions
  const containerStyle: React.CSSProperties = fill
    ? { position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "pointer", ...style }
    : {
        position: "relative",
        width: "100%",
        overflow: "hidden",
        cursor: "pointer",
        // Portrait: lock to 3:4 (same as original Groups ImageMsg)
        aspectRatio: !revealed && !fill ? undefined : (portrait ? "3/4" : undefined),
        ...style,
      };

  const imgStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: fill ? "100%" : "auto",
    objectFit: fill ? "cover" : (portrait ? "cover" : undefined),
    objectPosition: portrait ? "center top" : undefined,
    // Telegram blur effect
    filter: revealed ? "none" : "blur(8px)",
    opacity: revealed ? 1 : 0.9,
    // Scale up slightly to hide blur edge artifacts
    transform: revealed ? "none" : "scale(1.08)",
    transition: "filter 0.25s ease, opacity 0.25s ease, transform 0.25s ease",
    // Preserve aspect-ratio for portrait images even in blurred state
    aspectRatio: !fill && portrait ? "3/4" : undefined,
  };

  return (
    <div ref={containerRef} style={containerStyle} onClick={handleClick}>
      <img
        src={url}
        alt=""
        style={imgStyle}
        draggable={false}
        onLoad={e => {
          if (!fill) {
            const img = e.currentTarget;
            setPortrait(img.naturalHeight > img.naturalWidth * 1.2);
          }
        }}
      />

      {/* Download overlay — visible only while blurred */}
      {!revealed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            <Download size={20} color="#fff" strokeWidth={2.2} />
          </div>
        </div>
      )}
    </div>
  );
}
