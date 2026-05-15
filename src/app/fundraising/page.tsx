"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMoney as fmt, fmtDate } from "@/lib/fundraising-format";

// One row in the "audit top open pledges" diagnostic. The dashboard's Open-Pledges card
// can look wildly off if a stale test row with a huge amount is still in the database;
// this modal lists the 20 largest open pledges (and flags any whose donor is missing) so
// the user can identify + delete the culprit.
interface AuditPledgeRow {
  id: string;
  amount: number;
  paid_total: number;
  outstanding: number;
  status: string;
  pledge_date: string | null;
  due_date: string | null;
  notes: string | null;
  is_standalone: boolean;
  donor_id: string;
  project_id: string | null;
  donor_missing: boolean;
  donor_first_name: string | null;
  donor_last_name: string | null;
  donor_hebrew_name: string | null;
  project_name: string | null;
}

interface DashboardData {
  stats: {
    prospects: number;
    donors: number;
    activeProjects: number;
    pledgesOpenAmount: number;
    pledgesOpenCount: number;
    paidThisMonthAmount: number;
    overdueCount: number;
    overdueAmount: number;
  };
  today: {
    iso: string;
    gregorian: string;
    hebrew: string;
    hebrewEn: string;
    dayOfWeek: string;
    holidays: string[];
  };
  upcomingFollowups: Array<{
    id: string;
    title: string;
    due_at: string;
    donor_name: string | null;
    kind: string;
    priority: string;
  }>;
  recentDonations: Array<{
    id: string;
    donor_name: string;
    amount: number;
    paid_date: string;
    method: string;
    project_name: string | null;
  }>;
}

export default function FundraisingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const router = useRouter();

  // Pledge audit modal state — opened from the link below the Open-Pledges stat.
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditPledgeRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSum, setAuditSum] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadAudit() {
    setAuditLoading(true);
    fetch("/api/fundraising/pledges/audit")
      .then((r) => (r.ok ? r.json() : { rows: [], sum_outstanding: 0 }))
      .then((d) => {
        setAuditRows(Array.isArray(d.rows) ? d.rows : []);
        setAuditSum(Number(d.sum_outstanding || 0));
        setAuditLoading(false);
      })
      .catch(() => setAuditLoading(false));
  }

  function openAudit() {
    setAuditOpen(true);
    loadAudit();
  }

  // Delete an open pledge from the audit modal. Goes through the regular DELETE endpoint
  // so the pledge + its payments end up in the Recycle Bin (restorable for 30 days).
  // Refreshes the dashboard stats + the audit list after the delete completes.
  async function deletePledgeFromAudit(id: string, summary: string) {
    if (!confirm(`Delete pledge: ${summary}? It will go to the Recycle Bin.`)) return;
    setDeletingId(id);
    const r = await fetch(`/api/fundraising/pledges/${id}?payment_action=delete`, { method: "DELETE" });
    setDeletingId(null);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Delete failed");
      return;
    }
    // Reload both the audit list and the dashboard stats so the Open-Pledges card updates.
    loadAudit();
    fetch("/api/fundraising/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d));
  }

  useEffect(() => {
    fetch("/api/fundraising/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/fundraising/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setIsManager(!!m?.isManager));
  }, []);

  async function seedDemo() {
    if (!confirm("This will add ~30 realistic demo donors with pledges, payments, and follow-ups. Continue?")) return;
    setSeeding(true);
    const res = await fetch("/api/fundraising/seed-demo", { method: "POST" });
    if (res.ok) {
      router.refresh();
      const d = await fetch("/api/fundraising/dashboard").then((r) => r.json());
      setData(d);
    }
    setSeeding(false);
  }

  if (loading) {
    return <div style={{ opacity: 0.5, fontSize: 14 }}>Loading dashboard…</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--cone-orange)" }}>Failed to load dashboard.</div>;
  }

  const { stats, today, upcomingFollowups, recentDonations } = data;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      {/* Editorial date masthead — the most distinctive thing in this product */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingBottom: 18,
          marginBottom: 22,
          borderBottom: "1px solid rgba(10,16,25,0.08)",
          gap: 24,
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
              marginBottom: 6,
            }}
          >
            {today.dayOfWeek} · {today.gregorian}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-bricolage), sans-serif",
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            {today.hebrewEn}
          </h1>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              marginTop: 2,
              direction: "rtl",
              textAlign: "left",
              fontFamily: "'Frank Ruhl Libre', 'David', serif",
              color: "rgba(10,16,25,0.75)",
            }}
          >
            {today.hebrew}
          </div>
          {today.holidays.length > 0 && (
            <div
              style={{
                marginTop: 10,
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#7a4f00",
                background: "rgba(240,168,48,0.18)",
                padding: "3px 8px",
                borderRadius: 3,
              }}
            >
              {today.holidays.join(" · ")}
            </div>
          )}
        </div>
        {isManager && stats.donors === 0 && stats.prospects === 0 && (
          <button
            onClick={seedDemo}
            disabled={seeding}
            style={{
              padding: "9px 16px",
              background: "var(--cast-iron)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: seeding ? "not-allowed" : "pointer",
              opacity: seeding ? 0.5 : 1,
            }}
          >
            {seeding ? "Generating…" : "Generate demo data"}
          </button>
        )}
      </div>

      {/* Stats — quieter; unified row, no per-card borders */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 0,
          marginBottom: 26,
          background: "#fff",
          border: "1px solid rgba(10,16,25,0.08)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <StatCell label="Leads" value={String(stats.prospects)} href="/fundraising/prospects" />
        <StatCell label="Active donors" value={String(stats.donors)} href="/fundraising/donors" />
        <StatCell label="Active projects" value={String(stats.activeProjects)} href="/fundraising/projects" />
        <StatCell
          label="Open pledges"
          value={fmt(stats.pledgesOpenAmount)}
          sub={`${stats.pledgesOpenCount} pledge${stats.pledgesOpenCount === 1 ? "" : "s"}`}
          href="/fundraising/collections"
        />
        <StatCell
          label="Paid this month"
          value={fmt(stats.paidThisMonthAmount)}
          tone="success"
        />
        <StatCell
          label="Overdue"
          value={fmt(stats.overdueAmount)}
          sub={`${stats.overdueCount} item${stats.overdueCount === 1 ? "" : "s"}`}
          href="/fundraising/collections"
          tone={stats.overdueCount > 0 ? "danger" : undefined}
        />
      </div>

      {/* Audit link — opens a modal listing the 20 largest open pledges that contribute to
          the Open-Pledges total. Use this when the total looks too big and you want to find
          a rogue/test pledge to delete. Manager-only. */}
      {isManager && stats.pledgesOpenCount > 0 && (
        <div style={{ marginTop: -18, marginBottom: 26 }}>
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
            title="Inspect the largest open pledges to find any rogue rows."
          >
            Does the Open Pledges total look wrong? → See the 20 largest open pledges
          </button>
        </div>
      )}

      {/* Two columns — uneven weights: action panel left, history panel right */}
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 32 }}>
        <Panel title="Upcoming follow-ups" linkHref="/fundraising/calendar" linkLabel="Calendar">
          {upcomingFollowups.length === 0 ? (
            <Empty>No follow-ups scheduled.</Empty>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {upcomingFollowups.map((f) => (
                <li
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 0",
                    borderBottom: "1px solid rgba(10,16,25,0.05)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      flexShrink: 0,
                      background:
                        f.priority === "high"
                          ? "var(--cone-orange)"
                          : f.priority === "low"
                          ? "rgba(10,16,25,0.25)"
                          : "var(--cast-iron)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.title}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>
                      {f.donor_name ? `${f.donor_name} · ` : ""}
                      {new Date(f.due_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      opacity: 0.45,
                    }}
                  >
                    {f.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent donations" linkHref="/fundraising/donors" linkLabel="All donors">
          {recentDonations.length === 0 ? (
            <Empty>No donations recorded yet.</Empty>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recentDonations.map((d) => (
                <li
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 0",
                    borderBottom: "1px solid rgba(10,16,25,0.05)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{d.donor_name}</div>
                    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>
                      {d.project_name || "General"} · {d.method.replace("_", " ")} ·{" "}
                      {new Date(d.paid_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--cast-iron)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(d.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Audit modal — top 20 open pledges by outstanding balance. Each row shows the donor
          (or "Orphan" if the donor record is missing) and offers a Delete button that
          routes to the standard recycle-bin DELETE so deletions are restorable. */}
      {auditOpen && (
        <PledgeAuditModal
          rows={auditRows}
          sum={auditSum}
          loading={auditLoading}
          deletingId={deletingId}
          onClose={() => setAuditOpen(false)}
          onDelete={deletePledgeFromAudit}
        />
      )}
    </div>
  );
}

// Top-N open pledges audit. Used from the dashboard when the user notices Open Pledges
// looks too high. Each row links to the owning donor (when present) or shows "Orphan"
// when the FK target is gone. Delete sends the pledge to the Recycle Bin.
function PledgeAuditModal({
  rows,
  sum,
  loading,
  deletingId,
  onClose,
  onDelete,
}: {
  rows: AuditPledgeRow[];
  sum: number;
  loading: boolean;
  deletingId: string | null;
  onClose: () => void;
  onDelete: (id: string, summary: string) => void;
}) {
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
          maxWidth: 940,
          maxHeight: "80vh",
          overflow: "auto",
          padding: 20,
          boxShadow: "0 20px 60px rgba(10,16,25,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-bricolage), sans-serif", fontSize: 22, fontWeight: 800 }}>
              Top 20 open pledges
            </h2>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
              The 20 open pledges with the largest outstanding balance. These rows are what makes the dashboard&apos;s Open Pledges total grow. Click Delete to send a row to the Recycle Bin.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "rgba(10,16,25,0.5)", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 30, opacity: 0.6, textAlign: "center" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 30, opacity: 0.6, textAlign: "center" }}>No open pledges found.</div>
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
              These {rows.length} rows account for <strong>{fmt(sum)}</strong> of outstanding pledges. Any row that looks unfamiliar or test-like can be deleted right here.
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(10,16,25,0.03)", textAlign: "left" }}>
                  <th style={pAuditTh}>Donor</th>
                  <th style={pAuditTh}>Project</th>
                  <th style={{ ...pAuditTh, textAlign: "right" }}>Amount</th>
                  <th style={{ ...pAuditTh, textAlign: "right" }}>Paid</th>
                  <th style={{ ...pAuditTh, textAlign: "right" }}>Outstanding</th>
                  <th style={pAuditTh}>Pledged</th>
                  <th style={{ ...pAuditTh, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const donorLabel = r.donor_missing
                    ? "Orphan — donor missing"
                    : `${r.donor_first_name || ""} ${r.donor_last_name || ""}`.trim() || "Unnamed";
                  const summary = `${fmt(r.amount)} pledge — ${donorLabel}`;
                  const isDeleting = deletingId === r.id;
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid rgba(10,16,25,0.06)", background: r.donor_missing ? "rgba(232,93,31,0.05)" : "transparent" }}>
                      <td style={pAuditTd}>
                        {r.donor_missing ? (
                          <span style={{ color: "var(--cone-orange)", fontWeight: 700, fontSize: 12 }}>
                            ⚠ Orphan (donor deleted)
                          </span>
                        ) : (
                          <Link href={`/fundraising/donors/${r.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 600 }}>
                            {donorLabel}
                          </Link>
                        )}
                        {r.donor_hebrew_name && !r.donor_missing && (
                          <div style={{ fontSize: 11, opacity: 0.6, direction: "rtl", fontFamily: "'Frank Ruhl Libre', 'David', serif" }}>
                            {r.donor_hebrew_name}
                          </div>
                        )}
                      </td>
                      <td style={{ ...pAuditTd, fontSize: 12, opacity: 0.75 }}>
                        {r.project_name || "General"}
                        {r.is_standalone && (
                          <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", background: "rgba(28,93,142,0.1)", color: "var(--blueprint)", borderRadius: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Standalone
                          </span>
                        )}
                      </td>
                      <td style={{ ...pAuditTd, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(r.amount)}
                      </td>
                      <td style={{ ...pAuditTd, textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>
                        {fmt(r.paid_total)}
                      </td>
                      <td style={{ ...pAuditTd, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--cone-orange)" }}>
                        {fmt(r.outstanding)}
                      </td>
                      <td style={{ ...pAuditTd, fontSize: 12, opacity: 0.75 }}>
                        {r.pledge_date ? fmtDate(r.pledge_date) : "—"}
                      </td>
                      <td style={{ ...pAuditTd, textAlign: "right" }}>
                        <button
                          onClick={() => onDelete(r.id, summary)}
                          disabled={isDeleting}
                          style={{
                            padding: "5px 12px",
                            background: "#fff",
                            color: "var(--cone-orange)",
                            border: "1px solid rgba(232,93,31,0.4)",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: isDeleting ? "not-allowed" : "pointer",
                            opacity: isDeleting ? 0.6 : 1,
                          }}
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

const pAuditTh: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
};

const pAuditTd: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

function StatCell({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: "success" | "danger";
}) {
  const valueColor =
    tone === "success" ? "var(--shed-green)" : tone === "danger" ? "var(--cone-orange)" : "var(--cast-iron)";
  const inner = (
    <div
      style={{
        padding: "16px 18px 14px",
        height: "100%",
        borderRight: "1px solid rgba(10,16,25,0.06)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          opacity: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontFamily: "var(--font-bricolage), sans-serif",
          fontWeight: 700,
          marginTop: 6,
          color: valueColor,
          letterSpacing: "-0.015em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Panel({
  title,
  linkHref,
  linkLabel,
  children,
}: {
  title: string;
  linkHref?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          paddingBottom: 8,
          marginBottom: 10,
          borderBottom: "1px solid rgba(10,16,25,0.1)",
        }}
      >
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: 0,
            color: "var(--cast-iron)",
          }}
        >
          {title}
        </h2>
        {linkHref && (
          <Link
            href={linkHref}
            style={{
              fontSize: 11,
              color: "rgba(10,16,25,0.6)",
              textDecoration: "none",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {linkLabel} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "24px 12px",
        textAlign: "center",
        fontSize: 13,
        opacity: 0.5,
      }}
    >
      {children}
    </div>
  );
}
