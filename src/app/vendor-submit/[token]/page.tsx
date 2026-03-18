"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
}

export default function VendorSubmitPage() {
  const params = useParams();
  const token = params.token as string;

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

  // Track selection for viewing
  const [activeTrack, setActiveTrack] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vendor-submit/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (data.submitted) { setSubmitted(true); return; }
          throw new Error(data.error || "Failed to load bid");
        }
        setBid(data);
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
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
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

    const priceEntries = Object.entries(prices)
      .filter(([, v]) => v !== "")
      .map(([key, value]) => ({
        combination_key: key,
        price: parseFloat(value),
      }));

    // Add VE prices with _ve suffix
    if (bid?.allow_ve) {
      Object.entries(vePrices)
        .filter(([, v]) => v !== "")
        .forEach(([key, value]) => {
          priceEntries.push({
            combination_key: key.replace(/\}$/, ',"_ve":true}'),
            price: parseFloat(value),
          });
        });
    }

    if (priceEntries.length === 0) {
      setError("Please enter at least one price");
      setSubmitting(false);
      return;
    }

    // Build checklist answers
    const checklistAnswers = bid?.checklist
      ? bid.checklist.map((item, i) => ({ text: item.text, checked: !!checkAnswers[i] }))
      : [];

    try {
      const res = await fetch(`/api/vendor-submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: priceEntries, checklist_answers: checklistAnswers }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "Submission failed");
      }
    } catch {
      setError("Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)" }}>
        <div style={{ width: 32, height: 32, border: "4px solid #ccc", borderTopColor: "#b8860b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
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
              <a href="/vendor-login" style={{ display: "inline-block", padding: "10px 24px", background: "#b8860b", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>Go to Vendor Portal →</a>
            </div>
          ) : !portalDone ? (
            <div style={{ background: "#fff", border: "2px solid #b8860b", borderRadius: 12, padding: 20 }}>
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
                <button type="submit" disabled={portalSaving} style={{ width: "100%", padding: "10px", background: "#b8860b", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", opacity: portalSaving ? 0.7 : 1 }}>
                  {portalSaving ? "Setting up..." : "Create Portal Account"}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>&#9989;</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 8 }}>Account Created!</h3>
              <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 16 }}>You can now access the vendor portal to track all your bids.</p>
              <a href="/vendor" style={{ display: "inline-block", padding: "10px 24px", background: "#b8860b", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>Go to Vendor Portal →</a>
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
            <div style={{ width: `${(filledCount / totalCount) * 100}%`, height: "100%", background: "#b8860b", borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: "0.78rem", color: "#999", fontWeight: 600, whiteSpace: "nowrap" }}>
            {filledCount}/{totalCount} prices filled
          </span>
        </div>

        {/* Price form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16 }}>Your Pricing</h2>

            {combinations.length === 0 ? (
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Enter your price"
                  value={prices["{}"] || ""}
                  onChange={e => setPrices({ ...prices, "{}": e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: "0.9rem" }}
                />
              </div>
            ) : trackParam ? (
              /* Track-based layout */
              <div>
                {/* Track tabs */}
                <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e5e5e0", marginBottom: 16 }}>
                  {trackParam.options.map(trackOpt => {
                    const isActive = activeTrack === trackOpt;
                    const trackCombos = trackGroups[trackOpt] || [];
                    const trackFilled = trackCombos.filter(c => prices[JSON.stringify(c)] !== "").length;
                    return (
                      <button
                        key={trackOpt}
                        type="button"
                        onClick={() => setActiveTrack(trackOpt)}
                        style={{
                          padding: "10px 20px",
                          border: "none",
                          borderBottom: isActive ? "3px solid #b8860b" : "3px solid transparent",
                          background: "none",
                          fontSize: "0.88rem",
                          fontWeight: isActive ? 800 : 500,
                          color: isActive ? "#b8860b" : "#888",
                          cursor: "pointer",
                          position: "relative",
                        }}
                      >
                        {trackOpt}
                        <span style={{
                          marginLeft: 6, fontSize: "0.65rem", fontWeight: 700,
                          background: trackFilled === trackCombos.length && trackFilled > 0 ? "#d4edda" : "#f0f0eb",
                          color: trackFilled === trackCombos.length && trackFilled > 0 ? "#155724" : "#999",
                          padding: "1px 6px", borderRadius: 10,
                        }}>
                          {trackFilled}/{trackCombos.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-parameter pricing table for active track */}
                {activeTrack && (trackGroups[activeTrack] || []).length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {subParams.map(p => (
                          <th key={p.name} style={{
                            textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #e5e5e0",
                            fontSize: "0.78rem", fontWeight: 700, color: "#666", textTransform: "uppercase",
                          }}>
                            {p.name}
                          </th>
                        ))}
                        <th style={{
                          textAlign: "right", padding: "8px 12px", borderBottom: "2px solid #e5e5e0",
                          fontSize: "0.78rem", fontWeight: 700, color: "#666", textTransform: "uppercase",
                        }}>
                          Price ($)
                        </th>
                        {bid.allow_ve && (
                          <th style={{
                            textAlign: "right", padding: "8px 12px", borderBottom: "2px solid #e5e5e0",
                            fontSize: "0.78rem", fontWeight: 700, color: "#b8860b", textTransform: "uppercase",
                          }}>
                            VE Price ($)
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(trackGroups[activeTrack] || []).map((combo, i) => {
                        const key = JSON.stringify(combo);
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f0f0eb" }}>
                            {subParams.map(p => (
                              <td key={p.name} style={{ padding: "8px 12px", fontSize: "0.84rem" }}>
                                {combo[p.name]}
                              </td>
                            ))}
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={prices[key] || ""}
                                onChange={e => setPrices({ ...prices, [key]: e.target.value })}
                                style={{
                                  width: 130, padding: "6px 10px", border: "1px solid #ddd",
                                  borderRadius: 6, fontSize: "0.85rem", textAlign: "right",
                                }}
                              />
                            </td>
                            {bid.allow_ve && (
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="VE"
                                  value={vePrices[key] || ""}
                                  onChange={e => setVePrices({ ...vePrices, [key]: e.target.value })}
                                  style={{
                                    width: 130, padding: "6px 10px", border: "1px solid #b8860b",
                                    borderRadius: 6, fontSize: "0.85rem", textAlign: "right",
                                    background: "#fffbf0",
                                  }}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              /* Regular flat table */
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {bid.parameters.map(p => (
                      <th key={p.name} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #e5e5e0", fontSize: "0.78rem", fontWeight: 700, color: "#666", textTransform: "uppercase" }}>
                        {p.name}
                      </th>
                    ))}
                    <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "2px solid #e5e5e0", fontSize: "0.78rem", fontWeight: 700, color: "#666", textTransform: "uppercase" }}>
                      Price ($)
                    </th>
                    {bid.allow_ve && (
                      <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "2px solid #e5e5e0", fontSize: "0.78rem", fontWeight: 700, color: "#b8860b", textTransform: "uppercase" }}>
                        VE Price ($)
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {combinations.map((combo, i) => {
                    const key = JSON.stringify(combo);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f0f0eb" }}>
                        {bid.parameters.map(p => (
                          <td key={p.name} style={{ padding: "8px 12px", fontSize: "0.84rem" }}>{combo[p.name]}</td>
                        ))}
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={prices[key] || ""}
                            onChange={e => setPrices({ ...prices, [key]: e.target.value })}
                            style={{ width: 120, padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.85rem", textAlign: "right" }}
                          />
                        </td>
                        {bid.allow_ve && (
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="VE"
                              value={vePrices[key] || ""}
                              onChange={e => setVePrices({ ...vePrices, [key]: e.target.value })}
                              style={{ width: 120, padding: "6px 10px", border: "1px solid #b8860b", borderRadius: 6, fontSize: "0.85rem", textAlign: "right", background: "#fffbf0" }}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

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
                      width: 18, height: 18, marginTop: 1, accentColor: "#b8860b",
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
              background: "#b8860b",
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
    </div>
  );
}
