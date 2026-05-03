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
  }, [status, search, sourceFilter]);

  const isProspect = status === "prospect";
  const title = isProspect ? "Prospects" : "Donors";
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
            {loading ? "…" : `${total} ${isProspect ? "prospects" : "donors"}`}
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
          New {isProspect ? "prospect" : "donor"}
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
            No {isProspect ? "prospects" : "donors"} yet
          </div>
          <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 18 }}>
            {isProspect
              ? "Add a prospect to start tracking outreach."
              : "Add a donor or convert a prospect after their first gift."}
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
            New {isProspect ? "prospect" : "donor"}
          </Link>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "transparent", textAlign: "left", borderBottom: "1px solid rgba(10,16,25,0.08)" }}>
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
                  style={{ borderTop: "1px solid rgba(10,16,25,0.05)", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(247,243,233,0.7)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
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
