"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Parameter {
  name: string;
  options: string[];
}

interface BidData {
  bid_id: string;
  title: string;
  description: string;
  deadline: string;
  vendor_name: string;
  parameters: Parameter[];
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

    const priceEntries = Object.entries(prices)
      .filter(([, v]) => v !== "")
      .map(([key, value]) => ({
        combination_key: key,
        price: parseFloat(value),
      }));

    if (priceEntries.length === 0) {
      setError("Please enter at least one price");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/vendor-submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: priceEntries }),
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

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f9f9f6)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>&#10003;</div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 8 }}>Thank You!</h2>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>Your bid response has been submitted successfully. The contractor will review your submission.</p>
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

  const combinations = bid.parameters.length > 0 ? getCombinations(bid.parameters) : [];
  const deadlineDate = new Date(bid.deadline);
  const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

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

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
        {/* Bid info */}
        <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 8 }}>{bid.title}</h1>
          <p style={{ color: "#666", fontSize: "0.88rem", marginBottom: 12 }}>{bid.description}</p>
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
            ) : (
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

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
