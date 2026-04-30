import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  inEnum,
  isIsoDate,
  isPositiveAmount,
} from '@/lib/fundraising-types';

async function loadPaymentScoped(paymentId: string, ownerId: string) {
  const r = await db().execute({
    sql: `SELECT pp.*
          FROM fr_pledge_payments pp
          JOIN fr_donors d ON d.id = pp.donor_id
          WHERE pp.id = ? AND d.owner_id = ?`,
    args: [paymentId, ownerId],
  });
  return r.rows[0] || null;
}

const FIELDS = [
  'amount',
  'method',
  'due_date',
  'paid_date',
  'status',
  'check_number',
  'check_date',
  'bank_name',
  'cc_last4',
  'cc_holder',
  'cc_expiry',
  'transaction_ref',
  'receipt_number',
  'notes',
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const payment = await loadPaymentScoped(id, session.ownerId);
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  if ('amount' in body && body.amount != null && body.amount !== '' && !isPositiveAmount(body.amount)) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
  }
  if ('status' in body && !inEnum(PAYMENT_STATUSES, body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if ('method' in body && !inEnum(PAYMENT_METHODS, body.method)) {
    return NextResponse.json({ error: 'invalid method' }, { status: 400 });
  }
  for (const dateField of ['due_date', 'paid_date', 'check_date'] as const) {
    if (dateField in body && body[dateField] && !isIsoDate(body[dateField])) {
      return NextResponse.json({ error: `invalid ${dateField}` }, { status: 400 });
    }
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (body.status === 'paid' && !body.paid_date && !payment.paid_date) {
    body.paid_date = new Date().toISOString().slice(0, 10);
  }

  for (const f of FIELDS) {
    if (f in body) {
      sets.push(`${f} = ?`);
      const v = body[f];
      if (f === 'amount') args.push(v === null || v === '' ? null : Number(v));
      else args.push(v === '' ? null : v ?? null);
    }
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(id);
  await db().execute({ sql: `UPDATE fr_pledge_payments SET ${sets.join(', ')} WHERE id = ?`, args });

  await recomputePledgeStatus(String(payment.pledge_id));
  await recomputeDonorTotals(String(payment.donor_id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const payment = await loadPaymentScoped(id, session.ownerId);
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db().execute({ sql: 'DELETE FROM fr_pledge_payments WHERE id = ?', args: [id] });
  await recomputePledgeStatus(String(payment.pledge_id));
  await recomputeDonorTotals(String(payment.donor_id));
  return NextResponse.json({ ok: true });
}
