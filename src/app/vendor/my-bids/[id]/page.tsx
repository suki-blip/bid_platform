"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface BidDetail {
  bid_id: string;
  title: string;
  description: string;
  deadline: string;
  bid_status: string;
  project_name: string | null;
  display_status: string;
  invitation_status: string;
  response_id: string | null;
  pricing_mode: string | null;
  base_price: number | null;
  winner_notes: string | null;
  token: string;
  parameters: { name: string; options: string[] }[];
  prices: { combination_key: string; price: number }[];
  timeline: { event: string; date: string }[];
}

export default function BidDetailPage() {
  const { id } = useParams();
  const [bid, setBid] = useState<BidDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vendor/my-bids/${id}`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load bid details");
        return r.json();
      })
      .then(setBid)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="page on" style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)",
        animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );

  if (error || !bid) return (
    <div className="page on">
      <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-b)", borderRadius: 8, padding: "16px", color: "var(--red)" }}>
        {error || "Bid not found"}
      </div>
      <Link href="/vendor/my-bids" style={{ color: "var(--gold)", display: "inline-block", marginTop: 16 }}>← Back to My Bids</Link>
    </div>
  );

  const deadlinePast = new Date(bid.deadline) < new Date();
  const canEdit = bid.display_status === "open" && !deadlinePast;
  const canResubmit = bid.display_status === "pending_review" && !deadlinePast;

  // Parse prices for display
  const priceRows = bid.prices.map(p => {
    let combo: Record<string, string> = {};
    try { combo = JSON.parse(p.combination_key); } catch {}
    return { combo, price: p.price };
  });

  return (
    <div className="page on">
      <Link href="/vendor/my-bids" style={{ color: "var(--gold)", fontSize: "0.85rem", textDecoration: "none", marginBottom: 16, display: "inline-block" }}>
        ← Back to My Bids
      </Link>

      {/* STATUS BANNER */}
      {bid.display_status === "won" && (
        <div style={{
          background: "linear-gradient(135deg, #065f46, #047857)", color: "#fff",
          borderRadius: 12, padding: "20px 24px", marginBottom: 16,
        }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 4 }}>🏆 Congratulations! You won this bid!</div>
          <div style={{ opacity: 0.9, fontSize: "0.9rem" }}>The contractor has selected your submission.</div>
          {bid.winner_notes && (
            <div style={{ marginTop: 12, background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem" }}>
              <strong>Contractor Notes:</strong> {bid.winner_notes}
            </div>
          )}
        </div>
      )}

      {bid.display_status === "lost" && (
        <div style={{
          background: "var(--red-bg)", border: "1px solid var(--red-b)",
          borderRadius: 12, padding: "16px 20px", marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>Another vendor was selected</div>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Thank you for your submission. We hope to work with you on future projects.</div>
        </div>
      )}

      {bid.display_status === "pending_review" && (
        <div style={{
          background: "var(--gold-bg)", border: "1px solid var(--gold-b)",
          borderRadius: 12, padding: "16px 20px", marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, color: "var(--gold)", marginBottom: 4 }}>⏳ Awaiting Contractor Decision</div>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Your bid has been submitted and is being reviewed.</div>
        </div>
      )}

      {/* BID INFO */}
      <div className="scard" style={{ marginBottom: 16 }}>
        <div className="scard-head">
          <h3>{bid.title}</h3>
          <span className={`tag ${
            bid.display_status === "won" ? "t-won" :
            bid.display_status === "lost" ? "t-rejected" :
            bid.display_status === "pending_review" ? "t-pending" :
            "t-active"
          }`}>
            {bid.display_status === "won" ? "Won" :
             bid.display_status === "lost" ? "Lost" :
             bid.display_status === "pending_review" ? "Pending" :
             "Open"}
          </span>
        </div>
        <div className="scard-body" style={{ padding: 16 }}>
          {bid.project_name && (
            <div style={{ marginBottom: 8, fontSize: "0.85rem" }}>
              <strong style={{ color: "var(--muted)" }}>Project:</strong>{" "}
              <span style={{ color: "var(--gold)", fontWeight: 600 }}>{bid.project_name}</span>
            </div>
          )}
          <p style={{ fontSize: "0.88rem", color: "var(--ink2)", lineHeight: 1.6, marginBottom: 12 }}>{bid.description}</p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.82rem", color: deadlinePast ? "var(--red)" : "var(--muted)" }}>
              ⏰ Deadline: <strong>{new Date(bid.deadline).toLocaleDateString()}</strong>
              {deadlinePast && " (Expired)"}
            </div>
            {bid.parameters.length > 0 && (
              <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                📐 {bid.parameters.length} parameter{bid.parameters.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUBMITTED PRICES */}
      {priceRows.length > 0 && (
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-head">
            <h3>💰 Your Submitted Prices</h3>
            {(canEdit || canResubmit) && (
              <Link href={`/vendor/${bid.bid_id}`} className="btn btn-gold btn-sm" style={{ textDecoration: "none" }}>
                ✏️ Edit Submission
              </Link>
            )}
          </div>
          <div className="scard-body" style={{ padding: 0 }}>
            <table className="btable" style={{ width: "100%" }}>
              <thead>
                <tr>
                  {bid.parameters.map(p => (
                    <th key={p.name} style={{ textAlign: "left", padding: "10px 14px" }}>{p.name}</th>
                  ))}
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {priceRows.map((row, i) => (
                  <tr key={i}>
                    {bid.parameters.map(p => (
                      <td key={p.name} style={{ padding: "10px 14px", fontSize: "0.85rem", color: "var(--ink2)" }}>
                        {row.combo[p.name] || "—"}
                      </td>
                    ))}
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "var(--ink)", fontFamily: "monospace" }}>
                      ${row.price.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OPEN BID - SUBMIT BUTTON */}
      {bid.display_status === "open" && priceRows.length === 0 && (
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-body" style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>✏️</div>
            <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>You haven&apos;t submitted a bid yet</div>
            <Link href={`/vendor/${bid.bid_id}`} className="btn btn-gold" style={{ textDecoration: "none", display: "inline-block", padding: "10px 24px" }}>
              Submit Your Bid →
            </Link>
          </div>
        </div>
      )}

      {/* TIMELINE */}
      {bid.timeline.length > 0 && (
        <div className="scard">
          <div className="scard-head">
            <h3>📅 Timeline</h3>
          </div>
          <div className="scard-body" style={{ padding: 16 }}>
            {bid.timeline.map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 0",
                borderBottom: i < bid.timeline.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i === bid.timeline.length - 1 ? "var(--gold)" : "var(--border)",
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ink)" }}>{t.event}</span>
                </div>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
