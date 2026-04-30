import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const from = url.searchParams.get('from'); // YYYY-MM-DD
  const to = url.searchParams.get('to');
  const projectId = url.searchParams.get('project_id') || '';
  const sourceId = url.searchParams.get('source_id') || '';
  const fundraiserId = url.searchParams.get('fundraiser_id') || '';
  const donorId = url.searchParams.get('donor_id') || '';

  // Build WHERE clauses for paid payments
  let payWhere = `d.owner_id = ? AND pp.status = 'paid'`;
  const payArgs: (string | number)[] = [session.ownerId];

  if (session.role === 'fundraiser') {
    payWhere += ' AND d.assigned_to = ?';
    payArgs.push(session.fundraiserId!);
  } else if (fundraiserId) {
    payWhere += ' AND d.assigned_to = ?';
    payArgs.push(fundraiserId);
  }
  if (from) {
    payWhere += ' AND pp.paid_date >= ?';
    payArgs.push(from);
  }
  if (to) {
    payWhere += ' AND pp.paid_date <= ?';
    payArgs.push(to);
  }
  if (projectId) {
    payWhere += ' AND pp.project_id = ?';
    payArgs.push(projectId);
  }
  if (sourceId) {
    payWhere += ' AND d.source_id = ?';
    payArgs.push(sourceId);
  }
  if (donorId) {
    payWhere += ' AND d.id = ?';
    payArgs.push(donorId);
  }

  const [summary, byProject, bySource, byMethod, byMonth, topDonors, detail] = await Promise.all([
    db().execute({
      sql: `SELECT
              COALESCE(SUM(pp.amount), 0) AS total,
              COUNT(*) AS payment_count,
              COUNT(DISTINCT d.id) AS donor_count,
              COALESCE(AVG(pp.amount), 0) AS avg_payment
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            WHERE ${payWhere}`,
      args: payArgs,
    }),
    db().execute({
      sql: `SELECT prj.id, COALESCE(prj.name, '— Unassigned —') AS name,
                   SUM(pp.amount) AS total, COUNT(*) AS count
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            LEFT JOIN fr_projects prj ON prj.id = pp.project_id
            WHERE ${payWhere}
            GROUP BY prj.id, prj.name
            ORDER BY total DESC`,
      args: payArgs,
    }),
    db().execute({
      sql: `SELECT s.id, COALESCE(s.name, '— Unknown —') AS name,
                   SUM(pp.amount) AS total, COUNT(DISTINCT d.id) AS donor_count
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            LEFT JOIN fr_sources s ON s.id = d.source_id
            WHERE ${payWhere}
            GROUP BY s.id, s.name
            ORDER BY total DESC`,
      args: payArgs,
    }),
    db().execute({
      sql: `SELECT pp.method, SUM(pp.amount) AS total, COUNT(*) AS count
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            WHERE ${payWhere}
            GROUP BY pp.method
            ORDER BY total DESC`,
      args: payArgs,
    }),
    db().execute({
      sql: `SELECT substr(pp.paid_date, 1, 7) AS month, SUM(pp.amount) AS total, COUNT(*) AS count
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            WHERE ${payWhere} AND pp.paid_date IS NOT NULL
            GROUP BY substr(pp.paid_date, 1, 7)
            ORDER BY month ASC`,
      args: payArgs,
    }),
    db().execute({
      sql: `SELECT d.id, d.first_name, d.last_name, d.hebrew_name, d.organization,
                   SUM(pp.amount) AS total, COUNT(*) AS count
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            WHERE ${payWhere}
            GROUP BY d.id, d.first_name, d.last_name, d.hebrew_name, d.organization
            ORDER BY total DESC
            LIMIT 50`,
      args: payArgs,
    }),
    db().execute({
      sql: `SELECT pp.id, pp.amount, pp.paid_date, pp.method, pp.installment_number,
                   pp.check_number, pp.cc_last4, pp.transaction_ref,
                   d.id AS donor_id, d.first_name, d.last_name, d.hebrew_name,
                   prj.name AS project_name, s.name AS source_name
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            LEFT JOIN fr_projects prj ON prj.id = pp.project_id
            LEFT JOIN fr_sources s ON s.id = d.source_id
            WHERE ${payWhere}
            ORDER BY pp.paid_date DESC
            LIMIT 1000`,
      args: payArgs,
    }),
  ]);

  // ===== Outstanding pledges (independent of paid filter) =====
  let openWhere = `d.owner_id = ? AND p.status = 'open'`;
  const openArgs: (string | number)[] = [session.ownerId];
  if (session.role === 'fundraiser') {
    openWhere += ' AND d.assigned_to = ?';
    openArgs.push(session.fundraiserId!);
  } else if (fundraiserId) {
    openWhere += ' AND d.assigned_to = ?';
    openArgs.push(fundraiserId);
  }
  if (projectId) {
    openWhere += ' AND p.project_id = ?';
    openArgs.push(projectId);
  }
  if (sourceId) {
    openWhere += ' AND d.source_id = ?';
    openArgs.push(sourceId);
  }
  if (donorId) {
    openWhere += ' AND d.id = ?';
    openArgs.push(donorId);
  }

  const outstanding = await db().execute({
    sql: `SELECT
            COALESCE(SUM(p.amount), 0) AS total_pledged,
            COALESCE(SUM(COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE pledge_id = p.id AND status = 'paid'), 0)), 0) AS already_paid,
            COUNT(*) AS pledge_count
          FROM fr_pledges p
          JOIN fr_donors d ON d.id = p.donor_id
          WHERE ${openWhere}`,
    args: openArgs,
  });
  const outRow = outstanding.rows[0];
  const outstandingAmount = Number(outRow?.total_pledged || 0) - Number(outRow?.already_paid || 0);

  return NextResponse.json({
    summary: {
      total: Number(summary.rows[0]?.total || 0),
      payment_count: Number(summary.rows[0]?.payment_count || 0),
      donor_count: Number(summary.rows[0]?.donor_count || 0),
      avg_payment: Number(summary.rows[0]?.avg_payment || 0),
      outstanding_pledged: outstandingAmount,
      open_pledge_count: Number(outRow?.pledge_count || 0),
    },
    by_project: byProject.rows.map((r) => ({ id: r.id, name: r.name, total: Number(r.total), count: Number(r.count) })),
    by_source: bySource.rows.map((r) => ({ id: r.id, name: r.name, total: Number(r.total), donor_count: Number(r.donor_count) })),
    by_method: byMethod.rows.map((r) => ({ method: r.method, total: Number(r.total), count: Number(r.count) })),
    by_month: byMonth.rows.map((r) => ({ month: r.month, total: Number(r.total), count: Number(r.count) })),
    top_donors: topDonors.rows.map((r) => ({
      id: r.id,
      name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      hebrew_name: r.hebrew_name,
      organization: r.organization,
      total: Number(r.total),
      count: Number(r.count),
    })),
    detail: detail.rows,
  });
}
