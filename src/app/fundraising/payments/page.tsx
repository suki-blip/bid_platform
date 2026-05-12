"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtDate, fmtMethod } from "@/lib/fundraising-format";
import PaymentEditModal from "../_components/PaymentEditModal";

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  installment_number: number;
  check_number: string | null;
  bank_name: string | null;
  cc_last4: string | null;
  cc_holder: string | null;
  transaction_ref: string | null;
  notes: string | null;
  pledge_id: string;
  donor_id: string;
  project_id: string | null;
  donor_first_name: string;
  donor_last_name: string | null;
  donor_hebrew_name: string | null;
  project_name: string | null;
}

interface Totals {
  total_count: number;
  paid_sum: number;
  scheduled_sum: number;
  bounced_sum: number;
}

// Status filter chips. 'all' is special — shows everything (including pending_processor).
const STATUS_CHIPS: { value: string; label: string; statuses?: string[] }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid", statuses: ["paid"] },
  { value: "scheduled", label: "Scheduled", statuses: ["scheduled"] },
  { value: "bounced", label: "Bounced / failed", statuses: ["bounced", "failed"] },
  { value: "pending_processor", label: "Pending gateway", statuses: ["pending_processor"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editing, setEditing] = useState<PaymentRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    const chip = STATUS_CHIPS.find((c) => c.value === filterStatus);
    if (chip?.statuses) params.set("status", chip.statuses.join(","));
    if (search.trim()) params.set("search", search.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("limit", "500");

    fetch(`/api/fundraising/payments?${params}`)
      .then((r) => (r.ok ? r.json() : { payments: [], totals: null }))
      .then((d) => {
        setRows(d.payments || []);
        setTotals(d.totals || null);
        setLoading(false);
      });
  }, [filterStatus, search, fromDate, toDate]);

  // Debounce the search so we don't spam the API as the user types.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const visibleRows = useMemo(() => rows, [rows]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Payments
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Every payment across all donors. Click Edit to modify amount, method, dates, status, or notes — or delete a payment that was entered by mistake.
        </div>
      </div>

      {/* Summary cards */}
      {totals && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <SummaryCard label="Total payments" value={String(totals.total_count)} />
          <SummaryCard label="Paid total" value={fmtMoney(totals.paid_sum)} tint="green" />
          <SummaryCard label="Scheduled total" value={fmtMoney(totals.scheduled_sum)} tint="blue" />
          {totals.bounced_sum > 0 && (
            <SummaryCard label="Bounced / failed" value={fmtMoney(totals.bounced_sum)} tint="orange" />
          )}
        </div>
      )}

      {/* Filters bar */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,16,25,0.08)",
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilterStatus(c.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: filterStatus === c.value ? "1px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                background: filterStatus === c.value ? "var(--cast-iron)" : "#fff",
                color: filterStatus === c.value ? "#fff" : "var(--cast-iron)",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by donor name (English or Hebrew) or project…"
            style={input}
          />
          <div>
            <label style={smallLabel}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={input} />
          </div>
          <div>
            <label style={smallLabel}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={input} />
          </div>
          {(search || fromDate || toDate) && (
            <button
              onClick={() => {
                setSearch("");
                setFromDate("");
                setToDate("");
              }}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid rgba(10,16,25,0.15)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ opacity: 0.5, padding: 30 }}>Loading…</div>
      ) : visibleRows.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px dashed rgba(10,16,25,0.12)",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            fontSize: 14,
            opacity: 0.6,
          }}
        >
          No payments match these filters.
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(10,16,25,0.08)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 100px 110px 110px 130px 110px",
              gap: 12,
              padding: "10px 14px",
              borderBottom: "1px solid rgba(10,16,25,0.08)",
              background: "rgba(10,16,25,0.02)",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              opacity: 0.7,
            }}
          >
            <div>Date</div>
            <div>Donor / project</div>
            <div style={{ textAlign: "right" }}>Amount</div>
            <div>Method</div>
            <div>Status</div>
            <div>Ref</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {visibleRows.map((p) => {
            const date = p.paid_date || p.due_date || "";
            const donorName = `${p.donor_first_name} ${p.donor_last_name || ""}`.trim();
            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 100px 110px 110px 130px 110px",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(10,16,25,0.05)",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7 }}>{date ? fmtDate(date) : "—"}</div>
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/fundraising/donors/${p.donor_id}`}
                    style={{ fontWeight: 700, color: "var(--cast-iron)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                  >
                    {donorName}
                  </Link>
                  <div style={{ fontSize: 11, opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.project_name || "General"}
                    {p.installment_number > 1 && ` · #${p.installment_number}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(p.amount)}
                </div>
                <div style={{ fontSize: 12 }}>{fmtMethod(p.method)}</div>
                <div>
                  <StatusPill status={p.status} />
                </div>
                <div style={{ fontSize: 11, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.check_number
                    ? `#${p.check_number}`
                    : p.cc_last4
                    ? `•••• ${p.cc_last4}`
                    : p.transaction_ref || "—"}
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setEditing(p)}
                    style={{
                      padding: "5px 12px",
                      background: "transparent",
                      color: "var(--blueprint)",
                      border: "1px solid rgba(28,93,142,0.3)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal — supports delete from within. */}
      {editing && (
        <PaymentEditModal
          payment={{
            id: editing.id,
            amount: editing.amount,
            method: editing.method,
            status: editing.status,
            due_date: editing.due_date,
            paid_date: editing.paid_date,
            notes: editing.notes,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "blue" | "orange" }) {
  const tints = {
    green: { bg: "rgba(45,122,61,0.06)", border: "rgba(45,122,61,0.25)", color: "var(--shed-green)" },
    blue: { bg: "rgba(28,93,142,0.06)", border: "rgba(28,93,142,0.25)", color: "var(--blueprint)" },
    orange: { bg: "rgba(232,93,31,0.06)", border: "rgba(232,93,31,0.25)", color: "var(--cone-orange)" },
  };
  const t = tint ? tints[tint] : { bg: "#fff", border: "rgba(10,16,25,0.08)", color: "var(--cast-iron)" };
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontFamily: "var(--font-bricolage), sans-serif",
          fontWeight: 800,
          color: t.color,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid: { bg: "rgba(45,122,61,0.12)", color: "var(--shed-green)", label: "Paid" },
    scheduled: { bg: "rgba(10,16,25,0.06)", color: "rgba(10,16,25,0.6)", label: "Scheduled" },
    bounced: { bg: "rgba(232,93,31,0.12)", color: "var(--cone-orange)", label: "Bounced" },
    failed: { bg: "rgba(232,93,31,0.12)", color: "var(--cone-orange)", label: "Failed" },
    pending_processor: { bg: "rgba(28,93,142,0.1)", color: "var(--blueprint)", label: "Pending" },
    cancelled: { bg: "rgba(10,16,25,0.04)", color: "rgba(10,16,25,0.4)", label: "Cancelled" },
  };
  const cfg = map[status] || { bg: "rgba(10,16,25,0.06)", color: "rgba(10,16,25,0.6)", label: status };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "3px 8px",
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

const input: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 13,
  width: "100%",
  outline: "none",
  background: "#fff",
};

const smallLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.55,
  display: "block",
  marginBottom: 3,
};
