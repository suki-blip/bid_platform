import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// GET /api/fundraising/payments
//
// Returns every payment row scoped to the current owner, joined with donor + project
// names so the listing page can render rows without a second query per row.
//
// Query params (all optional):
//   status      — comma-separated list: paid,scheduled,bounced,failed,cancelled,pending_processor
//   method      — comma-separated list of payment methods: credit_card,check,cash,wire,...
//   pledge_id   — show payments belonging to a single pledge only
//   type        — 'pledge' (real pledges) | 'standalone' (free donations only)
//   search      — case-insensitive substring match against donor first/last/hebrew_name + project name
//   from        — ISO date; lower bound on COALESCE(paid_date, due_date, created_at)
//   to          — ISO date; upper bound (inclusive)
//   limit       — default 200, max 1000
//   offset      — default 0
//   audit       — when =top_paid, returns the top 20 paid payments by amount (diagnostic)
//
// Fundraisers see only their assigned donors' payments. Managers see everything.
export async function GET(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') || '';
  const methodParam = url.searchParams.get('method') || '';
  const pledgeId = url.searchParams.get('pledge_id') || '';
  const typeFilter = url.searchParams.get('type') || '';
  const search = (url.searchParams.get('search') || '').trim();
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 1000);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const audit = url.searchParams.get('audit') || '';

  // Diagnostic mode — returns the top 20 paid payments by amount. Used by the Payments
  // page "find rogue rows" button when the user suspects the Paid total is off because of
  // some old test row that's still in the database. Manager-only; we don't want fundraisers
  // poking at unscoped data.
  if (audit === 'top_paid') {
    if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
    const r = await db().execute({
      sql: `SELECT pp.id, pp.amount, pp.method, pp.status, pp.paid_date, pp.due_date, pp.created_at,
                   pp.transaction_ref, pp.cc_last4, pp.donor_id, pp.pledge_id, pp.project_id,
                   d.first_name, d.last_name, d.hebrew_name,
                   p.name AS project_name,
                   pl.is_standalone
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            LEFT JOIN fr_projects p ON p.id = pp.project_id
            LEFT JOIN fr_pledges pl ON pl.id = pp.pledge_id
            WHERE d.owner_id = ? AND pp.status = 'paid'
            ORDER BY pp.amount DESC
            LIMIT 20`,
      args: [session.ownerId],
    });
    return NextResponse.json({
      audit: 'top_paid',
      rows: r.rows.map((row) => ({
        id: String(row.id),
        amount: Number(row.amount),
        method: String(row.method || ''),
        status: String(row.status || ''),
        paid_date: row.paid_date ? String(row.paid_date) : null,
        due_date: row.due_date ? String(row.due_date) : null,
        created_at: row.created_at ? String(row.created_at) : null,
        transaction_ref: row.transaction_ref ? String(row.transaction_ref) : null,
        cc_last4: row.cc_last4 ? String(row.cc_last4) : null,
        donor_id: String(row.donor_id),
        pledge_id: String(row.pledge_id),
        project_id: row.project_id ? String(row.project_id) : null,
        donor_first_name: String(row.first_name || ''),
        donor_last_name: row.last_name ? String(row.last_name) : null,
        donor_hebrew_name: row.hebrew_name ? String(row.hebrew_name) : null,
        project_name: row.project_name ? String(row.project_name) : null,
        is_standalone: Number(row.is_standalone || 0) === 1,
      })),
    });
  }

  const where: string[] = ['d.owner_id = ?'];
  const args: (string | number)[] = [session.ownerId];
  // Join to fr_pledges so we can filter on is_standalone (pledge installment vs free donation)
  // and surface pledge-level data in distinct facet aggregates below.
  const joins = `
    JOIN fr_donors d ON d.id = pp.donor_id
    LEFT JOIN fr_projects p ON p.id = pp.project_id
    LEFT JOIN fr_pledges pl ON pl.id = pp.pledge_id`;

  if (session.role === 'fundraiser' && session.fundraiserId) {
    where.push('d.assigned_to = ?');
    args.push(session.fundraiserId);
  }

  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(',');
      where.push(`pp.status IN (${placeholders})`);
      args.push(...statuses);
    }
  }

  if (methodParam) {
    const methods = methodParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (methods.length > 0) {
      const placeholders = methods.map(() => '?').join(',');
      where.push(`pp.method IN (${placeholders})`);
      args.push(...methods);
    }
  }

  if (pledgeId) {
    where.push('pp.pledge_id = ?');
    args.push(pledgeId);
  }

  if (typeFilter === 'pledge') {
    where.push('COALESCE(pl.is_standalone, 0) = 0');
  } else if (typeFilter === 'standalone') {
    where.push('COALESCE(pl.is_standalone, 0) = 1');
  }

  if (search) {
    where.push(
      '(d.first_name LIKE ? OR d.last_name LIKE ? OR d.hebrew_name LIKE ? OR d.hebrew_first_name LIKE ? OR d.hebrew_last_name LIKE ? OR p.name LIKE ?)',
    );
    const q = `%${search}%`;
    args.push(q, q, q, q, q, q);
  }

  if (from) {
    where.push("COALESCE(pp.paid_date, pp.due_date, date(pp.created_at)) >= ?");
    args.push(from);
  }
  if (to) {
    where.push("COALESCE(pp.paid_date, pp.due_date, date(pp.created_at)) <= ?");
    args.push(to);
  }

  const whereSql = where.join(' AND ');

  // Three queries in parallel: page rows + aggregate totals + method facets.
  // Totals share the same WHERE so the cards reflect what the user is currently looking at —
  // pick "Credit card" + "Paid" and the Paid Total card updates to JUST credit-card paid.
  // Method facets are computed against an "all owner data" scope so the chips don't disappear
  // when a filter removes every payment of a given method.
  const ownerScopeWhere = session.role === 'fundraiser' && session.fundraiserId
    ? 'd.owner_id = ? AND d.assigned_to = ?'
    : 'd.owner_id = ?';
  const ownerScopeArgs = session.role === 'fundraiser' && session.fundraiserId
    ? [session.ownerId, session.fundraiserId]
    : [session.ownerId];

  const [rows, totals, methodFacets] = await Promise.all([
    db().execute({
      sql: `SELECT
              pp.id, pp.amount, pp.method, pp.status,
              pp.due_date, pp.paid_date, pp.installment_number,
              pp.check_number, pp.bank_name, pp.cc_last4, pp.cc_holder,
              pp.transaction_ref, pp.notes, pp.created_at,
              pp.pledge_id, pp.donor_id, pp.project_id,
              d.first_name, d.last_name, d.hebrew_name,
              p.name AS project_name,
              pl.is_standalone
            FROM fr_pledge_payments pp${joins}
            WHERE ${whereSql}
            ORDER BY COALESCE(pp.paid_date, pp.due_date, pp.created_at) DESC
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
    db().execute({
      sql: `SELECT
              COUNT(*) AS total_count,
              COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN pp.amount ELSE 0 END), 0) AS paid_sum,
              COALESCE(SUM(CASE WHEN pp.status = 'scheduled' THEN pp.amount ELSE 0 END), 0) AS scheduled_sum,
              COALESCE(SUM(CASE WHEN pp.status = 'bounced' THEN pp.amount ELSE 0 END), 0) AS bounced_sum
            FROM fr_pledge_payments pp${joins}
            WHERE ${whereSql}`,
      args,
    }),
    db().execute({
      sql: `SELECT pp.method, COUNT(*) AS cnt
            FROM fr_pledge_payments pp
            JOIN fr_donors d ON d.id = pp.donor_id
            WHERE ${ownerScopeWhere}
            GROUP BY pp.method
            ORDER BY cnt DESC`,
      args: ownerScopeArgs,
    }),
  ]);

  return NextResponse.json({
    payments: rows.rows.map((r) => ({
      id: String(r.id),
      amount: Number(r.amount),
      method: String(r.method || ''),
      status: String(r.status || ''),
      due_date: r.due_date ? String(r.due_date) : null,
      paid_date: r.paid_date ? String(r.paid_date) : null,
      installment_number: Number(r.installment_number || 0),
      check_number: r.check_number ? String(r.check_number) : null,
      bank_name: r.bank_name ? String(r.bank_name) : null,
      cc_last4: r.cc_last4 ? String(r.cc_last4) : null,
      cc_holder: r.cc_holder ? String(r.cc_holder) : null,
      transaction_ref: r.transaction_ref ? String(r.transaction_ref) : null,
      notes: r.notes ? String(r.notes) : null,
      created_at: r.created_at ? String(r.created_at) : null,
      pledge_id: String(r.pledge_id),
      donor_id: String(r.donor_id),
      project_id: r.project_id ? String(r.project_id) : null,
      donor_first_name: String(r.first_name || ''),
      donor_last_name: r.last_name ? String(r.last_name) : null,
      donor_hebrew_name: r.hebrew_name ? String(r.hebrew_name) : null,
      project_name: r.project_name ? String(r.project_name) : null,
      is_standalone: Number(r.is_standalone || 0) === 1,
    })),
    totals: {
      total_count: Number(totals.rows[0]?.total_count || 0),
      paid_sum: Number(totals.rows[0]?.paid_sum || 0),
      scheduled_sum: Number(totals.rows[0]?.scheduled_sum || 0),
      bounced_sum: Number(totals.rows[0]?.bounced_sum || 0),
    },
    method_facets: methodFacets.rows.map((r) => ({
      method: String(r.method || ''),
      count: Number(r.cnt || 0),
    })),
  });
}
