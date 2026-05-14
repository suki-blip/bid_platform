"use client";

import { useEffect, useState } from "react";
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
  type Plan = "lump_sum" | "weekly" | "monthly" | "quarterly" | "annual";
  const [plan, setPlan] = useState<Plan>("lump_sum");
  // payment_day:
  //   monthly/quarterly/annual → day-of-month (1-31). Empty string = use pledge_date.
  //   weekly                   → day-of-week (0-6, Sunday=0). Empty = use pledge_date's weekday.
  const [paymentDay, setPaymentDay] = useState<string>("");
  const [defaultMethod, setDefaultMethod] = useState("pending");
  // collection_mode:
  //   manual    → Collections shows each installment as its own row (we chase each month)
  //   automatic → Collections shows the pledge as ONE total (auto-debit handles it)
  const [collectionMode, setCollectionMode] = useState<"manual" | "automatic">("manual");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Saved cards on file for auto-charge. Loaded when the modal opens. If the donor
  // has any non-expired card, the user can tick "auto-charge on each due date" and
  // pick which card to use.
  interface SavedCard {
    id: string;
    cc_last4: string | null;
    cc_brand: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
    expired: boolean;
  }
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [autoChargeCardId, setAutoChargeCardId] = useState<string>("");

  useEffect(() => {
    fetch(`/api/fundraising/donors/${donorId}/cards`)
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d) => {
        const cards: SavedCard[] = Array.isArray(d.cards) ? d.cards : [];
        setSavedCards(cards.filter((c) => !c.expired));
      })
      .catch(() => setSavedCards([]));
  }, [donorId]);

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
        payment_day: paymentDay === "" ? null : Number(paymentDay),
        default_method: defaultMethod,
        collection_mode: collectionMode,
        notes: notes || null,
        auto_charge_card_id: autoChargeCardId || null,
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
              onChange={(e) => {
                setPlan(e.target.value as Plan);
                setPaymentDay(""); // reset day when plan changes — interpretation differs
              }}
              style={input}
            >
              <option value="lump_sum">Lump sum (1 payment)</option>
              <option value="weekly">Weekly</option>
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

        {/* Per-plan day picker. Monthly/quarterly/annual → day of month; weekly → day of week. */}
        {plan === "weekly" && Number(installments) > 1 && (
          <Row>
            <L label="Day of the week">
              <select value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} style={input}>
                <option value="">— Use the day from pledge date —</option>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </L>
          </Row>
        )}
        {(plan === "monthly" || plan === "quarterly" || plan === "annual") && Number(installments) > 1 && (
          <Row>
            <L label="Day of the month (1-31)">
              <input
                type="number"
                min="1"
                max="31"
                value={paymentDay}
                placeholder="Use the day from pledge date"
                onChange={(e) => {
                  const n = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setPaymentDay(n);
                }}
                style={input}
              />
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                ⓘ Months shorter than this number (e.g. Feb 30) will use the last day of the month.
              </div>
            </L>
          </Row>
        )}

        {/* Collection mode — only meaningful when there are multiple installments */}
        {plan !== "lump_sum" && Number(installments) > 1 && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, display: "block", marginBottom: 6 }}>
              How will it be collected?
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={modeOption(collectionMode === "manual")}>
                <input
                  type="radio"
                  name="collection-mode"
                  checked={collectionMode === "manual"}
                  onChange={() => setCollectionMode("manual")}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Manual</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2, lineHeight: 1.4 }}>
                    Chase each installment monthly. Collections will show {installments} separate
                    rows, one per month.
                  </div>
                </div>
              </label>
              <label style={modeOption(collectionMode === "automatic")}>
                <input
                  type="radio"
                  name="collection-mode"
                  checked={collectionMode === "automatic"}
                  onChange={() => setCollectionMode("automatic")}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Automatic</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2, lineHeight: 1.4 }}>
                    Donor has auto-debit set up. Collections shows ONE total row — no monthly
                    chasing.
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Auto-charge on due date — only offered if the donor has at least one saved card on file. */}
        {savedCards.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, display: "block", marginBottom: 6 }}>
              Auto-charge on each due date (optional)
            </label>
            <select
              value={autoChargeCardId}
              onChange={(e) => setAutoChargeCardId(e.target.value)}
              style={input}
            >
              <option value="">— Don&apos;t auto-charge (manual collection) —</option>
              {savedCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cc_brand || "Card"} ending {c.cc_last4 || "????"}
                  {c.exp_month && c.exp_year && ` · exp ${String(c.exp_month).padStart(2, "0")}/${String(c.exp_year).slice(-2)}`}
                  {c.is_default ? " · default" : ""}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4, lineHeight: 1.4 }}>
              When set, the system will charge this card automatically on each installment&apos;s
              due date. Failed charges fall back to manual Collections.
            </div>
          </div>
        )}

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
            {plan === "lump_sum" || Number(installments) <= 1
              ? "Auto-generates 1 scheduled row."
              : collectionMode === "automatic"
              ? `Auto-generates 1 scheduled row for the full \$${Number(amount || 0).toLocaleString()}.`
              : `Auto-generates ${installments} ${plan} scheduled rows.`}
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

function modeOption(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    padding: 10,
    border: active ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "rgba(10,16,25,0.03)" : "#fff",
  };
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
