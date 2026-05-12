"use client";

import { useState } from "react";
import { transliterateToHebrew } from "@/lib/hebrew-keymap";

// A drop-in <input> replacement for Hebrew-only fields.
//
// Why: the browser can't force the OS keyboard language. Instead we transliterate
// Latin keystrokes to their Hebrew-layout equivalents — so users can keep typing
// without switching to a Hebrew keyboard. Press 'a' → 'ש' appears, etc.
//
// The user can disable per-field via the small "א/A" toggle on the right edge.
// Disabled = raw passthrough (useful for transliterated names like "Cohen-Levi").
//
// Props: same as a standard controlled input — `value` and `onChange` — plus
// the usual style/placeholder/className. Auto-applies dir="rtl", lang="he",
// inputMode="text" for the best mobile-keyboard hints.

interface HebrewInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (v: string) => void;
  /** Initially-on auto-transliteration. Default true. */
  defaultAutoConvert?: boolean;
}

export default function HebrewInput({
  value,
  onChange,
  defaultAutoConvert = true,
  style,
  ...rest
}: HebrewInputProps) {
  const [autoConvert, setAutoConvert] = useState(defaultAutoConvert);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    onChange(autoConvert ? transliterateToHebrew(raw) : raw);
  }

  // Paste: also run through the transliterator if auto-convert is on, so pasted
  // Latin-layout text gets converted in one pass.
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (!autoConvert) return;
    const pasted = e.clipboardData.getData("text");
    // Only intervene if there's something to transform; else let default behaviour run.
    const converted = transliterateToHebrew(pasted);
    if (converted === pasted) return;
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? value.length;
    const next = value.slice(0, start) + converted + value.slice(end);
    onChange(next);
    // Restore caret position after the paste
    requestAnimationFrame(() => {
      const pos = start + converted.length;
      target.setSelectionRange(pos, pos);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        {...rest}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        dir="rtl"
        lang="he"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{
          ...style,
          // Reserve padding on the LEFT (where the toggle sits) since text is RTL.
          paddingLeft: 42,
        }}
      />
      <button
        type="button"
        onClick={() => setAutoConvert((v) => !v)}
        title={
          autoConvert
            ? "Auto-Hebrew is ON — Latin keystrokes convert to Hebrew. Click to type literally."
            : "Auto-Hebrew is OFF — typing is literal. Click to re-enable auto-conversion."
        }
        style={{
          position: "absolute",
          left: 6,
          top: "50%",
          transform: "translateY(-50%)",
          width: 30,
          height: 22,
          border: "1px solid rgba(10,16,25,0.18)",
          borderRadius: 6,
          background: autoConvert ? "var(--shed-green, #2d7a3d)" : "rgba(10,16,25,0.05)",
          color: autoConvert ? "#fff" : "rgba(10,16,25,0.6)",
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "'Frank Ruhl Libre', serif",
          lineHeight: 1,
          padding: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        {autoConvert ? "א" : "A"}
      </button>
    </div>
  );
}
