import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { PROJECT_STATUSES, inEnum, isIsoDate } from '@/lib/fundraising-types';

const FIELDS = ['name', 'description', 'goal_amount', 'currency', 'status', 'start_date', 'end_date', 'color'] as const;

async function loadProject(id: string, ownerId: string) {
  const r = await db().execute({
    sql: 'SELECT * FROM fr_projects WHERE id = ? AND owner_id = ?',
    args: [id, ownerId],
  });
  return r.rows[0] || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const project = await loadProject(id, session.ownerId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fundraiserFilter = session.role === 'fundraiser' ? ' AND d.assigned_to = ?' : '';
  const fundraiserArgs = session.role === 'fundraiser' ? [session.fundraiserId!] : [];

  const [pledges, payments, totals] = await Promise.all([
    db().execute({
      sql: `SELECT pl.*, d.first_name, d.last_name, d.hebrew_name,
                   COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE pledge_id = pl.id AND status = 'paid'), 0) AS paid_amount
            FROM fr_pledges pl
            JOIN fr_donors d ON d.id = pl.donor_id
            WHERE pl.project_id = ?${fundraiserFilter}
            ORDER BY pl.pledge_date DESC`,
      args: [id, ...fundraiserArgs],
    }),
    db().execute({
      sql: `SELECT pp.*, d.first_name, d.last_name
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            WHERE pp.project_id = ?${fundraiserFilter}
            ORDER BY COALESCE(pp.paid_date, pp.due_date, pp.created_at) DESC
            LIMIT 100`,
      args: [id, ...fundraiserArgs],
    }),
    db().execute({
      sql: `SELECT
              COALESCE((SELECT SUM(amount) FROM fr_pledges WHERE project_id = ? AND status IN ('open','fulfilled')), 0) AS pledged,
              COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE project_id = ? AND status = 'paid'), 0) AS paid,
              COALESCE((SELECT COUNT(DISTINCT donor_id) FROM fr_pledges WHERE project_id = ?), 0) AS donor_count`,
      args: [id, id, id],
    }),
  ]);

  return NextResponse.json({
    project: {
      ...project,
      goal_amount: project.goal_amount === null ? null : Number(project.goal_amount),
    },
    totals: {
      pledged: Number(totals.rows[0]?.pledged || 0),
      paid: Number(totals.rows[0]?.paid || 0),
      donor_count: Number(totals.rows[0]?.donor_count || 0),
    },
    pledges: pledges.rows,
    payments: payments.rows,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  const project = await loadProject(id, session.ownerId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  if ('status' in body && !inEnum(PROJECT_STATUSES, body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if ('goal_amount' in body && body.goal_amount != null && body.goal_amount !== '') {
    const n = Number(body.goal_amount);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'goal_amount must be a non-negative number' }, { status: 400 });
    }
  }
  for (const dateField of ['start_date', 'end_date'] as const) {
    if (dateField in body && body[dateField] && !isIsoDate(body[dateField])) {
      return NextResponse.json({ error: `invalid ${dateField}` }, { status: 400 });
    }
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  for (const f of FIELDS) {
    if (f in body) {
      sets.push(`${f} = ?`);
      const value = body[f];
      if (f === 'goal_amount') {
        args.push(value === null || value === '' ? null : Number(value));
      } else {
        args.push(value === '' ? null : value ?? null);
      }
    }
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(id);
  await db().execute({ sql: `UPDATE fr_projects SET ${sets.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  // Check if project has pledges/payments — if so, archive instead of hard delete
  const usage = await db().execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM fr_pledges WHERE project_id = ?) AS pledge_count,
            (SELECT COUNT(*) FROM fr_pledge_payments WHERE project_id = ?) AS payment_count`,
    args: [id, id],
  });
  const hasUsage = Number(usage.rows[0].pledge_count) + Number(usage.rows[0].payment_count) > 0;

  if (hasUsage) {
    await db().execute({
      sql: "UPDATE fr_projects SET status = 'archived' WHERE id = ? AND owner_id = ?",
      args: [id, session.ownerId],
    });
    return NextResponse.json({ archived: true });
  }

  await db().execute({
    sql: 'DELETE FROM fr_projects WHERE id = ? AND owner_id = ?',
    args: [id, session.ownerId],
  });
  return NextResponse.json({ deleted: true });
}
