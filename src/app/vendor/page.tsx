"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface MyBid {
  bid_id: string;
  title: string;
  description: string;
  deadline: string;
  display_status: string;
  invitation_status: string;
  sent_at: string;
  submitted_at: string | null;
  project_name: string | null;
  total_price: number | null;
  token: string;
}

export default function VendorDashboard() {
  const [bids, setBids] = useState<MyBid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vendor/my-bids")
      .then(r => r.ok ? r.json() : [])
      .then(setBids)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const open = bids.filter(b => b.display_status === "open");
  const submitted = bids.filter(b => b.display_status === "pending_review");
  const won = bids.filter(b => b.display_status === "won");
  const decided = bids.filter(b => b.display_status === "won" || b.display_status === "lost");
  const winRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0;

  return (
    <div className="page on">
      {/* KPI ROW */}
      <div className="kpi-row">
        <div className="kpi" style={{ "--kc": "var(--gold)" } as React.CSSProperties}>
          <div className="kpi-lbl">Open Invitations</div>
          <div className="kpi-val">{loading ? "..." : open.length}</div>
          <div className="kpi-sub">Awaiting your bid</div>
        </div>
        <div className="kpi" style={{ "--kc": "var(--blue)" } as React.CSSProperties}>
          <div className="kpi-lbl">Bids Submitted</div>
          <div className="kpi-val">{loading ? "..." : submitted.length}</div>
          <div className="kpi-sub">Under review</div>
        </div>
        <div className="kpi" style={{ "--kc": "var(--green)" } as React.CSSProperties}>
          <div className="kpi-lbl">Bids Won</div>
          <div className="kpi-val">{loading ? "..." : won.length}</div>
          <div className="kpi-sub win">🏆 {winRate}% win rate</div>
        </div>
        <div className="kpi" style={{ "--kc": "var(--purple)" } as React.CSSProperties}>
          <div className="kpi-lbl">Total Bids</div>
          <div className="kpi-val">{loading ? "..." : bids.length}</div>
          <div className="kpi-sub">All time</div>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)",
            animation: "spin 0.8s linear infinite",
          }} />
        </div>
      )}

      {!loading && bids.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="empty-txt">No bids yet.</div>
          <div className="empty-sub">You&apos;ll see invitations here once a contractor invites you to bid.</div>
        </div>
      )}

      {/* OPEN INVITATIONS */}
      {!loading && open.length > 0 && (
        <div className="scard">
          <div className="scard-head">
            <h3>📨 Open Invitations — Action Required</h3>
            <span className="tag t-pending">{open.length} pending</span>
          </div>
          <div className="scard-body" style={{ padding: 14 }}>
            {open.map(bid => (
              <Link key={bid.bid_id} href={`/vendor/${bid.bid_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="invite-card">
                  <span className="inv-icon">📦</span>
                  <div className="inv-body">
                    <div className="inv-title">{bid.title}</div>
                    <div className="inv-sub">
                      {bid.project_name && <span style={{ color: "var(--gold)", fontWeight: 600 }}>{bid.project_name} · </span>}
                      {bid.description?.length > 100 ? bid.description.slice(0, 100) + "..." : bid.description}
                    </div>
                    <div className="inv-pills">
                      <span className="inv-pill ip-red">
                        ⏰ Deadline: {new Date(bid.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="btn btn-gold btn-sm">Submit Bid →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* RECENT ACTIVITY */}
      {!loading && bids.length > 0 && (
        <div className="scard" style={{ marginTop: 16 }}>
          <div className="scard-head">
            <h3>📊 Recent Activity</h3>
          </div>
          <div className="scard-body" style={{ padding: 14 }}>
            {bids.slice(0, 8).map(bid => (
              <Link key={bid.bid_id + bid.display_status} href={`/vendor/my-bids/${bid.bid_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--bg)")}
                onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: "1.1rem" }}>
                    {bid.display_status === "won" ? "🏆" : bid.display_status === "lost" ? "📭" : bid.display_status === "pending_review" ? "⏳" : "📨"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ink)" }}>{bid.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                      {bid.display_status === "won" ? "You won this bid!" :
                       bid.display_status === "lost" ? "Another vendor selected" :
                       bid.display_status === "pending_review" ? "Awaiting contractor decision" :
                       "Invitation received"}
                    </div>
                  </div>
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
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
