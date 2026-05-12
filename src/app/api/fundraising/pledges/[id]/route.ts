import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
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

// DELETE /api/fundraising/pledges/[id]
//
// Three flavours, selected by ?payment_action= (default: 'delete'):
//
//   delete (default)
//      Drops the pledge + every linked payment (FK CASCADE). Use when the
//      whole pledge was a mistake.
//
//   move&target_pledge_id=<id>
//      Re-attributes every payment of the pledge to <target_pledge_id> (must
//      belong to the same donor + owner), then deletes the source pledge.
//      Payments keep their amounts; installment numbers are bumped to the
//      next free slot on the destination, and their project_id follows the
//      destination's project. Used when the user wants to consolidate.
//
//   standalone[&project_id=<id>]
//      Each payment of the pledge gets converted to its own standalone
//      "free donation" — a new is_standalone=1 pledge per payment, holding
//      a single 1-installment row. project_id, if supplied, lives on every
//      new wrapper pledge AND on the payment rows themselves. The original
//      pledge is deleted after the moves.
//
// Recompute hooks run for the donor + every affected pledge so totals are
// always coherent after the operation.

import crypto from 'crypto';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const pledge = await loadPledge(id, session.ownerId);
  if (!pledge) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const action = (url.searchParams.get('payment_action') || 'delete').toLowerCase();
  const targetPledgeId = url.searchParams.get('target_pledge_id') || null;
  const projectIdParam = url.searchParams.get('project_id') || null;
  const donorId = String(pledge.donor_id);

  // ---------- delete: simple CASCADE ----------
  if (action === 'delete') {
    await db().execute({ sql: 'DELETE FROM fr_pledges WHERE id = ?', args: [id] });
    await recomputeDonorTotals(donorId);
    return NextResponse.json({ ok: true, action: 'delete' });
  }

  // ---------- move: re-attribute all payments to a target pledge ----------
  if (action === 'move') {
    if (!targetPledgeId) {
      return NextResponse.json({ error: 'target_pledge_id required for move' }, { status: 400 });
    }
    if (targetPledgeId === id) {
      return NextResponse.json({ error: 'target_pledge_id must differ from source' }, { status: 400 });
    }
    const target = await db().execute({
      sql: `SELECT id, donor_id, project_id FROM fr_pledges WHERE id = ? AND owner_id = ?`,
      args: [targetPledgeId, session.ownerId],
    });
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'Target pledge not found' }, { status: 404 });
    }
    if (String(target.rows[0].donor_id) !== donorId) {
      return NextResponse.json({ error: 'Target pledge belongs to a different donor' }, { status: 400 });
    }
    const targetProjectId = target.rows[0].project_id ? String(target.rows[0].project_id) : null;

    // Find max installment_number on the target so we can append cleanly
    const maxRes = await db().execute({
      sql: `SELECT COALESCE(MAX(installment_number), 0) AS n FROM fr_pledge_payments WHERE pledge_id = ?`,
      args: [targetPledgeId],
    });
    const startN = Number(maxRes.rows[0]?.n || 0) + 1;

    // Pull payments to renumber
    const payRes = await db().execute({
      sql: `SELECT id FROM fr_pledge_payments WHERE pledge_id = ? ORDER BY installment_number ASC, created_at ASC`,
      args: [id],
    });
    let n = startN;
    for (const p of payRes.rows) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments
              SET pledge_id = ?, project_id = ?, installment_number = ?
              WHERE id = ?`,
        args: [targetPledgeId, targetProjectId, n++, String(p.id)],
      });
    }

    await db().execute({ sql: 'DELETE FROM fr_pledges WHERE id = ?', args: [id] });
    await recomputePledgeStatus(targetPledgeId);
    await recomputeDonorTotals(donorId);
    return NextResponse.json({ ok: true, action: 'move', target_pledge_id: targetPledgeId, moved: payRes.rows.length });
  }

  // ---------- standalone: each payment becomes its own free donation ----------
  if (action === 'standalone') {
    const payRes = await db().execute({
      sql: `SELECT id, amount FROM fr_pledge_payments WHERE pledge_id = ?`,
      args: [id],
    });
    for (const p of payRes.rows) {
      const newPledgeId = crypto.randomUUID();
      const amount = Number(p.amount);
      await db().execute({
        sql: `INSERT INTO fr_pledges
                (id, owner_id, donor_id, project_id, fundraiser_id, amount, status, pledge_date,
                 installments_total, payment_plan, is_standalone)
              VALUES (?, ?, ?, ?, ?, ?, 'fulfilled', date('now'), 1, 'lump_sum', 1)`,
        args: [newPledgeId, session.ownerId, donorId, projectIdParam, session.fundraiserId, amount],
      });
      await db().execute({
        sql: `UPDATE fr_pledge_payments
              SET pledge_id = ?, project_id = ?, installment_number = 1
              WHERE id = ?`,
        args: [newPledgeId, projectIdParam, String(p.id)],
      });
    }
    await db().execute({ sql: 'DELETE FROM fr_pledges WHERE id = ?', args: [id] });
    await recomputeDonorTotals(donorId);
    return NextResponse.json({ ok: true, action: 'standalone', converted: payRes.rows.length });
  }

  return NextResponse.json({ error: `unknown payment_action '${action}'` }, { status: 400 });
}
