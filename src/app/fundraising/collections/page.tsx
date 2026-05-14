"use client";

import { useEffect, useMemo, useState } from "react";
import DonorSidePanel from "../_components/DonorSidePanel";
import CardChargeModal from "../_components/CardChargeModal";
import DataTable, { type DataTableColumn } from "../_components/DataTable";
import { fmtMoney, fmtDate, daysOverdue, fmtMethod } from "@/lib/fundraising-format";

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
  // Pledge-level rollup (joined in the API): total commitment + total paid on this pledge.
  // Used to show the donor's bigger picture next to the row's installment amount.
  pledge_amount: number;
  pledge_paid_total: number;
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
  // Charge dialog — when set, the in-system iFields card form opens for this row.
  const [chargingItem, setChargingItem] = useState<CollectionItem | null>(null);

  // Client-side filters — applied over whatever the API returned for the chosen view
  const [filterDonor, setFilterDonor] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");

  const filtered = useMemo(() => {
    const q = filterDonor.trim().toLowerCase();
    const min = Number(filterMin);
    const max = Number(filterMax);
    return items.filter((it) => {
      if (q && !(it.donor_name.toLowerCase().includes(q) || (it.primary_phone || "").includes(q))) return false;
      if (filterProject && it.project_name !== filterProject) return false;
      if (filterMethod && it.method !== filterMethod) return false;
      if (filterMin && it.amount < min) return false;
      if (filterMax && max > 0 && it.amount > max) return false;
      return true;
    });
  }, [items, filterDonor, filterProject, filterMethod, filterMin, filterMax]);

  const anyFilter = !!(filterDonor || filterProject || filterMethod || filterMin || filterMax);
  function clearFilters() {
    setFilterDonor("");
    setFilterProject("");
    setFilterMethod("");
    setFilterMin("");
    setFilterMax("");
  }

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

      {/* Filters — donor name/phone, project, method, amount range */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,16,25,0.08)",
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 90px 90px auto",
          gap: 8,
          alignItems: "end",
        }}
      >
        <div>
          <label style={fLabel}>Donor (name or phone)</label>
          <input value={filterDonor} onChange={(e) => setFilterDonor(e.target.value)} placeholder="Search donor…" style={fInput} />
        </div>
        <div>
          <label style={fLabel}>Project</label>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={fInput}>
            <option value="">— Any —</option>
            {Array.from(new Set(items.map((i) => i.project_name).filter((s): s is string => !!s))).sort().map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={fLabel}>Method</label>
          <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} style={fInput}>
            <option value="">— Any —</option>
            {Array.from(new Set(items.map((i) => i.method).filter(Boolean))).sort().map((m) => (
              <option key={m} value={m}>{fmtMethod(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={fLabel}>Min $</label>
          <input type="number" value={filterMin} onChange={(e) => setFilterMin(e.target.value)} placeholder="0" style={fInput} />
        </div>
        <div>
          <label style={fLabel}>Max $</label>
          <input type="number" value={filterMax} onChange={(e) => setFilterMax(e.target.value)} placeholder="∞" style={fInput} />
        </div>
        {anyFilter ? (
          <button onClick={clearFilters} style={{ padding: "8px 12px", background: "transparent", border: "1px solid rgba(10,16,25,0.15)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Clear</button>
        ) : (
          <div />
        )}
      </div>
      {anyFilter && (
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>
          Showing {filtered.length} of {items.length}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", background: "#fff", border: "1px dashed rgba(10,16,25,0.12)", borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Nothing to collect 🙌</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>All payments in this view are squared away.</div>
        </div>
      ) : (
        <DataTable
          data={filtered}
          rowKey={(i) => i.id}
          emptyMessage={
            <span>
              No items match these filters.{" "}
              <button onClick={clearFilters} style={{ background: "none", border: "none", color: "var(--blueprint)", cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 600 }}>
                Clear
              </button>
            </span>
          }
          storageKey="collections"
          columns={[
            {
              key: "donor",
              header: "Donor",
              accessor: (i) => i.donor_name,
              render: (item) => (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewDonorId(item.donor_id);
                    }}
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
                </>
              ),
            },
            {
              key: "project",
              header: "Project",
              accessor: (i) => i.project_name || "(General)",
              render: (i) => <span style={{ fontSize: 12 }}>{i.project_name || "—"}</span>,
            },
            {
              key: "method",
              header: "Method",
              accessor: (i) => i.method,
              filterDisplay: (v) => fmtMethod(String(v)),
              render: (item) => (
                <span style={{ fontSize: 12 }}>
                  <div style={{ textTransform: "capitalize" }}>{fmtMethod(item.method)}</div>
                  <div style={{ fontSize: 10, opacity: 0.55 }}>
                    {item.method === "check" && item.check_number && `#${item.check_number}`}
                    {item.method === "credit_card" && item.cc_last4 && `····${item.cc_last4}`}
                    {item.installments_total > 1 && ` · #${item.installment_number}/${item.installments_total}`}
                  </div>
                </span>
              ),
            },
            {
              key: "installment",
              header: "Installment",
              accessor: (i) => i.amount,
              render: (i) => <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(i.amount)}</span>,
              align: "right",
            },
            {
              key: "pledge_total",
              header: "Pledge total",
              accessor: (i) => i.pledge_amount,
              render: (i) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>{fmtMoney(i.pledge_amount)}</span>,
              align: "right",
            },
            {
              key: "owed",
              header: "Still owed",
              accessor: (i) => Math.max(0, i.pledge_amount - i.pledge_paid_total),
              render: (item) => {
                const remaining = Math.max(0, item.pledge_amount - item.pledge_paid_total);
                return (
                  <span style={{ color: remaining > 0 ? "var(--cone-orange)" : "var(--shed-green)", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                    {fmtMoney(remaining)}
                  </span>
                );
              },
              align: "right",
            },
            {
              key: "due",
              header: "Due",
              accessor: (i) => i.due_date,
              render: (item) => {
                const overdue = daysOverdue(item.due_date);
                return (
                  <span style={{ fontSize: 12 }}>
                    {fmtDate(item.due_date)}
                    {overdue > 0 && item.status !== "paid" && (
                      <div style={{ fontSize: 10, color: "var(--cone-orange)", fontWeight: 700 }}>{overdue}d overdue</div>
                    )}
                  </span>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              accessor: (i) => i.status,
              render: (item) => (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: item.status === "bounced" || item.status === "failed" ? "rgba(232,93,31,0.12)" : "rgba(28,93,142,0.1)",
                    color: item.status === "bounced" || item.status === "failed" ? "var(--cone-orange)" : "var(--blueprint)",
                  }}
                >
                  {item.status}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              accessor: () => null,
              sortable: false,
              filterable: false,
              align: "right",
              render: (item) => (
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setChargingItem(item); }}
                    style={{
                      padding: "5px 10px",
                      background: "var(--blueprint)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                    title="Charge a card now via Sola"
                  >
                    💳 Charge
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); markPaid(item.id); }} style={actionBtn} title="Mark paid">
                    ✓ Paid
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); reschedule(item.id); }} style={actionBtnGhost} title="Reschedule">
                    Reschedule
                  </button>
                  {item.status !== "bounced" && item.method === "check" && (
                    <button onClick={(e) => { e.stopPropagation(); markBounced(item.id); }} style={{ ...actionBtnGhost, color: "var(--cone-orange)" }}>
                      Bounce
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); cancelPayment(item.id); }} style={{ ...actionBtnGhost, color: "rgba(10,16,25,0.5)" }}>
                    Cancel
                  </button>
                </div>
              ),
            },
          ] as DataTableColumn<CollectionItem>[]}
        />
      )}

      <DonorSidePanel donorId={previewDonorId} onClose={() => setPreviewDonorId(null)} />

      {chargingItem && (
        <CardChargeModal
          donorId={chargingItem.donor_id}
          amount={chargingItem.amount}
          pledgeId={chargingItem.pledge_id}
          paymentId={chargingItem.id}
          description={`${chargingItem.project_name || "General"} · installment #${chargingItem.installment_number}`}
          donorLabel={chargingItem.donor_name}
          pledgeLabel={`${fmtMoney(chargingItem.amount)} due ${fmtDate(chargingItem.due_date)} · ${chargingItem.project_name || "General"}`}
          onClose={() => setChargingItem(null)}
          onCharged={() => {
            setChargingItem(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
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

const fLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.55,
  display: "block",
  marginBottom: 3,
};
const fInput: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 13,
  width: "100%",
  outline: "none",
  background: "#fff",
};
