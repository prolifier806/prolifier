import React, { useState } from "react";
import { Film } from "lucide-react";
import { isLoaded, markLoaded } from "@/lib/mediaCache";

interface ChatVideoProps {
  url: string;
  className?: string;
  controlsList?: string;
}

export function ChatVideo({ url, className, controlsList = "nodownload noplaybackrate nopictureinpicture" }: ChatVideoProps) {
  const [loaded, setLoaded] = useState(() => isLoaded(url));

  const handleLoad = () => {
    markLoaded(url);
    setLoaded(true);
  };

  if (!loaded) {
    return (
      <div
        style={{
          width: "100%", aspectRatio: "16/9", background: "#111",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 10, borderRadius: 8,
        }}
        className={className}
      >
        <Film size={28} color="#888" />
        <button
          onClick={handleLoad}
          style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8,
            padding: "8px 18px", cursor: "pointer", color: "#fff", fontSize: 13,
          }}
        >
          Load video
        </button>
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      controlsList={controlsList}
      disablePictureInPicture
      className={className ?? "block w-full bg-black"}
      style={{ borderRadius: 8 }}
    />
  );
}
