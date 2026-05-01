import React, { useState } from "react";
import { Play } from "lucide-react";
import { isRevealed, markRevealed } from "@/lib/mediaCache";

interface ChatVideoProps {
  url: string;
  className?: string;
  controlsList?: string;
  style?: React.CSSProperties;
}

export function ChatVideo({ url, className, controlsList = "nodownload noplaybackrate nopictureinpicture", style }: ChatVideoProps) {
  const [loaded, setLoaded] = useState(() => isRevealed(url));

  const handleLoad = (e: React.MouseEvent) => {
    e.stopPropagation();
    markRevealed(url);
    setLoaded(true);
  };

  // Outer wrapper always holds 16:9 so size never changes before/after load
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        overflow: "hidden",
        borderRadius: 8,
        background: "#0d0d0d",
        ...style,
      }}
    >
      {loaded ? (
        <video
          src={url}
          controls
          controlsList={controlsList}
          disablePictureInPicture
          preload="metadata"
          className={className}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "contain",
            background: "#000",
          }}
        />
      ) : (
        <div
          style={{ position: "absolute", inset: 0, cursor: "pointer" }}
          onClick={handleLoad}
        >
          {/* Blurred gradient — Telegram-style video placeholder */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, #1c1c2e 0%, #16213e 60%, #0f3460 100%)",
              filter: "blur(8px)",
              opacity: 0.9,
              transform: "scale(1.08)",
            }}
          />

          {/* Centered circular play button */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              }}
            >
              <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
