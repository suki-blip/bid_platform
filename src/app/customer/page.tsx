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

const TYPE_ICONS: Record<string, string> = {
  Residential: "🏠",
  Commercial: "🏢",
  "Mixed-Use": "🏗️",
  Renovation: "🔨",
};

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

  const menuBtnStyle: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left" as const, padding: "8px 14px",
    fontSize: "0.8rem", fontWeight: 600, background: "none", border: "none",
    cursor: "pointer", color: "var(--ink)", fontFamily: "'Plus Jakarta Sans', sans-serif",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
    letterSpacing: "0.04em", marginBottom: 6,
  };

  const statusColor = (s: string) =>
    s === "active" ? { bg: "var(--gold-bg)", c: "var(--gold)", bc: "var(--gold-b)" }
    : s === "paused" ? { bg: "#fef3c7", c: "#92400e", bc: "#fde68a" }
    : { bg: "#f3f4f6", c: "var(--muted)", bc: "#e5e7eb" };

  return (
    <div className="page on">
      {/* Click-away for menu */}
      {menuProjectId && <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setMenuProjectId(null)} />}

      <div className="scroll">
        {/* Project Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {projects.map((project) => {
            const projBids = bids.filter(b => b.project_id === project.id);
            const closed = projBids.filter(b => b.status === "closed" || b.status === "awarded").length;
            const waiting = projBids.filter(b => b.status === "active").length;
            const draft = projBids.filter(b => b.status === "draft").length;
            const overdue = projBids.filter(b => b.status === "active" && new Date(b.deadline) < new Date()).length;
            const icon = TYPE_ICONS[project.type] || "📁";
            const sc = statusColor(project.status);

            return (
              <div key={project.id} style={{ position: "relative" }}>
                <Link
                  href={`/customer/project/${project.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div style={{
                    background: project.status === "paused" ? "#fffbeb" : "var(--card)",
                    border: `1.5px solid ${project.status === "paused" ? "#fde68a" : "var(--border)"}`,
                    borderRadius: 12, padding: "18px 20px", cursor: "pointer", transition: "all 0.18s",
                    opacity: project.status === "paused" ? 0.8 : 1,
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = "var(--gold-b)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = project.status === "paused" ? "#fde68a" : "var(--border)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
                  >
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14, paddingRight: 28 }}>
                      {project.image_url ? (
                        <img
                          src={project.image_url}
                          alt=""
                          style={{
                            width: 40, height: 40, borderRadius: 10, objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, background: "var(--gold-bg)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "1.2rem", flexShrink: 0,
                        }}>
                          {icon}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                          fontSize: "0.92rem", color: "var(--ink)", lineHeight: 1.2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {project.name}
                        </div>
                        {project.address && (
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 3 }}>
                            {project.address}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
                        padding: "2px 8px", borderRadius: 100, flexShrink: 0,
                        background: sc.bg, color: sc.c, border: `1px solid ${sc.bc}`,
                      }}>
                        {project.status}
                      </span>
                    </div>

                    {/* Bid Stats */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
                      padding: "10px 0", borderTop: "1px solid var(--border)",
                    }}>
                      <div>
                        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--ink)" }}>{closed}</div>
                        <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Closed</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--gold)" }}>{waiting}</div>
                        <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Waiting</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1.1rem", color: "var(--muted)" }}>{draft}</div>
                        <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Not Sent</div>
                      </div>
                    </div>

                    {/* Category + Overdue info */}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {project.category_count > 0 && (
                        <div style={{
                          fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)",
                          padding: "3px 8px", background: "var(--bg)",
                          borderRadius: 6,
                        }}>
                          {project.category_count} categories
                        </div>
                      )}
                      {overdue > 0 && (
                        <div style={{
                          fontSize: "0.72rem", fontWeight: 700, color: "#92400e",
                          padding: "3px 8px", background: "#fef3c7",
                          borderRadius: 6,
                        }}>
                          {overdue} overdue
                        </div>
                      )}
                    </div>
                  </div>
                </Link>

                {/* 3-dot menu button */}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuProjectId(menuProjectId === project.id ? null : project.id); }}
                  style={{
                    position: "absolute", top: 14, right: 14, background: "none", border: "none",
                    cursor: "pointer", fontSize: "1.1rem", color: "var(--muted)", padding: "2px 6px",
                    borderRadius: 6, zIndex: 91,
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = "var(--gold-bg)"; }}
                  onMouseOut={e => { e.currentTarget.style.background = "none"; }}
                >
                  ⋯
                </button>

                {/* Dropdown menu */}
                {menuProjectId === project.id && (
                  <div style={{
                    position: "absolute", top: 38, right: 14, background: "var(--card)",
                    border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 100, minWidth: 180, overflow: "hidden",
                  }}>
                    <button style={menuBtnStyle} onMouseOver={e => e.currentTarget.style.background = "var(--gold-bg)"} onMouseOut={e => e.currentTarget.style.background = "none"}
                      onClick={() => { setMenuProjectId(null); setCloneProjectId(project.id); setCloneIncludeBids(false); }}
                    >📋 Clone Project</button>

                    {project.status === "active" && (
                      <button style={menuBtnStyle} onMouseOver={e => e.currentTarget.style.background = "var(--gold-bg)"} onMouseOut={e => e.currentTarget.style.background = "none"}
                        onClick={async () => {
                          setMenuProjectId(null);
                          const vendors = await loadProjectVendors(project.id);
                          setPauseVendors(vendors);
                          setPauseSelectedVendors(new Set(vendors.map(v => v.id)));
                          setPauseNotify("all");
                          setPauseMessage("Plans are being updated. Bid submissions are paused until further notice.");
                          setPauseProject(project);
                        }}
                      >⏸ Pause Project</button>
                    )}

                    {project.status === "paused" && (
                      <button style={menuBtnStyle} onMouseOver={e => e.currentTarget.style.background = "var(--gold-bg)"} onMouseOut={e => e.currentTarget.style.background = "none"}
                        onClick={async () => {
                          setMenuProjectId(null);
                          const vendors = await loadProjectVendors(project.id);
                          setResumeVendors(vendors);
                          setResumeSelectedVendors(new Set(vendors.map(v => v.id)));
                          setResumeNotify("all");
                          setResumeMessage("The project is back active. Please submit your bids.");
                          setResumeProject(project);
                        }}
                      >▶ Resume Project</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Project Card */}
          <Link href="/customer/new-project" style={{ textDecoration: "none" }}>
            <div style={{
              border: "2px dashed var(--gold-b)", borderRadius: 12,
              padding: "18px 20px", cursor: "pointer", transition: "all 0.18s",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 160, gap: 6,
              background: "var(--gold-bg)", color: "var(--gold)",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "#fef3c7"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "var(--gold-b)"; e.currentTarget.style.background = "var(--gold-bg)"; }}
            >
              <span style={{ fontSize: "1.5rem" }}>+</span>
              <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>New Project</span>
            </div>
          </Link>
        </div>
      </div>

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
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", marginBottom: 14 }}>
              ⏸ Pause Project — {pauseProject.name}
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
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", marginBottom: 14 }}>
              ▶ Resume Project — {resumeProject.name}
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
