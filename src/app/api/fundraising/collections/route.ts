import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const view = url.searchParams.get('view') || 'all'; // 'overdue' | 'upcoming' | 'bounced' | 'all'
  const projectId = url.searchParams.get('project_id') || '';
  const today = new Date().toISOString().slice(0, 10);

  let where = `d.owner_id = ?`;
  const args: (string | number)[] = [session.ownerId];

  if (session.role === 'fundraiser') {
    where += ' AND d.assigned_to = ?';
    args.push(session.fundraiserId!);
  }

  if (view === 'overdue') {
    where += " AND pp.status IN ('scheduled','failed') AND pp.due_date IS NOT NULL AND pp.due_date < ?";
    args.push(today);
  } else if (view === 'upcoming') {
    // Future scheduled installments (next 30 days). Kept as an opt-in view so the user can
    // look ahead, but they don't pollute the default "All open" tab anymore.
    where += " AND pp.status = 'scheduled' AND pp.due_date IS NOT NULL AND pp.due_date >= ? AND pp.due_date <= ?";
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    args.push(today, in30.toISOString().slice(0, 10));
  } else if (view === 'bounced') {
    where += " AND pp.status IN ('bounced','failed')";
  } else {
    // 'all' (default) = rows whose due_date has actually arrived + bounced/failed.
    // Future-dated installments are hidden — they're not actionable yet. To peek at them,
    // switch to the "Upcoming" tab.
    where += " AND pp.status IN ('scheduled','bounced','failed') AND (pp.due_date IS NULL OR pp.due_date <= ?)";
    args.push(today);
  }

  if (projectId) {
    where += ' AND pp.project_id = ?';
    args.push(projectId);
  }

  const result = await db().execute({
    // pledge_amount = the pledge's total commitment; pledge_paid_total = sum of paid payments
    // on that pledge. The frontend shows both alongside the installment amount so the user
    // can quickly see how much of the commitment has been collected and how much remains.
    sql: `SELECT pp.id, pp.amount, pp.method, pp.status, pp.due_date, pp.paid_date,
                 pp.installment_number, pp.check_number, pp.check_date, pp.bank_name,
                 pp.cc_last4, pp.notes, pp.pledge_id,
                 d.id AS donor_id, d.first_name, d.last_name, d.hebrew_name,
                 (SELECT phone FROM fr_donor_phones WHERE donor_id = d.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_phone,
                 prj.name AS project_name,
                 pl.installments_total,
                 pl.amount AS pledge_amount,
                 COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE pledge_id = pl.id AND status = 'paid'), 0) AS pledge_paid_total
          FROM fr_pledge_payments pp
          JOIN fr_donors d ON d.id = pp.donor_id
          LEFT JOIN fr_projects prj ON prj.id = pp.project_id
          JOIN fr_pledges pl ON pl.id = pp.pledge_id
          WHERE ${where}
          ORDER BY
            CASE WHEN pp.status IN ('bounced','failed') THEN 0 ELSE 1 END,
            pp.due_date ASC NULLS LAST
          LIMIT 500`,
    args,
  });

  const summary = await db().execute({
    sql: `SELECT
            COALESCE(SUM(CASE WHEN pp.status IN ('scheduled','failed') AND pp.due_date < ? THEN pp.amount ELSE 0 END), 0) AS overdue_amt,
            COALESCE(SUM(CASE WHEN pp.status IN ('scheduled','failed') AND pp.due_date < ? THEN 1 ELSE 0 END), 0) AS overdue_cnt,
            COALESCE(SUM(CASE WHEN pp.status = 'scheduled' AND pp.due_date >= ? THEN pp.amount ELSE 0 END), 0) AS upcoming_amt,
            COALESCE(SUM(CASE WHEN pp.status = 'scheduled' AND pp.due_date >= ? THEN 1 ELSE 0 END), 0) AS upcoming_cnt,
            COALESCE(SUM(CASE WHEN pp.status IN ('bounced','failed') THEN pp.amount ELSE 0 END), 0) AS bounced_amt,
            COALESCE(SUM(CASE WHEN pp.status IN ('bounced','failed') THEN 1 ELSE 0 END), 0) AS bounced_cnt
          FROM fr_pledge_payments pp
          JOIN fr_donors d ON d.id = pp.donor_id
          WHERE d.owner_id = ?${session.role === 'fundraiser' ? ' AND d.assigned_to = ?' : ''}`,
    args: session.role === 'fundraiser'
      ? [today, today, today, today, session.ownerId, session.fundraiserId!]
      : [today, today, today, today, session.ownerId],
  });

  return NextResponse.json({
    items: result.rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
    })),
    summary: {
      overdue: { amount: Number(summary.rows[0].overdue_amt), count: Number(summary.rows[0].overdue_cnt) },
      upcoming: { amount: Number(summary.rows[0].upcoming_amt), count: Number(summary.rows[0].upcoming_cnt) },
      bounced: { amount: Number(summary.rows[0].bounced_amt), count: Number(summary.rows[0].bounced_cnt) },
    },
  });
}
