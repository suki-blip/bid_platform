import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: 'Too many ids (max 500)' }, { status: 400 });

  const placeholders = ids.map(() => '?').join(',');
  const result = await db().execute({
    sql: `DELETE FROM fr_donors WHERE owner_id = ? AND id IN (${placeholders})`,
    args: [session.ownerId, ...ids],
  });

  return NextResponse.json({ deleted: result.rowsAffected ?? ids.length });
}
