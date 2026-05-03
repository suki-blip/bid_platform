"use client";

import { useState } from "react";

interface Props {
  value: number | null;
  onChange?: (next: number | null) => void;
  size?: number;
  readonly?: boolean;
  label?: string;
  hideEmpty?: boolean; // when true and value is null in readonly mode, render nothing
}

export default function StarRating({ value, onChange, size = 14, readonly = false, label, hideEmpty = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;

  if (readonly && hideEmpty && (value == null || value === 0)) return null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {label && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            opacity: 0.55,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginRight: 2,
          }}
        >
          {label}
        </span>
      )}
      <div style={{ display: "inline-flex", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= display;
          const empty = readonly && (value == null || value === 0);
          return (
            <button
              key={n}
              type="button"
              disabled={readonly}
              onMouseEnter={() => !readonly && setHover(n)}
              onMouseLeave={() => !readonly && setHover(null)}
              onClick={() => {
                if (readonly || !onChange) return;
                onChange(value === n ? null : n);
              }}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: readonly ? "default" : "pointer",
                lineHeight: 1,
                color: filled ? "var(--high-vis)" : empty ? "rgba(10,16,25,0.15)" : "rgba(10,16,25,0.2)",
                fontSize: size,
              }}
            >
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
