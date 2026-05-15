"use client";

import { useState } from "react";
import { useEscape } from "@/lib/use-escape";

interface EditableCall {
  id: string;
  occurred_at: string;
  direction: string;
  channel: string;
  outcome: string | null;
  summary: string | null;
  transcript: string | null;
  duration_min: number | null;
}

export default function CallEditModal({
  donorId,
  call,
  onClose,
  onSaved,
}: {
  donorId: string;
  call: EditableCall;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscape(onClose);

  // Pre-populate from `occurred_at` (ISO datetime). Split into date + time.
  const initial = call.occurred_at ? new Date(call.occurred_at) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const initialDate = `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}`;
  const initialTime = `${pad(initial.getHours())}:${pad(initial.getMinutes())}`;

  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [direction, setDirection] = useState(call.direction || "outbound");
  const [channel, setChannel] = useState(call.channel || "phone");
  const [outcome, setOutcome] = useState(call.outcome || "");
  const [summary, setSummary] = useState(call.summary || "");
  const [transcript, setTranscript] = useState(call.transcript || "");
  const [durationMin, setDurationMin] = useState(call.duration_min !== null ? String(call.duration_min) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const occurredAt = `${date}T${time}:00`;

    const res = await fetch(`/api/fundraising/donors/${donorId}/calls/${call.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occurred_at: occurredAt,
        direction,
        channel,
        outcome: outcome.trim() || null,
        summary: summary.trim() || null,
        transcript: transcript.trim() || null,
        duration_min: durationMin || null,
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

  return (
    <div style={overlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={card}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-bricolage), sans-serif", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
          Edit call / interaction
        </h2>

        <Row>
          <L label="Direction">
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={input}>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          </L>
          <L label="Channel">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} style={input}>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="text">Text / WhatsApp</option>
              <option value="event">Event</option>
            </select>
          </L>
        </Row>

        <Row>
          <L label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
          </L>
          <L label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
          </L>
          <L label="Duration (min)">
            <input
              type="number"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              style={input}
            />
          </L>
        </Row>

        <L label="Outcome">
          <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Pledge, No answer, Follow-up needed" style={input} />
        </L>

        <L label="Summary">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            style={{ ...input, minHeight: 80, fontFamily: "inherit" }}
          />
        </L>

        <L label="Full transcript">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Full conversation transcript (optional)"
            style={{ ...input, minHeight: 120, fontFamily: "inherit" }}
          />
        </L>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={cancel}>Cancel</button>
          <button type="submit" disabled={busy} style={submitBtn}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 6 }}>{children}</div>;
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
  maxWidth: 640,
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
