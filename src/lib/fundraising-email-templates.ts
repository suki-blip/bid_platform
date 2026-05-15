// Email template store + variable interpolation.
//
// Each fr_email_templates row holds a subject and an HTML body (and optional plain-text).
// The variable syntax is moustache-style: `{{first_name}}`, `{{amount}}`, etc. The
// `interpolate()` function takes a template string + a context object and replaces every
// `{{key}}` occurrence — unknown keys are replaced with an empty string (deliberate, so
// missing context fields don't leak literal `{{x}}` into outgoing emails).
//
// This module is intentionally NOT auto-coupled to the receipt-send code. The receipt
// path calls `loadDefaultReceiptTemplate(ownerId)`; if it's null we fall back to the
// built-in renderReceiptEmail. That preserves the prior behaviour for owners who haven't
// customised anything.

import crypto from 'crypto';
import { db } from './db';

export type TemplateKind = 'receipt' | 'campaign' | 'thank_you' | 'custom';

export interface EmailTemplate {
  id: string;
  owner_id: string;
  kind: TemplateKind;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: Record<string, unknown>): EmailTemplate {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    kind: String(row.kind) as TemplateKind,
    name: String(row.name),
    subject: String(row.subject),
    body_html: String(row.body_html),
    body_text: (row.body_text as string | null) || null,
    is_default: Number(row.is_default || 0) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// -------- CRUD --------

export async function listTemplates(ownerId: string, kind?: TemplateKind): Promise<EmailTemplate[]> {
  const sql = kind
    ? 'SELECT * FROM fr_email_templates WHERE owner_id = ? AND kind = ? ORDER BY is_default DESC, name ASC'
    : 'SELECT * FROM fr_email_templates WHERE owner_id = ? ORDER BY kind, is_default DESC, name ASC';
  const args = kind ? [ownerId, kind] : [ownerId];
  const r = await db().execute({ sql, args });
  return r.rows.map(rowToTemplate);
}

export async function getTemplate(id: string, ownerId: string): Promise<EmailTemplate | null> {
  const r = await db().execute({
    sql: 'SELECT * FROM fr_email_templates WHERE id = ? AND owner_id = ?',
    args: [id, ownerId],
  });
  return r.rows.length === 0 ? null : rowToTemplate(r.rows[0]);
}

export async function loadDefaultReceiptTemplate(ownerId: string): Promise<EmailTemplate | null> {
  const r = await db().execute({
    sql: "SELECT * FROM fr_email_templates WHERE owner_id = ? AND kind = 'receipt' AND is_default = 1 LIMIT 1",
    args: [ownerId],
  });
  return r.rows.length === 0 ? null : rowToTemplate(r.rows[0]);
}

export interface CreateTemplateInput {
  ownerId: string;
  kind: TemplateKind;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  is_default?: boolean;
}

export async function createTemplate(input: CreateTemplateInput): Promise<EmailTemplate> {
  const id = crypto.randomUUID();
  // Setting is_default for the receipt kind: clear any existing default first so the
  // partial unique index doesn't reject the insert. This isn't transactional — fine for
  // a single-user admin action.
  if (input.is_default && input.kind === 'receipt') {
    await db().execute({
      sql: "UPDATE fr_email_templates SET is_default = 0 WHERE owner_id = ? AND kind = 'receipt'",
      args: [input.ownerId],
    });
  }
  await db().execute({
    sql: `INSERT INTO fr_email_templates (id, owner_id, kind, name, subject, body_html, body_text, is_default)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.ownerId,
      input.kind,
      input.name,
      input.subject,
      input.body_html,
      input.body_text ?? null,
      input.is_default ? 1 : 0,
    ],
  });
  const t = await getTemplate(id, input.ownerId);
  if (!t) throw new Error('Template vanished after insert');
  return t;
}

export interface UpdateTemplateInput {
  name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string | null;
  is_default?: boolean;
}

export async function updateTemplate(id: string, ownerId: string, input: UpdateTemplateInput): Promise<EmailTemplate | null> {
  const existing = await getTemplate(id, ownerId);
  if (!existing) return null;

  // If we're flipping is_default ON for a receipt, clear sibling defaults first (same
  // reasoning as in createTemplate).
  if (input.is_default && existing.kind === 'receipt') {
    await db().execute({
      sql: "UPDATE fr_email_templates SET is_default = 0 WHERE owner_id = ? AND kind = 'receipt' AND id != ?",
      args: [ownerId, id],
    });
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (input.name !== undefined) { sets.push('name = ?'); args.push(input.name); }
  if (input.subject !== undefined) { sets.push('subject = ?'); args.push(input.subject); }
  if (input.body_html !== undefined) { sets.push('body_html = ?'); args.push(input.body_html); }
  if (input.body_text !== undefined) { sets.push('body_text = ?'); args.push(input.body_text); }
  if (input.is_default !== undefined) { sets.push('is_default = ?'); args.push(input.is_default ? 1 : 0); }
  if (sets.length === 0) return existing;
  sets.push("updated_at = datetime('now')");
  args.push(id);
  await db().execute({ sql: `UPDATE fr_email_templates SET ${sets.join(', ')} WHERE id = ?`, args });
  return await getTemplate(id, ownerId);
}

export async function deleteTemplate(id: string, ownerId: string): Promise<boolean> {
  const r = await db().execute({
    sql: 'DELETE FROM fr_email_templates WHERE id = ? AND owner_id = ?',
    args: [id, ownerId],
  });
  return Number(r.rowsAffected ?? 0) > 0;
}

// -------- Variable interpolation --------

// Every variable we currently support, with a short description for the UI.
// (The UI uses this to render the "click to insert" variable chips above the editor.)
export const TEMPLATE_VARIABLES: { key: string; label: string; example: string; kinds: TemplateKind[] }[] = [
  { key: 'first_name',        label: 'Donor first name',     example: 'David',           kinds: ['receipt', 'campaign', 'thank_you', 'custom'] },
  { key: 'last_name',         label: 'Donor last name',      example: 'Cohen',           kinds: ['receipt', 'campaign', 'thank_you', 'custom'] },
  { key: 'full_name',         label: 'Donor full name',      example: 'David Cohen',     kinds: ['receipt', 'campaign', 'thank_you', 'custom'] },
  { key: 'hebrew_name',       label: 'Donor Hebrew name',    example: 'דוד כהן',         kinds: ['receipt', 'campaign', 'thank_you', 'custom'] },
  { key: 'amount',            label: 'Donation amount',      example: '$180.00',         kinds: ['receipt', 'thank_you'] },
  { key: 'paid_date',         label: 'Payment date',         example: '2026-05-14',      kinds: ['receipt', 'thank_you'] },
  { key: 'method',            label: 'Payment method',       example: 'credit card',     kinds: ['receipt'] },
  { key: 'cc_last4',          label: 'Card last 4',          example: '4242',            kinds: ['receipt'] },
  { key: 'project_name',      label: 'Campaign / project',   example: 'Annual Drive',    kinds: ['receipt', 'campaign', 'thank_you'] },
  { key: 'transaction_ref',   label: 'Transaction ref',      example: 'TX-981234',       kinds: ['receipt'] },
  { key: 'receipt_number',    label: 'Receipt number',       example: 'R-00231',         kinds: ['receipt'] },
  { key: 'organization_name', label: 'Your organization',    example: 'Yeshivas Toras Chaim', kinds: ['receipt', 'campaign', 'thank_you', 'custom'] },
];

export type TemplateContext = Record<string, string | number | null | undefined>;

export function interpolate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key) => {
    const v = ctx[key];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

// Render a saved template against a context. Returns subject+html+text ready to hand to
// sendFundraisingEmail. Plain-text body is interpolated when present; otherwise we don't
// supply text and Resend derives it from HTML.
export function renderTemplate(tpl: EmailTemplate, ctx: TemplateContext): { subject: string; html: string; text?: string } {
  return {
    subject: interpolate(tpl.subject, ctx),
    html: interpolate(tpl.body_html, ctx),
    text: tpl.body_text ? interpolate(tpl.body_text, ctx) : undefined,
  };
}

// Sample context used by the preview pane and by the email-templates editor's "Preview"
// button. Keep this in sync with TEMPLATE_VARIABLES.example values.
export const SAMPLE_PREVIEW_CONTEXT: TemplateContext = {
  first_name: 'David',
  last_name: 'Cohen',
  full_name: 'David Cohen',
  hebrew_name: 'דוד כהן',
  amount: '$180.00',
  paid_date: '2026-05-14',
  method: 'credit card',
  cc_last4: '4242',
  project_name: 'Annual Drive',
  transaction_ref: 'TX-981234',
  receipt_number: 'R-00231',
  organization_name: 'Yeshivas Toras Chaim',
};
