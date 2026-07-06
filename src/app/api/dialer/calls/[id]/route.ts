// DELETE /api/dialer/calls/[id]  — cancel/stop a dialer call (passcode-gated, owner-scoped).
// PATCH  /api/dialer/calls/[id]  — edit a still-editable call (pending/recurring).

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { isDialerAuthed, resolveDialerOwnerId } from '@/lib/dialer-auth';
import { applyCallUpdate } from '@/app/api/fundraising/scheduled-calls/route';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isDialerAuthed())) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const ownerId = await resolveDialerOwnerId();
  if (!ownerId) return NextResponse.json({ error: 'No account configured' }, { status: 500 });
  await dbReady();
  const { id } = await params;

  const r = await db().execute({
    sql: 'DELETE FROM fr_scheduled_calls WHERE id = ? AND owner_id = ?',
    args: [id, ownerId],
  });
  if (r.rowsAffected === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isDialerAuthed())) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const ownerId = await resolveDialerOwnerId();
  if (!ownerId) return NextResponse.json({ error: 'No account configured' }, { status: 500 });
  await dbReady();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await applyCallUpdate(ownerId, id, body);
  return NextResponse.json(result.body, { status: result.status });
}
