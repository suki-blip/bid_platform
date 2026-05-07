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
 * After processing, redirects (302) to /fundraising/pay/result?status=... so the user's
 * browser lands on a friendly page if the gateway redirected them here.
 */

async function handle(req: NextRequest): Promise<NextResponse> {
  await dbReady();

  // Parse params from URL or POST body. URL takes priority.
  const url = new URL(req.url);
  let token = url.searchParams.get('token');
  let secret = url.searchParams.get('secret');
  let status = url.searchParams.get('status') || 'paid';
  let transaction = url.searchParams.get('transaction') || url.searchParams.get('transaction_id') || null;
  let reason = url.searchParams.get('reason') || null;
  let ccLast4 = url.searchParams.get('cc_last4') || null;
  let ccHolder = url.searchParams.get('cc_holder') || null;

  if (req.method === 'POST') {
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await req.json();
        token = token || body.token || body.ref;
        secret = secret || body.secret;
        status = body.status || status;
        transaction = transaction || body.transaction || body.transaction_id || null;
        reason = reason || body.reason || null;
        ccLast4 = ccLast4 || body.cc_last4 || null;
        ccHolder = ccHolder || body.cc_holder || null;
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const form = await req.formData();
        token = token || (form.get('token') as string | null) || (form.get('ref') as string | null);
        secret = secret || (form.get('secret') as string | null);
        status = (form.get('status') as string | null) || status;
        transaction = transaction || (form.get('transaction') as string | null) || (form.get('transaction_id') as string | null);
        reason = reason || (form.get('reason') as string | null);
        ccLast4 = ccLast4 || (form.get('cc_last4') as string | null);
        ccHolder = ccHolder || (form.get('cc_holder') as string | null);
      }
    } catch {
      // ignore body parse errors — query params may still be valid
    }
  }

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
  return NextResponse.redirect(new URL(`/fundraising/pay/result?status=${result}&token=${token}`, url.origin));
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
