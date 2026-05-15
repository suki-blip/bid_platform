"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DonorSidePanel from "./DonorSidePanel";
import StarRating from "./StarRating";
import { SkeletonRows } from "./Skeleton";
import { fmtMoney, fmtDate } from "@/lib/fundraising-format";
import { useToast } from "@/lib/use-toast";

interface DonorRow {
  id: string;
  status: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  hebrew_first_name: string | null;
  hebrew_last_name: string | null;
  email: string | null;
  organization: string | null;
  total_pledged: number;
  total_paid: number;
  last_contact_at: string | null;
  next_followup_at: string | null;
  created_at: string;
  source_name: string | null;
  primary_phone: string | null;
  primary_city: string | null;
  tags: string[];
  assigned_name: string | null;
  financial_rating: number | null;
  giving_rating: number | null;
}

// Pick the best Hebrew display string for a donor row. Some donors only set the structured
// hebrew_first_name + hebrew_last_name fields (the donor-edit form has both inputs); legacy
// donors use the combined hebrew_name field; some have both. Order of preference:
//   1. structured first + last (joined with a space)
//   2. just one of the structured fields if the other is empty
//   3. the legacy combined hebrew_name
//   4. null (don't render anything)
function donorHebrewDisplay(d: DonorRow): string | null {
  const fn = (d.hebrew_first_name || "").trim();
  const ln = (d.hebrew_last_name || "").trim();
  const structured = [fn, ln].filter(Boolean).join(" ");
  if (structured) return structured;
  const legacy = (d.hebrew_name || "").trim();
  return legacy || null;
}

interface SourceRow {
  id: string;
  name: string;
}

// Column sort state. `key` identifies the column (see SORT_KEYS below); `dir` cycles
// none → asc → desc → none on repeated clicks. Persisted to sessionStorage so a refresh
// within the same tab keeps your sort, but closing the tab resets to "natural order" (the
// API's default — newest donors / most-recent contact first).
type SortKey =
  | "name"
  | "rating"
  | "contact"
  | "organization"
  | "source"
  | "pledged"
  | "paid"
  | "last_contact"
  | "assigned";
type SortDir = "asc" | "desc";

// Accessors turn a DonorRow into the sortable scalar for each column. NULL/undefined sort
// to the END regardless of direction — handled in the comparator, not here.
// Human-readable column labels used by the "Sorted by X" pill. Kept in sync with SortKey.
const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  rating: "Rating",
  contact: "Contact",
  organization: "Organization",
  source: "Source",
  pledged: "Pledged",
  paid: "Paid",
  last_contact: "Last contact",
  assigned: "Assigned",
};

const SORT_ACCESSORS: Record<SortKey, (d: DonorRow) => string | number | null> = {
  name: (d) => `${d.first_name || ""} ${d.last_name || ""}`.trim().toLowerCase(),
  // Rating compares by financial_rating first, then giving_rating, falling back to 0 so
  // donors without ratings sort below any with ratings.
  rating: (d) => (d.financial_rating ?? 0) * 10 + (d.giving_rating ?? 0),
  contact: (d) => (d.primary_phone || d.email || "").toLowerCase(),
  organization: (d) => (d.organization || "").toLowerCase(),
  source: (d) => (d.source_name || "").toLowerCase(),
  pledged: (d) => d.total_pledged || 0,
  paid: (d) => d.total_paid || 0,
  last_contact: (d) => d.last_contact_at || "",
  assigned: (d) => (d.assigned_name || "").toLowerCase(),
};

function compareWith(dir: SortDir, getter: (d: DonorRow) => string | number | null) {
  return (a: DonorRow, b: DonorRow) => {
    const av = getter(a);
    const bv = getter(b);
    // Push empties/zeros to the end of both ascending and descending sorts. For numbers,
    // 0 is a real value but the user almost always means "show me the top givers", so we
    // treat 0 as "no data" for sort purposes too.
    const aEmpty = av === null || av === undefined || av === "" || av === 0;
    const bEmpty = bv === null || bv === undefined || bv === "" || bv === 0;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  };
}

export default function DonorListView({ status }: { status: "prospect" | "donor" }) {
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const [donors, setDonors] = useState<DonorRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  // Lapsed + open-pledges filters (UX request from the audit). 'lapsed' = no payment in 12mo.
  // 'has_open_pledges' = at least one open pledge with outstanding balance.
  const [filterLapsed, setFilterLapsed] = useState(false);
  const [filterOpenPledges, setFilterOpenPledges] = useState(false);

  // autoFocus the search box on mount — saves a click for the most common entry point.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const [total, setTotal] = useState(0);
  const [previewDonorId, setPreviewDonorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Sort state — persisted to sessionStorage (per-tab) so a refresh keeps the user's view.
  // Keyed by `status` so the Donors page and Leads page have independent sort prefs.
  const sortStorageKey = `donor-list-sort:${status}`;
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(sortStorageKey);
      return raw ? (JSON.parse(raw) as { key: SortKey; dir: SortDir }) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sort) sessionStorage.setItem(sortStorageKey, JSON.stringify(sort));
    else sessionStorage.removeItem(sortStorageKey);
  }, [sort, sortStorageKey]);

  // Click cycles: not-active → desc → asc → none. We default to desc on first click for
  // numeric columns (paid/pledged) because "top givers" is the natural first ask; for text
  // columns starting asc would be alphabetical-from-A which feels right too — but the
  // cycle treats them uniformly, and the user can click again to flip. desc-first matches
  // every spreadsheet's column-header click behavior.
  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "desc" };
      if (current.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === donors.length) setSelected(new Set());
    else setSelected(new Set(donors.map((d) => d.id)));
  }

  async function bulkDelete() {
    const count = selected.size;
    if (count === 0) return;
    const noun = isProspect ? (count === 1 ? "lead" : "leads") : count === 1 ? "donor" : "donors";
    if (!confirm(`Delete ${count} ${noun}? This is irreversible.`)) return;
    setBulkBusy(true);
    const r = await fetch("/api/fundraising/donors/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setBulkBusy(false);
    if (r.ok) {
      setSelected(new Set());
      setReloadKey((k) => k + 1);
      toast.success(`${count} ${noun} moved to Recycle Bin`);
    } else {
      const e = await r.json().catch(() => ({}));
      toast.error(e.error || "Delete failed");
    }
  }

  useEffect(() => {
    fetch("/api/fundraising/sources")
      .then((r) => (r.ok ? r.json() : []))
      .then((s) => setSources(s));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ status, limit: "200" });
      if (search) params.set("search", search);
      if (sourceFilter) params.set("source_id", sourceFilter);
      fetch(`/api/fundraising/donors?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : { donors: [], total: 0 }))
        .then((d) => {
          if (cancelled) return;
          setDonors(d.donors || []);
          setTotal(d.total || 0);
          setLoading(false);
        })
        .catch(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [status, search, sourceFilter, reloadKey]);

  const isProspect = status === "prospect";
  const title = isProspect ? "Leads" : "Donors";
  const subtitle = isProspect
    ? "People you're cultivating. Convert to donor when they give."
    : "Active givers. Track pledges, payments, and history.";

  const summaryStats = useMemo(() => {
    const totalPledged = donors.reduce((s, d) => s + (d.total_pledged || 0), 0);
    const totalPaid = donors.reduce((s, d) => s + (d.total_paid || 0), 0);
    return { totalPledged, totalPaid };
  }, [donors]);

  // Client-side filter + sort applied AFTER the API returns.
  //
  // Lapsed filter: a donor is "lapsed" when their last_contact_at (which tracks both calls
  // and payments) is older than 12 months — typical re-engagement target. If null we treat
  // them as lapsed too (they've literally never been contacted).
  //
  // Open-pledges filter: donors with `total_pledged > total_paid` have outstanding balance.
  // This is a proxy until we add a real has_open_pledges flag from the API.
  const sortedDonors = useMemo(() => {
    let list = donors;

    if (filterLapsed) {
      const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => {
        if (!d.last_contact_at) return true;
        const t = new Date(d.last_contact_at).getTime();
        return Number.isFinite(t) && t < cutoff;
      });
    }
    if (filterOpenPledges) {
      list = list.filter((d) => (d.total_pledged || 0) > (d.total_paid || 0));
    }

    if (!sort) return list;
    const accessor = SORT_ACCESSORS[sort.key];
    if (!accessor) return list;
    return [...list].sort(compareWith(sort.dir, accessor));
  }, [donors, sort, filterLapsed, filterOpenPledges]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingBottom: 18,
          marginBottom: 18,
          borderBottom: "1px solid rgba(10,16,25,0.08)",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 4,
            }}
          >
            {loading ? "…" : `${total} ${isProspect ? "leads" : "donors"}`}
            {!isProspect && total > 0 && ` · ${fmtMoney(summaryStats.totalPaid)} lifetime`}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-bricolage), sans-serif",
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            {title}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.55, marginTop: 4 }}>{subtitle}</div>
        </div>
        <Link
          href={`/fundraising/donors/new?status=${status}`}
          style={{
            padding: "9px 16px",
            background: "var(--cast-iron)",
            color: "#fff",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          New {isProspect ? "lead" : "donor"}
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <input
          ref={searchRef}
          placeholder="Search by name, email, organization…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 240,
            padding: "8px 12px",
            border: "1px solid rgba(10,16,25,0.12)",
            borderRadius: 6,
            fontSize: 13,
            outline: "none",
            background: "#fff",
          }}
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid rgba(10,16,25,0.12)",
            borderRadius: 6,
            fontSize: 13,
            background: "#fff",
            minWidth: 160,
          }}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {/* Quick-filter chips — these toggle client-side filters that act on top of search +
            source. They mirror the affordance pattern of the Payments page. */}
        <button
          onClick={() => setFilterLapsed((v) => !v)}
          title="Show only donors with no contact in the last 12 months"
          style={chipStyle(filterLapsed)}
        >
          Lapsed (12m+)
        </button>
        {!isProspect && (
          <button
            onClick={() => setFilterOpenPledges((v) => !v)}
            title="Show only donors with outstanding pledge balance"
            style={chipStyle(filterOpenPledges)}
          >
            Has open pledges
          </button>
        )}
        {sort && (
          <button
            onClick={() => setSort(null)}
            title="Clear sort and go back to natural order"
            style={{
              padding: "7px 12px",
              background: "rgba(10,16,25,0.05)",
              border: "1px solid rgba(10,16,25,0.12)",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--cast-iron)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>Sorted by <strong>{SORT_LABELS[sort.key]}</strong> {sort.dir === "asc" ? "▲" : "▼"}</span>
            <span style={{ opacity: 0.6, fontSize: 13, lineHeight: 1 }}>✕</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 8 }}>
          <SkeletonRows rows={6} columns={5} />
        </div>
      ) : donors.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            No {isProspect ? "leads" : "donors"} yet
          </div>
          <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 18 }}>
            {isProspect
              ? "Add a lead to start tracking outreach."
              : "Add a donor or convert a lead after their first gift."}
          </div>
          <Link
            href={`/fundraising/donors/new?status=${status}`}
            style={{
              padding: "9px 16px",
              background: "var(--cast-iron)",
              color: "#fff",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            New {isProspect ? "lead" : "donor"}
          </Link>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 8, overflow: "hidden" }}>
          {selected.size > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                background: "rgba(28,93,142,0.08)",
                borderBottom: "1px solid rgba(10,16,25,0.08)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {selected.size} selected
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setSelected(new Set())}
                  style={{
                    padding: "5px 12px",
                    background: "transparent",
                    border: "1px solid rgba(10,16,25,0.12)",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkBusy}
                  style={{
                    padding: "5px 14px",
                    background: "var(--cone-orange)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: bulkBusy ? "not-allowed" : "pointer",
                    opacity: bulkBusy ? 0.5 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  {bulkBusy ? "Deleting…" : `Delete ${selected.size}`}
                </button>
              </div>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "transparent", textAlign: "left", borderBottom: "1px solid rgba(10,16,25,0.08)" }}>
                <th style={{ padding: "10px 14px", width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === donors.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <SortTh sort={sort} sortKey="name" onClick={toggleSort}>Name</SortTh>
                <SortTh sort={sort} sortKey="rating" onClick={toggleSort}>Rating</SortTh>
                <SortTh sort={sort} sortKey="contact" onClick={toggleSort}>Contact</SortTh>
                <SortTh sort={sort} sortKey="organization" onClick={toggleSort}>Organization</SortTh>
                <SortTh sort={sort} sortKey="source" onClick={toggleSort}>Source</SortTh>
                {!isProspect && <SortTh sort={sort} sortKey="pledged" onClick={toggleSort} align="right">Pledged</SortTh>}
                {!isProspect && <SortTh sort={sort} sortKey="paid" onClick={toggleSort} align="right">Paid</SortTh>}
                <SortTh sort={sort} sortKey="last_contact" onClick={toggleSort}>Last contact</SortTh>
                <SortTh sort={sort} sortKey="assigned" onClick={toggleSort}>Assigned</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortedDonors.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setPreviewDonorId(d.id)}
                  style={{
                    borderTop: "1px solid rgba(10,16,25,0.05)",
                    cursor: "pointer",
                    background: selected.has(d.id) ? "rgba(28,93,142,0.06)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected.has(d.id)) e.currentTarget.style.background = "rgba(247,243,233,0.7)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selected.has(d.id) ? "rgba(28,93,142,0.06)" : "transparent";
                  }}
                >
                  <td style={{ padding: "10px 14px" }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      aria-label={`Select ${d.first_name}`}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ color: "var(--cast-iron)", fontWeight: 600 }}>
                      {d.first_name} {d.last_name || ""}
                    </span>
                    {(() => {
                      const heb = donorHebrewDisplay(d);
                      return heb ? (
                        <div
                          style={{
                            fontSize: 13,
                            opacity: 0.7,
                            direction: "rtl",
                            textAlign: "left",
                            fontFamily: "'Frank Ruhl Libre', 'David', serif",
                            marginTop: 1,
                          }}
                        >
                          {heb}
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td style={{ padding: "10px 14px" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <StarRating value={d.financial_rating} size={11} readonly hideEmpty />
                      <StarRating value={d.giving_rating} size={11} readonly hideEmpty />
                      {d.financial_rating == null && d.giving_rating == null && (
                        <span style={{ fontSize: 11, opacity: 0.35 }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontSize: 12 }}>{d.primary_phone || "—"}</div>
                    {d.email && <div style={{ fontSize: 11, opacity: 0.6 }}>{d.email}</div>}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>{d.organization || "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>{d.source_name || "—"}</td>
                  {!isProspect && (
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(d.total_pledged)}
                    </td>
                  )}
                  {!isProspect && (
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--shed-green)",
                        fontWeight: 700,
                      }}
                    >
                      {fmtMoney(d.total_paid)}
                    </td>
                  )}
                  <td style={{ padding: "10px 14px", fontSize: 12, opacity: 0.7 }}>{fmtDate(d.last_contact_at)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>{d.assigned_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DonorSidePanel donorId={previewDonorId} onClose={() => setPreviewDonorId(null)} />
    </div>
  );
}

// Filter chip pill — active state uses ink fill, idle state is white with border.
// Matches the chip pattern used on Payments + Collections pages.
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "7px 12px",
    background: active ? "var(--cast-iron)" : "#fff",
    color: active ? "#fff" : "var(--cast-iron)",
    border: active ? "1px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}

// Clickable sortable column header. Renders the column title plus a tiny arrow indicator
// when this column is the active sort. The arrow direction (▲/▼) tells the user whether
// they're seeing ascending or descending; clicking again toggles direction; a third click
// removes the sort entirely. Uses uppercase letterspaced text matching the original Th.
function SortTh({
  children,
  sortKey,
  sort,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const arrow = active ? (sort!.dir === "asc" ? "▲" : "▼") : null;
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        padding: "10px 14px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        opacity: active ? 0.95 : 0.6,
        textAlign: align,
        cursor: "pointer",
        userSelect: "none",
        color: active ? "var(--cast-iron)" : "inherit",
      }}
      title="Click to sort. Click again to reverse, a third time to clear."
    >
      <span style={{ display: "inline-flex", gap: 5, alignItems: "center", justifyContent: align === "right" ? "flex-end" : "flex-start", width: "100%" }}>
        {children}
        {arrow && (
          <span style={{ fontSize: 9, opacity: 0.7, lineHeight: 1 }}>{arrow}</span>
        )}
      </span>
    </th>
  );
}
