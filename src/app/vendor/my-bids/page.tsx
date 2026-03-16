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
  response_date: string | null;
  project_name: string | null;
  total_price: number | null;
  bid_status: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "t-active" },
  pending_review: { label: "Pending", cls: "t-pending" },
  won: { label: "Won", cls: "t-won" },
  lost: { label: "Lost", cls: "t-rejected" },
  expired: { label: "Expired", cls: "t-expired" },
};

export default function MyBidsPage() {
  const [bids, setBids] = useState<MyBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/vendor/my-bids")
      .then(r => r.ok ? r.json() : [])
      .then(setBids)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? bids : bids.filter(b => b.display_status === filter);

  const filters = [
    { key: "all", label: "All", count: bids.length },
    { key: "open", label: "Open", count: bids.filter(b => b.display_status === "open").length },
    { key: "pending_review", label: "Pending", count: bids.filter(b => b.display_status === "pending_review").length },
    { key: "won", label: "Won", count: bids.filter(b => b.display_status === "won").length },
    { key: "lost", label: "Lost", count: bids.filter(b => b.display_status === "lost").length },
  ];

  return (
    <div className="page on">
      <div className="scroll">
      {/* Filter strip */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: filter === f.key ? "1.5px solid var(--gold)" : "1px solid var(--border)",
              background: filter === f.key ? "var(--gold-bg)" : "var(--card)",
              color: filter === f.key ? "var(--gold)" : "var(--muted)",
              fontWeight: filter === f.key ? 700 : 500,
              fontSize: "0.82rem",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {f.label} {f.count > 0 && <span style={{ opacity: 0.7 }}>({f.count})</span>}
          </button>
        ))}
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

      {!loading && filtered.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="empty-txt">No bids found.</div>
          <div className="empty-sub">{filter !== "all" ? "Try a different filter." : "You haven't received any bid invitations yet."}</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="scard">
          <div className="scard-body" style={{ padding: 0 }}>
            <table className="btable" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Bid Title</th>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>Project</th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>Deadline</th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>Submitted</th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(bid => {
                  const status = STATUS_MAP[bid.display_status] || { label: bid.display_status, cls: "" };
                  const deadlinePast = new Date(bid.deadline) < new Date();
                  return (
                    <tr key={bid.bid_id} style={{ cursor: "pointer" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <Link href={`/vendor/my-bids/${bid.bid_id}`} style={{ textDecoration: "none", color: "var(--ink)", fontWeight: 600, fontSize: "0.88rem" }}>
                          {bid.title}
                        </Link>
                        {bid.description && (
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
                            {bid.description.length > 80 ? bid.description.slice(0, 80) + "..." : bid.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "0.82rem", color: "var(--muted)" }}>
                        {bid.project_name || "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", fontSize: "0.82rem", color: deadlinePast ? "var(--red)" : "var(--muted)" }}>
                        {new Date(bid.deadline).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", fontSize: "0.82rem", color: "var(--muted)" }}>
                        {bid.response_date ? new Date(bid.response_date).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span className={`tag ${status.cls}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
