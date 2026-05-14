"use client";

import { useState } from "react";

// Inline "Send email" panel for a campaign detail page. Manager picks a recipient set,
// types subject + HTML body (with personalisation tokens like {{first_name}}), and the
// server sends them serially via Resend.
//
// Recipient sets:
//   - campaign_donors     — donors with any pledge for THIS campaign
//   - campaign_prospects  — donors on the prospect list for this campaign
//   - open_pledgers       — donors with open (un-fulfilled) pledges for this campaign
//   - all_donors          — every donor in the org (status='donor')
//
// Personalisation tokens: {{first_name}} {{last_name}} {{full_name}} {{hebrew_name}}.
// They're swapped per-recipient so each recipient sees their own name.

type Recipients = "campaign_donors" | "campaign_prospects" | "open_pledgers" | "all_donors";

const RECIPIENT_OPTIONS: { value: Recipients; label: string; hint: string }[] = [
  { value: "campaign_donors", label: "Campaign donors", hint: "Donors with any pledge for this campaign" },
  { value: "campaign_prospects", label: "Prospect list", hint: "Donors on your prospect call list" },
  { value: "open_pledgers", label: "Open pledgers", hint: "Pledged but not fully paid yet" },
  { value: "all_donors", label: "All donors", hint: "Every active donor in your org" },
];

export default function CampaignEmailBlast({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipients>("campaign_donors");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number; errors?: string[] } | null>(null);

  async function send() {
    if (!confirm(`Send "${subject || "(no subject)"}" to recipient group: ${recipients}? This will go out immediately.`)) return;
    setBusy(true);
    setResult(null);
    const r = await fetch(`/api/fundraising/projects/${projectId}/email-blast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients, subject, html }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setResult({ sent: 0, failed: 0, total: 0, errors: [d.error || `HTTP ${r.status}`] });
    } else {
      setResult(d);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "7px 14px",
          background: "transparent",
          color: "var(--blueprint)",
          border: "1px solid rgba(28,93,142,0.3)",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        📧 Email campaign donors
      </button>
    );
  }

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0, opacity: 0.7 }}>
          Send email blast — {projectName}
        </h2>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "transparent", border: "none", color: "rgba(10,16,25,0.5)", cursor: "pointer", fontSize: 18 }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelCss}>Recipients</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6 }}>
          {RECIPIENT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                padding: "8px 12px",
                border: recipients === opt.value ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                borderRadius: 8,
                background: recipients === opt.value ? "rgba(10,16,25,0.03)" : "#fff",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="recipients"
                checked={recipients === opt.value}
                onChange={() => setRecipients(opt.value)}
                style={{ display: "none" }}
              />
              <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{opt.hint}</div>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelCss}>Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Update on the campaign — Hi {{first_name}}!"
          style={inputCss}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelCss}>Body (HTML allowed)</label>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder={"Dear {{first_name}},\n\nWe wanted to share an update on our campaign…\n\n<a href='https://yourorg.org'>Visit our site</a>"}
          style={{ ...inputCss, minHeight: 160, fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
          Personalisation tokens: <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>,
          <code>{"{{full_name}}"}</code>, <code>{"{{hebrew_name}}"}</code>. Each gets replaced
          with the recipient&apos;s value. HTML supported.
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <button onClick={() => setOpen(false)} style={cancelBtn}>
          Cancel
        </button>
        <button
          onClick={send}
          disabled={busy || !subject.trim() || !html.trim()}
          style={{
            ...submitBtn,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Sending…" : "Send blast"}
        </button>
      </div>

      {result && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: result.failed === 0 ? "rgba(45,122,61,0.06)" : "rgba(232,93,31,0.06)",
            border: `1px solid ${result.failed === 0 ? "rgba(45,122,61,0.25)" : "rgba(232,93,31,0.25)"}`,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {result.failed === 0 && result.sent > 0
              ? `✅ Sent ${result.sent} of ${result.total}`
              : result.sent > 0
              ? `Sent ${result.sent}, failed ${result.failed}, of ${result.total}`
              : result.errors?.length
              ? `Failed: ${result.errors[0]}`
              : "Nothing to send"}
          </div>
          {result.errors && result.errors.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.75 }}>Show errors ({result.errors.length})</summary>
              <ul style={{ fontSize: 11, marginTop: 6, paddingLeft: 18 }}>
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
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
  marginBottom: 4,
};
const inputCss: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};
const cancelBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(10,16,25,0.12)",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const submitBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 8,
  border: "none",
  background: "var(--cast-iron)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};
