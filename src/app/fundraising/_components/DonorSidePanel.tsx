"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtMoney, fmtDate } from "@/lib/fundraising-format";

interface DonorPanelData {
  donor: {
    id: string;
    status: string;
    first_name: string;
    last_name: string | null;
    hebrew_name: string | null;
    title: string | null;
    email: string | null;
    organization: string | null;
    occupation: string | null;
    notes: string | null;
    total_pledged: number;
    total_paid: number;
    last_contact_at: string | null;
    next_followup_at: string | null;
    tags: string[];
    do_not_contact: boolean;
    source: { id: string; name: string } | null;
  };
  phones: Array<{ id: string; label: string; phone: string; is_primary: number }>;
  addresses: Array<{ id: string; label: string; street: string | null; city: string | null; state: string | null; zip: string | null; is_primary: number; is_reception: number }>;
  calls: Array<{ id: string; occurred_at: string; channel: string; outcome: string | null; summary: string | null }>;
  pledges: Array<{ id: string; amount: number; paid_amount: number; status: string; pledge_date: string; project_name: string | null; installments_total: number }>;
  payments: Array<{ id: string; amount: number; method: string; status: string; due_date: string | null; paid_date: string | null; project_name: string | null }>;
  notes: Array<{ id: string; body: string; pinned: number; created_at: string; author_name: string | null }>;
}

export default function DonorSidePanel({
  donorId,
  onClose,
}: {
  donorId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DonorPanelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!donorId) return;
    let cancelled = false;
    fetch(`/api/fundraising/donors/${donorId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      setData(null);
      setLoading(true);
    };
  }, [donorId]);

  // Close on escape
  useEffect(() => {
    if (!donorId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [donorId, onClose]);

  if (!donorId) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,16,25,0.4)",
        zIndex: 400,
        display: "flex",
        justifyContent: "flex-end",
        animation: "fr-fade-in var(--dur-fast, 120ms) ease-out",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 95vw)",
          background: "#fff",
          height: "100%",
          overflowY: "auto",
          boxShadow: "-8px 0 24px rgba(10,16,25,0.08)",
          animation: "fr-slide-in var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.16,1,0.3,1))",
        }}
      >
        <style>{`
          @keyframes fr-slide-in {
            from { transform: translateX(40px); opacity: 0.6; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            background: "#fff",
            borderBottom: "1px solid rgba(10,16,25,0.06)",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              opacity: 0.5,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Donor preview
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {data && (
              <Link
                href={`/fundraising/donors/${data.donor.id}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--cast-iron)",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(10,16,25,0.25)",
                  textUnderlineOffset: 3,
                }}
              >
                Open full page
              </Link>
            )}
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                color: "rgba(10,16,25,0.4)",
                padding: 0,
              }}
              title="Close (esc)"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {loading || !data ? (
          <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>
        ) : (
          <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                  marginBottom: 4,
                }}
              >
                {data.donor.status}
                {data.donor.do_not_contact && (
                  <span style={{ color: "var(--cone-orange)", marginLeft: 8 }}>· Do not contact</span>
                )}
              </div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  margin: 0,
                  fontFamily: "var(--font-bricolage), sans-serif",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                {data.donor.title ? data.donor.title + " " : ""}
                {data.donor.first_name} {data.donor.last_name || ""}
              </h2>
              {data.donor.hebrew_name && (
                <div
                  style={{
                    fontSize: 17,
                    color: "rgba(10,16,25,0.7)",
                    direction: "rtl",
                    textAlign: "left",
                    fontFamily: "'Frank Ruhl Libre', 'David', serif",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {data.donor.hebrew_name}
                </div>
              )}
              {(data.donor.organization || data.donor.occupation) && (
                <div style={{ fontSize: 13, opacity: 0.6, marginTop: 6 }}>
                  {[data.donor.organization, data.donor.occupation].filter(Boolean).join(" · ")}
                </div>
              )}
              {data.donor.tags.length > 0 && (
                <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                  {data.donor.tags.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 3,
                        border: "1px solid rgba(10,16,25,0.12)",
                        fontWeight: 500,
                        color: "rgba(10,16,25,0.7)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {data.donor.status === "donor" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 0,
                  borderTop: "1px solid rgba(10,16,25,0.08)",
                  borderBottom: "1px solid rgba(10,16,25,0.08)",
                  marginBottom: 18,
                }}
              >
                <div style={{ padding: "12px 0 12px 0", borderRight: "1px solid rgba(10,16,25,0.08)", paddingRight: 12 }}>
                  <div style={statLabel}>Lifetime</div>
                  <div style={{ ...statValue, color: "var(--cast-iron)" }}>{fmtMoney(data.donor.total_paid)}</div>
                </div>
                <div style={{ padding: "12px 0 12px 12px" }}>
                  <div style={statLabel}>Outstanding</div>
                  <div style={{ ...statValue, color: "rgba(10,16,25,0.55)" }}>
                    {fmtMoney(Math.max(0, data.donor.total_pledged - data.donor.total_paid))}
                  </div>
                </div>
              </div>
            )}

            {/* Contact */}
            <SectionTitle>Contact</SectionTitle>
            <div style={cardStyle}>
              {data.phones.length === 0 && !data.donor.email ? (
                <div style={{ opacity: 0.5, fontSize: 12 }}>No contact info.</div>
              ) : (
                <>
                  {data.phones.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                      <span style={{ opacity: 0.55, textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>{p.label}</span>
                      <a href={`tel:${p.phone}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 600 }}>
                        {p.phone}
                      </a>
                    </div>
                  ))}
                  {data.donor.email && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                      <span style={{ opacity: 0.55, textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>email</span>
                      <a href={`mailto:${data.donor.email}`} style={{ color: "var(--blueprint)", textDecoration: "none" }}>
                        {data.donor.email}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Address */}
            {data.addresses.length > 0 && (
              <>
                <SectionTitle>Address</SectionTitle>
                <div style={cardStyle}>
                  {data.addresses.slice(0, 2).map((a) => (
                    <div key={a.id} style={{ marginBottom: 6, fontSize: 13 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.55, textTransform: "uppercase" }}>
                        {a.label}
                        {a.is_reception ? " · reception" : ""}
                      </div>
                      <div>{a.street}</div>
                      <div style={{ opacity: 0.65 }}>
                        {[a.city, a.state, a.zip].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Recent activity */}
            <SectionTitle>Recent activity</SectionTitle>
            <div style={cardStyle}>
              {data.calls.length === 0 && data.pledges.length === 0 ? (
                <div style={{ opacity: 0.5, fontSize: 12 }}>No activity yet.</div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {/* Most recent 2 calls */}
                  {data.calls.slice(0, 2).map((c) => (
                    <li key={c.id} style={timelineRow}>
                      <span style={{ ...dot, background: "var(--blueprint)" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          📞 {c.outcome || c.channel} · <span style={{ opacity: 0.6, fontWeight: 400 }}>{fmtDate(c.occurred_at)}</span>
                        </div>
                        {c.summary && (
                          <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.4 }}>
                            {c.summary.length > 90 ? c.summary.slice(0, 90) + "…" : c.summary}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                  {/* Last 3 payments */}
                  {data.payments.filter((p) => p.status === "paid").slice(0, 3).map((p) => (
                    <li key={p.id} style={timelineRow}>
                      <span style={{ ...dot, background: "var(--shed-green)" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          💵 {fmtMoney(p.amount)}
                          {p.project_name ? <span style={{ opacity: 0.6, fontWeight: 400 }}> · {p.project_name}</span> : ""}
                          <span style={{ opacity: 0.6, fontWeight: 400 }}> · {fmtDate(p.paid_date)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                  {/* Pinned notes */}
                  {data.notes.filter((n) => n.pinned).slice(0, 1).map((n) => (
                    <li key={n.id} style={timelineRow}>
                      <span style={{ ...dot, background: "var(--high-vis)" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, opacity: 0.55, fontWeight: 600 }}>📌 Pinned note · {n.author_name}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.body}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Open pledges */}
            {data.pledges.filter((p) => p.status === "open").length > 0 && (
              <>
                <SectionTitle>Open pledges</SectionTitle>
                <div style={cardStyle}>
                  {data.pledges
                    .filter((p) => p.status === "open")
                    .map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          fontSize: 13,
                          borderBottom: "1px solid rgba(10,16,25,0.05)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{fmtMoney(p.amount)}</div>
                          <div style={{ fontSize: 11, opacity: 0.6 }}>
                            {p.project_name || "General"} · {p.installments_total} pmts
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, color: "var(--shed-green)", fontWeight: 700 }}>{fmtMoney(p.paid_amount)}</div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>paid</div>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}

            {data.donor.notes && (
              <>
                <SectionTitle>Profile note</SectionTitle>
                <div style={{ ...cardStyle, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{data.donor.notes}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        opacity: 0.55,
        margin: "16px 0 6px",
      }}
    >
      {children}
    </h3>
  );
}

const cardStyle: React.CSSProperties = {
  paddingBottom: 4,
};
const statLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};
const statValue: React.CSSProperties = {
  fontSize: 18,
  fontFamily: "var(--font-bricolage), sans-serif",
  fontWeight: 700,
  marginTop: 4,
  letterSpacing: "-0.015em",
  fontVariantNumeric: "tabular-nums",
};
const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  marginTop: 5,
  flexShrink: 0,
};
const timelineRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "6px 0",
  borderBottom: "1px solid rgba(10,16,25,0.04)",
};
