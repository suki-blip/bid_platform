"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DonorSidePanel from "./DonorSidePanel";
import StarRating from "./StarRating";
import { fmtMoney, fmtDate } from "@/lib/fundraising-format";

interface DonorRow {
  id: string;
  status: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
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

interface SourceRow {
  id: string;
  name: string;
}

export default function DonorListView({ status }: { status: "prospect" | "donor" }) {
  const [donors, setDonors] = useState<DonorRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [previewDonorId, setPreviewDonorId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
    } else {
      const e = await r.json().catch(() => ({}));
      alert(e.error || "Delete failed");
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
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>Loading…</div>
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
                <Th>Name</Th>
                <Th>Rating</Th>
                <Th>Contact</Th>
                <Th>Organization</Th>
                <Th>Source</Th>
                {!isProspect && <Th align="right">Pledged</Th>}
                {!isProspect && <Th align="right">Paid</Th>}
                <Th>Last contact</Th>
                <Th>Assigned</Th>
              </tr>
            </thead>
            <tbody>
              {donors.map((d) => (
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
                    {d.hebrew_name && (
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.55,
                          direction: "rtl",
                          textAlign: "left",
                          fontFamily: "'Frank Ruhl Libre', 'David', serif",
                        }}
                      >
                        {d.hebrew_name}
                      </div>
                    )}
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

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        padding: "10px 14px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        opacity: 0.6,
        textAlign: align,
      }}
    >
      {children}
    </th>
  );
}
