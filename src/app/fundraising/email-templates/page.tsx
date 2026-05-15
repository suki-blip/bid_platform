"use client";

// Email Templates editor — the UI for managing reusable email content.
//
// Left rail: list of saved templates grouped by kind (Receipt / Campaign / Thank you / Custom).
// Right pane: the editor — name, kind, subject, HTML body — with a live preview tab that
// renders the template against either the built-in sample context or a real donor you pick.
//
// Receipt templates have a special "Set as default receipt" toggle: when one of them is the
// default, every receipt that gets emailed after a charge uses that template instead of the
// built-in fallback. The button copies the variable into the textarea at the caret position.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Kind = "receipt" | "campaign" | "thank_you" | "custom";

interface Template {
  id: string;
  kind: Kind;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface Variable {
  key: string;
  label: string;
  example: string;
  kinds: Kind[];
}

const KIND_LABELS: Record<Kind, string> = {
  receipt: "Receipt",
  campaign: "Campaign blast",
  thank_you: "Thank you",
  custom: "Custom",
};

const KIND_DESCRIPTIONS: Record<Kind, string> = {
  receipt: "Automatic email sent after every successful charge. Set one as default to use it.",
  campaign: "Reusable bodies for campaign blasts — load any of these into the compose form.",
  thank_you: "Manual thank-you notes for big gifts, anniversaries, etc.",
  custom: "Any other email content — pick from the campaign blast or use ad-hoc.",
};

// Keep in sync with src/lib/fundraising-email-templates.ts:TEMPLATE_VARIABLES
const VARIABLES: Variable[] = [
  { key: "first_name",        label: "First name",     example: "David",       kinds: ["receipt", "campaign", "thank_you", "custom"] },
  { key: "last_name",         label: "Last name",      example: "Cohen",       kinds: ["receipt", "campaign", "thank_you", "custom"] },
  { key: "full_name",         label: "Full name",      example: "David Cohen", kinds: ["receipt", "campaign", "thank_you", "custom"] },
  { key: "hebrew_name",       label: "Hebrew name",    example: "דוד כהן",     kinds: ["receipt", "campaign", "thank_you", "custom"] },
  { key: "amount",            label: "Amount",         example: "$180.00",     kinds: ["receipt", "thank_you"] },
  { key: "paid_date",         label: "Payment date",   example: "2026-05-14",  kinds: ["receipt", "thank_you"] },
  { key: "method",            label: "Method",         example: "credit card", kinds: ["receipt"] },
  { key: "cc_last4",          label: "Card last 4",    example: "4242",        kinds: ["receipt"] },
  { key: "project_name",      label: "Campaign",       example: "Annual Drive", kinds: ["receipt", "campaign", "thank_you"] },
  { key: "transaction_ref",   label: "Tx ref",         example: "TX-981234",   kinds: ["receipt"] },
  { key: "receipt_number",    label: "Receipt #",      example: "R-00231",     kinds: ["receipt"] },
  { key: "organization_name", label: "Organization",   example: "Yeshivas Toras Chaim", kinds: ["receipt", "campaign", "thank_you", "custom"] },
];

// Helper: build a starter HTML body for new templates of each kind. This is just so the
// editor isn't blank when the user clicks "+ New" — they can replace it freely.
function starterBody(kind: Kind): string {
  if (kind === "receipt") {
    return `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.5;">
  <h1 style="font-size:22px;margin:0 0 12px;">Thank you, {{first_name}}!</h1>
  <p>We received your donation of <strong>{{amount}}</strong> on {{paid_date}}.</p>
  <p>Designated to: <strong>{{project_name}}</strong></p>
  <p>Reference: {{transaction_ref}}</p>
  <p style="color:#555;font-size:13px;">Issued by {{organization_name}}. Please keep this email for your records.</p>
</div>`;
  }
  if (kind === "campaign") {
    return `<div style="font-family:-apple-system,sans-serif;max-width:600px;color:#1a1a1a;line-height:1.55;">
  <p>Dear {{first_name}},</p>
  <p>We're reaching out about <strong>{{project_name}}</strong>...</p>
  <p>Warm regards,<br>{{organization_name}}</p>
</div>`;
  }
  if (kind === "thank_you") {
    return `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#1a1a1a;line-height:1.55;">
  <p>Dear {{first_name}},</p>
  <p>Thank you for your generous gift of {{amount}} to {{project_name}}.</p>
  <p>With gratitude,<br>{{organization_name}}</p>
</div>`;
  }
  return `<div style="font-family:-apple-system,sans-serif;max-width:600px;line-height:1.55;">
  <p>Hello {{first_name}},</p>
  <p>...</p>
</div>`;
}

function starterSubject(kind: Kind): string {
  if (kind === "receipt") return "Receipt for your {{amount}} donation";
  if (kind === "campaign") return "An update from {{organization_name}}";
  if (kind === "thank_you") return "Thank you, {{first_name}}";
  return "";
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [focusTarget, setFocusTarget] = useState<"subject" | "body">("body");

  function load() {
    setLoading(true);
    fetch("/api/fundraising/email-templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        const list: Template[] = Array.isArray(d.templates) ? d.templates : [];
        setTemplates(list);
        setLoading(false);
        // If nothing's selected and we have templates, select the first one.
        if (!selectedId && list.length > 0) {
          select(list[0]);
        }
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(t: Template) {
    setSelectedId(t.id);
    setDraft({ ...t });
    setDirty(false);
    setError(null);
    setActiveTab("editor");
  }

  function startNew(kind: Kind) {
    const tmp: Template = {
      id: "__new__",
      kind,
      name: `New ${KIND_LABELS[kind].toLowerCase()} template`,
      subject: starterSubject(kind),
      body_html: starterBody(kind),
      body_text: null,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSelectedId("__new__");
    setDraft(tmp);
    setDirty(true);
    setError(null);
    setActiveTab("editor");
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const isNew = draft.id === "__new__";
      const r = await fetch(
        isNew ? "/api/fundraising/email-templates" : `/api/fundraising/email-templates/${draft.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: draft.kind,
            name: draft.name,
            subject: draft.subject,
            body_html: draft.body_html,
            body_text: draft.body_text,
            is_default: draft.is_default,
          }),
        },
      );
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      const data = await r.json();
      // Refresh list, select the saved template.
      const r2 = await fetch("/api/fundraising/email-templates");
      const d2 = await r2.json().catch(() => ({ templates: [] }));
      const list: Template[] = Array.isArray(d2.templates) ? d2.templates : [];
      setTemplates(list);
      const savedId = data.template?.id || draft.id;
      setSelectedId(savedId);
      const saved = list.find((t) => t.id === savedId);
      if (saved) {
        setDraft({ ...saved });
        setDirty(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft || draft.id === "__new__") return;
    if (!confirm(`Delete "${draft.name}"?`)) return;
    const r = await fetch(`/api/fundraising/email-templates/${draft.id}`, { method: "DELETE" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    setSelectedId(null);
    setDraft(null);
    setDirty(false);
    load();
  }

  function update<K extends keyof Template>(field: K, value: Template[K]) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
    setDirty(true);
  }

  // Variable insert button: replaces the current selection in whichever field the user
  // last focused. If neither has focus yet, the body is the default target.
  const insertVar = useCallback((key: string) => {
    if (!draft) return;
    const token = `{{${key}}}`;
    if (focusTarget === "subject") {
      const el = subjectRef.current;
      if (!el) return;
      const start = el.selectionStart ?? draft.subject.length;
      const end = el.selectionEnd ?? draft.subject.length;
      const next = draft.subject.slice(0, start) + token + draft.subject.slice(end);
      setDraft({ ...draft, subject: next });
      setDirty(true);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      const el = bodyRef.current;
      if (!el) return;
      const start = el.selectionStart ?? draft.body_html.length;
      const end = el.selectionEnd ?? draft.body_html.length;
      const next = draft.body_html.slice(0, start) + token + draft.body_html.slice(end);
      setDraft({ ...draft, body_html: next });
      setDirty(true);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    }
  }, [draft, focusTarget]);

  // Live preview — debounced 200ms. Re-renders subject + body via the preview endpoint,
  // which applies the same interpolation logic the real send path uses.
  useEffect(() => {
    if (!draft) return;
    const id = setTimeout(() => {
      fetch("/api/fundraising/email-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, body_html: draft.body_html }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setPreviewSubject(d.subject || "");
          setPreviewHtml(d.body_html || "");
        });
    }, 200);
    return () => clearTimeout(id);
  }, [draft]);

  const grouped = useMemo(() => {
    const out: Record<Kind, Template[]> = { receipt: [], campaign: [], thank_you: [], custom: [] };
    for (const t of templates) {
      (out[t.kind] || (out[t.kind] = [])).push(t);
    }
    return out;
  }, [templates]);

  const availableVariables = draft ? VARIABLES.filter((v) => v.kinds.includes(draft.kind)) : VARIABLES;

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-bricolage), sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          Email Templates
        </h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
          Customize the text of receipts, campaign blasts, thank-yous, and any other email your platform sends.
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: "rgba(232,93,31,0.08)", border: "1px solid rgba(232,93,31,0.25)", borderRadius: 8, color: "var(--cone-orange)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "flex-start" }}>
        {/* ---- Left rail: list ---- */}
        <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.10)", borderRadius: 10, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 14, opacity: 0.6, fontSize: 13 }}>Loading…</div>
          ) : (
            (["receipt", "campaign", "thank_you", "custom"] as Kind[]).map((kind) => (
              <div key={kind} style={{ borderBottom: "1px solid rgba(10,16,25,0.06)" }}>
                <div
                  style={{
                    padding: "10px 14px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    opacity: 0.55,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{KIND_LABELS[kind]}</span>
                  <button
                    onClick={() => startNew(kind)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--cast-iron)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontWeight: 700,
                    }}
                    title={`New ${KIND_LABELS[kind].toLowerCase()} template`}
                  >
                    +
                  </button>
                </div>
                {grouped[kind].length === 0 ? (
                  <div style={{ padding: "4px 14px 12px", fontSize: 12, opacity: 0.45 }}>
                    None yet
                  </div>
                ) : (
                  grouped[kind].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => select(t)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 14px",
                        border: "none",
                        borderLeft: selectedId === t.id ? "3px solid var(--cast-iron)" : "3px solid transparent",
                        background: selectedId === t.id ? "rgba(10,16,25,0.04)" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--cast-iron)",
                      }}
                    >
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {t.name}
                        {t.is_default && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", background: "rgba(40,140,80,0.12)", color: "#1f7a45", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Default
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.subject}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ))
          )}
        </div>

        {/* ---- Right pane: editor + preview ---- */}
        {!draft ? (
          <div style={{ background: "#fff", border: "1px dashed rgba(10,16,25,0.14)", borderRadius: 10, padding: 48, textAlign: "center", color: "rgba(10,16,25,0.5)" }}>
            Pick a template on the left, or click <strong>+</strong> to create one.
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid rgba(10,16,25,0.10)", borderRadius: 10 }}>
            {/* tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(10,16,25,0.08)" }}>
              <button onClick={() => setActiveTab("editor")} style={tabStyle(activeTab === "editor")}>Edit</button>
              <button onClick={() => setActiveTab("preview")} style={tabStyle(activeTab === "preview")}>Preview</button>
              <div style={{ flex: 1 }} />
              {draft.id !== "__new__" && (
                <button onClick={remove} style={{ ...tabStyle(false), color: "var(--cone-orange)" }}>Delete</button>
              )}
              <button
                onClick={save}
                disabled={!dirty || saving}
                style={{
                  margin: 8,
                  padding: "7px 16px",
                  background: dirty ? "var(--cast-iron)" : "rgba(10,16,25,0.15)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: dirty && !saving ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "Saving…" : draft.id === "__new__" ? "Create" : "Save"}
              </button>
            </div>

            {activeTab === "editor" ? (
              <div style={{ padding: 18 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Kind</label>
                  <select
                    value={draft.kind}
                    onChange={(e) => update("kind", e.target.value as Kind)}
                    style={inputStyle}
                  >
                    <option value="receipt">Receipt (auto-sent after charge)</option>
                    <option value="campaign">Campaign blast</option>
                    <option value="thank_you">Thank you</option>
                    <option value="custom">Custom</option>
                  </select>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>{KIND_DESCRIPTIONS[draft.kind]}</div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Name (internal)</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => update("name", e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {draft.kind === "receipt" && (
                  <div style={{ marginBottom: 14, padding: 10, background: "rgba(40,140,80,0.06)", borderRadius: 8, border: "1px solid rgba(40,140,80,0.18)" }}>
                    <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={draft.is_default}
                        onChange={(e) => update("is_default", e.target.checked)}
                      />
                      <span><strong>Set as default receipt</strong> — every charged donor automatically gets this email.</span>
                    </label>
                  </div>
                )}

                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>Subject</label>
                  <input
                    ref={subjectRef}
                    type="text"
                    value={draft.subject}
                    onChange={(e) => update("subject", e.target.value)}
                    onFocus={() => setFocusTarget("subject")}
                    style={inputStyle}
                    placeholder="Receipt for your {{amount}} donation"
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Body (HTML)</label>
                  <textarea
                    ref={bodyRef}
                    value={draft.body_html}
                    onChange={(e) => update("body_html", e.target.value)}
                    onFocus={() => setFocusTarget("body")}
                    style={{ ...inputStyle, height: 320, fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5 }}
                  />
                </div>

                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55, marginBottom: 6 }}>
                    Insert variable
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availableVariables.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => insertVar(v.key)}
                        title={`${v.label} · e.g. ${v.example}`}
                        style={{
                          padding: "4px 10px",
                          background: "#fff",
                          border: "1px solid rgba(10,16,25,0.14)",
                          borderRadius: 6,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 11,
                          cursor: "pointer",
                          color: "var(--cast-iron)",
                        }}
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // ---- Preview pane ----
              <div style={{ padding: 18 }}>
                <div style={{ marginBottom: 12, padding: 10, background: "rgba(10,16,25,0.03)", borderRadius: 8, fontSize: 12 }}>
                  Preview rendered with sample data. Variables resolve as if sent to a real donor.
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55 }}>
                    Subject
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{previewSubject || "(empty)"}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55, marginBottom: 4 }}>
                  Body
                </div>
                <div
                  style={{
                    border: "1px solid rgba(10,16,25,0.12)",
                    borderRadius: 8,
                    padding: 16,
                    background: "#fafafa",
                    minHeight: 280,
                  }}
                  // The preview HTML is only inserted server-side AFTER interpolation. Owners
                  // are setting this content themselves; sanitization happens at send-time on
                  // Resend's end.
                  dangerouslySetInnerHTML={{ __html: previewHtml || "<em style='opacity:0.5'>(empty)</em>" }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  opacity: 0.6,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid rgba(10,16,25,0.14)",
  borderRadius: 6,
  fontSize: 13,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "10px 18px",
    border: "none",
    background: active ? "rgba(10,16,25,0.04)" : "transparent",
    borderBottom: active ? "2px solid var(--cast-iron)" : "2px solid transparent",
    marginBottom: -1,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    color: "var(--cast-iron)",
  };
}
