"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

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
  category_count: number;
  image_url?: string | null;
}

interface VendorInfo {
  id: string;
  name: string;
  email: string;
}

function ProjectTypeIcon({ type }: { type: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none" as const, stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "Residential":
      return (<svg {...common}><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>);
    case "Commercial":
      return (<svg {...common}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg>);
    case "Mixed-Use":
      return (<svg {...common}><path d="M3 21V11l5-4 5 4v10"/><path d="M13 21V8l4-3 4 3v13"/><path d="M3 21h18"/></svg>);
    case "Renovation":
      return (<svg {...common}><path d="M14 7l3-3 4 4-3 3"/><path d="M5 22l3-3 4 4-3 3"/><path d="M9 18l-3-3 8-8 3 3-8 8z"/></svg>);
    default:
      return (<svg {...common}><path d="M3 7l3-4h12l3 4"/><path d="M3 7v14h18V7"/><path d="M9 21V12h6v9"/></svg>);
  }
}

export default function CustomerDashboard() {
  const router = useRouter();
  const [bids, setBids] = useState<Bid[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [cloneProjectId, setCloneProjectId] = useState<string | null>(null);
  const [cloneIncludeBids, setCloneIncludeBids] = useState(false);
  const [cloning, setCloning] = useState(false);

  const [pauseProject, setPauseProject] = useState<Project | null>(null);
  const [pauseNotify, setPauseNotify] = useState<"all" | "none" | "some">("all");
  const [pauseMessage, setPauseMessage] = useState("Plans are being updated. Bid submissions are paused until further notice.");
  const [pauseVendors, setPauseVendors] = useState<VendorInfo[]>([]);
  const [pauseSelectedVendors, setPauseSelectedVendors] = useState<Set<string>>(new Set());
  const [pausing, setPausing] = useState(false);

  const [resumeProject, setResumeProject] = useState<Project | null>(null);
  const [resumeNotify, setResumeNotify] = useState<"all" | "none" | "some">("all");
  const [resumeMessage, setResumeMessage] = useState("The project is back active. Please submit your bids.");
  const [resumeVendors, setResumeVendors] = useState<VendorInfo[]>([]);
  const [resumeSelectedVendors, setResumeSelectedVendors] = useState<Set<string>>(new Set());
  const [resuming, setResuming] = useState(false);

  // Context menu
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);

  // View mode (grid | list) — persisted to localStorage
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("bm.viewMode") : null;
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  function changeView(v: "grid" | "list") {
    setViewMode(v);
    try { localStorage.setItem("bm.viewMode", v); } catch {}
  }

  function loadData() {
    setLoading(true);
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
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function loadProjectVendors(projectId: string): Promise<VendorInfo[]> {
    try {
      const res = await fetch(`/api/projects/${projectId}/vendors`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  async function handleClone() {
    if (!cloneProjectId) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/projects/${cloneProjectId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_bids: cloneIncludeBids }),
      });
      if (res.ok) {
        const data = await res.json();
        setCloneProjectId(null);
        loadData();
        router.push(`/customer/project/${data.id}`);
      }
    } finally { setCloning(false); }
  }

  async function handlePause() {
    if (!pauseProject) return;
    setPausing(true);
    try {
      const vendorIds = pauseNotify === "all" ? "all" : pauseNotify === "none" ? "none" : Array.from(pauseSelectedVendors);
      await fetch(`/api/projects/${pauseProject.id}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_vendors: vendorIds, message: pauseMessage }),
      });
      setPauseProject(null);
      loadData();
    } finally { setPausing(false); }
  }

  async function handleResume() {
    if (!resumeProject) return;
    setResuming(true);
    try {
      const vendorIds = resumeNotify === "all" ? "all" : resumeNotify === "none" ? "none" : Array.from(resumeSelectedVendors);
      await fetch(`/api/projects/${resumeProject.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_vendors: vendorIds, message: resumeMessage }),
      });
      setResumeProject(null);
      loadData();
    } finally { setResuming(false); }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
        <div className="so-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px" }}>
        <div style={{ background: "var(--cone-orange-bg)", border: "1px solid var(--cone-orange-b)", borderLeft: "3px solid var(--cone-orange)", borderRadius: "var(--r-sm)", padding: "12px 16px", color: "var(--cone-orange)", fontSize: "0.85rem" }}>
          Error: {error}
        </div>
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Inter Tight', sans-serif",
    fontSize: "10px", fontWeight: 700, color: "var(--steel)", textTransform: "uppercase",
    letterSpacing: "0.10em", marginBottom: 8,
  };

  const stampVariant = (s: string) =>
    s === "active" ? "ok"
    : s === "paused" ? "notes"
    : "draft";

  const stampLabel = (s: string) => s.toUpperCase();

  const totalActive = projects.filter(p => p.status === "active").length;
  const totalPaused = projects.filter(p => p.status === "paused").length;
  const totalOverdueBids = bids.filter(b => b.status === "active" && new Date(b.deadline) < new Date()).length;
  const totalWaiting = bids.filter(b => b.status === "active").length;

  return (
    <div className="page on">
      {/* Click-away for menu */}
      {menuProjectId && <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setMenuProjectId(null)} />}

      {/* Page header */}
      <div className="so-page-head">
        <div>
          <div className="so-page-eyebrow">CONTROL DESK</div>
          <h1>Today on the Job</h1>
          <p>{projects.length} active project{projects.length !== 1 ? "s" : ""} · {totalWaiting} bid{totalWaiting !== 1 ? "s" : ""} waiting · {totalOverdueBids > 0 ? <span style={{ color: "var(--cone-orange)", fontWeight: 700 }}>{totalOverdueBids} overdue</span> : "all on schedule"}</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="stamp ok">{totalActive} ACTIVE</span>
            {totalPaused > 0 && <span className="stamp notes">{totalPaused} PAUSED</span>}
            {totalOverdueBids > 0 && <span className="stamp revise">{totalOverdueBids} OVERDUE</span>}
          </div>
          <div className="so-view-toggle" role="tablist" aria-label="View mode">
            <button
              type="button"
              className={viewMode === "grid" ? "on" : ""}
              onClick={() => changeView("grid")}
              role="tab"
              aria-selected={viewMode === "grid"}
              title="Card grid"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              Grid
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "on" : ""}
              onClick={() => changeView("list")}
              role="tab"
              aria-selected={viewMode === "list"}
              title="Ledger view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
              Ledger
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" && (
        <div className="so-project-list">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 280 }}>Project</th>
                <th className="stamp-col">Status</th>
                <th className="num">Closed</th>
                <th className="num">Waiting</th>
                <th className="num">Not Sent</th>
                <th className="num">Trades</th>
                <th className="num">Overdue</th>
                <th className="row-actions"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map(project => {
                const projBids = bids.filter(b => b.project_id === project.id);
                const closed = projBids.filter(b => b.status === "closed" || b.status === "awarded").length;
                const waiting = projBids.filter(b => b.status === "active").length;
                const draft = projBids.filter(b => b.status === "draft").length;
                const overdue = projBids.filter(b => b.status === "active" && new Date(b.deadline) < new Date()).length;
                return (
                  <tr
                    key={project.id}
                    className={`${project.status === "active" ? "is-active" : ""} ${project.status === "paused" ? "is-paused" : ""}`}
                    onClick={() => router.push(`/customer/project/${project.id}`)}
                  >
                    <td>
                      <div className="row-name">
                        {project.image_url ? (
                          <img src={project.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div className="row-icon"><ProjectTypeIcon type={project.type} /></div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div className="row-pname">{project.name}</div>
                          {project.address && <div className="row-paddr">{project.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="stamp-col">
                      <span className={`stamp ${stampVariant(project.status)}`}>{stampLabel(project.status)}</span>
                    </td>
                    <td className={`num ${closed > 0 ? "green" : "zero"}`}>{closed}</td>
                    <td className={`num ${waiting > 0 ? "amber" : "zero"}`}>{waiting}</td>
                    <td className={`num ${draft === 0 ? "zero" : ""}`}>{draft}</td>
                    <td className={`num ${project.category_count === 0 ? "zero" : ""}`}>{project.category_count}</td>
                    <td className="stamp-col">
                      {overdue > 0
                        ? <span className="stamp revise" style={{ fontSize: 9 }}>{overdue}</span>
                        : <span style={{ color: "var(--steel-soft)", fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>—</span>}
                    </td>
                    <td className="row-actions">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuProjectId(menuProjectId === project.id ? null : project.id); }}
                        className="so-menu-btn"
                        aria-label="Project options"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "32px 16px", color: "var(--steel)" }}>
                    No projects yet — <Link href="/customer/new-project" style={{ color: "var(--blueprint)", fontWeight: 600 }}>start your first one</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "grid" && (
      <div className="so-project-grid">
        {projects.map((project) => {
          const projBids = bids.filter(b => b.project_id === project.id);
          const closed = projBids.filter(b => b.status === "closed" || b.status === "awarded").length;
          const waiting = projBids.filter(b => b.status === "active").length;
          const draft = projBids.filter(b => b.status === "draft").length;
          const overdue = projBids.filter(b => b.status === "active" && new Date(b.deadline) < new Date()).length;

          return (
            <div key={project.id} style={{ position: "relative" }}>
              <Link
                href={`/customer/project/${project.id}`}
                className={`so-project-card${project.status === "active" ? " is-active" : ""}${project.status === "paused" ? " is-paused" : ""}`}
              >
                {/* Header */}
                <div className="so-project-card-head" style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingRight: 28 }}>
                  {project.image_url ? (
                    <img
                      src={project.image_url}
                      alt=""
                      style={{ width: 40, height: 40, borderRadius: "var(--r-sm)", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 40, height: 40, borderRadius: "var(--r-sm)",
                      background: "var(--paper-2)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--blueprint)", flexShrink: 0,
                    }}>
                      <ProjectTypeIcon type={project.type} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                      fontSize: "15px", color: "var(--cast-iron)", lineHeight: 1.25,
                      letterSpacing: "-0.01em",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {project.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--steel)", marginTop: 4, fontFamily: "'Inter Tight', sans-serif", minHeight: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.address || " "}
                    </div>
                  </div>
                  <span className={`stamp ${stampVariant(project.status)}`} style={{ flexShrink: 0 }}>
                    {stampLabel(project.status)}
                  </span>
                </div>

                {/* Spacer pushes ledger to bottom */}
                <div className="so-project-card-spacer" />

                {/* Ledger stats — always 3 columns, identical height */}
                <div className="so-project-card-ledger" style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  borderTop: "1px solid var(--rule)", paddingTop: 14,
                }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "20px", color: "var(--shed-green)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{closed}</div>
                    <div style={{ ...labelStyle, marginTop: 6, marginBottom: 0 }}>Closed</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "20px", color: "var(--high-vis)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{waiting}</div>
                    <div style={{ ...labelStyle, marginTop: 6, marginBottom: 0 }}>Waiting</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "20px", color: "var(--steel)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{draft}</div>
                    <div style={{ ...labelStyle, marginTop: 6, marginBottom: 0 }}>Not Sent</div>
                  </div>
                </div>

                {/* Footer — always present (reserves min-height for symmetry) */}
                <div className="so-project-card-foot">
                  {project.category_count > 0 && (
                    <div style={{
                      fontFamily: "'Inter Tight', sans-serif",
                      fontSize: "11px", fontWeight: 600, color: "var(--steel)",
                      padding: "3px 8px", background: "var(--paper-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 4, letterSpacing: "0.02em",
                    }}>
                      {project.category_count} {project.category_count === 1 ? "trade" : "trades"}
                    </div>
                  )}
                  {overdue > 0 && (
                    <span className="stamp revise" style={{ fontSize: 9 }}>
                      {overdue} OVERDUE
                    </span>
                  )}
                  {project.category_count === 0 && overdue === 0 && (
                    <span style={{
                      fontFamily: "'Inter Tight', sans-serif",
                      fontSize: "11px", color: "var(--steel-soft)",
                      letterSpacing: "0.04em",
                    }}>
                      No trade categories yet
                    </span>
                  )}
                </div>
              </Link>

              {/* 3-dot menu button */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuProjectId(menuProjectId === project.id ? null : project.id); }}
                className="so-menu-btn"
                style={{ position: "absolute", top: 14, right: 14, zIndex: 91 }}
                aria-label="Project options"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
                </svg>
              </button>

              {/* Dropdown menu */}
              {menuProjectId === project.id && (
                <div className="so-menu-popover">
                  <button className="so-menu-item"
                    onClick={() => { setMenuProjectId(null); setCloneProjectId(project.id); setCloneIncludeBids(false); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                    Clone Project
                  </button>

                  {project.status === "active" && (
                    <button className="so-menu-item"
                      onClick={async () => {
                        setMenuProjectId(null);
                        const vendors = await loadProjectVendors(project.id);
                        setPauseVendors(vendors);
                        setPauseSelectedVendors(new Set(vendors.map(v => v.id)));
                        setPauseNotify("all");
                        setPauseMessage("Plans are being updated. Bid submissions are paused until further notice.");
                        setPauseProject(project);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                      Pause Project
                    </button>
                  )}

                  {project.status === "paused" && (
                    <button className="so-menu-item"
                      onClick={async () => {
                        setMenuProjectId(null);
                        const vendors = await loadProjectVendors(project.id);
                        setResumeVendors(vendors);
                        setResumeSelectedVendors(new Set(vendors.map(v => v.id)));
                        setResumeNotify("all");
                        setResumeMessage("The project is back active. Please submit your bids.");
                        setResumeProject(project);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>
                      Resume Project
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Project Card */}
        <Link href="/customer/new-project" className="so-add-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span>New Project</span>
        </Link>
      </div>
      )}

      {/* MODALS — portaled to body to avoid overflow/layout issues */}
      {typeof document !== "undefined" && createPortal(<>
      {/* CLONE MODAL */}
      {cloneProjectId && (
        <div className="modal-overlay open" onClick={() => setCloneProjectId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", marginBottom: 14 }}>
              Clone Project
            </div>
            <div style={{ fontSize: "0.84rem", color: "var(--ink2)", marginBottom: 14 }}>
              This will create a copy of the project including team, categories, and files.
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", cursor: "pointer", marginBottom: 16 }}>
              <input type="checkbox" checked={cloneIncludeBids} onChange={e => setCloneIncludeBids(e.target.checked)} />
              Include bid forms (without vendor responses)
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setCloneProjectId(null)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handleClone} disabled={cloning}>
                {cloning ? "Cloning..." : "Clone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {pauseProject && (
        <div className="modal-overlay open" onClick={() => setPauseProject(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="stamp notes">PAUSE</span>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>
                {pauseProject.name}
              </div>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--ink2)", marginBottom: 14 }}>
              All active bids will be paused. Vendors won&apos;t be able to submit until resumed.
            </div>

            <div style={labelStyle}>Notify Vendors</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["all", "some", "none"] as const).map(opt => (
                <button key={opt} className={`btn btn-xs ${pauseNotify === opt ? "btn-gold" : "btn-outline"}`}
                  onClick={() => setPauseNotify(opt)}
                >
                  {opt === "all" ? "All" : opt === "some" ? "Select" : "None"}
                </button>
              ))}
            </div>

            {pauseNotify === "some" && (
              <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                {pauseVendors.map(v => (
                  <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", padding: "4px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={pauseSelectedVendors.has(v.id)}
                      onChange={() => {
                        setPauseSelectedVendors(prev => {
                          const next = new Set(prev);
                          next.has(v.id) ? next.delete(v.id) : next.add(v.id);
                          return next;
                        });
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{v.email}</span>
                  </label>
                ))}
                {pauseVendors.length === 0 && <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>No vendors found</div>}
              </div>
            )}

            {pauseNotify !== "none" && (
              <>
                <div style={labelStyle}>Message to Vendors</div>
                <textarea
                  value={pauseMessage}
                  onChange={e => setPauseMessage(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: "0.82rem",
                    border: "1.5px solid var(--border)", borderRadius: 8,
                    background: "var(--surface)", color: "var(--ink)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: 80,
                    resize: "vertical", marginBottom: 14, outline: "none",
                  }}
                />
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setPauseProject(null)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handlePause} disabled={pausing}>
                {pausing ? "Pausing..." : "Pause Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESUME MODAL */}
      {resumeProject && (
        <div className="modal-overlay open" onClick={() => setResumeProject(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="stamp ok">RESUME</span>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>
                {resumeProject.name}
              </div>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--ink2)", marginBottom: 14 }}>
              All paused bids will be reactivated. Vendors will be able to submit again.
            </div>

            <div style={labelStyle}>Notify Vendors</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["all", "some", "none"] as const).map(opt => (
                <button key={opt} className={`btn btn-xs ${resumeNotify === opt ? "btn-gold" : "btn-outline"}`}
                  onClick={() => setResumeNotify(opt)}
                >
                  {opt === "all" ? "All" : opt === "some" ? "Select" : "None"}
                </button>
              ))}
            </div>

            {resumeNotify === "some" && (
              <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                {resumeVendors.map(v => (
                  <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", padding: "4px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={resumeSelectedVendors.has(v.id)}
                      onChange={() => {
                        setResumeSelectedVendors(prev => {
                          const next = new Set(prev);
                          next.has(v.id) ? next.delete(v.id) : next.add(v.id);
                          return next;
                        });
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{v.email}</span>
                  </label>
                ))}
              </div>
            )}

            {resumeNotify !== "none" && (
              <>
                <div style={labelStyle}>Message to Vendors</div>
                <textarea
                  value={resumeMessage}
                  onChange={e => setResumeMessage(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: "0.82rem",
                    border: "1.5px solid var(--border)", borderRadius: 8,
                    background: "var(--surface)", color: "var(--ink)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: 80,
                    resize: "vertical", marginBottom: 14, outline: "none",
                  }}
                />
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setResumeProject(null)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handleResume} disabled={resuming}>
                {resuming ? "Resuming..." : "Resume Project"}
              </button>
            </div>
          </div>
        </div>
      )}
      </>, document.body)}
    </div>
  );
}
