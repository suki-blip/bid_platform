"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Parameter {
  name: string;
  options: string[];
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

interface MatchedPrice {
  vendor_name: string;
  price: number;
  submitted_at: string;
  pricing_mode: string;
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

export default function CustomerBidDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [bid, setBid] = useState<Bid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [bidStatus, setBidStatus] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [availableVendors, setAvailableVendors] = useState<VendorOption[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetch(`/api/bids/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bid");
        return res.json();
      })
      .then((data) => {
        setBid(data);
        setBidStatus(data.status || "active");
        const init: Record<string, string> = {};
        (data.parameters || []).forEach((p: Parameter) => {
          init[p.name] = "";
        });
        setSelections(init);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Fetch invitations
    fetch(`/api/bids/${id}/invite`).then(r => r.json()).then(setInvitations).catch(() => {});

    // Fetch available vendors
    fetch("/api/vendors").then(r => r.json()).then(setAvailableVendors).catch(() => {});
  }, [id]);

  const allSelected =
    bid?.parameters &&
    bid.parameters.length > 0 &&
    bid.parameters.every((p) => selections[p.name]);

  const combinationKey = allSelected
    ? JSON.stringify(
        Object.keys(selections)
          .sort()
          .reduce((acc: Record<string, string>, key) => {
            acc[key] = selections[key];
            return acc;
          }, {})
      )
    : null;

  const matchingPrices: MatchedPrice[] = [];
  if (allSelected && bid?.vendor_responses) {
    for (const vr of bid.vendor_responses) {
      if (vr.pricing_mode === "additive") {
        let total = vr.base_price ?? 0;
        let allFound = true;

        const optionAdditions: Record<string, number> = {};
        for (const [paramName, optionValue] of Object.entries(selections)) {
          const key = JSON.stringify({ param: paramName, option: optionValue });
          const match = vr.prices.find((p) => p.combination_key === key);
          if (match) {
            optionAdditions[key] = match.price;
            total += match.price;
          } else {
            allFound = false;
          }
        }

        if (allFound && vr.rules && vr.rules.length > 0) {
          for (const rule of vr.rules) {
            if (selections[rule.conditionParam] !== rule.conditionOption) continue;

            if (rule.targetType === "total") {
              if (rule.discountType === "percentage") {
                total -= total * (rule.discountValue / 100);
              } else {
                total -= rule.discountValue;
              }
            } else if (rule.targetType === "param_option") {
              if (selections[rule.targetParam] === rule.targetOption) {
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

        if (allFound) {
          matchingPrices.push({
            vendor_name: vr.vendor_name,
            price: Math.max(0, total),
            submitted_at: vr.submitted_at,
            pricing_mode: "additive",
          });
        }
      } else {
        const match = vr.prices.find((p) => p.combination_key === combinationKey);
        if (match) {
          matchingPrices.push({
            vendor_name: vr.vendor_name,
            price: match.price,
            submitted_at: vr.submitted_at,
            pricing_mode: "combination",
          });
        }
      }
    }
  }

  const sortedPrices = [...matchingPrices].sort((a, b) => a.price - b.price);
  const bestPrice = sortedPrices.length > 0 ? sortedPrices[0].price : null;
  const avgPrice =
    sortedPrices.length > 0
      ? sortedPrices.reduce((s, p) => s + p.price, 0) / sortedPrices.length
      : 0;
  const responseCount = bid?.vendor_responses?.length ?? 0;

  if (loading) {
    return (
      <div className="scroll" style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div
          style={{
            width: "32px",
            height: "32px",
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
        <div
          style={{
            background: "var(--red-bg)",
            border: "1px solid var(--red-b)",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "var(--red)",
            fontSize: "0.85rem",
          }}
        >
          {error || "Bid not found"}
        </div>
        <Link href="/customer" style={{ color: "var(--gold)", fontSize: "0.85rem", marginTop: "12px", display: "inline-block" }}>
          {"\u2190"} Back to Dashboard
        </Link>
      </div>
    );
  }

  const hasParams = bid.parameters && bid.parameters.length > 0;

  const handleStatusChange = async (newStatus: string) => {
    setBidStatus(newStatus);
    try {
      const res = await fetch(`/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`Status updated to ${newStatus}`);
      } else {
        showToast("Failed to update status");
      }
    } catch {
      showToast("Failed to update status");
    }
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
        // Refresh invitations
        fetch(`/api/bids/${id}/invite`).then(r => r.json()).then(setInvitations).catch(() => {});
      } else {
        showToast("Failed to send invitations");
      }
    } catch { showToast("Failed to send invitations"); }
    finally { setInviting(false); }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/vendor-submit/${token}`;
    navigator.clipboard.writeText(url).then(() => showToast("Link copied")).catch(() => showToast("Copy failed"));
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this bid? This action cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bids/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Bid deleted");
        router.push("/customer");
      } else {
        showToast("Failed to delete bid");
      }
    } catch {
      showToast("Failed to delete bid");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page on" style={{ display: "block" }}>
      <div className="fstrip">
        <div className="fs-search">
          <span style={{ color: "var(--faint)" }}>{"\uD83D\uDD0D"}</span>
          <input placeholder="Search vendor, option, price\u2026" />
        </div>
        <div className="chip on" onClick={() => showToast("Filter toggled")}>All Vendors</div>
        <div className="chip" onClick={() => showToast("Filter toggled")}>Lowest Price</div>
        <div className="chip" onClick={() => showToast("Filter toggled")}>Fastest Delivery</div>
        <div className="chip" style={{ borderStyle: "dashed", color: "var(--gold)" }} onClick={() => showToast("Custom filters coming soon")}>
          + Filter
        </div>
        <span className="fcount">{responseCount} received</span>
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
          <select className="sort-sel">
            <option>Sort: Price {"\u2191"}</option>
            <option>Sort: Name</option>
            <option>Sort: Date</option>
          </select>
          <button className="btn btn-outline btn-xs" onClick={() => showToast("Export coming soon")}>
            {"\uD83D\uDCE4"} Export CSV
          </button>
          <button className="btn btn-gold btn-xs" onClick={() => setShowInvitePanel(true)}>
            Invite Vendors
          </button>
          <button className="btn btn-gold btn-xs" onClick={() => showToast("Finalize coming soon")}>
            Finalize {"\u2192"}
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
              <div className="ins-val" style={{ color: bestPrice ? "var(--green)" : undefined }}>
                {bestPrice !== null ? `$${Number(bestPrice).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "\u2014"}
              </div>
            </div>
            <div className="ins">
              <div className="ins-lbl">Avg Price</div>
              <div className="ins-val">
                {avgPrice > 0 ? `$${Math.round(avgPrice).toLocaleString()}` : "\u2014"}
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

          {/* Parameter selectors */}
          {hasParams && (
            <div className="scard" style={{ marginBottom: "16px" }}>
              <div className="scard-head">
                <h3>Select Parameters to Compare</h3>
              </div>
              <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                {bid.parameters.map((param) => (
                  <div key={param.name}>
                    <label className="flbl">{param.name}</label>
                    <select
                      className="finput"
                      value={selections[param.name] || ""}
                      onChange={(e) =>
                        setSelections({ ...selections, [param.name]: e.target.value })
                      }
                    >
                      <option value="">-- Select {param.name} --</option>
                      {param.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor table */}
          <div className="scard">
            <div className="scard-head">
              <h3>Bids — {bid.title}</h3>
              <span className="tag tag-pending">
                {responseCount} of {responseCount} received
              </span>
            </div>

            {hasParams && !allSelected && (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
                Select all parameters above to view vendor prices.
              </div>
            )}

            {(!hasParams || allSelected) && (
              <table className="ctable">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Mode</th>
                    <th>Price</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hasParams && sortedPrices.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: "0.85rem" }}>
                        No vendor prices for this combination yet.
                      </td>
                    </tr>
                  )}

                  {hasParams &&
                    sortedPrices.map((r, i) => {
                      const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                      return (
                        <tr key={i}>
                          <td>
                            <div className="vc">
                              <div className="vav" style={{ background: ac.bg, color: ac.color }}>
                                {getInitials(r.vendor_name)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>
                                  {r.vendor_name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`tag ${r.pricing_mode === "additive" ? "tag-active" : "tag-draft"}`}
                            >
                              {r.pricing_mode}
                            </span>
                          </td>
                          <td>
                            <span className={`price-big${r.price === bestPrice ? " price-best" : ""}`}>
                              ${Number(r.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            {new Date(r.submitted_at).toLocaleDateString()}
                          </td>
                          <td>
                            <button className="selbtn" onClick={() => showToast(`Selected ${r.vendor_name}`)}>
                              Select
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                  {!hasParams &&
                    bid.vendor_responses &&
                    bid.vendor_responses.map((vr, i) => {
                      const ac = AVATAR_COLORS[i % AVATAR_COLORS.length];
                      return (
                        <tr key={i}>
                          <td>
                            <div className="vc">
                              <div className="vav" style={{ background: ac.bg, color: ac.color }}>
                                {getInitials(vr.vendor_name)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>
                                  {vr.vendor_name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`tag ${vr.pricing_mode === "additive" ? "tag-active" : "tag-draft"}`}>
                              {vr.pricing_mode}
                            </span>
                          </td>
                          <td>
                            <span className="price-big">
                              {vr.base_price !== null ? `$${Number(vr.base_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "\u2014"}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            {new Date(vr.submitted_at).toLocaleDateString()}
                          </td>
                          <td>
                            <button className="selbtn" onClick={() => showToast(`Selected ${vr.vendor_name}`)}>
                              Select
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                  {!hasParams && (!bid.vendor_responses || bid.vendor_responses.length === 0) && (
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

        {/* Filter aside */}
        <div className="compare-aside">
          <div className="fa-title">{"\uD83D\uDD0D"} Filter Bids</div>
          <div className="fa-group">
            <div className="fa-lbl">Pricing Mode</div>
            <label className="fa-opt">
              <input type="checkbox" defaultChecked /> Combination
            </label>
            <label className="fa-opt">
              <input type="checkbox" defaultChecked /> Additive
            </label>
          </div>
          <div className="fa-group">
            <div className="fa-lbl">Price Range</div>
            <div className="fa-range">
              <input type="range" min="0" max="100000" defaultValue="50000" />
              <div className="fa-range-lbls">
                <span>$0</span>
                <span>$50K+</span>
              </div>
            </div>
          </div>
          <div className="fa-group">
            <div className="fa-lbl">Date Submitted</div>
            <label className="fa-opt">
              <input type="checkbox" defaultChecked /> Last 7 days
            </label>
            <label className="fa-opt">
              <input type="checkbox" /> Last 30 days
            </label>
            <label className="fa-opt">
              <input type="checkbox" /> Any
            </label>
          </div>
          <button className="btn btn-gold" style={{ width: "100%", justifyContent: "center", marginBottom: "6px" }} onClick={() => showToast("Filters applied")}>
            Apply
          </button>
          <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={() => showToast("Filters reset")}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
