"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, string> = { name };
      if (address) body.address = address;
      if (type) body.type = type;
      if (description) body.description = description;

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create project");
      }

      showToast("Project created successfully!");
      router.push("/customer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page on">
      <div className="fstrip">
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          <Link href="/customer" style={{ color: "var(--blueprint)", textDecoration: "none", fontWeight: 600 }}>
            Dashboard
          </Link>
          <span style={{ color: "var(--border2)", margin: "0 6px" }}>{"\u203A"}</span>
          <strong style={{ color: "var(--ink)" }}>New Project</strong>
        </span>
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

              <div className="fcard">
                <div className="fsect">
                  <div className="fsect-title">
                    <span className="fsect-num">1</span> Project Info
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label className="flbl">Name *</label>
                      <input
                        className="finput"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. 245 Park Avenue Renovation"
                      />
                    </div>
                    <div className="fg">
                      <label className="flbl">Address</label>
                      <input
                        className="finput"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. 245 Park Ave, New York, NY"
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label className="flbl">Type</label>
                      <select
                        className="finput"
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                      >
                        <option value="">-- Select Type --</option>
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Mixed-Use">Mixed-Use</option>
                        <option value="Renovation">Renovation</option>
                      </select>
                    </div>
                  </div>
                  <div className="frow one fg">
                    <label className="flbl">Description</label>
                    <textarea
                      className="finput"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the project scope..."
                    />
                  </div>
                </div>
              </div>

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
                {submitting ? "Creating..." : "Create Project \u2192"}
              </button>
            </form>
          </div>

          {/* Summary sidebar */}
          <div className="sumcard">
            <h3>Summary</h3>
            <div className="srow">
              <span>Name</span>
              <span>{name || "\u2014"}</span>
            </div>
            <div className="srow">
              <span>Address</span>
              <span>{address || "\u2014"}</span>
            </div>
            <div className="srow">
              <span>Type</span>
              <span>{type || "\u2014"}</span>
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
                <div className="tl-main">Project created</div>
                <div className="tl-sub">Set up project details</div>
              </div>
            </div>
            <div className="tl">
              <div className="tl-dot" style={{ background: "var(--blue)" }}></div>
              <div>
                <div className="tl-main">Add bid requests</div>
                <div className="tl-sub">Create bids for each trade</div>
              </div>
            </div>
            <div className="tl">
              <div className="tl-dot" style={{ background: "var(--gold)" }}></div>
              <div>
                <div className="tl-main">Invite vendors</div>
                <div className="tl-sub">Send bid invitations</div>
              </div>
            </div>
            <hr className="sdiv" />
            <div className="infobox">
              After creating the project, you can add bid requests and invite vendors.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
