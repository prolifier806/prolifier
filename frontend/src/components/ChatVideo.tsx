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

  if (!loaded) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16/9",
          overflow: "hidden",
          borderRadius: 8,
          background: "#0d0d0d",
          cursor: "pointer",
          ...style,
        }}
        onClick={handleLoad}
      >
        {/* Blurred dark gradient background — mimics Telegram video placeholder */}
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

        {/* Centered play/download button */}
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
            {/* Play triangle — offset right slightly like standard play icons */}
            <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      controlsList={controlsList}
      disablePictureInPicture
      preload="metadata"
      className={className ?? "block w-full bg-black"}
      style={{ borderRadius: 8, ...style }}
    />
  );
}
