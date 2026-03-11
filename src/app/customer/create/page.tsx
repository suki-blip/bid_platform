"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, Suspense } from "react";

interface Parameter {
  name: string;
  options: string[];
}

interface Project {
  id: string;
  name: string;
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
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

  const addParameter = () => {
    setParameters([...parameters, { name: "", options: [] }]);
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
          .map((p) => ({ name: p.name.trim(), options: p.options })),
      };

      if (projectId) {
        body.project_id = projectId;
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

      showToast("Bid request created successfully!");
      router.push("/customer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const validParams = parameters.filter((p) => p.name.trim() && p.options.length > 0);

  const breadcrumbProject = projectName || (selectedProjectId ? projects.find((p) => p.id === selectedProjectId)?.name : null);

  return (
    <div className="page on" style={{ display: "block" }}>
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
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      onClick={addParameter}
                      style={{ fontSize: "0.7rem" }}
                    >
                      + Add Parameter
                    </button>
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
                        border: "1.5px solid var(--border)",
                        borderRadius: "10px",
                        padding: "14px",
                        background: "var(--bg)",
                        marginBottom: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                        <input
                          className="finput"
                          value={param.name}
                          onChange={(e) => updateParameterName(paramIndex, e.target.value)}
                          placeholder="Parameter name (e.g., Color)"
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

              {/* Section 3: Attachments */}
              <div className="fcard">
                <div className="fsect">
                  <div className="fsect-title">
                    <span className="fsect-num">3</span> Attachments
                  </div>
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
              <span>{files ? files.length : 0}</span>
            </div>
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
