"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Bid {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: string;
  project_id: string | null;
  vendor_response_count: number;
}

interface Project {
  id: string;
  name: string;
  address: string;
  type: string;
  description: string;
  status: string;
  bid_count: number;
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

const STATUS_TAG_CLASS: Record<string, string> = {
  active: "tag-active",
  draft: "tag-draft",
  closed: "tag-overdue",
  awarded: "tag-win",
  paused: "tag-draft",
};

export default function CustomerDashboard() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch projects");
        return res.json();
      }),
      fetch("/api/bids").then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bids");
        return res.json();
      }),
    ])
      .then(([projData, bidData]) => {
        setProjects(projData);
        setBids(bidData);
        const init: Record<string, boolean> = {};
        projData.forEach((p: Project) => {
          init[p.id] = true;
        });
        if (bidData.some((b: Bid) => !b.project_id)) {
          init["__unassigned"] = true;
        }
        setOpenAccordions(init);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleAccordion = (id: string) => {
    setOpenAccordions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    projects.forEach((p) => { next[p.id] = true; });
    if (bids.some((b) => !b.project_id)) next["__unassigned"] = true;
    setOpenAccordions(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    projects.forEach((p) => { next[p.id] = false; });
    next["__unassigned"] = false;
    setOpenAccordions(next);
  };

  // Filter logic
  const filteredProjects = activeFilter === "all"
    ? projects
    : projects.filter((p) => p.status === activeFilter);

  const filteredBids = activeFilter === "all"
    ? bids
    : bids.filter((b) => b.status === activeFilter);

  // KPIs computed from real data
  const activeProjectCount = projects.filter((p) => p.status === "active").length;
  const openBidCount = bids.filter((b) => b.status === "active" || b.status === "draft").length;
  const totalResponses = bids.reduce((s, b) => s + (b.vendor_response_count ?? 0), 0);
  const responseRate = bids.length > 0 ? Math.round((totalResponses / (bids.length * 10)) * 100) : 0;

  const activityFeed = [
    { icon: "\uD83D\uDCE5", bg: "var(--green-bg)", color: "var(--green)", text: "<strong>BrooklynMill</strong> submitted a bid — Kitchens", time: "2 min ago" },
    { icon: "\uD83C\uDFC6", bg: "var(--gold-bg)", color: "var(--gold)", text: "Winner selected: <strong>ManhattanCab Co.</strong> – Flooring", time: "1 hr ago" },
    { icon: "\uD83D\uDCE8", bg: "var(--blue-bg)", color: "var(--blue)", text: "Bid request sent to <strong>8 vendors</strong> — MEP", time: "3 hrs ago" },
    { icon: "\u23F0", bg: "var(--red-bg)", color: "var(--red)", text: "Auto-reminder sent to <strong>3 vendors</strong>", time: "Yesterday 4:30 PM" },
    { icon: "\uD83D\uDCE5", bg: "var(--green-bg)", color: "var(--green)", text: "<strong>TriState Imports</strong> submitted 2 options", time: "Yesterday 2:15 PM" },
  ];

  if (loading) {
    return (
      <div className="scroll" style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div style={{ width: "32px", height: "32px", border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="scroll" style={{ padding: "20px" }}>
        <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-b)", borderRadius: "8px", padding: "12px 16px", color: "var(--red)", fontSize: "0.85rem" }}>
          Error: {error}
        </div>
      </div>
    );
  }

  const filterChips = [
    { key: "all", label: "All", icon: "" },
    { key: "active", label: "Active", icon: "\uD83D\uDFE2" },
    { key: "draft", label: "Draft", icon: "\uD83D\uDCCB" },
    { key: "closed", label: "Closed", icon: "\u23F0" },
  ];

  // Group filtered bids by project
  const projectGroups = filteredProjects.map((proj) => ({
    project: proj,
    bids: filteredBids.filter((b) => b.project_id === proj.id),
  }));
  const unassignedBids = filteredBids.filter((b) => !b.project_id);

  return (
    <div className="page on" style={{ display: "block" }}>
      <div className="fstrip">
        <div className="fs-search">
          <span style={{ color: "var(--faint)" }}>{"\uD83D\uDD0D"}</span>
          <input placeholder="Search projects\u2026" />
        </div>
        {filterChips.map((chip) => (
          <div
            key={chip.key}
            className={`chip${activeFilter === chip.key ? " on" : ""}`}
            onClick={() => setActiveFilter(chip.key)}
          >
            {chip.icon ? `${chip.icon} ` : ""}{chip.label}
          </div>
        ))}
        <div className="fright">
          <select className="sort-sel">
            <option>Sort: Deadline {"\u2191"}</option>
            <option>Sort: Bids {"\u2193"}</option>
            <option>Sort: Recent</option>
          </select>
        </div>
      </div>
      <div className="scroll">
        <div className="kpi-row">
          <div className="kpi" style={{ "--kc": "var(--gold)" } as React.CSSProperties}>
            <span className="kpi-icon">{"\uD83D\uDCC1"}</span>
            <div className="kpi-lbl">Active Projects</div>
            <div className="kpi-val">{activeProjectCount}</div>
            <div className="kpi-sub">{"\u2191"} this month</div>
          </div>
          <div className="kpi" style={{ "--kc": "var(--blue)" } as React.CSSProperties}>
            <span className="kpi-icon">{"\uD83D\uDCE8"}</span>
            <div className="kpi-lbl">Open Bid Requests</div>
            <div className="kpi-val">{openBidCount}</div>
            <div className="kpi-sub">{"\u2191"} new this week</div>
          </div>
          <div className="kpi" style={{ "--kc": "var(--green)" } as React.CSSProperties}>
            <span className="kpi-icon">{"\uD83D\uDCE5"}</span>
            <div className="kpi-lbl">Bids Received</div>
            <div className="kpi-val">{totalResponses}</div>
            <div className="kpi-sub">{responseRate}% response rate</div>
          </div>
          <div className="kpi" style={{ "--kc": "var(--cyan)" } as React.CSSProperties}>
            <span className="kpi-icon">{"\uD83D\uDCB0"}</span>
            <div className="kpi-lbl">Response Rate</div>
            <div className="kpi-val">
              {responseRate}
              <span style={{ fontSize: "1.1rem" }}>%</span>
            </div>
            <div className="kpi-sub">across all bids</div>
          </div>
        </div>

        <div className="dash-grid">
          <div className="scard">
            <div className="scard-head" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <h3>Active Projects &amp; Bid Requests</h3>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-outline btn-xs" onClick={expandAll} style={{ fontSize: "0.7rem" }}>
                  {"\u25BC"} Expand All
                </button>
                <button className="btn btn-outline btn-xs" onClick={collapseAll} style={{ fontSize: "0.7rem" }}>
                  {"\u25B6"} Collapse All
                </button>
              </div>
            </div>

            {projectGroups.length === 0 && unassignedBids.length === 0 && (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--muted)", fontSize: "0.88rem" }}>
                No projects or bids found. Create your first project to get started.
              </div>
            )}

            {projectGroups.map(({ project, bids: projBids }) => {
              const isOpen = openAccordions[project.id];
              const totalProjResponses = projBids.reduce((s, b) => s + (b.vendor_response_count ?? 0), 0);
              const tagClass = STATUS_TAG_CLASS[project.status] || "tag-draft";

              return (
                <div className="pacc-item" key={project.id}>
                  <div className="pacc-hdr" onClick={() => toggleAccordion(project.id)}>
                    <span className={`pacc-arrow${isOpen ? " open" : ""}`}>{"\u25B6"}</span>
                    <span>{"\uD83D\uDCC1"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--ink)" }}>
                        {project.name}
                      </div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                        {project.type && (
                          <span className="pacc-pill" style={{ background: "var(--blue-bg)", color: "var(--blue)", borderColor: "var(--blue-b)" }}>
                            {project.type}
                          </span>
                        )}
                        <span className="pacc-pill" style={{ background: "var(--gold-bg)", color: "var(--gold)", borderColor: "var(--gold-b)" }}>
                          {projBids.length} bid{projBids.length !== 1 ? "s" : ""}
                        </span>
                        <span className="pacc-pill" style={{ background: "var(--green-bg)", color: "var(--green)", borderColor: "var(--green-b)" }}>
                          {totalProjResponses} received
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <div className="pbar" style={{ width: "60px" }}>
                        <div
                          className="pbar-fill"
                          style={{
                            width: `${projBids.length > 0 ? Math.min(100, (totalProjResponses / (projBids.length * 5)) * 100) : 0}%`,
                            background: "var(--gold)",
                          }}
                        ></div>
                      </div>
                      <span className={`tag ${tagClass}`} style={{ flexShrink: 0 }}>{project.status}</span>
                    </div>
                  </div>
                  <div className={`pacc-body${isOpen ? " open" : ""}`}>
                    {projBids.length === 0 ? (
                      <div style={{ padding: "16px 28px", color: "var(--muted)", fontSize: "0.82rem" }}>
                        No bid requests in this project yet.{" "}
                        <Link href={`/customer/create?project=${project.id}`} style={{ color: "var(--gold)", fontWeight: 600 }}>
                          Add one
                        </Link>
                      </div>
                    ) : (
                      <table className="proj-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ paddingLeft: "28px" }}>Bid Request</th>
                            <th>Status</th>
                            <th>Bids</th>
                            <th>Deadline</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {projBids.map((bid) => {
                            const respCount = bid.vendor_response_count ?? 0;
                            const bidTagClass = STATUS_TAG_CLASS[bid.status] || "tag-draft";
                            return (
                              <tr key={bid.id}>
                                <td>
                                  <div className="pname" style={{ paddingLeft: "16px" }}>
                                    {"\u21B3"} {bid.title}
                                  </div>
                                  <div className="psub" style={{ paddingLeft: "16px" }}>
                                    {bid.description ? bid.description.substring(0, 40) : "No description"}
                                  </div>
                                </td>
                                <td>
                                  <span className={`tag ${bidTagClass}`}>{bid.status}</span>
                                </td>
                                <td>
                                  <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{respCount}</div>
                                  <div className="pbar">
                                    <div
                                      className="pbar-fill"
                                      style={{
                                        width: `${Math.min(100, respCount * 20)}%`,
                                        background: "var(--gold)",
                                      }}
                                    ></div>
                                  </div>
                                </td>
                                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                                  {bid.deadline ? new Date(bid.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014"}
                                </td>
                                <td>
                                  <Link href={`/customer/${bid.id}`} className="btn btn-gold btn-xs">
                                    Compare {"\u2192"}
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unassigned Bids */}
            {unassignedBids.length > 0 && (
              <div className="pacc-item">
                <div className="pacc-hdr" onClick={() => toggleAccordion("__unassigned")}>
                  <span className={`pacc-arrow${openAccordions["__unassigned"] ? " open" : ""}`}>{"\u25B6"}</span>
                  <span>{"\uD83D\uDCC2"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--ink)" }}>
                      Unassigned Bids
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                      <span className="pacc-pill" style={{ background: "var(--gold-bg)", color: "var(--gold)", borderColor: "var(--gold-b)" }}>
                        {unassignedBids.length} bid{unassignedBids.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <span className="tag tag-draft" style={{ flexShrink: 0 }}>Unassigned</span>
                </div>
                <div className={`pacc-body${openAccordions["__unassigned"] ? " open" : ""}`}>
                  <table className="proj-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: "28px" }}>Bid Request</th>
                        <th>Status</th>
                        <th>Bids</th>
                        <th>Deadline</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedBids.map((bid) => {
                        const respCount = bid.vendor_response_count ?? 0;
                        const bidTagClass = STATUS_TAG_CLASS[bid.status] || "tag-draft";
                        return (
                          <tr key={bid.id}>
                            <td>
                              <div className="pname" style={{ paddingLeft: "16px" }}>
                                {"\u21B3"} {bid.title}
                              </div>
                              <div className="psub" style={{ paddingLeft: "16px" }}>
                                {bid.description ? bid.description.substring(0, 40) : "No description"}
                              </div>
                            </td>
                            <td>
                              <span className={`tag ${bidTagClass}`}>{bid.status}</span>
                            </td>
                            <td>
                              <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{respCount}</div>
                              <div className="pbar">
                                <div
                                  className="pbar-fill"
                                  style={{
                                    width: `${Math.min(100, respCount * 20)}%`,
                                    background: "var(--gold)",
                                  }}
                                ></div>
                              </div>
                            </td>
                            <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                              {bid.deadline ? new Date(bid.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014"}
                            </td>
                            <td>
                              <Link href={`/customer/${bid.id}`} className="btn btn-gold btn-xs">
                                Compare {"\u2192"}
                              </Link>
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

          {/* Activity Feed */}
          <div className="scard">
            <div className="scard-head">
              <h3>Activity Feed</h3>
            </div>
            {activityFeed.map((item, i) => (
              <div className="act" key={i}>
                <div className="act-ico" style={{ background: item.bg, color: item.color }}>
                  {item.icon}
                </div>
                <div>
                  <div className="act-t" dangerouslySetInnerHTML={{ __html: item.text }} />
                  <div className="act-time">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
