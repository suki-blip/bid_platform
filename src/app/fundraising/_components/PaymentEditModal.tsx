"use client";

import { useState } from "react";

interface EditablePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
}

export default function PaymentEditModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: EditablePayment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method || "pending");
  const [status, setStatus] = useState(payment.status || "scheduled");
  const [dueDate, setDueDate] = useState(payment.due_date || "");
  const [paidDate, setPaidDate] = useState(payment.paid_date || "");
  const [notes, setNotes] = useState(payment.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch(`/api/fundraising/payments/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount ? Number(amount) : null,
        method,
        status,
        due_date: dueDate || null,
        paid_date: paidDate || null,
        notes: notes.trim() || null,
      }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed to save");
      setBusy(false);
      return;
    }
    onSaved();
  }

  async function deletePayment() {
    if (!confirm("Delete this payment? This will recompute pledge totals.")) return;
    setBusy(true);
    const res = await fetch(`/api/fundraising/payments/${payment.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to delete");
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={card}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
          Edit payment
        </h2>

        <Row>
          <L label="Amount *">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={input}
            />
          </L>
          <L label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={input}>
              <option value="pending">Decide later</option>
              <option value="credit_card">Credit card</option>
              <option value="check">Check</option>
              <option value="wire">Wire</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
            </select>
          </L>
          <L label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
              <option value="scheduled">Scheduled</option>
              <option value="paid">Paid</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </L>
        </Row>

        <Row>
          <L label="Due date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} />
          </L>
          <L label="Paid date">
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} style={input} />
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={deletePayment}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(232,93,31,0.3)",
              background: "transparent",
              color: "var(--cone-orange)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Delete payment
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={cancel}>Cancel</button>
            <button type="submit" disabled={busy} style={submitBtn}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 6 }}>{children}</div>;
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
  maxWidth: 640,
  maxHeight: "90vh",
  overflowY: "auto",
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
const cancel: React.CSSProperties = {
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
