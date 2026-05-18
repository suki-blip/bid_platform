"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtMonth } from "@/lib/fundraising-format";
import MultiSelectDropdown from "../_components/MultiSelectDropdown";

interface ReportData {
  summary: {
    total: number;
    payment_count: number;
    donor_count: number;
    avg_payment: number;
    outstanding_pledged: number;
    open_pledge_count: number;
  };
  by_project: { id: string | null; name: string; total: number; count: number }[];
  by_source: { id: string | null; name: string; total: number; donor_count: number }[];
  by_method: { method: string; total: number; count: number }[];
  by_month: { month: string; total: number; count: number }[];
  top_donors: {
    id: string;
    name: string;
    hebrew_name: string | null;
    organization: string | null;
    total: number;
    count: number;
  }[];
  lapsed_donors: {
    id: string;
    name: string;
    hebrew_name: string | null;
    organization: string | null;
    total_paid: number;
    last_payment_date: string | null;
    last_contact_at: string | null;
  }[];
  detail: Record<string, unknown>[];
  pledges_detail: {
    id: string;
    donor_id: string;
    donor_name: string;
    hebrew_name: string | null;
    project_name: string | null;
    amount: number;
    paid_amount: number;
    remaining: number;
    status: string;
    pledge_date: string;
    installments_total: number;
    payment_plan: string;
    collection_mode: string;
  }[];
}

interface Project { id: string; name: string }
interface Source { id: string; name: string }
interface Donor { id: string; first_name: string; last_name: string | null }
interface Fundraiser { id: string; name: string }

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today);
  // Multi-select filters. Each holds an array of selected IDs. The sentinel value
  // '__none__' (only in projectIds) means "include items with no project assigned".
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [donorIds, setDonorIds] = useState<string[]>([]);
  const [fundraiserIds, setFundraiserIds] = useState<string[]>([]);

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    fetch("/api/fundraising/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      setIsManager(d?.isManager || false);
    });
    fetch("/api/fundraising/projects").then((r) => (r.ok ? r.json() : [])).then((d) => setProjects(d || []));
    fetch("/api/fundraising/sources").then((r) => (r.ok ? r.json() : [])).then((d) => setSources(d || []));
    fetch("/api/fundraising/donors?limit=500").then((r) => (r.ok ? r.json() : { donors: [] })).then((d) => setDonors(d.donors || []));
    fetch("/api/fundraising/team").then((r) => (r.ok ? r.json() : [])).then((d) => setFundraisers(Array.isArray(d) ? d : []));
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (projectIds.length > 0) params.set("project_id", projectIds.join(","));
    if (sourceIds.length > 0) params.set("source_id", sourceIds.join(","));
    if (donorIds.length > 0) params.set("donor_id", donorIds.join(","));
    if (fundraiserIds.length > 0) params.set("fundraiser_id", fundraiserIds.join(","));
    return params.toString();
  }, [from, to, projectIds, sourceIds, donorIds, fundraiserIds]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fundraising/reports?${queryString}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function setRange(preset: "ytd" | "last30" | "last90" | "all") {
    const t = new Date();
    if (preset === "ytd") {
      setFrom(`${t.getFullYear()}-01-01`);
      setTo(t.toISOString().slice(0, 10));
    } else if (preset === "last30") {
      const f = new Date();
      f.setDate(f.getDate() - 30);
      setFrom(f.toISOString().slice(0, 10));
      setTo(t.toISOString().slice(0, 10));
    } else if (preset === "last90") {
      const f = new Date();
      f.setDate(f.getDate() - 90);
      setFrom(f.toISOString().slice(0, 10));
      setTo(t.toISOString().slice(0, 10));
    } else {
      setFrom("2000-01-01");
      setTo(t.toISOString().slice(0, 10));
    }
  }

  const maxMonth = data ? Math.max(1, ...data.by_month.map((m) => m.total)) : 1;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Reports
          </h1>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
            Filter by date, project, donor, source, or fundraiser. Export to CSV for accounting or board reports.
          </div>
        </div>
        {/* Header toolbar — CSV export, full Print/PDF. Both are no-print themselves so they
            don't show up on the printed page. */}
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href={`/api/fundraising/reports/export?${queryString}`}
            style={{
              padding: "10px 18px",
              background: "var(--shed-green)",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            ⬇ Export CSV
          </a>
          <button
            onClick={() => window.print()}
            style={{
              padding: "10px 18px",
              background: "var(--cast-iron)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
            title="Print this report — or 'Save as PDF' from the print dialog"
          >
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* Print-only header — date range + summary so the printed page is self-describing.
          Hidden on screen; only appears when printing. */}
      <div className="print-only" style={{ display: "none", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Fundraising Report
        </div>
        <div style={{ fontSize: 12 }}>
          {from || "All time"} → {to || "Today"} · Generated {new Date().toLocaleString()}
        </div>
      </div>

      {/* Filters — hidden on print, the print-only header above replaces it. */}
      <div
        className="no-print"
        style={{
          background: "#fff",
          border: "1px solid rgba(10,16,25,0.08)",
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          {/* Multi-select filters — Excel-style dropdowns with checkboxes, search, and
              Select all / Clear buttons. Closed by default; the button shows a summary
              ("3 projects selected" / "All projects" / single-pick label). The previous
              implementation used <select multiple> which displayed all options open and
              required Ctrl/Cmd-click — workable for power users, painful for everyone else. */}
          <Field label="Projects">
            <MultiSelectDropdown
              label="projects"
              value={projectIds}
              onChange={setProjectIds}
              options={[
                { value: "__none__", label: "— No project (general) —" },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </Field>
          <Field label="Sources">
            <MultiSelectDropdown
              label="sources"
              value={sourceIds}
              onChange={setSourceIds}
              options={[
                { value: "__none__", label: "— No source —" },
                ...sources.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
          <Field label="Donors">
            <MultiSelectDropdown
              label="donors"
              value={donorIds}
              onChange={setDonorIds}
              options={donors.map((d) => ({
                value: d.id,
                label: `${d.first_name}${d.last_name ? " " + d.last_name : ""}`,
              }))}
              // Donors list can be large — force a search box even on smaller orgs.
              searchable
            />
          </Field>
          {isManager && (
            <Field label="Fundraisers">
              <MultiSelectDropdown
                label="fundraisers"
                value={fundraiserIds}
                onChange={setFundraiserIds}
                options={fundraisers.map((f) => ({ value: f.id, label: f.name }))}
              />
            </Field>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => setRange("last30")} style={presetBtn}>Last 30 days</button>
          <button onClick={() => setRange("last90")} style={presetBtn}>Last 90 days</button>
          <button onClick={() => setRange("ytd")} style={presetBtn}>Year to date</button>
          <button onClick={() => setRange("all")} style={presetBtn}>All time</button>
        </div>
      </div>

      {loading || !data ? (
        <div style={{ padding: 30, opacity: 0.5 }}>Crunching numbers…</div>
      ) : (
        <>
          {/* KPI summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Stat label="Total raised" value={fmtMoney(data.summary.total)} tone="success" />
            <Stat label="Donors" value={String(data.summary.donor_count)} tone="default" />
            <Stat label="Payments" value={String(data.summary.payment_count)} tone="default" />
            <Stat label="Avg payment" value={fmtMoney(data.summary.avg_payment)} tone="info" />
            <Stat label="Outstanding pledged" value={fmtMoney(data.summary.outstanding_pledged)} tone="warn" />
          </div>

          {/* By month — bar chart */}
          {data.by_month.length > 0 && (
            <Panel title="By month">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, paddingTop: 12 }}>
                {data.by_month.map((m) => {
                  const h = (m.total / maxMonth) * 130;
                  return (
                    <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--shed-green)" }}>{fmtMoney(m.total)}</div>
                      <div
                        style={{
                          width: "100%",
                          height: h,
                          background: "linear-gradient(180deg, var(--shed-green), rgba(45,122,61,0.6))",
                          borderRadius: 6,
                          minHeight: 2,
                        }}
                        title={`${m.month}: ${fmtMoney(m.total)} (${m.count} payments)`}
                      />
                      <div style={{ fontSize: 10, opacity: 0.6, transform: "rotate(0deg)", whiteSpace: "nowrap" }}>{fmtMonth(m.month)}</div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Two-column breakdowns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            <Panel title="By project">
              <BreakdownTable
                rows={data.by_project.map((p) => ({ name: String(p.name), total: p.total, count: p.count, sub: `${p.count} payments` }))}
                total={data.summary.total}
              />
            </Panel>
            <Panel title="By source">
              <BreakdownTable
                rows={data.by_source.map((s) => ({ name: String(s.name), total: s.total, count: s.donor_count, sub: `${s.donor_count} donors` }))}
                total={data.summary.total}
              />
            </Panel>
            <Panel title="By payment method">
              <BreakdownTable
                rows={data.by_method.map((m) => ({ name: m.method.replace("_", " "), total: m.total, count: m.count, sub: `${m.count} payments` }))}
                total={data.summary.total}
              />
            </Panel>
            <Panel title="Top donors">
              {data.top_donors.length === 0 ? (
                <Empty>No donors in this period.</Empty>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {data.top_donors.slice(0, 12).map((d, i) => (
                    <li key={d.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(10,16,25,0.06)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={`/fundraising/donors/${d.id}`}
                          style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}
                        >
                          {i + 1}. {d.name}
                        </Link>
                        {d.organization && <div style={{ fontSize: 11, opacity: 0.55 }}>{d.organization}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--shed-green)" }}>{fmtMoney(d.total)}</div>
                        <div style={{ fontSize: 10, opacity: 0.6 }}>{d.count} pmt</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* Lapsed donors — gave in the past but no payment in the last 12 months. The
              re-engagement target list. Sorted by lifetime total so the most valuable
              lapsed donors appear first. */}
          {data.lapsed_donors && data.lapsed_donors.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Panel title={`Lapsed donors (${data.lapsed_donors.length}) — no payment in 12+ months`}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {data.lapsed_donors.map((d) => (
                    <li
                      key={d.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(10,16,25,0.06)",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/fundraising/donors/${d.id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                          {d.name}
                        </Link>
                        {d.hebrew_name && (
                          <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.55, fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>
                            {d.hebrew_name}
                          </span>
                        )}
                        {d.organization && <div style={{ fontSize: 11, opacity: 0.55 }}>{d.organization}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--cone-orange)" }}>{fmtMoney(d.total_paid)}</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          last: {d.last_payment_date || "—"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}

          {/* Pledges detail — every real (non-standalone) pledge matching the filters.
              Shows the bigger picture beyond just paid payments: which commitments exist,
              how much has been collected, and what's still outstanding per donor.
              Has its own filter (by status) + show-all toggle + CSV export. */}
          {data.pledges_detail && data.pledges_detail.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <PledgesPanel pledges={data.pledges_detail} />
            </div>
          )}

          {/* Detail */}
          <div style={{ marginTop: 14 }}>
            <Panel title={`Detail (${data.detail.length} payments)`}>
              {data.detail.length === 0 ? (
                <Empty>No payments match your filters.</Empty>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#fbf7ec", textAlign: "left" }}>
                        <Th>Date</Th>
                        <Th>Donor</Th>
                        <Th>Project</Th>
                        <Th>Method</Th>
                        <Th>Ref</Th>
                        <Th align="right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detail.slice(0, 100).map((row, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(10,16,25,0.05)" }}>
                          <td style={td}>{String(row.paid_date || "")}</td>
                          <td style={td}>
                            <Link href={`/fundraising/donors/${row.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none" }}>
                              {String(row.first_name || "")} {String(row.last_name || "")}
                            </Link>
                          </td>
                          <td style={td}>{String(row.project_name || "—")}</td>
                          <td style={td}>{String(row.method).replace("_", " ")}</td>
                          <td style={td}>
                            {row.check_number ? `#${String(row.check_number)}` : ""}
                            {row.cc_last4 ? `····${String(row.cc_last4)}` : ""}
                            {row.transaction_ref ? String(row.transaction_ref) : ""}
                          </td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(Number(row.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.detail.length > 100 && (
                    <div style={{ padding: 10, fontSize: 11, opacity: 0.55, textAlign: "center" }}>
                      Showing 100 of {data.detail.length}. Export CSV for full list.
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* Print stylesheet — hides nav/filters/buttons, tightens layout for paper.
          Same pattern as the Collections page so the user experience is consistent.
          The pledges-only print mode is handled imperatively in JS (printPledgesOnly())
          which hides every sibling of the pledges section before calling window.print()
          and restores them on afterprint. */}
      <style jsx global>{`
        @media print {
          .so-shed-ribbon, header { display: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; color: #000 !important; }
          /* Tighten Panel + table for paper */
          table { font-size: 11px !important; }
          a { color: #000 !important; text-decoration: none !important; }
          /* Keep each Panel together when possible — avoids splitting a chart mid-page */
          article, section, .report-panel { page-break-inside: avoid; }
          /* Bar chart gets a forced page break to keep it clean */
          .by-month-chart { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

function BreakdownTable({ rows, total }: { rows: { name: string; total: number; sub: string; count: number }[]; total: number }) {
  if (rows.length === 0) return <Empty>No data.</Empty>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map((r, i) => {
        const pct = total > 0 ? (r.total / total) * 100 : 0;
        return (
          <li key={`${r.name}-${i}`} style={{ padding: "8px 0", borderBottom: "1px solid rgba(10,16,25,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{r.name}</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{fmtMoney(r.total)}</div>
            </div>
            <div style={{ background: "rgba(10,16,25,0.06)", borderRadius: 99, height: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--blueprint)" }} />
            </div>
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
              {r.sub} · {pct.toFixed(1)}%
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "default" | "info" | "success" | "warn" }) {
  const colors: Record<string, string> = {
    default: "var(--cast-iron)",
    info: "var(--blueprint)",
    success: "var(--shed-green)",
    warn: "var(--high-vis)",
  };
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: "var(--font-bricolage), sans-serif", fontWeight: 800, color: colors[tone], marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  // className 'report-panel' is referenced by the print stylesheet for page-break-inside
  // hints so panels don't get split across pages when possible.
  return (
    <section className="report-panel" style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px", opacity: 0.7 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 20, textAlign: "center", fontSize: 12, opacity: 0.55 }}>{children}</div>;
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.6, textAlign: align }}>
      {children}
    </th>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 13,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const presetBtn: React.CSSProperties = {
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(10,16,25,0.12)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: "8px 10px" };

// ===========================================================================
// PledgesPanel — drill-down list of every pledge with paid/remaining breakdown.
//
// Shipped as its own component because the audit asked for richer filtering than the
// surrounding KPI panels. Each pledge row links to the donor profile and to the
// payments page filtered to just that pledge's installments — so the user can dive
// from "what's owed" to "which payments are scheduled" in one click.
// ===========================================================================

type PledgeRow = ReportData["pledges_detail"][number];

const PLEDGE_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "open", label: "פתוח" },
  { value: "fulfilled", label: "הושלם" },
  { value: "cancelled", label: "בוטל" },
];

function PledgesPanel({ pledges }: { pledges: PledgeRow[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  // "Print only pledges" — hide every sibling of the pledges section (the page H1, filter
  // card, KPI strip, By-month chart, by-project/source/method panels, top donors, lapsed
  // donors, detail) at print time, then restore them afterwards. We do this imperatively
  // (toggling inline `display`) because the report page composes many sibling divs at the
  // same level and a pure CSS solution would require tagging each one. Reliable across
  // browsers (Chrome/Edge/Safari/Firefox) and survives Save-as-PDF.
  function printPledgesOnly() {
    if (typeof window === "undefined") return;
    const section = document.querySelector(".pledges-print-section") as HTMLElement | null;
    if (!section) return window.print();

    // Walk up from the pledges-section, hiding every SIBLING of each ancestor up to <body>.
    // After this loop, only the chain containing our section remains visible. Hidden nodes
    // remember their previous display in a data attribute so we can restore it afterwards.
    const hidden: HTMLElement[] = [];
    let cur: HTMLElement | null = section;
    while (cur && cur.tagName !== "BODY") {
      const parentEl: HTMLElement | null = cur.parentElement;
      if (!parentEl) break;
      for (const child of Array.from(parentEl.children) as HTMLElement[]) {
        if (child === cur) continue;
        // Don't bother hiding script/style tags or the toast container.
        if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
        child.dataset.prevDisplay = child.style.display;
        child.style.display = "none";
        hidden.push(child);
      }
      cur = parentEl;
    }

    // Force-show-all so all rows print (not just the first 200) — this state change is
    // deferred via setTimeout below so the re-render flushes before window.print().
    setShowAll(true);

    const cleanup = () => {
      for (const el of hidden) {
        el.style.display = el.dataset.prevDisplay || "";
        delete el.dataset.prevDisplay;
      }
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    // Wait one frame for the show-all + visibility flush before opening the print dialog.
    setTimeout(() => window.print(), 60);
  }

  // Filter pipeline: status chip, then free-text search across donor name + project name.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pledges.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.donor_name.toLowerCase().includes(q) ||
        (p.hebrew_name || "").toLowerCase().includes(q) ||
        (p.project_name || "").toLowerCase().includes(q)
      );
    });
  }, [pledges, statusFilter, search]);

  // Cap at 200 by default for render perf; the toggle removes the cap.
  const visible = showAll ? filtered : filtered.slice(0, 200);

  // Totals row — pledged / paid / remaining across the CURRENT filter set, not the
  // whole list. Keeps the user's mental model honest: filters change the totals too.
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, p) => ({
        pledged: acc.pledged + p.amount,
        paid: acc.paid + p.paid_amount,
        remaining: acc.remaining + p.remaining,
      }),
      { pledged: 0, paid: 0, remaining: 0 },
    );
  }, [filtered]);

  // CSV export — same RFC-4180 escaping pattern as elsewhere, UTF-8 BOM so Excel
  // opens Hebrew correctly. Exports the FILTERED set (not the full list).
  function exportCsv() {
    const headers = [
      "Pledge Date", "Donor", "Hebrew Name", "Project", "Amount",
      "Paid", "Remaining", "Status", "Installments", "Plan",
    ];
    const escape = (v: string | number | null): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = filtered.map((p) => [
      escape(p.pledge_date),
      escape(p.donor_name),
      escape(p.hebrew_name),
      escape(p.project_name || "General"),
      escape(p.amount.toFixed(2)),
      escape(p.paid_amount.toFixed(2)),
      escape(p.remaining.toFixed(2)),
      escape(p.status),
      escape(p.installments_total),
      escape(p.payment_plan),
    ].join(","));
    const csv = [headers.map(escape).join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `pledges-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Status label for the print-only header so the printed page is self-describing.
  const statusLabel = PLEDGE_STATUS_FILTERS.find((f) => f.value === statusFilter)?.label || "All";

  return (
    <div className="pledges-print-section">
      {/* Print-only header — only visible when actually printing. Adds context the rest
          of the page would normally provide (date, filter status) when this section is
          printed in isolation. */}
      <div className="pledges-print-header print-only" style={{ display: "none", marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Pledges Report — {statusLabel}
        </div>
        <div style={{ fontSize: 12 }}>
          {filtered.length} pledge{filtered.length === 1 ? "" : "s"} · Pledged{" "}
          {fmtMoney(totals.pledged)} · Paid {fmtMoney(totals.paid)} · Remaining {fmtMoney(totals.remaining)}
          {search.trim() && <> · Search: "{search.trim()}"</>}
          {" · Generated "}{new Date().toLocaleString()}
        </div>
      </div>

      <Panel title={`Pledges — ${filtered.length} of ${pledges.length}`}>
      {/* Toolbar: status chips, search, export */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {PLEDGE_STATUS_FILTERS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: statusFilter === opt.value ? "1px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
              background: statusFilter === opt.value ? "var(--cast-iron)" : "#fff",
              color: statusFilter === opt.value ? "#fff" : "var(--cast-iron)",
              fontWeight: 600,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
        <input
          placeholder="חיפוש לפי שם תורם או קמפיין…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "6px 10px",
            border: "1px solid rgba(10,16,25,0.12)",
            borderRadius: 6,
            fontSize: 12,
            outline: "none",
            background: "#fff",
          }}
        />
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          style={{
            padding: "6px 12px",
            background: "transparent",
            border: "1px solid rgba(10,16,25,0.14)",
            borderRadius: 6,
            cursor: filtered.length === 0 ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            opacity: filtered.length === 0 ? 0.5 : 1,
          }}
          title="Download the current filtered pledges as CSV"
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={printPledgesOnly}
          disabled={filtered.length === 0}
          style={{
            padding: "6px 12px",
            background: "var(--cast-iron)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: filtered.length === 0 ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 700,
            opacity: filtered.length === 0 ? 0.5 : 1,
          }}
          title="Print only this pledges table — or 'Save as PDF' from the print dialog"
        >
          🖨 Print / PDF
        </button>
      </div>

      {/* Totals strip — pledged / paid / remaining for the filtered set */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 12,
          padding: 10,
          background: "rgba(10,16,25,0.03)",
          borderRadius: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55 }}>Pledged</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-bricolage), sans-serif" }}>
            {fmtMoney(totals.pledged)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55 }}>Paid</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--shed-green)", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-bricolage), sans-serif" }}>
            {fmtMoney(totals.paid)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55 }}>Remaining</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: totals.remaining > 0 ? "var(--cone-orange)" : "var(--shed-green)", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-bricolage), sans-serif" }}>
            {fmtMoney(totals.remaining)}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>אין פלאגים שמתאימים לסינון.</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#fbf7ec", textAlign: "left" }}>
                <Th>Date</Th>
                <Th>Donor</Th>
                <Th>Project</Th>
                <Th align="right">Pledged</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Remaining</Th>
                <Th align="right">Progress</Th>
                <Th>Status</Th>
                <Th>Plan</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const pct = p.amount > 0 ? Math.min(100, (p.paid_amount / p.amount) * 100) : 0;
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid rgba(10,16,25,0.05)" }}>
                    <td style={td}>{p.pledge_date}</td>
                    <td style={td}>
                      <Link href={`/fundraising/donors/${p.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 600 }}>
                        {p.donor_name}
                      </Link>
                      {p.hebrew_name && (
                        <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>
                          {p.hebrew_name}
                        </div>
                      )}
                    </td>
                    <td style={td}>{p.project_name || "— General —"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {fmtMoney(p.amount)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--shed-green)" }}>
                      {fmtMoney(p.paid_amount)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: p.remaining > 0 ? "var(--cone-orange)" : "var(--shed-green)" }}>
                      {fmtMoney(p.remaining)}
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {/* Mini progress bar: green up to 100, gold at exact 100, gray for cancelled. */}
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 6, background: "rgba(10,16,25,0.08)", borderRadius: 3, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: p.status === "cancelled"
                                ? "rgba(10,16,25,0.3)"
                                : pct >= 100 ? "linear-gradient(90deg,#f0a830,#d4881a)" : "var(--shed-green)",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 10, fontVariantNumeric: "tabular-nums", opacity: 0.65, minWidth: 26, textAlign: "right" }}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td style={td}>
                      <StatusBadge status={p.status} />
                    </td>
                    <td style={{ ...td, fontSize: 11, opacity: 0.7 }}>
                      {p.installments_total > 1
                        ? `${p.installments_total} × ${p.payment_plan}`
                        : "Lump sum"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {/* Drill-into: open the Payments page filtered to this pledge */}
                      <Link
                        href={`/fundraising/payments?pledge_id=${p.id}`}
                        style={{
                          fontSize: 11,
                          color: "var(--blueprint)",
                          textDecoration: "none",
                          fontWeight: 700,
                          padding: "3px 8px",
                          border: "1px solid rgba(28,93,142,0.3)",
                          borderRadius: 4,
                        }}
                        title="View this pledge's payments"
                      >
                        Payments →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > visible.length && (
            <div style={{ padding: 10, textAlign: "center", fontSize: 12, borderTop: "1px solid rgba(10,16,25,0.06)" }}>
              <button
                onClick={() => setShowAll(true)}
                style={{
                  padding: "6px 14px",
                  background: "transparent",
                  border: "1px solid rgba(10,16,25,0.14)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Show all {filtered.length} pledges
              </button>
            </div>
          )}
        </div>
      )}
      </Panel>
    </div>
  );
}

// Small status badge — color-coded so the table is scannable. Cancelled is muted,
// open is blue, fulfilled is green.
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "rgba(28,93,142,0.10)", color: "var(--blueprint)", label: "Open" },
    fulfilled: { bg: "rgba(45,122,61,0.12)", color: "var(--shed-green)", label: "Fulfilled" },
    cancelled: { bg: "rgba(10,16,25,0.05)", color: "rgba(10,16,25,0.4)", label: "Cancelled" },
  };
  const cfg = map[status] || { bg: "rgba(10,16,25,0.05)", color: "rgba(10,16,25,0.5)", label: status };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "2px 7px",
        borderRadius: 99,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}
