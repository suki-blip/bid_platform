"use client";

import { useState } from "react";
import { OCCUPATION_CATEGORIES } from "@/lib/fundraising-options";

interface EditableDonor {
  id: string;
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
  source_notes: string | null;
  notes: string | null;
  do_not_contact: boolean;
}

export default function DonorEditModal({
  donor,
  onClose,
  onSaved,
}: {
  donor: EditableDonor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const occupationIsCategory = OCCUPATION_CATEGORIES.some((c) => c.value === donor.occupation);

  const [firstName, setFirstName] = useState(donor.first_name || "");
  const [lastName, setLastName] = useState(donor.last_name || "");
  const [hebrewName, setHebrewName] = useState(donor.hebrew_name || "");
  const [title, setTitle] = useState(donor.title || "");
  const [spouseName, setSpouseName] = useState(donor.spouse_name || "");
  const [email, setEmail] = useState(donor.email || "");
  const [organization, setOrganization] = useState(donor.organization || "");
  const [occupationCategory, setOccupationCategory] = useState(occupationIsCategory ? donor.occupation || "" : "other");
  const [occupationFreeText, setOccupationFreeText] = useState(occupationIsCategory ? "" : donor.occupation || "");
  const [birthday, setBirthday] = useState(donor.birthday || "");
  const [yahrzeit, setYahrzeit] = useState(donor.yahrzeit || "");
  const [anniversary, setAnniversary] = useState(donor.anniversary || "");
  const [preferredContact, setPreferredContact] = useState(donor.preferred_contact || "");
  const [sourceNotes, setSourceNotes] = useState(donor.source_notes || "");
  const [notes, setNotes] = useState(donor.notes || "");
  const [doNotContact, setDoNotContact] = useState(donor.do_not_contact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const occupation =
      occupationCategory === "other" ? occupationFreeText.trim() || null : occupationCategory || null;

    const res = await fetch(`/api/fundraising/donors/${donor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        hebrew_name: hebrewName.trim() || null,
        title: title.trim() || null,
        spouse_name: spouseName.trim() || null,
        email: email.trim() || null,
        organization: organization.trim() || null,
        occupation,
        birthday: birthday || null,
        yahrzeit: yahrzeit.trim() || null,
        anniversary: anniversary || null,
        preferred_contact: preferredContact || null,
        source_notes: sourceNotes.trim() || null,
        notes: notes.trim() || null,
        do_not_contact: doNotContact,
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
          Edit donor
        </h2>

        <Row>
          <L label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mr., Rabbi, Dr." style={input} />
          </L>
          <L label="First name *">
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} style={input} />
          </L>
          <L label="Last name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={input} />
          </L>
        </Row>

        <Row>
          <L label="Hebrew name">
            <input
              value={hebrewName}
              onChange={(e) => setHebrewName(e.target.value)}
              dir="rtl"
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif" }}
            />
          </L>
          <L label="Spouse">
            <input value={spouseName} onChange={(e) => setSpouseName(e.target.value)} style={input} />
          </L>
        </Row>

        <Row>
          <L label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
          </L>
          <L label="Preferred contact">
            <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} style={input}>
              <option value="">— Any —</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="text">Text / WhatsApp</option>
              <option value="mail">Mail</option>
              <option value="in_person">In-person</option>
            </select>
          </L>
        </Row>

        <Row>
          <L label="Organization">
            <input value={organization} onChange={(e) => setOrganization(e.target.value)} style={input} />
          </L>
        </Row>

        <Row>
          <L label="Occupation category">
            <select value={occupationCategory} onChange={(e) => setOccupationCategory(e.target.value)} style={input}>
              {OCCUPATION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </L>
          {occupationCategory === "other" && (
            <L label="Occupation (free text)">
              <input
                value={occupationFreeText}
                onChange={(e) => setOccupationFreeText(e.target.value)}
                placeholder="Describe occupation"
                style={input}
              />
            </L>
          )}
        </Row>

        <Row>
          <L label="Birthday">
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} style={input} />
          </L>
          <L label="Anniversary">
            <input type="date" value={anniversary} onChange={(e) => setAnniversary(e.target.value)} style={input} />
          </L>
          <L label="Yahrzeit (Hebrew)">
            <input value={yahrzeit} onChange={(e) => setYahrzeit(e.target.value)} placeholder="e.g. 15 Nisan" style={input} />
          </L>
        </Row>

        <L label="Source notes">
          <textarea
            value={sourceNotes}
            onChange={(e) => setSourceNotes(e.target.value)}
            style={{ ...input, minHeight: 50, fontFamily: "inherit" }}
          />
        </L>

        <L label="Profile notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...input, minHeight: 80, fontFamily: "inherit" }}
          />
        </L>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={doNotContact}
            onChange={(e) => setDoNotContact(e.target.checked)}
          />
          Do not contact
        </label>

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
  maxWidth: 720,
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
