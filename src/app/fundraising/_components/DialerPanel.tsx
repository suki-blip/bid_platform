"use client";

// Shared auto-dialer UI. Used by the in-app page (/fundraising/auto-dial) and the standalone
// passcode-gated page (/dialer). Endpoints are injected so each host points at its own API.

import { useCallback, useEffect, useState } from "react";

export interface DialerEndpoints {
  list: string;              // GET (list) + POST (create); same URL
  dialNow: string;          // POST (immediate / listen test)
  del: (id: string) => string; // DELETE
}

interface Step { waitSeconds: number; digits: string; }

interface ScheduledCall {
  id: string;
  to_number: string;
  steps_json: string | null;
  digits: string | null;
  label: string | null;
  scheduled_at: string;
  status: string;
  call_status: string | null;
  error: string | null;
  recurring?: number;
  recur_days?: string | null;
  recur_time?: string | null;
  last_fired_date?: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#fef3c7", fg: "#92400e", label: "Scheduled" },
  calling: { bg: "#dbeafe", fg: "#1e40af", label: "Calling…" },
  placed: { bg: "#dbeafe", fg: "#1e40af", label: "Dialed" },
  completed: { bg: "#dcfce7", fg: "#166534", label: "Completed" },
  failed: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
  recurring: { bg: "#ede9fe", fg: "#5b21b6", label: "Repeating" },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function recurSummary(c: ScheduledCall): string {
  const days = String(c.recur_days || "").split(",").filter((d) => d !== "").map((d) => DAY_LABELS[Number(d)]);
  if (!days.length) return "Repeating";
  return `Every ${days.join(", ")} · ${c.recur_time || ""}`;
}

// All scheduling in the dialer is anchored to New York time (the target system's timezone),
// regardless of the user's computer timezone.
const NY_TZ = "America/New_York";

function nyParts(date: Date): Record<string, string> {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return m;
}

// Offset (ms) of New York from UTC at a given instant (handles DST).
function nyOffsetMs(utcMs: number): number {
  const m = nyParts(new Date(utcMs));
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - utcMs;
}

// Convert a "YYYY-MM-DDTHH:MM" wall-clock string, interpreted as New York time, to a UTC Date.
function nyWallToUTC(localStr: string): Date {
  const [dp, tp] = localStr.split("T");
  const [y, mo, d] = dp.split("-").map(Number);
  const [h, mi] = tp.split(":").map(Number);
  const base = Date.UTC(y, mo - 1, d, h, mi);
  let utc = base - nyOffsetMs(base);
  utc = base - nyOffsetMs(utc); // second pass settles DST edges
  return new Date(utc);
}

// Parse a stored timestamp. Form-created rows are ISO-UTC ("…T…Z"); rows created via
// SQLite datetime('now') look like "YYYY-MM-DD HH:MM:SS" (UTC, but no zone marker) — the
// browser would wrongly read those as local time, so normalize them to explicit UTC first.
function toDate(iso: string): Date {
  let s = String(iso || "");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(" ", "T") + "Z";
  return new Date(s);
}

function fmtWhen(iso: string): string {
  const d = toDate(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { timeZone: NY_TZ, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " ET";
}

function stepsSummary(c: ScheduledCall): string {
  try {
    const steps: Step[] = c.steps_json ? JSON.parse(c.steps_json) : [];
    if (steps.length) return steps.map((s) => `${s.waitSeconds}s→${s.digits || "—"}`).join("  ");
  } catch {}
  return c.digits || "—";
}

// Default the picker to ~5 min from now, expressed as New York wall-clock time.
function defaultWhen(): string {
  const m = nyParts(new Date(Date.now() + 5 * 60 * 1000));
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

// Live "HH:MM:SS" New York clock string.
function nyClock(): string {
  const m = nyParts(new Date());
  return `${m.hour}:${m.minute}:${m.second}`;
}

// Stored UTC ISO → "YYYY-MM-DDTHH:MM" New York wall-clock, for prefilling the picker on edit.
function utcIsoToNyLocal(iso: string): string {
  const m = nyParts(toDate(iso));
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

export default function DialerPanel({ endpoints, title = "Auto-dial", subtitle }: { endpoints: DialerEndpoints; title?: string; subtitle?: string }) {
  const [calls, setCalls] = useState<ScheduledCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [clock, setClock] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [toNumber, setToNumber] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ waitSeconds: 2, digits: "" }]);
  const [label, setLabel] = useState("");
  const [whenLocal, setWhenLocal] = useState(defaultWhen);
  const [listenNumber, setListenNumber] = useState("");

  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([0]);
  const [repeatTime, setRepeatTime] = useState("09:00");
  function toggleDay(d: number) {
    setRepeatDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()));
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoints.list);
      const data = await res.json();
      if (res.ok) setCalls(data.calls || []);
    } catch {} finally { setLoading(false); }
  }, [endpoints.list]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setClock(nyClock());
    const t = setInterval(() => setClock(nyClock()), 1000);
    return () => clearInterval(t);
  }, []);

  function setStep(i: number, patch: Partial<Step>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }
  function addStep() { setSteps((s) => [...s, { waitSeconds: 2, digits: "" }]); }
  function removeStep(i: number) { setSteps((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s)); }

  function payload(extra: Record<string, unknown> = {}) {
    return { to_number: toNumber, steps, label, ...extra };
  }

  async function post(url: string, body: Record<string, unknown>, okMsg: string, key: string) {
    setError(null); setNotice(null); setBusy(key);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setNotice(okMsg);
      await load();
    } catch { setError("Request failed"); } finally { setBusy(null); }
  }

  const schedule = () => {
    if (repeat) {
      // Times are always New York time.
      return post(endpoints.list, payload({ recurring: true, recur_days: repeatDays, recur_time: repeatTime, recur_tz: NY_TZ }), "Recurring call saved.", "schedule");
    }
    // Interpret the picker value as New York wall-clock time → UTC instant.
    return post(endpoints.list, payload({ scheduled_at: nyWallToUTC(whenLocal).toISOString() }), "Call scheduled.", "schedule");
  };
  const callNow = () => post(endpoints.dialNow, payload(), "Calling now…", "now");
  const testListen = () => post(endpoints.dialNow, payload({ listen_number: listenNumber }), "Ringing your phone — answer to listen.", "test");

  function resetForm() {
    setToNumber(""); setSteps([{ waitSeconds: 2, digits: "" }]); setLabel("");
    setWhenLocal(defaultWhen()); setRepeat(false); setRepeatDays([0]); setRepeatTime("09:00");
  }

  // Load a call's settings into the form. Used by both Edit (keeps the id → updates) and
  // Duplicate (clears the id → saves as a new call).
  function loadIntoForm(c: ScheduledCall) {
    setToNumber(c.to_number);
    setLabel(c.label || "");
    try {
      const s: Step[] = c.steps_json ? JSON.parse(c.steps_json) : [];
      setSteps(s.length ? s : [{ waitSeconds: 2, digits: "" }]);
    } catch { setSteps([{ waitSeconds: 2, digits: "" }]); }
    if (c.recurring) {
      setRepeat(true);
      setRepeatDays(String(c.recur_days || "").split(",").filter((d) => d !== "").map(Number));
      setRepeatTime(c.recur_time || "09:00");
    } else {
      setRepeat(false);
      setWhenLocal(utcIsoToNyLocal(c.scheduled_at));
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(c: ScheduledCall) {
    setError(null); setNotice(null);
    loadIntoForm(c);
    setEditingId(c.id);
  }

  function startDuplicate(c: ScheduledCall) {
    setError(null);
    setEditingId(null);
    loadIntoForm(c);
    if (!c.recurring) setWhenLocal(defaultWhen()); // fresh future time for a one-off copy
    setNotice("Copied to the form — adjust and save it as a new call.");
  }

  function cancelEdit() { setEditingId(null); resetForm(); }

  const update = async () => {
    if (!editingId) return;
    const body = repeat
      ? payload({ recurring: true, recur_days: repeatDays, recur_time: repeatTime, recur_tz: NY_TZ })
      : payload({ scheduled_at: nyWallToUTC(whenLocal).toISOString() });
    setError(null); setNotice(null); setBusy("schedule");
    try {
      const res = await fetch(endpoints.del(editingId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setNotice("Changes saved.");
      setEditingId(null); resetForm();
      await load();
    } catch { setError("Request failed"); } finally { setBusy(null); }
  };

  async function remove(id: string) {
    if (!confirm("Cancel this call?")) return;
    const res = await fetch(endpoints.del(id), { method: "DELETE" });
    if (res.ok) setCalls((cs) => cs.filter((c) => c.id !== id));
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(10,16,25,0.15)", fontSize: 14, boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 5, display: "block" };
  const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ padding: "10px 18px", background: bg, color: fg, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>{title}</h1>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
            {subtitle || "Calls from your verified number and keys the digits automatically. Build the sequence below — each step waits, then presses keys. Test it live, run it now, or schedule it."}
          </div>
        </div>
        <div style={{ textAlign: "right", background: "#fff", border: "1px solid rgba(10,16,25,0.1)", borderRadius: 10, padding: "8px 14px", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.5, fontWeight: 700 }}>New York time</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{clock || "—"}</div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.1)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Number to call (international)</label>
            <input style={inputStyle} placeholder="+18332783959" value={toNumber} onChange={(e) => setToNumber(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Label (optional)</label>
            <input style={inputStyle} placeholder="What is this call for?" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>

        <label style={labelStyle}>Sequence — wait, then press</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
          {steps.map((st, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, opacity: 0.6, width: 52 }}>Wait</span>
              <input type="number" min={0} max={60} value={st.waitSeconds} onChange={(e) => setStep(i, { waitSeconds: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
              <span style={{ fontSize: 13, opacity: 0.6 }}>sec, press</span>
              <input value={st.digits} onChange={(e) => setStep(i, { digits: e.target.value })} placeholder="e.g. 1  or  1234#" style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }} />
              <button onClick={() => removeStep(i)} title="Remove" style={{ ...btn("transparent", "#991b1b"), border: "1px solid rgba(10,16,25,0.15)", padding: "8px 12px" }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={addStep} style={{ ...btn("transparent", "#1e40af"), border: "1px dashed rgba(30,64,175,0.4)", padding: "8px 14px", marginBottom: 8 }}>+ Add step</button>
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 16 }}>Digits: <code>0-9</code>, <code>*</code>, <code>#</code>. Each step waits the given seconds, then keys the digits.</div>

        {editingId && <div style={{ marginBottom: 12, padding: "10px 12px", background: "#ede9fe", color: "#5b21b6", borderRadius: 8, fontSize: 13 }}>Editing an existing call — change the fields above and press <b>Update</b> (or Cancel edit).</div>}
        {error && <div style={{ marginBottom: 12, padding: "10px 12px", background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontSize: 13 }}>{error}</div>}
        {notice && <div style={{ marginBottom: 12, padding: "10px 12px", background: "#dcfce7", color: "#166534", borderRadius: 8, fontSize: 13 }}>{notice}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", borderTop: "1px solid rgba(10,16,25,0.08)", paddingTop: 16 }}>
          <button onClick={callNow} disabled={!!busy} style={{ ...btn("#0f0f0f"), opacity: busy ? 0.6 : 1 }}>{busy === "now" ? "Calling…" : "Call now"}</button>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            {repeat ? (
              <div>
                <label style={labelStyle}>Repeat on · time (NY)</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    {DAY_LABELS.map((d, i) => (
                      <button key={i} onClick={() => toggleDay(i)} title={d}
                        style={{ width: 34, height: 38, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: repeatDays.includes(i) ? "none" : "1px solid rgba(10,16,25,0.15)",
                          background: repeatDays.includes(i) ? "#5b21b6" : "transparent",
                          color: repeatDays.includes(i) ? "#fff" : "rgba(10,16,25,0.6)" }}>{d[0]}</button>
                    ))}
                  </div>
                  <input style={{ ...inputStyle, width: 110 }} type="time" value={repeatTime} onChange={(e) => setRepeatTime(e.target.value)} />
                </div>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Date &amp; time (NY)</label>
                <input style={inputStyle} type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} />
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>Runs once, on this exact date and time.</div>
              </div>
            )}
            <button onClick={editingId ? update : schedule} disabled={!!busy} style={{ ...btn("#d97706"), opacity: busy ? 0.6 : 1 }}>{busy === "schedule" ? "…" : editingId ? "Update" : repeat ? "Save repeat" : "Schedule"}</button>
            {editingId && <button onClick={cancelEdit} disabled={!!busy} style={{ ...btn("transparent", "#991b1b"), border: "1px solid rgba(10,16,25,0.15)", paddingBottom: 9 }}>Cancel edit</button>}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, opacity: 0.75, cursor: "pointer", paddingBottom: 9 }}>
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginLeft: "auto" }}>
            <div>
              <label style={labelStyle}>Test — ring me to listen</label>
              <input style={inputStyle} placeholder="+16465097458" value={listenNumber} onChange={(e) => setListenNumber(e.target.value)} />
            </div>
            <button onClick={testListen} disabled={!!busy || !listenNumber} style={{ ...btn("#0e7490"), opacity: busy || !listenNumber ? 0.5 : 1 }}>{busy === "test" ? "…" : "Test"}</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 30, opacity: 0.5 }}>Loading…</div>
      ) : calls.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", background: "#fff", border: "1px dashed rgba(10,16,25,0.12)", borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No calls yet</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>Build a sequence above and call now, schedule, or test.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.1)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.5 }}>
                <th style={{ padding: "12px 16px" }}>When</th>
                <th style={{ padding: "12px 16px" }}>Number</th>
                <th style={{ padding: "12px 16px" }}>Sequence</th>
                <th style={{ padding: "12px 16px" }}>Label</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}></th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => {
                const st = STATUS_STYLE[c.status] || { bg: "#eee", fg: "#333", label: c.status };
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid rgba(10,16,25,0.07)" }}>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>{c.recurring ? recurSummary(c) : fmtWhen(c.scheduled_at)}</td>
                    <td style={{ padding: "12px 16px", fontVariantNumeric: "tabular-nums" }}>{c.to_number}</td>
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12 }}>{stepsSummary(c)}</td>
                    <td style={{ padding: "12px 16px", opacity: c.label ? 1 : 0.4 }}>{c.label || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: st.bg, color: st.fg, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{st.label}</span>
                      {c.status === "failed" && c.error && <div style={{ fontSize: 11, color: "#991b1b", marginTop: 3, maxWidth: 220 }}>{c.error}</div>}
                      {c.recurring && c.last_fired_date && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Last ran {c.last_fired_date}{c.call_status ? ` · ${c.call_status}` : ""}</div>}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button onClick={() => startDuplicate(c)} title="Copy to the form as a new call" style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(10,16,25,0.15)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Copy</button>
                      {(c.status === "pending" || c.status === "recurring") && (
                        <button onClick={() => startEdit(c)} style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(10,16,25,0.15)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                      )}
                      {(c.status === "pending" || c.status === "calling" || c.status === "recurring") && (
                        <button onClick={() => remove(c.id)} style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(10,16,25,0.15)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{c.status === "recurring" ? "Stop" : "Cancel"}</button>
                      )}
                      {(c.status === "placed" || c.status === "completed" || c.status === "failed") && (
                        playingId === c.id ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <audio controls autoPlay src={`/api/calls/recording?id=${c.id}`} onError={() => setRecError(c.id)} style={{ height: 34 }} />
                            {recError === c.id && <span style={{ fontSize: 11, color: "#991b1b" }}>Recording not ready yet</span>}
                          </div>
                        ) : (
                          <button onClick={() => { setRecError(null); setPlayingId(c.id); }} style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(10,16,25,0.15)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>▶ Recording</button>
                        )
                      )}
                      </div>
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
