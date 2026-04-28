"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCategoryIcon } from "@/lib/category-icons";

interface Parameter {
  name: string;
  options: string[];
  is_track?: boolean;
}
interface CheckItem {
  text: string;
  required?: boolean;
}
interface BidTemplate {
  id: string;
  name: string;
  category_id: string | null;
  title: string;
  description: string;
  parameters: Parameter[];
  checklist: CheckItem[] | string[];
  bid_mode?: string;
  suggested_specs?: string[];
  is_default?: boolean;
  created_at?: string;
}
interface TradeCategory {
  id: string;
  name: string;
  grp: string;
}

function showToast(msg: string) {
  const el = document.getElementById("bm-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(12px)"; }, 2200);
}

export default function BidTemplatesPage() {
  const [templates, setTemplates] = useState<BidTemplate[]>([]);
  const [categories, setCategories] = useState<TradeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Edit/Create modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formBidMode, setFormBidMode] = useState<"structured" | "open">("structured");
  const [formParams, setFormParams] = useState<Parameter[]>([]);
  const [formChecklist, setFormChecklist] = useState<CheckItem[]>([]);
  const [formSpecs, setFormSpecs] = useState<string[]>([]);
  const [newParamName, setNewParamName] = useState("");
  const [newCheckText, setNewCheckText] = useState("");
  const [newSpecText, setNewSpecText] = useState("");
  const [newOptInputs, setNewOptInputs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // AI scan
  const [showAiScan, setShowAiScan] = useState(false);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiScanning, setAiScanning] = useState(false);

  // Grid navigation + preview (must be at top level, NOT inside render)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<BidTemplate | null>(null);

  // Add category
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        fetch("/api/bid-templates"),
        fetch("/api/trade-categories"),
      ]);
      if (tRes.ok) setTemplates(await tRes.json());
      if (cRes.ok) {
        const cats = await cRes.json();
        setCategories(cats.map((c: any) => ({ id: c.id, name: c.name, grp: c.grp })));
      }
    } catch {}
    finally { setLoading(false); }
  }

  function openNew() {
    setEditId(null);
    setFormName("");
    setFormCategoryId("");
    setFormTitle("");
    setFormDesc("");
    setFormBidMode("structured");
    setFormParams([]);
    setFormChecklist([]);
    setFormSpecs([]);
    setShowModal(true);
  }

  function openEdit(t: BidTemplate) {
    setEditId(t.id);
    setFormName(t.name);
    setFormCategoryId(t.category_id || "");
    setFormTitle(t.title);
    setFormDesc(t.description);
    setFormBidMode((t.bid_mode as any) || "structured");
    setFormParams(t.parameters.map(p => ({ ...p, options: [...p.options] })));
    setFormChecklist(
      t.checklist.map(c => typeof c === "string" ? { text: c, required: true } : c)
    );
    setFormSpecs(t.suggested_specs || []);
    setShowModal(true);
  }

  function openDuplicate(t: BidTemplate) {
    openEdit(t);
    setEditId(null);
    setFormName(t.name + " (Copy)");
  }

  async function handleSave() {
    if (!formName.trim() || !formTitle.trim()) {
      showToast("Name and title are required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        id: editId,
        name: formName.trim(),
        category_id: formCategoryId || null,
        title: formTitle.trim(),
        description: formDesc.trim(),
        parameters: formParams.filter(p => p.name.trim()),
        checklist: formChecklist.filter(c => c.text.trim()),
        bid_mode: formBidMode,
        suggested_specs: formSpecs.filter(s => s.trim()),
      };

      const res = await fetch("/api/bid-templates", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editId ? "Template updated" : "Template created");
        setShowModal(false);
        await loadData();
      } else {
        showToast("Failed to save");
      }
    } catch { showToast("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    const res = await fetch("/api/bid-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      showToast("Template deleted");
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      const res = await fetch("/api/trade-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim(), grp: "Custom" }),
      });
      if (res.ok) {
        const newCat = await res.json();
        setCategories(prev => [...prev, { id: newCat.id, name: newCat.name, grp: newCat.grp || "Custom" }]);
        setNewCatName("");
        setShowAddCategory(false);
        showToast("Category added");
      } else {
        showToast("Failed to add category");
      }
    } catch { showToast("Failed to add category"); }
    finally { setSavingCat(false); }
  }

  async function handleAiScan() {
    if (!aiFile && !aiText.trim()) { showToast("Upload a file or paste text"); return; }
    if (aiFile && aiFile.size > 4 * 1024 * 1024) {
      showToast("File too large (max 4MB)");
      return;
    }
    setAiScanning(true);
    try {
      const formData = new FormData();
      if (aiFile) formData.append("file", aiFile);
      if (aiText.trim()) formData.append("text", aiText.trim());

      const res = await fetch("/api/bids/ai-create-from-quote", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        showToast("AI scan failed");
        setAiScanning(false);
        return;
      }
      const { data } = await res.json();
      // Fill form with AI results
      if (data.title) setFormTitle(data.title);
      if (data.description) setFormDesc(data.description);
      if (data.bid_mode) setFormBidMode(data.bid_mode);
      if (data.parameters) setFormParams(data.parameters.map((p: any) => ({ name: p.name || "", options: p.options || [], is_track: !!p.is_track })));
      if (data.checklist) setFormChecklist(data.checklist.map((c: any) => ({ text: c.text || c, required: c.required !== false })));
      if (data.suggested_specs) setFormSpecs(data.suggested_specs);
      setShowAiScan(false);
      setAiFile(null);
      setAiText("");
      showToast("AI filled the template form");
    } catch { showToast("AI scan failed"); }
    finally { setAiScanning(false); }
  }

  // Filter
  const filtered = templates.filter(t => {
    if (filterCat && t.category_id !== filterCat) return false;
    if (search) {
      const s = search.toLowerCase();
      return t.name.toLowerCase().includes(s) || t.title.toLowerCase().includes(s);
    }
    return true;
  });

  // Group by category
  const grouped: Record<string, BidTemplate[]> = {};
  for (const t of filtered) {
    const catName = categories.find(c => c.id === t.category_id)?.name || "General";
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(t);
  }

  // Template count per category
  const templateCountByCategory: Record<string, number> = {};
  for (const t of templates) {
    const cid = t.category_id || "__none__";
    templateCountByCategory[cid] = (templateCountByCategory[cid] || 0) + 1;
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

  return (
    <div className="page on" style={{ padding: "20px 24px" }}>
      {/* Toast */}
      <div id="bm-toast" style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%) translateY(12px)",
        background: "#0f0f0f", color: "#fff", padding: "10px 20px", borderRadius: 10,
        fontSize: "0.82rem", fontWeight: 600, opacity: 0, transition: "all 0.3s", zIndex: 9999,
        pointerEvents: "none",
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1.3rem", color: "var(--ink)", margin: 0 }}>
            Bid Templates
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 4 }}>
            Create and manage reusable bid form templates for each trade category
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-gold btn-xs" onClick={openNew}>
            + New Template
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates..."
          style={{ ...inputStyle, width: 220 }}
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{getCategoryIcon(c.id)} {c.name}</option>
          ))}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 0, border: "1.5px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <button
            onClick={() => setViewMode("grid")}
            style={{ padding: "6px 10px", border: "none", cursor: "pointer", background: viewMode === "grid" ? "var(--ink)" : "var(--surface)", color: viewMode === "grid" ? "#fff" : "var(--muted)", display: "flex", alignItems: "center" }}
            title="Grid view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            style={{ padding: "6px 10px", border: "none", cursor: "pointer", background: viewMode === "list" ? "var(--ink)" : "var(--surface)", color: viewMode === "list" ? "#fff" : "var(--muted)", display: "flex", alignItems: "center" }}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Templates display */}
      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}>No templates found</div>
          <button className="btn btn-gold btn-xs" onClick={openNew}>Create your first template</button>
        </div>
      ) : viewMode === "list" && !openCategoryId ? (
        /* ===== LIST VIEW ===== */
        <div style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([catName, temps], gi) => (
            <div key={catName}>
              <div style={{
                padding: "8px 14px", background: "var(--bg)", fontSize: "0.7rem", fontWeight: 800,
                color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em",
                borderTop: gi > 0 ? "1.5px solid var(--border)" : "none",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>{getCategoryIcon(temps[0]?.category_id || "")}</span>
                {catName} ({temps.length})
              </div>
              {temps.map(t => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderTop: "1px solid var(--border)", background: "var(--surface)",
                }}>
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>{getCategoryIcon(t.category_id || "")}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{t.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0 }}>
                    {t.parameters.length > 0 && <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink2)" }}>{t.parameters.length}p</span>}
                    {((t.checklist as any[]) || []).length > 0 && <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink2)" }}>{(t.checklist as any[]).length}c</span>}
                    {t.is_default && <span style={{ fontSize: "0.58rem", padding: "1px 6px", borderRadius: 3, background: "var(--gold-bg)", color: "var(--gold)", border: "1px solid var(--gold-b)", fontWeight: 800 }}>DEFAULT</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => openEdit(t)}>Edit</button>
                    <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => openDuplicate(t)}>Dup</button>
                    {!t.is_default && <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px", color: "#dc2626", borderColor: "#fecaca" }} onClick={() => handleDelete(t.id, t.name)}>Del</button>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* ===== GRID VIEW — Category Squares ===== */
        openCategoryId ? (
          /* Inside a category — show its templates */
          (() => {
            const cat = categories.find(c => c.id === openCategoryId);
            const catTemplates = templates.filter(t => t.category_id === openCategoryId);
            return (
              <div>
                <button
                  onClick={() => setOpenCategoryId(null)}
                  style={{
                    background: "none", border: "1px solid var(--border)", borderRadius: 7,
                    padding: "5px 14px", fontSize: "0.78rem", fontWeight: 700,
                    cursor: "pointer", color: "var(--ink)", display: "flex", alignItems: "center", gap: 5,
                    marginBottom: 14,
                  }}
                >
                  ← Back to Categories
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: "1.8rem" }}>{getCategoryIcon(openCategoryId)}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--ink)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{cat?.name || "General"}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{catTemplates.length} template{catTemplates.length !== 1 ? "s" : ""}</div>
                  </div>
                  <button className="btn btn-gold btn-xs" style={{ marginLeft: "auto" }} onClick={() => { openNew(); setFormCategoryId(openCategoryId); }}>
                    + New Template
                  </button>
                </div>

                {catTemplates.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px", color: "var(--muted)", background: "var(--bg)", borderRadius: 10, border: "1.5px solid var(--border)" }}>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 8 }}>No templates yet</div>
                    <button className="btn btn-gold btn-xs" onClick={() => { openNew(); setFormCategoryId(openCategoryId); }}>Create first template</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {catTemplates.map(t => (
                      <div key={t.id} style={{
                        background: "var(--surface)", border: "1.5px solid var(--border)",
                        borderRadius: 10, padding: "14px 16px", position: "relative",
                        display: "flex", flexDirection: "column",
                      }}>
                        {t.is_default && (
                          <span style={{
                            position: "absolute", top: 8, right: 8, fontSize: "0.54rem",
                            fontWeight: 800, textTransform: "uppercase", padding: "1px 5px",
                            borderRadius: 3, background: "var(--gold-bg)", color: "var(--gold)",
                            border: "1px solid var(--gold-b)",
                          }}>Default</span>
                        )}
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--ink)", marginBottom: 4, paddingRight: t.is_default ? 50 : 0 }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, flex: 1 }}>
                          {t.title}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                          {t.parameters.length > 0 && <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink2)" }}>{t.parameters.length} params</span>}
                          {((t.checklist as any[]) || []).length > 0 && <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink2)" }}>{(t.checklist as any[]).length} check</span>}
                          {t.bid_mode === "open" && <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: 3, background: "var(--gold-bg)", border: "1px solid var(--gold-b)", color: "var(--gold)" }}>Open</span>}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => openEdit(t)}>Edit</button>
                          <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => openDuplicate(t)}>Dup</button>
                          <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px", color: "#7c3aed", borderColor: "#c4b5fd" }} onClick={() => setPreviewTemplate(t)}>
                            👁 Preview
                          </button>
                          {!t.is_default && <button className="btn btn-outline btn-xs" style={{ fontSize: "0.68rem", padding: "3px 8px", color: "#dc2626", borderColor: "#fecaca" }} onClick={() => handleDelete(t.id, t.name)}>Del</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          /* Category squares grid */
          <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {categories
              .filter(c => !filterCat || c.id === filterCat)
              .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
              .map(c => {
                const count = templateCountByCategory[c.id] || 0;
                return (
                  <div
                    key={c.id}
                    onClick={() => setOpenCategoryId(c.id)}
                    style={{
                      background: "var(--surface)", border: "1.5px solid var(--border)",
                      borderRadius: 12, padding: "16px 14px", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      textAlign: "center", transition: "all 0.15s",
                      position: "relative",
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "var(--gold-bg)"; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
                  >
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>{getCategoryIcon(c.id)}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--ink)", marginBottom: 4, lineHeight: 1.2 }}>
                      {c.name}
                    </div>
                    <div style={{
                      fontSize: "0.68rem", fontWeight: 700,
                      color: count > 0 ? "var(--gold)" : "var(--muted)",
                      background: count > 0 ? "var(--gold-bg)" : "var(--bg)",
                      border: `1px solid ${count > 0 ? "var(--gold-b)" : "var(--border)"}`,
                      borderRadius: 10, padding: "1px 8px",
                    }}>
                      {count} template{count !== 1 ? "s" : ""}
                    </div>
                  </div>
                );
              })}
            {/* Add new category tile */}
            {!filterCat && !search && (
              <div
                onClick={() => setShowAddCategory(true)}
                style={{
                  background: "var(--surface)", border: "1.5px dashed var(--border)",
                  borderRadius: 12, padding: "16px 14px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  textAlign: "center", transition: "all 0.15s",
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "var(--gold-bg)"; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
              >
                <div style={{ fontSize: "2rem", marginBottom: 8, opacity: 0.4 }}>＋</div>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.2 }}>
                  Add Category
                </div>
              </div>
            )}
          </div>

          {/* Add Category Modal */}
          {showAddCategory && typeof document !== "undefined" && createPortal(
            <div className="modal-overlay open" onClick={() => setShowAddCategory(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
                <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, marginBottom: 14 }}>
                  Add Category
                </h3>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Category Name</div>
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddCategory(); }}
                  placeholder="e.g. Smart Home Systems"
                  style={inputStyle}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                  <button className="btn btn-outline btn-xs" onClick={() => setShowAddCategory(false)}>Cancel</button>
                  <button className="btn btn-gold btn-xs" onClick={handleAddCategory} disabled={savingCat || !newCatName.trim()}>
                    {savingCat ? "Adding..." : "Add Category"}
                  </button>
                </div>
              </div>
            </div>
          , document.body)}
          </>
        )
      )}

      {/* Vendor Preview Modal */}
      {typeof document !== "undefined" && previewTemplate && createPortal(
        <div className="modal-overlay open" onClick={() => setPreviewTemplate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>👁</span> Vendor Preview
              </h3>
              <button onClick={() => setPreviewTemplate(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--muted)" }}>×</button>
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 14 }}>This is how vendors will see this bid form</p>

            {/* Simulated vendor form */}
            <div style={{ background: "#fafaf8", border: "1.5px solid #e5e5e0", borderRadius: 12, padding: "20px", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1a1a1a", marginBottom: 4 }}>{previewTemplate.title}</div>
              <div style={{ fontSize: "0.82rem", color: "#666", marginBottom: 16, whiteSpace: "pre-wrap" }}>{previewTemplate.description || "No description"}</div>

              {previewTemplate.bid_mode === "open" ? (
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#d97706", marginBottom: 8, textTransform: "uppercase" }}>Open Proposal Mode</div>
                  <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 2 }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 3 }}>Option Name *</div>
                        <div style={{ padding: "8px", background: "#f5f5f5", borderRadius: 6, fontSize: "0.82rem", color: "#aaa" }}>e.g. Premium Package</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#d97706", marginBottom: 3 }}>Price ($) *</div>
                        <div style={{ padding: "8px", background: "#fffbf0", borderRadius: 6, fontSize: "0.82rem", color: "#aaa", border: "1px solid #fde68a" }}>0.00</div>
                      </div>
                    </div>
                    {previewTemplate.suggested_specs && previewTemplate.suggested_specs.length > 0 && (
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#888", marginBottom: 6 }}>Specifications</div>
                        {previewTemplate.suggested_specs.map((s, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 120, padding: "6px 8px", background: "#f5f5f5", borderRadius: 5, fontSize: "0.78rem", fontWeight: 600 }}>{s}</div>
                            <div style={{ flex: 1, padding: "6px 8px", background: "#f5f5f5", borderRadius: 5, fontSize: "0.78rem", color: "#aaa" }}>Enter value...</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {previewTemplate.parameters.map((p, pi) => (
                    <div key={pi} style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: "0.74rem", fontWeight: 700, marginBottom: 6,
                        color: p.is_track ? "#d97706" : "#1a1a1a",
                      }}>
                        {p.is_track ? `⚡ ${p.name} (Track)` : p.name}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {p.options.map((opt, oi) => (
                          <div key={oi} style={{
                            padding: "6px 12px", background: "#fff", border: "1.5px solid #e5e5e0",
                            borderRadius: 8, fontSize: "0.8rem", color: "#1a1a1a",
                          }}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {previewTemplate.parameters.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#d97706", marginBottom: 6 }}>Price per combination ($)</div>
                      <div style={{ padding: "8px", background: "#fffbf0", borderRadius: 6, fontSize: "0.82rem", color: "#aaa", border: "1px solid #fde68a" }}>
                        Vendors fill prices for each parameter combination...
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Checklist preview */}
              {((previewTemplate.checklist as any[]) || []).length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e5e5e0" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Required Documents & Conditions</div>
                  {(previewTemplate.checklist as CheckItem[]).map((c, ci) => (
                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 3,
                        border: `1.5px solid ${c.required ? "#d97706" : "#ccc"}`,
                        background: "transparent", flexShrink: 0,
                      }} />
                      <span style={{ fontSize: "0.8rem", color: "#1a1a1a" }}>{typeof c === "string" ? c : c.text}</span>
                      {(typeof c !== "string" && !c.required) && <span style={{ fontSize: "0.6rem", color: "#999", fontWeight: 600 }}>Optional</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Edit/Create Modal — portaled to body */}
      {typeof document !== "undefined" && showModal && createPortal(
        <div className="modal-overlay open" onClick={() => !saving && setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, margin: 0 }}>
                {editId ? "Edit Template" : "New Template"}
              </h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setShowAiScan(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "#1a1a1a", color: "var(--gold)", border: "none",
                    borderRadius: 6, padding: "5px 12px", fontSize: "0.72rem",
                    fontWeight: 700, cursor: "pointer",
                  }}
                >
                  🤖 Fill from Quote (AI)
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* AI Scan inline */}
              {showAiScan && (
                <div style={{ background: "var(--bg)", border: "1.5px solid var(--gold-b)", borderRadius: 8, padding: "14px", marginBottom: 14 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)", marginBottom: 8, textTransform: "uppercase" }}>Scan Quote with AI</div>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => setAiFile(e.target.files?.[0] || null)} style={{ fontSize: "0.8rem", marginBottom: 8, display: "block" }} />
                  <textarea value={aiText} onChange={e => setAiText(e.target.value)} placeholder="Or paste quote text..." style={{ ...inputStyle, minHeight: 60, marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-outline btn-xs" onClick={() => setShowAiScan(false)}>Cancel</button>
                    <button className="btn btn-gold btn-xs" onClick={handleAiScan} disabled={aiScanning}>
                      {aiScanning ? "Scanning..." : "🤖 Scan & Fill"}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Name & Category */}
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Template Name *</div>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Brooklyn Luxury Project" style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Category</div>
                    <select value={formCategoryId} onChange={e => setFormCategoryId(e.target.value)} style={inputStyle}>
                      <option value="">None</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Bid Title *</div>
                  <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Elevator Installation Bid" style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Description</div>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Scope of work..." style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
                </div>

                {/* Bid Mode */}
                <div style={{ display: "flex", gap: 0, border: "1.5px solid var(--border)", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
                  <button type="button" onClick={() => setFormBidMode("structured")}
                    style={{ padding: "6px 14px", border: "none", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", background: formBidMode === "structured" ? "var(--ink)" : "var(--surface)", color: formBidMode === "structured" ? "#fff" : "var(--muted)" }}>
                    Structured
                  </button>
                  <button type="button" onClick={() => setFormBidMode("open")}
                    style={{ padding: "6px 14px", border: "none", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", background: formBidMode === "open" ? "var(--gold)" : "var(--surface)", color: formBidMode === "open" ? "#fff" : "var(--muted)" }}>
                    Open Proposal
                  </button>
                </div>

                {/* Parameters */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Parameters</div>
                  </div>
                  {formParams.map((p, pi) => (
                    <div key={pi} style={{ border: p.is_track ? "2px solid var(--gold)" : "1.5px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <input value={p.name} onChange={e => { const n = [...formParams]; n[pi] = { ...n[pi], name: e.target.value }; setFormParams(n); }} placeholder="Parameter name" style={{ ...inputStyle, flex: 1, fontWeight: 600 }} />
                        <label style={{ fontSize: "0.68rem", display: "flex", alignItems: "center", gap: 3, color: "var(--gold)", fontWeight: 700, whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={!!p.is_track} onChange={e => { const n = [...formParams]; n[pi] = { ...n[pi], is_track: e.target.checked }; setFormParams(n); }} style={{ accentColor: "var(--gold)" }} />
                          Track
                        </label>
                        <button onClick={() => setFormParams(prev => prev.filter((_, i) => i !== pi))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}>✕</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                        {p.options.map((opt, oi) => (
                          <span key={oi} style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 8px", fontSize: "0.74rem" }}>
                            {opt}
                            <button onClick={() => { const n = [...formParams]; n[pi] = { ...n[pi], options: n[pi].options.filter((_, i) => i !== oi) }; setFormParams(n); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem", padding: 0 }}>×</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <input value={newOptInputs[pi] || ""} onChange={e => setNewOptInputs(prev => ({ ...prev, [pi]: e.target.value }))} placeholder="Add option" onKeyDown={e => { if (e.key === "Enter" && (newOptInputs[pi] || "").trim()) { const n = [...formParams]; n[pi] = { ...n[pi], options: [...n[pi].options, newOptInputs[pi].trim()] }; setFormParams(n); setNewOptInputs(prev => ({ ...prev, [pi]: "" })); } }} style={{ ...inputStyle, flex: 1, fontSize: "0.78rem" }} />
                        <button className="btn btn-outline btn-xs" style={{ fontSize: "0.65rem" }} onClick={() => { if ((newOptInputs[pi] || "").trim()) { const n = [...formParams]; n[pi] = { ...n[pi], options: [...n[pi].options, newOptInputs[pi].trim()] }; setFormParams(n); setNewOptInputs(prev => ({ ...prev, [pi]: "" })); } }}>+</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-outline btn-xs" style={{ fontSize: "0.7rem" }}
                    onClick={() => setFormParams(prev => [...prev, { name: "", options: [], is_track: false }])}>
                    + Add Parameter
                  </button>
                </div>

                {/* Suggested Specs (Open mode) */}
                {formBidMode === "open" && (
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Suggested Spec Fields</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {formSpecs.map((s, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--gold-bg)", border: "1px solid var(--gold-b)", borderRadius: 5, padding: "3px 8px", fontSize: "0.74rem", fontWeight: 600 }}>
                          {s}
                          <button onClick={() => setFormSpecs(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem", padding: 0 }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input value={newSpecText} onChange={e => setNewSpecText(e.target.value)} placeholder="e.g. Brand, Model, Warranty" onKeyDown={e => { if (e.key === "Enter" && newSpecText.trim()) { setFormSpecs(prev => [...prev, newSpecText.trim()]); setNewSpecText(""); } }} style={{ ...inputStyle, flex: 1, fontSize: "0.78rem" }} />
                      <button className="btn btn-outline btn-xs" onClick={() => { if (newSpecText.trim()) { setFormSpecs(prev => [...prev, newSpecText.trim()]); setNewSpecText(""); } }}>+</button>
                    </div>
                  </div>
                )}

                {/* Checklist */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Checklist</div>
                  {formChecklist.map((c, ci) => (
                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <button onClick={() => { const n = [...formChecklist]; n[ci] = { ...n[ci], required: !n[ci].required }; setFormChecklist(n); }}
                        style={{ width: 16, height: 16, borderRadius: 3, border: c.required ? "2px solid var(--gold)" : "2px solid var(--border)", background: c.required ? "var(--gold)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.55rem", color: "#fff", flexShrink: 0 }}>
                        {c.required ? "✓" : ""}
                      </button>
                      <span style={{ flex: 1, fontSize: "0.8rem" }}>{c.text}</span>
                      <span style={{ fontSize: "0.6rem", fontWeight: 700, color: c.required ? "var(--gold)" : "var(--muted)" }}>{c.required ? "REQ" : "OPT"}</span>
                      <button onClick={() => setFormChecklist(prev => prev.filter((_, i) => i !== ci))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.65rem" }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <input value={newCheckText} onChange={e => setNewCheckText(e.target.value)} placeholder="e.g. Insurance certificate" onKeyDown={e => { if (e.key === "Enter" && newCheckText.trim()) { setFormChecklist(prev => [...prev, { text: newCheckText.trim(), required: true }]); setNewCheckText(""); } }} style={{ ...inputStyle, flex: 1, fontSize: "0.78rem" }} />
                    <button className="btn btn-outline btn-xs" onClick={() => { if (newCheckText.trim()) { setFormChecklist(prev => [...prev, { text: newCheckText.trim(), required: true }]); setNewCheckText(""); } }}>+</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-outline btn-xs" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-gold btn-xs" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editId ? "Update Template" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
