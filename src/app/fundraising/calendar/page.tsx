"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildMonthGrid } from "@/lib/hebrew-date";
import { fmtMoney } from "@/lib/fundraising-format";

interface CalendarEvent {
  id: string;
  type: "followup" | "payment_due" | "birthday" | "anniversary" | "yahrzeit";
  date: string;
  time: string | null;
  title: string;
  donor_id: string | null;
  donor_name: string | null;
  status: string | null;
  priority: string | null;
  amount: number | null;
  method: string | null;
  project_name: string | null;
  followup_kind: string | null;
}

const TYPE_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  followup: { bg: "rgba(28,93,142,0.12)", fg: "var(--blueprint)", dot: "var(--blueprint)" },
  payment_due: { bg: "rgba(232,93,31,0.12)", fg: "var(--cone-orange)", dot: "var(--cone-orange)" },
  birthday: { bg: "rgba(240,168,48,0.18)", fg: "#a06a00", dot: "var(--high-vis)" },
  anniversary: { bg: "rgba(233,75,122,0.14)", fg: "var(--permit-pink)", dot: "var(--permit-pink)" },
  yahrzeit: { bg: "rgba(10,16,25,0.08)", fg: "rgba(10,16,25,0.7)", dot: "rgba(10,16,25,0.5)" },
};

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIdx, setMonthIdx] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIso, setSelectedIso] = useState<string | null>(today.toISOString().slice(0, 10));
  const [showCreate, setShowCreate] = useState(false);

  const todayIso = today.toISOString().slice(0, 10);
  const grid = useMemo(() => buildMonthGrid(year, monthIdx, todayIso), [year, monthIdx, todayIso]);

  function loadEvents() {
    const fromIso = grid[0].iso;
    const toEnd = new Date(grid[grid.length - 1].iso);
    toEnd.setDate(toEnd.getDate() + 1);
    const toIso = toEnd.toISOString().slice(0, 10);
    fetch(`/api/fundraising/calendar?from=${fromIso}&to=${toIso}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => {
        setEvents(d.events || []);
        setLoading(false);
      });
  }

  useEffect(() => {
    let cancelled = false;
    const fromIso = grid[0].iso;
    const toEnd = new Date(grid[grid.length - 1].iso);
    toEnd.setDate(toEnd.getDate() + 1);
    const toIso = toEnd.toISOString().slice(0, 10);
    fetch(`/api/fundraising/calendar?from=${fromIso}&to=${toIso}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => {
        if (cancelled) return;
        setEvents(d.events || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [grid]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [events]);

  function prevMonth() {
    if (monthIdx === 0) {
      setMonthIdx(11);
      setYear(year - 1);
    } else {
      setMonthIdx(monthIdx - 1);
    }
  }
  function nextMonth() {
    if (monthIdx === 11) {
      setMonthIdx(0);
      setYear(year + 1);
    } else {
      setMonthIdx(monthIdx + 1);
    }
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonthIdx(today.getMonth());
    setSelectedIso(todayIso);
  }

  const monthName = new Date(year, monthIdx, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedEvents = selectedIso ? eventsByDate[selectedIso] || [] : [];
  const selectedDay = grid.find((d) => d.iso === selectedIso);

  async function toggleFollowupDone(eventId: string, currentStatus: string | null) {
    const followupId = eventId.replace(/^followup:/, "");
    const newStatus = currentStatus === "done" ? "pending" : "done";
    await fetch(`/api/fundraising/followups/${followupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    loadEvents();
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingBottom: 18,
          marginBottom: 18,
          borderBottom: "1px solid rgba(10,16,25,0.08)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 4,
            }}
          >
            Follow-ups · payments · milestones
          </div>
          <h1
            style={{
              fontFamily: "var(--font-bricolage), sans-serif",
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            Calendar
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: "9px 16px",
            background: "var(--cast-iron)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          New follow-up
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "flex-start" }}>
        {/* Calendar grid */}
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <button onClick={prevMonth} style={navBtn}>‹ Prev</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "-0.015em" }}>
                {monthName}
              </div>
              <button
                onClick={goToday}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(10,16,25,0.55)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: 0,
                  marginTop: 1,
                }}
              >
                Today
              </button>
            </div>
            <button onClick={nextMonth} style={navBtn}>Next ›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55, padding: "6px 8px" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {grid.map((day) => {
              const dayEvents = eventsByDate[day.iso] || [];
              const isSelected = selectedIso === day.iso;
              return (
                <button
                  key={day.iso}
                  onClick={() => setSelectedIso(day.iso)}
                  style={{
                    minHeight: 84,
                    background: isSelected ? "var(--cast-iron)" : day.isShabbat ? "#fbf7ec" : "#fff",
                    color: isSelected ? "#fff" : day.isCurrentMonth ? "var(--cast-iron)" : "rgba(10,16,25,0.3)",
                    border: day.isToday && !isSelected ? "2px solid var(--blueprint)" : "1px solid rgba(10,16,25,0.06)",
                    borderRadius: 8,
                    padding: 6,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                  title={day.holidays.join(" · ")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{day.date}</span>
                    <span style={{ fontSize: 10, opacity: isSelected ? 0.7 : 0.55, direction: "rtl", fontWeight: 600 }}>
                      {day.hebrew}
                    </span>
                  </div>
                  {day.holidays.length > 0 && (
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        fontStyle: "italic",
                        color: isSelected ? "rgba(255,255,255,0.75)" : "rgba(122,79,0,0.85)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {day.holidays[0]}
                    </div>
                  )}
                  {dayEvents.length > 0 && (
                    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                      {dayEvents.slice(0, 3).map((e) => {
                        const colors = TYPE_COLORS[e.type] || TYPE_COLORS.followup;
                        return (
                          <div
                            key={e.id}
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: isSelected ? "rgba(255,255,255,0.18)" : colors.bg,
                              color: isSelected ? "#fff" : colors.fg,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              textDecoration: e.status === "done" ? "line-through" : "none",
                              opacity: e.status === "done" ? 0.5 : 1,
                            }}
                          >
                            {e.type === "payment_due" && fmtMoney(e.amount ?? 0) + " "}
                            {e.title.length > 18 ? e.title.slice(0, 18) + "…" : e.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div style={{ fontSize: 9, opacity: 0.7 }}>+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {loading && <div style={{ marginTop: 12, fontSize: 12, opacity: 0.5 }}>Loading events…</div>}
        </div>

        {/* Side panel */}
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.08)", borderRadius: 8, padding: 18, position: "sticky", top: 84 }}>
          {selectedDay ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
                  {new Date(selectedDay.iso).toLocaleDateString("en-US", { weekday: "long" })}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", letterSpacing: "-0.01em", marginTop: 2 }}>
                  {new Date(selectedDay.iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </div>
                <div style={{ fontSize: 13, color: "var(--blueprint)", fontWeight: 600, direction: "rtl", textAlign: "left" }}>
                  {selectedDay.hebrew} {selectedDay.hebrewMonth}
                </div>
                {selectedDay.holidays.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--cone-orange)", fontWeight: 700, marginTop: 4 }}>
                    {selectedDay.holidays.join(" · ")}
                  </div>
                )}
              </div>

              {selectedEvents.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", fontSize: 12, opacity: 0.55, background: "#fbf7ec", borderRadius: 8 }}>
                  No events. Click + New follow-up to schedule something.
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedEvents.map((e) => {
                    const colors = TYPE_COLORS[e.type] || TYPE_COLORS.followup;
                    const isFollowup = e.type === "followup";
                    return (
                      <li
                        key={e.id}
                        style={{
                          padding: "8px 10px",
                          background: colors.bg,
                          borderRadius: 8,
                          borderLeft: `3px solid ${colors.dot}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: colors.fg,
                                textDecoration: e.status === "done" ? "line-through" : "none",
                                opacity: e.status === "done" ? 0.6 : 1,
                              }}
                            >
                              {e.type === "payment_due" && fmtMoney(e.amount ?? 0) + " · "}
                              {e.title}
                              {e.time && <span style={{ fontWeight: 400, opacity: 0.7 }}> · {e.time}</span>}
                            </div>
                            {e.donor_name && (
                              <Link
                                href={`/fundraising/donors/${e.donor_id}`}
                                style={{ fontSize: 11, color: "var(--cast-iron)", textDecoration: "none", opacity: 0.7 }}
                              >
                                → {e.donor_name}
                              </Link>
                            )}
                            {e.project_name && (
                              <div style={{ fontSize: 10, opacity: 0.6 }}>{e.project_name}</div>
                            )}
                          </div>
                          {isFollowup && (
                            <button
                              onClick={() => toggleFollowupDone(e.id, e.status)}
                              style={{
                                background: "transparent",
                                border: `1px solid ${colors.dot}`,
                                color: colors.fg,
                                borderRadius: 4,
                                fontSize: 10,
                                padding: "2px 6px",
                                cursor: "pointer",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {e.status === "done" ? "Reopen" : "✓ Done"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Legend */}
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid rgba(10,16,25,0.06)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Legend
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(TYPE_COLORS).map(([k, c]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.dot }} />
                      <span style={{ textTransform: "capitalize", opacity: 0.7 }}>{k.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ opacity: 0.5, fontSize: 13 }}>Select a date.</div>
          )}
        </div>
      </div>

      {showCreate && selectedIso && (
        <CreateFollowupModal
          defaultDate={selectedIso}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadEvents();
          }}
        />
      )}
    </div>
  );
}

function CreateFollowupModal({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [donors, setDonors] = useState<Array<{ id: string; first_name: string; last_name: string | null }>>([]);
  const [title, setTitle] = useState("");
  const [donorId, setDonorId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [kind, setKind] = useState("call");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/fundraising/donors?limit=500")
      .then((r) => (r.ok ? r.json() : { donors: [] }))
      .then((d) => setDonors(d.donors || []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const dueAt = `${date}T${time}:00`;
    await fetch("/api/fundraising/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        donor_id: donorId || null,
        due_at: dueAt,
        kind,
        priority,
        description: description || null,
      }),
    });
    setBusy(false);
    onCreated();
  }

  return (
    <div style={overlayCss} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={modalCss}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 14px" }}>
          New follow-up
        </h2>
        <Field label="Title *">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} style={fld} autoFocus />
        </Field>
        <Field label="Donor (optional)">
          <select value={donorId} onChange={(e) => setDonorId(e.target.value)} style={fld}>
            <option value="">— No specific donor —</option>
            {donors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.first_name} {d.last_name || ""}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fld} />
          </Field>
          <Field label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fld} />
          </Field>
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={fld}>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="email">Email</option>
              <option value="task">Task</option>
              <option value="event">Event</option>
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={fld}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...fld, minHeight: 60, fontFamily: "inherit" }}
          />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ ...navBtn, padding: "9px 16px" }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "9px 18px",
              background: "var(--cast-iron)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {busy ? "Saving…" : "Schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.65,
          display: "block",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  border: "1px solid rgba(10,16,25,0.12)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--cast-iron)",
};
const fld: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const overlayCss: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
const modalCss: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
};
