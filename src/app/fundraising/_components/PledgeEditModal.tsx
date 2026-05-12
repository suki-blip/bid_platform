"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/fundraising-format";

// Pledge edit + delete modal. PATCH supports a small set of fields (the API only
// updates fr_pledges itself, not its installment rows); delete cascades to all
// fr_pledge_payments via the DB foreign key.
//
// We don't expose installments_total / payment_plan edits here — changing them after
// the fact wouldn't regenerate installment rows, so it'd lie about reality. If the user
// needs a different plan they should delete + recreate.

interface EditablePledge {
  id: string;
  amount: number;
  paid_amount?: number;
  status: string;
  pledge_date: string;
  due_date?: string | null;
  project_id?: string | null;
  notes?: string | null;
  collection_mode?: string | null;
  // Donor context — required so the Delete dialog can fetch the donor's OTHER pledges
  // (for the 'move' option) and so we know whose totals to recompute.
  donor_id: string;
  donor_label?: string;
}

// Used in the Delete dialog's "Move payments to another pledge" dropdown
interface SiblingPledge {
  id: string;
  amount: number;
  paid_amount: number;
  status: string;
  pledge_date: string;
  project_name: string | null;
  is_standalone?: number | null;
}

interface ProjectOption { id: string; name: string }

export default function PledgeEditModal({
  pledge,
  projects,
  onClose,
  onSaved,
  onDeleted,
}: {
  pledge: EditablePledge;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [amount, setAmount] = useState(String(pledge.amount));
  const [status, setStatus] = useState(pledge.status || "open");
  const [pledgeDate, setPledgeDate] = useState(pledge.pledge_date || "");
  const [dueDate, setDueDate] = useState(pledge.due_date || "");
  const [projectId, setProjectId] = useState(pledge.project_id || "");
  const [notes, setNotes] = useState(pledge.notes || "");
  // collection_mode is a metadata flag. Editing it here updates the row but does NOT
  // regenerate scheduled installment rows — that's a separate, riskier operation we leave
  // to delete-and-recreate.
  const [collectionMode, setCollectionMode] = useState<"manual" | "automatic">(
    pledge.collection_mode === "automatic" ? "automatic" : "manual",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Delete-dialog state. Opened from the "Delete pledge" button when there are paid
  // payments on the pledge. Lets the user pick what happens to the payments.
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  type DeleteAction = "delete" | "move" | "standalone";
  const [deleteAction, setDeleteAction] = useState<DeleteAction>("delete");
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [standaloneProjectId, setStandaloneProjectId] = useState<string>("");
  const [siblings, setSiblings] = useState<SiblingPledge[]>([]);

  // Lazy-load sibling pledges (other pledges of the same donor) only when the dialog opens
  useEffect(() => {
    if (!showDeleteDialog) return;
    if (siblings.length > 0) return;
    fetch(`/api/fundraising/donors/${pledge.donor_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.pledges) return;
        const others = (d.pledges as SiblingPledge[]).filter(
          (p) => p.id !== pledge.id && !p.is_standalone,
        );
        setSiblings(others);
      });
  }, [showDeleteDialog, pledge.donor_id, pledge.id, siblings.length]);

  // Show a warning if the user tries to set an amount LOWER than what's already paid.
  // Server doesn't reject this (it's just a number), but the UI flags it as suspicious.
  const paid = Number(pledge.paid_amount || 0);
  const remaining = Math.max(0, Number(amount) - paid);
  const wouldOverpay = paid > 0 && Number(amount) < paid;

  // Trap Escape to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/fundraising/pledges/${pledge.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount ? Number(amount) : null,
        status,
        pledge_date: pledgeDate || null,
        due_date: dueDate || null,
        project_id: projectId || null,
        notes: notes.trim() || null,
        collection_mode: collectionMode,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed to save");
      setBusy(false);
      return;
    }
    onSaved();
  }

  function onClickDelete() {
    // If the pledge has zero paid money, just confirm + cascade delete. Otherwise open
    // the 3-option dialog so the user decides what happens to the existing payments.
    if (paid === 0) {
      if (!confirm(`Delete this pledge${pledge.donor_label ? ` for ${pledge.donor_label}` : ""}? This cannot be undone.`)) return;
      runDelete("delete");
      return;
    }
    setShowDeleteDialog(true);
  }

  async function runDelete(action: DeleteAction) {
    setBusy(true);
    setError("");

    const params = new URLSearchParams();
    params.set("payment_action", action);
    if (action === "move") {
      if (!moveTargetId) {
        setError("Please pick a target pledge.");
        setBusy(false);
        return;
      }
      params.set("target_pledge_id", moveTargetId);
    } else if (action === "standalone" && standaloneProjectId) {
      params.set("project_id", standaloneProjectId);
    }

    const res = await fetch(`/api/fundraising/pledges/${pledge.id}?${params}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed to delete");
      setBusy(false);
      return;
    }
    setShowDeleteDialog(false);
    if (onDeleted) onDeleted();
    else onSaved();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} style={card}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          Edit pledge
        </h2>
        {pledge.donor_label && (
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 14 }}>{pledge.donor_label}</div>
        )}

        {/* Snapshot of current balance */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            padding: 12,
            background: "rgba(28,93,142,0.04)",
            border: "1px solid rgba(28,93,142,0.18)",
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <Stat label="Pledged" value={fmtMoney(Number(amount) || pledge.amount)} />
          <Stat label="Paid" value={fmtMoney(paid)} tone="green" />
          <Stat label="Remaining" value={fmtMoney(remaining)} tone={remaining === 0 ? "green" : "orange"} />
        </div>

        <Row>
          <L label="Pledged amount *">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={input}
            />
            {wouldOverpay && (
              <div style={{ fontSize: 11, color: "var(--cone-orange)", marginTop: 4 }}>
                ⚠ Pledged less than what&apos;s already paid ({fmtMoney(paid)}). The donor will appear over-paid.
              </div>
            )}
          </L>
          <L label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
              <option value="open">Open</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </L>
        </Row>

        <Row>
          <L label="Pledge date">
            <input type="date" value={pledgeDate} onChange={(e) => setPledgeDate(e.target.value)} style={input} />
          </L>
          <L label="Due date (optional)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} />
          </L>
        </Row>

        <L label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={input}>
            <option value="">— General —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </L>

        <L label="Collection mode">
          <select
            value={collectionMode}
            onChange={(e) => setCollectionMode(e.target.value as "manual" | "automatic")}
            style={input}
          >
            <option value="manual">Manual — chase each installment monthly</option>
            <option value="automatic">Automatic — donor pays via auto-debit</option>
          </select>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
            ⓘ Changing this updates the metadata only. The existing scheduled rows stay as-is.
            To re-generate the schedule, delete + recreate the pledge.
          </div>
        </L>

        <L label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...input, minHeight: 60, fontFamily: "inherit" }}
          />
        </L>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClickDelete}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(232,93,31,0.3)",
              background: "transparent",
              color: "var(--cone-orange)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
            title="Permanently delete this pledge and all its payments"
          >
            Delete pledge
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={cancel}>Cancel</button>
            <button type="submit" disabled={busy} style={submitBtn}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      </form>

      {/* Delete dialog — shown when the pledge has paid money on it. The user has to decide
          what happens to the existing payments before we can cascade-delete. */}
      {showDeleteDialog && (
        <div
          style={{ ...overlay, zIndex: 250 }}
          onClick={() => {
            if (!busy) setShowDeleteDialog(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, maxWidth: 540 }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Delete pledge — what about the payments?</h3>
            <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 14px", lineHeight: 1.5 }}>
              This pledge has <strong>{fmtMoney(paid)}</strong> already received. Choose what should
              happen to those payment records.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Option 1 — Delete payments too */}
              <label style={optionRow(deleteAction === "delete")}>
                <input
                  type="radio"
                  name="del-action"
                  checked={deleteAction === "delete"}
                  onChange={() => setDeleteAction("delete")}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>Delete the payments too</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    Removes the pledge and every payment row attached to it. Use this when the whole
                    pledge was entered by mistake.
                  </div>
                </div>
              </label>

              {/* Option 2 — Move to another pledge */}
              <label style={optionRow(deleteAction === "move")}>
                <input
                  type="radio"
                  name="del-action"
                  checked={deleteAction === "move"}
                  onChange={() => setDeleteAction("move")}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>Move the payments to another pledge</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    Re-attributes every payment to a different pledge of this donor. Use when the
                    payments really belonged to another commitment.
                  </div>
                  {deleteAction === "move" && (
                    <div style={{ marginTop: 8 }}>
                      {siblings.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.6, padding: 8, background: "rgba(10,16,25,0.04)", borderRadius: 6 }}>
                          No other pledges for this donor.
                        </div>
                      ) : (
                        <select value={moveTargetId} onChange={(e) => setMoveTargetId(e.target.value)} style={input}>
                          <option value="">— Pick a pledge —</option>
                          {siblings.map((p) => {
                            const remaining = Math.max(0, p.amount - p.paid_amount);
                            return (
                              <option key={p.id} value={p.id}>
                                {fmtMoney(p.amount)} pledged · {fmtMoney(remaining)} remaining
                                {p.project_name ? ` · ${p.project_name}` : ""} · {p.pledge_date} · {p.status}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </label>

              {/* Option 3 — Keep as standalone donations */}
              <label style={optionRow(deleteAction === "standalone")}>
                <input
                  type="radio"
                  name="del-action"
                  checked={deleteAction === "standalone"}
                  onChange={() => setDeleteAction("standalone")}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>Keep as standalone donations</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    Converts each payment into its own free donation — no pledge tracking, just the
                    money. Optionally tag them to a project.
                  </div>
                  {deleteAction === "standalone" && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
                        Project (optional)
                      </label>
                      <select value={standaloneProjectId} onChange={(e) => setStandaloneProjectId(e.target.value)} style={input}>
                        <option value="">— General (no project) —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </label>
            </div>

            {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 10 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => setShowDeleteDialog(false)} disabled={busy} style={cancel}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => runDelete(deleteAction)}
                disabled={busy || (deleteAction === "move" && !moveTargetId)}
                style={{ ...submitBtn, background: "var(--cone-orange, #e85d1f)" }}
              >
                {busy ? "Working…" : "Delete pledge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function optionRow(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: 12,
    border: active ? "2px solid var(--cast-iron)" : "1px solid rgba(10,16,25,0.12)",
    borderRadius: 10,
    cursor: "pointer",
    background: active ? "rgba(10,16,25,0.03)" : "#fff",
  };
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>{children}</div>;
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "orange" }) {
  const color = tone === "green" ? "var(--shed-green)" : tone === "orange" ? "var(--cone-orange)" : "var(--cast-iron)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 580,
  maxHeight: "90vh",
  overflowY: "auto",
};
const input: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const cancel: React.CSSProperties = {
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
