import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let where = 'p.owner_id = ?';
  const args: (string | number)[] = [session.ownerId];
  if (status === 'active' || status === 'closed' || status === 'archived') {
    where += ' AND p.status = ?';
    args.push(status);
  }

  const result = await db().execute({
    sql: `SELECT
            p.*,
            COALESCE((SELECT SUM(amount) FROM fr_pledges WHERE project_id = p.id AND status IN ('open','fulfilled')), 0) AS pledged_amount,
            COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE project_id = p.id AND status = 'paid'), 0) AS paid_amount,
            COALESCE((SELECT COUNT(DISTINCT donor_id) FROM fr_pledges WHERE project_id = p.id), 0) AS donor_count
          FROM fr_projects p
          WHERE ${where}
          ORDER BY p.status = 'active' DESC, p.created_at DESC`,
    args,
  });

  return NextResponse.json(
    result.rows.map((r) => ({
      ...r,
      goal_amount: r.goal_amount === null ? null : Number(r.goal_amount),
      pledged_amount: Number(r.pledged_amount),
      paid_amount: Number(r.paid_amount),
      donor_count: Number(r.donor_count),
    })),
  );
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Only managers can create projects' }, { status: 403 });
  await dbReady();

  const body = await request.json();
  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_projects (id, owner_id, name, description, goal_amount, currency, status, start_date, end_date, color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      session.ownerId,
      name,
      body.description || null,
      body.goal_amount ? Number(body.goal_amount) : null,
      body.currency || 'USD',
      body.status || 'active',
      body.start_date || null,
      body.end_date || null,
      body.color || null,
    ],
  });

  return NextResponse.json({ id, name });
}
