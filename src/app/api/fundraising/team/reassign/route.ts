import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = await request.json();
  const donorIds: string[] = Array.isArray(body.donor_ids) ? body.donor_ids : [];
  const fundraiserId: string | null = body.fundraiser_id || null;

  if (donorIds.length === 0) {
    return NextResponse.json({ error: 'No donors selected' }, { status: 400 });
  }

  // Verify fundraiser belongs to this owner if provided
  if (fundraiserId) {
    const fr = await db().execute({
      sql: "SELECT id FROM team_members WHERE id = ? AND owner_id = ? AND role = 'fundraiser'",
      args: [fundraiserId, session.ownerId],
    });
    if (fr.rows.length === 0) {
      return NextResponse.json({ error: 'Fundraiser not found' }, { status: 400 });
    }
  }

  const placeholders = donorIds.map(() => '?').join(',');
  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `UPDATE fr_donors SET assigned_to = ? WHERE owner_id = ? AND id IN (${placeholders})`,
      args: [fundraiserId, session.ownerId, ...donorIds],
    },
    ...donorIds.map((did) => ({
      sql: 'INSERT INTO fr_donor_assignments (id, donor_id, fundraiser_id, assigned_by, reason) VALUES (?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), did, fundraiserId, session.actorId, body.reason || null],
    })),
  ];
  await db().batch(stmts, 'write');

  return NextResponse.json({ ok: true, count: donorIds.length });
}
