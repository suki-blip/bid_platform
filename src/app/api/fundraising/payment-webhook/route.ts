import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';

/**
 * Public webhook called by the external credit-card gateway when a payment completes.
 *
 * Auth: query params `token` (session token) AND `secret` (per-session webhook secret
 * generated when the session was created). Both must match. This is unguessable
 * (24+16 random bytes) and unique per session, so it's safe as a public URL.
 *
 * Accepts both GET and POST so the gateway can integrate either way.
 *
 * Optional params (gateway may include any of these):
 *   status      - 'paid' (default), 'failed', 'cancelled'
 *   transaction - external transaction reference
 *   reason      - failure reason if status != paid
 *   cc_last4    - last 4 digits of card
 *   cc_holder   - cardholder name
 *
 * On success → marks the linked fr_pledge_payments row as 'paid' with paid_date=today,
 * recomputes pledge + donor totals, marks the session 'completed'.
 *
 * On failure → marks payment 'failed', session 'failed' with failure_reason.
 *
 * After processing, redirects (302) to /fundraising/payment/result?status=... so the user's
 * browser lands on a friendly page if the gateway redirected them here.
 */

// Pick the first non-empty string from a list of possible sources for a single value.
function pick(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return null;
}

// Sola / Cardknox returns xResult: 'A' = Approved, 'D' = Declined, 'E' = Error.
// Map to our generic status vocabulary.
function normalizeSolaStatus(xResult: string | null, xStatus: string | null): string | null {
  const r = (xResult || '').trim().toUpperCase();
  if (r === 'A') return 'paid';
  if (r === 'D') return 'failed';
  if (r === 'E') return 'failed';
  const s = (xStatus || '').trim().toLowerCase();
  if (s === 'approved') return 'paid';
  if (s === 'declined' || s === 'error' || s === 'voided') return 'failed';
  return null;
}

// "1XXXXXXXXXXX4242" → "4242". Returns null if we can't get 4 trailing digits.
function maskedToLast4(masked: string | null): string | null {
  if (!masked) return null;
  const m = String(masked).match(/(\d{4})\s*$/);
  return m ? m[1] : null;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  await dbReady();

  // Parse params from URL or POST body. URL takes priority for token+secret because
  // those live in xRedirectURL — gateways generally don't rewrite our query params.
  const url = new URL(req.url);
  const qp = (k: string) => url.searchParams.get(k);

  let token = qp('token');
  let secret = qp('secret');

  // Generic params (custom-template gateways)
  let status = qp('status');
  let transaction = pick(qp('transaction'), qp('transaction_id'));
  let reason = qp('reason');
  let ccLast4 = qp('cc_last4');
  let ccHolder = qp('cc_holder');

  // Sola / Cardknox specific
  let xResult = qp('xResult');
  let xStatus = qp('xStatus');
  let xRefNum = qp('xRefNum');
  let xMaskedCardNumber = pick(qp('xMaskedCardNumber'), qp('xCardNum'));
  let xCardType = qp('xCardType');
  let xBillFirstName = qp('xBillFirstName');
  let xBillLastName = qp('xBillLastName');
  let xErrorCode = qp('xErrorCode');
  let xError = qp('xError');

  if (req.method === 'POST') {
    try {
      const ct = req.headers.get('content-type') || '';
      const readField = (body: Record<string, unknown>, k: string): string | null => {
        const v = body[k];
        return v == null ? null : String(v);
      };
      let body: Record<string, unknown> = {};
      if (ct.includes('application/json')) {
        body = await req.json();
      } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
        const form = await req.formData();
        for (const [k, v] of form.entries()) body[k] = typeof v === 'string' ? v : '';
      }
      token = token || pick(readField(body, 'token'), readField(body, 'ref'), readField(body, 'xinvoice'), readField(body, 'xCustom01'));
      secret = secret || readField(body, 'secret');
      status = status || readField(body, 'status');
      transaction = transaction || pick(readField(body, 'transaction'), readField(body, 'transaction_id'));
      reason = reason || readField(body, 'reason');
      ccLast4 = ccLast4 || readField(body, 'cc_last4');
      ccHolder = ccHolder || readField(body, 'cc_holder');

      // Sola fields on POST body
      xResult = xResult || readField(body, 'xResult');
      xStatus = xStatus || readField(body, 'xStatus') || readField(body, 'xResponseResult');
      xRefNum = xRefNum || readField(body, 'xRefNum');
      xMaskedCardNumber = xMaskedCardNumber || pick(readField(body, 'xMaskedCardNumber'), readField(body, 'xCardNum'));
      xCardType = xCardType || readField(body, 'xCardType');
      xBillFirstName = xBillFirstName || readField(body, 'xBillFirstName');
      xBillLastName = xBillLastName || readField(body, 'xBillLastName');
      xErrorCode = xErrorCode || readField(body, 'xErrorCode');
      xError = xError || readField(body, 'xError');
    } catch {
      // ignore body parse errors — query params may still be valid
    }
  }

  // Token may also have arrived as xinvoice/xCustom01 in the redirect query string.
  token = token || pick(qp('xinvoice'), qp('xCustom01'));

  // Merge Sola fields into the generic shape:
  //   xResult/xStatus → status
  //   xRefNum         → transaction
  //   xMaskedCardNumber → ccLast4
  //   xBillFirstName + xBillLastName → ccHolder
  //   xError(Code)    → reason (on failure)
  const solaStatus = normalizeSolaStatus(xResult, xStatus);
  if (solaStatus && !status) status = solaStatus;
  if (xRefNum && !transaction) transaction = xRefNum;
  if (xMaskedCardNumber && !ccLast4) ccLast4 = maskedToLast4(xMaskedCardNumber);
  if (!ccHolder && (xBillFirstName || xBillLastName)) {
    ccHolder = [xBillFirstName, xBillLastName].filter(Boolean).join(' ').trim();
  }
  if (!reason && solaStatus === 'failed') {
    reason = pick(xError, xErrorCode, xStatus) || 'declined';
  }

  // Default status to 'paid' if still unknown — keeps the original API contract for
  // simple custom gateways that just hit the URL with no params.
  if (!status) status = 'paid';

  if (!token || !secret) {
    return NextResponse.json({ error: 'Missing token or secret' }, { status: 400 });
  }

  // Look up session and validate secret with constant-time comparison
  const r = await db().execute({
    sql: `SELECT id, owner_id, payment_id, donor_id, pledge_id, status, webhook_secret
          FROM fr_payment_sessions WHERE token = ?`,
    args: [token],
  });
  if (r.rows.length === 0) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const sess = r.rows[0];
  const storedSecret = String(sess.webhook_secret);
  // Constant-time compare to avoid timing leaks
  if (storedSecret.length !== secret.length) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  let same = 0;
  for (let i = 0; i < storedSecret.length; i++) same |= storedSecret.charCodeAt(i) ^ secret.charCodeAt(i);
  if (same !== 0) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // Idempotency: if already completed, just redirect
  if (sess.status === 'completed') {
    return redirectToResult(req, 'completed', token);
  }
  if (sess.status === 'failed' || sess.status === 'expired') {
    return redirectToResult(req, sess.status === 'failed' ? 'failed' : 'expired', token);
  }

  const sessionId = String(sess.id);
  const paymentId = sess.payment_id ? String(sess.payment_id) : null;
  const pledgeId = sess.pledge_id ? String(sess.pledge_id) : null;
  const donorId = String(sess.donor_id);

  if (status === 'paid' || status === 'success' || status === 'completed') {
    if (paymentId) {
      const setParts = ["status = 'paid'", "paid_date = date('now')"];
      const setArgs: (string | number | null)[] = [];
      if (transaction) {
        setParts.push('transaction_ref = ?');
        setArgs.push(transaction);
      }
      if (ccLast4) {
        setParts.push('cc_last4 = ?');
        setArgs.push(ccLast4);
      }
      if (ccHolder) {
        setParts.push('cc_holder = ?');
        setArgs.push(ccHolder);
      }
      setArgs.push(paymentId);
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET ${setParts.join(', ')} WHERE id = ?`,
        args: setArgs,
      });
      if (pledgeId) await recomputePledgeStatus(pledgeId);
      await recomputeDonorTotals(donorId);
    }
    await db().execute({
      sql: `UPDATE fr_payment_sessions SET status = 'completed', completed_at = datetime('now'), gateway_ref = ? WHERE id = ?`,
      args: [transaction, sessionId],
    });
    return redirectToResult(req, 'completed', token);
  } else {
    // status = failed / cancelled
    if (paymentId) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET status = 'failed' WHERE id = ? AND status = 'pending_processor'`,
        args: [paymentId],
      });
    }
    await db().execute({
      sql: `UPDATE fr_payment_sessions SET status = 'failed', failed_at = datetime('now'), failure_reason = ? WHERE id = ?`,
      args: [reason || status, sessionId],
    });
    return redirectToResult(req, 'failed', token);
  }
}

function redirectToResult(req: NextRequest, result: string, token: string): NextResponse {
  // If the gateway POSTed (server-to-server webhook), it doesn't expect a redirect.
  // Return a small JSON ack. If GET (browser redirect-back), send the user to a result page.
  if (req.method === 'POST') {
    return NextResponse.json({ ok: true, result });
  }
  const url = new URL(req.url);
  return NextResponse.redirect(new URL(`/fundraising/payment/result?status=${result}&token=${token}`, url.origin));
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
