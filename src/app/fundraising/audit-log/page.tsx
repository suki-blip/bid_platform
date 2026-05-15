"use client";

// Audit log viewer (manager-only). Lists every recorded change — donor edits, payments
// deleted, pledges modified, campaign blasts sent — newest first. Each row shows WHO did
// WHAT to WHICH entity WHEN.
//
// Filters: entity_type (donor / pledge / payment / blast / template) so a manager can
// drill in to one area without scrolling through everything.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SkeletonRows } from "../_components/Skeleton";

interface Entry {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;       // e.g. 'donor.update', 'pledge.delete'
  summary: string | null;
  diff: Record<string, unknown> | null;
  at: string;           // 'YYYY-MM-DD HH:MM:SS' UTC
}

type EntityFilter = "all" | "donor" | "pledge" | "payment" | "blast" | "template" | "card";

const ENTITY_LABEL: Record<string, string> = {
  donor: "Donor",
  pledge: "Pledge",
  payment: "Payment",
  blast: "Blast",
  template: "Template",
  card: "Card",
};

// Color tag per entity type — matches the recycle bin's TYPE_COLOR pattern for consistency.
const ENTITY_COLOR: Record<string, string> = {
  donor: "rgba(232,93,31,0.10)",
  pledge: "rgba(38,90,180,0.10)",
  payment: "rgba(40,140,80,0.10)",
  blast: "rgba(120,80,160,0.10)",
  template: "rgba(180,140,40,0.10)",
  card: "rgba(80,80,80,0.10)",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EntityFilter>("all");
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("entity_type", filter);
    params.set("limit", "300");
    fetch(`/api/fundraising/audit-log?${params}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => {
        setEntries(Array.isArray(d.entries) ? d.entries : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const visible = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      (e.summary || "").toLowerCase().includes(q) ||
      (e.actor_label || "").toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q),
    );
  }, [entries, search]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Audit Log
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Every recorded change to donors, pledges, payments, blasts, and templates. Manager-only — used to track who edited what when.
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {(["all", "donor", "pledge", "payment", "blast", "template", "card"] as EntityFilter[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: filter === k ? "1px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
              background: filter === k ? "var(--cast-iron)" : "#fff",
              color: filter === k ? "#fff" : "var(--cast-iron)",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {k === "all" ? "All" : ENTITY_LABEL[k] + "s"}
          </button>
        ))}
        <input
          placeholder="Search summary, actor, action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            padding: "8px 12px",
            border: "1px solid rgba(10,16,25,0.12)",
            borderRadius: 6,
            fontSize: 13,
            outline: "none",
            background: "#fff",
          }}
        />
      </div>

      {loading ? (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 10 }}>
          <SkeletonRows rows={8} columns={4} />
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            background: "#fff",
            border: "1px dashed rgba(10,16,25,0.12)",
            borderRadius: 10,
            color: "rgba(10,16,25,0.55)",
          }}
        >
          {entries.length === 0 ? "No audited activity yet." : "No entries match this filter."}
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.10)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(10,16,25,0.025)", textAlign: "left" }}>
                <th style={th}>When</th>
                <th style={th}>Who</th>
                <th style={th}>What</th>
                <th style={th}>Summary</th>
                <th style={th}>Entity</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const [entType, actionVerb] = e.action.split(".");
                return (
                  <tr key={e.id} style={{ borderTop: "1px solid rgba(10,16,25,0.06)" }}>
                    <td style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontSize: 12, opacity: 0.7 }}>
                      {new Date(e.at.replace(" ", "T") + "Z").toLocaleString()}
                    </td>
                    <td style={td}>{e.actor_label || <span style={{ opacity: 0.5 }}>System</span>}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          background: ENTITY_COLOR[entType] || "rgba(10,16,25,0.05)",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          borderRadius: 4,
                        }}
                      >
                        {actionVerb}
                      </span>
                    </td>
                    <td style={td}>{e.summary || <span style={{ opacity: 0.5 }}>—</span>}</td>
                    <td style={td}>
                      {e.entity_id && entType === "donor" ? (
                        <Link href={`/fundraising/donors/${e.entity_id}`} style={{ color: "var(--blueprint)", textDecoration: "none", fontSize: 12 }}>
                          {ENTITY_LABEL[entType]} →
                        </Link>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.6 }}>{ENTITY_LABEL[entType] || entType}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
};

const td: React.CSSProperties = {
  padding: "11px 14px",
  verticalAlign: "middle",
};
