import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const scope = session.role === 'fundraiser' ? ' AND assigned_to = ?' : '';
  const args: (string | number)[] =
    session.role === 'fundraiser' ? [id, session.ownerId, session.fundraiserId!] : [id, session.ownerId];

  const result = await db().execute({
    sql: `UPDATE fr_donors
          SET status = 'donor', converted_at = COALESCE(converted_at, datetime('now'))
          WHERE id = ? AND owner_id = ?${scope}`,
    args,
  });

  if (result.rowsAffected === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
