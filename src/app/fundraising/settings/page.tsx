"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [leadDays, setLeadDays] = useState(7);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ queued: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  async function runReminders() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch(`/api/fundraising/cron/queue-reminders?lead_days=${leadDays}`, {
        method: "POST",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || `HTTP ${r.status}`);
        setRunning(false);
        return;
      }
      setResult(await r.json());
    } catch (e) {
      setError(String(e));
    }
    setRunning(false);
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <h1
        style={{
          fontFamily: "var(--font-bricolage), sans-serif",
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 18px",
        }}
      >
        Settings
      </h1>

      <Section title="Pledge reminders" subtitle="Auto-queue thank-you / reminder emails for upcoming pledge installments.">
        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.75, marginBottom: 12 }}>
          When a donor has a scheduled installment coming up, the system can pre-stage a friendly reminder email
          in the queue. The email is scheduled to send <em>N days before</em> the installment&apos;s due date —
          you (or your email provider, when connected) deliver them. Reminders are de-duplicated, skip donors marked
          &ldquo;do not contact,&rdquo; and skip donors without an email on file.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={labelCss}>Lead time (days before due)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={leadDays}
              onChange={(e) => setLeadDays(Math.max(1, Math.min(60, Number(e.target.value) || 7)))}
              style={{ ...inputCss, width: 100 }}
            />
          </div>
          <button onClick={runReminders} disabled={running} style={primaryBtn}>
            {running ? "Scanning…" : "Queue reminders now"}
          </button>
        </div>

        {result && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "rgba(45,122,61,0.08)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--shed-green)",
              fontWeight: 600,
            }}
          >
            ✓ Queued {result.queued} new reminder{result.queued === 1 ? "" : "s"}
            {result.skipped > 0 && <span style={{ opacity: 0.7 }}> · {result.skipped} skipped (already queued, no email, or DNC)</span>}
          </div>
        )}
        {error && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "rgba(232,93,31,0.08)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--cone-orange)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.55, lineHeight: 1.5 }}>
          <strong>Tip:</strong> reminders are also queued automatically whenever you create a new pledge. This button is
          for catching up on existing pledges or after changing lead time.
        </div>
      </Section>

      <Section title="Auto-reminder cron" subtitle="To run reminders on a schedule (recommended: nightly), point a cron at the endpoint below.">
        <pre
          style={{
            background: "#fbf7ec",
            padding: 14,
            borderRadius: 8,
            fontSize: 12,
            overflowX: "auto",
            margin: 0,
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
{`POST /api/fundraising/cron/queue-reminders?lead_days=7
Header: x-cron-secret: <CRON_SECRET env var>`}
        </pre>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
          When called with the cron secret, runs across all orgs. When called from the manual button above, runs only
          for the signed-in manager&apos;s org.
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 14,
        padding: 22,
        marginBottom: 14,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.01em" }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 16px" }}>{subtitle}</p>}
      {children}
    </section>
  );
}

const labelCss: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
  display: "block",
  marginBottom: 5,
};
const inputCss: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  background: "#fff",
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  background: "var(--cast-iron)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
