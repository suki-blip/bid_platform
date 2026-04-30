import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { recomputeDonorTotals } from '@/lib/fundraising-totals';
import { PLEDGE_STATUSES, inEnum, isIsoDate, isPositiveAmount } from '@/lib/fundraising-types';

async function loadPledge(pledgeId: string, ownerId: string) {
  const r = await db().execute({
    sql: 'SELECT * FROM fr_pledges WHERE id = ? AND owner_id = ?',
    args: [pledgeId, ownerId],
  });
  return r.rows[0] || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const pledge = await loadPledge(id, session.ownerId);
  if (!pledge) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const payments = await db().execute({
    sql: 'SELECT * FROM fr_pledge_payments WHERE pledge_id = ? ORDER BY installment_number ASC',
    args: [id],
  });

  return NextResponse.json({
    pledge: { ...pledge, amount: Number(pledge.amount) },
    payments: payments.rows,
  });
}

const FIELDS = ['amount', 'project_id', 'pledge_date', 'due_date', 'notes', 'status'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const pledge = await loadPledge(id, session.ownerId);
  if (!pledge) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  if ('amount' in body && body.amount != null && body.amount !== '' && !isPositiveAmount(body.amount)) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
  }
  if ('status' in body && !inEnum(PLEDGE_STATUSES, body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  for (const dateField of ['pledge_date', 'due_date'] as const) {
    if (dateField in body && body[dateField] && !isIsoDate(body[dateField])) {
      return NextResponse.json({ error: `invalid ${dateField}` }, { status: 400 });
    }
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
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
  await db().execute({ sql: `UPDATE fr_pledges SET ${sets.join(', ')} WHERE id = ?`, args });
  await recomputeDonorTotals(String(pledge.donor_id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const pledge = await loadPledge(id, session.ownerId);
  if (!pledge) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db().execute({ sql: 'DELETE FROM fr_pledges WHERE id = ?', args: [id] });
  await recomputeDonorTotals(String(pledge.donor_id));
  return NextResponse.json({ ok: true });
}
