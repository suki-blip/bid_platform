"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMoney as fmt } from "@/lib/fundraising-format";

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
        <StatCell label="Prospects" value={String(stats.prospects)} href="/fundraising/prospects" />
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
    </div>
  );
}

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
