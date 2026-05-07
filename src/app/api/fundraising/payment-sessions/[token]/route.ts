import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

/**
 * GET /api/fundraising/payment-sessions/[token]
 *
 * Used by the payment page UI to poll session status while the user is
 * completing the charge in the gateway. Returns minimal info — no secrets.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { token } = await params;

  const r = await db().execute({
    sql: `SELECT s.id, s.status, s.amount, s.currency, s.completed_at, s.failed_at, s.failure_reason, s.gateway_ref,
                 p.status AS payment_status, p.paid_date
          FROM fr_payment_sessions s
          LEFT JOIN fr_pledge_payments p ON p.id = s.payment_id
          WHERE s.token = ? AND s.owner_id = ?`,
    args: [token, session.ownerId],
  });

  if (r.rows.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  return NextResponse.json(r.rows[0]);
}

/**
 * DELETE /api/fundraising/payment-sessions/[token]
 *
 * Cancels a pending session and rolls back the payment row to scheduled (or removes
 * it if it was newly created). Useful if user closes the gateway without paying.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { token } = await params;

  const r = await db().execute({
    sql: 'SELECT id, status, payment_id FROM fr_payment_sessions WHERE token = ? AND owner_id = ?',
    args: [token, session.ownerId],
  });
  if (r.rows.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const sess = r.rows[0];
  if (String(sess.status) === 'completed') {
    return NextResponse.json({ error: 'Cannot cancel a completed session' }, { status: 400 });
  }

  await db().execute({
    sql: "UPDATE fr_payment_sessions SET status = 'expired' WHERE id = ?",
    args: [String(sess.id)],
  });
  // Roll back the linked payment to scheduled so it doesn't sit in pending_processor forever.
  if (sess.payment_id) {
    await db().execute({
      sql: "UPDATE fr_pledge_payments SET status = 'scheduled' WHERE id = ? AND status = 'pending_processor'",
      args: [String(sess.payment_id)],
    });
  }
  return NextResponse.json({ ok: true });
}
