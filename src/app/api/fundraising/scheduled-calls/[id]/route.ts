// DELETE /api/fundraising/scheduled-calls/[id]  — cancel/stop a call (owner-scoped).
// PATCH  /api/fundraising/scheduled-calls/[id]  — edit a still-editable call (pending/recurring).

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { applyCallUpdate } from '../route';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const r = await db().execute({
    sql: 'DELETE FROM fr_scheduled_calls WHERE id = ? AND owner_id = ?',
    args: [id, session.ownerId],
  });
  if (r.rowsAffected === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await applyCallUpdate(session.ownerId, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
