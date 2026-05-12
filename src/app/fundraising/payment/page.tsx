"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, fmtDate } from "@/lib/fundraising-format";
import { paymentMethodLabel, methodIsCheckLike, PAYMENT_METHODS } from "@/lib/fundraising-types";
import SolaCardForm, { type SolaCardFormHandle } from "../_components/SolaCardForm";
import PledgeModal from "../_components/PledgeModal";

interface DonorOption {
  id: string;
  first_name: string;
  last_name: string | null;
  hebrew_name?: string | null;
  email: string | null;
  organization: string | null;
  total_pledged: number;
  total_paid: number;
}

interface ProjectOption {
  id: string;
  name: string;
  parent_id: string | null;
}

interface PledgeOption {
  id: string;
  amount: number;
  paid_amount: number;
  status: string;
  pledge_date: string;
  installments_total: number;
  payment_plan: string;
  project_name: string | null;
}

interface InstallmentOption {
  id: string;
  amount: number;
  status: string;
  due_date: string | null;
  installment_number: number;
}

interface SessionResponse {
  session_id: string;
  token: string;
  gateway_url: string | null;
  amount: number;
  payment_id: string;
  pledge_id: string;
  needs_gateway_config: boolean;
}

interface ManualRecordedResponse {
  recorded: true;
  payment_id: string;
  pledge_id: string;
  method: string;
  amount: number;
}

interface SessionStatus {
  id: string;
  status: string; // pending, completed, failed, expired
  amount: number;
  currency: string;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  gateway_ref: string | null;
  payment_status: string | null;
  paid_date: string | null;
}

type Mode = "existing_pledge" | "new_donation" | "split";

// One row in the split-allocation builder. `id` is just a stable React key.
interface AllocationRow {
  id: string;
  type: "existing_pledge" | "new_donation";
  pledge_id?: string;
  project_id?: string;
  amount: string; // string so the input behaves naturally; parsed at submit
}
function newAllocationRow(type: "existing_pledge" | "new_donation" = "new_donation"): AllocationRow {
  return { id: Math.random().toString(36).slice(2), type, amount: "" };
}

export default function PayPage() {
  // Step 1: select donor.
  // We load the full donor list once on mount and filter client-side as the manager types.
  // The list scrolls and is always visible — picking a donor just selects from this list.
  const [donorQuery, setDonorQuery] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [donorId, setDonorId] = useState<string>("");
  const [donorsLoading, setDonorsLoading] = useState(true);

  // Step 2: choose mode
  const [mode, setMode] = useState<Mode>("new_donation");

  // Split mode — multi-row allocation builder. Each row attributes part of the total
  // to either an existing pledge or a new donation to a project (or general).
  const [allocations, setAllocations] = useState<AllocationRow[]>([newAllocationRow()]);
  const allocationsTotal = useMemo(
    () => allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [allocations],
  );

  // For new_donation
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<string>("");

  // For existing_pledge
  const [pledges, setPledges] = useState<PledgeOption[]>([]);
  const [pledgeId, setPledgeId] = useState<string>("");
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [installmentId, setInstallmentId] = useState<string>("");

  // Common
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Payment method + method-specific fields. We use string here because PAYMENT_METHODS
  // is the source of truth (adding a new method only requires editing fundraising-types.ts).
  // 'pending' is excluded from the picker — it's only used internally by pledges as "decide later".
  const PICKABLE_METHODS = useMemo(
    () => PAYMENT_METHODS.filter((m) => m !== "pending"),
    [],
  );
  const [method, setMethod] = useState<string>("credit_card");
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [checkNumber, setCheckNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [ccLast4, setCcLast4] = useState("");
  const [ccHolder, setCcHolder] = useState("");
  const [transactionRef, setTransactionRef] = useState("");

  // After submit — session tracking (gateway path) or success card (manual path)
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [manualSuccess, setManualSuccess] = useState<ManualRecordedResponse | null>(null);

  // New-pledge-only modal state
  const [showNewPledge, setShowNewPledge] = useState(false);
  const [pledgeCreatedFlash, setPledgeCreatedFlash] = useState(false);

  // Sola / Cardknox in-system charge state
  const [solaConfig, setSolaConfig] = useState<{ can_charge: boolean; ifields_key: string; software_name: string } | null>(null);
  const solaFormRef = useRef<SolaCardFormHandle | null>(null);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeSuccess, setChargeSuccess] = useState<{ amount: number; transaction_ref: string | null; cc_last4: string | null; auth_code: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/fundraising/sola/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSolaConfig(d));
  }, []);

  const selectedDonor = useMemo(() => donors.find((d) => d.id === donorId) || null, [donors, donorId]);
  const selectedPledge = useMemo(() => pledges.find((p) => p.id === pledgeId) || null, [pledges, pledgeId]);
  const selectedInstallment = useMemo(
    () => installments.find((i) => i.id === installmentId) || null,
    [installments, installmentId],
  );

  // Load all donors once on mount — we filter client-side so the search is instant
  // and the full list stays visible underneath the search box.
  useEffect(() => {
    setDonorsLoading(true);
    fetch(`/api/fundraising/donors?limit=500`)
      .then((r) => (r.ok ? r.json() : { donors: [] }))
      .then((d) => setDonors(Array.isArray(d) ? d : d.donors || []))
      .finally(() => setDonorsLoading(false));
  }, []);

  // Filtered list — searches across English name, Hebrew name, email, organization.
  // Hebrew lowercase is a no-op so this works for both alphabets.
  const filteredDonors = useMemo(() => {
    const q = donorQuery.trim().toLowerCase();
    if (!q) return donors;
    return donors.filter((d) => {
      const haystack = [d.first_name, d.last_name, d.hebrew_name, d.email, d.organization]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [donors, donorQuery]);

  // Load active projects
  useEffect(() => {
    fetch("/api/fundraising/projects?status=active")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProjects(Array.isArray(d) ? d : []));
  }, []);

  // When donor selected + mode = existing_pledge, load that donor's open pledges
  useEffect(() => {
    if (!donorId || mode !== "existing_pledge") {
      setPledges([]);
      setPledgeId("");
      return;
    }
    fetch(`/api/fundraising/donors/${donorId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return setPledges([]);
        const open = (d.pledges || []).filter((p: PledgeOption) => p.status === "open");
        setPledges(open);
      });
  }, [donorId, mode]);

  // When pledge selected, load its scheduled installments
  useEffect(() => {
    if (!pledgeId) {
      setInstallments([]);
      setInstallmentId("");
      return;
    }
    fetch(`/api/fundraising/donors/${donorId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return setInstallments([]);
        const scheduled = (d.payments || []).filter(
          (p: { pledge_id: string; status: string }) =>
            p.pledge_id === pledgeId && p.status !== "paid" && p.status !== "cancelled",
        );
        setInstallments(scheduled);
      });
  }, [pledgeId, donorId]);

  // Auto-fill amount when an installment is selected
  useEffect(() => {
    if (selectedInstallment) {
      setAmount(String(selectedInstallment.amount));
    }
  }, [selectedInstallment]);

  // Poll session status while pending
  useEffect(() => {
    if (!session || sessionStatus?.status === "completed" || sessionStatus?.status === "failed") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/fundraising/payment-sessions/${session.token}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setSessionStatus(d);
      } catch {
        // ignore transient errors during polling
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, sessionStatus?.status]);

  function reset() {
    setSession(null);
    setSessionStatus(null);
    setManualSuccess(null);
    setDonorQuery("");
    setDonorId("");
    setMode("new_donation");
    setProjectId("");
    setPledgeId("");
    setInstallmentId("");
    setAmount("");
    setNotes("");
    setError("");
    setMethod("credit_card");
    setPaidDate(new Date().toISOString().slice(0, 10));
    setCheckNumber("");
    setBankName("");
    setCcLast4("");
    setCcHolder("");
    setTransactionRef("");
  }

  async function submit(e: React.FormEvent | null, recordManually: boolean) {
    if (e) e.preventDefault();
    setError("");

    if (!donorId) return setError("Please select a donor.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Please enter a valid amount.");
    if (mode === "existing_pledge" && !pledgeId) return setError("Please select an existing pledge.");

    setSubmitting(true);
    const body = {
      donor_id: donorId,
      mode,
      pledge_id: mode === "existing_pledge" ? pledgeId : null,
      payment_id: mode === "existing_pledge" && installmentId ? installmentId : null,
      project_id: mode === "new_donation" && projectId ? projectId : null,
      amount: amt,
      notes: notes.trim() || null,
      method,
      record_manually: recordManually,
      paid_date: recordManually ? paidDate || null : null,
      check_number: method === "check" ? checkNumber.trim() || null : null,
      bank_name: method === "check" ? bankName.trim() || null : null,
      cc_last4: method === "credit_card" ? ccLast4.trim() || null : null,
      cc_holder: method === "credit_card" ? ccHolder.trim() || null : null,
      transaction_ref: transactionRef.trim() || null,
    };

    try {
      const r = await fetch("/api/fundraising/payment-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Failed to record payment.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);

      // Branch: manual record vs gateway redirect.
      if (d.recorded) {
        setManualSuccess(d);
      } else {
        setSession(d);
        if (d.gateway_url) {
          window.open(d.gateway_url, "_blank", "noopener,noreferrer");
        }
      }
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  // Charge the donor's card in-system via Sola/Cardknox cc:sale. No redirect.
  const chargeNow = useCallback(async () => {
    setChargeError("");
    if (!donorId) {
      setChargeError("Please select a donor first.");
      return;
    }

    // Validate based on mode, compute the dollar total + the body shape we'll POST.
    let body: Record<string, unknown> = {};
    let displayTotal = 0;

    if (mode === "split") {
      const cleaned = allocations.filter((r) => Number(r.amount) > 0);
      if (cleaned.length === 0) {
        setChargeError("Add at least one allocation with an amount.");
        return;
      }
      for (const r of cleaned) {
        if (r.type === "existing_pledge" && !r.pledge_id) {
          setChargeError("Each pledge allocation needs a pledge selected.");
          return;
        }
      }
      displayTotal = cleaned.reduce((s, r) => s + Number(r.amount), 0);
      body = {
        donor_id: donorId,
        allocations: cleaned.map((r) => ({
          type: r.type,
          pledge_id: r.type === "existing_pledge" ? r.pledge_id : null,
          project_id: r.type === "new_donation" ? r.project_id || null : null,
          amount: Number(r.amount),
        })),
        notes: notes.trim() || null,
      };
    } else {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setChargeError("Please enter a valid amount.");
        return;
      }
      if (mode === "existing_pledge" && !pledgeId) {
        setChargeError("Please select a pledge.");
        return;
      }
      displayTotal = amt;
      body = {
        donor_id: donorId,
        mode,
        pledge_id: mode === "existing_pledge" ? pledgeId : null,
        payment_id: mode === "existing_pledge" && installmentId ? installmentId : null,
        project_id: mode === "new_donation" && projectId ? projectId : null,
        amount: amt,
        notes: notes.trim() || null,
      };
    }

    if (!solaFormRef.current) {
      setChargeError("Card form is not ready yet.");
      return;
    }

    setChargeBusy(true);
    let tokens;
    try {
      tokens = await solaFormRef.current.collectTokens();
    } catch (e) {
      setChargeError((e as Error).message);
      setChargeBusy(false);
      return;
    }

    try {
      // Merge card token fields into the body.
      Object.assign(body, {
        sut_card: tokens.sut_card,
        sut_cvv: tokens.sut_cvv,
        exp: tokens.exp,
        zip: tokens.zip,
        street: tokens.street,
      });

      const r = await fetch("/api/fundraising/sola/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setChargeError(d.reason || d.error || "Charge failed");
        setChargeBusy(false);
        return;
      }
      setChargeSuccess({
        amount: displayTotal,
        transaction_ref: d.transaction_ref,
        cc_last4: d.cc_last4,
        auth_code: d.auth_code,
      });
    } catch (e) {
      setChargeError((e as Error).message || "Network error");
    } finally {
      setChargeBusy(false);
    }
  }, [donorId, amount, mode, pledgeId, installmentId, projectId, notes, allocations]);

  async function cancelSession() {
    if (!session) return;
    if (!confirm("Cancel this payment? The pending charge will not be processed.")) return;
    await fetch(`/api/fundraising/payment-sessions/${session.token}`, { method: "DELETE" });
    reset();
  }

  // ---------- RENDER ----------
  if (chargeSuccess) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={h1Style}>Card charged</h1>
        <div
          style={{
            background: "#fff",
            border: "2px solid var(--shed-green)",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 8 }}>💳✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "var(--shed-green)" }}>
            {fmtMoney(chargeSuccess.amount)} approved
          </h2>
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
            {chargeSuccess.cc_last4 && <>Card ending {chargeSuccess.cc_last4} · </>}
            Sola ref {chargeSuccess.transaction_ref || "—"}
            {chargeSuccess.auth_code && <> · Auth {chargeSuccess.auth_code}</>}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setChargeSuccess(null);
                reset();
              }}
              style={btnDark}
            >
              Record another payment
            </button>
            <Link
              href="/fundraising/payments"
              style={{
                padding: "10px 18px",
                background: "transparent",
                color: "var(--cast-iron)",
                border: "1px solid rgba(10,16,25,0.18)",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              View all payments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (manualSuccess) {
    const methodLabel = paymentMethodLabel(manualSuccess.method);
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={h1Style}>Payment recorded</h1>
        <div
          style={{
            background: "#fff",
            border: "2px solid var(--shed-green)",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "var(--shed-green)" }}>
            {fmtMoney(manualSuccess.amount)} marked as paid
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>Method: {methodLabel}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <button onClick={reset} style={btnDark}>
              Record another payment
            </button>
            <Link
              href="/fundraising/collections"
              style={{
                padding: "10px 18px",
                background: "transparent",
                color: "var(--cast-iron)",
                border: "1px solid rgba(10,16,25,0.18)",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Open Collections
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (session) {
    const completed = sessionStatus?.status === "completed";
    const failed = sessionStatus?.status === "failed" || sessionStatus?.status === "expired";

    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={h1Style}>Payment in progress</h1>

        <div
          style={{
            background: "#fff",
            border: completed ? "2px solid var(--shed-green)" : failed ? "2px solid var(--cone-orange)" : "1px solid rgba(10,16,25,0.08)",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
          }}
        >
          {completed ? (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "var(--shed-green)" }}>
                Payment received
              </h2>
              <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 4px" }}>
                {fmtMoney(session.amount)} marked as paid.
              </p>
              {sessionStatus?.gateway_ref && (
                <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>
                  Transaction ref: <code>{sessionStatus.gateway_ref}</code>
                </p>
              )}
            </>
          ) : failed ? (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>⚠️</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "var(--cone-orange)" }}>
                {sessionStatus?.status === "expired" ? "Payment cancelled" : "Payment failed"}
              </h2>
              {sessionStatus?.failure_reason && (
                <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>{sessionStatus.failure_reason}</p>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Waiting for payment to complete…</h2>
              <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 16px", lineHeight: 1.5 }}>
                The payment gateway opened in a new tab. Once the donor finishes paying, this page
                will update automatically.
              </p>
              <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>
                Amount: <strong>{fmtMoney(session.amount)}</strong>
              </p>

              {session.gateway_url && (
                <a
                  href={session.gateway_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 18,
                    padding: "10px 18px",
                    background: "var(--blueprint)",
                    color: "#fff",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Re-open payment page →
                </a>
              )}

              {session.needs_gateway_config && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    background: "rgba(232,93,31,0.08)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--cone-orange)",
                    textAlign: "left",
                  }}
                >
                  <strong>Gateway not configured.</strong> Go to <Link href="/fundraising/settings">Settings</Link> and
                  set your payment gateway URL template, then create a new payment.
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            {!completed && !failed && (
              <button onClick={cancelSession} style={btnLight}>
                Cancel payment
              </button>
            )}
            <button onClick={reset} style={completed ? btnDark : btnLight}>
              {completed ? "Record another payment" : "Start over"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={h1Style}>Process payment</h1>
      <p style={{ fontSize: 13, opacity: 0.6, marginTop: -8, marginBottom: 24 }}>
        Pick a donor, choose how to apply the payment, and continue to your credit-card gateway.
      </p>

      <form
        onSubmit={(e) => submit(e, method !== "credit_card" /* non-CC always manual */)}
        style={{ display: "flex", flexDirection: "column", gap: 18 }}
      >
        {/* Step 1: Donor — search box + always-visible scrollable list */}
        <Section number={1} title="Choose donor">
          {selectedDonor ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 14,
                background: "rgba(45,122,61,0.06)",
                border: "1px solid rgba(45,122,61,0.25)",
                borderRadius: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {selectedDonor.first_name} {selectedDonor.last_name || ""}
                </div>
                {selectedDonor.hebrew_name && (
                  <div style={{ fontSize: 13, opacity: 0.7, fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>
                    {selectedDonor.hebrew_name}
                  </div>
                )}
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {[selectedDonor.organization, selectedDonor.email].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setDonorId("");
                    setDonorQuery("");
                  }}
                  style={btnTiny}
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPledge(true)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 700,
                    background: "transparent",
                    color: "var(--blueprint)",
                    border: "1px solid rgba(28,93,142,0.3)",
                    borderRadius: 6,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  title="Record a pledge promise without taking a payment now"
                >
                  + Pledge only
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                value={donorQuery}
                onChange={(e) => setDonorQuery(e.target.value)}
                placeholder="Search donor — name, Hebrew name, email, organization…"
                style={input}
                autoFocus
              />

              {donorsLoading ? (
                <div style={{ fontSize: 12, opacity: 0.55, marginTop: 12, padding: 12 }}>Loading donors…</div>
              ) : donors.length === 0 ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 18,
                    border: "1px dashed rgba(10,16,25,0.12)",
                    borderRadius: 10,
                    textAlign: "center",
                    fontSize: 13,
                    opacity: 0.6,
                  }}
                >
                  No donors yet. <Link href="/fundraising/donors/new" style={{ color: "var(--blueprint)" }}>Add a donor →</Link>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                      marginTop: 10,
                      marginBottom: 6,
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>
                      Showing {filteredDonors.length} of {donors.length}
                      {donorQuery && ` (filtered by "${donorQuery}")`}
                    </span>
                    {donorQuery && (
                      <button
                        type="button"
                        onClick={() => setDonorQuery("")}
                        style={{ background: "none", border: "none", color: "var(--blueprint)", cursor: "pointer", padding: 0, fontSize: 11 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      border: "1px solid rgba(10,16,25,0.08)",
                      borderRadius: 10,
                      overflow: "hidden",
                      maxHeight: 360,
                      overflowY: "auto",
                    }}
                  >
                    {filteredDonors.length === 0 ? (
                      <div style={{ padding: 18, textAlign: "center", fontSize: 13, opacity: 0.55 }}>
                        No donors match &quot;{donorQuery}&quot;
                      </div>
                    ) : (
                      filteredDonors.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setDonorId(d.id);
                            setDonorQuery("");
                          }}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 14px",
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px solid rgba(10,16,25,0.06)",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10,16,25,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {d.first_name} {d.last_name || ""}
                            </div>
                            {d.hebrew_name && (
                              <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>
                                {d.hebrew_name}
                              </div>
                            )}
                            <div style={{ fontSize: 11, opacity: 0.55 }}>
                              {[d.organization, d.email].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.55, textAlign: "right", marginLeft: 12 }}>
                            <div>Lifetime</div>
                            <div style={{ fontWeight: 700, color: "var(--cast-iron)" }}>{fmtMoney(d.total_paid)}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </Section>

        {/* Step 2: Mode */}
        {selectedDonor && (
          <Section number={2} title="How to apply">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <ModeCard
                active={mode === "new_donation"}
                title="New donation"
                desc="One-time donation to a project"
                onClick={() => setMode("new_donation")}
              />
              <ModeCard
                active={mode === "existing_pledge"}
                title="Apply to pledge"
                desc="Pay an existing open pledge"
                onClick={() => setMode("existing_pledge")}
              />
              <ModeCard
                active={mode === "split"}
                title="Split"
                desc="Divide across pledges + donations"
                onClick={() => setMode("split")}
              />
            </div>
          </Section>
        )}

        {/* Step 3a: New donation — pick project */}
        {selectedDonor && mode === "new_donation" && (
          <Section number={3} title="Project (optional)">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={input}>
              <option value="">— General —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.parent_id ? "↳ " : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </Section>
        )}

        {/* Step 3b: Existing pledge — pick pledge + show balance prominently */}
        {selectedDonor && mode === "existing_pledge" && (
          <Section number={3} title="Pledge to apply to">
            {pledges.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.6, padding: 14, background: "rgba(10,16,25,0.03)", borderRadius: 10 }}>
                This donor has no open pledges. Switch to <em>New donation</em> instead, or
                create a new pledge from the donor profile.
              </div>
            ) : (
              <select value={pledgeId} onChange={(e) => setPledgeId(e.target.value)} style={input} required>
                <option value="">— Select pledge —</option>
                {pledges.map((p) => {
                  const remaining = Math.max(0, p.amount - p.paid_amount);
                  return (
                    <option key={p.id} value={p.id}>
                      {fmtMoney(p.amount)} pledged · {fmtMoney(remaining)} remaining
                      {p.project_name ? ` · ${p.project_name}` : ""} · {fmtDate(p.pledge_date)}
                    </option>
                  );
                })}
              </select>
            )}

            {/* Pledge balance card — appears once a pledge is selected, with a one-click "Pay full remaining" */}
            {selectedPledge && (() => {
              const remaining = Math.max(0, selectedPledge.amount - selectedPledge.paid_amount);
              const pct = selectedPledge.amount > 0 ? Math.min(100, (selectedPledge.paid_amount / selectedPledge.amount) * 100) : 0;
              return (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    background: "rgba(28,93,142,0.04)",
                    border: "1px solid rgba(28,93,142,0.18)",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 10 }}>
                    <BalanceStat label="Pledged" value={fmtMoney(selectedPledge.amount)} />
                    <BalanceStat label="Paid so far" value={fmtMoney(selectedPledge.paid_amount)} tone="green" />
                    <BalanceStat
                      label="Remaining"
                      value={fmtMoney(remaining)}
                      tone={remaining === 0 ? "green" : "orange"}
                    />
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: "rgba(10,16,25,0.06)", borderRadius: 99, height: 6, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--shed-green)", transition: "width 300ms" }} />
                  </div>
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(remaining))}
                      style={{
                        padding: "8px 14px",
                        background: "var(--blueprint)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Pay full remaining — {fmtMoney(remaining)}
                    </button>
                  )}
                  {remaining === 0 && (
                    <div style={{ fontSize: 13, color: "var(--shed-green)", fontWeight: 600 }}>
                      ✓ This pledge is fully paid. You can still record an extra payment if needed.
                    </div>
                  )}
                </div>
              );
            })()}

            {selectedPledge && installments.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <label style={inputLabel}>Specific installment (optional)</label>
                <select value={installmentId} onChange={(e) => setInstallmentId(e.target.value)} style={input}>
                  <option value="">— Don&apos;t link to a specific installment (creates new) —</option>
                  {installments.map((i) => (
                    <option key={i.id} value={i.id}>
                      #{i.installment_number} · {fmtMoney(i.amount)} · due {fmtDate(i.due_date)} · {i.status}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                  Link to a specific installment to mark it paid, or leave blank to record a partial payment against the pledge.
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Step 3c: Split — allocation builder */}
        {selectedDonor && mode === "split" && (
          <Section number={3} title="Split allocations">
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10, lineHeight: 1.5 }}>
              Add one line per pledge or new donation this payment should cover. The sum of
              the lines is what gets charged to the card / recorded.
            </div>

            {allocations.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 120px 32px",
                  gap: 8,
                  marginBottom: 8,
                  alignItems: "center",
                }}
              >
                <select
                  value={row.type}
                  onChange={(e) => {
                    const type = e.target.value as "existing_pledge" | "new_donation";
                    setAllocations((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, type, pledge_id: undefined, project_id: undefined } : r,
                      ),
                    );
                  }}
                  style={input}
                >
                  <option value="existing_pledge">Existing pledge</option>
                  <option value="new_donation">New donation</option>
                </select>

                {row.type === "existing_pledge" ? (
                  pledges.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.55, padding: "8px 12px" }}>
                      No open pledges for this donor.
                    </div>
                  ) : (
                    <select
                      value={row.pledge_id || ""}
                      onChange={(e) =>
                        setAllocations((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, pledge_id: e.target.value } : r)),
                        )
                      }
                      style={input}
                    >
                      <option value="">— Select pledge —</option>
                      {pledges.map((p) => {
                        const rem = Math.max(0, p.amount - p.paid_amount);
                        return (
                          <option key={p.id} value={p.id}>
                            {fmtMoney(rem)} remaining of {fmtMoney(p.amount)}
                            {p.project_name ? ` · ${p.project_name}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  )
                ) : (
                  <select
                    value={row.project_id || ""}
                    onChange={(e) =>
                      setAllocations((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, project_id: e.target.value } : r)),
                      )
                    }
                    style={input}
                  >
                    <option value="">— General —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.parent_id ? "↳ " : ""}
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) =>
                    setAllocations((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)),
                    )
                  }
                  style={{ ...input, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                />

                <button
                  type="button"
                  onClick={() =>
                    setAllocations((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
                  }
                  disabled={allocations.length <= 1}
                  title="Remove this line"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(232,93,31,0.3)",
                    color: "var(--cone-orange)",
                    borderRadius: 6,
                    cursor: allocations.length > 1 ? "pointer" : "not-allowed",
                    opacity: allocations.length > 1 ? 1 : 0.3,
                    fontWeight: 700,
                    fontSize: 14,
                    height: 36,
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={() => setAllocations((prev) => [...prev, newAllocationRow()])}
                style={{
                  padding: "6px 12px",
                  background: "transparent",
                  border: "1px dashed rgba(10,16,25,0.2)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--blueprint)",
                }}
              >
                + Add another allocation
              </button>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Total: <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--cast-iron)" }}>{fmtMoney(allocationsTotal)}</span>
              </div>
            </div>
          </Section>
        )}

        {/* Step 4: Amount + notes (hidden in split mode — total is computed from allocations) */}
        {selectedDonor && mode !== "split" && (mode === "new_donation" || pledgeId) && (
          <Section number={4} title="Amount">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={inputLabel}>Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100.00"
                  style={input}
                  required
                  disabled={!!selectedInstallment}
                />
                {selectedInstallment && (
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                    Locked to selected installment.{" "}
                    <button
                      type="button"
                      onClick={() => setInstallmentId("")}
                      style={{ background: "none", border: "none", color: "var(--blueprint)", cursor: "pointer", fontSize: 11, padding: 0 }}
                    >
                      Unlink to edit
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label style={inputLabel}>Notes (optional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reference, campaign, etc."
                  style={input}
                />
              </div>
            </div>
          </Section>
        )}

        {/* Step 5: Payment method */}
        {selectedDonor &&
          ((mode === "split" && allocationsTotal > 0) ||
            ((mode === "new_donation" || pledgeId) && Number(amount) > 0)) && (
          <Section number={5} title="Payment method">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {PICKABLE_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    border: method === m ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                    background: method === m ? "rgba(10,16,25,0.04)" : "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  {paymentMethodLabel(m)}
                </button>
              ))}
            </div>

            {/* Method-specific fields */}
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Paid date — for all manual methods (CC paid_date is set by gateway webhook) */}
              {method !== "credit_card" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={inputLabel}>Date received</label>
                    <input
                      type="date"
                      value={paidDate}
                      onChange={(e) => setPaidDate(e.target.value)}
                      style={input}
                    />
                  </div>
                </div>
              )}

              {/* Check-style methods: regular check, check cash, OJC check all share these fields */}
              {methodIsCheckLike(method) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={inputLabel}>Check number</label>
                    <input
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      placeholder="e.g. 1042"
                      style={input}
                    />
                  </div>
                  <div>
                    <label style={inputLabel}>Bank name</label>
                    <input
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Chase, OJC, etc."
                      style={input}
                    />
                  </div>
                </div>
              )}

              {method === "credit_card" && solaConfig?.can_charge && (
                <div
                  style={{
                    background: "rgba(45,122,61,0.04)",
                    border: "1px solid rgba(45,122,61,0.2)",
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7, marginBottom: 10 }}>
                    Enter card details — charges via Sola Payments
                  </div>
                  <SolaCardForm
                    ifieldsKey={solaConfig.ifields_key}
                    softwareName={solaConfig.software_name}
                    disabled={chargeBusy}
                    onReady={(h) => (solaFormRef.current = h)}
                  />
                  {chargeError && (
                    <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 10 }}>{chargeError}</div>
                  )}
                </div>
              )}

              {method === "credit_card" && !solaConfig?.can_charge && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={inputLabel}>Card last 4 (optional)</label>
                    <input
                      value={ccLast4}
                      onChange={(e) => setCcLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="1234"
                      style={input}
                    />
                  </div>
                  <div>
                    <label style={inputLabel}>Cardholder name (optional)</label>
                    <input
                      value={ccHolder}
                      onChange={(e) => setCcHolder(e.target.value)}
                      style={input}
                    />
                  </div>
                </div>
              )}

              {/* Transaction-ref methods: wire, ACH, OJC online, Pledger, Matbia, Quick Pay,
                  Donors Fund — and credit card (gateway txn id) all expose this field */}
              {(["wire", "ach", "ojc_online", "ojc_credit_card", "pledger", "matbia", "quick_pay", "donors_fund", "credit_card"].includes(method)) && (
                <div>
                  <label style={inputLabel}>Transaction reference (optional)</label>
                  <input
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder={
                      method === "credit_card"
                        ? "Gateway transaction ID"
                        : method === "wire"
                        ? "Wire confirmation ID"
                        : method === "ach"
                        ? "ACH reference"
                        : `${paymentMethodLabel(method)} reference / confirmation`
                    }
                    style={input}
                  />
                </div>
              )}
            </div>
          </Section>
        )}

        {error && (
          <div
            style={{
              background: "rgba(232,93,31,0.08)",
              color: "var(--cone-orange)",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Submit row — branches by method */}
        {selectedDonor &&
          ((mode === "split" && allocationsTotal > 0) ||
            ((mode === "new_donation" || pledgeId) && Number(amount) > 0)) && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {(() => {
              // Total displayed on the action button depends on mode
              const displayTotal = mode === "split" ? allocationsTotal : Number(amount) || 0;
              const moneyStr = fmtMoney(displayTotal);

              if (method === "credit_card") {
                return (
                  <>
                    <Link
                      href="/fundraising/settings"
                      style={{ fontSize: 11, color: "rgba(10,16,25,0.45)", textDecoration: "none", marginRight: "auto" }}
                    >
                      Configure gateway →
                    </Link>
                    {/* Manual record (only for non-split single-target) */}
                    {mode !== "split" && (
                      <button
                        type="button"
                        onClick={() => submit(null, true)}
                        disabled={submitting || chargeBusy}
                        style={btnLight}
                        title="Mark as paid without opening the gateway"
                      >
                        Record manually
                      </button>
                    )}
                    {solaConfig?.can_charge ? (
                      <button type="button" onClick={chargeNow} disabled={chargeBusy || submitting} style={btnDark}>
                        {chargeBusy ? "Charging…" : `Charge card now — ${moneyStr}`}
                      </button>
                    ) : mode === "split" ? (
                      <div style={{ fontSize: 12, color: "var(--cone-orange)" }}>
                        Split payments require Sola integration. Configure in Settings.
                      </div>
                    ) : (
                      <button type="submit" disabled={submitting} style={btnDark}>
                        {submitting ? "Preparing…" : `Continue to payment — ${moneyStr}`}
                      </button>
                    )}
                  </>
                );
              }
              // Non-credit-card methods
              if (mode === "split") {
                return (
                  <div style={{ fontSize: 12, color: "var(--cone-orange)" }}>
                    Split payments are supported only for credit-card via Sola right now. Switch to a
                    single target, or change the method.
                  </div>
                );
              }
              return (
                <button type="submit" disabled={submitting} style={btnDark}>
                  {submitting ? "Saving…" : `Record ${paymentMethodLabel(method)} — ${moneyStr}`}
                </button>
              );
            })()}
          </div>
        )}
      </form>

      {/* New pledge (promise only) modal — opened from the donor card */}
      {showNewPledge && selectedDonor && (
        <PledgeModal
          donorId={selectedDonor.id}
          projects={projects}
          onClose={() => setShowNewPledge(false)}
          onCreated={() => {
            setShowNewPledge(false);
            setPledgeCreatedFlash(true);
            // Reload pledges so the new one is immediately selectable in Step 3b.
            if (selectedDonor) {
              fetch(`/api/fundraising/donors/${selectedDonor.id}/pledges?status=open`)
                .then((r) => (r.ok ? r.json() : []))
                .then((d) => setPledges(Array.isArray(d) ? d : []));
            }
            setTimeout(() => setPledgeCreatedFlash(false), 4000);
          }}
        />
      )}
      {pledgeCreatedFlash && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--shed-green)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(10,16,25,0.18)",
            zIndex: 300,
          }}
        >
          ✓ Pledge recorded
        </div>
      )}
    </div>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--cast-iron)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {number}
        </span>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, letterSpacing: "-0.005em" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function BalanceStat({ label, value, tone }: { label: string; value: string; tone?: "green" | "orange" }) {
  const color =
    tone === "green" ? "var(--shed-green)" : tone === "orange" ? "var(--cone-orange)" : "var(--cast-iron)";
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.65,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          fontFamily: "var(--font-bricolage), sans-serif",
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ModeCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 10,
        border: active ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
        background: active ? "rgba(10,16,25,0.04)" : "#fff",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>{desc}</div>
    </button>
  );
}

const h1Style: React.CSSProperties = {
  fontFamily: "var(--font-bricolage), sans-serif",
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: "0 0 6px",
};
const input: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const inputLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
  display: "block",
  marginBottom: 4,
};
const btnDark: React.CSSProperties = {
  padding: "11px 22px",
  background: "var(--cast-iron)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
const btnLight: React.CSSProperties = {
  padding: "10px 18px",
  background: "transparent",
  color: "var(--cast-iron)",
  border: "1px solid rgba(10,16,25,0.18)",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
const btnTiny: React.CSSProperties = {
  padding: "5px 10px",
  background: "transparent",
  color: "var(--blueprint)",
  border: "1px solid rgba(28,93,142,0.25)",
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
};
