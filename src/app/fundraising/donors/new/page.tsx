"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface PhoneRow {
  label: string;
  phone: string;
  is_primary: boolean;
}
interface AddressRow {
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_reception: boolean;
  is_primary: boolean;
}
interface SourceRow {
  id: string;
  name: string;
}

const fieldStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  outline: "none",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.65,
  display: "block",
  marginBottom: 5,
};

export default function NewDonorPageWrapper() {
  return (
    <Suspense fallback={<div style={{ opacity: 0.5, padding: 30 }}>Loading…</div>}>
      <NewDonorPage />
    </Suspense>
  );
}

function NewDonorPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialStatus = params.get("status") === "donor" ? "donor" : "prospect";

  const [status, setStatus] = useState<"prospect" | "donor">(initialStatus);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [hebrewName, setHebrewName] = useState("");
  const [title, setTitle] = useState("");
  const [spouseName, setSpouseName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [occupation, setOccupation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [yahrzeit, setYahrzeit] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [preferredContact, setPreferredContact] = useState("phone");
  const [doNotContact, setDoNotContact] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");

  const [phones, setPhones] = useState<PhoneRow[]>([{ label: "mobile", phone: "", is_primary: true }]);
  const [addresses, setAddresses] = useState<AddressRow[]>([
    { label: "home", street: "", city: "", state: "", zip: "", country: "", is_reception: false, is_primary: true },
  ]);

  const [sources, setSources] = useState<SourceRow[]>([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/fundraising/sources")
      .then((r) => (r.ok ? r.json() : []))
      .then((s) => setSources(s));
  }, []);

  function addPhone() {
    setPhones([...phones, { label: "mobile", phone: "", is_primary: false }]);
  }
  function removePhone(i: number) {
    setPhones(phones.filter((_, idx) => idx !== i));
  }
  function setPhoneField<K extends keyof PhoneRow>(i: number, k: K, v: PhoneRow[K]) {
    setPhones(phones.map((p, idx) => (idx === i ? { ...p, [k]: v } : k === "is_primary" && v ? { ...p, is_primary: false } : p)));
  }

  function addAddress() {
    setAddresses([
      ...addresses,
      { label: "office", street: "", city: "", state: "", zip: "", country: "", is_reception: false, is_primary: false },
    ]);
  }
  function removeAddress(i: number) {
    setAddresses(addresses.filter((_, idx) => idx !== i));
  }
  function setAddressField<K extends keyof AddressRow>(i: number, k: K, v: AddressRow[K]) {
    setAddresses(
      addresses.map((a, idx) =>
        idx === i ? { ...a, [k]: v } : k === "is_primary" && v ? { ...a, is_primary: false } : a,
      ),
    );
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  }

  async function createSource() {
    const name = newSourceName.trim();
    if (!name) return;
    const res = await fetch("/api/fundraising/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const created = await res.json();
      setSources([...sources, created]);
      setSourceId(created.id);
      setNewSourceName("");
      setShowAddSource(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/fundraising/donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          first_name: firstName,
          last_name: lastName || null,
          hebrew_name: hebrewName || null,
          title: title || null,
          spouse_name: spouseName || null,
          email: email || null,
          organization: organization || null,
          occupation: occupation || null,
          birthday: birthday || null,
          yahrzeit: yahrzeit || null,
          anniversary: anniversary || null,
          source_id: sourceId || null,
          source_notes: sourceNotes || null,
          preferred_contact: preferredContact,
          do_not_contact: doNotContact,
          tags,
          notes: notes || null,
          phones: phones.filter((p) => p.phone.trim()),
          addresses: addresses.filter((a) => a.street || a.city || a.state || a.zip || a.country),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to create");
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      router.push(`/fundraising/donors/${data.id}`);
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 880, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <Link href={status === "prospect" ? "/fundraising/prospects" : "/fundraising/donors"} style={{ fontSize: 12, color: "var(--blueprint)", textDecoration: "none" }}>
          ← Back to {status === "prospect" ? "prospects" : "donors"}
        </Link>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 4px" }}>
          New {status === "prospect" ? "prospect" : "donor"}
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6 }}>Capture the details that will power your reports later.</div>
      </div>

      {/* Status toggle */}
      <Section title="Status">
        <div style={{ display: "flex", gap: 8 }}>
          {(["prospect", "donor"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(10,16,25,0.12)",
                background: status === s ? "var(--cast-iron)" : "#fff",
                color: status === s ? "#fff" : "var(--cast-iron)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Identity">
        <Grid>
          <Field label="First name *">
            <input style={fieldStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label="Last name">
            <input style={fieldStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="Hebrew name">
            <input
              style={{ ...fieldStyle, direction: "rtl", textAlign: "right" }}
              value={hebrewName}
              onChange={(e) => setHebrewName(e.target.value)}
              placeholder="שם בעברית"
            />
          </Field>
          <Field label="Title">
            <input
              style={fieldStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rabbi, Mr., Dr., etc."
            />
          </Field>
          <Field label="Spouse name">
            <input style={fieldStyle} value={spouseName} onChange={(e) => setSpouseName(e.target.value)} />
          </Field>
          <Field label="Occupation">
            <input style={fieldStyle} value={occupation} onChange={(e) => setOccupation(e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" style={fieldStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Organization / business">
            <input style={fieldStyle} value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </Field>
        </Grid>
      </Section>

      <Section title="Phones">
        {phones.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <select
              value={p.label}
              onChange={(e) => setPhoneField(i, "label", e.target.value)}
              style={{ ...fieldStyle, width: 130 }}
            >
              <option value="mobile">Mobile</option>
              <option value="home">Home</option>
              <option value="office">Office</option>
              <option value="other">Other</option>
            </select>
            <input
              placeholder="Phone number"
              value={p.phone}
              onChange={(e) => setPhoneField(i, "phone", e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <input
                type="radio"
                name="primary-phone"
                checked={p.is_primary}
                onChange={() => setPhones(phones.map((row, idx) => ({ ...row, is_primary: idx === i })))}
              />
              Primary
            </label>
            <button type="button" onClick={() => removePhone(i)} style={removeBtnStyle} disabled={phones.length === 1}>
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={addPhone} style={addBtnStyle}>
          + Add phone
        </button>
      </Section>

      <Section title="Addresses">
        {addresses.map((a, i) => (
          <div
            key={i}
            style={{
              border: "1px solid rgba(10,16,25,0.08)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
              background: "#fbf7ec",
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={a.label}
                onChange={(e) => setAddressField(i, "label", e.target.value)}
                style={{ ...fieldStyle, width: 130, background: "#fff" }}
              >
                <option value="home">Home</option>
                <option value="office">Office</option>
                <option value="reception">Reception</option>
                <option value="other">Other</option>
              </select>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={a.is_reception}
                  onChange={(e) => setAddressField(i, "is_reception", e.target.checked)}
                />
                Reception address
              </label>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  name="primary-address"
                  checked={a.is_primary}
                  onChange={() => setAddresses(addresses.map((row, idx) => ({ ...row, is_primary: idx === i })))}
                />
                Primary
              </label>
              <button
                type="button"
                onClick={() => removeAddress(i)}
                style={{ ...removeBtnStyle, marginLeft: "auto" }}
                disabled={addresses.length === 1}
              >
                ×
              </button>
            </div>
            <Grid>
              <Field label="Street" full>
                <input style={fieldStyle} value={a.street} onChange={(e) => setAddressField(i, "street", e.target.value)} />
              </Field>
              <Field label="City">
                <input style={fieldStyle} value={a.city} onChange={(e) => setAddressField(i, "city", e.target.value)} />
              </Field>
              <Field label="State / region">
                <input style={fieldStyle} value={a.state} onChange={(e) => setAddressField(i, "state", e.target.value)} />
              </Field>
              <Field label="Zip / postal code">
                <input style={fieldStyle} value={a.zip} onChange={(e) => setAddressField(i, "zip", e.target.value)} />
              </Field>
              <Field label="Country">
                <input style={fieldStyle} value={a.country} onChange={(e) => setAddressField(i, "country", e.target.value)} />
              </Field>
            </Grid>
          </div>
        ))}
        <button type="button" onClick={addAddress} style={addBtnStyle}>
          + Add address
        </button>
      </Section>

      <Section title="Source & cultivation">
        <Grid>
          <Field label="Where did they come from?">
            {showAddSource ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={fieldStyle}
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="New source name"
                  autoFocus
                />
                <button type="button" onClick={createSource} style={smallBtnStyle}>
                  Add
                </button>
                <button type="button" onClick={() => setShowAddSource(false)} style={{ ...smallBtnStyle, background: "transparent" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={fieldStyle}>
                  <option value="">— Select source —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowAddSource(true)} style={smallBtnStyle}>
                  +
                </button>
              </div>
            )}
          </Field>
          <Field label="Source notes">
            <input
              style={fieldStyle}
              value={sourceNotes}
              onChange={(e) => setSourceNotes(e.target.value)}
              placeholder="Referred by Rabbi Cohen, met at gala…"
            />
          </Field>
          <Field label="Preferred contact">
            <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} style={fieldStyle}>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="text">Text / WhatsApp</option>
              <option value="in_person">In person</option>
              <option value="mail">Mail</option>
            </select>
          </Field>
          <Field label="Do not contact">
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0" }}>
              <input type="checkbox" checked={doNotContact} onChange={(e) => setDoNotContact(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Mark as do-not-contact</span>
            </label>
          </Field>
        </Grid>
      </Section>

      <Section title="Important dates">
        <Grid>
          <Field label="Birthday">
            <input type="date" style={fieldStyle} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </Field>
          <Field label="Yahrzeit">
            <input
              style={fieldStyle}
              value={yahrzeit}
              onChange={(e) => setYahrzeit(e.target.value)}
              placeholder="Hebrew or Gregorian"
            />
          </Field>
          <Field label="Anniversary">
            <input type="date" style={fieldStyle} value={anniversary} onChange={(e) => setAnniversary(e.target.value)} />
          </Field>
        </Grid>
      </Section>

      <Section title="Tags & notes">
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Tags</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(28,93,142,0.1)",
                  color: "var(--blueprint)",
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={fieldStyle}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="major-donor, board, etc."
            />
            <button type="button" onClick={addTag} style={smallBtnStyle}>
              Add tag
            </button>
          </div>
        </div>
        <Field label="Notes">
          <textarea
            style={{ ...fieldStyle, minHeight: 90, fontFamily: "inherit" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything important — relationship history, family, preferences, hot buttons…"
          />
        </Field>
      </Section>

      {error && (
        <div style={{ background: "rgba(232,93,31,0.1)", color: "var(--cone-orange)", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <Link
          href={status === "prospect" ? "/fundraising/prospects" : "/fundraising/donors"}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid rgba(10,16,25,0.14)",
            color: "var(--cast-iron)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 22px",
            borderRadius: 10,
            border: "none",
            background: "var(--cast-iron)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.5 : 1,
          }}
        >
          {submitting ? "Saving…" : `Save ${status}`}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(10,16,25,0.08)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 14,
      }}
    >
      <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 12px" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>{children}</div>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const removeBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "1px solid rgba(10,16,25,0.12)",
  background: "#fff",
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 700,
  color: "var(--cone-orange)",
};

const addBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px dashed rgba(10,16,25,0.2)",
  borderRadius: 8,
  background: "transparent",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--blueprint)",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(10,16,25,0.12)",
  background: "var(--cast-iron)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
};
