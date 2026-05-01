import React, { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { getMediaPrefs, isLoaded, markLoaded, PREFS_EVENT, MediaPrefs } from "@/lib/mediaCache";

interface ChatImageProps {
  url: string;
  onClick?: () => void;
  /** Fixed height mode — used inside MediaCollage cells where width/height are set by parent */
  fill?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function ChatImage({ url, onClick, fill = false, style, className }: ChatImageProps) {
  const [loaded, setLoaded] = useState(() => isLoaded(url));
  const [prefs, setPrefs] = useState<MediaPrefs>(getMediaPrefs);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Keep prefs in sync across tabs / Settings toggle
  useEffect(() => {
    const handler = (e: Event) => setPrefs((e as CustomEvent<MediaPrefs>).detail);
    window.addEventListener(PREFS_EVENT, handler);
    return () => window.removeEventListener(PREFS_EVENT, handler);
  }, []);

  // IntersectionObserver auto-load when autoDownloadWifi is ON
  useEffect(() => {
    if (loaded || !prefs.autoDownloadWifi) return;
    const el = containerRef.current;
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoaded(true);
          markLoaded(url);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observerRef.current.observe(el);
    return () => observerRef.current?.disconnect();
  }, [loaded, prefs.autoDownloadWifi, url]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    markLoaded(url);
    setLoaded(true);
  };

  // --- Placeholder ---
  if (!loaded) {
    const placeholderStyle: React.CSSProperties = fill
      ? { width: "100%", height: "100%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", ...style }
      : { width: "100%", aspectRatio: "4/3", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, ...style };

    return (
      <div ref={containerRef} style={placeholderStyle} className={className}>
        <button
          onClick={handleDownload}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8,
            padding: "10px 16px", cursor: "pointer", color: "#fff",
          }}
        >
          <Download size={20} />
          <span style={{ fontSize: 11, opacity: 0.85 }}>Load image</span>
        </button>
      </div>
    );
  }

  // --- Loaded image ---
  const imgStyle: React.CSSProperties = fill
    ? { width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: onClick ? "pointer" : "default", ...style }
    : { width: "100%", height: "auto", display: "block", cursor: onClick ? "pointer" : "default", ...style };

  return (
    <img
      src={url}
      alt=""
      style={imgStyle}
      className={className}
      draggable={false}
      onClick={onClick}
      onLoad={e => {
        // prevent scroll jump — fix height before layout shifts
        const img = e.currentTarget;
        if (!fill && img.parentElement) {
          img.parentElement.style.minHeight = "";
        }
      }}
    />
  );
}
