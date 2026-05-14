"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/fundraising-format";

interface Project {
  id: string;
  name: string;
  description: string | null;
  goal_amount: number | null;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  pledged_amount: number;
  paid_amount: number;
  donor_count: number;
  parent_id: string | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    fetch("/api/fundraising/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setProjects(d);
        setLoading(false);
      });
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fundraising/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (cancelled) return;
        setProjects(d);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status !== "active");
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Campaigns
          </h1>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
            Each donation gets tagged to a campaign so reports stay clean — General, Annual Campaign, Building Fund, etc.
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: "10px 18px",
            background: "var(--cast-iron)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          + New campaign
        </button>
      </div>

      {loading ? (
        <div style={{ opacity: 0.5, padding: 30 }}>Loading…</div>
      ) : projects.length === 0 ? (
        <Empty onCreate={() => setShowCreate(true)} />
      ) : (
        <>
          <Section title="Active" projects={active} projectsById={projectsById} onChange={load} />
          {archived.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <Section title="Archived & closed" projects={archived} projectsById={projectsById} onChange={load} />
            </div>
          )}
        </>
      )}

      {showCreate && <CreateModal projects={projects} onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function Section({
  title,
  projects,
  projectsById,
  onChange,
}: {
  title: string;
  projects: Project[];
  projectsById: Map<string, Project>;
  onChange: () => void;
}) {
  if (projects.length === 0) return null;

  // Top-level projects (no parent, or parent not in this section)
  const topLevel = projects.filter((p) => !p.parent_id || !projectsById.has(p.parent_id));
  // Children grouped by parent_id
  const childrenByParent = new Map<string, Project[]>();
  for (const p of projects) {
    if (p.parent_id && projectsById.has(p.parent_id)) {
      const arr = childrenByParent.get(p.parent_id) || [];
      arr.push(p);
      childrenByParent.set(p.parent_id, arr);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px", opacity: 0.6 }}>
        {title}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {topLevel.map((p) => {
          const children = childrenByParent.get(p.id) || [];
          return (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ProjectCard project={p} onChange={onChange} />
              {children.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18, borderLeft: "2px solid rgba(10,16,25,0.08)", marginLeft: 8 }}>
                  {children.map((c) => (
                    <ProjectCard key={c.id} project={c} onChange={onChange} isChild />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProjectCard({ project, onChange, isChild = false }: { project: Project; onChange: () => void; isChild?: boolean }) {
  const goal = project.goal_amount;
  const pct = goal && goal > 0 ? Math.min(100, (project.paid_amount / goal) * 100) : null;

  async function archive() {
    if (!confirm(`Archive "${project.name}"?`)) return;
    await fetch(`/api/fundraising/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    onChange();
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 12,
        padding: isChild ? 14 : 18,
        position: "relative",
      }}
    >
      <Link href={`/fundraising/projects/${project.id}`} style={{ textDecoration: "none", color: "var(--cast-iron)" }}>
        <h3 style={{ fontSize: isChild ? 14 : 16, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          {isChild && <span style={{ opacity: 0.4, marginRight: 4 }}>↳</span>}
          {project.name}
        </h3>
      </Link>
      {project.description && (
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12, lineHeight: 1.5 }}>{project.description}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-bricolage), sans-serif", fontWeight: 800, color: "var(--shed-green)" }}>
            {fmtMoney(project.paid_amount)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>raised</div>
        </div>
        {goal && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>of {fmtMoney(goal)}</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>goal</div>
          </div>
        )}
      </div>

      {pct !== null && (
        <div style={{ background: "rgba(10,16,25,0.06)", borderRadius: 99, height: 6, overflow: "hidden", marginBottom: 10 }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--shed-green)",
              transition: "width 300ms var(--ease-out)",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7 }}>
        <span>{project.donor_count} donor{project.donor_count === 1 ? "" : "s"}</span>
        <span>{fmtMoney(project.pledged_amount)} pledged</span>
      </div>

      {project.status === "active" && (
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <button
            onClick={archive}
            style={{ background: "transparent", border: "none", color: "rgba(10,16,25,0.4)", cursor: "pointer", fontSize: 11 }}
            title="Archive"
          >
            ⊗
          </button>
        </div>
      )}
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: "center",
        background: "#fff",
        border: "1px dashed rgba(10,16,25,0.12)",
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No campaigns yet</div>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
        Create your first campaign — General, Annual Dinner, Building Fund, etc. — to start tagging donations.
      </div>
      <button
        onClick={onCreate}
        style={{
          padding: "10px 18px",
          background: "var(--cast-iron)",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        + New campaign
      </button>
    </div>
  );
}

function CreateModal({ projects, onClose, onCreated }: { projects: Project[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [parentId, setParentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Only top-level active projects can be parents (no nested grandchildren for now)
  const parentChoices = projects.filter((p) => p.status === "active" && !p.parent_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/fundraising/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || null,
        goal_amount: goalAmount || null,
        start_date: startDate || null,
        end_date: endDate || null,
        parent_id: parentId || null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed");
      setSubmitting(false);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} style={modalStyle}>
        <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 16px" }}>
          New campaign
        </h2>
        <Field label="Campaign name *">
          <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} autoFocus />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 70, fontFamily: "inherit" }}
          />
        </Field>
        {parentChoices.length > 0 && (
          <Field label="Parent campaign (optional)">
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={inputStyle}>
              <option value="">— None (top-level campaign) —</option>
              {parentChoices.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
              Use this for sub-campaigns (e.g. &quot;Dinner 2025&quot; under &quot;Dinner&quot;).
            </div>
          </Field>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Goal amount">
            <input
              type="number"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              placeholder="100000"
              style={inputStyle}
            />
          </Field>
          <Field label="Currency">
            <input value="USD" disabled style={{ ...inputStyle, opacity: 0.6 }} />
          </Field>
          <Field label="Start date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        {error && (
          <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="submit" disabled={submitting} style={submitBtn}>{submitting ? "Saving…" : "Create campaign"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
};

const cancelBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(10,16,25,0.12)",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const submitBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 8,
  border: "none",
  background: "var(--cast-iron)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};
