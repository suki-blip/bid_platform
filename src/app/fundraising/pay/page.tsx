"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtDate } from "@/lib/fundraising-format";
import { paymentMethodLabel, methodIsCheckLike, PAYMENT_METHODS } from "@/lib/fundraising-types";

interface DonorOption {
  id: string;
  first_name: string;
  last_name: string | null;
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

type Mode = "existing_pledge" | "new_donation";

export default function PayPage() {
  // Step 1: select donor
  const [donorQuery, setDonorQuery] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [donorId, setDonorId] = useState<string>("");
  const [donorBusy, setDonorBusy] = useState(false);

  // Step 2: choose mode
  const [mode, setMode] = useState<Mode>("new_donation");

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

  const selectedDonor = useMemo(() => donors.find((d) => d.id === donorId) || null, [donors, donorId]);
  const selectedPledge = useMemo(() => pledges.find((p) => p.id === pledgeId) || null, [pledges, pledgeId]);
  const selectedInstallment = useMemo(
    () => installments.find((i) => i.id === installmentId) || null,
    [installments, installmentId],
  );

  // Donor search — debounced lookup against /api/fundraising/donors which returns { total, donors: [...] }
  useEffect(() => {
    // Once a donor is selected we don't keep searching — the selectedDonor row is held in `donors` state.
    if (donorId) return;
    if (donorQuery.length < 2) {
      setDonors([]);
      return;
    }
    setDonorBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/fundraising/donors?search=${encodeURIComponent(donorQuery)}&limit=20`)
        .then((r) => (r.ok ? r.json() : { donors: [] }))
        .then((d) => setDonors(Array.isArray(d) ? d : d.donors || []))
        .finally(() => setDonorBusy(false));
    }, 200);
    return () => clearTimeout(t);
  }, [donorQuery, donorId]);

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

  async function cancelSession() {
    if (!session) return;
    if (!confirm("Cancel this payment? The pending charge will not be processed.")) return;
    await fetch(`/api/fundraising/payment-sessions/${session.token}`, { method: "DELETE" });
    reset();
  }

  // ---------- RENDER ----------
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
        {/* Step 1: Donor */}
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
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {[selectedDonor.organization, selectedDonor.email].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
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
            </div>
          ) : (
            <>
              <input
                value={donorQuery}
                onChange={(e) => setDonorQuery(e.target.value)}
                placeholder="Search donor by name, email, organization…"
                style={input}
                autoFocus
              />
              {donors.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    border: "1px solid rgba(10,16,25,0.08)",
                    borderRadius: 10,
                    overflow: "hidden",
                    maxHeight: 280,
                    overflowY: "auto",
                  }}
                >
                  {donors.map((d) => (
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
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {d.first_name} {d.last_name || ""}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          {[d.organization, d.email].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.55 }}>
                        Lifetime: <strong>{fmtMoney(d.total_paid)}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {donorQuery.length >= 2 && donors.length === 0 && !donorBusy && (
                <div style={{ fontSize: 12, opacity: 0.55, marginTop: 8 }}>No donors match.</div>
              )}
            </>
          )}
        </Section>

        {/* Step 2: Mode */}
        {selectedDonor && (
          <Section number={2} title="How to apply">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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

        {/* Step 3b: Existing pledge — pick pledge */}
        {selectedDonor && mode === "existing_pledge" && (
          <Section number={3} title="Pledge to apply to">
            {pledges.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.55 }}>
                This donor has no open pledges. Switch to <em>New donation</em> instead.
              </div>
            ) : (
              <select value={pledgeId} onChange={(e) => setPledgeId(e.target.value)} style={input} required>
                <option value="">— Select pledge —</option>
                {pledges.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fmtMoney(p.amount)} pledged ({fmtMoney(p.paid_amount)} paid){p.project_name ? ` · ${p.project_name}` : ""} · {fmtDate(p.pledge_date)}
                  </option>
                ))}
              </select>
            )}

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
              </div>
            )}
          </Section>
        )}

        {/* Step 4: Amount + notes */}
        {selectedDonor && (mode === "new_donation" || pledgeId) && (
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
        {selectedDonor && (mode === "new_donation" || pledgeId) && Number(amount) > 0 && (
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

              {method === "credit_card" && (
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
              {(["wire", "ach", "ojc_online", "pledger", "matbia", "quick_pay", "donors_fund", "credit_card"].includes(method)) && (
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
        {selectedDonor && (mode === "new_donation" || pledgeId) && Number(amount) > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {method === "credit_card" ? (
              <>
                <Link
                  href="/fundraising/settings"
                  style={{ fontSize: 11, color: "rgba(10,16,25,0.45)", textDecoration: "none", marginRight: "auto" }}
                >
                  Configure gateway →
                </Link>
                {/* Manual record (skip gateway) — secondary action */}
                <button
                  type="button"
                  onClick={() => submit(null, true)}
                  disabled={submitting}
                  style={btnLight}
                  title="Mark as paid without opening the gateway (e.g. you already charged the card elsewhere)"
                >
                  Record manually
                </button>
                {/* Primary action: gateway redirect */}
                <button type="submit" disabled={submitting} style={btnDark}>
                  {submitting ? "Preparing…" : `Continue to payment — ${fmtMoney(Number(amount) || 0)}`}
                </button>
              </>
            ) : (
              // Non-credit-card methods: single button — record immediately, no gateway
              <button type="submit" disabled={submitting} style={btnDark}>
                {submitting ? "Saving…" : `Record ${paymentMethodLabel(method)} — ${fmtMoney(Number(amount) || 0)}`}
              </button>
            )}
          </div>
        )}
      </form>
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
