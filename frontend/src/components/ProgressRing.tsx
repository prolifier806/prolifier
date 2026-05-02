import React from "react";
import { Download } from "lucide-react";
import type { DownloadProgress } from "@/lib/downloadManager";

interface ProgressRingProps {
  progress: DownloadProgress | null;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({ progress, size = 52, strokeWidth = 3 }: ProgressRingProps) {
  const center = size / 2;
  const r = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * r;
  const pct = progress?.total ? Math.min(progress.loaded / progress.total, 1) : 0;
  const dashOffset = circumference * (1 - pct);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        {/* Track */}
        <circle
          cx={center} cy={center} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center} cy={center} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.12s linear" }}
        />
      </svg>
      {/* Centered icon */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Download size={Math.floor(size * 0.32)} color="#fff" strokeWidth={2} />
      </div>
    </div>
  );
}

export function fmtBytes(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / 1_000_000;
  return mb < 0.1 ? `${(bytes / 1000).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
}
