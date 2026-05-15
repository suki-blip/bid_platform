// Fundraising-side email sending — multi-tenant Resend wrapper.
//
// Each owner can supply their own Resend API key (saas_users.resend_api_key) + From
// address (saas_users.email_from). Falls back to RESEND_API_KEY env var if the owner
// hasn't set one — handy during onboarding.
//
// Every send writes an fr_email_log row regardless of success/failure for audit and
// the donor-profile "Communication history" view.

import { Resend } from 'resend';
import crypto from 'crypto';
import { db } from './db';
import { loadDefaultReceiptTemplate, renderTemplate, type TemplateContext } from './fundraising-email-templates';

export interface OwnerEmailConfig {
  api_key: string;
  from: string;          // "Name <addr@domain>"
  signature: string;     // HTML appended to outgoing emails (when skipSignature=false)
}

export interface SendFundraisingEmailParams {
  ownerId: string;
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  /** HTML body. Signature is appended automatically unless skipSignature=true. */
  html: string;
  /** Optional plain-text fallback. Resend will derive one from HTML if omitted. */
  text?: string;
  skipSignature?: boolean;
  /** Kind tag for the log: 'receipt' | 'campaign_blast' | 'custom' | ... */
  template?: string;
  /** Related-entity IDs for cross-reference in the log. */
  donorId?: string | null;
  paymentId?: string | null;
  projectId?: string | null;
}

export interface SendFundraisingEmailResult {
  ok: boolean;
  log_id: string;
  resend_message_id?: string;
  error?: string;
}

/**
 * Load the owner's email config. Returns null when there's no usable API key + From —
 * the caller should surface a friendly "configure email in Settings" message.
 */
export async function loadOwnerEmailConfig(ownerId: string): Promise<OwnerEmailConfig | null> {
  const row = await db().execute({
    sql: 'SELECT email_from, email_signature, resend_api_key FROM saas_users WHERE id = ?',
    args: [ownerId],
  });
  if (row.rows.length === 0) return null;
  const ownerKey = (row.rows[0].resend_api_key as string | null) || null;
  const envKey = process.env.RESEND_API_KEY || null;
  const apiKey = ownerKey || envKey;
  const from = (row.rows[0].email_from as string | null) || process.env.RESEND_DEFAULT_FROM || null;
  if (!apiKey || !from) return null;
  return {
    api_key: apiKey,
    from,
    signature: (row.rows[0].email_signature as string | null) || '',
  };
}

/**
 * Send a fundraising email via Resend. Logs every attempt to fr_email_log.
 * Never throws — returns ok=false with an error message on failure so callers can
 * decide whether to surface the failure to the end user.
 */
export async function sendFundraisingEmail(
  params: SendFundraisingEmailParams,
): Promise<SendFundraisingEmailResult> {
  const logId = crypto.randomUUID();
  const config = await loadOwnerEmailConfig(params.ownerId);
  if (!config) {
    await writeLog(logId, params, null, 'failed', null, 'Email is not configured. Set up Resend in Settings.');
    return {
      ok: false,
      log_id: logId,
      error: 'Email not configured. Open Settings and set up Resend.',
    };
  }

  const finalHtml = params.skipSignature
    ? params.html
    : `${params.html}${config.signature ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;color:#666;font-size:13px;">${config.signature}</div>` : ''}`;

  try {
    const resend = new Resend(config.api_key);
    const res = await resend.emails.send({
      from: config.from,
      to: [params.to],
      cc: params.cc ? [params.cc] : undefined,
      bcc: params.bcc ? [params.bcc] : undefined,
      subject: params.subject,
      html: finalHtml,
      text: params.text,
    });
    if (res.error) {
      await writeLog(logId, params, null, 'failed', finalHtml, res.error.message || 'Resend returned an error');
      return { ok: false, log_id: logId, error: res.error.message || 'Resend error' };
    }
    const messageId = res.data?.id || null;
    await writeLog(logId, params, messageId, 'sent', finalHtml, null);
    return { ok: true, log_id: logId, resend_message_id: messageId || undefined };
  } catch (err) {
    const msg = (err as Error).message || 'Unknown send error';
    await writeLog(logId, params, null, 'failed', finalHtml, msg);
    return { ok: false, log_id: logId, error: msg };
  }
}

async function writeLog(
  id: string,
  params: SendFundraisingEmailParams,
  resendMessageId: string | null,
  status: 'sent' | 'failed',
  bodyForPreview: string | null,
  errorMessage: string | null,
): Promise<void> {
  const preview = bodyForPreview
    ? bodyForPreview.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    : null;
  try {
    await db().execute({
      sql: `INSERT INTO fr_email_log
              (id, owner_id, donor_id, payment_id, project_id, to_address, cc, bcc,
               subject, body_preview, template, status, resend_message_id, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        params.ownerId,
        params.donorId || null,
        params.paymentId || null,
        params.projectId || null,
        params.to,
        params.cc || null,
        params.bcc || null,
        params.subject,
        preview,
        params.template || null,
        status,
        resendMessageId,
        errorMessage,
      ],
    });
  } catch (err) {
    console.error('[fundraising-email] failed to write log row:', err);
  }
}

// ----- Receipt template -----
//
// Two-layer design:
//   1. If the owner has saved a custom receipt template in the Email Templates UI
//      (fr_email_templates, kind='receipt', is_default=1), we use it — variable interpolation
//      against the donor/payment context. Call `resolveReceiptEmail()` to get this behaviour.
//   2. If no custom template exists, fall back to the built-in HTML in renderReceiptEmail()
//      below — same output every existing owner has been getting until now.

export interface ReceiptRenderArgs {
  donor_name: string;
  hebrew_name?: string | null;
  amount: number;
  currency?: string;
  paid_date: string;
  method: string;
  project_name: string | null;
  transaction_ref: string | null;
  cc_last4: string | null;
  organization_name: string;
  receipt_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

// Public API: prefer the user's saved template, otherwise built-in.
export async function resolveReceiptEmail(
  ownerId: string,
  args: ReceiptRenderArgs,
): Promise<{ subject: string; html: string; text?: string }> {
  const tpl = await loadDefaultReceiptTemplate(ownerId).catch(() => null);
  if (tpl) {
    const fmtAmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: args.currency || 'USD',
    }).format(args.amount);
    const ctx: TemplateContext = {
      first_name: args.first_name || args.donor_name.split(' ')[0] || '',
      last_name: args.last_name || args.donor_name.split(' ').slice(1).join(' ') || '',
      full_name: args.donor_name,
      hebrew_name: args.hebrew_name || '',
      amount: fmtAmt,
      paid_date: args.paid_date,
      method: args.method,
      cc_last4: args.cc_last4 || '',
      project_name: args.project_name || '',
      transaction_ref: args.transaction_ref || '',
      receipt_number: args.receipt_number || '',
      organization_name: args.organization_name,
    };
    return renderTemplate(tpl, ctx);
  }
  return renderReceiptEmail(args);
}

export function renderReceiptEmail(args: ReceiptRenderArgs): { subject: string; html: string; text: string } {
  const fmtAmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: args.currency || 'USD',
  }).format(args.amount);
  const subject = `Receipt for your ${fmtAmt} donation`;

  const greetingLine = `Dear ${escapeHtml(args.donor_name)}${args.hebrew_name ? ' (' + escapeHtml(args.hebrew_name) + ')' : ''},`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
  <h1 style="font-size:22px;margin:0 0 12px;">Thank you for your donation!</h1>
  <p style="font-size:14px;margin:0 0 20px;">
    ${greetingLine}<br>
    We're grateful for your generosity. Below is your official receipt for tax purposes.
  </p>
  <div style="background:#f6f4ef;border-radius:12px;padding:18px;margin-bottom:18px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:6px 0;color:#666;">Amount</td>
        <td style="padding:6px 0;text-align:right;font-weight:700;font-size:18px;">${escapeHtml(fmtAmt)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666;">Date</td>
        <td style="padding:6px 0;text-align:right;">${escapeHtml(args.paid_date)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666;">Method</td>
        <td style="padding:6px 0;text-align:right;">${escapeHtml(args.method)}${args.cc_last4 ? ` ending ${escapeHtml(args.cc_last4)}` : ''}</td>
      </tr>
      ${args.project_name ? `<tr><td style="padding:6px 0;color:#666;">Designated to</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.project_name)}</td></tr>` : ''}
      ${args.transaction_ref ? `<tr><td style="padding:6px 0;color:#666;">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(args.transaction_ref)}</td></tr>` : ''}
    </table>
  </div>
  <p style="font-size:13px;color:#555;margin:0;">
    Issued by ${escapeHtml(args.organization_name)}. Please keep this email for your records.
  </p>
</div>`;

  const text = `Thank you for your donation!

${args.donor_name}${args.hebrew_name ? ' (' + args.hebrew_name + ')' : ''},

We're grateful for your generosity. Below is your official receipt.

Amount: ${fmtAmt}
Date: ${args.paid_date}
Method: ${args.method}${args.cc_last4 ? ` ending ${args.cc_last4}` : ''}${args.project_name ? `\nDesignated to: ${args.project_name}` : ''}${args.transaction_ref ? `\nReference: ${args.transaction_ref}` : ''}

Issued by ${args.organization_name}. Please keep this email for your records.`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
