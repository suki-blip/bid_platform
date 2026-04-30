import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import {
  FOLLOWUP_KINDS,
  FOLLOWUP_PRIORITIES,
  FOLLOWUP_STATUSES,
  inEnum,
  isIsoDate,
} from '@/lib/fundraising-types';
import { refreshDonorNextFollowup } from '@/lib/fundraising-totals';

const FIELDS = [
  'title',
  'description',
  'due_at',
  'end_at',
  'kind',
  'priority',
  'status',
  'hebrew_date',
  'remind_minutes_before',
  'project_id',
] as const;

async function loadFollowup(id: string, ownerId: string) {
  const r = await db().execute({
    sql: 'SELECT * FROM fr_followups WHERE id = ? AND owner_id = ?',
    args: [id, ownerId],
  });
  return r.rows[0] || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const followup = await loadFollowup(id, session.ownerId);
  if (!followup) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  if ('kind' in body && body.kind && !inEnum(FOLLOWUP_KINDS, body.kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }
  if ('priority' in body && body.priority && !inEnum(FOLLOWUP_PRIORITIES, body.priority)) {
    return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
  }
  if ('status' in body && body.status && !inEnum(FOLLOWUP_STATUSES, body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  for (const dateField of ['due_at', 'end_at'] as const) {
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
      if (f === 'remind_minutes_before') args.push(v === null || v === '' ? null : Number(v));
      else args.push(v === '' ? null : v ?? null);
    }
  }

  if (body.status === 'done' && !body.completed_at) {
    sets.push('completed_at = ?');
    args.push(new Date().toISOString());
  }
  if (body.status === 'pending') {
    sets.push('completed_at = NULL');
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(id);
  await db().execute({ sql: `UPDATE fr_followups SET ${sets.join(', ')} WHERE id = ?`, args });

  if (followup.donor_id) await refreshDonorNextFollowup(String(followup.donor_id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const followup = await loadFollowup(id, session.ownerId);
  if (!followup) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db().execute({ sql: 'DELETE FROM fr_followups WHERE id = ?', args: [id] });

  if (followup.donor_id) await refreshDonorNextFollowup(String(followup.donor_id));

  return NextResponse.json({ ok: true });
}
