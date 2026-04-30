import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id, noteId } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if ('body' in body) {
    sets.push('body = ?');
    args.push(String(body.body || '').trim());
  }
  if ('pinned' in body) {
    sets.push('pinned = ?');
    args.push(body.pinned ? 1 : 0);
  }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(noteId, id);
  await db().execute({ sql: `UPDATE fr_notes SET ${sets.join(', ')} WHERE id = ? AND donor_id = ?`, args });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id, noteId } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await db().execute({ sql: 'DELETE FROM fr_notes WHERE id = ? AND donor_id = ?', args: [noteId, id] });
  return NextResponse.json({ ok: true });
}
