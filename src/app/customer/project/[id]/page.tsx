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
  trade_category?: string;
  trade_category_id?: string;
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
interface TradeCategoryVendor {
  id: string;
  name: string;
  email: string;
}
interface TradeCategory {
  id: string;
  name: string;
  grp: string;
  vendors: TradeCategoryVendor[];
}
interface Preset {
  id: string;
  name: string;
  project_type: string | null;
  category_ids: string[];
  include_vendors: number;
  vendor_ids: string[];
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
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(12px)"; }, 2200);
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bids" | "team" | "files">("bids");

  // Team
  const [teamName, setTeamName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState("member");

  // Files
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // File links
  const [projectLinks, setProjectLinks] = useState<{ id: string; url: string; label: string }[]>([]);
  const [newProjLinkUrl, setNewProjLinkUrl] = useState("");
  const [newProjLinkLabel, setNewProjLinkLabel] = useState("");

  // Resend notification modal
  const [showResendModal, setShowResendModal] = useState(false);
  const [resendScope, setResendScope] = useState<"all" | "select">("all");
  const [resendSelectedBids, setResendSelectedBids] = useState<Set<string>>(new Set());
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);

  // Modals
  const [showStop, setShowStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [deletingCat, setDeletingCat] = useState<{ category_id: string; name: string; hasBids: boolean } | null>(null);
  const [removingCat, setRemovingCat] = useState(false);

  // Category management
  const [showCatPanel, setShowCatPanel] = useState(false);
  const [allCategories, setAllCategories] = useState<TradeCategory[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(new Set());
  const [includeVendors, setIncludeVendors] = useState(true);
  const [catSearch, setCatSearch] = useState("");
  const [addingCats, setAddingCats] = useState(false);

  // Presets
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetType, setPresetType] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => { loadProject(); }, [id]);

  async function loadProject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error();
      setProject(await res.json());
      // Load file links
      fetch(`/api/file-links?ref_type=project&ref_id=${id}`)
        .then(r => r.ok ? r.json() : [])
        .then(setProjectLinks)
        .catch(() => {});
    } catch { setProject(null); }
    finally { setLoading(false); }
  }

  async function loadCategories() {
    try {
      const [catRes, presetRes] = await Promise.all([
        fetch("/api/trade-categories"),
        fetch("/api/category-presets"),
      ]);
      if (catRes.ok) setAllCategories(await catRes.json());
      if (presetRes.ok) setPresets(await presetRes.json());
    } catch {}
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
        // Show resend modal if there are active bids
        const activeBids = project?.bids.filter(b => b.status === "active") || [];
        if (activeBids.length > 0) {
          setResendSelectedBids(new Set(activeBids.map(b => b.id)));
          setResendMessage("New files have been added to the project. Please review updated documents.");
          setShowResendModal(true);
        }
      }
    } catch { showToast("Upload failed"); }
    finally { setUploading(false); }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await fetch(`/api/projects/${id}/files/${fileId}`, { method: "DELETE" });
      await loadProject(); showToast("File deleted");
    } catch { showToast("Failed to delete"); }
  }

  function triggerResendModal() {
    const activeBids = project?.bids.filter(b => b.status === "active") || [];
    if (activeBids.length > 0) {
      setResendSelectedBids(new Set(activeBids.map(b => b.id)));
      setResendMessage("New files have been added to the project. Please review updated documents.");
      setShowResendModal(true);
    }
  }

  async function handleResendNotify() {
    if (resendSelectedBids.size === 0) return;
    setResending(true);
    try {
      for (const bidId of resendSelectedBids) {
        await fetch(`/api/bids/${bidId}/notify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_ids: "all",
            type: "files_updated",
            message: resendMessage || undefined,
          }),
        });
      }
      showToast("Vendors notified");
      setShowResendModal(false);
    } catch { showToast("Failed to notify"); }
    finally { setResending(false); }
  }

  async function handleAddTeamMember() {
    if (!teamName || !teamEmail) return;
    try {
      const res = await fetch(`/api/projects/${id}/team`, {
        method: "POST", headers: { "Content-Type": "application/json" },
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
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });
      await loadProject();
    } catch {}
  }

  async function handleStop() {
    setStopping(true);
    try {
      const res = await fetch(`/api/projects/${id}/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_vendors: "none" }),
      });
      if (res.ok) {
        showToast("Project paused");
        setShowStop(false);
        await loadProject();
      }
    } catch { showToast("Failed"); }
    finally { setStopping(false); }
  }

  function openCategoryPanel() {
    setShowCatPanel(true);
    setSelectedCatIds(new Set());
    setCatSearch("");
    loadCategories();
  }

  async function handleAddCategories() {
    if (selectedCatIds.size === 0) return;
    setAddingCats(true);
    try {
      const catIds = Array.from(selectedCatIds);
      const res = await fetch(`/api/projects/${id}/categories`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: catIds }),
      });
      if (res.ok) {
        // If include vendors, also invite vendors for these categories to existing bids
        // For now just add the categories
        await loadProject();
        setShowCatPanel(false);
        showToast(`${catIds.length} categories added`);
      }
    } catch { showToast("Failed to add categories"); }
    finally { setAddingCats(false); }
  }

  function confirmRemoveCategory(categoryId: string) {
    const cat = project?.categories.find(c => c.category_id === categoryId);
    if (!cat) return;
    const catBids = project?.bids.filter(b => b.trade_category_id === categoryId) || [];
    setDeletingCat({ category_id: categoryId, name: cat.name, hasBids: catBids.length > 0 });
  }

  async function handleRemoveCategory() {
    if (!deletingCat) return;
    setRemovingCat(true);
    try {
      // If has bids, delete them too
      if (deletingCat.hasBids) {
        const catBids = project?.bids.filter(b => b.trade_category_id === deletingCat.category_id) || [];
        for (const bid of catBids) {
          await fetch(`/api/bids/${bid.id}`, { method: "DELETE" });
        }
      }
      await fetch(`/api/projects/${id}/categories`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: deletingCat.category_id }),
      });
      await loadProject();
      setDeletingCat(null);
      showToast("Category removed");
    } catch { showToast("Failed to remove"); }
    finally { setRemovingCat(false); }
  }

  function applyPreset(preset: Preset) {
    setSelectedCatIds(new Set(preset.category_ids));
    setIncludeVendors(preset.include_vendors === 1);
    showToast(`Preset "${preset.name}" loaded`);
  }

  async function handleSavePreset() {
    if (!presetName || selectedCatIds.size === 0) return;
    setSavingPreset(true);
    try {
      // Collect vendor IDs from selected categories if includeVendors
      let vendorIds: string[] = [];
      if (includeVendors) {
        allCategories.forEach(cat => {
          if (selectedCatIds.has(cat.id)) {
            cat.vendors.forEach(v => { if (!vendorIds.includes(v.id)) vendorIds.push(v.id); });
          }
        });
      }
      const res = await fetch("/api/category-presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          project_type: presetType || null,
          category_ids: Array.from(selectedCatIds),
          include_vendors: includeVendors,
          vendor_ids: vendorIds,
        }),
      });
      if (res.ok) {
        const newPreset = await res.json();
        setPresets(prev => [...prev, newPreset]);
        setShowPresetSave(false);
        setPresetName("");
        setPresetType("");
        showToast("Preset saved!");
      }
    } catch { showToast("Failed to save preset"); }
    finally { setSavingPreset(false); }
  }

  async function handleDeletePreset(presetId: string) {
    try {
      await fetch("/api/category-presets", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: presetId }),
      });
      setPresets(prev => prev.filter(p => p.id !== presetId));
    } catch {}
  }

  function toggleCat(catId: string) {
    setSelectedCatIds(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }

  function selectAllInGroup(grp: string) {
    const groupCats = allCategories.filter(c => c.grp === grp);
    setSelectedCatIds(prev => {
      const next = new Set(prev);
      const allSelected = groupCats.every(c => next.has(c.id));
      groupCats.forEach(c => { if (allSelected) next.delete(c.id); else next.add(c.id); });
      return next;
    });
  }

  function selectAll() {
    if (selectedCatIds.size === filteredCategories.length) {
      setSelectedCatIds(new Set());
    } else {
      setSelectedCatIds(new Set(filteredCategories.map(c => c.id)));
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 11px", background: "var(--bg)",
    border: "1.5px solid var(--border)", borderRadius: 7,
    color: "var(--ink)", fontSize: "0.84rem", outline: "none",
    fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box",
  };

  if (loading) return (
    <div className="page on" style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (!project) return (
    <div className="page on"><div className="scroll">
      <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: 16, color: "#92400e" }}>Project not found</div>
      <Link href="/customer" style={{ color: "var(--gold)", display: "inline-block", marginTop: 16 }}>← Back</Link>
    </div></div>
  );

  // Filter categories for search
  const existingCatIds = new Set(project.categories.map(c => c.category_id));
  const availableCategories = allCategories.filter(c => !existingCatIds.has(c.id));
  const filteredCategories = catSearch
    ? availableCategories.filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()) || c.grp.toLowerCase().includes(catSearch.toLowerCase()))
    : availableCategories;
  const groupedFiltered: Record<string, TradeCategory[]> = {};
  filteredCategories.forEach(c => {
    if (!groupedFiltered[c.grp]) groupedFiltered[c.grp] = [];
    groupedFiltered[c.grp].push(c);
  });

  // Map bids to categories by trade_category_id
  const bidsByCatId: Record<string, ProjectBid[]> = {};
  project.bids.forEach(bid => {
    const catId = bid.trade_category_id || "__unassigned";
    if (!bidsByCatId[catId]) bidsByCatId[catId] = [];
    bidsByCatId[catId].push(bid);
  });

  // Build category rows: each project category becomes a row with its bid info
  const categoryRows = project.categories.map(cat => {
    const catBids = bidsByCatId[cat.category_id] || [];
    const activeBids = catBids.filter(b => b.status === "active");
    const closedBids = catBids.filter(b => b.status === "closed" || b.status === "awarded");
    const draftBids = catBids.filter(b => b.status === "draft");
    const overdueBids = catBids.filter(b => b.status === "active" && new Date(b.deadline) < new Date());
    const totalResponses = catBids.reduce((sum, b) => sum + b.vendor_response_count, 0);

    const pausedBids = catBids.filter(b => b.status === "paused");

    let status: "has_bids" | "waiting" | "not_sent" | "empty" | "paused" = "empty";
    if (pausedBids.length > 0 && activeBids.length === 0) status = "paused";
    else if (closedBids.length > 0 || (activeBids.length > 0 && totalResponses > 0)) status = "has_bids";
    else if (activeBids.length > 0) status = "waiting";
    else if (draftBids.length > 0) status = "not_sent";

    return { ...cat, bids: catBids, activeBids, closedBids, draftBids, overdueBids, pausedBids, totalResponses, status };
  });

  // Unassigned bids (bids without a trade_category_id or with a category not in this project)
  const projectCatIds = new Set(project.categories.map(c => c.category_id));
  const unassignedBids = project.bids.filter(b => {
    if (!b.trade_category_id) return true;
    return !projectCatIds.has(b.trade_category_id);
  });

  const tabs = [
    { key: "bids" as const, label: "Bids", count: project.categories.length },
    { key: "team" as const, label: "Team", count: project.team.length },
    { key: "files" as const, label: "Files", count: project.files.length + projectLinks.length },
  ];

  return (
    <div className="page on">
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Link href="/customer" style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.82rem" }}>←</Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--ink)" }}>
            {project.name}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
            {project.type || ""}{project.address ? ` · ${project.address}` : ""}
          </div>
          {/* Category summary stats */}
          {categoryRows.length > 0 && (() => {
            const closed = categoryRows.filter(r => r.closedBids.length > 0 && r.activeBids.length === 0).length;
            const active = categoryRows.filter(r => r.activeBids.length > 0 || (r.status === "has_bids" && r.closedBids.length === 0)).length;
            const notSent = categoryRows.filter(r => r.status === "not_sent" || r.status === "empty").length;
            const paused = categoryRows.filter(r => r.bids.some(b => b.status === "paused")).length;
            return (
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {closed > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gold)" }}>
                    {closed} Closed
                  </span>
                )}
                {active > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#16a34a" }}>
                    {active} Open
                  </span>
                )}
                {notSent > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)" }}>
                    {notSent} Not Sent
                  </span>
                )}
                {paused > 0 && (
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#92400e" }}>
                    {paused} Paused
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <Link href={`/customer/create?project=${id}`} className="btn btn-gold btn-xs" style={{ textDecoration: "none" }}>
          + Add Bid
        </Link>
        {project.status !== "closed" && (
          <button className="btn btn-outline btn-xs" onClick={() => setShowStop(true)}>
            Pause
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, padding: "0 20px", background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", border: "none", background: "none",
              fontSize: "0.82rem", fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "var(--gold)" : "var(--muted)",
              borderBottom: tab === t.key ? "2px solid var(--gold)" : "2px solid transparent",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: "0.68rem", fontWeight: 700,
              padding: "1px 6px", borderRadius: 100,
              background: tab === t.key ? "var(--gold-bg)" : "var(--bg)",
              color: tab === t.key ? "var(--gold)" : "var(--muted)",
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="scroll">
        {/* BIDS TAB */}
        {tab === "bids" && (
          <div>
            {/* Add categories button */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
            }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <button
                onClick={openCategoryPanel}
                style={{
                  fontSize: "0.74rem", fontWeight: 700, color: "var(--gold)",
                  background: "none", border: "none", cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                + Add Categories
              </button>
            </div>

            {/* Category rows */}
            {categoryRows.length === 0 && unassignedBids.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 4 }}>No categories yet</div>
                <button
                  onClick={openCategoryPanel}
                  style={{ color: "var(--gold)", fontWeight: 600, fontSize: "0.85rem", background: "none", border: "none", cursor: "pointer" }}
                >
                  Add categories to get started
                </button>
              </div>
            ) : (
              <>
                {/* Group category rows by grp */}
                {(() => {
                  const grouped: Record<string, typeof categoryRows> = {};
                  categoryRows.forEach(row => {
                    if (!grouped[row.grp]) grouped[row.grp] = [];
                    grouped[row.grp].push(row);
                  });
                  return Object.entries(grouped).map(([grp, rows]) => (
                    <div key={grp} style={{ marginBottom: 14 }}>
                      <div style={{
                        fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)",
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        marginBottom: 6, padding: "0 2px",
                      }}>
                        {grp}
                      </div>
                      {rows.map(row => {
                        const statusLabel =
                          row.status === "paused" ? "⏸ Paused" :
                          row.status === "has_bids" ? `${row.totalResponses} response${row.totalResponses !== 1 ? "s" : ""}` :
                          row.status === "waiting" ? "Waiting for bids" :
                          row.status === "not_sent" ? "Ready · Not sent" :
                          "No bid";
                        const statusColor =
                          row.status === "paused" ? "#92400e" :
                          row.status === "has_bids" ? "var(--gold)" :
                          row.status === "waiting" ? "var(--gold)" :
                          row.status === "not_sent" ? "var(--muted)" :
                          "var(--muted)";
                        const statusBg =
                          row.status === "paused" ? "#fef3c7" :
                          row.status === "has_bids" ? "var(--gold-bg)" :
                          row.status === "waiting" ? "var(--gold-bg)" :
                          "#f3f4f6";
                        const statusBorder =
                          row.status === "paused" ? "#fde68a" :
                          row.status === "has_bids" || row.status === "waiting" ? "var(--gold-b)" : "#e5e7eb";

                        // Always go to category detail page
                        const href = `/customer/project/${id}/category/${row.category_id}`;

                        return (
                          <Link key={row.id} href={href} style={{ textDecoration: "none", color: "inherit" }}>
                            <div
                              style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 14px", background: "var(--card)",
                                border: "1px solid var(--border)", borderRadius: 8,
                                marginBottom: 5, cursor: "pointer", transition: "all 0.15s",
                              }}
                              onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--gold-b)"; }}
                              onMouseOut={e => { e.currentTarget.style.background = "var(--card)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                            >
                              {/* Category name */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>
                                  {row.name}
                                </div>
                                {row.bids.length > 0 && (
                                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                                    {row.bids.length} bid{row.bids.length !== 1 ? "s" : ""}
                                    {row.overdueBids.length > 0 && (
                                      <span style={{ color: "#92400e", fontWeight: 700, marginLeft: 6 }}>
                                        {row.overdueBids.length} overdue
                                      </span>
                                    )}
                                    {row.closedBids.length > 0 && (
                                      <span style={{ marginLeft: 6 }}>
                                        {row.closedBids.length} closed
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Response count if has bids */}
                              {row.totalResponses > 0 && (
                                <div style={{ textAlign: "center", minWidth: 40 }}>
                                  <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--ink)" }}>
                                    {row.totalResponses}
                                  </div>
                                  <div style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase" }}>bids</div>
                                </div>
                              )}

                              {/* Status pill */}
                              <span style={{
                                fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
                                padding: "3px 10px", borderRadius: 100,
                                background: statusBg, color: statusColor,
                                border: `1px solid ${statusBorder}`,
                                whiteSpace: "nowrap",
                              }}>
                                {statusLabel}
                              </span>

                              {/* Remove button */}
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmRemoveCategory(row.category_id); }}
                                style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: "var(--muted)", fontSize: "0.7rem", padding: "2px",
                                  opacity: 0.5, transition: "opacity 0.15s",
                                }}
                                onMouseOver={e => { e.currentTarget.style.opacity = "1"; }}
                                onMouseOut={e => { e.currentTarget.style.opacity = "0.5"; }}
                                title="Remove category"
                              >
                                ✕
                              </button>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ));
                })()}

                {/* Unassigned bids */}
                {unassignedBids.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: "0.68rem", fontWeight: 800, color: "var(--muted)",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      marginBottom: 6, padding: "0 2px",
                    }}>
                      Uncategorized
                    </div>
                    {unassignedBids.map(bid => {
                      const isOverdue = bid.status === "active" && new Date(bid.deadline) < new Date();
                      return (
                        <Link key={bid.id} href={`/customer/${bid.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              padding: "12px 14px", background: "var(--card)",
                              border: "1px solid var(--border)", borderRadius: 8,
                              marginBottom: 5, cursor: "pointer", transition: "all 0.15s",
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = "var(--bg)"; }}
                            onMouseOut={e => { e.currentTarget.style.background = "var(--card)"; }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>{bid.title}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                                Deadline: {new Date(bid.deadline).toLocaleDateString()}
                                {isOverdue && <span style={{ color: "#92400e", fontWeight: 700, marginLeft: 6 }}>OVERDUE</span>}
                              </div>
                            </div>
                            {bid.vendor_response_count > 0 && (
                              <div style={{ textAlign: "center", minWidth: 40 }}>
                                <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--ink)" }}>{bid.vendor_response_count}</div>
                                <div style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase" }}>bids</div>
                              </div>
                            )}
                            <span style={{
                              fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase",
                              padding: "3px 10px", borderRadius: 100,
                              background: bid.status === "active" ? "var(--gold-bg)" : "#f3f4f6",
                              color: bid.status === "active" ? "var(--gold)" : "var(--muted)",
                              border: `1px solid ${bid.status === "active" ? "var(--gold-b)" : "#e5e7eb"}`,
                            }}>
                              {bid.status}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TEAM TAB */}
        {tab === "team" && (
          <div>
            {project.team.map(member => (
              <div key={member.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
                marginBottom: 6,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "var(--gold-bg)",
                  border: "2px solid var(--gold-b)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: "0.75rem", color: "var(--gold)", flexShrink: 0,
                }}>
                  {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--ink)" }}>{member.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{member.email}</div>
                </div>
                <span style={{
                  fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                  padding: "3px 8px", borderRadius: 100,
                  background: member.role === "manager" ? "var(--gold-bg)" : "var(--bg)",
                  color: member.role === "manager" ? "var(--gold)" : "var(--muted)",
                  border: `1px solid ${member.role === "manager" ? "var(--gold-b)" : "var(--border)"}`,
                }}>
                  {member.role}
                </span>
                <button
                  onClick={() => handleRemoveTeamMember(member.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}
                >
                  ✕
                </button>
              </div>
            ))}

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8,
              marginTop: 14, alignItems: "end",
            }}>
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Name</div>
                <input value={teamName} onChange={e => setTeamName(e.target.value)} style={inputStyle} placeholder="John Doe" />
              </div>
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</div>
                <input value={teamEmail} onChange={e => setTeamEmail(e.target.value)} style={inputStyle} placeholder="john@company.com" type="email" />
              </div>
              <select value={teamRole} onChange={e => setTeamRole(e.target.value)} style={{ ...inputStyle, width: 110 }}>
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn btn-gold btn-xs" onClick={handleAddTeamMember} disabled={!teamName || !teamEmail}>
                + Add
              </button>
            </div>
          </div>
        )}

        {/* FILES TAB */}
        {tab === "files" && (
          <div>
            <div
              style={{
                border: "2px dashed var(--border2)", borderRadius: 10, padding: "24px",
                textAlign: "center", marginBottom: 14, cursor: "pointer",
                background: "var(--bg)", transition: "border-color 0.2s",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--gold)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border2)"; handleFileUpload(e.dataTransfer.files); }}
            >
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => handleFileUpload(e.target.files)} />
              <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--ink2)" }}>
                {uploading ? "Uploading..." : "Drop files here or click to browse"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>PDF, DWG, images, specs</div>
            </div>

            {project.files.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: "0.82rem" }}>No files uploaded yet</div>
            )}

            {project.files.map(file => (
              <div key={file.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
                marginBottom: 6,
              }}>
                <a
                  href={`/api/projects/${id}/files/${file.id}`}
                  target="_blank" rel="noreferrer"
                  style={{ flex: 1, fontSize: "0.84rem", fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}
                >
                  {file.filename}
                </a>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {new Date(file.uploaded_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleDeleteFile(file.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* File Links */}
            <div style={{
              marginTop: 14, padding: "12px 14px", background: "var(--bg)",
              borderRadius: 8, border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                🔗 File Links
              </div>

              {projectLinks.map(link => (
                <div key={link.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: "0.78rem" }}>🔗</span>
                  <a href={link.url} target="_blank" rel="noreferrer" style={{
                    flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "var(--gold)",
                    textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {link.label || link.url}
                  </a>
                  <button
                    onClick={async () => {
                      await fetch("/api/file-links", {
                        method: "DELETE", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: link.id }),
                      });
                      setProjectLinks(prev => prev.filter(l => l.id !== link.id));
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.7rem" }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 6, marginTop: projectLinks.length > 0 ? 8 : 0 }}>
                <input
                  value={newProjLinkUrl}
                  onChange={e => setNewProjLinkUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  style={{
                    flex: 2, padding: "7px 10px", background: "var(--surface)",
                    border: "1.5px solid var(--border)", borderRadius: 7,
                    color: "var(--ink)", fontSize: "0.82rem", outline: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
                <input
                  value={newProjLinkLabel}
                  onChange={e => setNewProjLinkLabel(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === "Enter" && newProjLinkUrl.trim()) {
                      e.preventDefault();
                      const res = await fetch("/api/file-links", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ref_type: "project", ref_id: id, links: [{ url: newProjLinkUrl.trim(), label: newProjLinkLabel.trim() }] }),
                      });
                      if (res.ok) {
                        const created = await res.json();
                        setProjectLinks(prev => [...created, ...prev]);
                        setNewProjLinkUrl(""); setNewProjLinkLabel("");
                        showToast("Link added");
                        triggerResendModal();
                      }
                    }
                  }}
                  placeholder="Label (optional)"
                  style={{
                    flex: 1, padding: "7px 10px", background: "var(--surface)",
                    border: "1.5px solid var(--border)", borderRadius: 7,
                    color: "var(--ink)", fontSize: "0.82rem", outline: "none",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
                <button
                  className="btn btn-outline btn-xs"
                  onClick={async () => {
                    if (!newProjLinkUrl.trim()) return;
                    const res = await fetch("/api/file-links", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ref_type: "project", ref_id: id, links: [{ url: newProjLinkUrl.trim(), label: newProjLinkLabel.trim() }] }),
                    });
                    if (res.ok) {
                      const created = await res.json();
                      setProjectLinks(prev => [...created, ...prev]);
                      setNewProjLinkUrl(""); setNewProjLinkLabel("");
                      showToast("Link added");
                      triggerResendModal();
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RESEND NOTIFICATION MODAL */}
      {showResendModal && project && (
        <div className="modal-overlay open" onClick={() => setShowResendModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 6 }}>
              Notify Vendors?
            </h3>
            <p style={{ fontSize: "0.84rem", color: "var(--ink2)", marginBottom: 14 }}>
              New files were added. Would you like to notify vendors about the update?
            </p>

            {/* Scope selection */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.84rem", fontWeight: 600, marginBottom: 6 }}>
                <input type="radio" name="resendScope" checked={resendScope === "all"} onChange={() => { setResendScope("all"); setResendSelectedBids(new Set(project.bids.filter(b => b.status === "active").map(b => b.id))); }} style={{ accentColor: "var(--gold)" }} />
                All active bids
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.84rem", fontWeight: 600 }}>
                <input type="radio" name="resendScope" checked={resendScope === "select"} onChange={() => setResendScope("select")} style={{ accentColor: "var(--gold)" }} />
                Select specific bids
              </label>
            </div>

            {resendScope === "select" && (
              <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 12, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                {project.bids.filter(b => b.status === "active").map(b => (
                  <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                    <input
                      type="checkbox"
                      checked={resendSelectedBids.has(b.id)}
                      onChange={e => {
                        const next = new Set(resendSelectedBids);
                        if (e.target.checked) next.add(b.id);
                        else next.delete(b.id);
                        setResendSelectedBids(next);
                      }}
                      style={{ accentColor: "var(--gold)" }}
                    />
                    {b.title}
                  </label>
                ))}
                {project.bids.filter(b => b.status === "active").length === 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", padding: "8px 0" }}>No active bids</div>
                )}
              </div>
            )}

            {/* Optional message */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>
                Message to vendors (optional)
              </div>
              <textarea
                value={resendMessage}
                onChange={e => setResendMessage(e.target.value)}
                placeholder="e.g., Updated drawings have been uploaded..."
                style={{
                  width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)",
                  borderRadius: 7, fontSize: "0.82rem", minHeight: 60, resize: "vertical",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none",
                  background: "var(--surface)", color: "var(--ink)", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowResendModal(false)}>
                Skip
              </button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleResendNotify}
                disabled={resending || resendSelectedBids.size === 0}
              >
                {resending ? "Sending..." : `Notify Vendors (${resendSelectedBids.size} bid${resendSelectedBids.size !== 1 ? "s" : ""})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {showStop && (
        <div className="modal-overlay open" onClick={() => setShowStop(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              Pause Project
            </h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink2)", marginBottom: 20 }}>
              This will pause <strong>{project.name}</strong> and close all active bids.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowStop(false)}>Cancel</button>
              <button className="btn btn-gold btn-sm" onClick={handleStop} disabled={stopping}>
                {stopping ? "Pausing..." : "Pause Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CATEGORY CONFIRMATION */}
      {deletingCat && (
        <div className="modal-overlay open" onClick={() => setDeletingCat(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 12 }}>
              Remove Category
            </h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink2)", marginBottom: 8 }}>
              Are you sure you want to remove <strong>{deletingCat.name}</strong>?
            </p>
            {deletingCat.hasBids && (
              <div style={{
                background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8,
                padding: "10px 14px", fontSize: "0.82rem", color: "#92400e",
                marginBottom: 12, fontWeight: 600,
              }}>
                This category has bids and data inside. Removing it will delete all associated bids, vendor responses, and files.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setDeletingCat(null)}>Cancel</button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleRemoveCategory}
                disabled={removingCat}
                style={{ background: "#92400e", borderColor: "#92400e" }}
              >
                {removingCat ? "Removing..." : deletingCat.hasBids ? "Remove with all data" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CATEGORIES PANEL */}
      {showCatPanel && (
        <div className="modal-overlay open" onClick={() => setShowCatPanel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, margin: 0, flex: 1 }}>
                Add Categories
              </h3>
              <button
                onClick={() => setShowCatPanel(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>

            {/* Presets row */}
            {presets.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  Saved Presets
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {presets.map(preset => (
                    <div key={preset.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 100, fontSize: "0.74rem",
                      fontWeight: 600, background: "var(--bg)",
                      border: "1px solid var(--border)", cursor: "pointer",
                      color: "var(--ink2)",
                    }}>
                      <span onClick={() => applyPreset(preset)} style={{ cursor: "pointer" }}>
                        {preset.name}
                        {preset.project_type && (
                          <span style={{ fontSize: "0.62rem", color: "var(--muted)", marginLeft: 4 }}>({preset.project_type})</span>
                        )}
                      </span>
                      <span style={{ fontSize: "0.62rem", color: "var(--muted)", marginLeft: 2 }}>
                        {preset.category_ids.length} cats
                      </span>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem", padding: "0 0 0 3px" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search + options */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <input
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
                placeholder="Search categories..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={selectAll}
                style={{
                  fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)",
                  background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {selectedCatIds.size === filteredCategories.length && filteredCategories.length > 0 ? "Deselect All" : "Select All"}
              </button>
            </div>

            {/* Include vendors toggle */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              padding: "8px 10px", background: "var(--bg)", borderRadius: 8,
              border: "1px solid var(--border)",
            }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                fontSize: "0.8rem", fontWeight: 600, color: "var(--ink2)", flex: 1,
              }}>
                <input
                  type="checkbox"
                  checked={includeVendors}
                  onChange={e => setIncludeVendors(e.target.checked)}
                  style={{ accentColor: "var(--gold)" }}
                />
                Include vendors with categories
              </label>
              <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                Auto-assign vendors to bids
              </span>
            </div>

            {/* Category list */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, minHeight: 0 }}>
              {Object.keys(groupedFiltered).length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "0.82rem" }}>
                  {allCategories.length === 0 ? "Loading categories..." : "All categories already added"}
                </div>
              ) : (
                Object.entries(groupedFiltered).map(([grp, cats]) => {
                  const groupAllSelected = cats.every(c => selectedCatIds.has(c.id));
                  return (
                    <div key={grp} style={{ marginBottom: 12 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
                      }}>
                        <button
                          onClick={() => selectAllInGroup(grp)}
                          style={{
                            fontSize: "0.68rem", fontWeight: 800, color: groupAllSelected ? "var(--gold)" : "var(--muted)",
                            textTransform: "uppercase", letterSpacing: "0.04em",
                            background: "none", border: "none", cursor: "pointer",
                          }}
                        >
                          {grp}
                        </button>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                          {cats.filter(c => selectedCatIds.has(c.id)).length}/{cats.length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {cats.map(cat => {
                          const selected = selectedCatIds.has(cat.id);
                          return (
                            <button
                              key={cat.id}
                              onClick={() => toggleCat(cat.id)}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "5px 10px", borderRadius: 100, fontSize: "0.76rem",
                                fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
                                background: selected ? "var(--gold-bg)" : "var(--surface)",
                                color: selected ? "var(--gold)" : "var(--ink2)",
                                border: `1.5px solid ${selected ? "var(--gold-b)" : "var(--border)"}`,
                              }}
                            >
                              {cat.name}
                              {includeVendors && cat.vendors.length > 0 && (
                                <span style={{
                                  fontSize: "0.6rem", color: selected ? "var(--gold)" : "var(--muted)",
                                  fontWeight: 500,
                                }}>
                                  ({cat.vendors.length})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer actions */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderTop: "1px solid var(--border)", paddingTop: 12,
            }}>
              <div style={{ flex: 1, fontSize: "0.76rem", color: "var(--muted)", fontWeight: 600 }}>
                {selectedCatIds.size} selected
                {includeVendors && selectedCatIds.size > 0 && (() => {
                  let vCount = 0;
                  allCategories.forEach(c => { if (selectedCatIds.has(c.id)) vCount += c.vendors.length; });
                  return <span> · {vCount} vendors</span>;
                })()}
              </div>

              {/* Save as preset */}
              {selectedCatIds.size > 0 && !showPresetSave && (
                <button
                  onClick={() => setShowPresetSave(true)}
                  style={{
                    fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)",
                    background: "none", border: "none", cursor: "pointer",
                  }}
                >
                  Save as preset
                </button>
              )}

              <button className="btn btn-outline btn-sm" onClick={() => setShowCatPanel(false)}>Cancel</button>
              <button
                className="btn btn-gold btn-sm"
                onClick={handleAddCategories}
                disabled={selectedCatIds.size === 0 || addingCats}
              >
                {addingCats ? "Adding..." : `Add ${selectedCatIds.size > 0 ? selectedCatIds.size : ""} Categories`}
              </button>
            </div>

            {/* Save preset inline form */}
            {showPresetSave && (
              <div style={{
                marginTop: 10, padding: "10px 12px", background: "var(--bg)",
                borderRadius: 8, border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Save Preset
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "end" }}>
                  <div style={{ flex: 1 }}>
                    <input
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder="Preset name (e.g. Bronx)"
                      style={{ ...inputStyle, fontSize: "0.8rem" }}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <input
                      value={presetType}
                      onChange={e => setPresetType(e.target.value)}
                      placeholder="Project type"
                      style={{ ...inputStyle, fontSize: "0.8rem" }}
                    />
                  </div>
                  <button
                    className="btn btn-gold btn-xs"
                    onClick={handleSavePreset}
                    disabled={!presetName || savingPreset}
                  >
                    {savingPreset ? "..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setShowPresetSave(false); setPresetName(""); setPresetType(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
