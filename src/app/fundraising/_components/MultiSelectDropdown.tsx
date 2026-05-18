"use client";

// MultiSelectDropdown — Excel-style multi-pick filter.
//
// Closed state: shows "{label}: All" or "{label}: 3 selected" or the single value's label
// when only one is picked. Click opens a panel with checkboxes for every option, a search
// box (when there are >10 options), and 'Select all' + 'Clear' buttons.
//
// Replaces the wall of `<select multiple>` boxes in the Reports filter card — those took
// up huge vertical space and required Ctrl/Cmd-click which most users don't know about.
//
// Designed to be drop-in for any list of {id, label} options. The optional sentinel
// `__none__` value is preserved if it's in the value array (used by Reports to mean "no
// project" / "no source" — the empty-bucket filter).

import { useEffect, useMemo, useRef, useState } from "react";

export interface MultiSelectOption {
  /** Stable value submitted to the server. */
  value: string;
  /** Display label shown next to the checkbox. */
  label: string;
  /** Optional second-line subtext (e.g. donor's hebrew name). */
  sublabel?: string;
}

export interface MultiSelectDropdownProps {
  /** Label shown on the dropdown button (e.g. "Projects"). */
  label: string;
  /** Available options. */
  options: MultiSelectOption[];
  /** Currently-selected values. */
  value: string[];
  /** Called with the new array when selection changes. */
  onChange: (value: string[]) => void;
  /** Force-shows a search box even when there are few options. Default: auto >10. */
  searchable?: boolean;
  /** Override the button width. Default: stretches to fill the parent grid cell. */
  width?: number | string;
  /** Override placeholder when nothing is selected. Default: "All {label}". */
  placeholder?: string;
}

export default function MultiSelectDropdown({
  label,
  options,
  value,
  onChange,
  searchable,
  width,
  placeholder,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close. Don't trigger on the button itself (the button's own click
  // toggles open state and that path runs before this listener).
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset search when closing so the next open starts clean.
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Maps for fast lookups (which values are checked, which option matches a value).
  const selectedSet = useMemo(() => new Set(value), [value]);
  const optionByValue = useMemo(() => {
    const m = new Map<string, MultiSelectOption>();
    for (const o of options) m.set(o.value, o);
    return m;
  }, [options]);

  // Filtered options for the dropdown body — substring match against label + sublabel.
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel || "").toLowerCase().includes(q),
    );
  }, [options, search]);

  const showSearch = searchable ?? options.length > 10;

  // Button label: "All projects" when nothing selected, "Annual Drive" when exactly one,
  // "3 projects selected" for multi.
  const buttonLabel = useMemo(() => {
    if (value.length === 0) return placeholder || `All ${label.toLowerCase()}`;
    if (value.length === 1) {
      const o = optionByValue.get(value[0]);
      return o?.label || value[0];
    }
    return `${value.length} ${label.toLowerCase()} selected`;
  }, [value, optionByValue, label, placeholder]);

  function toggle(val: string) {
    if (selectedSet.has(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }

  function selectAll() {
    // Includes only options currently visible in the dropdown (after search filter).
    // This way "Select all" + a search term selects exactly that subset.
    const next = new Set(value);
    for (const o of filteredOptions) next.add(o.value);
    onChange(Array.from(next));
  }

  function clearAll() {
    // Inverse: when search is active, only deselects the currently visible options. With
    // no search, deselects everything.
    if (!search.trim()) {
      onChange([]);
      return;
    }
    const remove = new Set(filteredOptions.map((o) => o.value));
    onChange(value.filter((v) => !remove.has(v)));
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid rgba(10,16,25,0.14)",
          borderRadius: 6,
          background: "#fff",
          fontSize: 13,
          fontWeight: 500,
          color: value.length > 0 ? "var(--cast-iron)" : "rgba(10,16,25,0.55)",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          outline: open ? "2px solid var(--blueprint)" : "none",
          outlineOffset: -2,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {buttonLabel}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            minWidth: 220,
            zIndex: 30,
            background: "#fff",
            border: "1px solid rgba(10,16,25,0.14)",
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(10,16,25,0.12)",
            maxHeight: 360,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Toolbar: search + Select all + Clear */}
          <div style={{ padding: 8, borderBottom: "1px solid rgba(10,16,25,0.06)" }}>
            {showSearch && (
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid rgba(10,16,25,0.12)",
                  borderRadius: 6,
                  fontSize: 12,
                  outline: "none",
                  marginBottom: 6,
                  boxSizing: "border-box",
                }}
              />
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={selectAll}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  background: "rgba(28,93,142,0.06)",
                  border: "1px solid rgba(28,93,142,0.18)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--blueprint)",
                  cursor: "pointer",
                }}
              >
                ✓ Select all{search ? " (filtered)" : ""}
              </button>
              <button
                type="button"
                onClick={clearAll}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  background: "transparent",
                  border: "1px solid rgba(10,16,25,0.12)",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--cast-iron)",
                  cursor: "pointer",
                }}
              >
                ✕ Clear{search ? " (filtered)" : ""}
              </button>
            </div>
          </div>

          {/* Options list */}
          <div style={{ overflowY: "auto", flex: 1, maxHeight: 280 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, opacity: 0.55, textAlign: "center" }}>
                No matches.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "7px 12px",
                      cursor: "pointer",
                      background: checked ? "rgba(28,93,142,0.05)" : "transparent",
                      borderBottom: "1px solid rgba(10,16,25,0.04)",
                    }}
                    onMouseEnter={(e) => {
                      if (!checked) e.currentTarget.style.background = "rgba(10,16,25,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = checked ? "rgba(28,93,142,0.05)" : "transparent";
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      style={{ marginTop: 2, cursor: "pointer", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: checked ? 600 : 500,
                          color: "var(--cast-iron)",
                          // Italicize the sentinel "no project / no source" placeholder
                          // so it visually separates from real entries.
                          fontStyle: opt.value === "__none__" ? "italic" : "normal",
                        }}
                      >
                        {opt.label}
                      </div>
                      {opt.sublabel && (
                        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>{opt.sublabel}</div>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer with summary */}
          <div
            style={{
              padding: "6px 10px",
              borderTop: "1px solid rgba(10,16,25,0.06)",
              fontSize: 11,
              opacity: 0.65,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>{value.length} selected</span>
            <span>{filteredOptions.length} of {options.length} shown</span>
          </div>
        </div>
      )}
    </div>
  );
}
