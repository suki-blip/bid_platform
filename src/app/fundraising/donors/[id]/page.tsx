"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/fundraising-format";
import StarRating from "../../_components/StarRating";

interface Donor {
  id: string;
  status: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  title: string | null;
  spouse_name: string | null;
  email: string | null;
  organization: string | null;
  occupation: string | null;
  birthday: string | null;
  yahrzeit: string | null;
  anniversary: string | null;
  preferred_contact: string | null;
  do_not_contact: boolean;
  source_notes: string | null;
  notes: string | null;
  total_pledged: number;
  total_paid: number;
  last_contact_at: string | null;
  next_followup_at: string | null;
  converted_at: string | null;
  created_at: string;
  tags: string[];
  financial_rating: number | null;
  giving_rating: number | null;
  source: { id: string; name: string } | null;
  assigned: { id: string; name: string; email: string } | null;
}

interface Phone {
  id: string;
  label: string;
  phone: string;
  is_primary: number;
}
interface Address {
  id: string;
  label: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  is_reception: number;
  is_primary: number;
}
interface Call {
  id: string;
  occurred_at: string;
  direction: string;
  channel: string;
  outcome: string | null;
  summary: string | null;
  transcript: string | null;
  duration_min: number | null;
  fundraiser_name: string | null;
  project_name: string | null;
}
interface Note {
  id: string;
  body: string;
  pinned: number;
  author_name: string | null;
  created_at: string;
}
interface Pledge {
  id: string;
  amount: number;
  paid_amount: number;
  status: string;
  pledge_date: string;
  due_date: string | null;
  installments_total: number;
  payment_plan: string;
  notes: string | null;
  project_name: string | null;
}
interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  installment_number: number;
  notes: string | null;
  project_name: string | null;
}

interface ProfileData {
  donor: Donor;
  phones: Phone[];
  addresses: Address[];
  calls: Call[];
  notes: Note[];
  pledges: Pledge[];
  payments: Payment[];
}

type Tab = "overview" | "calls" | "notes" | "giving" | "schedule";

interface FollowupRow {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  kind: string;
  priority: string;
  status: string;
  completed_at: string | null;
}
interface EmailRow {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  send_at: string;
  status: string;
  sent_at: string | null;
}

export default function DonorProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [callForm, setCallForm] = useState({ summary: "", outcome: "", direction: "outbound", channel: "phone", duration_min: "", transcript: "" });
  const [callBusy, setCallBusy] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [showPledgeModal, setShowPledgeModal] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  function loadSchedule() {
    if (!params?.id) return;
    fetch(`/api/fundraising/followups?donor_id=${params.id}&status=all`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFollowups(d || []));
    fetch(`/api/fundraising/emails?donor_id=${params.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEmails(d || []));
  }

  useEffect(() => {
    fetch("/api/fundraising/projects?status=active")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProjects(d.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))));
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/fundraising/followups?donor_id=${params.id}&status=all`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/fundraising/emails?donor_id=${params.id}`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([fu, em]) => {
      if (cancelled) return;
      setFollowups(fu || []);
      setEmails(em || []);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const load = useCallback(async () => {
    if (!params?.id) return;
    const r = await fetch(`/api/fundraising/donors/${params.id}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    if (!params?.id) return;
    fetch(`/api/fundraising/donors/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function convertToDonor() {
    if (!confirm("Convert this prospect to an active donor?")) return;
    const r = await fetch(`/api/fundraising/donors/${params.id}/convert`, { method: "POST" });
    if (r.ok) load();
  }

  async function addCall(e: React.FormEvent) {
    e.preventDefault();
    if (!callForm.summary.trim() && !callForm.transcript.trim()) return;
    setCallBusy(true);
    const r = await fetch(`/api/fundraising/donors/${params.id}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: callForm.summary,
        outcome: callForm.outcome || null,
        direction: callForm.direction,
        channel: callForm.channel,
        duration_min: callForm.duration_min || null,
        transcript: callForm.transcript || null,
      }),
    });
    setCallBusy(false);
    if (r.ok) {
      setCallForm({ summary: "", outcome: "", direction: "outbound", channel: "phone", duration_min: "", transcript: "" });
      setShowTranscript(false);
      load();
    }
  }

  async function deleteCall(callId: string) {
    if (!confirm("Delete this call entry?")) return;
    const r = await fetch(`/api/fundraising/donors/${params.id}/calls/${callId}`, { method: "DELETE" });
    if (r.ok) load();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    const r = await fetch(`/api/fundraising/donors/${params.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody }),
    });
    setNoteBusy(false);
    if (r.ok) {
      setNoteBody("");
      load();
    }
  }

  async function togglePin(noteId: string, pinned: number) {
    await fetch(`/api/fundraising/donors/${params.id}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    load();
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/fundraising/donors/${params.id}/notes/${noteId}`, { method: "DELETE" });
    load();
  }

  async function markPaymentPaid(paymentId: string) {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`/api/fundraising/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", paid_date: today }),
    });
    load();
  }

  async function toggleFollowupDone(fid: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "pending" : "done";
    await fetch(`/api/fundraising/followups/${fid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    loadSchedule();
  }

  async function deleteFollowup(fid: string) {
    if (!confirm("Delete this follow-up?")) return;
    await fetch(`/api/fundraising/followups/${fid}`, { method: "DELETE" });
    loadSchedule();
  }

  async function markEmailSent(eid: string) {
    await fetch(`/api/fundraising/emails/${eid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    loadSchedule();
  }

  async function deleteEmail(eid: string) {
    if (!confirm("Delete this scheduled email?")) return;
    await fetch(`/api/fundraising/emails/${eid}`, { method: "DELETE" });
    loadSchedule();
  }

  async function bouncePayment(paymentId: string) {
    if (!confirm("Mark as bounced?")) return;
    await fetch(`/api/fundraising/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "bounced" }),
    });
    load();
  }

  async function updateRating(field: "financial_rating" | "giving_rating", value: number | null) {
    if (!data) return;
    // Optimistic update
    setData({ ...data, donor: { ...data.donor, [field]: value } });
    await fetch(`/api/fundraising/donors/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function deleteDonor() {
    if (!data) return;
    if (!confirm(`Delete ${data.donor.first_name} ${data.donor.last_name || ""}? This is irreversible.`)) return;
    const r = await fetch(`/api/fundraising/donors/${params.id}`, { method: "DELETE" });
    if (r.ok) router.push(data.donor.status === "prospect" ? "/fundraising/prospects" : "/fundraising/donors");
  }

  if (loading || !data) return <div style={{ opacity: 0.5, padding: 30 }}>Loading…</div>;

  const { donor, phones, addresses, calls, notes, pledges, payments } = data;
  const isProspect = donor.status === "prospect";
  const fullName = `${donor.title ? donor.title + " " : ""}${donor.first_name} ${donor.last_name || ""}`.trim();
  const remainingPledged = donor.total_pledged - donor.total_paid;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link
          href={isProspect ? "/fundraising/prospects" : "/fundraising/donors"}
          style={{ fontSize: 12, color: "rgba(10,16,25,0.55)", textDecoration: "none", fontWeight: 500 }}
        >
          ← Back to {isProspect ? "prospects" : "donors"}
        </Link>
      </div>

      <div
        style={{
          paddingBottom: 18,
          marginBottom: 22,
          borderBottom: "1px solid rgba(10,16,25,0.08)",
          display: "flex",
          gap: 24,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 6,
            }}
          >
            {donor.status}
            {donor.do_not_contact && <span style={{ color: "var(--cone-orange)", marginLeft: 10 }}>· Do not contact</span>}
            {donor.source && <span style={{ marginLeft: 10, opacity: 0.85 }}>· From {donor.source.name}</span>}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-bricolage), sans-serif",
              fontSize: 32,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            {fullName}
          </h1>
          {donor.hebrew_name && (
            <div
              style={{
                fontSize: 20,
                fontFamily: "'Frank Ruhl Libre', 'David', serif",
                direction: "rtl",
                textAlign: "left",
                marginTop: 2,
                color: "rgba(10,16,25,0.7)",
                fontWeight: 600,
              }}
            >
              {donor.hebrew_name}
            </div>
          )}
          {(donor.organization || donor.occupation) && (
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>
              {[donor.organization, donor.occupation].filter(Boolean).join(" · ")}
            </div>
          )}
          {donor.tags.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {donor.tags.map((t) => (
                <span
                  key={t}
                  style={{
                    border: "1px solid rgba(10,16,25,0.12)",
                    padding: "2px 8px",
                    borderRadius: 3,
                    fontSize: 11,
                    fontWeight: 500,
                    color: "rgba(10,16,25,0.7)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          {isProspect ? (
            <button
              onClick={convertToDonor}
              style={{
                padding: "10px 18px",
                background: "var(--cast-iron)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                letterSpacing: "-0.005em",
              }}
            >
              Convert to donor
            </button>
          ) : (
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  opacity: 0.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Lifetime giving
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--cast-iron)",
                  fontFamily: "var(--font-bricolage), sans-serif",
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.1,
                  marginTop: 2,
                }}
              >
                {fmtMoney(donor.total_paid)}
              </div>
              {remainingPledged > 0 && (
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>
                  {fmtMoney(remainingPledged)} pledged outstanding
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <StarRating
              label="Capacity"
              value={donor.financial_rating}
              onChange={(v) => updateRating("financial_rating", v)}
            />
            <StarRating
              label="Giving"
              value={donor.giving_rating}
              onChange={(v) => updateRating("giving_rating", v)}
            />
          </div>
          <button
            onClick={deleteDonor}
            style={{
              fontSize: 11,
              color: "rgba(10,16,25,0.45)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              padding: 0,
            }}
          >
            Delete donor
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(10,16,25,0.08)", overflowX: "auto" }}>
        {(
          [
            { k: "overview", label: "Overview" },
            { k: "calls", label: `Calls (${calls.length})` },
            { k: "notes", label: `Notes (${notes.length})` },
            { k: "giving", label: `Giving (${pledges.length + payments.length})` },
            { k: "schedule", label: `Schedule (${followups.filter((f) => f.status === "pending").length + emails.filter((e) => e.status === "scheduled").length})` },
          ] as { k: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.k ? "2px solid var(--cast-iron)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: tab === t.k ? "var(--cast-iron)" : "rgba(10,16,25,0.55)",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Panel title="Contact">
            {phones.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.5 }}>No phone numbers.</div>
            ) : (
              <ul style={listStyle}>
                {phones.map((p) => (
                  <li key={p.id} style={rowStyle}>
                    <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", width: 60 }}>{p.label}</span>
                    <a href={`tel:${p.phone}`} style={{ flex: 1, fontWeight: 600, color: "var(--cast-iron)", textDecoration: "none" }}>
                      {p.phone}
                    </a>
                    {p.is_primary === 1 && <span style={pillStyle}>primary</span>}
                  </li>
                ))}
              </ul>
            )}
            {donor.email && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", marginRight: 8 }}>email</span>
                <a href={`mailto:${donor.email}`} style={{ color: "var(--blueprint)", textDecoration: "none" }}>
                  {donor.email}
                </a>
              </div>
            )}
            {donor.preferred_contact && (
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                Prefers: <strong>{donor.preferred_contact.replace("_", " ")}</strong>
              </div>
            )}
          </Panel>

          <Panel title="Addresses">
            {addresses.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.5 }}>No addresses.</div>
            ) : (
              <ul style={listStyle}>
                {addresses.map((a) => (
                  <li key={a.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", width: 60 }}>{a.label}</span>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      {a.street && <div>{a.street}</div>}
                      <div style={{ opacity: 0.7 }}>
                        {[a.city, a.state, a.zip].filter(Boolean).join(", ")}
                        {a.country ? ` · ${a.country}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                      {a.is_reception === 1 && <span style={{ ...pillStyle, background: "rgba(240,168,48,0.15)", color: "#a06a00" }}>reception</span>}
                      {a.is_primary === 1 && <span style={pillStyle}>primary</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="About">
            <KV label="Title" value={donor.title} />
            <KV label="Spouse" value={donor.spouse_name} />
            <KV label="Occupation" value={donor.occupation} />
            <KV label="Birthday" value={fmtDate(donor.birthday)} />
            <KV label="Anniversary" value={fmtDate(donor.anniversary)} />
            <KV label="Yahrzeit" value={donor.yahrzeit} />
          </Panel>

          <Panel title="Cultivation">
            <KV label="Source" value={donor.source?.name || null} />
            <KV label="Source notes" value={donor.source_notes} />
            <KV label="Assigned to" value={donor.assigned?.name || null} />
            <KV label="Last contact" value={donor.last_contact_at ? fmtDateTime(donor.last_contact_at) : null} />
            <KV label="Created" value={fmtDateTime(donor.created_at)} />
            {donor.converted_at && <KV label="Became donor" value={fmtDateTime(donor.converted_at)} />}
          </Panel>

          {donor.notes && (
            <Panel title="Profile note" full>
              <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{donor.notes}</p>
            </Panel>
          )}
        </div>
      )}

      {tab === "calls" && (
        <div>
          <Panel title="Log a call / interaction">
            <form onSubmit={addCall} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <select
                  value={callForm.direction}
                  onChange={(e) => setCallForm({ ...callForm, direction: e.target.value })}
                  style={selectStyle}
                >
                  <option value="outbound">Outbound</option>
                  <option value="inbound">Inbound</option>
                </select>
                <select
                  value={callForm.channel}
                  onChange={(e) => setCallForm({ ...callForm, channel: e.target.value })}
                  style={selectStyle}
                >
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="text">Text / WhatsApp</option>
                  <option value="event">Event</option>
                </select>
                <input
                  placeholder="Outcome (e.g. Pledge, No answer)"
                  value={callForm.outcome}
                  onChange={(e) => setCallForm({ ...callForm, outcome: e.target.value })}
                  style={selectStyle}
                />
                <input
                  type="number"
                  placeholder="Duration (min)"
                  value={callForm.duration_min}
                  onChange={(e) => setCallForm({ ...callForm, duration_min: e.target.value })}
                  style={selectStyle}
                />
              </div>
              <textarea
                placeholder="Summary — what was discussed, key points, follow-up needed"
                value={callForm.summary}
                onChange={(e) => setCallForm({ ...callForm, summary: e.target.value })}
                style={{ ...selectStyle, minHeight: 80, fontFamily: "inherit" }}
              />
              {showTranscript ? (
                <textarea
                  placeholder="Full transcript (paste or type the full conversation)"
                  value={callForm.transcript}
                  onChange={(e) => setCallForm({ ...callForm, transcript: e.target.value })}
                  style={{ ...selectStyle, minHeight: 120, fontFamily: "inherit" }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTranscript(true)}
                  style={{ alignSelf: "flex-start", padding: "4px 10px", border: "1px dashed rgba(10,16,25,0.2)", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--blueprint)" }}
                >
                  + Add full transcript
                </button>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={callBusy}
                  style={{
                    padding: "9px 18px",
                    background: "var(--cast-iron)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: callBusy ? "not-allowed" : "pointer",
                    opacity: callBusy ? 0.5 : 1,
                  }}
                >
                  {callBusy ? "Saving…" : "Log call"}
                </button>
              </div>
            </form>
          </Panel>

          <div style={{ marginTop: 14 }}>
            {calls.length === 0 ? (
              <Empty>No calls logged yet.</Empty>
            ) : (
              <ul style={{ ...listStyle, gap: 10 }}>
                {calls.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      background: "#fff",
                      border: "1px solid rgba(10,16,25,0.08)",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={pillStyle}>{c.channel}</span>
                        <span style={{ ...pillStyle, background: c.direction === "outbound" ? "rgba(28,93,142,0.1)" : "rgba(45,122,61,0.1)", color: c.direction === "outbound" ? "var(--blueprint)" : "var(--shed-green)" }}>
                          {c.direction}
                        </span>
                        {c.outcome && <span style={{ fontSize: 12, fontWeight: 700 }}>{c.outcome}</span>}
                        {c.duration_min !== null && <span style={{ fontSize: 11, opacity: 0.6 }}>{c.duration_min} min</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 11, opacity: 0.55 }}>
                          {fmtDateTime(c.occurred_at)}
                          {c.fundraiser_name ? ` · ${c.fundraiser_name}` : ""}
                        </span>
                        <button onClick={() => deleteCall(c.id)} style={{ background: "transparent", border: "none", color: "var(--cone-orange)", cursor: "pointer", fontSize: 12 }}>
                          Delete
                        </button>
                      </div>
                    </div>
                    {c.summary && <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{c.summary}</div>}
                    {c.transcript && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 11, color: "var(--blueprint)", cursor: "pointer", fontWeight: 600 }}>View full transcript</summary>
                        <div style={{ marginTop: 8, padding: 12, background: "#fbf7ec", borderRadius: 6, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                          {c.transcript}
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div>
          <Panel title="Add note">
            <form onSubmit={addNote} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                placeholder="Quick thought, reminder, family detail — anything to remember about this donor."
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                style={{ ...selectStyle, minHeight: 80, fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={noteBusy}
                  style={{
                    padding: "8px 16px",
                    background: "var(--cast-iron)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: noteBusy ? "not-allowed" : "pointer",
                    opacity: noteBusy ? 0.5 : 1,
                  }}
                >
                  {noteBusy ? "Saving…" : "Add note"}
                </button>
              </div>
            </form>
          </Panel>

          <div style={{ marginTop: 14 }}>
            {notes.length === 0 ? (
              <Empty>No notes yet.</Empty>
            ) : (
              <ul style={{ ...listStyle, gap: 10 }}>
                {notes.map((n) => (
                  <li
                    key={n.id}
                    style={{
                      background: n.pinned ? "rgba(240,168,48,0.08)" : "#fff",
                      border: "1px solid rgba(10,16,25,0.08)",
                      borderLeft: n.pinned ? "3px solid var(--high-vis)" : "1px solid rgba(10,16,25,0.08)",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 6 }}>{n.body}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>
                        {n.author_name || "Unknown"} · {fmtDateTime(n.created_at)}
                      </span>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => togglePin(n.id, n.pinned)}
                          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: n.pinned ? "var(--high-vis)" : "var(--blueprint)", fontWeight: 600 }}
                        >
                          {n.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button onClick={() => deleteNote(n.id)} style={{ background: "transparent", border: "none", color: "var(--cone-orange)", cursor: "pointer", fontSize: 12 }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "giving" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowPledgeModal(true)}
              style={{
                padding: "10px 16px",
                background: "var(--cast-iron)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              + Add pledge
            </button>
            <button
              onClick={() => setShowQuickModal(true)}
              style={{
                padding: "10px 16px",
                background: "var(--shed-green)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ⚡ Quick donation
            </button>
          </div>

          <Panel title="Pledges">
            {pledges.length === 0 ? (
              <Empty>No pledges yet. Add a pledge to start tracking giving.</Empty>
            ) : (
              <ul style={listStyle}>
                {pledges.map((p) => (
                  <li
                    key={p.id}
                    style={{ ...rowStyle, padding: "10px 0", borderBottom: "1px solid rgba(10,16,25,0.06)" }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>
                        {fmtMoney(p.amount)} {p.project_name && <span style={{ fontWeight: 400, opacity: 0.6 }}>· {p.project_name}</span>}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {fmtDate(p.pledge_date)} · {p.installments_total} {p.installments_total === 1 ? "payment" : "payments"} · {p.status}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: "var(--shed-green)", fontWeight: 700 }}>{fmtMoney(p.paid_amount)}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>paid</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div style={{ height: 14 }} />

          <Panel title="Payments">
            {payments.length === 0 ? (
              <Empty>No payments recorded.</Empty>
            ) : (
              <ul style={listStyle}>
                {payments.map((pay) => (
                  <li key={pay.id} style={{ ...rowStyle, padding: "10px 0", borderBottom: "1px solid rgba(10,16,25,0.06)", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700 }}>
                        {fmtMoney(pay.amount)}{" "}
                        <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>· {pay.method.replace("_", " ")}</span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {pay.project_name || "General"} · #{pay.installment_number}
                        {pay.status === "paid"
                          ? ` · paid ${fmtDate(pay.paid_date)}`
                          : ` · due ${fmtDate(pay.due_date)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          ...pillStyle,
                          background:
                            pay.status === "paid"
                              ? "rgba(45,122,61,0.12)"
                              : pay.status === "bounced" || pay.status === "failed"
                              ? "rgba(232,93,31,0.12)"
                              : "rgba(10,16,25,0.06)",
                          color:
                            pay.status === "paid"
                              ? "var(--shed-green)"
                              : pay.status === "bounced" || pay.status === "failed"
                              ? "var(--cone-orange)"
                              : "rgba(10,16,25,0.6)",
                        }}
                      >
                        {pay.status}
                      </span>
                      {(pay.status === "scheduled" || pay.status === "bounced" || pay.status === "failed") && (
                        <button
                          onClick={() => markPaymentPaid(pay.id)}
                          style={{
                            padding: "4px 10px",
                            background: "var(--shed-green)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ✓ Paid
                        </button>
                      )}
                      {pay.status === "scheduled" && pay.method === "check" && (
                        <button
                          onClick={() => bouncePayment(pay.id)}
                          style={{
                            padding: "4px 10px",
                            background: "transparent",
                            color: "var(--cone-orange)",
                            border: "1px solid rgba(232,93,31,0.3)",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Bounce
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "schedule" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowFollowupModal(true)}
              style={{
                padding: "10px 16px",
                background: "var(--cast-iron)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              + Schedule follow-up
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              style={{
                padding: "10px 16px",
                background: "var(--blueprint)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ✉️ Schedule email
            </button>
          </div>

          <Panel title={`Follow-ups (${followups.length})`}>
            {followups.length === 0 ? (
              <Empty>No follow-ups. Schedule a call, meeting, or task.</Empty>
            ) : (
              <ul style={listStyle}>
                {followups.map((f) => (
                  <li
                    key={f.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(10,16,25,0.06)",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <button
                      onClick={() => toggleFollowupDone(f.id, f.status)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: f.status === "done" ? "2px solid var(--shed-green)" : "2px solid rgba(10,16,25,0.2)",
                        background: f.status === "done" ? "var(--shed-green)" : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                      title={f.status === "done" ? "Mark pending" : "Mark done"}
                    >
                      {f.status === "done" ? "✓" : ""}
                    </button>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textDecoration: f.status === "done" ? "line-through" : "none",
                        opacity: f.status === "done" ? 0.55 : 1,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{f.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {fmtDateTime(f.due_at)} · {f.kind} · {f.priority}
                      </div>
                      {f.description && (
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{f.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteFollowup(f.id)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--cone-orange)", fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div style={{ height: 14 }} />

          <Panel title={`Scheduled emails (${emails.length})`}>
            {emails.length === 0 ? (
              <Empty>No scheduled emails. Send an automated note on a chosen date.</Empty>
            ) : (
              <ul style={listStyle}>
                {emails.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(10,16,25,0.06)",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{e.subject}</div>
                        <span
                          style={{
                            ...pillStyle,
                            background:
                              e.status === "sent" ? "rgba(45,122,61,0.12)" : "rgba(28,93,142,0.1)",
                            color: e.status === "sent" ? "var(--shed-green)" : "var(--blueprint)",
                          }}
                        >
                          {e.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        To {e.to_email} ·{" "}
                        {e.status === "sent"
                          ? `sent ${e.sent_at ? fmtDateTime(e.sent_at) : ""}`
                          : `scheduled ${fmtDateTime(e.send_at)}`}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, whiteSpace: "pre-wrap" }}>
                        {e.body.length > 180 ? e.body.slice(0, 180) + "…" : e.body}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {e.status === "scheduled" && (
                        <button
                          onClick={() => markEmailSent(e.id)}
                          style={{
                            padding: "4px 10px",
                            background: "var(--shed-green)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                          title="Mark as sent"
                        >
                          ✓ Sent
                        </button>
                      )}
                      <button
                        onClick={() => deleteEmail(e.id)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--cone-orange)", fontSize: 11 }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55, fontStyle: "italic" }}>
              Note: emails are stored in the queue. Connect an email provider (e.g. SendGrid) to send automatically.
            </div>
          </Panel>
        </div>
      )}

      {showFollowupModal && (
        <FollowupModal
          donorId={String(params.id)}
          onClose={() => setShowFollowupModal(false)}
          onCreated={() => {
            setShowFollowupModal(false);
            loadSchedule();
          }}
        />
      )}
      {showEmailModal && (
        <EmailModal
          donorId={String(params.id)}
          donorName={`${donor.first_name} ${donor.last_name || ""}`.trim()}
          donorEmail={donor.email}
          onClose={() => setShowEmailModal(false)}
          onCreated={() => {
            setShowEmailModal(false);
            loadSchedule();
          }}
        />
      )}

      {showPledgeModal && (
        <PledgeModal
          donorId={String(params.id)}
          projects={projects}
          onClose={() => setShowPledgeModal(false)}
          onCreated={() => {
            setShowPledgeModal(false);
            load();
          }}
        />
      )}
      {showQuickModal && (
        <QuickDonationModal
          donorId={String(params.id)}
          projects={projects}
          onClose={() => setShowQuickModal(false)}
          onCreated={() => {
            setShowQuickModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function PledgeModal({
  donorId,
  projects,
  onClose,
  onCreated,
}: {
  donorId: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pledgeDate, setPledgeDate] = useState(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState("1");
  const [plan, setPlan] = useState<"lump_sum" | "monthly" | "quarterly" | "annual">("lump_sum");
  const [defaultMethod, setDefaultMethod] = useState("credit_card");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/fundraising/donors/${donorId}/pledges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        project_id: projectId || null,
        pledge_date: pledgeDate,
        installments_total: Number(installments),
        payment_plan: plan,
        default_method: defaultMethod,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed");
      setBusy(false);
      return;
    }
    onCreated();
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={modalCard}>
        <h2 style={modalTitle}>New pledge</h2>

        <FormRow>
          <Lbl label="Amount *">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              style={inputCss}
            />
          </Lbl>
          <Lbl label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputCss}>
              <option value="">— General —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Lbl>
        </FormRow>

        <FormRow>
          <Lbl label="Pledge date">
            <input type="date" value={pledgeDate} onChange={(e) => setPledgeDate(e.target.value)} style={inputCss} />
          </Lbl>
          <Lbl label="Default method">
            <select value={defaultMethod} onChange={(e) => setDefaultMethod(e.target.value)} style={inputCss}>
              <option value="credit_card">Credit card</option>
              <option value="check">Check</option>
              <option value="wire">Wire</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
            </select>
          </Lbl>
        </FormRow>

        <FormRow>
          <Lbl label="Payment plan">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as "lump_sum" | "monthly" | "quarterly" | "annual")}
              style={inputCss}
            >
              <option value="lump_sum">Lump sum (1 payment)</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </Lbl>
          <Lbl label="Installments">
            <input
              type="number"
              min="1"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
              style={inputCss}
              disabled={plan === "lump_sum"}
            />
          </Lbl>
        </FormRow>

        <Lbl label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputCss, minHeight: 60, fontFamily: "inherit" }}
          />
        </Lbl>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            Auto-generates {plan === "lump_sum" ? "1 payment" : `${installments} ${plan} payments`}.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={cancelBtnCss}>
              Cancel
            </button>
            <button type="submit" disabled={busy} style={submitBtnCss}>
              {busy ? "Saving…" : "Create pledge"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function QuickDonationModal({
  donorId,
  projects,
  onClose,
  onCreated,
}: {
  donorId: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("credit_card");
  const [checkNumber, setCheckNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [ccLast4, setCcLast4] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/fundraising/donors/${donorId}/quick-donation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        project_id: projectId || null,
        paid_date: paidDate,
        method,
        check_number: method === "check" ? checkNumber || null : null,
        bank_name: method === "check" ? bankName || null : null,
        cc_last4: method === "credit_card" ? ccLast4 || null : null,
        transaction_ref: transactionRef || null,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed");
      setBusy(false);
      return;
    }
    onCreated();
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={modalCard}>
        <h2 style={modalTitle}>Quick donation</h2>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px" }}>
          Records a one-shot, already-paid donation. Use Add pledge for installments.
        </p>

        <FormRow>
          <Lbl label="Amount *">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              style={inputCss}
            />
          </Lbl>
          <Lbl label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputCss}>
              <option value="">— General —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Lbl>
        </FormRow>

        <FormRow>
          <Lbl label="Paid date">
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} style={inputCss} />
          </Lbl>
          <Lbl label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputCss}>
              <option value="credit_card">Credit card</option>
              <option value="check">Check</option>
              <option value="wire">Wire</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
            </select>
          </Lbl>
        </FormRow>

        {method === "check" && (
          <FormRow>
            <Lbl label="Check number">
              <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} style={inputCss} />
            </Lbl>
            <Lbl label="Bank name">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} style={inputCss} />
            </Lbl>
          </FormRow>
        )}
        {method === "credit_card" && (
          <FormRow>
            <Lbl label="Card last 4">
              <input
                value={ccLast4}
                onChange={(e) => setCcLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                style={inputCss}
              />
            </Lbl>
            <Lbl label="Transaction ref">
              <input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} style={inputCss} />
            </Lbl>
          </FormRow>
        )}
        {(method === "wire" || method === "ach") && (
          <Lbl label="Transaction ref">
            <input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} style={inputCss} />
          </Lbl>
        )}

        <Lbl label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputCss, minHeight: 50, fontFamily: "inherit" }}
          />
        </Lbl>

        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={cancelBtnCss}>
            Cancel
          </button>
          <button type="submit" disabled={busy} style={{ ...submitBtnCss, background: "var(--shed-green)" }}>
            {busy ? "Saving…" : "Record donation"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FollowupModal({
  donorId,
  onClose,
  onCreated,
}: {
  donorId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [kind, setKind] = useState("call");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/fundraising/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        donor_id: donorId,
        due_at: `${date}T${time}:00`,
        kind,
        priority,
        description: description || null,
      }),
    });
    setBusy(false);
    onCreated();
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={modalCard}>
        <h2 style={modalTitle}>Schedule follow-up</h2>
        <Lbl label="Title *">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} style={inputCss} autoFocus />
        </Lbl>
        <FormRow>
          <Lbl label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputCss} />
          </Lbl>
          <Lbl label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputCss} />
          </Lbl>
          <Lbl label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputCss}>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="email">Email</option>
              <option value="task">Task</option>
              <option value="event">Event</option>
            </select>
          </Lbl>
          <Lbl label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputCss}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Lbl>
        </FormRow>
        <Lbl label="Notes">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputCss, minHeight: 60, fontFamily: "inherit" }}
          />
        </Lbl>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={cancelBtnCss}>Cancel</button>
          <button type="submit" disabled={busy} style={submitBtnCss}>
            {busy ? "Saving…" : "Schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmailModal({
  donorId,
  donorName,
  donorEmail,
  onClose,
  onCreated,
}: {
  donorId: string;
  donorName: string;
  donorEmail: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [toEmail, setToEmail] = useState(donorEmail || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(`Dear ${donorName},\n\n`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/fundraising/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        donor_id: donorId,
        to_email: toEmail,
        subject,
        body,
        send_at: `${date}T${time}:00`,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed");
      setBusy(false);
      return;
    }
    onCreated();
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={modalCard}>
        <h2 style={modalTitle}>Schedule email</h2>
        <Lbl label="To *">
          <input type="email" required value={toEmail} onChange={(e) => setToEmail(e.target.value)} style={inputCss} />
        </Lbl>
        <Lbl label="Subject *">
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} style={inputCss} />
        </Lbl>
        <Lbl label="Body *">
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ ...inputCss, minHeight: 140, fontFamily: "inherit" }}
          />
        </Lbl>
        <FormRow>
          <Lbl label="Send date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputCss} />
          </Lbl>
          <Lbl label="Send time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputCss} />
          </Lbl>
        </FormRow>
        {error && <div style={{ color: "var(--cone-orange)", fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={cancelBtnCss}>Cancel</button>
          <button type="submit" disabled={busy} style={{ ...submitBtnCss, background: "var(--blueprint)" }}>
            {busy ? "Saving…" : "Schedule email"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>{children}</div>;
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
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

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,16,25,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 200,
  padding: 20,
};
const modalCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 560,
  maxHeight: "90vh",
  overflowY: "auto",
};
const modalTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  fontFamily: "var(--font-bricolage), sans-serif",
  margin: "0 0 10px",
  letterSpacing: "-0.01em",
};
const inputCss: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};
const cancelBtnCss: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(10,16,25,0.12)",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const submitBtnCss: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 8,
  border: "none",
  background: "var(--cast-iron)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

function Panel({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 12,
        padding: 16,
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px", opacity: 0.7 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || value === "—") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, gap: 12 }}>
      <span style={{ opacity: 0.55 }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 30,
        textAlign: "center",
        fontSize: 13,
        opacity: 0.55,
        background: "#fff",
        border: "1px dashed rgba(10,16,25,0.12)",
        borderRadius: 10,
      }}
    >
      {children}
    </div>
  );
}

const listStyle: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, fontSize: 13 };
const pillStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "2px 7px",
  borderRadius: 999,
  background: "rgba(10,16,25,0.06)",
};
const selectStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};
