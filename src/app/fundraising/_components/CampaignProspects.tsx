"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/fundraising-format";

// Campaign prospects panel — internal call-list / sandbox for the campaign manager.
//
// Each row is a donor the manager is thinking about for THIS campaign with an estimated
// dollar amount. Not a pledge, not collectible. Status flow: pending → called → confirmed
// / declined. Once confirmed, the user is expected to create a real pledge from the
// donor's profile (we don't auto-create one — keeps the data model clean and gives the
// user flexibility on terms).

interface ProspectRow {
  id: string;
  donor_id: string;
  donor_name: string;
  hebrew_name: string | null;
  organization: string | null;
  donor_status: string;
  primary_phone: string | null;
  estimated_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  contacted_at: string | null;
}

interface Summary {
  total_count: number;
  total_estimated: number;
  confirmed_count: number;
  confirmed_estimated: number;
  pending_count: number;
}

interface DonorOption {
  id: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  email: string | null;
  organization: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "rgba(10,16,25,0.6)", bg: "rgba(10,16,25,0.06)" },
  called: { label: "Called", color: "var(--blueprint)", bg: "rgba(28,93,142,0.1)" },
  confirmed: { label: "Confirmed", color: "var(--shed-green)", bg: "rgba(45,122,61,0.12)" },
  declined: { label: "Declined", color: "var(--cone-orange)", bg: "rgba(232,93,31,0.12)" },
};

export default function CampaignProspects({ projectId }: { projectId: string }) {
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/fundraising/projects/${projectId}/prospects`)
      .then((r) => (r.ok ? r.json() : { prospects: [], summary: null }))
      .then((d) => {
        setProspects(d.prospects || []);
        setSummary(d.summary || null);
        setLoading(false);
      });
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0, opacity: 0.7 }}>
            Prospect list
          </h2>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4, lineHeight: 1.5 }}>
            People you&apos;re thinking of asking, with estimated amounts. Private to you — not pledges, not in Collections.
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: "7px 14px",
            background: "var(--cast-iron)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          + Add prospect
        </button>
      </div>

      {/* Summary */}
      {summary && summary.total_count > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
          <Stat label="Prospects" value={String(summary.total_count)} tone="default" />
          <Stat label="Estimated total" value={fmtMoney(summary.total_estimated)} tone="info" />
          <Stat label="Confirmed" value={`${summary.confirmed_count} · ${fmtMoney(summary.confirmed_estimated)}`} tone="success" />
          <Stat label="Pending calls" value={String(summary.pending_count)} tone="warn" />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, opacity: 0.55, fontSize: 12 }}>Loading…</div>
      ) : prospects.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", border: "1px dashed rgba(10,16,25,0.12)", borderRadius: 10, fontSize: 13, opacity: 0.6 }}>
          No prospects yet. Click <strong>+ Add prospect</strong> to start your call list.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {prospects.map((p) => (
            <ProspectListItem key={p.id} prospect={p} projectId={projectId} onChanged={load} />
          ))}
        </ul>
      )}

      {showAdd && (
        <AddProspectModal
          projectId={projectId}
          existingDonorIds={new Set(prospects.map((p) => p.donor_id))}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </section>
  );
}

// ----- Single-row list item with inline status / amount editing + delete -----

function ProspectListItem({
  prospect,
  projectId,
  onChanged,
}: {
  prospect: ProspectRow;
  projectId: string;
  onChanged: () => void;
}) {
  const [editingAmt, setEditingAmt] = useState(false);
  const [amtValue, setAmtValue] = useState(String(prospect.estimated_amount));
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/fundraising/projects/${projectId}/prospects/${prospect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Remove ${prospect.donor_name} from the prospect list?`)) return;
    setBusy(true);
    await fetch(`/api/fundraising/projects/${projectId}/prospects/${prospect.id}`, { method: "DELETE" });
    setBusy(false);
    onChanged();
  }

  async function saveAmt() {
    const n = Number(amtValue);
    if (!Number.isFinite(n) || n < 0) return setEditingAmt(false);
    await patch({ estimated_amount: n });
    setEditingAmt(false);
  }

  const statusCfg = STATUS_LABELS[prospect.status] || STATUS_LABELS.pending;

  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 110px 110px auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 4px",
        borderBottom: "1px solid rgba(10,16,25,0.06)",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Link href={`/fundraising/donors/${prospect.donor_id}`} style={{ color: "var(--cast-iron)", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          {prospect.donor_name}
        </Link>
        {prospect.hebrew_name && (
          <div style={{ fontSize: 12, opacity: 0.6, direction: "rtl", fontFamily: "'Frank Ruhl Libre', serif" }}>
            {prospect.hebrew_name}
          </div>
        )}
        <div style={{ fontSize: 11, opacity: 0.6, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {prospect.organization && <span>{prospect.organization}</span>}
          {prospect.primary_phone && (
            <a href={`tel:${prospect.primary_phone}`} style={{ color: "var(--blueprint)", textDecoration: "none" }}>
              {prospect.primary_phone}
            </a>
          )}
        </div>
        {prospect.notes && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, fontStyle: "italic" }}>{prospect.notes}</div>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        {editingAmt ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={amtValue}
            onChange={(e) => setAmtValue(e.target.value)}
            onBlur={saveAmt}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveAmt();
              if (e.key === "Escape") setEditingAmt(false);
            }}
            autoFocus
            style={{
              width: "100%",
              padding: "5px 8px",
              border: "1px solid rgba(10,16,25,0.18)",
              borderRadius: 6,
              fontSize: 13,
              textAlign: "right",
              outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => {
              setAmtValue(String(prospect.estimated_amount));
              setEditingAmt(true);
            }}
            style={{
              background: "transparent",
              border: "none",
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: 14,
              fontVariantNumeric: "tabular-nums",
              cursor: "pointer",
              color: "var(--cast-iron)",
            }}
            title="Click to edit estimated amount"
          >
            {fmtMoney(prospect.estimated_amount)}
          </button>
        )}
      </div>

      <select
        value={prospect.status}
        onChange={(e) => patch({ status: e.target.value })}
        style={{
          padding: "5px 8px",
          border: "none",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          cursor: "pointer",
          background: statusCfg.bg,
          color: statusCfg.color,
          outline: "none",
        }}
      >
        <option value="pending">Pending</option>
        <option value="called">Called</option>
        <option value="confirmed">Confirmed</option>
        <option value="declined">Declined</option>
      </select>

      <button
        onClick={remove}
        title="Remove from prospect list"
        style={{
          background: "transparent",
          border: "1px solid rgba(232,93,31,0.3)",
          color: "var(--cone-orange)",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          padding: "5px 10px",
          cursor: "pointer",
        }}
      >
        Remove
      </button>
    </li>
  );
}

// ----- Add-prospect modal -----

function AddProspectModal({
  projectId,
  existingDonorIds,
  onClose,
  onCreated,
}: {
  projectId: string;
  existingDonorIds: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [query, setQuery] = useState("");
  const [selectedDonor, setSelectedDonor] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/fundraising/donors?limit=500")
      .then((r) => (r.ok ? r.json() : { donors: [] }))
      .then((d) => setDonors(Array.isArray(d) ? d : d.donors || []));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return donors.filter((d) => {
      if (existingDonorIds.has(d.id)) return false; // hide already-added
      if (!q) return true;
      const haystack = [d.first_name, d.last_name, d.hebrew_name, d.email, d.organization]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [donors, query, existingDonorIds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedDonor) return setError("Pick a donor.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return setError("Estimated amount must be a number ≥ 0.");

    setBusy(true);
    const r = await fetch(`/api/fundraising/projects/${projectId}/prospects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        donor_id: selectedDonor,
        estimated_amount: amt,
        notes: notes.trim() || null,
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setError(e.error || "Failed to add prospect");
      setBusy(false);
      return;
    }
    onCreated();
  }

  const selected = donors.find((d) => d.id === selectedDonor);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,16,25,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 200,
        padding: 20,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 22,
          width: "100%",
          maxWidth: 540,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif" }}>
          Add prospect
        </h2>
        <p style={{ fontSize: 12, opacity: 0.65, margin: "6px 0 16px", lineHeight: 1.5 }}>
          Pick a donor and your estimate for what they might give to this campaign. This is private to you — it doesn&apos;t create a pledge.
        </p>

        <label style={inputLabel}>Donor</label>
        {selected ? (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(45,122,61,0.06)",
              border: "1px solid rgba(45,122,61,0.25)",
              borderRadius: 8,
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>
                {selected.first_name} {selected.last_name || ""}
              </div>
              {selected.organization && <div style={{ fontSize: 12, opacity: 0.6 }}>{selected.organization}</div>}
            </div>
            <button
              type="button"
              onClick={() => setSelectedDonor("")}
              style={{
                padding: "4px 10px",
                background: "transparent",
                color: "var(--blueprint)",
                border: "1px solid rgba(28,93,142,0.3)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search donor by name, Hebrew name, email, or organization…"
              style={{ ...inputStyle, marginBottom: 6 }}
              autoFocus
            />
            <div
              style={{
                border: "1px solid rgba(10,16,25,0.1)",
                borderRadius: 8,
                maxHeight: 240,
                overflowY: "auto",
                marginBottom: 12,
              }}
            >
              {filtered.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", fontSize: 12, opacity: 0.55 }}>
                  No donors match{existingDonorIds.size > 0 && " (or already on this prospect list)"}.
                </div>
              ) : (
                filtered.slice(0, 30).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDonor(d.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(10,16,25,0.04)",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(10,16,25,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {d.first_name} {d.last_name || ""}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>
                      {[d.organization, d.email].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={inputLabel}>Estimated amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={inputLabel}>Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. last year gave $500"
              style={inputStyle}
            />
          </div>
        </div>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} style={submitBtn}>
            {busy ? "Adding…" : "Add prospect"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "default" | "info" | "success" | "warn" }) {
  const colors: Record<string, string> = {
    default: "var(--cast-iron)",
    info: "var(--blueprint)",
    success: "var(--shed-green)",
    warn: "var(--high-vis)",
  };
  return (
    <div
      style={{
        padding: 10,
        background: "rgba(10,16,25,0.025)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 18, fontFamily: "var(--font-bricolage), sans-serif", fontWeight: 800, color: colors[tone], marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

const inputLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
  display: "block",
  marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
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
