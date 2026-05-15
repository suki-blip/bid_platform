import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
import { softDeletePayment } from '@/lib/fundraising-recycle-bin';
import { writeAudit } from '@/lib/fundraising-audit';
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

  // Optional pledge re-assignment. Lets the user re-attribute an existing payment to a
  // different pledge of the SAME donor (e.g. moved from a generic donation to a specific
  // campaign pledge). We validate the target pledge before touching anything.
  const oldPledgeId = String(payment.pledge_id);
  let newPledgeId: string | null = null;
  if ('pledge_id' in body && body.pledge_id && body.pledge_id !== oldPledgeId) {
    const targetPledgeId = String(body.pledge_id);
    const v = await db().execute({
      sql: `SELECT id, project_id FROM fr_pledges WHERE id = ? AND donor_id = ? AND owner_id = ?`,
      args: [targetPledgeId, String(payment.donor_id), session.ownerId],
    });
    if (v.rows.length === 0) {
      return NextResponse.json({ error: 'Target pledge not found or belongs to a different donor' }, { status: 400 });
    }
    newPledgeId = targetPledgeId;
    sets.push('pledge_id = ?');
    args.push(newPledgeId);
    // Also flip project_id to follow the new pledge — keeps reports clean.
    const newProjectId = v.rows[0].project_id ? String(v.rows[0].project_id) : null;
    sets.push('project_id = ?');
    args.push(newProjectId);
    // Bump installment_number to the next free slot on the destination pledge
    const ord = await db().execute({
      sql: `SELECT COALESCE(MAX(installment_number), 0) + 1 AS n
            FROM fr_pledge_payments WHERE pledge_id = ?`,
      args: [newPledgeId],
    });
    sets.push('installment_number = ?');
    args.push(Number(ord.rows[0].n || 1));
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(id);
  await db().execute({ sql: `UPDATE fr_pledge_payments SET ${sets.join(', ')} WHERE id = ?`, args });

  // Recompute the OLD pledge (we may have just removed a payment from it)
  await recomputePledgeStatus(oldPledgeId);
  // Recompute the NEW pledge if we moved
  if (newPledgeId && newPledgeId !== oldPledgeId) {
    await recomputePledgeStatus(newPledgeId);
  }
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

  // Soft-delete via Recycle Bin (30-day restore window). softDeletePayment internally
  // re-runs recomputePledgeStatus + recomputeDonorTotals after the hard-DELETE.
  const result = await softDeletePayment({
    paymentId: id,
    ownerId: session.ownerId,
    deletedBy: session.fundraiserId || null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Could not delete payment' }, { status: 404 });
  }
  await writeAudit({
    ownerId: session.ownerId,
    actorId: session.actorId,
    actorLabel: session.name,
    entityType: 'payment',
    entityId: id,
    action: 'delete',
    summary: `Deleted $${Number(payment.amount).toFixed(2)} payment`,
  });
  return NextResponse.json({ ok: true, recycle_id: result.recycle_id });
}
