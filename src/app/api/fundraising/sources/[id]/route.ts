import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  await db().execute({
    sql: 'DELETE FROM fr_sources WHERE id = ? AND owner_id = ?',
    args: [id, session.ownerId],
  });
  return NextResponse.json({ ok: true });
}
