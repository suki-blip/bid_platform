import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// Helper: a filter query param can now be empty, a single id, or a comma-separated list.
// The sentinel value '__none__' means "match rows where the field IS NULL" (for example
// "no project" payments). Both can be mixed: 'project-1,__none__,project-2' →
//   (project_id IN ('project-1','project-2') OR project_id IS NULL).
function buildInOrNullClause(field: string, value: string): { sql: string; args: string[] } | null {
  if (!value) return null;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const includeNull = parts.includes('__none__');
  const ids = parts.filter((p) => p !== '__none__');

  if (includeNull && ids.length === 0) return { sql: `${field} IS NULL`, args: [] };
  if (!includeNull && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    return { sql: `${field} IN (${placeholders})`, args: ids };
  }
  if (includeNull && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    return { sql: `(${field} IN (${placeholders}) OR ${field} IS NULL)`, args: ids };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const from = url.searchParams.get('from'); // YYYY-MM-DD
  const to = url.searchParams.get('to');
  // All four filters now accept comma-separated ID lists + '__none__' for IS NULL.
  const projectIdParam = url.searchParams.get('project_id') || '';
  const sourceIdParam = url.searchParams.get('source_id') || '';
  const fundraiserIdParam = url.searchParams.get('fundraiser_id') || '';
  const donorIdParam = url.searchParams.get('donor_id') || '';

  // Build WHERE clauses for paid payments
  let payWhere = `d.owner_id = ? AND pp.status = 'paid'`;
  const payArgs: (string | number)[] = [session.ownerId];

  if (session.role === 'fundraiser') {
    payWhere += ' AND d.assigned_to = ?';
    payArgs.push(session.fundraiserId!);
  } else if (fundraiserIdParam) {
    const f = buildInOrNullClause('d.assigned_to', fundraiserIdParam);
    if (f) {
      payWhere += ` AND ${f.sql}`;
      payArgs.push(...f.args);
    }
  }
  if (from) {
    payWhere += ' AND pp.paid_date >= ?';
    payArgs.push(from);
  }
  if (to) {
    payWhere += ' AND pp.paid_date <= ?';
    payArgs.push(to);
  }
  if (projectIdParam) {
    const f = buildInOrNullClause('pp.project_id', projectIdParam);
    if (f) {
      payWhere += ` AND ${f.sql}`;
      payArgs.push(...f.args);
    }
  }
  if (sourceIdParam) {
    const f = buildInOrNullClause('d.source_id', sourceIdParam);
    if (f) {
      payWhere += ` AND ${f.sql}`;
      payArgs.push(...f.args);
    }
  }
  if (donorIdParam) {
    const f = buildInOrNullClause('d.id', donorIdParam);
    if (f) {
      payWhere += ` AND ${f.sql}`;
      payArgs.push(...f.args);
    }
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
  // Also limit to REAL pledges (is_standalone=0) — the standalone wrappers around free
  // donations aren't commitments and shouldn't inflate the "outstanding" figure.
  let openWhere = `d.owner_id = ? AND p.status = 'open' AND COALESCE(p.is_standalone, 0) = 0`;
  const openArgs: (string | number)[] = [session.ownerId];
  if (session.role === 'fundraiser') {
    openWhere += ' AND d.assigned_to = ?';
    openArgs.push(session.fundraiserId!);
  } else if (fundraiserIdParam) {
    const f = buildInOrNullClause('d.assigned_to', fundraiserIdParam);
    if (f) {
      openWhere += ` AND ${f.sql}`;
      openArgs.push(...f.args);
    }
  }
  if (projectIdParam) {
    const f = buildInOrNullClause('p.project_id', projectIdParam);
    if (f) {
      openWhere += ` AND ${f.sql}`;
      openArgs.push(...f.args);
    }
  }
  if (sourceIdParam) {
    const f = buildInOrNullClause('d.source_id', sourceIdParam);
    if (f) {
      openWhere += ` AND ${f.sql}`;
      openArgs.push(...f.args);
    }
  }
  if (donorIdParam) {
    const f = buildInOrNullClause('d.id', donorIdParam);
    if (f) {
      openWhere += ` AND ${f.sql}`;
      openArgs.push(...f.args);
    }
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

  // ===== Pledge detail list — every real pledge matching the filters =====
  // Surfaces the actual commitments behind the "outstanding" KPI so users can see
  // which donor owes what and how far through each pledge they are.
  //
  // We include ALL statuses (open / fulfilled / cancelled / partial) so the UI can
  // offer status-level filtering on the client. Cap raised to 2000 — typical orgs
  // have under 1000 active pledges; this gives headroom and still bounds DB time.
  const pledgesDetail = await db().execute({
    sql: `SELECT p.id, p.amount, p.status, p.pledge_date, p.due_date, p.installments_total, p.payment_plan,
                 p.collection_mode,
                 COALESCE(p.is_standalone, 0) AS is_standalone,
                 d.id AS donor_id,
                 d.first_name, d.last_name, d.hebrew_name,
                 prj.name AS project_name, prj.id AS project_id,
                 COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE pledge_id = p.id AND status = 'paid'), 0) AS paid_amount
          FROM fr_pledges p
          JOIN fr_donors d ON d.id = p.donor_id
          LEFT JOIN fr_projects prj ON prj.id = p.project_id
          WHERE ${openWhere.replace("p.status = 'open'", "1=1")}
            AND COALESCE(p.is_standalone, 0) = 0
          ORDER BY (p.amount - COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE pledge_id = p.id AND status = 'paid'), 0)) DESC,
                   p.pledge_date DESC
          LIMIT 2000`,
    args: openArgs,
  });
  const outRow = outstanding.rows[0];
  const outstandingAmount = Number(outRow?.total_pledged || 0) - Number(outRow?.already_paid || 0);

  // Lapsed donors — gave in the past but no payment in the last 365 days. The reports
  // page renders a "Lapsed donors" panel showing the top 25 by lifetime giving so the
  // manager can build a re-engagement list. Ranked by total lifetime paid amount so the
  // most-valuable lapsed donors surface first.
  const lapsedWhere = session.role === 'fundraiser'
    ? 'd.owner_id = ? AND d.assigned_to = ?'
    : 'd.owner_id = ?';
  const lapsedArgs = session.role === 'fundraiser'
    ? [session.ownerId, session.fundraiserId!]
    : [session.ownerId];
  const lapsed = await db().execute({
    sql: `SELECT d.id, d.first_name, d.last_name, d.hebrew_name, d.organization,
                 d.total_paid, d.last_contact_at,
                 (SELECT MAX(paid_date) FROM fr_pledge_payments
                  WHERE donor_id = d.id AND status = 'paid') AS last_payment_date
          FROM fr_donors d
          WHERE ${lapsedWhere}
            AND d.status = 'donor'
            AND d.total_paid > 0
            AND COALESCE(
              (SELECT MAX(paid_date) FROM fr_pledge_payments
               WHERE donor_id = d.id AND status = 'paid'),
              '0000-00-00'
            ) < date('now', '-365 days')
          ORDER BY d.total_paid DESC
          LIMIT 25`,
    args: lapsedArgs,
  });

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
    lapsed_donors: lapsed.rows.map((r) => ({
      id: String(r.id),
      name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      hebrew_name: r.hebrew_name ? String(r.hebrew_name) : null,
      organization: r.organization ? String(r.organization) : null,
      total_paid: Number(r.total_paid || 0),
      last_payment_date: r.last_payment_date ? String(r.last_payment_date) : null,
      last_contact_at: r.last_contact_at ? String(r.last_contact_at) : null,
    })),
    detail: detail.rows,
    pledges_detail: pledgesDetail.rows.map((r) => {
      const amount = Number(r.amount);
      const paid = Number(r.paid_amount);
      return {
        id: String(r.id),
        donor_id: String(r.donor_id),
        donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
        hebrew_name: r.hebrew_name ? String(r.hebrew_name) : null,
        project_name: r.project_name ? String(r.project_name) : null,
        project_id: r.project_id ? String(r.project_id) : null,
        amount,
        paid_amount: paid,
        remaining: Math.max(0, amount - paid),
        status: String(r.status),
        pledge_date: String(r.pledge_date),
        installments_total: Number(r.installments_total),
        payment_plan: String(r.payment_plan),
        collection_mode: r.collection_mode ? String(r.collection_mode) : 'manual',
      };
    }),
  });
}
