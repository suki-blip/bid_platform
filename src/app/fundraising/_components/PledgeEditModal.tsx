"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/fundraising-format";

// Pledge edit + delete modal. PATCH supports a small set of fields (the API only
// updates fr_pledges itself, not its installment rows); delete cascades to all
// fr_pledge_payments via the DB foreign key.
//
// We don't expose installments_total / payment_plan edits here — changing them after
// the fact wouldn't regenerate installment rows, so it'd lie about reality. If the user
// needs a different plan they should delete + recreate.

interface EditablePledge {
  id: string;
  amount: number;
  paid_amount?: number;
  status: string;
  pledge_date: string;
  due_date?: string | null;
  project_id?: string | null;
  notes?: string | null;
  // Display-only context
  donor_label?: string;
}

interface ProjectOption { id: string; name: string }

export default function PledgeEditModal({
  pledge,
  projects,
  onClose,
  onSaved,
  onDeleted,
}: {
  pledge: EditablePledge;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [amount, setAmount] = useState(String(pledge.amount));
  const [status, setStatus] = useState(pledge.status || "open");
  const [pledgeDate, setPledgeDate] = useState(pledge.pledge_date || "");
  const [dueDate, setDueDate] = useState(pledge.due_date || "");
  const [projectId, setProjectId] = useState(pledge.project_id || "");
  const [notes, setNotes] = useState(pledge.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Show a warning if the user tries to set an amount LOWER than what's already paid.
  // Server doesn't reject this (it's just a number), but the UI flags it as suspicious.
  const paid = Number(pledge.paid_amount || 0);
  const remaining = Math.max(0, Number(amount) - paid);
  const wouldOverpay = paid > 0 && Number(amount) < paid;

  // Trap Escape to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/fundraising/pledges/${pledge.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount ? Number(amount) : null,
        status,
        pledge_date: pledgeDate || null,
        due_date: dueDate || null,
        project_id: projectId || null,
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

  async function destroy() {
    if (
      !confirm(
        `Delete this pledge${pledge.donor_label ? ` for ${pledge.donor_label}` : ""}? This will also delete all of its payment rows (paid and scheduled). This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/fundraising/pledges/${pledge.id}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed to delete");
      setBusy(false);
      return;
    }
    if (onDeleted) onDeleted();
    else onSaved();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} style={card}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          Edit pledge
        </h2>
        {pledge.donor_label && (
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 14 }}>{pledge.donor_label}</div>
        )}

        {/* Snapshot of current balance */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            padding: 12,
            background: "rgba(28,93,142,0.04)",
            border: "1px solid rgba(28,93,142,0.18)",
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <Stat label="Pledged" value={fmtMoney(Number(amount) || pledge.amount)} />
          <Stat label="Paid" value={fmtMoney(paid)} tone="green" />
          <Stat label="Remaining" value={fmtMoney(remaining)} tone={remaining === 0 ? "green" : "orange"} />
        </div>

        <Row>
          <L label="Pledged amount *">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={input}
            />
            {wouldOverpay && (
              <div style={{ fontSize: 11, color: "var(--cone-orange)", marginTop: 4 }}>
                ⚠ Pledged less than what&apos;s already paid ({fmtMoney(paid)}). The donor will appear over-paid.
              </div>
            )}
          </L>
          <L label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
              <option value="open">Open</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </L>
        </Row>

        <Row>
          <L label="Pledge date">
            <input type="date" value={pledgeDate} onChange={(e) => setPledgeDate(e.target.value)} style={input} />
          </L>
          <L label="Due date (optional)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} />
          </L>
        </Row>

        <L label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={input}>
            <option value="">— General —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </L>

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
            onClick={destroy}
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
            title="Permanently delete this pledge and all its payments"
          >
            Delete pledge
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "orange" }) {
  const color = tone === "green" ? "var(--shed-green)" : tone === "orange" ? "var(--cone-orange)" : "var(--cast-iron)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
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
  maxWidth: 580,
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
