"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/fundraising-format";

interface Fundraiser {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  assigned_count: number;
  call_count: number;
  total_raised: number;
}

interface Donor {
  id: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  status: string;
  total_paid: number;
  assigned_to: string | null;
  assigned_name: string | null;
}

export default function TeamPage() {
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reassignMode, setReassignMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignTarget, setReassignTarget] = useState<string>("");

  function loadAll() {
    Promise.all([
      fetch("/api/fundraising/team").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/fundraising/donors?limit=500").then((r) => (r.ok ? r.json() : { donors: [] })),
    ]).then(([fr, ds]) => {
      setFundraisers(Array.isArray(fr) ? fr : []);
      setDonors(ds.donors || []);
      setLoading(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/fundraising/team").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/fundraising/donors?limit=500").then((r) => (r.ok ? r.json() : { donors: [] })),
    ]).then(([fr, ds]) => {
      if (cancelled) return;
      setFundraisers(Array.isArray(fr) ? fr : []);
      setDonors(ds.donors || []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function removeFundraiser(id: string, name: string) {
    if (!confirm(`Remove ${name}? Their donors will become unassigned.`)) return;
    await fetch(`/api/fundraising/team/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function commitReassign() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    await fetch("/api/fundraising/team/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        donor_ids: ids,
        fundraiser_id: reassignTarget || null,
        reason: "Bulk reassignment from team page",
      }),
    });
    setSelected(new Set());
    setReassignMode(false);
    setReassignTarget("");
    loadAll();
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Team
          </h1>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
            Add fundraisers, assign donors, and see how each team member is performing.
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
          + New fundraiser
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>
      ) : (
        <>
          {/* Fundraisers */}
          <Panel title={`Fundraisers (${fundraisers.filter((f) => f.status === "active").length} active)`}>
            {fundraisers.length === 0 ? (
              <Empty>No fundraisers yet. Add one to assign donors and track performance.</Empty>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {fundraisers.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      background: "#fbf7ec",
                      border: "1px solid rgba(10,16,25,0.06)",
                      borderRadius: 10,
                      padding: 14,
                      opacity: f.status !== "active" ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "var(--blueprint)",
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          fontSize: 14,
                        }}
                      >
                        {f.name[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.name}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.email}
                        </div>
                      </div>
                      {f.status === "active" && (
                        <button
                          onClick={() => removeFundraiser(f.id, f.name)}
                          style={{ background: "transparent", border: "none", color: "var(--cone-orange)", cursor: "pointer", fontSize: 11 }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
                      <Mini label="Donors" value={String(f.assigned_count)} />
                      <Mini label="Calls" value={String(f.call_count)} />
                      <Mini label="Raised" value={fmtMoney(f.total_raised)} />
                    </div>
                    {f.status !== "active" && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: "var(--cone-orange)",
                        }}
                      >
                        {f.status}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div style={{ height: 14 }} />

          {/* Donors with assignment */}
          <Panel title={`Donor assignments (${donors.length})`}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {reassignMode ? `${selected.size} selected` : "Tick donors to bulk-reassign"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {reassignMode ? (
                  <>
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}
                    >
                      <option value="">— Unassigned —</option>
                      {fundraisers
                        .filter((f) => f.status === "active")
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                    <button onClick={commitReassign} disabled={selected.size === 0} style={primaryBtn}>
                      Assign {selected.size}
                    </button>
                    <button
                      onClick={() => {
                        setReassignMode(false);
                        setSelected(new Set());
                      }}
                      style={ghostBtn}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setReassignMode(true)} style={primaryBtn}>
                    Bulk reassign
                  </button>
                )}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#fbf7ec", textAlign: "left" }}>
                    {reassignMode && <th style={{ padding: "8px 12px", width: 30 }}></th>}
                    <Th>Donor</Th>
                    <Th>Status</Th>
                    <Th>Assigned to</Th>
                    <Th align="right">Lifetime paid</Th>
                  </tr>
                </thead>
                <tbody>
                  {donors.map((d) => (
                    <tr key={d.id} style={{ borderTop: "1px solid rgba(10,16,25,0.05)" }}>
                      {reassignMode && (
                        <td style={{ padding: "6px 12px" }}>
                          <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} />
                        </td>
                      )}
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          href={`/fundraising/donors/${d.id}`}
                          style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 700 }}
                        >
                          {d.first_name} {d.last_name || ""}
                        </Link>
                        {d.hebrew_name && (
                          <div style={{ fontSize: 11, opacity: 0.55, direction: "rtl", textAlign: "left" }}>{d.hebrew_name}</div>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 11, textTransform: "capitalize", opacity: 0.7 }}>{d.status}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12 }}>
                        {d.assigned_name || <span style={{ opacity: 0.45 }}>— Unassigned —</span>}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "var(--shed-green)", fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(d.total_paid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {showCreate && <CreateModal fundraisers={fundraisers} onClose={() => setShowCreate(false)} onCreated={loadAll} />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function CreateModal({
  fundraisers,
  onClose,
  onCreated,
}: {
  fundraisers: Fundraiser[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const _ = fundraisers;
  void _;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/fundraising/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed");
      setBusy(false);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={modal}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 14px" }}>
          New fundraiser
        </h2>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px" }}>
          They will sign in at the regular login page with the email and password you set here.
        </p>

        <Field label="Name *">
          <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus style={inputStyle} />
        </Field>
        <Field label="Email *">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Initial password * (min 8 chars)">
          <input type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        </Field>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? "Saving…" : "Add fundraiser"}</button>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px", opacity: 0.7 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 30, textAlign: "center", fontSize: 13, opacity: 0.55, background: "#fbf7ec", borderRadius: 8 }}>{children}</div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.6, textAlign: align }}>
      {children}
    </th>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--cast-iron)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid rgba(10,16,25,0.12)",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
const modal: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 480,
  maxHeight: "90vh",
  overflowY: "auto",
};
