import React from "react";

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

  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const Img = ({ url, extra }: { url: string; extra?: React.ReactNode }) => (
    <div style={cellStyle} onClick={() => onOpen(url)}>
      <img src={url} alt="" style={imgStyle} loading="lazy" draggable={false} />
      {extra}
    </div>
  );

  // ── 1 image — full width ──────────────────────────────────────────────────
  if (count === 1) {
    return (
      <div style={{ width: maxWidth, borderRadius: 12, overflow: "hidden", cursor: "pointer" }}
        onClick={() => onOpen(urls[0])}>
        <img src={urls[0]} alt="" style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" />
      </div>
    );
  }

  const gap = 2;
  const half = (maxWidth - gap) / 2;
  const third = (maxWidth - gap * 2) / 3;

  // ── 2 images — side by side ───────────────────────────────────────────────
  if (count === 2) {
    return (
      <div style={{ display: "flex", gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ ...cellStyle, width: half, height: half }}><img src={urls[0]} alt="" style={imgStyle} loading="lazy" onClick={() => onOpen(urls[0])} /></div>
        <div style={{ ...cellStyle, width: half, height: half }}><img src={urls[1]} alt="" style={imgStyle} loading="lazy" onClick={() => onOpen(urls[1])} /></div>
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
        <div style={{ ...cellStyle, width: big, height: big }} onClick={() => onOpen(urls[0])}>
          <img src={urls[0]} alt="" style={imgStyle} loading="lazy" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap, width: small }}>
          <div style={{ ...cellStyle, height: smallH }} onClick={() => onOpen(urls[1])}>
            <img src={urls[1]} alt="" style={imgStyle} loading="lazy" />
          </div>
          <div style={{ ...cellStyle, height: smallH }} onClick={() => onOpen(urls[2])}>
            <img src={urls[2]} alt="" style={imgStyle} loading="lazy" />
          </div>
        </div>
      </div>
    );
  }

  // ── 4 images — 2×2 grid ──────────────────────────────────────────────────
  if (count === 4) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `1fr 1fr`, gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
        {urls.map((url, i) => (
          <div key={i} style={{ ...cellStyle, height: half }} onClick={() => onOpen(url)}>
            <img src={url} alt="" style={imgStyle} loading="lazy" />
          </div>
        ))}
      </div>
    );
  }

  // ── 5+ images — 2×2 grid + overlay on 4th ───────────────────────────────
  const shown = urls.slice(0, 4);
  const more = count - 4;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `1fr 1fr`, gap, width: maxWidth, borderRadius: 12, overflow: "hidden" }}>
      {shown.map((url, i) => {
        const isLast = i === 3;
        return (
          <div key={i} style={{ ...cellStyle, height: half }} onClick={() => onOpen(url)}>
            <img src={url} alt="" style={{ ...imgStyle, filter: isLast && more > 0 ? "brightness(0.45)" : undefined }} loading="lazy" />
            {isLast && more > 0 && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 22, fontWeight: 700,
                pointerEvents: "none",
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
