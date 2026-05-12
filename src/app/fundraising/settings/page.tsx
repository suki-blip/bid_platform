"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [leadDays, setLeadDays] = useState(7);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ queued: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  // Payment gateway URL config
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [gatewayLoaded, setGatewayLoaded] = useState(false);
  const [gatewaySaving, setGatewaySaving] = useState(false);
  const [gatewaySaved, setGatewaySaved] = useState(false);

  // Sola / Cardknox credentials
  const [solaLoaded, setSolaLoaded] = useState(false);
  const [solaHasXkey, setSolaHasXkey] = useState(false);
  const [solaXkeyMasked, setSolaXkeyMasked] = useState<string | null>(null);
  const [solaXkeyInput, setSolaXkeyInput] = useState("");
  const [solaIfieldsKey, setSolaIfieldsKey] = useState("");
  const [solaSoftwareName, setSolaSoftwareName] = useState("easyfundraisings");
  const [solaSaving, setSolaSaving] = useState(false);
  const [solaSaved, setSolaSaved] = useState(false);

  // Sola sync state
  const [syncing, setSyncing] = useState(false);
  const [syncFrom, setSyncFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [syncTo, setSyncTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [syncRecordOrphans, setSyncRecordOrphans] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    transactions_seen: number;
    payments_updated: number;
    payments_created: number;
    orphan_count: number;
    orphans: Array<{ xRefNum: string | null; xAmount: string | null; xBillFirstName: string | null; xBillLastName: string | null; xEmail: string | null; xDate: string | null; xStatus: string }>;
  } | null>(null);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    fetch("/api/fundraising/settings/gateway")
      .then((r) => (r.ok ? r.json() : { gateway_url: "" }))
      .then((d) => {
        setGatewayUrl(d.gateway_url || "");
        setGatewayLoaded(true);
      });
    fetch("/api/fundraising/settings/sola")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSolaHasXkey(!!d.has_xkey);
        setSolaXkeyMasked(d.xkey_masked || null);
        setSolaIfieldsKey(d.ifields_key || "");
        setSolaSoftwareName(d.software_name || "easyfundraisings");
        setSolaLoaded(true);
      });
  }, []);

  async function saveSolaCredentials() {
    setSolaSaving(true);
    setSolaSaved(false);
    const payload: Record<string, string> = {
      ifields_key: solaIfieldsKey.trim(),
      software_name: solaSoftwareName.trim(),
    };
    // Only send xkey if the user typed a new one — empty input means "leave as-is"
    if (solaXkeyInput.trim()) payload.xkey = solaXkeyInput.trim();
    const r = await fetch("/api/fundraising/settings/sola", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSolaSaving(false);
    if (r.ok) {
      setSolaSaved(true);
      setSolaXkeyInput("");
      // Refresh to get new masked value
      const fresh = await fetch("/api/fundraising/settings/sola").then((rr) => rr.json());
      setSolaHasXkey(!!fresh.has_xkey);
      setSolaXkeyMasked(fresh.xkey_masked || null);
      setTimeout(() => setSolaSaved(false), 2500);
    }
  }

  async function runSolaSync() {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      const r = await fetch("/api/fundraising/sola/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_date: syncFrom,
          to_date: syncTo,
          record_orphans: syncRecordOrphans,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setSyncError(e.error || `HTTP ${r.status}`);
        setSyncing(false);
        return;
      }
      setSyncResult(await r.json());
    } catch (e) {
      setSyncError(String(e));
    }
    setSyncing(false);
  }

  async function saveGateway() {
    setGatewaySaving(true);
    setGatewaySaved(false);
    const r = await fetch("/api/fundraising/settings/gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gateway_url: gatewayUrl.trim() || null }),
    });
    setGatewaySaving(false);
    if (r.ok) {
      setGatewaySaved(true);
      setTimeout(() => setGatewaySaved(false), 2500);
    }
  }

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

      <Section
        title="Payment gateway"
        subtitle="Where the system sends donors when they click 'Continue to payment' on the Payment page."
      >
        {/* Sola / Cardknox preset — the most common case */}
        <div
          style={{
            background: "rgba(45,122,61,0.06)",
            border: "1px solid rgba(45,122,61,0.25)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Sola Payments / Cardknox PaymentSITE
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.85, marginBottom: 6 }}>
            If you use Sola (Cardknox-based), just paste your PaymentSITE base URL below — something like
            <br />
            <code style={{ direction: "ltr", display: "inline-block", marginTop: 4 }}>
              https://secure.cardknox.com/<em>your-page-name</em>
            </code>
            <br />
            The system auto-appends the right Sola parameters (xamount, xinvoice,
            xRedirectURL, xBillFirstName, xEmail, etc.) and recognises Sola&apos;s response codes
            (xResult, xRefNum, xMaskedCardNumber) when the customer is redirected back.
          </div>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.75, marginBottom: 12 }}>
          For any other gateway, paste the URL with these placeholders — the system substitutes them:
        </p>
        <div
          style={{
            background: "#fbf7ec",
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "var(--font-mono, monospace)",
            marginBottom: 14,
            lineHeight: 1.7,
          }}
        >
          <div><code>{"{amount}"}</code> — amount in dollars (e.g. 100.00)</div>
          <div><code>{"{ref}"}</code> — unique reference for this transaction (token)</div>
          <div><code>{"{donor_name}"}</code>, <code>{"{donor_email}"}</code></div>
          <div><code>{"{description}"}</code> — optional notes</div>
          <div><code>{"{return_url}"}</code> — webhook URL the gateway should call when done</div>
        </div>

        <label style={labelCss}>Gateway URL (Sola PaymentSITE base, or custom template)</label>
        <input
          type="url"
          value={gatewayUrl}
          onChange={(e) => setGatewayUrl(e.target.value)}
          placeholder="https://secure.cardknox.com/your-page  —  OR  —  https://your-gateway.com/checkout?amount={amount}&ref={ref}&callback={return_url}"
          style={{ ...inputCss, width: "100%", direction: "ltr" }}
          dir="ltr"
          disabled={!gatewayLoaded}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={saveGateway} disabled={gatewaySaving || !gatewayLoaded} style={primaryBtn}>
            {gatewaySaving ? "Saving…" : "Save gateway URL"}
          </button>
          {gatewaySaved && (
            <span style={{ fontSize: 12, color: "var(--shed-green)", fontWeight: 700 }}>✓ Saved</span>
          )}
        </div>

        <div style={{ marginTop: 16, padding: 12, background: "rgba(28,93,142,0.06)", borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
          <strong>Webhook URL (for Sola support if they ask):</strong>
          <pre style={{ margin: "6px 0 0", padding: 0, background: "transparent", fontFamily: "var(--font-mono, monospace)", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{`https://easyfundraisings.com/api/fundraising/payment-webhook`}
          </pre>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            With Sola, the token and secret travel inside the
            <code style={{ margin: "0 4px" }}>xRedirectURL</code>
            so when the customer is redirected back, the payment is auto-marked as paid. You do
            not need to ask Sola to enable xPostUrl webhooks — the redirect-back is enough. If
            you do enable webhooks at Sola, point them at the URL above.
          </div>
        </div>
      </Section>

      {/* ----------------- Sola / Cardknox API integration ----------------- */}
      <Section
        title="Sola Payments — full integration"
        subtitle="Charge cards directly from inside the app and auto-sync all transactions made in your Sola portal."
      >
        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.75, marginBottom: 14 }}>
          With your <strong>Sola API key (xKey)</strong> and <strong>iFields key</strong> configured below, the
          Payment page will collect card details inline (no redirect to Sola) using Sola&apos;s tokenized iFields,
          then charge via Cardknox&apos;s cc:sale API. The Sync button at the bottom pulls every transaction —
          including ones made directly in the Sola portal — and reconciles them with your local records.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={labelCss}>Sola API key (xKey) — server-side, kept secret</label>
          <input
            type="password"
            value={solaXkeyInput}
            onChange={(e) => setSolaXkeyInput(e.target.value)}
            placeholder={solaHasXkey ? `Currently set: ${solaXkeyMasked || "•••• on file"} — leave blank to keep it` : "Paste your xKey from Sola portal (Account → API)"}
            style={{ ...inputCss, width: "100%", direction: "ltr", fontFamily: "var(--font-mono, monospace)" }}
            dir="ltr"
            disabled={!solaLoaded}
            autoComplete="off"
          />
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
            We never display this value back. Type a new key to replace it.
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelCss}>iFields key — public-ish, used by the browser tokenizer</label>
          <input
            type="text"
            value={solaIfieldsKey}
            onChange={(e) => setSolaIfieldsKey(e.target.value)}
            placeholder="Paste your iFields key from Sola portal"
            style={{ ...inputCss, width: "100%", direction: "ltr", fontFamily: "var(--font-mono, monospace)" }}
            dir="ltr"
            disabled={!solaLoaded}
          />
        </div>

        <div style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <label style={labelCss}>Software name (registered with Cardknox)</label>
            <input
              type="text"
              value={solaSoftwareName}
              onChange={(e) => setSolaSoftwareName(e.target.value)}
              style={{ ...inputCss, width: "100%", direction: "ltr" }}
              dir="ltr"
              disabled={!solaLoaded}
            />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={saveSolaCredentials} disabled={solaSaving || !solaLoaded} style={primaryBtn}>
              {solaSaving ? "Saving…" : "Save Sola keys"}
            </button>
            {solaSaved && (
              <span style={{ fontSize: 12, color: "var(--shed-green)", fontWeight: 700 }}>✓ Saved</span>
            )}
          </div>
        </div>

        {/* ---- Sync from Sola portal ---- */}
        <div style={{ borderTop: "1px solid rgba(10,16,25,0.08)", paddingTop: 16, marginTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>Sync transactions from Sola</h3>
          <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 12, lineHeight: 1.5 }}>
            Pulls every transaction in the date range below and reconciles it with your local records.
            Status changes (approved → declined, etc.) are applied. Toggle the orphan switch to also
            auto-record charges that don&apos;t exist locally yet.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div>
              <label style={labelCss}>From</label>
              <input type="date" value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} style={{ ...inputCss, width: 160 }} />
            </div>
            <div>
              <label style={labelCss}>To</label>
              <input type="date" value={syncTo} onChange={(e) => setSyncTo(e.target.value)} style={{ ...inputCss, width: 160 }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "0 8px 6px" }}>
              <input type="checkbox" checked={syncRecordOrphans} onChange={(e) => setSyncRecordOrphans(e.target.checked)} />
              Record orphan transactions
            </label>
            <button onClick={runSolaSync} disabled={syncing || !solaHasXkey} style={primaryBtn} title={!solaHasXkey ? "Save Sola xKey first" : ""}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>

          {syncError && (
            <div style={{ color: "var(--cone-orange)", fontSize: 13, marginBottom: 12 }}>{syncError}</div>
          )}
          {syncResult && (
            <div style={{ background: "rgba(45,122,61,0.06)", border: "1px solid rgba(45,122,61,0.25)", borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.5 }}>
              <strong>Sync complete.</strong>{" "}
              {syncResult.transactions_seen} transactions seen ·{" "}
              {syncResult.payments_updated} payments updated ·{" "}
              {syncResult.payments_created} new payments recorded ·{" "}
              {syncResult.orphan_count} orphan{syncResult.orphan_count === 1 ? "" : "s"}
              {syncResult.orphans.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", color: "var(--blueprint)", fontWeight: 600 }}>
                    Show orphans ({syncResult.orphans.length})
                  </summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12 }}>
                    {syncResult.orphans.map((o, i) => (
                      <li key={i}>
                        Ref {o.xRefNum || "—"} · ${o.xAmount || "—"} ·{" "}
                        {[o.xBillFirstName, o.xBillLastName].filter(Boolean).join(" ") || o.xEmail || "Unknown"} ·{" "}
                        {o.xStatus} · {o.xDate || "—"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </Section>

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
