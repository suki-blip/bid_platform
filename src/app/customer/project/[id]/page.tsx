"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface ProjectBid {
  id: string;
  title: string;
  status: string;
  deadline: string;
  vendor_response_count: number;
}
interface ProjectFile {
  id: string;
  filename: string;
  uploaded_at: string;
}
interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
}
interface ProjectCategory {
  id: string;
  category_id: string;
  name: string;
  grp: string;
}
interface TradeCategory {
  id: string;
  name: string;
  grp: string;
}
interface ProjectData {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
  description: string | null;
  status: string;
  created_at: string;
  bids: ProjectBid[];
  files: ProjectFile[];
  team: TeamMember[];
  categories: ProjectCategory[];
}

function showToast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(() => { el.style.opacity = "0"; }, 2200);
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editType, setEditType] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Team
  const [teamName, setTeamName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState("member");

  // Categories
  const [allCategories, setAllCategories] = useState<TradeCategory[]>([]);
  const [selectedCatId, setSelectedCatId] = useState("");

  // Modals
  const [showClone, setShowClone] = useState(false);
  const [cloneIncludeBids, setCloneIncludeBids] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [showStop, setShowStop] = useState(false);
  const [stopNotify, setStopNotify] = useState<"all" | "none">("none");
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    loadProject();
    fetch("/api/trade-categories").then(r => r.json()).then(setAllCategories).catch(() => {});
  }, [id]);

  async function loadProject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProject(data);
      setEditName(data.name);
      setEditAddress(data.address || "");
      setEditType(data.type || "");
      setEditDesc(data.description || "");
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, address: editAddress || null, type: editType || null, description: editDesc || null }),
      });
      if (res.ok) {
        await loadProject();
        setEditing(false);
        showToast("Project updated!");
      }
    } catch { showToast("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("files", f));
      const res = await fetch(`/api/projects/${id}/files`, { method: "POST", body: formData });
      if (res.ok) {
        await loadProject();
        showToast("Files uploaded!");
      }
    } catch { showToast("Upload failed"); }
    finally { setUploading(false); }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await fetch(`/api/projects/${id}/files/${fileId}`, { method: "DELETE" });
      await loadProject();
      showToast("File deleted");
    } catch { showToast("Failed to delete file"); }
  }

  async function handleAddTeamMember() {
    if (!teamName || !teamEmail) return;
    try {
      const res = await fetch(`/api/projects/${id}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName, email: teamEmail, role: teamRole }),
      });
      if (res.ok) {
        await loadProject();
        setTeamName(""); setTeamEmail(""); setTeamRole("member");
        showToast("Team member added!");
      }
    } catch { showToast("Failed to add member"); }
  }

  async function handleRemoveTeamMember(memberId: string) {
    try {
      await fetch(`/api/projects/${id}/team`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });
      await loadProject();
    } catch { showToast("Failed to remove member"); }
  }

  async function handleAddCategory() {
    if (!selectedCatId) return;
    try {
      const res = await fetch(`/api/projects/${id}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: [selectedCatId] }),
      });
      if (res.ok) { await loadProject(); setSelectedCatId(""); }
    } catch { showToast("Failed to add category"); }
  }

  async function handleRemoveCategory(catId: string) {
    try {
      await fetch(`/api/projects/${id}/categories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: catId }),
      });
      await loadProject();
    } catch { showToast("Failed to remove category"); }
  }

  async function handleClone() {
    setCloning(true);
    try {
      const res = await fetch(`/api/projects/${id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_bids: cloneIncludeBids }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast("Project cloned!");
        setShowClone(false);
        router.push(`/customer/project/${data.id}`);
      }
    } catch { showToast("Failed to clone"); }
    finally { setCloning(false); }
  }

  async function handleStop() {
    setStopping(true);
    try {
      const res = await fetch(`/api/projects/${id}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_vendors: stopNotify }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Project stopped. ${data.closed_bids} bids closed, ${data.notified_vendors} vendors notified.`);
        setShowStop(false);
        await loadProject();
      }
    } catch { showToast("Failed to stop project"); }
    finally { setStopping(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 11px", background: "var(--bg)",
    border: "1.5px solid var(--border)", borderRadius: 7,
    color: "var(--ink)", fontSize: "0.84rem", outline: "none",
    fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.72rem", fontWeight: 700,
    color: "var(--muted)", textTransform: "uppercase" as const,
    letterSpacing: "0.05em", marginBottom: 5,
  };

  if (loading) return (
    <div className="page on" style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (!project) return (
    <div className="page on">
      <div className="scroll">
        <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-b)", borderRadius: 8, padding: 16, color: "var(--red)" }}>
          Project not found
        </div>
        <Link href="/customer" style={{ color: "var(--gold)", display: "inline-block", marginTop: 16 }}>← Back to Dashboard</Link>
      </div>
    </div>
  );

  const statusColor = project.status === "active" ? "var(--green)" : project.status === "draft" ? "var(--blue)" : "var(--red)";
  const availableCats = allCategories.filter(c => !project.categories.some(pc => pc.category_id === c.id));

  return (
    <div className="page on">
      {/* Top action strip */}
      <div className="fstrip">
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          <Link href="/customer" style={{ color: "var(--gold)", textDecoration: "none", fontWeight: 600 }}>Dashboard</Link>
          <span style={{ color: "var(--border2)", margin: "0 6px" }}>{"\u203A"}</span>
          <strong style={{ color: "var(--ink)" }}>{project.name}</strong>
        </span>
        <div className="fright">
          <button className="btn btn-outline btn-xs" onClick={() => setShowClone(true)}>📋 Clone</button>
          {project.status !== "closed" && (
            <button className="btn btn-red btn-xs" onClick={() => setShowStop(true)}>⏹ Stop Project</button>
          )}
        </div>
      </div>

      <div className="scroll">
        {/* KPI ROW */}
        <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div className="kpi" style={{ "--kc": "var(--gold)" } as React.CSSProperties}>
            <div className="kpi-lbl">Bids</div>
            <div className="kpi-val">{project.bids.length}</div>
          </div>
          <div className="kpi" style={{ "--kc": "var(--blue)" } as React.CSSProperties}>
            <div className="kpi-lbl">Files</div>
            <div className="kpi-val">{project.files.length}</div>
          </div>
          <div className="kpi" style={{ "--kc": "var(--purple)" } as React.CSSProperties}>
            <div className="kpi-lbl">Team</div>
            <div className="kpi-val">{project.team.length}</div>
          </div>
          <div className="kpi" style={{ "--kc": statusColor } as React.CSSProperties}>
            <div className="kpi-lbl">Status</div>
            <div className="kpi-val" style={{ fontSize: "1.1rem", textTransform: "capitalize" }}>{project.status}</div>
          </div>
        </div>

        {/* PROJECT INFO */}
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-head">
            <h3>📁 Project Details</h3>
            {!editing ? (
              <button className="btn btn-outline btn-xs" onClick={() => setEditing(true)}>✏️ Edit</button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-gold btn-xs" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                <button className="btn btn-outline btn-xs" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            )}
          </div>
          <div className="scard-body" style={{ padding: 20 }}>
            {!editing ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={labelStyle}>Project Name</div>
                  <div style={{ fontWeight: 700, color: "var(--ink)" }}>{project.name}</div>
                </div>
                <div>
                  <div style={labelStyle}>Type</div>
                  <div style={{ color: "var(--ink2)" }}>{project.type || "—"}</div>
                </div>
                <div>
                  <div style={labelStyle}>Address</div>
                  <div style={{ color: "var(--ink2)" }}>{project.address || "—"}</div>
                </div>
                <div>
                  <div style={labelStyle}>Created</div>
                  <div style={{ color: "var(--ink2)" }}>{new Date(project.created_at).toLocaleDateString()}</div>
                </div>
                {project.description && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={labelStyle}>Description</div>
                    <div style={{ color: "var(--ink2)", fontSize: "0.88rem", lineHeight: 1.6 }}>{project.description}</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Project Name</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={editType} onChange={e => setEditType(e.target.value)} style={inputStyle}>
                    <option value="">Select type...</option>
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Mixed-Use">Mixed-Use</option>
                    <option value="Renovation">Renovation</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Address</label>
                  <input value={editAddress} onChange={e => setEditAddress(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Description</label>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: "vertical" } as React.CSSProperties} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BID REQUESTS */}
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-head">
            <h3>📋 Bid Requests</h3>
            <span className="tag" style={{ background: "var(--gold-bg)", color: "var(--gold)", border: "1px solid var(--gold-b)" }}>{project.bids.length}</span>
            <div style={{ marginLeft: "auto" }}>
              <Link href={`/customer/create?project=${id}`} className="btn btn-gold btn-xs" style={{ textDecoration: "none" }}>+ Add Bid</Link>
            </div>
          </div>
          <div className="scard-body" style={{ padding: 0 }}>
            {project.bids.length === 0 ? (
              <div className="empty" style={{ padding: 32 }}>
                <div className="empty-icon">📭</div>
                <div className="empty-txt">No bids yet</div>
                <div className="empty-sub">Create a bid request for this project</div>
              </div>
            ) : (
              <table className="btable" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Responses</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {project.bids.map(bid => (
                    <tr key={bid.id} className="hov">
                      <td style={{ fontWeight: 600 }}>{bid.title}</td>
                      <td>
                        <span className={`tag ${bid.status === "active" ? "t-active" : bid.status === "awarded" ? "t-won" : bid.status === "draft" ? "t-draft" : "t-expired"}`}>
                          {bid.status}
                        </span>
                      </td>
                      <td>{bid.vendor_response_count}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                        {new Date(bid.deadline).toLocaleDateString()}
                      </td>
                      <td>
                        <Link href={`/customer/${bid.id}`} className="btn btn-outline btn-xs" style={{ textDecoration: "none" }}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* PROJECT FILES */}
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-head">
            <h3>📎 Project Files</h3>
            <span className="tag" style={{ background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-b)" }}>{project.files.length}</span>
          </div>
          <div className="scard-body" style={{ padding: 16 }}>
            {/* Upload zone */}
            <div
              style={{
                border: "2px dashed var(--border2)", borderRadius: 10, padding: "20px",
                textAlign: "center", marginBottom: project.files.length > 0 ? 16 : 0,
                cursor: "pointer", background: "var(--bg)", transition: "border-color 0.2s",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--gold)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border2)"; handleFileUpload(e.dataTransfer.files); }}
            >
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
              <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>📤</div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--ink2)" }}>
                {uploading ? "Uploading..." : "Drop files here or click to browse"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>PDF, DWG, images, specs</div>
            </div>

            {/* File list */}
            {project.files.map(file => (
              <div key={file.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: "1.1rem" }}>📄</span>
                <a
                  href={`/api/projects/${id}/files/${file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, fontSize: "0.84rem", fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}
                >
                  {file.filename}
                </a>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {new Date(file.uploaded_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDeleteFile(file.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: "0.8rem", fontWeight: 700 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* TRADE CATEGORIES */}
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-head">
            <h3>🏗️ Trade Categories</h3>
          </div>
          <div className="scard-body" style={{ padding: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: project.categories.length > 0 ? 12 : 0 }}>
              {project.categories.map(cat => (
                <span key={cat.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 100, fontSize: "0.76rem", fontWeight: 600,
                  background: "var(--gold-bg)", color: "var(--gold)", border: "1px solid var(--gold-b)",
                }}>
                  {cat.name}
                  <button
                    onClick={() => handleRemoveCategory(cat.category_id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gold)", fontWeight: 800, fontSize: "0.72rem", marginLeft: 2 }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {availableCats.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={selectedCatId} onChange={e => setSelectedCatId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">Add a trade category...</option>
                  {Object.entries(
                    availableCats.reduce<Record<string, TradeCategory[]>>((acc, c) => {
                      (acc[c.grp] = acc[c.grp] || []).push(c);
                      return acc;
                    }, {})
                  ).map(([grp, cats]) => (
                    <optgroup key={grp} label={grp}>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button className="btn btn-gold btn-xs" onClick={handleAddCategory} disabled={!selectedCatId}>Add</button>
              </div>
            )}
          </div>
        </div>

        {/* TEAM & NOTIFICATIONS */}
        <div className="scard" style={{ marginBottom: 16 }}>
          <div className="scard-head">
            <h3>👥 Team & Notifications</h3>
            <span className="tag" style={{ background: "var(--purple-bg)", color: "var(--purple)", border: "1px solid var(--purple-b)" }}>{project.team.length}</span>
          </div>
          <div className="scard-body" style={{ padding: 16 }}>
            {/* Team list */}
            {project.team.map(member => (
              <div key={member.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", background: "var(--purple-bg)",
                  border: "2px solid var(--purple-b)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: "0.72rem", color: "var(--purple)", flexShrink: 0,
                }}>
                  {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--ink)" }}>{member.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{member.email}</div>
                </div>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: "var(--faint)", letterSpacing: "0.05em" }}>
                  {member.role}
                </span>
                <button
                  onClick={() => handleRemoveTeamMember(member.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: "0.8rem", fontWeight: 700 }}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Add member form */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, marginTop: 12, alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input value={teamName} onChange={e => setTeamName(e.target.value)} style={inputStyle} placeholder="John Doe" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={teamEmail} onChange={e => setTeamEmail(e.target.value)} style={inputStyle} placeholder="john@company.com" type="email" />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <select value={teamRole} onChange={e => setTeamRole(e.target.value)} style={{ ...inputStyle, width: 120 }}>
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <button className="btn btn-gold btn-xs" onClick={handleAddTeamMember} disabled={!teamName || !teamEmail} style={{ marginBottom: 1 }}>
                + Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CLONE MODAL */}
      {showClone && (
        <div className="modal-overlay open" onClick={() => setShowClone(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 16 }}>📋 Clone Project</h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink2)", marginBottom: 16 }}>
              This will create a copy of <strong>{project.name}</strong> including files, team members, and categories.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", color: "var(--ink)", cursor: "pointer", marginBottom: 20 }}>
              <input type="checkbox" checked={cloneIncludeBids} onChange={e => setCloneIncludeBids(e.target.checked)} />
              Include bid requests (without vendor responses)
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowClone(false)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handleClone} disabled={cloning}>
                {cloning ? "Cloning..." : "Clone Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOP MODAL */}
      {showStop && (
        <div className="modal-overlay open" onClick={() => setShowStop(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 16, color: "var(--red)" }}>⏹ Stop Project</h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink2)", marginBottom: 16 }}>
              This will close the project and all its active bids. This action cannot be easily undone.
            </p>
            <div style={{ marginBottom: 20 }}>
              <div style={labelStyle}>Vendor Notifications</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", color: "var(--ink)", cursor: "pointer", marginBottom: 6 }}>
                <input type="radio" name="notify" checked={stopNotify === "none"} onChange={() => setStopNotify("none")} />
                Don&apos;t notify vendors
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", color: "var(--ink)", cursor: "pointer" }}>
                <input type="radio" name="notify" checked={stopNotify === "all"} onChange={() => setStopNotify("all")} />
                Notify all vendors
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowStop(false)}>Cancel</button>
              <button className="btn btn-red btn-sm" onClick={handleStop} disabled={stopping}>
                {stopping ? "Stopping..." : "Stop Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
