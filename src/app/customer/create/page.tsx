"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, Suspense } from "react";

interface Parameter {
  name: string;
  options: string[];
  is_track?: boolean;
}

interface Project {
  id: string;
  name: string;
}

interface ProjectFile {
  id: string;
  filename: string;
  uploaded_at: string;
}

interface BidTemplate {
  id: string;
  name: string;
  category_id: string | null;
  title: string;
  description: string;
  parameters: Parameter[];
  checklist: string[];
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

export default function CreateBidPage() {
  return (
    <Suspense fallback={<div className="scroll" style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}><div style={{ width: "32px", height: "32px", border: "4px solid var(--gold-b)", borderTopColor: "var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div></div>}>
      <CreateBidContent />
    </Suspense>
  );
}

function CreateBidContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project");
  const categoryIdFromUrl = searchParams.get("category");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileLinks, setFileLinks] = useState<{ url: string; label: string }[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionInputs, setOptionInputs] = useState<Record<number, string>>({});
  const [dragOver, setDragOver] = useState(false);

  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectIdFromUrl || "");
  const [projectName, setProjectName] = useState<string>("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Project files
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [selectedProjectFileIds, setSelectedProjectFileIds] = useState<Set<string>>(new Set());

  // Templates
  const [templates, setTemplates] = useState<BidTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Checklist
  const [checklist, setChecklist] = useState<{ text: string; checked: boolean }[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setProjects(data);
        if (projectIdFromUrl) {
          const found = data.find((p: Project) => p.id === projectIdFromUrl);
          if (found) setProjectName(found.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [projectIdFromUrl]);

  // Load templates
  useEffect(() => {
    fetch("/api/bid-templates")
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  function loadTemplate(t: BidTemplate) {
    setTitle(t.title);
    setDescription(t.description);
    setParameters(t.parameters.map(p => ({ ...p, options: [...p.options] })));
    setChecklist(t.checklist.map(text => ({ text, checked: false })));
    setShowTemplates(false);
    showToast(`Template "${t.name}" loaded`);
  }

  async function handleSaveTemplate() {
    if (!templateName || !title) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/bid-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          category_id: categoryIdFromUrl || null,
          title,
          description,
          parameters: parameters.filter(p => p.name.trim() && p.options.length > 0).map(p => ({ ...p, is_track: !!p.is_track })),
          checklist: checklist.map(c => c.text),
        }),
      });
      if (res.ok) {
        const newT = await res.json();
        newT.parameters = newT.parameters || parameters;
        newT.checklist = newT.checklist || checklist.map(c => c.text);
        setTemplates(prev => [newT, ...prev]);
        setShowSaveTemplate(false);
        setTemplateName("");
        showToast("Template saved!");
      }
    } catch { showToast("Failed to save"); }
    finally { setSavingTemplate(false); }
  }

  // Load project files when project is selected
  const activeProjectId = projectIdFromUrl || selectedProjectId;
  useEffect(() => {
    if (activeProjectId) {
      fetch(`/api/projects/${activeProjectId}/files`)
        .then(r => r.ok ? r.json() : [])
        .then(setProjectFiles)
        .catch(() => setProjectFiles([]));
    } else {
      setProjectFiles([]);
      setSelectedProjectFileIds(new Set());
    }
  }, [activeProjectId]);

  const addParameter = (isTrack = false) => {
    setParameters([...parameters, { name: "", options: [], is_track: isTrack }]);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
    const newInputs = { ...optionInputs };
    delete newInputs[index];
    setOptionInputs(newInputs);
  };

  const updateParameterName = (index: number, name: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], name };
    setParameters(updated);
  };

  const addOption = (paramIndex: number) => {
    const text = (optionInputs[paramIndex] || "").trim();
    if (!text) return;
    const updated = [...parameters];
    if (!updated[paramIndex].options.includes(text)) {
      updated[paramIndex] = {
        ...updated[paramIndex],
        options: [...updated[paramIndex].options, text],
      };
      setParameters(updated);
    }
    setOptionInputs({ ...optionInputs, [paramIndex]: "" });
  };

  const removeOption = (paramIndex: number, optionIndex: number) => {
    const updated = [...parameters];
    updated[paramIndex] = {
      ...updated[paramIndex],
      options: updated[paramIndex].options.filter((_, i) => i !== optionIndex),
    };
    setParameters(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const projectId = projectIdFromUrl || selectedProjectId || undefined;

      const body: Record<string, unknown> = {
        title,
        description,
        deadline,
        parameters: parameters
          .filter((p) => p.name.trim() && p.options.length > 0)
          .map((p, i) => ({ name: p.name.trim(), options: p.options, is_track: !!p.is_track, sort_order: i })),
      };

      if (projectId) {
        body.project_id = projectId;
      }
      if (categoryIdFromUrl) {
        body.trade_category_id = categoryIdFromUrl;
      }

      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create bid");
      }

      const bid = await res.json();

      if (files && files.length > 0) {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
          formData.append("files", files[i]);
        }
        const uploadRes = await fetch(`/api/bids/${bid.id}/files`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          console.error("File upload failed, but bid was created");
        }
      }

      // Attach selected project files to the bid
      if (selectedProjectFileIds.size > 0 && activeProjectId) {
        await fetch(`/api/projects/${activeProjectId}/files/attach-to-bid`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bid_id: bid.id, file_ids: Array.from(selectedProjectFileIds) }),
        }).catch(() => console.error("Failed to attach project files"));
      }

      // Save file links
      if (fileLinks.length > 0) {
        await fetch("/api/file-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref_type: "bid", ref_id: bid.id, links: fileLinks }),
        }).catch(() => console.error("Failed to save file links"));
      }

      showToast("Bid request created successfully!");
      const returnTo = projectIdFromUrl ? `/customer/project/${projectIdFromUrl}` : "/customer";
      router.push(returnTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const validParams = parameters.filter((p) => p.name.trim() && p.options.length > 0);

  const breadcrumbProject = projectName || (selectedProjectId ? projects.find((p) => p.id === selectedProjectId)?.name : null);

  return (
    <div className="page on">
      <div className="fstrip">
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          <Link href="/customer" style={{ color: "var(--gold)", textDecoration: "none", fontWeight: 600 }}>
            Dashboard
          </Link>
          {breadcrumbProject && (
            <>
              <span style={{ color: "var(--border2)", margin: "0 6px" }}>{"\u203A"}</span>
              <span style={{ color: "var(--ink2)" }}>{breadcrumbProject}</span>
            </>
          )}
          <span style={{ color: "var(--border2)", margin: "0 6px" }}>{"\u203A"}</span>
          <strong style={{ color: "var(--ink)" }}>New Bid Request</strong>
        </span>
        <div className="chip on">Details</div>
        <div className="chip">Parameters</div>
        <div className="chip">Attachments</div>
        <div className="chip">Review</div>
        <div className="fright">
          <button className="btn btn-outline btn-xs" type="button" onClick={() => showToast("Draft saved!")}>
            Save Draft
          </button>
        </div>
      </div>
      <div className="scroll">
        <div className="create-wrap">
          <div>
            <form onSubmit={handleSubmit}>
              {/* Template loader */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                padding: "10px 14px", background: "var(--bg)", borderRadius: 8,
                border: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)", flex: 1 }}>
                  Load from template
                </span>
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  style={{
                    fontSize: "0.76rem", fontWeight: 700, color: "var(--gold)",
                    background: "none", border: "none", cursor: "pointer",
                  }}
                >
                  {showTemplates ? "Close" : `Templates (${templates.length})`}
                </button>
                {title && (
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                    style={{
                      fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)",
                      background: "none", border: "none", cursor: "pointer",
                    }}
                  >
                    Save as Template
                  </button>
                )}
              </div>

              {/* Template list */}
              {showTemplates && (
                <div style={{
                  marginBottom: 14, border: "1.5px solid var(--gold-b)", borderRadius: 10,
                  background: "var(--gold-bg)", padding: 14, maxHeight: 280, overflowY: "auto",
                }}>
                  {templates.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "16px", color: "var(--muted)", fontSize: "0.82rem" }}>
                      No templates saved yet. Create a bid and save it as a template.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                        Saved Templates
                      </div>
                      {templates.map(t => (
                        <div
                          key={t.id}
                          onClick={() => loadTemplate(t)}
                          style={{
                            padding: "10px 12px", background: "var(--card)", borderRadius: 8,
                            border: "1px solid var(--border)", marginBottom: 6,
                            cursor: "pointer", transition: "all 0.12s",
                          }}
                          onMouseOver={e => { e.currentTarget.style.borderColor = "var(--gold-b)"; e.currentTarget.style.background = "var(--surface)"; }}
                          onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--ink)" }}>{t.name}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                                {t.parameters.length} parameters · {t.checklist.length} checklist items
                                {t.category_id && <span style={{ marginLeft: 6, color: "var(--gold)", fontWeight: 600 }}>{t.category_id}</span>}
                              </div>
                            </div>
                            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)" }}>Load →</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Save template form */}
              {showSaveTemplate && (
                <div style={{
                  marginBottom: 14, padding: "12px 14px", background: "var(--bg)",
                  borderRadius: 8, border: "1px solid var(--border)",
                  display: "flex", gap: 8, alignItems: "end",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Template Name</div>
                    <input
                      className="finput"
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder="e.g. Kitchen Cabinets - Bronx"
                      style={{ fontSize: "0.82rem" }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-gold btn-xs"
                    onClick={handleSaveTemplate}
                    disabled={!templateName || savingTemplate}
                  >
                    {savingTemplate ? "..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSaveTemplate(false); setTemplateName(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.82rem" }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {error && (
                <div
                  style={{
                    background: "var(--red-bg)",
                    border: "1px solid var(--red-b)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    color: "var(--red)",
                    fontSize: "0.85rem",
                    marginBottom: "16px",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Project selector */}
              <div className="fcard">
                <div className="fsect">
                  <div className="fsect-title">
                    <span className="fsect-num">{"\uD83D\uDCC1"}</span> Project
                  </div>
                  {projectIdFromUrl ? (
                    <div style={{ fontSize: "0.85rem", color: "var(--ink)", fontWeight: 600 }}>
                      {projectName || "Loading..."}
                    </div>
                  ) : (
                    <div className="fg">
                      <label className="flbl">Assign to Project</label>
                      <select
                        className="finput"
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        disabled={loadingProjects}
                      >
                        <option value="">-- No Project (Unassigned) --</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 1: Bid Details */}
              <div className="fcard">
                <div className="fsect">
                  <div className="fsect-title">
                    <span className="fsect-num">1</span> Bid Request Details
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label className="flbl">Title *</label>
                      <input
                        className="finput"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Kitchen Cabinets"
                      />
                    </div>
                    <div className="fg">
                      <label className="flbl">Bid Deadline *</label>
                      <input
                        className="finput"
                        type="date"
                        required
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow one fg">
                    <label className="flbl">Scope Description *</label>
                    <textarea
                      className="finput"
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what you need vendors to bid on..."
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Parameters */}
              <div className="fcard">
                <div className="fsect">
                  <div className="fsect-title" style={{ justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="fsect-num">2</span> Parameters
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-gold btn-xs"
                        onClick={() => addParameter(true)}
                        style={{ fontSize: "0.7rem" }}
                      >
                        + Pricing Track
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => addParameter(false)}
                        style={{ fontSize: "0.7rem" }}
                      >
                        + Parameter
                      </button>
                    </div>
                  </div>

                  {parameters.length === 0 && (
                    <div style={{ color: "var(--faint)", fontSize: "0.82rem", padding: "8px 0" }}>
                      No parameters yet. Parameters let vendors price different options (e.g., Color, Size).
                    </div>
                  )}

                  {parameters.map((param, paramIndex) => (
                    <div
                      key={paramIndex}
                      style={{
                        border: param.is_track ? "2px solid var(--gold)" : "1.5px solid var(--border)",
                        borderRadius: "10px",
                        padding: "14px",
                        background: param.is_track ? "var(--gold-bg)" : "var(--bg)",
                        marginBottom: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                        {param.is_track && (
                          <span style={{
                            fontSize: "0.62rem", fontWeight: 800, color: "var(--gold)",
                            background: "rgba(217,119,6,0.15)", padding: "2px 8px",
                            borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em",
                          }}>
                            Track
                          </span>
                        )}
                        <input
                          className="finput"
                          value={param.name}
                          onChange={(e) => updateParameterName(paramIndex, e.target.value)}
                          placeholder={param.is_track ? "Track name (e.g., Source)" : "Parameter name (e.g., Material)"}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => removeParameter(paramIndex)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--red)",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                        {param.options.map((option, optIndex) => (
                          <span
                            key={optIndex}
                            className="vtag"
                          >
                            {option}{" "}
                            <span
                              className="rm"
                              onClick={() => removeOption(paramIndex, optIndex)}
                              style={{ cursor: "pointer" }}
                            >
                              {"\u00D7"}
                            </span>
                          </span>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          className="finput"
                          value={optionInputs[paramIndex] || ""}
                          onChange={(e) => setOptionInputs({ ...optionInputs, [paramIndex]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addOption(paramIndex);
                            }
                          }}
                          placeholder="Add an option..."
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => addOption(paramIndex)}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2.5: Checklist */}
              {checklist.length > 0 && (
                <div className="fcard">
                  <div className="fsect">
                    <div className="fsect-title" style={{ justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="fsect-num">✓</span> Requirements Checklist
                      </div>
                    </div>
                    {checklist.map((item, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                        borderBottom: i < checklist.length - 1 ? "1px solid var(--border)" : "none",
                      }}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => {
                            const updated = [...checklist];
                            updated[i] = { ...updated[i], checked: !updated[i].checked };
                            setChecklist(updated);
                          }}
                          style={{ accentColor: "var(--gold)" }}
                        />
                        <span style={{
                          flex: 1, fontSize: "0.84rem", color: item.checked ? "var(--muted)" : "var(--ink)",
                          textDecoration: item.checked ? "line-through" : "none",
                        }}>
                          {item.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.7rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input
                        className="finput"
                        value={newCheckItem}
                        onChange={e => setNewCheckItem(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newCheckItem.trim()) {
                            e.preventDefault();
                            setChecklist([...checklist, { text: newCheckItem.trim(), checked: false }]);
                            setNewCheckItem("");
                          }
                        }}
                        placeholder="Add requirement..."
                        style={{ flex: 1, fontSize: "0.82rem" }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => {
                          if (newCheckItem.trim()) {
                            setChecklist([...checklist, { text: newCheckItem.trim(), checked: false }]);
                            setNewCheckItem("");
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Attachments */}
              <div className="fcard">
                <div className="fsect">
                  <div className="fsect-title">
                    <span className="fsect-num">3</span> Attachments
                  </div>

                  {/* Project files selection */}
                  {projectFiles.length > 0 && (
                    <div style={{
                      border: "1.5px solid var(--gold-b)", borderRadius: 10, padding: 14,
                      background: "var(--gold-bg)", marginBottom: 12,
                    }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--gold)", marginBottom: 8 }}>
                        📁 Project Files — select to include
                      </div>
                      {projectFiles.map(pf => (
                        <label key={pf.id} style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                          cursor: "pointer", fontSize: "0.84rem", color: "var(--ink)",
                        }}>
                          <input
                            type="checkbox"
                            checked={selectedProjectFileIds.has(pf.id)}
                            onChange={() => {
                              setSelectedProjectFileIds(prev => {
                                const next = new Set(prev);
                                if (next.has(pf.id)) next.delete(pf.id);
                                else next.add(pf.id);
                                return next;
                              });
                            }}
                          />
                          <span>📄</span>
                          <span style={{ fontWeight: 600 }}>{pf.filename}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div
                    className="dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (e.dataTransfer.files.length > 0) setFiles(e.dataTransfer.files);
                    }}
                    style={dragOver ? { borderColor: "var(--gold)", background: "var(--gold-bg)" } : {}}
                  >
                    <div className="dz-icon">{"\uD83D\uDCCE"}</div>
                    <div className="dz-txt">
                      Drop files or <em>browse</em> — PDF plans, specs, images
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => setFiles(e.target.files)}
                      style={{ display: "none" }}
                    />
                  </div>

                  {files && files.length > 0 &&
                    Array.from(files).map((file, i) => (
                      <div className="afile" key={i}>
                        <span>{"\uD83D\uDCC4"}</span>
                        <span className="afile-name">{file.name}</span>
                        <span className="afile-size">{(file.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}

                  {/* File links */}
                  <div style={{
                    marginTop: 14, padding: "12px 14px", background: "var(--bg)",
                    borderRadius: 8, border: "1px solid var(--border)",
                  }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      🔗 File Links
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: 10 }}>
                      Add links to files from Google Drive, Dropbox, OneDrive, etc.
                    </div>

                    {fileLinks.map((link, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                        borderBottom: i < fileLinks.length - 1 ? "1px solid var(--border)" : "none",
                      }}>
                        <span style={{ fontSize: "0.78rem" }}>🔗</span>
                        <a href={link.url} target="_blank" rel="noreferrer" style={{
                          flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "var(--gold)",
                          textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {link.label || link.url}
                        </a>
                        <button
                          type="button"
                          onClick={() => setFileLinks(fileLinks.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.7rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    <div style={{ display: "flex", gap: 6, marginTop: fileLinks.length > 0 ? 8 : 0 }}>
                      <input
                        className="finput"
                        value={newLinkUrl}
                        onChange={e => setNewLinkUrl(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        style={{ flex: 2, fontSize: "0.82rem" }}
                      />
                      <input
                        className="finput"
                        value={newLinkLabel}
                        onChange={e => setNewLinkLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newLinkUrl.trim()) {
                            e.preventDefault();
                            setFileLinks([...fileLinks, { url: newLinkUrl.trim(), label: newLinkLabel.trim() || newLinkUrl.trim() }]);
                            setNewLinkUrl(""); setNewLinkLabel("");
                          }
                        }}
                        placeholder="Label (optional)"
                        style={{ flex: 1, fontSize: "0.82rem" }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => {
                          if (newLinkUrl.trim()) {
                            setFileLinks([...fileLinks, { url: newLinkUrl.trim(), label: newLinkLabel.trim() || newLinkUrl.trim() }]);
                            setNewLinkUrl(""); setNewLinkLabel("");
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-gold"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "12px",
                  fontSize: "0.88rem",
                  fontWeight: 800,
                  opacity: submitting ? 0.5 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Creating..." : "Create Bid Request \u2192"}
              </button>
            </form>
          </div>

          {/* Summary sidebar */}
          <div className="sumcard">
            <h3>Summary</h3>
            <div className="srow">
              <span>Title</span>
              <span>{title || "\u2014"}</span>
            </div>
            <div className="srow">
              <span>Project</span>
              <span>{breadcrumbProject || "Unassigned"}</span>
            </div>
            <div className="srow">
              <span>Deadline</span>
              <span>{deadline || "\u2014"}</span>
            </div>
            <div className="srow">
              <span>Parameters</span>
              <span style={{ color: validParams.length > 0 ? "var(--gold)" : undefined }}>
                {validParams.length}
              </span>
            </div>
            <div className="srow">
              <span>Files</span>
              <span>{(files ? files.length : 0) + fileLinks.length}</span>
            </div>
            {fileLinks.length > 0 && (
              <div className="srow">
                <span>Links</span>
                <span style={{ color: "var(--gold)" }}>{fileLinks.length}</span>
              </div>
            )}
            <hr className="sdiv" />
            <div
              style={{
                fontSize: "0.67rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--muted)",
                marginBottom: "10px",
              }}
            >
              Timeline
            </div>
            <div className="tl">
              <div className="tl-dot" style={{ background: "var(--green)" }}></div>
              <div>
                <div className="tl-main">Emails sent</div>
                <div className="tl-sub">Immediately on publish</div>
              </div>
            </div>
            <div className="tl">
              <div className="tl-dot" style={{ background: "var(--blue)" }}></div>
              <div>
                <div className="tl-main">Auto-reminder</div>
                <div className="tl-sub">3 days before deadline</div>
              </div>
            </div>
            <div className="tl">
              <div className="tl-dot" style={{ background: "var(--border2)" }}></div>
              <div>
                <div className="tl-main">Bid Deadline</div>
                <div className="tl-sub">{deadline ? new Date(deadline + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set"}</div>
              </div>
            </div>
            <hr className="sdiv" />
            <div className="infobox">
              Vendors get a unique link — no login needed. They can submit multiple pricing options.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
