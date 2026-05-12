"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/fundraising-format";
import SolaCardForm, { type SolaCardFormHandle } from "./SolaCardForm";

// Lightweight charge dialog. Renders just enough to take a single payment in-system
// via Sola/Cardknox iFields → cc:sale: amount summary at the top, the secure card form,
// and one "Charge" button. No mode / allocation picker — those are handled by the caller
// who knows what the charge is for.
//
// Use cases:
//   - Collections row "Charge" button: payment_id + pledge_id + amount pre-filled
//   - Future: any other "pay this exact pre-set thing" surface
//
// For the more complex flow (pick donor / pick mode / split / etc.) use the Payment page.

export interface CardChargeModalProps {
  // What we're charging
  donorId: string;
  amount: number;
  // mode is implicit from which IDs are passed in:
  //   pledge_id only            → applies to existing pledge (creates new payment row)
  //   pledge_id + payment_id    → flips an existing scheduled installment to paid
  //   (neither)                 → free donation (new_donation mode)
  pledgeId?: string | null;
  paymentId?: string | null;
  description?: string;
  // Display-only context
  donorLabel?: string;
  pledgeLabel?: string;
  onClose: () => void;
  onCharged: (info: { transaction_ref: string | null; cc_last4: string | null; auth_code: string | null }) => void;
}

interface SolaConfig {
  has_xkey: boolean;
  can_charge: boolean;
  ifields_key: string;
  software_name: string;
}

export default function CardChargeModal({
  donorId,
  amount,
  pledgeId,
  paymentId,
  description,
  donorLabel,
  pledgeLabel,
  onClose,
  onCharged,
}: CardChargeModalProps) {
  const [solaConfig, setSolaConfig] = useState<SolaConfig | null>(null);
  const solaFormRef = useRef<SolaCardFormHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/fundraising/sola/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSolaConfig(d));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function charge() {
    setError("");
    if (!solaFormRef.current) {
      setError("Card form not ready yet.");
      return;
    }
    setBusy(true);
    let tokens;
    try {
      tokens = await solaFormRef.current.collectTokens();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      return;
    }

    try {
      const body: Record<string, unknown> = {
        donor_id: donorId,
        amount,
        notes: description || null,
        sut_card: tokens.sut_card,
        sut_cvv: tokens.sut_cvv,
        exp: tokens.exp,
        zip: tokens.zip,
        street: tokens.street,
      };
      // Pick the right mode based on which IDs we got
      if (pledgeId) {
        body.mode = "existing_pledge";
        body.pledge_id = pledgeId;
        if (paymentId) body.payment_id = paymentId;
      } else {
        body.mode = "new_donation";
      }

      const r = await fetch("/api/fundraising/sola/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.reason || d.error || "Charge failed");
        setBusy(false);
        return;
      }
      onCharged({
        transaction_ref: d.transaction_ref || null,
        cc_last4: d.cc_last4 || null,
        auth_code: d.auth_code || null,
      });
    } catch (e) {
      setError((e as Error).message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  // Sola not configured → show a friendly hint instead of a half-working form.
  if (solaConfig && !solaConfig.can_charge) {
    return (
      <div style={overlay} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={card}>
          <h2 style={title}>Sola not set up</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.75, margin: "0 0 16px" }}>
            In-system credit-card charging requires the Sola Payments xKey + iFields key.
            Configure them in <strong>Settings → Sola Payments — full integration</strong>,
            then come back here and click Charge again.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={cancelBtn}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={card}>
        <h2 style={title}>Charge card — {fmtMoney(amount)}</h2>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14, lineHeight: 1.5 }}>
          {donorLabel && <div><strong>{donorLabel}</strong></div>}
          {pledgeLabel && <div style={{ opacity: 0.7 }}>{pledgeLabel}</div>}
        </div>

        {solaConfig?.can_charge ? (
          <SolaCardForm
            ifieldsKey={solaConfig.ifields_key}
            softwareName={solaConfig.software_name}
            disabled={busy}
            onReady={(h) => (solaFormRef.current = h)}
          />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6, padding: 12 }}>Loading secure card fields…</div>
        )}

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={busy} style={cancelBtn}>Cancel</button>
          <button
            type="button"
            onClick={charge}
            disabled={busy || !solaConfig?.can_charge}
            style={submitBtn}
          >
            {busy ? "Charging…" : `Charge card now — ${fmtMoney(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 250,
  padding: 20,
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
};
const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  fontFamily: "var(--font-bricolage), sans-serif",
  margin: "0 0 4px",
  letterSpacing: "-0.01em",
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
  padding: "10px 20px",
  borderRadius: 8,
  border: "none",
  background: "var(--cast-iron)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};
