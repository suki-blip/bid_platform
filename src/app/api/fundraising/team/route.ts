import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { hashPassword, validatePassword } from '@/lib/auth';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const result = await db().execute({
    sql: `SELECT tm.id, tm.name, tm.email, tm.role, tm.status, tm.created_at,
                 (SELECT COUNT(*) FROM fr_donors WHERE assigned_to = tm.id) AS assigned_count,
                 (SELECT COUNT(*) FROM fr_calls WHERE fundraiser_id = tm.id) AS call_count,
                 (SELECT COALESCE(SUM(pp.amount), 0)
                    FROM fr_pledge_payments pp
                    JOIN fr_donors d ON d.id = pp.donor_id
                    WHERE d.assigned_to = tm.id AND pp.status = 'paid') AS total_raised
          FROM team_members tm
          WHERE tm.owner_id = ? AND tm.role = 'fundraiser'
          ORDER BY tm.created_at DESC`,
    args: [session.ownerId],
  });

  return NextResponse.json(
    result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
      created_at: r.created_at,
      assigned_count: Number(r.assigned_count),
      call_count: Number(r.call_count),
      total_raised: Number(r.total_raised),
    })),
  );
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = await request.json();
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return NextResponse.json({ error: pwCheck.error }, { status: 400 });

  const existing = await db().execute({
    sql: 'SELECT id FROM team_members WHERE email = ? AND owner_id = ?',
    args: [email, session.ownerId],
  });
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'A team member with this email already exists' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db().execute({
    sql: `INSERT INTO team_members (id, owner_id, name, email, password_hash, role, can_view_budget, status)
          VALUES (?, ?, ?, ?, ?, 'fundraiser', 1, 'active')`,
    args: [id, session.ownerId, name, email, passwordHash],
  });

  return NextResponse.json({ id });
}
