"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DonorSidePanel from "../_components/DonorSidePanel";
import { fmtMoney, fmtTime, fmtDate, daysSince, daysOverdue } from "@/lib/fundraising-format";

interface TodayData {
  today: {
    iso: string;
    gregorian: string;
    hebrew: string;
    hebrewEn: string;
    dayOfWeek: string;
    holidays: string[];
  };
  todayFollowups: Array<{ id: string; title: string; due_at: string; kind: string; priority: string; donor_id: string | null; donor_name: string | null }>;
  overdueFollowups: Array<{ id: string; title: string; due_at: string; kind: string; priority: string; donor_id: string | null; donor_name: string | null }>;
  overduePayments: Array<{ id: string; amount: number; method: string; due_date: string; donor_id: string; donor_name: string; phone: string | null; project_name: string | null }>;
  todayBirthdays: Array<{ id: string; donor_name: string; hebrew_name: string | null; birthday: string }>;
  yahrzeitsThisWeek: Array<{ id: string; donor_name: string; yahrzeit: string }>;
  emailsDueToday: Array<{ id: string; subject: string; to_email: string; send_at: string; donor_id: string | null; donor_name: string | null }>;
  staleDonors: Array<{ id: string; donor_name: string; hebrew_name: string | null; total_paid: number; last_contact_at: string | null }>;
}

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewDonorId, setPreviewDonorId] = useState<string | null>(null);

  function load() {
    fetch("/api/fundraising/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fundraising/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function markFollowupDone(id: string) {
    await fetch(`/api/fundraising/followups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    load();
  }

  async function markPaymentPaid(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`/api/fundraising/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", paid_date: today }),
    });
    load();
  }

  async function markEmailSent(id: string) {
    await fetch(`/api/fundraising/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    load();
  }

  if (loading || !data) return <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>;

  const totalCount =
    data.todayFollowups.length +
    data.overdueFollowups.length +
    data.overduePayments.length +
    data.todayBirthdays.length +
    data.emailsDueToday.length;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Editorial date masthead */}
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
            {data.today.dayOfWeek} · {data.today.gregorian}
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
            Today&rsquo;s desk
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
            {data.today.hebrew}
          </div>
          {data.today.holidays.length > 0 && (
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
              {data.today.holidays.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {totalCount === 0 ? (
        <div style={{ padding: "70px 20px", textAlign: "center" }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "var(--font-bricolage), sans-serif",
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            Nothing on the desk.
          </h2>
          <div style={{ fontSize: 13, opacity: 0.55 }}>
            No follow-ups, overdue payments, or scheduled emails for today.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
          {/* OVERDUE FOLLOW-UPS — most urgent */}
          {data.overdueFollowups.length > 0 && (
            <Card title={`Overdue follow-ups (${data.overdueFollowups.length})`} tone="danger">
              <ul style={listStyle}>
                {data.overdueFollowups.map((f) => (
                  <li key={f.id} style={rowStyle}>
                    <button
                      onClick={() => markFollowupDone(f.id)}
                      style={checkBtn}
                      title="Mark done"
                      aria-label="Mark done"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{f.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.65 }}>
                        {f.donor_name && (
                          <button onClick={() => f.donor_id && setPreviewDonorId(f.donor_id)} style={inlineLinkBtn}>
                            {f.donor_name}
                          </button>
                        )}
                        {f.donor_name ? " · " : ""}
                        <span style={{ color: "var(--cone-orange)", fontWeight: 700 }}>
                          {daysOverdue(f.due_at)}d overdue
                        </span>
                        {" · "}
                        {f.kind}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* OVERDUE PAYMENTS */}
          {data.overduePayments.length > 0 && (
            <Card title={`Overdue payments (${data.overduePayments.length})`} tone="danger">
              <ul style={listStyle}>
                {data.overduePayments.slice(0, 8).map((p) => (
                  <li key={p.id} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {fmtMoney(p.amount)}
                        <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 12 }}> · {p.method.replace("_", " ")}</span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.65 }}>
                        <button onClick={() => setPreviewDonorId(p.donor_id)} style={inlineLinkBtn}>
                          {p.donor_name}
                        </button>
                        {" · "}
                        <span style={{ color: "var(--cone-orange)", fontWeight: 700 }}>
                          {daysOverdue(p.due_date)}d overdue
                        </span>
                        {p.project_name ? ` · ${p.project_name}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {p.phone && (
                        <a href={`tel:${p.phone}`} title={p.phone} style={miniBtn}>
                          📞
                        </a>
                      )}
                      <button onClick={() => markPaymentPaid(p.id)} style={{ ...miniBtn, background: "var(--shed-green)", color: "#fff" }}>
                        ✓ Paid
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {data.overduePayments.length > 8 && (
                <Link
                  href="/fundraising/collections"
                  style={{ display: "block", textAlign: "center", padding: 10, fontSize: 12, color: "var(--blueprint)", textDecoration: "none", fontWeight: 600 }}
                >
                  View all {data.overduePayments.length} →
                </Link>
              )}
            </Card>
          )}

          {/* TODAY'S FOLLOW-UPS */}
          {data.todayFollowups.length > 0 && (
            <Card title={`Today's follow-ups (${data.todayFollowups.length})`} tone="info">
              <ul style={listStyle}>
                {data.todayFollowups.map((f) => (
                  <li key={f.id} style={rowStyle}>
                    <button onClick={() => markFollowupDone(f.id)} style={checkBtn} title="Mark done" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{f.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.65 }}>
                        {fmtTime(f.due_at)}
                        {f.donor_name ? " · " : ""}
                        {f.donor_name && (
                          <button onClick={() => f.donor_id && setPreviewDonorId(f.donor_id)} style={inlineLinkBtn}>
                            {f.donor_name}
                          </button>
                        )}
                        {" · "}
                        {f.kind}
                        {f.priority === "high" && <span style={{ color: "var(--cone-orange)", marginLeft: 4 }}>● high</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* SCHEDULED EMAILS */}
          {data.emailsDueToday.length > 0 && (
            <Card title={`Emails to send (${data.emailsDueToday.length})`} tone="info">
              <ul style={listStyle}>
                {data.emailsDueToday.slice(0, 8).map((e) => (
                  <li key={e.id} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.subject}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.65 }}>
                        To {e.to_email}
                        {e.donor_name && (
                          <>
                            {" · "}
                            <button onClick={() => e.donor_id && setPreviewDonorId(e.donor_id)} style={inlineLinkBtn}>
                              {e.donor_name}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <button onClick={() => markEmailSent(e.id)} style={{ ...miniBtn, background: "var(--blueprint)", color: "#fff" }}>
                      ✓ Sent
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* BIRTHDAYS */}
          {data.todayBirthdays.length > 0 && (
            <Card title={`Birthdays today 🎂 (${data.todayBirthdays.length})`} tone="warm">
              <ul style={listStyle}>
                {data.todayBirthdays.map((b) => (
                  <li key={b.id} style={rowStyle}>
                    <div style={{ flex: 1 }}>
                      <button onClick={() => setPreviewDonorId(b.id)} style={inlineLinkBtn}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{b.donor_name}</span>
                      </button>
                      {b.hebrew_name && (
                        <div style={{ fontSize: 11, opacity: 0.6, direction: "rtl", textAlign: "left" }}>{b.hebrew_name}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{fmtDate(b.birthday)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* STALE DONORS */}
          {data.staleDonors.length > 0 && (
            <Card title="Reach out — quiet donors" tone="warm">
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 10 }}>
                Top donors with no contact in 60+ days. Pick up the phone.
              </div>
              <ul style={listStyle}>
                {data.staleDonors.map((s) => (
                  <li key={s.id} style={rowStyle}>
                    <div style={{ flex: 1 }}>
                      <button onClick={() => setPreviewDonorId(s.id)} style={inlineLinkBtn}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{s.donor_name}</span>
                      </button>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {fmtMoney(s.total_paid)} lifetime ·{" "}
                        {s.last_contact_at
                          ? `last contact ${daysSince(s.last_contact_at)}d ago`
                          : "never contacted"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* YAHRZEITS */}
          {data.yahrzeitsThisWeek.length > 0 && (
            <Card title={`Yahrzeits on file 🕯️`} tone="muted">
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 10 }}>
                Donors who have a yahrzeit recorded — coordinate a sponsorship or memorial gift.
              </div>
              <ul style={listStyle}>
                {data.yahrzeitsThisWeek.slice(0, 6).map((y) => (
                  <li key={y.id} style={rowStyle}>
                    <div style={{ flex: 1 }}>
                      <button onClick={() => setPreviewDonorId(y.id)} style={inlineLinkBtn}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{y.donor_name}</span>
                      </button>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{y.yahrzeit}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <DonorSidePanel donorId={previewDonorId} onClose={() => setPreviewDonorId(null)} />
    </div>
  );
}

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "danger" | "info" | "warm" | "muted";
  children: React.ReactNode;
}) {
  const accent = {
    danger: "var(--cone-orange)",
    info: "var(--cast-iron)",
    warm: "var(--high-vis)",
    muted: "rgba(10,16,25,0.3)",
  }[tone];
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 8,
        padding: "16px 18px",
      }}
    >
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          margin: "0 0 12px",
          color: "var(--cast-iron)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: accent,
          }}
        />
        {title}
      </h2>
      {children}
    </section>
  );
}

const listStyle: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 0",
  borderBottom: "1px solid rgba(10,16,25,0.05)",
};
const checkBtn: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  border: "1.5px solid rgba(10,16,25,0.25)",
  background: "transparent",
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
};
const inlineLinkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "var(--cast-iron)",
  cursor: "pointer",
  fontSize: "inherit",
  fontFamily: "inherit",
  fontWeight: "inherit",
  textAlign: "left",
  textDecoration: "underline",
  textDecorationColor: "rgba(10,16,25,0.25)",
  textUnderlineOffset: 3,
};
const miniBtn: React.CSSProperties = {
  padding: "5px 10px",
  background: "transparent",
  border: "1px solid rgba(10,16,25,0.12)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  textDecoration: "none",
  color: "var(--cast-iron)",
  whiteSpace: "nowrap",
};
