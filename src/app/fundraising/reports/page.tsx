"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtMonth } from "@/lib/fundraising-format";

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
  detail: Record<string, unknown>[];
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
  const [projectId, setProjectId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [donorId, setDonorId] = useState("");
  const [fundraiserId, setFundraiserId] = useState("");

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
    if (projectId) params.set("project_id", projectId);
    if (sourceId) params.set("source_id", sourceId);
    if (donorId) params.set("donor_id", donorId);
    if (fundraiserId) params.set("fundraiser_id", fundraiserId);
    return params.toString();
  }, [from, to, projectId, sourceId, donorId, fundraiserId]);

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
      </div>

      {/* Filters */}
      <div
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
          <Field label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={inputStyle}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Donor">
            <select value={donorId} onChange={(e) => setDonorId(e.target.value)} style={inputStyle}>
              <option value="">All donors</option>
              {donors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.first_name} {d.last_name || ""}
                </option>
              ))}
            </select>
          </Field>
          {isManager && (
            <Field label="Fundraiser">
              <select value={fundraiserId} onChange={(e) => setFundraiserId(e.target.value)} style={inputStyle}>
                <option value="">All fundraisers</option>
                {fundraisers.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
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
  return (
    <section style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 16 }}>
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
