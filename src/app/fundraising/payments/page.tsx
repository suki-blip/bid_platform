"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtDate, fmtMethod } from "@/lib/fundraising-format";
import { useToast } from "@/lib/use-toast";
import PaymentEditModal from "../_components/PaymentEditModal";
import PledgeEditModal from "../_components/PledgeEditModal";
import DataTable, { type DataTableColumn } from "../_components/DataTable";
import { SkeletonRows } from "../_components/Skeleton";

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

interface MethodFacet {
  method: string;
  count: number;
}

// One row in the "Audit: top paid payments" diagnostic. Used when the user notices the
// Paid total looks wrong and wants to find the largest rows contributing to it.
interface AuditRow {
  id: string;
  amount: number;
  method: string;
  status: string;
  paid_date: string | null;
  due_date: string | null;
  created_at: string | null;
  transaction_ref: string | null;
  cc_last4: string | null;
  donor_id: string;
  pledge_id: string;
  project_id: string | null;
  donor_first_name: string;
  donor_last_name: string | null;
  donor_hebrew_name: string | null;
  project_name: string | null;
  is_standalone: boolean;
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

// Wrap the page in Suspense so useSearchParams() (used to read ?pledge_id=) doesn't break
// Next.js's static prerender pass — same pattern as /fundraising/payment.
export default function PaymentsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, opacity: 0.6 }}>Loading payments…</div>}>
      <PaymentsPageInner />
    </Suspense>
  );
}

function PaymentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  // ?pledge_id=X focuses the page on a single pledge's payments. Set from outside (e.g.,
  // the Pledge edit modal will eventually link here) or by user copy/paste of the URL.
  const pledgeId = searchParams?.get("pledge_id") || "";

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [methodFacets, setMethodFacets] = useState<MethodFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  // method[] — empty array = no method filter, otherwise show only payments whose method is
  // in the set. Multi-select chips, like Excel column-filter style at the top of the page.
  const [filterMethods, setFilterMethods] = useState<string[]>([]);
  // 'all' | 'pledge' | 'standalone'. Hides payments based on is_standalone of their pledge.
  const [filterType, setFilterType] = useState<"all" | "pledge" | "standalone">("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editing, setEditing] = useState<PaymentRow | null>(null);

  // Audit modal state — top paid payments diagnostic.
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  function clearPledgeFilter() {
    // Strip ?pledge_id from the URL but keep any other query params.
    const next = new URLSearchParams(Array.from(searchParams?.entries() || []));
    next.delete("pledge_id");
    const qs = next.toString();
    router.replace(`/fundraising/payments${qs ? "?" + qs : ""}`);
  }

  function toggleMethod(m: string) {
    setFilterMethods((current) =>
      current.includes(m) ? current.filter((x) => x !== m) : [...current, m],
    );
  }

  // Pledge editor state — when user clicks "Pledge" on a payment row.
  // We lazy-fetch the pledge details when opening so we have full pledge fields (notes, due_date,
  // project_id) — the payment row only carries pledge_id.
  const [editingPledgeId, setEditingPledgeId] = useState<string | null>(null);
  const [pledgeDetails, setPledgeDetails] = useState<{
    id: string;
    amount: number;
    paid_amount: number;
    status: string;
    pledge_date: string;
    due_date: string | null;
    project_id: string | null;
    notes: string | null;
    collection_mode: string | null;
    donor_id: string;
    donor_label?: string;
  } | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    // Lazy-load projects (cheap, used by the pledge editor's project dropdown)
    fetch("/api/fundraising/projects?status=active")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProjects(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (!editingPledgeId) {
      setPledgeDetails(null);
      return;
    }
    fetch(`/api/fundraising/pledges/${editingPledgeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.pledge) return;
        const p = d.pledge;
        // Compute paid_amount from the linked payments (status='paid')
        const paid = (d.payments || [])
          .filter((pp: { status: string }) => pp.status === "paid")
          .reduce((s: number, pp: { amount: number }) => s + Number(pp.amount), 0);
        // Pull donor name from the row in our list to label the modal
        const row = rows.find((r) => r.pledge_id === editingPledgeId);
        const donorLabel = row ? `${row.donor_first_name} ${row.donor_last_name || ""}`.trim() : undefined;
        setPledgeDetails({
          id: p.id,
          amount: Number(p.amount),
          paid_amount: paid,
          status: p.status,
          pledge_date: p.pledge_date,
          due_date: p.due_date || null,
          project_id: p.project_id || null,
          notes: p.notes || null,
          collection_mode: p.collection_mode || null,
          donor_id: row ? row.donor_id : "",
          donor_label: donorLabel,
        });
      });
  }, [editingPledgeId, rows]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    const chip = STATUS_CHIPS.find((c) => c.value === filterStatus);
    if (chip?.statuses) params.set("status", chip.statuses.join(","));
    if (filterMethods.length > 0) params.set("method", filterMethods.join(","));
    if (filterType !== "all") params.set("type", filterType);
    if (pledgeId) params.set("pledge_id", pledgeId);
    if (search.trim()) params.set("search", search.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("limit", "500");

    fetch(`/api/fundraising/payments?${params}`)
      .then((r) => (r.ok ? r.json() : { payments: [], totals: null, method_facets: [] }))
      .then((d) => {
        setRows(d.payments || []);
        setTotals(d.totals || null);
        setMethodFacets(Array.isArray(d.method_facets) ? d.method_facets : []);
        setLoading(false);
      });
  }, [filterStatus, filterMethods, filterType, pledgeId, search, fromDate, toDate]);

  async function openAudit() {
    setAuditOpen(true);
    setAuditLoading(true);
    const r = await fetch("/api/fundraising/payments?audit=top_paid");
    const d = await r.json().catch(() => ({ rows: [] }));
    setAuditRows(Array.isArray(d.rows) ? d.rows : []);
    setAuditLoading(false);
  }

  // Export the visible rows as CSV. Triggered from the toolbar; uses RFC-4180 escaping so
  // names with commas / quotes don't break the file. Excel-friendly UTF-8 BOM at the start
  // so Hebrew names render correctly when opened in Excel/Numbers.
  function exportPaymentsCsv() {
    const headers = ["Date", "Donor", "Hebrew Name", "Project", "Amount", "Method", "Status", "Reference"];
    const escape = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = rows.map((p) => [
      escape(p.paid_date || p.due_date),
      escape(`${p.donor_first_name} ${p.donor_last_name || ""}`.trim()),
      escape(p.donor_hebrew_name),
      escape(p.project_name || "General"),
      escape(p.amount.toFixed(2)),
      escape(fmtMethod(p.method)),
      escape(p.status),
      escape(p.check_number || p.cc_last4 || p.transaction_ref),
    ].join(","));
    const csv = [headers.map(escape).join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `payments-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} rows`);
  }

  // Debounce the search so we don't spam the API as the user types.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const visibleRows = useMemo(() => rows, [rows]);

  // DataTable column definitions. Each column declares how to extract its sortable/filterable
  // value (`accessor`) and how to render its cell (`render`). The Actions column has both
  // sortable and filterable disabled because it's pure UI (buttons).
  const columns = useMemo<DataTableColumn<PaymentRow>[]>(() => [
    {
      key: "date",
      header: "Date",
      accessor: (p) => p.paid_date || p.due_date || null,
      render: (p) => {
        const d = p.paid_date || p.due_date;
        return <span style={{ fontSize: 12, opacity: 0.75 }}>{d ? fmtDate(d) : "—"}</span>;
      },
      width: 110,
    },
    {
      key: "donor",
      header: "Donor",
      accessor: (p) => `${p.donor_first_name} ${p.donor_last_name || ""}`.trim(),
      render: (p) => (
        <>
          <Link
            href={`/fundraising/donors/${p.donor_id}`}
            style={{ fontWeight: 700, color: "var(--cast-iron)", textDecoration: "none" }}
          >
            {`${p.donor_first_name} ${p.donor_last_name || ""}`.trim()}
          </Link>
          {p.donor_hebrew_name && (
            <div
              style={{
                fontSize: 12,
                opacity: 0.6,
                direction: "rtl",
                fontFamily: "'Frank Ruhl Libre', 'David', serif",
              }}
            >
              {p.donor_hebrew_name}
            </div>
          )}
        </>
      ),
    },
    {
      key: "project",
      header: "Project",
      accessor: (p) => p.project_name || "General",
      render: (p) => (
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {p.project_name || "General"}
          {p.installment_number > 1 && <span style={{ opacity: 0.55 }}> · #{p.installment_number}</span>}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      accessor: (p) => p.amount,
      render: (p) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(p.amount)}</span>
      ),
      align: "right",
      width: 110,
    },
    {
      key: "method",
      header: "Method",
      accessor: (p) => p.method,
      render: (p) => <span style={{ fontSize: 12 }}>{fmtMethod(p.method)}</span>,
      filterDisplay: (v) => fmtMethod(String(v)),
      width: 130,
    },
    {
      key: "status",
      header: "Status",
      accessor: (p) => p.status,
      render: (p) => <StatusPill status={p.status} />,
      width: 120,
    },
    {
      key: "ref",
      header: "Ref",
      accessor: (p) => p.check_number || p.cc_last4 || p.transaction_ref || null,
      render: (p) => (
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          {p.check_number ? `#${p.check_number}` : p.cc_last4 ? `•••• ${p.cc_last4}` : p.transaction_ref || "—"}
        </span>
      ),
      width: 130,
    },
    {
      key: "actions",
      header: "",
      accessor: () => null,
      sortable: false,
      filterable: false,
      align: "right",
      render: (p) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {p.status === "paid" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const r = await fetch(`/api/fundraising/payments/${p.id}/receipt`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                });
                const d = await r.json().catch(() => ({}));
                if (r.ok && d.ok) {
                  toast.success(`Receipt sent to ${d.to}`);
                } else {
                  toast.error(`Failed: ${d.error || `HTTP ${r.status}`}`);
                }
              }}
              style={{
                padding: "5px 10px",
                background: "transparent",
                color: "var(--shed-green)",
                border: "1px solid rgba(45,122,61,0.3)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
              title="Send a receipt email to the donor"
            >
              📧 Receipt
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingPledgeId(p.pledge_id);
            }}
            style={{
              padding: "5px 10px",
              background: "transparent",
              color: "var(--cast-iron)",
              border: "1px solid rgba(10,16,25,0.18)",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
            title="View / edit the pledge this payment is attached to"
          >
            Pledge
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(p);
            }}
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
      ),
      width: 260,
    },
  ], []);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Payments
          </h1>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
            Every payment across all donors. Click Edit to modify amount, method, dates, status, or notes — or delete a payment that was entered by mistake.
          </div>
        </div>
        <button
          onClick={exportPaymentsCsv}
          disabled={rows.length === 0}
          style={{
            padding: "9px 14px",
            background: "transparent",
            color: "var(--cast-iron)",
            border: "1px solid rgba(10,16,25,0.14)",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: rows.length === 0 ? "not-allowed" : "pointer",
            opacity: rows.length === 0 ? 0.5 : 1,
          }}
          title="Download the current filtered list as a CSV file"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary cards */}
      {totals && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <SummaryCard label="Total payments" value={String(totals.total_count)} sublabel="rows" />
            <SummaryCard label="Paid total" value={fmtMoney(totals.paid_sum)} tint="green" />
            <SummaryCard label="Scheduled total" value={fmtMoney(totals.scheduled_sum)} tint="blue" />
            {totals.bounced_sum > 0 && (
              <SummaryCard label="Bounced / failed" value={fmtMoney(totals.bounced_sum)} tint="orange" />
            )}
          </div>
          {/* Audit link — used when a number looks wrong. Opens a modal that lists the 20
              largest paid payments so the user can spot a rogue test row or an unintended
              big donation. Clicking a row jumps to its donor profile. */}
          <div style={{ marginBottom: 18 }}>
            <button
              onClick={openAudit}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--blueprint)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
              title="Inspect the largest paid payments to find any rogue rows."
            >
              Does the total look wrong? → See the 20 largest paid payments
            </button>
          </div>
        </>
      )}

      {/* Pledge filter indicator — shown only when ?pledge_id= is in the URL. Lets the user
          confirm they're drilled into one pledge and clear out of that mode in one click. */}
      {pledgeId && (
        <div
          style={{
            background: "rgba(28,93,142,0.08)",
            border: "1px solid rgba(28,93,142,0.25)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 13,
          }}
        >
          <span>
            Showing payments for a single pledge only — ID <code style={{ background: "rgba(10,16,25,0.06)", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{pledgeId}</code>
          </span>
          <button
            onClick={clearPledgeFilter}
            style={{
              padding: "5px 12px",
              background: "#fff",
              border: "1px solid rgba(28,93,142,0.3)",
              borderRadius: 6,
              color: "var(--blueprint)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Clear pledge filter
          </button>
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
        {/* Status chips (single-select). 'All' is the default — clicking another chip narrows. */}
        <div>
          <div style={{ ...miniLabelCss, marginBottom: 6 }}>Status</div>
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
        </div>

        {/* Method chips (multi-select). Built dynamically from method_facets so we only show
            methods that actually exist in this owner's data — no point offering "Crypto" if
            they never had one. Counts shown so the user knows what to expect. */}
        {methodFacets.length > 1 && (
          <div>
            <div style={{ ...miniLabelCss, marginBottom: 6 }}>Method</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {methodFacets.map((f) => {
                const active = filterMethods.includes(f.method);
                return (
                  <button
                    key={f.method}
                    onClick={() => toggleMethod(f.method)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: active ? "1px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                      background: active ? "var(--cast-iron)" : "#fff",
                      color: active ? "#fff" : "var(--cast-iron)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {fmtMethod(f.method)} <span style={{ opacity: active ? 0.7 : 0.45, fontWeight: 500 }}>({f.count})</span>
                  </button>
                );
              })}
              {filterMethods.length > 0 && (
                <button
                  onClick={() => setFilterMethods([])}
                  style={{
                    padding: "4px 10px",
                    background: "transparent",
                    border: "none",
                    color: "rgba(10,16,25,0.55)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Clear methods
                </button>
              )}
            </div>
          </div>
        )}

        {/* Type chips: pledge installment vs free standalone donation. Helps users separate
            "real pledge commitments" from "ad-hoc gifts that were entered as a one-off". */}
        <div>
          <div style={{ ...miniLabelCss, marginBottom: 6 }}>Type</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              { value: "all", label: "All" },
              { value: "pledge", label: "From a pledge" },
              { value: "standalone", label: "Standalone donations" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterType(opt.value)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: filterType === opt.value ? "1px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                  background: filterType === opt.value ? "var(--cast-iron)" : "#fff",
                  color: filterType === opt.value ? "#fff" : "var(--cast-iron)",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 10 }}>
          <SkeletonRows rows={8} columns={6} />
        </div>
      ) : (
        <DataTable
          data={visibleRows}
          columns={columns}
          rowKey={(p) => p.id}
          emptyMessage="No payments match these filters."
          storageKey="payments"
        />
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
            donor_id: editing.donor_id,
            pledge_id: editing.pledge_id,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {/* Audit modal — top 20 paid payments by amount, to hunt down rogue/test rows. */}
      {auditOpen && (
        <AuditModal
          rows={auditRows}
          loading={auditLoading}
          onClose={() => setAuditOpen(false)}
          onEdit={(row) => {
            // Convert the audit row shape to PaymentRow shape so PaymentEditModal can open
            // it for editing or deletion in-place — same modal the table rows use.
            setAuditOpen(false);
            setEditing({
              id: row.id,
              amount: row.amount,
              method: row.method,
              status: row.status,
              due_date: row.due_date,
              paid_date: row.paid_date,
              installment_number: 0,
              check_number: null,
              bank_name: null,
              cc_last4: row.cc_last4,
              cc_holder: null,
              transaction_ref: row.transaction_ref,
              notes: null,
              pledge_id: row.pledge_id,
              donor_id: row.donor_id,
              project_id: row.project_id,
              donor_first_name: row.donor_first_name,
              donor_last_name: row.donor_last_name,
              donor_hebrew_name: row.donor_hebrew_name,
              project_name: row.project_name,
            });
          }}
        />
      )}

      {/* Pledge editor — opened from the Pledge column button */}
      {editingPledgeId && pledgeDetails && (
        <PledgeEditModal
          pledge={pledgeDetails}
          projects={projects}
          onClose={() => setEditingPledgeId(null)}
          onSaved={() => {
            setEditingPledgeId(null);
            load();
          }}
          onDeleted={() => {
            setEditingPledgeId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tint, sublabel }: { label: string; value: string; tint?: "green" | "blue" | "orange"; sublabel?: string }) {
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
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        {value}
        {sublabel && (
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.55, letterSpacing: "0.04em" }}>
            {sublabel}
          </span>
        )}
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

const miniLabelCss: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.55,
};

// Audit modal — shows the top-N paid payments by amount. When the user notices the Paid
// total looks too large, this is the fastest way to identify a rogue test row (e.g. a
// $1,000,000 entry left over from import testing). Each row links to the donor + has an
// Edit button that opens PaymentEditModal so the user can fix or delete the row in-place.
function AuditModal({
  rows,
  loading,
  onClose,
  onEdit,
}: {
  rows: AuditRow[];
  loading: boolean;
  onClose: () => void;
  onEdit: (row: AuditRow) => void;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,16,25,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 880,
          maxHeight: "80vh",
          overflow: "auto",
          padding: 20,
          boxShadow: "0 20px 60px rgba(10,16,25,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-bricolage), sans-serif", fontSize: 22, fontWeight: 800 }}>
              Top 20 paid payments
            </h2>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
              The 20 largest <strong>paid</strong> payments in your database, regardless of any filters above. Click Edit to fix or delete a row.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: "rgba(10,16,25,0.5)",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 30, opacity: 0.6, textAlign: "center" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 30, opacity: 0.6, textAlign: "center" }}>No paid payments found.</div>
        ) : (
          <>
            <div
              style={{
                background: "rgba(10,16,25,0.03)",
                border: "1px solid rgba(10,16,25,0.08)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              These 20 rows alone sum to <strong>{fmtMoney(total)}</strong>. If a row here looks unfamiliar or test-like, click Edit to delete it.
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(10,16,25,0.03)", textAlign: "left" }}>
                  <th style={auditTh}>Donor</th>
                  <th style={auditTh}>Project</th>
                  <th style={{ ...auditTh, textAlign: "right" }}>Amount</th>
                  <th style={auditTh}>Method</th>
                  <th style={auditTh}>Date</th>
                  <th style={{ ...auditTh, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(10,16,25,0.06)" }}>
                    <td style={auditTd}>
                      <Link href={`/fundraising/donors/${r.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 600 }}>
                        {`${r.donor_first_name} ${r.donor_last_name || ""}`.trim() || "Unknown"}
                      </Link>
                      {r.donor_hebrew_name && (
                        <div style={{ fontSize: 11, opacity: 0.6, direction: "rtl", fontFamily: "'Frank Ruhl Libre', 'David', serif" }}>
                          {r.donor_hebrew_name}
                        </div>
                      )}
                    </td>
                    <td style={{ ...auditTd, fontSize: 12, opacity: 0.75 }}>
                      {r.project_name || "General"}
                      {r.is_standalone && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", background: "rgba(28,93,142,0.1)", color: "var(--blueprint)", borderRadius: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          Standalone
                        </span>
                      )}
                    </td>
                    <td style={{ ...auditTd, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(r.amount)}
                    </td>
                    <td style={{ ...auditTd, fontSize: 12 }}>{fmtMethod(r.method)}</td>
                    <td style={{ ...auditTd, fontSize: 12, opacity: 0.75 }}>{r.paid_date ? fmtDate(r.paid_date) : "—"}</td>
                    <td style={{ ...auditTd, textAlign: "right" }}>
                      <button
                        onClick={() => onEdit(r)}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

const auditTh: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
};

const auditTd: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};
