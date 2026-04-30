"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtMoney, fmtDate } from "@/lib/fundraising-format";

interface Project {
  id: string;
  name: string;
  description: string | null;
  goal_amount: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
}
interface Pledge {
  id: string;
  donor_id: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  amount: number;
  paid_amount: number;
  status: string;
  pledge_date: string;
  installments_total: number;
  payment_plan: string;
}
interface Payment {
  id: string;
  donor_id: string;
  first_name: string;
  last_name: string | null;
  amount: number;
  method: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  installment_number: number;
}
interface Totals {
  pledged: number;
  paid: number;
  donor_count: number;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ project: Project; totals: Totals; pledges: Pledge[]; payments: Payment[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", goal_amount: "" });

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    fetch(`/api/fundraising/projects/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setData(d);
          setEditForm({
            name: d.project.name,
            description: d.project.description || "",
            goal_amount: d.project.goal_amount?.toString() || "",
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function saveEdit() {
    const res = await fetch(`/api/fundraising/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        goal_amount: editForm.goal_amount || null,
      }),
    });
    if (res.ok) {
      setEditing(false);
      const r = await fetch(`/api/fundraising/projects/${params.id}`);
      if (r.ok) setData(await r.json());
    }
  }

  async function archive() {
    if (!confirm(`Archive "${data?.project.name}"?`)) return;
    await fetch(`/api/fundraising/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    router.push("/fundraising/projects");
  }

  async function reactivate() {
    await fetch(`/api/fundraising/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const r = await fetch(`/api/fundraising/projects/${params.id}`);
    if (r.ok) setData(await r.json());
  }

  if (loading || !data) return <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>;

  const { project, totals, pledges, payments } = data;
  const goal = project.goal_amount;
  const pct = goal && goal > 0 ? Math.min(100, (totals.paid / goal) * 100) : null;
  const remaining = goal && goal > 0 ? Math.max(0, goal - totals.paid) : null;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <Link href="/fundraising/projects" style={{ fontSize: 12, color: "var(--blueprint)", textDecoration: "none" }}>
        ← Back to projects
      </Link>

      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,16,25,0.08)",
          borderRadius: 14,
          padding: 22,
          margin: "12px 0 18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ ...inputStyle, fontSize: 22, fontWeight: 800 }}
                />
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Description"
                  style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit" }}
                />
                <input
                  type="number"
                  value={editForm.goal_amount}
                  onChange={(e) => setEditForm({ ...editForm, goal_amount: e.target.value })}
                  placeholder="Goal amount"
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveEdit} style={smallBtnDark}>Save</button>
                  <button onClick={() => setEditing(false)} style={smallBtnLight}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                    {project.name}
                  </h1>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: project.status === "active" ? "rgba(45,122,61,0.12)" : "rgba(10,16,25,0.08)",
                      color: project.status === "active" ? "var(--shed-green)" : "rgba(10,16,25,0.6)",
                    }}
                  >
                    {project.status}
                  </span>
                </div>
                {project.description && <p style={{ fontSize: 13, opacity: 0.7, margin: "8px 0 0", lineHeight: 1.5 }}>{project.description}</p>}
                {(project.start_date || project.end_date) && (
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
                    {fmtDate(project.start_date)} → {fmtDate(project.end_date)}
                  </div>
                )}
              </>
            )}
          </div>
          {!editing && (
            <div style={{ display: "flex", gap: 6 }}>
              {project.status === "active" ? (
                <>
                  <button onClick={() => setEditing(true)} style={smallBtnLight}>Edit</button>
                  <button onClick={archive} style={{ ...smallBtnLight, color: "var(--cone-orange)" }}>Archive</button>
                </>
              ) : (
                <button onClick={reactivate} style={smallBtnDark}>Reactivate</button>
              )}
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 18 }}>
          <Stat label="Raised" value={fmtMoney(totals.paid)} tone="success" />
          <Stat label="Pledged" value={fmtMoney(totals.pledged)} tone="info" />
          {goal && <Stat label="Goal" value={fmtMoney(goal)} tone="default" />}
          {remaining !== null && <Stat label="Remaining to goal" value={fmtMoney(remaining)} tone="warn" />}
          <Stat label="Donors" value={String(totals.donor_count)} tone="default" />
        </div>

        {pct !== null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ background: "rgba(10,16,25,0.06)", borderRadius: 99, height: 8, overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "var(--shed-green)",
                  transition: "width 300ms var(--ease-out)",
                }}
              />
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
              {pct.toFixed(1)}% of goal
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title={`Pledges (${pledges.length})`}>
          {pledges.length === 0 ? (
            <Empty>No pledges to this project yet.</Empty>
          ) : (
            <ul style={listStyle}>
              {pledges.map((p) => (
                <li
                  key={p.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(10,16,25,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div>
                    <Link href={`/fundraising/donors/${p.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                      {p.first_name} {p.last_name || ""}
                    </Link>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {fmtDate(p.pledge_date)} · {p.installments_total} pmt · {p.status}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMoney(p.amount)}</div>
                    <div style={{ fontSize: 11, color: "var(--shed-green)", fontWeight: 600 }}>{fmtMoney(p.paid_amount)} paid</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent payments">
          {payments.length === 0 ? (
            <Empty>No payments yet.</Empty>
          ) : (
            <ul style={listStyle}>
              {payments.slice(0, 20).map((pay) => (
                <li
                  key={pay.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(10,16,25,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div>
                    <Link href={`/fundraising/donors/${pay.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                      {pay.first_name} {pay.last_name || ""}
                    </Link>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {pay.method.replace("_", " ")} · #{pay.installment_number} ·{" "}
                      {pay.status === "paid" ? `paid ${fmtDate(pay.paid_date)}` : `due ${fmtDate(pay.due_date)}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: pay.status === "paid" ? "var(--shed-green)" : "var(--cast-iron)" }}>
                      {fmtMoney(pay.amount)}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background:
                          pay.status === "paid"
                            ? "rgba(45,122,61,0.12)"
                            : pay.status === "bounced" || pay.status === "failed"
                            ? "rgba(232,93,31,0.12)"
                            : "rgba(10,16,25,0.06)",
                        color:
                          pay.status === "paid"
                            ? "var(--shed-green)"
                            : pay.status === "bounced" || pay.status === "failed"
                            ? "var(--cone-orange)"
                            : "rgba(10,16,25,0.55)",
                      }}
                    >
                      {pay.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
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
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "var(--font-bricolage), sans-serif", fontWeight: 800, color: colors[tone], marginTop: 4 }}>{value}</div>
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
  return (
    <div style={{ padding: 20, textAlign: "center", fontSize: 12, opacity: 0.55, border: "1px dashed rgba(10,16,25,0.12)", borderRadius: 8 }}>
      {children}
    </div>
  );
}

const listStyle: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
};
const smallBtnDark: React.CSSProperties = {
  padding: "7px 14px",
  background: "var(--cast-iron)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};
const smallBtnLight: React.CSSProperties = {
  padding: "7px 14px",
  background: "transparent",
  color: "var(--cast-iron)",
  border: "1px solid rgba(10,16,25,0.12)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
