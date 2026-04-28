"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

interface Parameter {
  name: string;
  options: string[];
  is_track?: boolean;
}

interface CheckItem {
  text: string;
  required: boolean;
}

interface BidData {
  bid_id: string;
  title: string;
  description: string;
  deadline: string;
  vendor_name: string;
  has_portal_account: boolean;
  parameters: Parameter[];
  checklist: CheckItem[];
  allow_ve: boolean;
  bid_mode: 'structured' | 'open';
  suggested_specs?: string[];
}

interface ProposalSpec {
  key: string;
  value: string;
}

interface Proposal {
  name: string;
  price: string;
  specs: ProposalSpec[];
}

function VendorSubmitPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;

  // Spec completion mode
  const completeSpecsParam = searchParams.get("complete_specs");
  const responseIdParam = searchParams.get("response_id");
  let requestedSpecs: string[] = [];
  try { if (completeSpecsParam) requestedSpecs = JSON.parse(decodeURIComponent(completeSpecsParam)); } catch {}
  const isSpecMode = requestedSpecs.length > 0 && !!responseIdParam;

  const [specValues, setSpecValues] = useState<Record<string, { included: boolean; value: string }>>({});
  const [specSubmitting, setSpecSubmitting] = useState(false);
  const [specSubmitted, setSpecSubmitted] = useState(false);

  const [bid, setBid] = useState<BidData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});

  // Portal account setup
  const [portalPw, setPortalPw] = useState("");
  const [portalPwConfirm, setPortalPwConfirm] = useState("");
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalDone, setPortalDone] = useState(false);
  const [portalError, setPortalError] = useState("");

  // Checklist answers
  const [checkAnswers, setCheckAnswers] = useState<Record<number, boolean>>({});

  // VE prices (separate map keyed same as prices)
  const [vePrices, setVePrices] = useState<Record<string, string>>({});

  // New structured pricing: base + per-option deltas
  const [basePrice, setBasePrice] = useState("");
  const [modifiers, setModifiers] = useState<Record<string, Record<string, string>>>({}); // param -> option -> extra amount ("" = 0)

  // Track selection for viewing
  const [activeTrack, setActiveTrack] = useState<string | null>(null);

  // Open proposal mode
  const [proposals, setProposals] = useState<Proposal[]>([
    { name: "", price: "", specs: [{ key: "", value: "" }] },
  ]);
  const [activeProposal, setActiveProposal] = useState(0);

  // AI scan
  const [showAiScan, setShowAiScan] = useState(false);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [aiUrl, setAiUrl] = useState("");
  const [aiUrlLoading, setAiUrlLoading] = useState(false);

  // Vendor notes / remarks
  const [vendorNotes, setVendorNotes] = useState("");

  // File attachments
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    fetch(`/api/vendor-submit/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (data.submitted) { setSubmitted(true); return; }
          throw new Error(data.error || "Failed to load bid");
        }
        setBid(data);
        // Initialize proposals with suggested specs if open mode
        if (data.bid_mode === "open" && data.suggested_specs && data.suggested_specs.length > 0) {
          const defaultSpecs = data.suggested_specs.map((key: string) => ({ key, value: "" }));
          defaultSpecs.push({ key: "", value: "" }); // extra empty row
          setProposals([{ name: "", price: "", specs: defaultSpecs }]);
        }
        // Initialize price inputs for each combination
        if (data.parameters && data.parameters.length > 0) {
          const combos = getCombinations(data.parameters);
          const init: Record<string, string> = {};
          combos.forEach(c => { init[JSON.stringify(c)] = ""; });
          setPrices(init);

          // Set first track as active
          const track = data.parameters.find((p: Parameter) => p.is_track);
          if (track) setActiveTrack(track.options[0] || null);
        }
        // Initialize modifiers for new structured mode
        if (data.parameters && data.parameters.length > 0) {
          const initMods: Record<string, Record<string, string>> = {};
          for (const param of data.parameters) {
            initMods[param.name] = {};
            for (const opt of param.options) {
              initMods[param.name][opt] = ""; // "" means 0 / included in base
            }
          }
          setModifiers(initMods);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Initialize spec completion values
    if (isSpecMode && requestedSpecs.length > 0) {
      const init: Record<string, { included: boolean; value: string }> = {};
      requestedSpecs.forEach(k => { init[k] = { included: false, value: "" }; });
      setSpecValues(init);
    }
  }, [token]);

  function getCombinations(parameters: Parameter[]): Record<string, string>[] {
    if (parameters.length === 0) return [{}];
    const [first, ...rest] = parameters;
    const restCombos = getCombinations(rest);
    const result: Record<string, string>[] = [];
    for (const option of first.options) {
      for (const combo of restCombos) {
        result.push({ [first.name]: option, ...combo });
      }
    }
    return result;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validate required checklist items
    if (bid?.checklist && bid.checklist.length > 0) {
      const missingRequired = bid.checklist
        .filter((item, i) => item.required && !checkAnswers[i])
        .map(item => item.text);
      if (missingRequired.length > 0) {
        setError(`Please check all required items: ${missingRequired[0]}`);
        setSubmitting(false);
        return;
      }
    }

    // Build checklist answers
    const checklistAnswers = bid?.checklist
      ? bid.checklist.map((item, i) => ({ text: item.text, checked: !!checkAnswers[i] }))
      : [];

    // Open proposal mode
    if (bid?.bid_mode === "open") {
      const validProposals = proposals.filter(p => p.name.trim() && p.price);
      if (validProposals.length === 0) {
        setError("Please add at least one proposal with a name and price");
        setSubmitting(false);
        return;
      }
      const payload = validProposals.map(p => ({
        name: p.name.trim(),
        price: parseFloat(p.price),
        specs: p.specs.filter(s => s.key.trim() && s.value.trim()).map(s => ({
          key: s.key.trim(),
          value: s.value.trim(),
        })),
      }));

      try {
        // Use FormData if we have attachments
        if (attachments.length > 0) {
          const formData = new FormData();
          formData.append("json", JSON.stringify({
            proposals: payload,
            checklist_answers: checklistAnswers,
            notes: vendorNotes.trim() || undefined,
          }));
          for (const f of attachments) formData.append("files", f);
          const res = await fetch(`/api/vendor-submit/${token}`, {
            method: "POST",
            body: formData,
          });
          if (res.ok) { setSubmitted(true); }
          else { const data = await res.json(); setError(data.error || "Submission failed"); }
        } else {
          const res = await fetch(`/api/vendor-submit/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proposals: payload,
              checklist_answers: checklistAnswers,
              notes: vendorNotes.trim() || undefined,
            }),
          });
          if (res.ok) { setSubmitted(true); }
          else { const data = await res.json(); setError(data.error || "Submission failed"); }
        }
      } catch { setError("Submission failed"); }
      finally { setSubmitting(false); }
      return;
    }

    // New structured mode: calculate combinations from base + modifiers
    const base = parseFloat(basePrice);
    if (!basePrice || isNaN(base) || base <= 0) {
      setError("Please enter a base price");
      setSubmitting(false);
      return;
    }

    // Build proposals from all combinations
    const combos = bid!.parameters.length > 0 ? getCombinations(bid!.parameters) : [{}];
    const calcProposals = combos.map(combo => {
      let total = base;
      for (const [paramName, optionValue] of Object.entries(combo)) {
        const delta = parseFloat(modifiers[paramName]?.[optionValue] || "0") || 0;
        total += delta;
      }
      const comboName = Object.values(combo).length > 0 ? Object.values(combo).join(" × ") : "Standard";
      return { name: comboName, price: total, specs: [] };
    });

    try {
      const payload = {
        proposals: calcProposals,
        checklist_answers: checklistAnswers,
        notes: vendorNotes.trim() || undefined,
      };
      if (attachments.length > 0) {
        const formData = new FormData();
        formData.append("json", JSON.stringify(payload));
        for (const f of attachments) formData.append("files", f);
        const res = await fetch(`/api/vendor-submit/${token}`, { method: "POST", body: formData });
        if (res.ok) setSubmitted(true);
        else { const d = await res.json(); setError(d.error || "Submission failed"); }
      } else {
        const res = await fetch(`/api/vendor-submit/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) setSubmitted(true);
        else { const d = await res.json(); setError(d.error || "Submission failed"); }
      }
    } catch { setError("Submission failed"); }
    finally { setSubmitting(false); }
  };

  async function handleSpecSubmit() {
    if (!responseIdParam) return;
    setSpecSubmitting(true);
    try {
      const specs = Object.entries(specValues)
        .filter(([, v]) => v.included && v.value.trim())
        .map(([key, v]) => ({ key, value: v.value.trim() }));

      const res = await fetch(`/api/vendor-submit/${token}/complete-specs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_id: responseIdParam,
          specs,
          declined_specs: Object.entries(specValues)
            .filter(([, v]) => !v.included)
            .map(([key]) => key),
        }),
      });
      if (res.ok) {
        setSpecSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit specs");
      }
    } catch {
      setError("Failed to submit specs");
    } finally {
      setSpecSubmitting(false);
    }
  }

  async function handleAiUrlFetch() {
    if (!aiUrl.trim()) return;
    setAiUrlLoading(true);
    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: aiUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.base64) {
        const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
        const file = new File([bytes], data.filename, { type: data.contentType });
        setAiFile(file);
        setAiUrl("");
      } else {
        setError(data.error || "Failed to download");
      }
    } catch { setError("Failed to download from URL"); }
    finally { setAiUrlLoading(false); }
  }

  async function handleAiScan() {
    if (!bid || (!aiFile && !aiText.trim())) return;
    setAiParsing(true);
    try {
      const formData = new FormData();
      if (aiFile) formData.append("file", aiFile);
      if (aiText.trim()) formData.append("text", aiText.trim());
      const res = await fetch(`/api/vendor-submit/${token}/ai-parse`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.data) {
        const parsed = data.data;
        const newProposals: Proposal[] = (parsed.proposals || []).map((p: any) => ({
          name: p.name || "",
          price: String(p.price || ""),
          specs: (p.specs || []).length > 0
            ? p.specs.map((s: any) => ({ key: s.key || "", value: s.value || "" }))
            : [{ key: "", value: "" }],
        }));
        if (newProposals.length > 0) {
          setProposals(newProposals);
          setActiveProposal(0);
        }
        setShowAiScan(false);
        setAiFile(null);
        setAiText("");
      } else {
        setError(data.error || "AI parsing failed");
      }
    } catch {
      setError("AI parsing failed");
    } finally {
      setAiParsing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)" }}>
        <div style={{ width: 32, height: 32, border: "4px solid #ccc", borderTopColor: "#d97706", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  // Spec completion mode UI
  if (isSpecMode) {
    if (specSubmitted) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          <div style={{ maxWidth: 480, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>Specs Updated!</h2>
            <p style={{ color: "#666", fontSize: "0.9rem" }}>Your specification details have been submitted successfully. The contractor will review your updates.</p>
            <a href="/login?tab=vendor" style={{ display: "inline-block", marginTop: 20, padding: "10px 24px", background: "#d97706", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>
              Go to Vendor Portal
            </a>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: "100vh", background: "var(--bg, #f9f9f6)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
        {/* Header */}
        <div style={{ background: "#1a1a1a", color: "#fff", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1rem" }}>BidMaster</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Spec Completion</div>
          </div>
          {bid && <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>Welcome, {bid.vendor_name}</div>}
        </div>

        <div style={{ maxWidth: 650, margin: "0 auto", padding: "24px 16px" }}>
          {/* Info card */}
          <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h1 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 8 }}>Complete Your Specifications</h1>
            <p style={{ color: "#666", fontSize: "0.86rem", lineHeight: 1.5 }}>
              {bid?.title ? `For: ${bid.title}` : ""}
            </p>
            <p style={{ color: "#888", fontSize: "0.82rem", lineHeight: 1.5, marginTop: 8 }}>
              The contractor is requesting details on the following specifications. For each spec, indicate if it's included in your proposal and provide the value.
            </p>
          </div>

          {/* Spec form */}
          <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            {requestedSpecs.map((specKey, i) => {
              const sv = specValues[specKey] || { included: false, value: "" };
              return (
                <div key={specKey} style={{
                  padding: "14px 0",
                  borderBottom: i < requestedSpecs.length - 1 ? "1px solid #f0f0eb" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#333" }}>{specKey}</span>
                    <div style={{ display: "flex", gap: 0, border: "1.5px solid #e5e5e0", borderRadius: 6, overflow: "hidden" }}>
                      <button
                        type="button"
                        onClick={() => setSpecValues(prev => ({ ...prev, [specKey]: { ...prev[specKey], included: true } }))}
                        style={{
                          padding: "5px 14px", border: "none", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer",
                          background: sv.included ? "#d97706" : "#fff",
                          color: sv.included ? "#fff" : "#999",
                        }}
                      >
                        Included
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpecValues(prev => ({ ...prev, [specKey]: { ...prev[specKey], included: false, value: "" } }))}
                        style={{
                          padding: "5px 14px", border: "none", borderLeft: "1px solid #e5e5e0", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer",
                          background: !sv.included ? "#1a1a1a" : "#fff",
                          color: !sv.included ? "#fff" : "#999",
                        }}
                      >
                        Not Included
                      </button>
                    </div>
                  </div>
                  {sv.included && (
                    <input
                      type="text"
                      placeholder={`Enter value for ${specKey}...`}
                      value={sv.value}
                      onChange={e => setSpecValues(prev => ({ ...prev, [specKey]: { ...prev[specKey], value: e.target.value } }))}
                      style={{
                        width: "100%", padding: "8px 12px", border: "1.5px solid #d97706",
                        borderRadius: 8, fontSize: "0.86rem", background: "#fffbf0", boxSizing: "border-box",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div style={{
            background: "#1a1a1a", borderRadius: 10, padding: "14px 20px", marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "#999", fontSize: "0.82rem" }}>
              {Object.values(specValues).filter(v => v.included).length} included &middot; {Object.values(specValues).filter(v => !v.included).length} not included
            </span>
            <span style={{ color: "#d97706", fontWeight: 800, fontSize: "0.82rem" }}>
              {requestedSpecs.length} specs requested
            </span>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#c00", fontSize: "0.82rem", marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSpecSubmit}
            disabled={specSubmitting}
            style={{
              width: "100%", padding: "12px", background: "#d97706", color: "#fff",
              border: "none", borderRadius: 8, fontSize: "0.95rem", fontWeight: 700,
              cursor: specSubmitting ? "not-allowed" : "pointer",
              opacity: specSubmitting ? 0.7 : 1,
            }}
          >
            {specSubmitting ? "Submitting..." : "Submit Spec Details"}
          </button>
        </div>
      </div>
    );
  }

  async function handleSetupPortal(e: React.FormEvent) {
    e.preventDefault();
    setPortalError("");
    if (portalPw !== portalPwConfirm) { setPortalError("Passwords don't match"); return; }
    if (portalPw.length < 8) { setPortalError("Password must be at least 8 characters"); return; }
    setPortalSaving(true);
    try {
      const res = await fetch("/api/vendor-auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: portalPw }),
      });
      const data = await res.json();
      if (res.ok) {
        setPortalDone(true);
      } else {
        setPortalError(data.error || "Failed to set up account");
      }
    } catch {
      setPortalError("Something went wrong");
    } finally {
      setPortalSaving(false);
    }
  }

  if (submitted) {
    const hasAccount = bid?.has_portal_account;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
        <div style={{ maxWidth: 480, padding: 40 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>&#10003;</div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>Thank You!</h2>
            <p style={{ color: "#666", fontSize: "0.9rem" }}>Your bid response has been submitted successfully. The contractor will review your submission.</p>
          </div>

          {hasAccount ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 8 }}>Track Your Bid</h3>
              <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 16 }}>Log in to the vendor portal to track this bid and see when results are announced.</p>
              <a href="/login?tab=vendor" style={{ display: "inline-block", padding: "10px 24px", background: "#d97706", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>Go to Vendor Portal →</a>
            </div>
          ) : !portalDone ? (
            <div style={{ background: "#fff", border: "2px solid #d97706", borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>Set Up Your Vendor Portal</h3>
              <p style={{ fontSize: "0.82rem", color: "#666", marginBottom: 16 }}>Create a password to track all your bids, get notified on results, and manage your profile — takes 10 seconds.</p>
              <form onSubmit={handleSetupPortal}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#666", marginBottom: 4 }}>Password</label>
                  <input type="password" value={portalPw} onChange={e => setPortalPw(e.target.value)} required placeholder="Min. 8 characters" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#666", marginBottom: 4 }}>Confirm Password</label>
                  <input type="password" value={portalPwConfirm} onChange={e => setPortalPwConfirm(e.target.value)} required style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                {portalError && <div style={{ color: "#c00", fontSize: "0.82rem", marginBottom: 8 }}>{portalError}</div>}
                <button type="submit" disabled={portalSaving} style={{ width: "100%", padding: "10px", background: "#d97706", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", opacity: portalSaving ? 0.7 : 1 }}>
                  {portalSaving ? "Setting up..." : "Create Portal Account"}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>&#9989;</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 8 }}>Account Created!</h3>
              <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 16 }}>You can now access the vendor portal to track all your bids.</p>
              <a href="/vendor" style={{ display: "inline-block", padding: "10px 24px", background: "#d97706", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>Go to Vendor Portal →</a>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error || !bid) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>&#9888;</div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>Cannot Access Bid</h2>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>{error || "This link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const trackParam = bid.parameters.find(p => p.is_track);
  const subParams = bid.parameters.filter(p => !p.is_track);
  const combinations = bid.parameters.length > 0 ? getCombinations(bid.parameters) : [];
  const deadlineDate = new Date(bid.deadline);
  const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  // Group combinations by track if track exists
  const trackGroups: Record<string, Record<string, string>[]> = {};
  if (trackParam) {
    for (const combo of combinations) {
      const trackVal = combo[trackParam.name];
      if (!trackGroups[trackVal]) trackGroups[trackVal] = [];
      trackGroups[trackVal].push(combo);
    }
  }

  // Count filled prices
  const filledCount = Object.values(prices).filter(v => v !== "").length;
  const totalCount = combinations.length || 1;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f9f9f6)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1a1a1a", color: "#fff", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1rem" }}>BidMaster</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Vendor Submission Portal</div>
        </div>
        <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>Welcome, {bid.vendor_name}</div>
      </div>

      <div style={{ maxWidth: 750, margin: "0 auto", padding: "24px 16px" }}>
        {/* Bid info */}
        <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 8 }}>{bid.title}</h1>
          <p style={{ color: "#666", fontSize: "0.88rem", marginBottom: 12, whiteSpace: "pre-wrap" }}>{bid.description}</p>
          <div style={{ display: "flex", gap: 20, fontSize: "0.82rem" }}>
            <div>
              <span style={{ color: "#999" }}>Deadline: </span>
              <strong>{deadlineDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>
            </div>
            <div>
              <span style={{ color: daysLeft <= 3 ? "#c00" : "#999" }}>
                {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Deadline passed"}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: bid.bid_mode === "structured" ? (basePrice && parseFloat(basePrice) > 0 ? "100%" : "0%") : `${(filledCount / totalCount) * 100}%`, height: "100%", background: "#d97706", borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: "0.78rem", color: "#999", fontWeight: 600, whiteSpace: "nowrap" }}>
            {bid.bid_mode === "structured" ? (basePrice && parseFloat(basePrice) > 0 ? "Base price set ✓" : "Enter base price") : `${filledCount}/${totalCount} prices filled`}
          </span>
        </div>

        {/* Price form */}
        <form onSubmit={handleSubmit}>
          {bid.bid_mode === "open" ? (
            /* ============ OPEN PROPOSAL MODE ============ */
            <div style={{ marginBottom: 20 }}>
              {/* AI Scan button */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAiScan(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#1a1a1a", color: "#d97706", border: "none", borderRadius: 8,
                    padding: "8px 16px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  Scan Document (AI)
                </button>
              </div>

              {/* Proposal tabs */}
              <div style={{
                display: "flex", gap: 0, background: "#fff", border: "1px solid #e5e5e0",
                borderRadius: "12px 12px 0 0", borderBottom: "none", overflow: "hidden",
              }}>
                {proposals.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveProposal(i)}
                    style={{
                      padding: "12px 20px", border: "none", borderBottom: activeProposal === i ? "3px solid #d97706" : "3px solid transparent",
                      background: activeProposal === i ? "#fff" : "#fafaf8",
                      fontSize: "0.84rem", fontWeight: activeProposal === i ? 700 : 500,
                      color: activeProposal === i ? "#d97706" : "#888",
                      cursor: "pointer", flex: 1, textAlign: "center",
                    }}
                  >
                    {p.name || `Option ${i + 1}`}
                    {p.price && <span style={{ marginLeft: 6, fontSize: "0.72rem", opacity: 0.7 }}>${Number(p.price).toLocaleString()}</span>}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const defaultSpecs = bid?.suggested_specs && bid.suggested_specs.length > 0
                      ? [...bid.suggested_specs.map(key => ({ key, value: "" })), { key: "", value: "" }]
                      : [{ key: "", value: "" }];
                    setProposals([...proposals, { name: "", price: "", specs: defaultSpecs }]);
                    setActiveProposal(proposals.length);
                  }}
                  style={{
                    padding: "12px 16px", border: "none", background: "#fafaf8",
                    color: "#d97706", fontWeight: 700, fontSize: "1.1rem", cursor: "pointer",
                  }}
                  title="Add another option"
                >
                  +
                </button>
              </div>

              {/* Active proposal form */}
              {proposals[activeProposal] && (
                <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 20 }}>
                  {/* Name and Price */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#666", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Option Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Otis Gen2 Comfort - Premium"
                        value={proposals[activeProposal].name}
                        onChange={e => {
                          const updated = [...proposals];
                          updated[activeProposal] = { ...updated[activeProposal], name: e.target.value };
                          setProposals(updated);
                        }}
                        style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e5e5e0", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#d97706", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Total Price ($) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={proposals[activeProposal].price}
                        onChange={e => {
                          const updated = [...proposals];
                          updated[activeProposal] = { ...updated[activeProposal], price: e.target.value };
                          setProposals(updated);
                        }}
                        style={{ width: "100%", padding: "10px 14px", border: "2px solid #d97706", borderRadius: 8, fontSize: "0.9rem", textAlign: "right", background: "#fffbf0", boxSizing: "border-box", fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* Specs */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Technical Specifications
                      </label>
                      <span style={{ fontSize: "0.72rem", color: "#999" }}>
                        Add details like brand, model, capacity, warranty, etc.
                      </span>
                    </div>

                    {proposals[activeProposal].specs.map((spec, si) => (
                      <div key={si} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                        <input
                          type="text"
                          placeholder="Spec name (e.g. Brand)"
                          value={spec.key}
                          onChange={e => {
                            const updated = [...proposals];
                            const specs = [...updated[activeProposal].specs];
                            specs[si] = { ...specs[si], key: e.target.value };
                            updated[activeProposal] = { ...updated[activeProposal], specs };
                            setProposals(updated);
                          }}
                          style={{ flex: 1, padding: "8px 12px", border: "1px solid #e5e5e0", borderRadius: 6, fontSize: "0.84rem", background: "#fafaf8" }}
                        />
                        <input
                          type="text"
                          placeholder="Value (e.g. Otis)"
                          value={spec.value}
                          onChange={e => {
                            const updated = [...proposals];
                            const specs = [...updated[activeProposal].specs];
                            specs[si] = { ...specs[si], value: e.target.value };
                            updated[activeProposal] = { ...updated[activeProposal], specs };
                            setProposals(updated);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const updated = [...proposals];
                              const specs = [...updated[activeProposal].specs, { key: "", value: "" }];
                              updated[activeProposal] = { ...updated[activeProposal], specs };
                              setProposals(updated);
                            }
                          }}
                          style={{ flex: 1.5, padding: "8px 12px", border: "1px solid #e5e5e0", borderRadius: 6, fontSize: "0.84rem" }}
                        />
                        {proposals[activeProposal].specs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...proposals];
                              const specs = updated[activeProposal].specs.filter((_, j) => j !== si);
                              updated[activeProposal] = { ...updated[activeProposal], specs };
                              setProposals(updated);
                            }}
                            style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: "1rem", padding: "4px 8px" }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...proposals];
                        const specs = [...updated[activeProposal].specs, { key: "", value: "" }];
                        updated[activeProposal] = { ...updated[activeProposal], specs };
                        setProposals(updated);
                      }}
                      style={{
                        background: "none", border: "1px dashed #ddd", borderRadius: 6,
                        padding: "6px 14px", cursor: "pointer", fontSize: "0.78rem",
                        color: "#d97706", fontWeight: 600, marginTop: 4,
                      }}
                    >
                      + Add Spec Row
                    </button>
                  </div>

                  {/* Remove proposal */}
                  {proposals.length > 1 && (
                    <div style={{ borderTop: "1px solid #f0f0eb", paddingTop: 12, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = proposals.filter((_, i) => i !== activeProposal);
                          setProposals(updated);
                          setActiveProposal(Math.max(0, activeProposal - 1));
                        }}
                        style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                      >
                        Remove this option
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Summary bar */}
              <div style={{
                background: "#1a1a1a", borderRadius: 10, padding: "14px 20px", marginTop: 12,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ color: "#999", fontSize: "0.82rem" }}>
                  {proposals.filter(p => p.name.trim() && p.price).length} option{proposals.filter(p => p.name.trim() && p.price).length !== 1 ? "s" : ""} ready
                </span>
                <span style={{ color: "#d97706", fontWeight: 800, fontSize: "0.9rem" }}>
                  {proposals.filter(p => p.price).length > 0
                    ? `$${Math.min(...proposals.filter(p => p.price).map(p => parseFloat(p.price))).toLocaleString()} — $${Math.max(...proposals.filter(p => p.price).map(p => parseFloat(p.price))).toLocaleString()}`
                    : "No prices yet"
                  }
                </span>
              </div>
            </div>
          ) : (
          /* ============ STRUCTURED MODE — Base + Modifiers ============ */
          <div style={{ marginBottom: 20 }}>
            {/* Base price */}
            <div style={{
              background: "#fff", border: "2px solid #d97706", borderRadius: 12,
              padding: 20, marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                Base Price (Standard Configuration)
              </div>
              <div style={{ fontSize: "0.82rem", color: "#888", marginBottom: 12 }}>
                Enter the price for your standard/most common configuration. You'll define extra costs per option below.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "#d97706", fontSize: "1.2rem" }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 10,000"
                  value={basePrice}
                  onChange={e => setBasePrice(e.target.value)}
                  style={{
                    flex: 1, padding: "12px 16px", border: "2px solid #d97706",
                    borderRadius: 8, fontSize: "1.1rem", fontWeight: 700,
                    textAlign: "right", background: "#fffbf0", outline: "none",
                  }}
                  autoFocus
                />
              </div>
            </div>

            {/* Per-parameter modifiers */}
            {bid.parameters.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Extra Cost Per Option
                </div>
                <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: 16 }}>
                  Enter <strong>0</strong> (or leave blank) for options included in your base price. Enter extra amount for options that cost more.
                </div>

                {bid.parameters.map((param, pi) => (
                  <div key={pi} style={{
                    marginBottom: pi < bid.parameters.length - 1 ? 20 : 0,
                    paddingBottom: pi < bid.parameters.length - 1 ? 20 : 0,
                    borderBottom: pi < bid.parameters.length - 1 ? "1px solid #f0f0eb" : "none",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1a1a1a", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      {param.is_track && <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#d97706", background: "#fffbf0", border: "1px solid #fde68a", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>Track</span>}
                      {param.name}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {param.options.map((opt, oi) => {
                        const val = modifiers[param.name]?.[opt] ?? "";
                        const isBase = val === "" || val === "0";
                        return (
                          <div key={oi} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 14px",
                            background: isBase ? "#f0fdf4" : "#fffbf0",
                            border: `1.5px solid ${isBase ? "#bbf7d0" : "#fde68a"}`,
                            borderRadius: 8,
                          }}>
                            <div style={{ flex: 1, fontWeight: 600, fontSize: "0.88rem", color: "#1a1a1a" }}>
                              {opt}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {isBase ? (
                                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#16a34a", background: "#dcfce7", borderRadius: 4, padding: "2px 8px" }}>
                                  ✓ Base (included)
                                </span>
                              ) : (
                                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#d97706" }}>
                                  +${(parseFloat(val) || 0).toLocaleString()}
                                </span>
                              )}
                              <span style={{ color: "#888", fontWeight: 600, fontSize: "0.9rem" }}>+$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0"
                                value={val}
                                onChange={e => setModifiers(prev => ({
                                  ...prev,
                                  [param.name]: { ...prev[param.name], [opt]: e.target.value }
                                }))}
                                style={{
                                  width: 100, padding: "6px 10px",
                                  border: `1.5px solid ${isBase ? "#bbf7d0" : "#fde68a"}`,
                                  borderRadius: 6, fontSize: "0.88rem", textAlign: "right",
                                  background: isBase ? "#f0fdf4" : "#fffbf0",
                                  outline: "none",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}


            {/* No parameters case */}
            {bid.parameters.length === 0 && (
              <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: "0.8rem", color: "#666" }}>Single price — no parameter combinations.</div>
              </div>
            )}
          </div>
          )}

          {/* Checklist */}
          {bid.checklist && bid.checklist.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>Requirements Checklist</h2>
              <p style={{ fontSize: "0.76rem", color: "#999", marginBottom: 14 }}>
                Items marked with <span style={{ color: "#c00", fontWeight: 700 }}>*</span> are required to submit
              </p>
              {bid.checklist.map((item, ci) => (
                <label key={ci} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
                  borderBottom: ci < bid.checklist.length - 1 ? "1px solid #f0f0eb" : "none",
                  cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={!!checkAnswers[ci]}
                    onChange={e => setCheckAnswers({ ...checkAnswers, [ci]: e.target.checked })}
                    style={{
                      width: 18, height: 18, marginTop: 1, accentColor: "#d97706",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "0.88rem", color: "#333", lineHeight: 1.4 }}>
                    {item.text}
                    {item.required && <span style={{ color: "#c00", fontWeight: 700, marginLeft: 4 }}>*</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Notes / Remarks */}
          <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>Notes & Clarifications</h2>
            <p style={{ fontSize: "0.76rem", color: "#999", marginBottom: 12 }}>
              Add any conditions, exclusions, lead times, or general remarks about your bid
            </p>
            <textarea
              value={vendorNotes}
              onChange={e => setVendorNotes(e.target.value)}
              placeholder="e.g. Price valid for 30 days. Excludes crane rental. Lead time: 8-10 weeks after approval..."
              style={{
                width: "100%", minHeight: 90, padding: "10px 14px", border: "1.5px solid #e5e5e0",
                borderRadius: 8, fontSize: "0.86rem", resize: "vertical", boxSizing: "border-box",
                fontFamily: "inherit", lineHeight: 1.5,
              }}
            />
          </div>

          {/* File Attachments */}
          <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>Attachments</h2>
            <p style={{ fontSize: "0.76rem", color: "#999", marginBottom: 12 }}>
              Attach your proposal document, product data sheets, certifications, etc.
            </p>
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#d97706"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "#e5e5e0"; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = "#e5e5e0";
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) setAttachments(prev => [...prev, ...files]);
              }}
              style={{
                border: "2px dashed #e5e5e0", borderRadius: 10, padding: "20px",
                textAlign: "center", cursor: "pointer", transition: "border-color 0.15s",
              }}
              onClick={() => {
                const inp = document.createElement("input");
                inp.type = "file";
                inp.multiple = true;
                inp.onchange = () => {
                  if (inp.files) setAttachments(prev => [...prev, ...Array.from(inp.files!)]);
                };
                inp.click();
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" style={{ display: "block", margin: "0 auto 8px" }}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <div style={{ fontSize: "0.82rem", color: "#999", fontWeight: 600 }}>
                Drop files here or <span style={{ color: "#d97706", textDecoration: "underline" }}>browse</span>
              </div>
              <div style={{ fontSize: "0.7rem", color: "#ccc", marginTop: 4 }}>PDF, Images, Word, Excel</div>
            </div>
            {attachments.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {attachments.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "#fafaf8", border: "1px solid #e5e5e0",
                    borderRadius: 8, fontSize: "0.82rem",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span style={{ fontWeight: 600, color: "#333" }}>{f.name}</span>
                      <span style={{ color: "#999", fontSize: "0.72rem" }}>({(f.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: "1rem" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* VE note */}
          {bid.allow_ve && (
            <div style={{
              background: "#fffbf0", border: "1px solid #f0d78c", borderRadius: 12,
              padding: "12px 16px", marginBottom: 20, fontSize: "0.82rem", color: "#92400e",
            }}>
              <strong>Value Engineering (VE):</strong> You may optionally provide an alternative VE price for each combination.
              VE prices represent cost-saving alternatives you can offer.
            </div>
          )}

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#c00", fontSize: "0.82rem", marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px",
              background: "#d97706",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Submitting..." : "Submit Bid Response"}
          </button>
        </form>
      </div>

      {/* AI Scan Modal */}
      {showAiScan && (
        <div
          onClick={() => !aiParsing && setShowAiScan(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 14, padding: 24,
              width: "90%", maxWidth: 500, maxHeight: "90vh", overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#1a1a1a" }}>
                Scan Your Document (AI)
              </h3>
              <button
                onClick={() => setShowAiScan(false)}
                style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#999" }}
              >&times;</button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
              Upload your price quote or proposal document. AI will automatically extract options, prices, and specifications.
            </p>

            {/* File upload */}
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#d97706"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "#e5e5e0"; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = "#e5e5e0";
                if (e.dataTransfer.files[0]) setAiFile(e.dataTransfer.files[0]);
              }}
              style={{
                border: "2px dashed " + (aiFile ? "#d97706" : "#e5e5e0"),
                borderRadius: 10, padding: 20, textAlign: "center",
                cursor: "pointer", marginBottom: 12, transition: "border-color 0.15s",
                background: aiFile ? "#fffbeb" : "transparent",
              }}
              onClick={() => {
                const inp = document.createElement("input");
                inp.type = "file";
                inp.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt";
                inp.onchange = () => { if (inp.files?.[0]) setAiFile(inp.files[0]); };
                inp.click();
              }}
            >
              {aiFile ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style={{ fontWeight: 700, color: "#d97706", fontSize: "0.86rem" }}>{aiFile.name}</span>
                  <span style={{ color: "#999", fontSize: "0.72rem" }}>({(aiFile.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" style={{ display: "block", margin: "0 auto 8px" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div style={{ fontSize: "0.82rem", color: "#999", fontWeight: 600 }}>
                    Drop file here or <span style={{ color: "#d97706" }}>browse</span>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#ccc", marginTop: 4 }}>PDF, Images, Word, Excel, Text</div>
                </>
              )}
            </div>

            {/* Or paste link */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, height: 1, background: "#e5e5e0" }} />
                <span style={{ fontSize: "0.72rem", color: "#999", fontWeight: 600 }}>OR PASTE A LINK</span>
                <div style={{ flex: 1, height: 1, background: "#e5e5e0" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="url"
                  value={aiUrl}
                  onChange={e => setAiUrl(e.target.value)}
                  placeholder="https://dropbox.com/... or Google Drive link"
                  style={{
                    flex: 1, padding: "8px 12px", border: "1.5px solid #e5e5e0",
                    borderRadius: 8, fontSize: "0.82rem", boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={handleAiUrlFetch}
                  disabled={aiUrlLoading || !aiUrl.trim()}
                  style={{
                    padding: "8px 16px", background: "#1a1a1a", color: "#d97706",
                    border: "none", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700,
                    cursor: aiUrlLoading ? "not-allowed" : "pointer",
                    opacity: aiUrlLoading ? 0.7 : 1, whiteSpace: "nowrap",
                  }}
                >
                  {aiUrlLoading ? "..." : "Fetch"}
                </button>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#bbb", marginTop: 3 }}>Dropbox, Google Drive, or any public file link</div>
            </div>

            {/* Or paste text */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, height: 1, background: "#e5e5e0" }} />
                <span style={{ fontSize: "0.72rem", color: "#999", fontWeight: 600 }}>OR PASTE TEXT</span>
                <div style={{ flex: 1, height: 1, background: "#e5e5e0" }} />
              </div>
              <textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                placeholder="Paste your quote text here..."
                style={{
                  width: "100%", minHeight: 80, padding: "10px 12px",
                  border: "1.5px solid #e5e5e0", borderRadius: 8, fontSize: "0.84rem",
                  resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowAiScan(false)}
                disabled={aiParsing}
                style={{
                  padding: "8px 20px", border: "1.5px solid #e5e5e0", borderRadius: 8,
                  background: "#fff", fontSize: "0.84rem", fontWeight: 600,
                  cursor: "pointer", color: "#666",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAiScan}
                disabled={aiParsing || (!aiFile && !aiText.trim())}
                style={{
                  padding: "8px 24px", border: "none", borderRadius: 8,
                  background: "#d97706", color: "#fff", fontSize: "0.84rem",
                  fontWeight: 700, cursor: aiParsing ? "not-allowed" : "pointer",
                  opacity: (aiParsing || (!aiFile && !aiText.trim())) ? 0.6 : 1,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {aiParsing ? (
                  <>
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Scanning...
                  </>
                ) : "Scan & Extract"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VendorSubmitPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)" }}>
        <div style={{ width: 32, height: 32, border: "4px solid #ccc", borderTopColor: "#d97706", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    }>
      <VendorSubmitPageInner />
    </Suspense>
  );
}
