"use client";

import { useState } from "react";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/fundraising-types";

// Standalone modal for creating a new pledge (promise only — no money changes hands).
// POSTs to /api/fundraising/donors/[id]/pledges, which auto-generates installment rows
// based on payment_plan and installments_total.
//
// Used from:
//   - Donor profile → "+ Add pledge" button (original home)
//   - Payment page → "+ New pledge (promise only)" button (added for users who want to
//     record a commitment without taking a payment yet)

export default function PledgeModal({
  donorId,
  projects,
  onClose,
  onCreated,
}: {
  donorId: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pledgeDate, setPledgeDate] = useState(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState("1");
  const [plan, setPlan] = useState<"lump_sum" | "monthly" | "quarterly" | "annual">("lump_sum");
  const [defaultMethod, setDefaultMethod] = useState("pending");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/fundraising/donors/${donorId}/pledges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        project_id: projectId || null,
        pledge_date: pledgeDate,
        installments_total: Number(installments),
        payment_plan: plan,
        default_method: defaultMethod,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed");
      setBusy(false);
      return;
    }
    onCreated();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={card}>
        <h2 style={title}>New pledge</h2>
        <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 14px", lineHeight: 1.5 }}>
          Records a promise without taking a payment. To pay against this pledge later, use the Payment page.
        </p>

        <Row>
          <L label="Amount *">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              style={input}
            />
          </L>
          <L label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={input}>
              <option value="">— General —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </L>
        </Row>

        <Row>
          <L label="Pledge date">
            <input type="date" value={pledgeDate} onChange={(e) => setPledgeDate(e.target.value)} style={input} />
          </L>
          <L label="Default method">
            <select value={defaultMethod} onChange={(e) => setDefaultMethod(e.target.value)} style={input}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === "pending" ? "Decide later (Collections)" : paymentMethodLabel(m)}
                </option>
              ))}
            </select>
          </L>
        </Row>

        <Row>
          <L label="Payment plan">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as "lump_sum" | "monthly" | "quarterly" | "annual")}
              style={input}
            >
              <option value="lump_sum">Lump sum (1 payment)</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </L>
          <L label="Installments">
            <input
              type="number"
              min="1"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
              style={input}
              disabled={plan === "lump_sum"}
            />
          </L>
        </Row>

        <L label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...input, minHeight: 60, fontFamily: "inherit" }}
          />
        </L>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            Auto-generates {plan === "lump_sum" ? "1 payment" : `${installments} ${plan} payments`}.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="submit" disabled={busy} style={submitBtn}>
              {busy ? "Saving…" : "Create pledge"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>{children}</div>;
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 560,
  maxHeight: "90vh",
  overflowY: "auto",
};
const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  fontFamily: "var(--font-bricolage), sans-serif",
  margin: "0 0 6px",
  letterSpacing: "-0.01em",
};
const input: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
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
