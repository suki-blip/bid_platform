"use client";

import { useEffect, useState } from "react";
import DonorSidePanel from "../_components/DonorSidePanel";
import { fmtMoney, fmtDate, daysOverdue } from "@/lib/fundraising-format";

interface CollectionItem {
  id: string;
  amount: number;
  method: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  installment_number: number;
  installments_total: number;
  check_number: string | null;
  bank_name: string | null;
  cc_last4: string | null;
  notes: string | null;
  donor_id: string;
  donor_name: string;
  primary_phone: string | null;
  project_name: string | null;
  pledge_id: string;
}

interface Summary {
  overdue: { amount: number; count: number };
  upcoming: { amount: number; count: number };
  bounced: { amount: number; count: number };
}

type View = "all" | "overdue" | "upcoming" | "bounced";


export default function CollectionsPage() {
  const [view, setView] = useState<View>("overdue");
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewDonorId, setPreviewDonorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fundraising/collections?view=${view}`)
      .then((r) => (r.ok ? r.json() : { items: [], summary: null }))
      .then((d) => {
        if (cancelled) return;
        setItems(d.items || []);
        setSummary(d.summary || null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, reloadKey]);

  async function markPaid(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`/api/fundraising/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", paid_date: today }),
    });
    setReloadKey((k) => k + 1);
  }

  async function markBounced(id: string) {
    if (!confirm("Mark as bounced?")) return;
    await fetch(`/api/fundraising/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "bounced" }),
    });
    setReloadKey((k) => k + 1);
  }

  async function reschedule(id: string) {
    const newDate = prompt("New due date (YYYY-MM-DD):");
    if (!newDate) return;
    await fetch(`/api/fundraising/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ due_date: newDate, status: "scheduled" }),
    });
    setReloadKey((k) => k + 1);
  }

  async function cancelPayment(id: string) {
    if (!confirm("Cancel this payment? It will not count toward collections.")) return;
    await fetch(`/api/fundraising/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setReloadKey((k) => k + 1);
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Collections
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Pledges that need follow-up — overdue payments, bounced checks, failed credit cards.
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
          <Stat label="Overdue" value={fmtMoney(summary.overdue.amount)} sub={`${summary.overdue.count} payment${summary.overdue.count === 1 ? "" : "s"}`} tone="danger" />
          <Stat label="Bounced / failed" value={fmtMoney(summary.bounced.amount)} sub={`${summary.bounced.count} payment${summary.bounced.count === 1 ? "" : "s"}`} tone="warn" />
          <Stat label="Upcoming (30d)" value={fmtMoney(summary.upcoming.amount)} sub={`${summary.upcoming.count} payment${summary.upcoming.count === 1 ? "" : "s"}`} tone="info" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid rgba(10,16,25,0.08)" }}>
        {(
          [
            { k: "overdue", label: "Overdue" },
            { k: "bounced", label: "Bounced / failed" },
            { k: "upcoming", label: "Upcoming" },
            { k: "all", label: "All open" },
          ] as { k: View; label: string }[]
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: view === t.k ? "2px solid var(--cast-iron)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: view === t.k ? "var(--cast-iron)" : "rgba(10,16,25,0.55)",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", background: "#fff", border: "1px dashed rgba(10,16,25,0.12)", borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Nothing to collect 🙌</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>All payments in this view are squared away.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fbf7ec", textAlign: "left" }}>
                <Th>Donor</Th>
                <Th>Project</Th>
                <Th>Method</Th>
                <Th align="right">Amount</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const overdue = daysOverdue(item.due_date);
                return (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(10,16,25,0.05)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() => setPreviewDonorId(item.donor_id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "var(--cast-iron)",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: "inherit",
                          textAlign: "left",
                        }}
                      >
                        {item.donor_name}
                      </button>
                      {item.primary_phone && (
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          <a href={`tel:${item.primary_phone}`} style={{ color: "inherit", textDecoration: "none" }}>
                            {item.primary_phone}
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{item.project_name || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ textTransform: "capitalize" }}>{item.method.replace("_", " ")}</div>
                      <div style={{ fontSize: 10, opacity: 0.55 }}>
                        {item.method === "check" && item.check_number && `#${item.check_number}`}
                        {item.method === "credit_card" && item.cc_last4 && `····${item.cc_last4}`}
                        {item.installments_total > 1 && ` · #${item.installment_number}/${item.installments_total}`}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(item.amount)}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>
                      {fmtDate(item.due_date)}
                      {overdue > 0 && item.status !== "paid" && (
                        <div style={{ fontSize: 10, color: "var(--cone-orange)", fontWeight: 700 }}>
                          {overdue}d overdue
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          borderRadius: 999,
                          background:
                            item.status === "bounced" || item.status === "failed"
                              ? "rgba(232,93,31,0.12)"
                              : "rgba(28,93,142,0.1)",
                          color:
                            item.status === "bounced" || item.status === "failed"
                              ? "var(--cone-orange)"
                              : "var(--blueprint)",
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => markPaid(item.id)} style={actionBtn} title="Mark paid">
                        ✓ Paid
                      </button>{" "}
                      <button onClick={() => reschedule(item.id)} style={actionBtnGhost} title="Reschedule">
                        Reschedule
                      </button>{" "}
                      {item.status !== "bounced" && item.method === "check" && (
                        <>
                          <button onClick={() => markBounced(item.id)} style={{ ...actionBtnGhost, color: "var(--cone-orange)" }}>
                            Bounce
                          </button>{" "}
                        </>
                      )}
                      <button onClick={() => cancelPayment(item.id)} style={{ ...actionBtnGhost, color: "rgba(10,16,25,0.5)" }}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DonorSidePanel donorId={previewDonorId} onClose={() => setPreviewDonorId(null)} />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "info" | "warn" | "danger" }) {
  const colors = { info: "var(--blueprint)", warn: "var(--high-vis)", danger: "var(--cone-orange)" };
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "var(--font-bricolage), sans-serif", fontWeight: 800, color: colors[tone], marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 1 }}>{sub}</div>
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

const actionBtn: React.CSSProperties = {
  padding: "5px 10px",
  background: "var(--shed-green)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
};

const actionBtnGhost: React.CSSProperties = {
  padding: "5px 8px",
  background: "transparent",
  color: "var(--blueprint)",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
};
