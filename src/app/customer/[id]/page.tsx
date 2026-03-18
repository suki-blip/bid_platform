"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

interface Parameter {
  name: string;
  options: string[];
  is_track?: boolean;
}

interface DiscountRule {
  conditionParam: string;
  conditionOption: string;
  targetType: "param_option" | "total";
  targetParam: string;
  targetOption: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
}

interface VendorResponse {
  id: string;
  vendor_id: string;
  vendor_name: string;
  submitted_at: string;
  pricing_mode: "combination" | "additive";
  base_price: number | null;
  rules: DiscountRule[];
  prices: { combination_key: string; price: number }[];
}

interface Invitation {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_email: string;
  token: string;
  status: string;
  sent_at: string;
  submitted_at: string | null;
}

interface VendorOption {
  id: string;
  name: string;
  email: string;
  trade_name: string | null;
}

interface Bid {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: string;
  parameters: Parameter[];
  vendor_responses: VendorResponse[];
}

function showToast(msg: string) {
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
  }, 2200);
}

const AVATAR_COLORS = [
  { bg: "var(--gold-bg)", color: "var(--gold)" },
  { bg: "var(--blue-bg)", color: "var(--blue)" },
  { bg: "var(--red-bg)", color: "var(--red)" },
  { bg: "var(--green-bg)", color: "var(--green)" },
  { bg: "var(--cyan-bg, var(--blue-bg))", color: "var(--cyan, var(--blue))" },
];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

// Generate all parameter combinations (cartesian product)
function generateCombinations(parameters: Parameter[]): Record<string, string>[] {
  if (parameters.length === 0) return [{}];
  const [first, ...rest] = parameters;
  const restCombinations = generateCombinations(rest);
  const results: Record<string, string>[] = [];
  for (const option of first.options) {
    for (const combo of restCombinations) {
      results.push({ [first.name]: option, ...combo });
    }
  }
  return results;
}

function makeCombinationKey(combo: Record<string, string>): string {
  const sorted = Object.keys(combo).sort().reduce((acc: Record<string, string>, key) => {
    acc[key] = combo[key];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

// Calculate vendor price for a specific combination
function calcVendorPrice(
  vr: VendorResponse,
  combo: Record<string, string>,
  comboKey: string
): number | null {
  if (vr.pricing_mode === "combination") {
    const match = vr.prices.find((p) => p.combination_key === comboKey);
    return match ? match.price : null;
  }

  // Additive mode: base + option additions - discounts
  let total = vr.base_price ?? 0;
  const optionAdditions: Record<string, number> = {};

  for (const [paramName, optionValue] of Object.entries(combo)) {
    const key = JSON.stringify({ param: paramName, option: optionValue });
    const match = vr.prices.find((p) => p.combination_key === key);
    if (match) {
      optionAdditions[key] = match.price;
      total += match.price;
    } else {
      return null; // missing price data
    }
  }

  // Apply discount rules
  if (vr.rules && vr.rules.length > 0) {
    for (const rule of vr.rules) {
      if (combo[rule.conditionParam] !== rule.conditionOption) continue;

      if (rule.targetType === "total") {
        if (rule.discountType === "percentage") {
          total -= total * (rule.discountValue / 100);
        } else {
          total -= rule.discountValue;
        }
      } else if (rule.targetType === "param_option") {
        if (combo[rule.targetParam] === rule.targetOption) {
          const targetKey = JSON.stringify({ param: rule.targetParam, option: rule.targetOption });
          const addition = optionAdditions[targetKey] ?? 0;
          if (rule.discountType === "percentage") {
            total -= addition * (rule.discountValue / 100);
          } else {
            total -= rule.discountValue;
          }
        }
      }
    }
  }

  return Math.max(0, total);
}

export default function CustomerBidDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [bid, setBid] = useState<Bid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidStatus, setBidStatus] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [availableVendors, setAvailableVendors] = useState<VendorOption[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [winner, setWinner] = useState<{ vendor_id: string; vendor_name: string } | null>(null);
  const [selectingWinner, setSelectingWinner] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [winnerModal, setWinnerModal] = useState<{ vendorName: string; vendorId: string; responseId: string } | null>(null);
  const [winnerCombo, setWinnerCombo] = useState<string>("");
  const [winnerNotes, setWinnerNotes] = useState("");
  const [filterMode, setFilterMode] = useState<Set<string>>(new Set(["combination", "additive"]));
  const [filterMaxPrice, setFilterMaxPrice] = useState(5000000);
  const [filterDays, setFilterDays] = useState<number | null>(null); // null = any
  const [filterParams, setFilterParams] = useState<Record<string, Set<string>>>({}); // param name -> selected options

  useEffect(() => {
    fetch(`/api/bids/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bid");
        return res.json();
      })
      .then((data) => {
        setBid(data);
        setBidStatus(data.status || "active");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    fetch(`/api/bids/${id}/invite`).then(r => r.json()).then(setInvitations).catch(() => {});
    fetch("/api/vendors").then(r => r.json()).then(setAvailableVendors).catch(() => {});
    fetch(`/api/bids/${id}/winner`).then(r => r.json()).then(data => {
      if (data.winner) setWinner({ vendor_id: data.winner.vendor_id, vendor_name: data.winner.vendor_name });
    }).catch(() => {});
  }, [id]);

  // Filter vendors based on filter state
  const filteredVendors = useMemo(() => {
    if (!bid?.vendor_responses) return [];
    return bid.vendor_responses.filter((vr) => {
      if (!filterMode.has(vr.pricing_mode)) return false;
      if (filterDays !== null) {
        const submitted = new Date(vr.submitted_at).getTime();
        const cutoff = Date.now() - filterDays * 24 * 60 * 60 * 1000;
        if (submitted < cutoff) return false;
      }
      return true;
    });
  }, [bid, filterMode, filterDays]);

  // Build the full matrix: all combinations x filtered vendors
  const { combinations, priceMatrix, vendors } = useMemo(() => {
    if (!bid || !bid.parameters || bid.parameters.length === 0) {
      return { combinations: [], priceMatrix: new Map(), vendors: filteredVendors };
    }

    const allCombos = generateCombinations(bid.parameters);

    // Filter combinations by selected parameter values
    const combos = allCombos.filter(combo => {
      for (const [paramName, selectedOpts] of Object.entries(filterParams)) {
        if (selectedOpts.size > 0 && !selectedOpts.has(combo[paramName])) {
          return false;
        }
      }
      return true;
    });

    const matrix = new Map<string, Map<string, number | null>>();

    for (const combo of combos) {
      const comboKey = makeCombinationKey(combo);
      const vendorPrices = new Map<string, number | null>();

      for (const vr of filteredVendors) {
        const price = calcVendorPrice(vr, combo, comboKey);
        // Apply max price filter
        if (price !== null && price > filterMaxPrice) {
          vendorPrices.set(vr.vendor_name, null);
        } else {
          vendorPrices.set(vr.vendor_name, price);
        }
      }

      matrix.set(comboKey, vendorPrices);
    }

    return { combinations: combos, priceMatrix: matrix, vendors: filteredVendors };
  }, [bid, filteredVendors, filterMaxPrice, filterParams]);

  // Compute stats from the matrix
  const { allPrices, bestOverall, avgOverall } = useMemo(() => {
    const prices: number[] = [];
    priceMatrix.forEach((vendorPrices) => {
      vendorPrices.forEach((price: number | null) => {
        if (price !== null) prices.push(price);
      });
    });
    const best = prices.length > 0 ? Math.min(...prices) : null;
    const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    return { allPrices: prices, bestOverall: best, avgOverall: avg };
  }, [priceMatrix]);

  const responseCount = bid?.vendor_responses?.length ?? 0;
  const hasParams = bid?.parameters && bid.parameters.length > 0;
  const paramNames = bid?.parameters?.map(p => p.name) || [];

  if (loading) {
    return (
      <div className="scroll" style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div
          style={{
            width: "32px", height: "32px",
            border: "4px solid var(--gold-b)",
            borderTopColor: "var(--gold)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        ></div>
      </div>
    );
  }

  if (error || !bid) {
    return (
      <div className="scroll" style={{ padding: "20px" }}>
        <div style={{
          background: "var(--red-bg)", border: "1px solid var(--red-b)",
          borderRadius: "8px", padding: "12px 16px", color: "var(--red)", fontSize: "0.85rem",
        }}>
          {error || "Bid not found"}
        </div>
        <Link href="/customer" style={{ color: "var(--gold)", fontSize: "0.85rem", marginTop: "12px", display: "inline-block" }}>
          {"\u2190"} Back to Dashboard
        </Link>
      </div>
    );
  }

  const handleStatusChange = async (newStatus: string) => {
    setBidStatus(newStatus);
    try {
      const res = await fetch(`/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) showToast(`Status updated to ${newStatus}`);
      else showToast("Failed to update status");
    } catch { showToast("Failed to update status"); }
  };

  const invitedVendorIds = new Set(invitations.map(i => i.vendor_id));
  const uninvitedVendors = availableVendors.filter(v => !invitedVendorIds.has(v.id));

  const handleInvite = async () => {
    if (selectedVendorIds.length === 0) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/bids/${id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_ids: selectedVendorIds }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.created.length} invitation(s) sent`);
        setSelectedVendorIds([]);
        setShowInvitePanel(false);
        fetch(`/api/bids/${id}/invite`).then(r => r.json()).then(setInvitations).catch(() => {});
      } else showToast("Failed to send invitations");
    } catch { showToast("Failed to send invitations"); }
    finally { setInviting(false); }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/vendor-submit/${token}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link copied")).catch(() => showToast("Copy failed"));
  };

  const openWinnerModal = async (vendorName: string) => {
    if (!bid?.vendor_responses) return;
    const bidData = await fetch(`/api/bids/${id}`).then(r => r.json());
    const serverVr = bidData.vendor_responses?.find((r: VendorResponse) => r.vendor_name === vendorName);
    if (!serverVr) { showToast("Could not find vendor response"); return; }
    setWinnerModal({ vendorName, vendorId: serverVr.vendor_id, responseId: serverVr.id });
    setWinnerCombo("");
    setWinnerNotes("");
  };

  const handleConfirmWinner = async () => {
    if (!winnerModal) return;
    setSelectingWinner(true);
    try {
      const res = await fetch(`/api/bids/${id}/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: winnerModal.vendorId,
          vendor_response_id: winnerModal.responseId,
          winning_combination: winnerCombo || undefined,
          notes: winnerNotes || undefined,
        }),
      });
      if (res.ok) {
        showToast(`${winnerModal.vendorName} selected as winner!`);
        setWinner({ vendor_id: winnerModal.vendorId, vendor_name: winnerModal.vendorName });
        setBidStatus("awarded");
        setWinnerModal(null);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to select winner");
      }
    } catch { showToast("Failed to select winner"); }
    finally { setSelectingWinner(false); }
  };

  const handleFinalize = async () => {
    if (!window.confirm("Finalize this bid? This will lock the bid and expire pending invitations.")) return;
    setFinalizing(true);
    try {
      const res = await fetch(`/api/bids/${id}/finalize`, { method: "POST" });
      if (res.ok) {
        showToast("Bid finalized");
        setBidStatus("awarded");
        fetch(`/api/bids/${id}/invite`).then(r => r.json()).then(setInvitations).catch(() => {});
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to finalize");
      }
    } catch { showToast("Failed to finalize"); }
    finally { setFinalizing(false); }
  };

  const handleExportCSV = async () => {
    try {
      const res = await fetch(`/api/bids/${id}/export`);
      if (!res.ok) { showToast("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bid?.title || "bid"}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("CSV downloaded");
    } catch { showToast("Export failed"); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this bid? This action cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bids/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Bid deleted");
        router.push("/customer");
      } else showToast("Failed to delete bid");
    } catch { showToast("Failed to delete bid"); }
    finally { setDeleting(false); }
  };

  return (
    <div className="page on">
      {/* Top action strip */}
      <div className="fstrip">
        <span className="fcount">{responseCount} vendor response{responseCount !== 1 ? "s" : ""}</span>
        <div className="fright">
          <select
            className="finput"
            value={bidStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ width: "auto", minWidth: "100px", padding: "4px 8px", fontSize: "0.78rem" }}
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="closed">Closed</option>
            <option value="awarded">Awarded</option>
          </select>
          <button className="btn btn-outline btn-xs" onClick={handleExportCSV}>
            {"\uD83D\uDCE4"} Export CSV
          </button>
          <button className="btn btn-gold btn-xs" onClick={() => setShowInvitePanel(true)}>
            Invite Vendors
          </button>
          <button className="btn btn-gold btn-xs" onClick={handleFinalize} disabled={finalizing || bidStatus === "awarded"}>
            {finalizing ? "Finalizing..." : bidStatus === "awarded" ? "Finalized" : "Finalize \u2192"}
          </button>
          <button
            className="btn btn-outline btn-xs"
            style={{ color: "var(--red)", borderColor: "var(--red-b)" }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Bid"}
          </button>
        </div>
      </div>

      <div className="compare-shell">
      <div className="compare-main">
        {/* Insight row */}
        <div className="insight-row">
          <div className="ins">
            <div className="ins-lbl">Best Price</div>
            <div className="ins-val" style={{ color: bestOverall ? "var(--green)" : undefined }}>
              {bestOverall !== null ? `$${Number(bestOverall).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014"}
            </div>
          </div>
          <div className="ins">
            <div className="ins-lbl">Avg Price</div>
            <div className="ins-val">
              {avgOverall > 0 ? `$${Math.round(avgOverall).toLocaleString()}` : "\u2014"}
            </div>
          </div>
          <div className="ins">
            <div className="ins-lbl">Responses</div>
            <div className="ins-val">{responseCount}</div>
          </div>
          <div className="ins">
            <div className="ins-lbl">Deadline</div>
            <div className="ins-val" style={{ fontSize: "1rem" }}>
              {new Date(bid.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Leveling Sheet Matrix */}
        <div className="scard">
          <div className="scard-head">
            <h3>Leveling Sheet — {bid.title}</h3>
            <span className="tag tag-pending">
              {responseCount} vendor{responseCount !== 1 ? "s" : ""}
            </span>
            {combinations.length > 0 && (
              <span className="tag tag-draft">
                {combinations.length} combination{combinations.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {hasParams && vendors.length === 0 && (
            <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
              No vendor responses yet. Invite vendors to start comparing prices.
            </div>
          )}

          {hasParams && vendors.length > 0 && (
            <div className="matrix-scroll">
              <table className="matrix-table">
                <thead>
                  <tr>
                    {/* Parameter columns */}
                    {paramNames.map((pName) => (
                      <th key={pName} className="matrix-param-th">{pName}</th>
                    ))}
                    {/* Vendor columns */}
                    {vendors.map((vr, vi) => {
                      const ac = AVATAR_COLORS[vi % AVATAR_COLORS.length];
                      const isWinner = winner?.vendor_name === vr.vendor_name;
                      return (
                        <th key={vr.vendor_name} className={`matrix-vendor-th${isWinner ? " matrix-winner-col" : ""}`}>
                          <div className="matrix-vendor-header">
                            <div className="vav" style={{ background: ac.bg, color: ac.color, width: 26, height: 26, fontSize: "0.65rem" }}>
                              {getInitials(vr.vendor_name)}
                            </div>
                            <div className="matrix-vendor-info">
                              <div className="matrix-vendor-name">{vr.vendor_name}</div>
                              <div className="matrix-vendor-mode">
                                <span className={`tag ${vr.pricing_mode === "additive" ? "tag-active" : "tag-draft"}`} style={{ fontSize: "0.6rem", padding: "1px 5px" }}>
                                  {vr.pricing_mode}
                                </span>
                              </div>
                            </div>
                            {isWinner ? (
                              <span className="tag tag-active" style={{ fontSize: "0.6rem", padding: "1px 6px", marginLeft: 4 }}>Winner</span>
                            ) : (
                              <button
                                className="selbtn"
                                style={{ fontSize: "0.65rem", padding: "2px 7px", marginLeft: 4 }}
                                onClick={() => openWinnerModal(vr.vendor_name)}
                                disabled={selectingWinner || !!winner}
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {combinations.map((combo, ci) => {
                    const comboKey = makeCombinationKey(combo);
                    const vendorPrices = priceMatrix.get(comboKey);

                    // Find best price in this row
                    let rowBest: number | null = null;
                    if (vendorPrices) {
                      vendorPrices.forEach((price: number | null) => {
                        if (price !== null && (rowBest === null || price < rowBest)) {
                          rowBest = price;
                        }
                      });
                    }

                    return (
                      <tr key={ci}>
                        {/* Parameter values */}
                        {paramNames.map((pName) => (
                          <td key={pName} className="matrix-param-td">{combo[pName]}</td>
                        ))}
                        {/* Vendor prices */}
                        {vendors.map((vr, vi) => {
                          const price = vendorPrices?.get(vr.vendor_name) ?? null;
                          const isBest = price !== null && price === rowBest;
                          const isWinnerCol = winner?.vendor_name === vr.vendor_name;
                          return (
                            <td
                              key={vi}
                              className={`matrix-price-td${isBest ? " matrix-best" : ""}${isWinnerCol ? " matrix-winner-col" : ""}`}
                            >
                              {price !== null ? (
                                <span className={`price-big${isBest ? " price-best" : ""}`}>
                                  ${Number(price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span style={{ color: "var(--faint)", fontSize: "0.78rem" }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* Totals / summary row */}
                  {combinations.length > 1 && (
                    <tr className="matrix-summary-row">
                      <td colSpan={paramNames.length} className="matrix-param-td" style={{ fontWeight: 700, color: "var(--ink)" }}>
                        Average
                      </td>
                      {vendors.map((vr, vi) => {
                        // Calculate average for this vendor
                        let sum = 0;
                        let count = 0;
                        combinations.forEach((combo) => {
                          const comboKey = makeCombinationKey(combo);
                          const price = priceMatrix.get(comboKey)?.get(vr.vendor_name) ?? null;
                          if (price !== null) { sum += price; count++; }
                        });
                        const avg = count > 0 ? sum / count : null;

                        // Find lowest vendor average
                        let lowestAvg: number | null = null;
                        vendors.forEach((v2) => {
                          let s2 = 0, c2 = 0;
                          combinations.forEach((combo) => {
                            const ck = makeCombinationKey(combo);
                            const p = priceMatrix.get(ck)?.get(v2.vendor_name) ?? null;
                            if (p !== null) { s2 += p; c2++; }
                          });
                          if (c2 > 0) {
                            const a2 = s2 / c2;
                            if (lowestAvg === null || a2 < lowestAvg) lowestAvg = a2;
                          }
                        });

                        const isBestAvg = avg !== null && lowestAvg !== null && Math.abs(avg - lowestAvg) < 0.01;

                        return (
                          <td key={vi} className={`matrix-price-td matrix-summary-td${isBestAvg ? " matrix-best" : ""}`}>
                            {avg !== null ? (
                              <span className={`price-big${isBestAvg ? " price-best" : ""}`}>
                                ${Math.round(avg).toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ color: "var(--faint)" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* No-params fallback: simple vendor list */}
          {!hasParams && (
            <table className="ctable">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Mode</th>
                  <th>Base Price</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bid.vendor_responses && bid.vendor_responses.length > 0 ? (
                  bid.vendor_responses.map((vr, i) => {
                    const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                    return (
                      <tr key={i}>
                        <td>
                          <div className="vc">
                            <div className="vav" style={{ background: ac.bg, color: ac.color }}>{getInitials(vr.vendor_name)}</div>
                            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{vr.vendor_name}</div>
                          </div>
                        </td>
                        <td><span className={`tag ${vr.pricing_mode === "additive" ? "tag-active" : "tag-draft"}`}>{vr.pricing_mode}</span></td>
                        <td><span className="price-big">{vr.base_price !== null ? `$${Number(vr.base_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "\u2014"}</span></td>
                        <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{new Date(vr.submitted_at).toLocaleDateString()}</td>
                        <td>
                          {winner?.vendor_name === vr.vendor_name ? (
                            <span className="tag tag-active">Winner</span>
                          ) : (
                            <button className="selbtn" onClick={() => openWinnerModal(vr.vendor_name)} disabled={selectingWinner || !!winner}>
                              {selectingWinner ? "..." : "Select"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: "0.85rem" }}>
                      No vendor responses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Invitations section */}
        {invitations.length > 0 && (
          <div className="scard" style={{ marginTop: 16 }}>
            <div className="scard-head">
              <h3>Vendor Invitations</h3>
              <span className="tag tag-pending">{invitations.length} invited</span>
            </div>
            <table className="ctable">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, fontSize: "0.84rem" }}>{inv.vendor_name}</td>
                    <td style={{ fontSize: "0.82rem" }}>{inv.vendor_email}</td>
                    <td>
                      <span className={`tag ${inv.status === "submitted" ? "tag-active" : inv.status === "opened" ? "tag-pending" : inv.status === "expired" ? "tag-closed" : "tag-draft"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{new Date(inv.sent_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem" }} onClick={() => copyLink(inv.token)}>
                        Copy Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Invite modal */}
        {showInvitePanel && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowInvitePanel(false)}>
            <div className="scard" style={{ width: 440, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
              <div className="scard-head"><h3>Invite Vendors</h3></div>
              <div style={{ padding: 16 }}>
                {uninvitedVendors.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>All vendors have been invited.</p>
                ) : (
                  <>
                    <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>Select vendors to invite to this bid:</p>
                    <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
                      {uninvitedVendors.map(v => (
                        <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer", fontSize: "0.84rem" }}>
                          <input
                            type="checkbox"
                            checked={selectedVendorIds.includes(v.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedVendorIds([...selectedVendorIds, v.id]);
                              else setSelectedVendorIds(selectedVendorIds.filter(x => x !== v.id));
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>{v.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{v.email}{v.trade_name ? ` — ${v.trade_name}` : ""}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                  <button className="btn btn-outline" onClick={() => setShowInvitePanel(false)}>Cancel</button>
                  <button className="btn btn-gold" onClick={handleInvite} disabled={selectedVendorIds.length === 0 || inviting}>
                    {inviting ? "Sending..." : `Invite ${selectedVendorIds.length} Vendor(s)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter aside */}
      <div className="compare-aside">
        <div className="fa-title">{"\uD83D\uDD0D"} Filters</div>

        {/* Parameter filters — tracks shown as primary groups */}
        {bid.parameters && bid.parameters.length > 0 && (() => {
          const trackParam = bid.parameters.find(p => p.is_track);
          const subParams = bid.parameters.filter(p => !p.is_track);
          const selectedTrackOpts = filterParams[trackParam?.name || ""] || new Set<string>();
          const hasTrackSelection = selectedTrackOpts.size > 0;

          return (
            <>
              {trackParam && (
                <div className="fa-group">
                  <div className="fa-lbl" style={{ color: "var(--gold)", fontWeight: 800 }}>
                    {trackParam.name}
                  </div>
                  {trackParam.options.map(opt => {
                    const selected = selectedTrackOpts.has(opt);
                    const isActive = !hasTrackSelection || selected;
                    return (
                      <label key={opt} className="fa-opt" style={{ opacity: isActive ? 1 : 0.4, fontWeight: selected ? 700 : 400 }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            setFilterParams(prev => {
                              const next = { ...prev };
                              const set = new Set(prev[trackParam.name] || []);
                              if (e.target.checked) set.add(opt); else set.delete(opt);
                              next[trackParam.name] = set;
                              return next;
                            });
                          }}
                        /> {opt}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Sub-parameters — shown indented, dimmed when no track selected */}
              {subParams.map(param => {
                const selected = filterParams[param.name] || new Set<string>();
                const anySelected = selected.size > 0;
                const dimmed = trackParam && !hasTrackSelection;
                return (
                  <div className="fa-group" key={param.name} style={{
                    opacity: dimmed ? 0.35 : 1,
                    pointerEvents: dimmed ? "none" : "auto",
                    paddingLeft: trackParam ? 8 : 0,
                    borderLeft: trackParam ? "2px solid var(--gold-b)" : "none",
                    transition: "opacity 0.2s",
                  }}>
                    <div className="fa-lbl">{param.name}</div>
                    {param.options.map(opt => {
                      const isSelected = selected.has(opt);
                      const isActive = !anySelected || isSelected;
                      return (
                        <label key={opt} className="fa-opt" style={{ opacity: isActive ? 1 : 0.5 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setFilterParams(prev => {
                                const next = { ...prev };
                                const set = new Set(prev[param.name] || []);
                                if (e.target.checked) set.add(opt); else set.delete(opt);
                                next[param.name] = set;
                                return next;
                              });
                            }}
                          /> {opt}
                        </label>
                      );
                    })}
                  </div>
                );
              })}

              {/* Non-track params (if no track exists) */}
              {!trackParam && bid.parameters.map(param => (
                <div className="fa-group" key={param.name}>
                  <div className="fa-lbl">{param.name}</div>
                  {param.options.map(opt => {
                    const isSelected = (filterParams[param.name] || new Set()).has(opt);
                    const anySelected = (filterParams[param.name]?.size ?? 0) > 0;
                    const isActive = !anySelected || isSelected;
                    return (
                      <label key={opt} className="fa-opt" style={{ opacity: isActive ? 1 : 0.5 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            setFilterParams(prev => {
                              const next = { ...prev };
                              const set = new Set(prev[param.name] || []);
                              if (e.target.checked) set.add(opt); else set.delete(opt);
                              next[param.name] = set;
                              return next;
                            });
                          }}
                        /> {opt}
                      </label>
                    );
                  })}
                </div>
              ))}
            </>
          );
        })()}

        <div className="fa-group">
          <div className="fa-lbl">Pricing Mode</div>
          <label className="fa-opt">
            <input
              type="checkbox"
              checked={filterMode.has("combination")}
              onChange={(e) => {
                const next = new Set(filterMode);
                if (e.target.checked) next.add("combination"); else next.delete("combination");
                setFilterMode(next);
              }}
            /> Combination
          </label>
          <label className="fa-opt">
            <input
              type="checkbox"
              checked={filterMode.has("additive")}
              onChange={(e) => {
                const next = new Set(filterMode);
                if (e.target.checked) next.add("additive"); else next.delete("additive");
                setFilterMode(next);
              }}
            /> Additive
          </label>
        </div>
        <div className="fa-group">
          <div className="fa-lbl">Max Price</div>
          <div className="fa-range">
            <input
              type="range"
              min="10000"
              max="5000000"
              step="10000"
              value={filterMaxPrice}
              onChange={(e) => setFilterMaxPrice(Number(e.target.value))}
            />
            <div className="fa-range-lbls">
              <span>$10K</span>
              <span>{filterMaxPrice >= 5000000 ? "Any" : `$${(filterMaxPrice / 1000).toFixed(0)}K`}</span>
            </div>
          </div>
        </div>
        <div className="fa-group">
          <div className="fa-lbl">Date Submitted</div>
          <label className="fa-opt">
            <input type="radio" name="filter-days" checked={filterDays === 7} onChange={() => setFilterDays(7)} style={{ accentColor: "var(--gold)" }} /> Last 7 days
          </label>
          <label className="fa-opt">
            <input type="radio" name="filter-days" checked={filterDays === 30} onChange={() => setFilterDays(30)} style={{ accentColor: "var(--gold)" }} /> Last 30 days
          </label>
          <label className="fa-opt">
            <input type="radio" name="filter-days" checked={filterDays === null} onChange={() => setFilterDays(null)} style={{ accentColor: "var(--gold)" }} /> Any
          </label>
        </div>
        <button
          className="btn btn-outline"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => {
            setFilterMode(new Set(["combination", "additive"]));
            setFilterMaxPrice(5000000);
            setFilterDays(null);
            setFilterParams({});
            showToast("Filters reset");
          }}
        >
          Reset Filters
        </button>
      </div>
      </div>

      {/* Winner Selection Modal */}
      {winnerModal && bid && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setWinnerModal(null)}>
          <div className="scard" style={{ width: 480, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="scard-head">
              <h3>Select Winner</h3>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: "0.88rem", color: "var(--ink)", marginBottom: 16 }}>
                Awarding <strong style={{ color: "var(--gold)" }}>{winnerModal.vendorName}</strong> for <strong>{bid.title}</strong>
              </p>

              {/* Winning option selection */}
              {hasParams && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Winning Option
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 8 }}>
                    Select which pricing option the vendor won with:
                  </p>
                  <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                    {combinations.map((combo, i) => {
                      const comboKey = makeCombinationKey(combo);
                      const price = priceMatrix.get(comboKey)?.get(winnerModal.vendorName) ?? null;
                      const label = Object.entries(combo).map(([k, v]) => `${k}: ${v}`).join(" + ");
                      return (
                        <label key={i} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          borderBottom: i < combinations.length - 1 ? "1px solid var(--border)" : "none",
                          cursor: "pointer", fontSize: "0.84rem",
                          background: winnerCombo === label ? "var(--gold-bg)" : "transparent",
                        }}>
                          <input
                            type="radio"
                            name="winner-combo"
                            value={label}
                            checked={winnerCombo === label}
                            onChange={() => setWinnerCombo(label)}
                            style={{ accentColor: "var(--gold)" }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{label}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: price !== null ? "var(--gold)" : "var(--muted)", fontSize: "0.88rem" }}>
                            {price !== null ? `$${Number(price).toLocaleString()}` : "\u2014"}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  Notes (optional)
                </div>
                <textarea
                  value={winnerNotes}
                  onChange={e => setWinnerNotes(e.target.value)}
                  placeholder="Any additional notes for the winner..."
                  style={{
                    width: "100%", padding: "8px 12px", border: "1.5px solid var(--border)",
                    borderRadius: 8, fontSize: "0.84rem", minHeight: 60, resize: "vertical",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box",
                    background: "var(--surface)", color: "var(--ink)",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setWinnerModal(null)}>Cancel</button>
                <button
                  className="btn btn-gold"
                  onClick={handleConfirmWinner}
                  disabled={selectingWinner || (hasParams && !winnerCombo)}
                >
                  {selectingWinner ? "Selecting..." : "Confirm Winner"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
