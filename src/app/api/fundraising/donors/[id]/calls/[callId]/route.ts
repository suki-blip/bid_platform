import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

const FIELDS = ['direction', 'channel', 'occurred_at', 'outcome', 'summary', 'transcript', 'project_id'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id, callId } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const f of FIELDS) {
    if (f in body) {
      sets.push(`${f} = ?`);
      args.push(body[f] === '' ? null : body[f] ?? null);
    }
  }
  if ('duration_min' in body) {
    sets.push('duration_min = ?');
    args.push(body.duration_min ? Number(body.duration_min) : null);
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(callId, id);
  await db().execute({
    sql: `UPDATE fr_calls SET ${sets.join(', ')} WHERE id = ? AND donor_id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id, callId } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await db().execute({
    sql: 'DELETE FROM fr_calls WHERE id = ? AND donor_id = ?',
    args: [callId, id],
  });
  return NextResponse.json({ ok: true });
}
