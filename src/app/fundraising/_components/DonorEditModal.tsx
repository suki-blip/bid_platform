"use client";

import { useState } from "react";
import { useEscape } from "@/lib/use-escape";
import { OCCUPATION_CATEGORIES } from "@/lib/fundraising-options";
import HebrewInput from "./HebrewInput";

interface EditableDonor {
  id: string;
  first_name: string;
  last_name: string | null;
  hebrew_name: string | null;
  hebrew_first_name: string | null;
  hebrew_last_name: string | null;
  hebrew_father_name: string | null;
  hebrew_title: string | null;
  hebrew_suffix_title: string | null;
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

// Each phone row in the editor. `id` is set on existing rows; new rows get `_new=true`.
// Rows marked `_deleted` stay in state until save (so we know what to DELETE) but render hidden.
interface PhoneRow {
  id?: string;
  label: string;
  phone: string;
  is_primary: boolean;
  _new?: boolean;
  _deleted?: boolean;
}

interface ExistingPhone {
  id: string;
  label: string;
  phone: string;
  is_primary: number; // 0 / 1 as stored
}

export default function DonorEditModal({
  donor,
  phones: initialPhones,
  onClose,
  onSaved,
}: {
  donor: EditableDonor;
  phones?: ExistingPhone[];
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscape(onClose);

  const occupationIsCategory = OCCUPATION_CATEGORIES.some((c) => c.value === donor.occupation);

  const [firstName, setFirstName] = useState(donor.first_name || "");
  const [lastName, setLastName] = useState(donor.last_name || "");
  const [hebrewName, setHebrewName] = useState(donor.hebrew_name || "");
  const [hebrewFirstName, setHebrewFirstName] = useState(donor.hebrew_first_name || "");
  const [hebrewLastName, setHebrewLastName] = useState(donor.hebrew_last_name || "");
  const [hebrewFatherName, setHebrewFatherName] = useState(donor.hebrew_father_name || "");
  const [hebrewTitle, setHebrewTitle] = useState(donor.hebrew_title || "");
  const [hebrewSuffixTitle, setHebrewSuffixTitle] = useState(donor.hebrew_suffix_title || "");
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

  // Phones — local editable list. Snapshot of original values so we can diff at save.
  const [phones, setPhones] = useState<PhoneRow[]>(() =>
    (initialPhones || []).map((p) => ({
      id: p.id,
      label: p.label || "mobile",
      phone: p.phone || "",
      is_primary: Number(p.is_primary) === 1,
    })),
  );
  // Snapshot of the original phones, used to decide which ones need PATCH on save.
  const [originalPhones] = useState<ExistingPhone[]>(initialPhones || []);

  function addPhoneRow() {
    setPhones((prev) => [
      ...prev,
      { label: "mobile", phone: "", is_primary: prev.filter((p) => !p._deleted).length === 0, _new: true },
    ]);
  }
  function updatePhoneRow(idx: number, patch: Partial<PhoneRow>) {
    setPhones((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function setPrimaryPhone(idx: number) {
    setPhones((prev) => prev.map((p, i) => ({ ...p, is_primary: i === idx })));
  }
  function removePhoneRow(idx: number) {
    setPhones((prev) =>
      prev
        .map((p, i) => {
          if (i !== idx) return p;
          // Existing rows: mark for deletion. New rows: drop entirely.
          if (p.id) return { ...p, _deleted: true };
          return null;
        })
        .filter((p): p is PhoneRow => p !== null),
    );
  }

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
        hebrew_first_name: hebrewFirstName.trim() || null,
        hebrew_last_name: hebrewLastName.trim() || null,
        hebrew_father_name: hebrewFatherName.trim() || null,
        hebrew_title: hebrewTitle.trim() || null,
        hebrew_suffix_title: hebrewSuffixTitle.trim() || null,
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

    // ----- Persist phone changes -----
    // Each row falls into one of four buckets:
    //   _deleted + has id     → DELETE
    //   _new                  → POST
    //   has id, changed       → PATCH
    //   has id, unchanged     → no-op
    // We compare against the original snapshot to detect "changed".
    const origById = new Map(originalPhones.map((p) => [p.id, p]));
    const phoneOps: Promise<Response>[] = [];

    for (const p of phones) {
      if (p._deleted && p.id) {
        phoneOps.push(
          fetch(`/api/fundraising/donors/${donor.id}/phones/${p.id}`, { method: "DELETE" }),
        );
        continue;
      }
      if (p._new) {
        if (!p.phone.trim()) continue; // skip empty new rows
        phoneOps.push(
          fetch(`/api/fundraising/donors/${donor.id}/phones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: p.label,
              phone: p.phone.trim(),
              is_primary: p.is_primary ? 1 : 0,
            }),
          }),
        );
        continue;
      }
      if (p.id) {
        const orig = origById.get(p.id);
        const wasPrimary = orig ? Number(orig.is_primary) === 1 : false;
        const changed =
          !orig ||
          orig.label !== p.label ||
          orig.phone !== p.phone ||
          wasPrimary !== p.is_primary;
        if (changed) {
          phoneOps.push(
            fetch(`/api/fundraising/donors/${donor.id}/phones/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                label: p.label,
                phone: p.phone.trim(),
                is_primary: p.is_primary ? 1 : 0,
              }),
            }),
          );
        }
      }
    }

    // Wait for all phone ops before signalling done
    await Promise.all(phoneOps);

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
          <L label="תואר עברי לפני השם (prefix)">
            <HebrewInput
              value={hebrewTitle}
              onChange={setHebrewTitle}
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif", textAlign: "right" }}
              placeholder="הרב, מרן, הגאון, הר״ר"
            />
          </L>
          <L label="תואר עברי אחרי השם (suffix)">
            <HebrewInput
              value={hebrewSuffixTitle}
              onChange={setHebrewSuffixTitle}
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif", textAlign: "right" }}
              placeholder="שליט״א, זצ״ל, ע״ה, הי״ו, הכהן"
            />
          </L>
          <L label="First name *">
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} style={input} />
          </L>
          <L label="Last name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={input} />
          </L>
        </Row>

        <Row>
          <L label="שם פרטי (Hebrew first name)">
            <HebrewInput
              value={hebrewFirstName}
              onChange={setHebrewFirstName}
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif", textAlign: "right" }}
              placeholder="יוסף"
            />
          </L>
          <L label="שם משפחה (Hebrew last name)">
            <HebrewInput
              value={hebrewLastName}
              onChange={setHebrewLastName}
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif", textAlign: "right" }}
              placeholder="כהן"
            />
          </L>
        </Row>

        <Row>
          <L label="שם האב (Father's Hebrew name)">
            <HebrewInput
              value={hebrewFatherName}
              onChange={setHebrewFatherName}
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif", textAlign: "right" }}
              placeholder="דוד"
            />
          </L>
          <L label="Spouse">
            <input value={spouseName} onChange={(e) => setSpouseName(e.target.value)} style={input} />
          </L>
        </Row>

        <Row>
          <L label="Hebrew name (full / legacy)">
            <HebrewInput
              value={hebrewName}
              onChange={setHebrewName}
              style={{ ...input, fontFamily: "'Frank Ruhl Libre', serif", textAlign: "right" }}
              placeholder="יוסף בן דוד הכהן"
            />
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

        {/* Phones */}
        <div style={{ marginTop: 6, marginBottom: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              opacity: 0.65,
              marginBottom: 6,
            }}
          >
            Phones
          </div>
          {phones.filter((p) => !p._deleted).length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 6 }}>
              No phones on file yet.
            </div>
          )}
          {phones.map((p, idx) =>
            p._deleted ? null : (
              <div
                key={p.id || `new-${idx}`}
                style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}
              >
                <select
                  value={p.label}
                  onChange={(e) => updatePhoneRow(idx, { label: e.target.value })}
                  style={{ ...input, width: 130 }}
                >
                  <option value="mobile">Mobile</option>
                  <option value="home">Home</option>
                  <option value="office">Office</option>
                  <option value="mother">Mother (אמא)</option>
                  <option value="father">Father (אבא)</option>
                  <option value="spouse">Spouse</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="tel"
                  value={p.phone}
                  onChange={(e) => updatePhoneRow(idx, { phone: e.target.value })}
                  placeholder="Phone number"
                  style={{ ...input, flex: 1, minWidth: 160 }}
                />
                <label
                  style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                  title="Mark as the primary phone for this donor"
                >
                  <input
                    type="radio"
                    name="edit-primary-phone"
                    checked={p.is_primary}
                    onChange={() => setPrimaryPhone(idx)}
                  />
                  Primary
                </label>
                <button
                  type="button"
                  onClick={() => removePhoneRow(idx)}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(232,93,31,0.3)",
                    color: "var(--cone-orange)",
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  title="Remove this phone"
                >
                  ×
                </button>
              </div>
            ),
          )}
          <button
            type="button"
            onClick={addPhoneRow}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px dashed rgba(10,16,25,0.2)",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--blueprint)",
              marginTop: 2,
            }}
          >
            + Add phone
          </button>
        </div>

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
