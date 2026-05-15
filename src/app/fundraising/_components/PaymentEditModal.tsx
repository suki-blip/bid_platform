"use client";

import { useEffect, useState } from "react";
import { useEscape } from "@/lib/use-escape";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/fundraising-types";
import { fmtMoney } from "@/lib/fundraising-format";

interface EditablePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  // Donor + pledge context — used to show the "Apply to pledge" selector
  donor_id?: string | null;
  pledge_id?: string | null;
}

interface PledgeOption {
  id: string;
  amount: number;
  paid_amount: number;
  status: string;
  pledge_date: string;
  project_name?: string | null;
  // is_standalone = 1 means this is a synthetic wrapper around a free donation. The user
  // never explicitly created a pledge — we use it just to satisfy the NOT NULL pledge_id
  // constraint. We label these distinctly so the user understands a payment on it is
  // really a "free donation, not pledge".
  is_standalone?: number | null;
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
  useEscape(onClose);

  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method || "pending");
  const [status, setStatus] = useState(payment.status || "scheduled");
  const [dueDate, setDueDate] = useState(payment.due_date || "");
  const [paidDate, setPaidDate] = useState(payment.paid_date || "");
  const [notes, setNotes] = useState(payment.notes || "");
  // pledge_id: current pledge the payment is attributed to. User can pick a different
  // pledge from the same donor — re-attribution updates totals on both old and new.
  const [pledgeId, setPledgeId] = useState<string>(payment.pledge_id || "");
  const [pledges, setPledges] = useState<PledgeOption[]>([]);
  const [pledgesLoading, setPledgesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Load the donor's pledges so the selector shows real options. The donor endpoint
  // already returns pledges with paid_amount, so we reuse that instead of a separate call.
  useEffect(() => {
    if (!payment.donor_id) return;
    setPledgesLoading(true);
    fetch(`/api/fundraising/donors/${payment.donor_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const raw = Array.isArray(d.pledges) ? d.pledges : [];
        const mapped: PledgeOption[] = raw.map((p: { id: string; amount: number; paid_amount: number; status: string; pledge_date: string; project_name?: string | null; is_standalone?: number | null }) => ({
          id: p.id,
          amount: Number(p.amount),
          paid_amount: Number(p.paid_amount || 0),
          status: p.status,
          pledge_date: p.pledge_date,
          project_name: p.project_name || null,
          is_standalone: p.is_standalone || 0,
        }));
        setPledges(mapped);
      })
      .finally(() => setPledgesLoading(false));
  }, [payment.donor_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const body: Record<string, unknown> = {
      amount: amount ? Number(amount) : null,
      method,
      status,
      due_date: dueDate || null,
      paid_date: paidDate || null,
      notes: notes.trim() || null,
    };
    // Only send pledge_id if it actually changed — keeps PATCH minimal.
    if (pledgeId && pledgeId !== payment.pledge_id) {
      body.pledge_id = pledgeId;
    }

    const res = await fetch(`/api/fundraising/payments/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === "pending" ? "Decide later" : paymentMethodLabel(m)}
                </option>
              ))}
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

        {/* Apply this payment to a pledge — re-attribution. Only shown when we know the donor. */}
        {payment.donor_id && (
          <L label="Apply to pledge">
            {pledgesLoading ? (
              <div style={{ fontSize: 12, opacity: 0.55, padding: "9px 12px" }}>Loading pledges…</div>
            ) : pledges.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.55, padding: "9px 12px", border: "1px dashed rgba(10,16,25,0.12)", borderRadius: 8 }}>
                This donor has no pledges. (Each payment lives under a pledge; you can create one from
                the donor profile or the Payment page.)
              </div>
            ) : (
              <>
                <select value={pledgeId} onChange={(e) => setPledgeId(e.target.value)} style={input}>
                  {pledges.map((p) => {
                    const remaining = Math.max(0, p.amount - p.paid_amount);
                    // Standalone wrappers are NOT real pledges — flag them so the user
                    // doesn't think this payment is on a commitment.
                    if (p.is_standalone) {
                      return (
                        <option key={p.id} value={p.id}>
                          Standalone donation · {fmtMoney(p.amount)} · {p.pledge_date}
                        </option>
                      );
                    }
                    return (
                      <option key={p.id} value={p.id}>
                        {fmtMoney(p.amount)} pledged · {fmtMoney(remaining)} remaining
                        {p.project_name ? ` · ${p.project_name}` : ""} · {p.pledge_date} · {p.status}
                      </option>
                    );
                  })}
                </select>
                {pledgeId && pledgeId !== payment.pledge_id && (
                  <div style={{ fontSize: 11, color: "var(--blueprint)", marginTop: 4 }}>
                    ⓘ Re-attributing — the old pledge&apos;s balance will be adjusted up, the new one&apos;s down.
                  </div>
                )}
              </>
            )}
          </L>
        )}

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
