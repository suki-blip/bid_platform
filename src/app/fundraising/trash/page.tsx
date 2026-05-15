"use client";

// Recycle Bin / סל מחזור — restore-or-purge view for items soft-deleted in the last 30 days.
//
// Lists fr_recycle_bin rows scoped to the current owner, oldest-clock-first so the items
// closest to auto-purge are most prominent (we sort by days_remaining ascending). Each row
// has two actions: Restore (re-inserts the snapshot into the live tables) and Delete forever
// (purges the snapshot immediately, no undo).
//
// Server only ever returns entries inside the 30-day window — anything older is invisible
// here and will be hard-purged by /api/cron/purge-trash overnight.

import { useEffect, useState } from "react";

interface TrashItem {
  id: string;
  entity_type: "donor" | "pledge" | "payment";
  entity_id: string;
  summary: string;
  deleted_by: string | null;
  deleted_at: string;
  days_in_bin: number;
  days_remaining: number;
}

const TYPE_LABEL: Record<string, string> = {
  donor: "Donor",
  pledge: "Pledge",
  payment: "Payment",
};

const TYPE_COLOR: Record<string, string> = {
  donor: "rgba(232,93,31,0.10)",   // orange tint
  pledge: "rgba(38,90,180,0.10)",  // blue tint
  payment: "rgba(40,140,80,0.10)", // green tint
};

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "donor" | "pledge" | "payment">("all");
  const [busy, setBusy] = useState<Record<string, "restore" | "purge" | null>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/fundraising/trash")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        setItems(Array.isArray(d.items) ? d.items : []);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function restore(id: string) {
    setBusy((m) => ({ ...m, [id]: "restore" }));
    setError(null);
    const r = await fetch(`/api/fundraising/trash/${id}/restore`, { method: "POST" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setError(data.error || "Restore failed");
      setBusy((m) => ({ ...m, [id]: null }));
      return;
    }
    setBusy((m) => ({ ...m, [id]: null }));
    load();
  }

  async function purge(id: string, summary: string) {
    if (!confirm(`Permanently delete "${summary}"? This cannot be undone.`)) return;
    setBusy((m) => ({ ...m, [id]: "purge" }));
    setError(null);
    const r = await fetch(`/api/fundraising/trash/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      setBusy((m) => ({ ...m, [id]: null }));
      return;
    }
    setBusy((m) => ({ ...m, [id]: null }));
    load();
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.entity_type === filter);
  const counts = {
    all: items.length,
    donor: items.filter((i) => i.entity_type === "donor").length,
    pledge: items.filter((i) => i.entity_type === "pledge").length,
    payment: items.filter((i) => i.entity_type === "payment").length,
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Recycle Bin
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Deleted donors, pledges, and payments are kept here for 30 days and can be restored. After 30 days they&apos;re permanently removed.
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "rgba(232,93,31,0.08)", border: "1px solid rgba(232,93,31,0.25)", borderRadius: 8, color: "var(--cone-orange)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {(["all", "donor", "pledge", "payment"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: "6px 12px",
              border: "1px solid " + (filter === k ? "var(--cast-iron)" : "rgba(10,16,25,0.14)"),
              background: filter === k ? "var(--cast-iron)" : "#fff",
              color: filter === k ? "#fff" : "var(--cast-iron)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {k === "all" ? "All" : TYPE_LABEL[k] + "s"} ({counts[k]})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 24, opacity: 0.6 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            background: "#fff",
            border: "1px dashed rgba(10,16,25,0.14)",
            borderRadius: 10,
            color: "rgba(10,16,25,0.5)",
          }}
        >
          {items.length === 0 ? "Nothing has been deleted recently." : "No items match this filter."}
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.10)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(10,16,25,0.025)", textAlign: "left" }}>
                <th style={th}>Type</th>
                <th style={th}>Summary</th>
                <th style={th}>Deleted</th>
                <th style={{ ...th, textAlign: "right" }}>Auto-purge in</th>
                <th style={{ ...th, textAlign: "right", width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const action = busy[item.id];
                return (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(10,16,25,0.06)" }}>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          background: TYPE_COLOR[item.entity_type] || "rgba(10,16,25,0.05)",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          borderRadius: 4,
                        }}
                      >
                        {TYPE_LABEL[item.entity_type] || item.entity_type}
                      </span>
                    </td>
                    <td style={td}>{item.summary}</td>
                    <td style={{ ...td, opacity: 0.7, whiteSpace: "nowrap" }}>
                      {new Date(item.deleted_at.replace(" ", "T") + "Z").toLocaleString()}
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: item.days_remaining <= 3 ? "var(--cone-orange)" : "inherit" }}>
                      {item.days_remaining === 0 ? "Today" : `${item.days_remaining} day${item.days_remaining === 1 ? "" : "s"}`}
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => restore(item.id)}
                        disabled={!!action}
                        style={{
                          padding: "5px 12px",
                          background: "var(--cast-iron)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: action ? "not-allowed" : "pointer",
                          marginRight: 8,
                          opacity: action ? 0.6 : 1,
                        }}
                      >
                        {action === "restore" ? "Restoring…" : "↺ Restore"}
                      </button>
                      <button
                        onClick={() => purge(item.id, item.summary)}
                        disabled={!!action}
                        style={{
                          padding: "5px 12px",
                          background: "#fff",
                          color: "var(--cone-orange)",
                          border: "1px solid rgba(232,93,31,0.4)",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: action ? "not-allowed" : "pointer",
                          opacity: action ? 0.6 : 1,
                        }}
                      >
                        {action === "purge" ? "Deleting…" : "Delete forever"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
};

const td: React.CSSProperties = {
  padding: "11px 14px",
  verticalAlign: "middle",
};
