"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Excel-style data table.
//
// Each column header has:
//   - click on the title to cycle sort: none → asc → desc → none
//   - click on the funnel icon to open a per-column filter dropdown with checkboxes
//     of every unique value in that column (Select all / Clear in the header).
//
// Above the table, a "Reset filters" button appears whenever any filter or sort is active.
//
// The component is fully generic over the row type T. Pages pass:
//   - data: T[]
//   - columns: a list of Column<T> describing how to read / display each field
//   - rowKey: (T) => string  — stable React key
//
// Optionally:
//   - onRowClick(row): make rows clickable
//   - storageKey: persist filters + sort across refresh (per-table localStorage)
//   - emptyMessage: shown when no rows match
//
// Performance: filtering and sorting are O(N) per render; we memoize. For lists > 5k rows,
// consider virtualization — but that's not on the table here yet.

export interface DataTableColumn<T> {
  /** Unique column id (used in URL, localStorage, React keys). */
  key: string;
  /** Header text (or any node). */
  header: React.ReactNode;
  /**
   * Pulls the comparable primitive value out of a row.
   * Used for sorting + filtering. Falsy/undefined values count as "blank" and are filtered together.
   */
  accessor: (row: T) => string | number | null | undefined;
  /** Optional custom display renderer. Defaults to `String(accessor(row))`. */
  render?: (row: T) => React.ReactNode;
  /** Enable sort on this column. Default: true. */
  sortable?: boolean;
  /** Enable per-column filter dropdown. Default: true. */
  filterable?: boolean;
  /** Optional explicit width (CSS value). */
  width?: string | number;
  /** Cell horizontal alignment. */
  align?: "left" | "center" | "right";
  /** Optional label to show in the filter dropdown header when accessor returns a complex value. */
  filterDisplay?: (value: string | number | null | undefined) => string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: React.ReactNode;
  /** When set, sort + filter state is persisted in localStorage under this key. */
  storageKey?: string;
  /** Optional footer node rendered below the table (e.g. summary row). */
  footer?: React.ReactNode;
}

type SortDir = "asc" | "desc";
interface SortState {
  key: string;
  dir: SortDir;
}

// Filter state per column. `null` means "no filter applied" (all rows pass).
// Otherwise it's the SET of allowed accessor values (string | "__blank__" sentinel).
type FilterMap = Record<string, Set<string> | null>;

const BLANK_SENTINEL = "__blank__";

function normalize(value: string | number | null | undefined): string {
  if (value == null || value === "") return BLANK_SENTINEL;
  return String(value);
}

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  // Blanks sort to the end.
  const aBlank = a == null || a === "";
  const bBlank = b == null || b === "";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  // Numeric vs string comparison
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  // Numeric-aware compare for mixed strings ("Donor 10" vs "Donor 2")
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

export default function DataTable<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  emptyMessage,
  storageKey,
  footer,
}: DataTableProps<T>) {
  // Sort + filter state. Lazy-load from localStorage if a storageKey is set.
  const [sort, setSort] = useState<SortState | null>(() => {
    if (typeof window === "undefined" || !storageKey) return null;
    try {
      const raw = localStorage.getItem(`dt:${storageKey}:sort`);
      return raw ? (JSON.parse(raw) as SortState) : null;
    } catch {
      return null;
    }
  });
  const [filters, setFilters] = useState<FilterMap>(() => {
    if (typeof window === "undefined" || !storageKey) return {};
    try {
      const raw = localStorage.getItem(`dt:${storageKey}:filters`);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, string[] | null>;
      const map: FilterMap = {};
      for (const k of Object.keys(parsed)) {
        map[k] = parsed[k] === null ? null : new Set(parsed[k] as string[]);
      }
      return map;
    } catch {
      return {};
    }
  });
  // Currently-open filter dropdown (column key). null = none.
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Persist state on change.
  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    try {
      if (sort) localStorage.setItem(`dt:${storageKey}:sort`, JSON.stringify(sort));
      else localStorage.removeItem(`dt:${storageKey}:sort`);
      const serialised: Record<string, string[] | null> = {};
      for (const k of Object.keys(filters)) {
        serialised[k] = filters[k] === null ? null : Array.from(filters[k] as Set<string>);
      }
      if (Object.keys(serialised).length > 0) {
        localStorage.setItem(`dt:${storageKey}:filters`, JSON.stringify(serialised));
      } else {
        localStorage.removeItem(`dt:${storageKey}:filters`);
      }
    } catch {
      // ignore quota / privacy errors
    }
  }, [sort, filters, storageKey]);

  // Close filter dropdown when clicking outside.
  useEffect(() => {
    if (!openFilter) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpenFilter(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilter]);

  // Build the list of unique values per column (for filter dropdowns).
  // Computed against the FULL dataset so removing a filter doesn't shrink the option list.
  const uniqueValues = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const col of columns) {
      map[col.key] = new Set();
    }
    for (const row of data) {
      for (const col of columns) {
        map[col.key].add(normalize(col.accessor(row)));
      }
    }
    return map;
  }, [data, columns]);

  // Apply filters + sort.
  const processed = useMemo(() => {
    let rows = data;
    // Filter
    const filterKeys = Object.keys(filters).filter((k) => filters[k] !== null);
    if (filterKeys.length > 0) {
      rows = rows.filter((row) =>
        filterKeys.every((k) => {
          const col = columns.find((c) => c.key === k);
          if (!col) return true;
          const allowed = filters[k] as Set<string>;
          return allowed.has(normalize(col.accessor(row)));
        }),
      );
    }
    // Sort
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        rows = [...rows].sort((a, b) => {
          const cmp = compare(col.accessor(a), col.accessor(b));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return rows;
  }, [data, columns, filters, sort]);

  const anyActive = sort !== null || Object.values(filters).some((v) => v !== null);

  const cycleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // off
    });
  }, []);

  const toggleFilterValue = useCallback(
    (colKey: string, value: string) => {
      setFilters((prev) => {
        const all = uniqueValues[colKey] || new Set();
        const current = prev[colKey];
        const setCopy = current === null || current === undefined ? new Set(all) : new Set(current);
        if (setCopy.has(value)) setCopy.delete(value);
        else setCopy.add(value);
        // If all values are checked, treat as "no filter".
        if (setCopy.size === all.size) {
          const next = { ...prev };
          delete next[colKey];
          return next;
        }
        return { ...prev, [colKey]: setCopy };
      });
    },
    [uniqueValues],
  );

  const selectAll = useCallback((colKey: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  }, []);

  const clearAll = useCallback((colKey: string) => {
    setFilters((prev) => ({ ...prev, [colKey]: new Set<string>() }));
  }, []);

  const resetEverything = useCallback(() => {
    setSort(null);
    setFilters({});
    setOpenFilter(null);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Reset bar */}
      {anyActive && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(28,93,142,0.06)",
            border: "1px solid rgba(28,93,142,0.18)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <span style={{ opacity: 0.8 }}>
            <strong>{processed.length}</strong> of {data.length} rows shown
            {sort && <> · sorted by <strong>{columns.find((c) => c.key === sort.key)?.header}</strong> ({sort.dir})</>}
          </span>
          <button
            type="button"
            onClick={resetEverything}
            style={{
              padding: "5px 12px",
              background: "var(--blueprint)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset filters
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff" }}>
          <thead>
            <tr>
              {columns.map((col) => {
                const sortActive = sort?.key === col.key;
                const filterActive = filters[col.key] != null && filters[col.key] !== undefined;
                const sortable = col.sortable !== false;
                const filterable = col.filterable !== false;
                return (
                  <th
                    key={col.key}
                    style={{
                      textAlign: col.align || "left",
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(10,16,25,0.12)",
                      fontWeight: 800,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      opacity: 0.75,
                      whiteSpace: "nowrap",
                      width: col.width,
                      position: "relative",
                      background: filterActive || sortActive ? "rgba(28,93,142,0.04)" : "transparent",
                    }}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span
                        onClick={sortable ? () => cycleSort(col.key) : undefined}
                        style={{ cursor: sortable ? "pointer" : "default", userSelect: "none" }}
                      >
                        {col.header}
                        {sortActive && (
                          <span style={{ marginLeft: 4, fontSize: 10 }}>
                            {sort?.dir === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </span>
                      {filterable && (
                        <button
                          type="button"
                          onClick={() => setOpenFilter(openFilter === col.key ? null : col.key)}
                          aria-label="Filter"
                          title="Filter values"
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: filterActive ? "var(--blueprint)" : "rgba(10,16,25,0.45)",
                            padding: "2px 4px",
                            borderRadius: 4,
                            fontSize: 12,
                            lineHeight: 1,
                          }}
                        >
                          {/* Funnel icon */}
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                            <path d="M1.5 1.5h13a.5.5 0 0 1 .39.81L10 8.83V14a.5.5 0 0 1-.72.45l-3-1.5A.5.5 0 0 1 6 12.5V8.83L1.11 2.31A.5.5 0 0 1 1.5 1.5z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Filter dropdown */}
                    {openFilter === col.key && (
                      <FilterDropdown
                        column={col}
                        allValues={Array.from(uniqueValues[col.key] || []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))}
                        selected={filters[col.key] === undefined || filters[col.key] === null ? null : (filters[col.key] as Set<string>)}
                        onToggle={(v) => toggleFilterValue(col.key, v)}
                        onSelectAll={() => selectAll(col.key)}
                        onClearAll={() => clearAll(col.key)}
                        onClose={() => setOpenFilter(null)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ textAlign: "center", padding: 28, opacity: 0.6, fontSize: 13 }}
                >
                  {emptyMessage || "No matching rows."}
                </td>
              </tr>
            ) : (
              processed.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom: "1px solid rgba(10,16,25,0.06)",
                    cursor: onRowClick ? "pointer" : "default",
                  }}
                  onMouseEnter={(e) => {
                    if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(10,16,25,0.025)";
                  }}
                  onMouseLeave={(e) => {
                    if (onRowClick) (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: "9px 12px",
                        textAlign: col.align || "left",
                        verticalAlign: "middle",
                      }}
                    >
                      {col.render ? col.render(row) : String(col.accessor(row) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {footer && (
            <tfoot>
              <tr>
                <td colSpan={columns.length} style={{ padding: "10px 12px", borderTop: "1px solid rgba(10,16,25,0.08)" }}>
                  {footer}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ----- Filter dropdown subcomponent -----

interface FilterDropdownProps<T> {
  column: DataTableColumn<T>;
  allValues: string[];
  selected: Set<string> | null;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

function FilterDropdown<T>({
  column,
  allValues,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
  onClose,
}: FilterDropdownProps<T>) {
  // selected === null means "all checked" implicitly. We compute isChecked accordingly.
  const isChecked = (v: string) => (selected === null ? true : selected.has(v));
  const [query, setQuery] = useState("");
  const filteredValues = useMemo(() => {
    if (!query.trim()) return allValues;
    const q = query.toLowerCase();
    return allValues.filter((v) => v.toLowerCase().includes(q));
  }, [allValues, query]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 4,
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.18)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(10,16,25,0.18)",
        zIndex: 50,
        minWidth: 220,
        maxWidth: 320,
        padding: 8,
      }}
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <button
          type="button"
          onClick={onSelectAll}
          style={miniBtn}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onClearAll}
          style={miniBtn}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...miniBtn, marginLeft: "auto" }}
        >
          ✕
        </button>
      </div>
      {allValues.length > 8 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search values…"
          style={{
            width: "100%",
            padding: "5px 8px",
            border: "1px solid rgba(10,16,25,0.14)",
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 6,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {filteredValues.length === 0 ? (
          <div style={{ padding: "6px 4px", fontSize: 12, opacity: 0.55 }}>No matches.</div>
        ) : (
          filteredValues.map((v) => {
            const display = v === BLANK_SENTINEL ? "(blank)" : column.filterDisplay ? column.filterDisplay(v) : v;
            return (
              <label
                key={v}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  cursor: "pointer",
                  fontSize: 12,
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLLabelElement).style.background = "rgba(10,16,25,0.04)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLLabelElement).style.background = "transparent")}
              >
                <input
                  type="checkbox"
                  checked={isChecked(v)}
                  onChange={() => onToggle(v)}
                />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {display}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: "3px 8px",
  background: "transparent",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--cast-iron)",
};
