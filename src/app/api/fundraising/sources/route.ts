import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const result = await db().execute({
    sql: `SELECT s.id, s.name, COUNT(d.id) AS donor_count
          FROM fr_sources s
          LEFT JOIN fr_donors d ON d.source_id = s.id
          WHERE s.owner_id = ?
          GROUP BY s.id
          ORDER BY s.name COLLATE NOCASE`,
    args: [session.ownerId],
  });

  return NextResponse.json(
    result.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      donor_count: Number(r.donor_count || 0),
    })),
  );
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const { name } = await request.json();
  const trimmed = (name || '').trim();
  if (!trimmed) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const id = crypto.randomUUID();
  await db().execute({
    sql: 'INSERT INTO fr_sources (id, owner_id, name) VALUES (?, ?, ?)',
    args: [id, session.ownerId, trimmed],
  });

  return NextResponse.json({ id, name: trimmed, donor_count: 0 });
}
