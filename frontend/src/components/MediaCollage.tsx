import React from "react";
import { ChatImage } from "@/components/ChatImage";

interface MediaCollageProps {
  urls: string[];
  onOpen: (url: string) => void;
  maxWidth?: number;
}

export function MediaCollage({ urls, onOpen, maxWidth = 280 }: MediaCollageProps) {
  const count = urls.length;
  if (count === 0) return null;

  const cellStyle: React.CSSProperties = {
    overflow: "hidden",
    cursor: "pointer",
    position: "relative",
    backgroundColor: "#111",
  };

  const gap = 2;
  const half = (maxWidth - gap) / 2;

  // ── 1 image — natural width ───────────────────────────────────────────────
  if (count === 1) {
    return (
      <div style={{ width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
        <ChatImage url={urls[0]} onClick={() => onOpen(urls[0])} />
      </div>
    );
  }

  // ── 2 images — side by side ───────────────────────────────────────────────
  if (count === 2) {
    return (
      <div style={{ display: "flex", gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ ...cellStyle, width: half, height: half }}>
          <ChatImage url={urls[0]} onClick={() => onOpen(urls[0])} fill />
        </div>
        <div style={{ ...cellStyle, width: half, height: half }}>
          <ChatImage url={urls[1]} onClick={() => onOpen(urls[1])} fill />
        </div>
      </div>
    );
  }

  // ── 3 images — 1 large left + 2 stacked right ────────────────────────────
  if (count === 3) {
    const big = maxWidth * 0.6;
    const small = maxWidth - big - gap;
    const smallH = (big - gap) / 2;
    return (
      <div style={{ display: "flex", gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ ...cellStyle, width: big, height: big }}>
          <ChatImage url={urls[0]} onClick={() => onOpen(urls[0])} fill />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap, width: small }}>
          <div style={{ ...cellStyle, height: smallH }}>
            <ChatImage url={urls[1]} onClick={() => onOpen(urls[1])} fill />
          </div>
          <div style={{ ...cellStyle, height: smallH }}>
            <ChatImage url={urls[2]} onClick={() => onOpen(urls[2])} fill />
          </div>
        </div>
      </div>
    );
  }

  // ── 4 images — 2×2 grid ──────────────────────────────────────────────────
  if (count === 4) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
        {urls.map((url, i) => (
          <div key={i} style={{ ...cellStyle, height: half }}>
            <ChatImage url={url} onClick={() => onOpen(url)} fill />
          </div>
        ))}
      </div>
    );
  }

  // ── 5+ images — 2×2 + overlay on 4th ────────────────────────────────────
  const shown = urls.slice(0, 4);
  const more = count - 4;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
      {shown.map((url, i) => {
        const isLast = i === 3;
        return (
          <div key={i} style={{ ...cellStyle, height: half }}>
            <ChatImage url={url} onClick={() => onOpen(url)} fill />
            {isLast && more > 0 && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 22, fontWeight: 700,
              }}>
                +{more}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
