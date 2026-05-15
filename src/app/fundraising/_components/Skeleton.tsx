"use client";

// Skeleton + SkeletonRows — generic loading placeholders that match the real content
// shape, so the page doesn't "snap" from blank → text the moment data lands. Pure CSS
// shimmer (no framer-motion / animation library) — keeps the bundle small.
//
// Use SkeletonRows for table-shaped lists, Skeleton for single blocks.

import type { CSSProperties } from "react";

const shimmerKeyframes = `
@keyframes fr-skeleton-shimmer {
  0% { background-position: -200px 0 }
  100% { background-position: calc(200px + 100%) 0 }
}`;

// Inject the keyframes once at module load — they're shared across all skeleton instances.
if (typeof document !== "undefined") {
  const id = "fr-skeleton-keyframes";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = shimmerKeyframes;
    document.head.appendChild(style);
  }
}

const shimmerStyle: CSSProperties = {
  background:
    "linear-gradient(90deg, rgba(10,16,25,0.04) 0px, rgba(10,16,25,0.08) 40px, rgba(10,16,25,0.04) 80px)",
  backgroundSize: "200px 100%",
  backgroundRepeat: "no-repeat",
  animation: "fr-skeleton-shimmer 1.4s ease-in-out infinite",
  borderRadius: 6,
};

export function Skeleton({ width = "100%", height = 14, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return <div style={{ ...shimmerStyle, width, height, ...style }} />;
}

// Repeated rows for table-style loading states. Each row contains a few skeleton blocks
// approximating typical column widths (name + meta + amount + actions).
export function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: `2fr ${"1fr ".repeat(columns - 1)}`, gap: 14 }}>
          {Array.from({ length: columns }).map((_, ci) => (
            <Skeleton key={ci} height={ci === 0 ? 18 : 14} width={ci === 0 ? "70%" : "60%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

// One card-shaped skeleton (e.g. for dashboard stat cells).
export function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div style={{ ...shimmerStyle, width: "100%", height, borderRadius: 10 }} />
  );
}
