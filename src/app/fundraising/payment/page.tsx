"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Next.js requires components calling useSearchParams() to be wrapped in a Suspense boundary
// so the SSR/prerender pass has something to fall back to while the URL is being read. We keep
// the existing PayPage implementation as PayPageInner and re-export a thin wrapper as default.
export default function PayPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, opacity: 0.6 }}>Loading payment…</div>}>
      <PayPageInner />
    </Suspense>
  );
}

function PayPageInner() {
  // Step 1: select donor.
  // We load the full donor list once on mount and filter client-side as the manager types.
  // The list scrolls and is always visible — picking a donor just selects from this list.
  const [donorQuery, setDonorQuery] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  // donor_id can be pre-populated via ?donor=<id> in the URL. This is how the donor profile's
  // "+ Record payment" / "+ Add payment" links route here — the donor is already chosen and
  // the user can jump straight to mode/amount selection without searching.
  const searchParams = useSearchParams();
  const initialDonorId = searchParams?.get("donor") || "";
  const [donorId, setDonorId] = useState<string>(initialDonorId);
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

  // Saved cards — populated when a donor is selected. The user can either pick a
  // saved card (one-click charge, no card-entry) OR enter a new card and (optionally)
  // tick "save this card for future charges".
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
  // 'new' = enter a new card via iFields. Any other value = the saved card id to charge.
  const [cardChoice, setCardChoice] = useState<"new" | string>("new");
  const [saveCard, setSaveCard] = useState(true);
  // When checked, the auto-receipt email is suppressed. Use cases:
  //   - Recording an internal/test transaction the donor shouldn't be notified about
  //   - The manager wants to send a custom receipt themselves via the Resend receipt button later
  const [skipReceipt, setSkipReceipt] = useState(false);

  // Charge mode (for credit-card payments only):
  //   'now'       — single charge, immediate (legacy default; nothing new persists).
  //   'scheduled' — single charge on a future date. Requires a saved card OR charging now
  //                 first to tokenize. We implement it as a pledge with installments=1 +
  //                 due_date=schedule_date + auto_charge_card_id. The daily cron handles it.
  //   'recurring' — multiple installments at a chosen cadence. Uses pledge + auto_charge_card_id
  //                 same as PledgeModal, but exposes the option to also charge the first
  //                 installment immediately so we get the token even with a new card.
  type ChargeMode = "now" | "scheduled" | "recurring";
  const [chargeMode, setChargeMode] = useState<ChargeMode>("now");
  // Scheduled-mode state
  const [scheduleDate, setScheduleDate] = useState<string>(() => {
    // Default to tomorrow so the date is in the future and the cron picks it up.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  // Recurring-mode state
  type RecurringPlan = "weekly" | "monthly" | "quarterly" | "annual";
  const [recPlan, setRecPlan] = useState<RecurringPlan>("monthly");
  const [recInstallments, setRecInstallments] = useState<string>("12");
  const [recPaymentDay, setRecPaymentDay] = useState<string>(""); // day-of-month (1-31) or day-of-week (0-6)
  const [recStartDate, setRecStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  // Whether the FIRST installment should be charged immediately (and the rest auto-scheduled).
  // Useful with a brand-new card: charging now both pulls money in AND tokenizes it for
  // future auto-charges. With a saved card, this is just a UX shortcut.
  const [chargeFirstNow, setChargeFirstNow] = useState(true);

  useEffect(() => {
    fetch("/api/fundraising/sola/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSolaConfig(d));
  }, []);

  // Reload saved cards when the donor changes.
  useEffect(() => {
    if (!donorId) {
      setSavedCards([]);
      setCardChoice("new");
      return;
    }
    fetch(`/api/fundraising/donors/${donorId}/cards`)
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d) => {
        const cards: SavedCard[] = Array.isArray(d.cards) ? d.cards : [];
        // Filter out expired — we won't offer to charge them.
        const usable = cards.filter((c) => !c.expired);
        setSavedCards(usable);
        // Default to the donor's default card if any, otherwise 'new'
        const def = usable.find((c) => c.is_default);
        setCardChoice(def ? def.id : usable.length > 0 ? usable[0].id : "new");
      })
      .catch(() => setSavedCards([]));
  }, [donorId]);

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
        // Open + not-standalone (synthetic pledges shouldn't appear in the pledge selector
        // since they're just wrappers around one-off donations, not real commitments).
        const open = (d.pledges || []).filter(
          (p: PledgeOption & { is_standalone?: number }) =>
            p.status === "open" && !p.is_standalone,
        );
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

    setChargeBusy(true);

    // Branch by chargeMode + card source.
    //
    // Card paths:
    //   - 'saved':    chargeChoice points to an existing fr_donor_cards row id
    //   - 'new':      collect iFields tokens; charging now triggers save_card=true (so the
    //                 token persists for any scheduled/recurring follow-ups)
    //
    // Charge modes:
    //   - 'now':       single immediate charge. Uses /sola/charge or /sola/charge-token.
    //   - 'scheduled': single charge on a future date. Requires saved card. Creates a pledge
    //                  with installments=1, due_date=schedule_date, auto_charge_card_id=...
    //                  The daily cron picks it up on the date.
    //   - 'recurring': N installments with a chosen cadence. Always creates a pledge with
    //                  auto_charge_card_id. If a saved card is used + chargeFirstNow=false,
    //                  the cron handles every installment. With a new card or chargeFirstNow=true,
    //                  we charge the first installment immediately (using /sola/charge with
    //                  save_card=true) and pass the resulting card_id to the pledge.
    const useSavedCard = cardChoice !== "new";
    const isSplit = mode === "split";

    // Validation: split mode is only meaningful with 'now' (one-shot multi-allocation).
    if (isSplit && chargeMode !== "now") {
      setChargeError("Split payments must be charged immediately. Switch back to 'Charge now'.");
      setChargeBusy(false);
      return;
    }
    if (chargeMode === "scheduled" && !useSavedCard) {
      setChargeError(
        "Scheduled charges require a saved card. Charge now once first to tokenize the card, then schedule.",
      );
      setChargeBusy(false);
      return;
    }
    if (chargeMode === "recurring") {
      const n = Number(recInstallments);
      if (!Number.isInteger(n) || n < 2) {
        setChargeError("Recurring requires at least 2 installments.");
        setChargeBusy(false);
        return;
      }
    }

    try {
      // ===== Mode: charge now (legacy path, unchanged) =====
      if (chargeMode === "now") {
        if (useSavedCard) {
          const r = await fetch("/api/fundraising/sola/charge-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, card_id: cardChoice, skip_receipt: skipReceipt }),
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
          return;
        }
        // New card immediate charge
        if (!solaFormRef.current) {
          setChargeError("Card form is not ready yet.");
          setChargeBusy(false);
          return;
        }
        let tokens;
        try {
          tokens = await solaFormRef.current.collectTokens();
        } catch (e) {
          setChargeError((e as Error).message);
          setChargeBusy(false);
          return;
        }
        Object.assign(body, {
          sut_card: tokens.sut_card,
          sut_cvv: tokens.sut_cvv,
          exp: tokens.exp,
          zip: tokens.zip,
          street: tokens.street,
          save_card: saveCard,
          skip_receipt: skipReceipt,
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
        return;
      }

      // ===== Mode: scheduled (single future-dated charge) =====
      // Requires saved card (validated above). Build a 1-installment pledge with
      // due_date=schedule_date and auto_charge_card_id=<saved card>.
      if (chargeMode === "scheduled") {
        const amt = Number(amount);
        const r = await fetch(`/api/fundraising/donors/${donorId}/pledges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            project_id: mode === "new_donation" && projectId ? projectId : null,
            pledge_date: scheduleDate, // anchor; due_date for the one installment matches
            installments_total: 1,
            payment_plan: "lump_sum",
            default_method: "credit_card",
            collection_mode: "manual",
            auto_charge_card_id: cardChoice,
            notes: notes.trim() || null,
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.id) {
          setChargeError(d.error || "Failed to schedule charge");
          setChargeBusy(false);
          return;
        }
        // Surface a friendly success message. Reuse chargeSuccess shape — refrains from
        // implying immediate settlement. We borrow `transaction_ref` for the pledge id so
        // the user has something to reference.
        setChargeSuccess({
          amount: amt,
          transaction_ref: `Scheduled for ${scheduleDate}`,
          cc_last4: null,
          auth_code: null,
        });
        return;
      }

      // ===== Mode: recurring (multi-installment pledge with auto-charge) =====
      // If using a saved card + !chargeFirstNow: just create the pledge with auto-charge.
      // Otherwise we charge the first installment now (which also tokenizes a new card)
      // and then create the pledge for the REMAINING installments only, anchored to the
      // next due date.
      const amt = Number(amount);
      const installments = Number(recInstallments);
      const paymentDay = recPaymentDay === "" ? null : Number(recPaymentDay);

      // Path A: saved card, no first-now charge — pure cron handling.
      if (useSavedCard && !chargeFirstNow) {
        const r = await fetch(`/api/fundraising/donors/${donorId}/pledges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt * installments,
            project_id: mode === "new_donation" && projectId ? projectId : null,
            pledge_date: recStartDate,
            installments_total: installments,
            payment_plan: recPlan,
            payment_day: paymentDay,
            default_method: "credit_card",
            collection_mode: "manual",
            auto_charge_card_id: cardChoice,
            notes: notes.trim() || null,
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.id) {
          setChargeError(d.error || "Failed to create recurring plan");
          setChargeBusy(false);
          return;
        }
        setChargeSuccess({
          amount: amt * installments,
          transaction_ref: `Recurring plan created (${installments} × ${fmtMoney(amt)})`,
          cc_last4: null,
          auth_code: null,
        });
        return;
      }

      // Path B: charge first installment now, then create pledge for the rest.
      // For a new card: chargeNow flows through /sola/charge with save_card=true. The
      // response includes saved_card_id we can attach to the pledge.
      // For a saved card with chargeFirstNow=true: use /sola/charge-token, then create pledge.
      let firstChargeResult;
      if (useSavedCard) {
        const r = await fetch("/api/fundraising/sola/charge-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            donor_id: donorId,
            mode: mode === "existing_pledge" ? "existing_pledge" : "new_donation",
            pledge_id: mode === "existing_pledge" ? pledgeId : null,
            project_id: mode === "new_donation" && projectId ? projectId : null,
            amount: amt,
            notes: notes.trim() || null,
            card_id: cardChoice,
            skip_receipt: skipReceipt,
          }),
        });
        firstChargeResult = await r.json();
        if (!r.ok || !firstChargeResult.ok) {
          setChargeError(firstChargeResult.reason || firstChargeResult.error || "First charge failed");
          setChargeBusy(false);
          return;
        }
      } else {
        // New card — collect tokens, charge with save_card=true so the token is persisted.
        if (!solaFormRef.current) {
          setChargeError("Card form is not ready yet.");
          setChargeBusy(false);
          return;
        }
        let tokens;
        try {
          tokens = await solaFormRef.current.collectTokens();
        } catch (e) {
          setChargeError((e as Error).message);
          setChargeBusy(false);
          return;
        }
        const r = await fetch("/api/fundraising/sola/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            donor_id: donorId,
            mode: "new_donation",
            project_id: mode === "new_donation" && projectId ? projectId : null,
            amount: amt,
            notes: notes.trim() || null,
            sut_card: tokens.sut_card,
            sut_cvv: tokens.sut_cvv,
            exp: tokens.exp,
            zip: tokens.zip,
            street: tokens.street,
            save_card: true,
            set_default: false,
            skip_receipt: skipReceipt,
          }),
        });
        firstChargeResult = await r.json();
        if (!r.ok || !firstChargeResult.ok) {
          setChargeError(firstChargeResult.reason || firstChargeResult.error || "First charge failed");
          setChargeBusy(false);
          return;
        }
        if (!firstChargeResult.saved_card_id) {
          setChargeError(
            "First charge succeeded but the card could not be saved for future installments.",
          );
          setChargeBusy(false);
          return;
        }
      }

      const cardIdForRest = useSavedCard ? cardChoice : firstChargeResult.saved_card_id;
      const remaining = installments - 1;
      // Compute the NEXT due date — the first installment was just charged today, so the
      // pledge anchor should be the date of the SECOND installment. We pass that as
      // pledge_date and let the backend's generateInstallmentDates() do the rest.
      const today = new Date();
      const nextDate = new Date(today);
      if (recPlan === "weekly") nextDate.setDate(nextDate.getDate() + 7);
      else if (recPlan === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);
      else if (recPlan === "quarterly") nextDate.setMonth(nextDate.getMonth() + 3);
      else nextDate.setFullYear(nextDate.getFullYear() + 1);
      const pledgeDateForRest = nextDate.toISOString().slice(0, 10);

      if (remaining > 0) {
        const r = await fetch(`/api/fundraising/donors/${donorId}/pledges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt * remaining,
            project_id: mode === "new_donation" && projectId ? projectId : null,
            pledge_date: pledgeDateForRest,
            installments_total: remaining,
            payment_plan: recPlan,
            payment_day: paymentDay,
            default_method: "credit_card",
            collection_mode: "manual",
            auto_charge_card_id: cardIdForRest,
            notes: notes.trim()
              ? `${notes.trim()} (recurring, first installment charged ${today.toISOString().slice(0, 10)})`
              : `Recurring (first installment charged ${today.toISOString().slice(0, 10)})`,
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.id) {
          setChargeError(
            `First charge succeeded but failed to schedule remaining installments: ${d.error || "unknown"}`,
          );
          setChargeBusy(false);
          return;
        }
      }

      setChargeSuccess({
        amount: amt,
        transaction_ref: firstChargeResult.transaction_ref,
        cc_last4: firstChargeResult.cc_last4,
        auth_code: firstChargeResult.auth_code,
      });
    } catch (e) {
      setChargeError((e as Error).message || "Network error");
    } finally {
      setChargeBusy(false);
    }
  }, [
    donorId,
    amount,
    mode,
    pledgeId,
    installmentId,
    projectId,
    notes,
    allocations,
    cardChoice,
    saveCard,
    chargeMode,
    scheduleDate,
    recPlan,
    recInstallments,
    recPaymentDay,
    recStartDate,
    chargeFirstNow,
  ]);

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
                  {/* When-to-charge picker: single immediate | single scheduled | recurring installments. */}
                  {mode !== "split" && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7, marginBottom: 8 }}>
                        When to charge
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                        {([
                          { id: "now", title: "Charge now", desc: "One-time, immediate" },
                          { id: "scheduled", title: "Schedule", desc: "One-time, future date" },
                          { id: "recurring", title: "Recurring", desc: "Multiple installments" },
                        ] as { id: ChargeMode; title: string; desc: string }[]).map((opt) => (
                          <label
                            key={opt.id}
                            style={{
                              padding: "10px 12px",
                              border: chargeMode === opt.id ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                              borderRadius: 8,
                              background: chargeMode === opt.id ? "rgba(10,16,25,0.03)" : "#fff",
                              cursor: "pointer",
                              textAlign: "center",
                            }}
                          >
                            <input
                              type="radio"
                              name="charge-mode"
                              checked={chargeMode === opt.id}
                              onChange={() => setChargeMode(opt.id)}
                              style={{ display: "none" }}
                            />
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.title}</div>
                            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{opt.desc}</div>
                          </label>
                        ))}
                      </div>

                      {/* Scheduled-mode date picker */}
                      {chargeMode === "scheduled" && (
                        <div style={{ marginTop: 12 }}>
                          <label style={inputLabel}>Charge date</label>
                          <input
                            type="date"
                            value={scheduleDate}
                            min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            style={input}
                          />
                          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, lineHeight: 1.4 }}>
                            ⓘ The daily auto-charge cron will attempt this charge on the chosen date.
                            Scheduled charges require a <strong>saved card</strong> — if the donor has
                            none yet, use &quot;Charge now&quot; first to tokenize their card.
                          </div>
                        </div>
                      )}

                      {/* Recurring-mode config */}
                      {chargeMode === "recurring" && (
                        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={inputLabel}>Frequency</label>
                            <select
                              value={recPlan}
                              onChange={(e) => {
                                setRecPlan(e.target.value as RecurringPlan);
                                setRecPaymentDay(""); // day interpretation differs per plan
                              }}
                              style={input}
                            >
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                              <option value="quarterly">Quarterly</option>
                              <option value="annual">Annual</option>
                            </select>
                          </div>
                          <div>
                            <label style={inputLabel}>Number of installments</label>
                            <input
                              type="number"
                              min="2"
                              value={recInstallments}
                              onChange={(e) => setRecInstallments(e.target.value)}
                              style={input}
                            />
                          </div>
                          {recPlan === "weekly" ? (
                            <div>
                              <label style={inputLabel}>Day of the week</label>
                              <select value={recPaymentDay} onChange={(e) => setRecPaymentDay(e.target.value)} style={input}>
                                <option value="">— Use start date&apos;s weekday —</option>
                                <option value="0">Sunday</option>
                                <option value="1">Monday</option>
                                <option value="2">Tuesday</option>
                                <option value="3">Wednesday</option>
                                <option value="4">Thursday</option>
                                <option value="5">Friday</option>
                                <option value="6">Saturday</option>
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label style={inputLabel}>Day of the month (1-31)</label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={recPaymentDay}
                                placeholder="Use start date's day"
                                onChange={(e) => setRecPaymentDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                                style={input}
                              />
                            </div>
                          )}
                          <div>
                            <label style={inputLabel}>Start date</label>
                            <input
                              type="date"
                              value={recStartDate}
                              onChange={(e) => setRecStartDate(e.target.value)}
                              style={input}
                            />
                          </div>
                          <div style={{ gridColumn: "span 2" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: cardChoice === "new" ? "not-allowed" : "pointer" }}>
                              <input
                                type="checkbox"
                                checked={chargeFirstNow || cardChoice === "new"}
                                onChange={(e) => setChargeFirstNow(e.target.checked)}
                                disabled={cardChoice === "new"}
                              />
                              <span>
                                Charge the first installment immediately
                                {cardChoice === "new" && (
                                  <span style={{ opacity: 0.65, fontSize: 11, marginLeft: 6 }}>
                                    (required to tokenize a new card)
                                  </span>
                                )}
                              </span>
                            </label>
                          </div>
                          <div style={{ gridColumn: "span 2", fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>
                            ⓘ The first installment&apos;s due-date is the start date. Subsequent
                            installments follow the cadence and day-of-month/week rules. The daily
                            auto-charge cron handles each one on its due date.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Saved card picker — shows only if the donor has any usable cards on file */}
                  {savedCards.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7, marginBottom: 8 }}>
                        Use saved card or enter new
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {savedCards.map((c) => (
                          <label
                            key={c.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "9px 12px",
                              border: cardChoice === c.id ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
                              borderRadius: 8,
                              background: cardChoice === c.id ? "rgba(10,16,25,0.03)" : "#fff",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="radio"
                              name="card-choice"
                              checked={cardChoice === c.id}
                              onChange={() => setCardChoice(c.id)}
                            />
                            <div style={{ flex: 1, fontSize: 13 }}>
                              <strong>{c.cc_brand || "Card"}</strong> ending {c.cc_last4 || "????"}
                              {c.exp_month && c.exp_year && (
                                <span style={{ opacity: 0.6, marginLeft: 8, fontSize: 12 }}>
                                  exp {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}
                                </span>
                              )}
                              {c.is_default && (
                                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "var(--shed-green)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Default
                                </span>
                              )}
                            </div>
                          </label>
                        ))}
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "9px 12px",
                            border: cardChoice === "new" ? "2px solid var(--cast-iron)" : "1px dashed rgba(10,16,25,0.2)",
                            borderRadius: 8,
                            background: cardChoice === "new" ? "rgba(10,16,25,0.03)" : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="radio"
                            name="card-choice"
                            checked={cardChoice === "new"}
                            onChange={() => setCardChoice("new")}
                          />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>+ Enter a new card</div>
                        </label>
                      </div>
                    </div>
                  )}

                  {cardChoice === "new" && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7, marginBottom: 10 }}>
                        Enter card details — charges via Sola Payments
                      </div>
                      <SolaCardForm
                        ifieldsKey={solaConfig.ifields_key}
                        softwareName={solaConfig.software_name}
                        disabled={chargeBusy}
                        onReady={(h) => (solaFormRef.current = h)}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={saveCard}
                          onChange={(e) => setSaveCard(e.target.checked)}
                        />
                        <span>Save this card on file for future charges</span>
                      </label>
                    </>
                  )}

                  {/* Skip-receipt toggle — applies to every charge mode + every card source.
                      Visible once for the whole credit_card section so the user sees it
                      regardless of whether they picked a saved card or are entering a new one. */}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={skipReceipt}
                      onChange={(e) => setSkipReceipt(e.target.checked)}
                    />
                    <span>
                      Don&apos;t send receipt email to donor
                      <span style={{ opacity: 0.55, marginLeft: 6, fontSize: 11 }}>
                        (you can still send one manually from the Payments page)
                      </span>
                    </span>
                  </label>

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
                        {(() => {
                          if (chargeBusy) {
                            return chargeMode === "scheduled"
                              ? "Scheduling…"
                              : chargeMode === "recurring"
                              ? "Setting up…"
                              : "Charging…";
                          }
                          if (chargeMode === "scheduled") {
                            return `Schedule charge — ${moneyStr} on ${scheduleDate}`;
                          }
                          if (chargeMode === "recurring") {
                            const n = Number(recInstallments) || 0;
                            const total = (Number(amount) || 0) * n;
                            return `Set up ${n} × ${moneyStr} (total ${fmtMoney(total)})`;
                          }
                          return `Charge card now — ${moneyStr}`;
                        })()}
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
