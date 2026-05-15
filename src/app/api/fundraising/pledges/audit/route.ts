// GET /api/fundraising/pledges/audit
//
// Diagnostic for "the Open Pledges total on the dashboard looks wrong". Returns the 20
// open pledges with the largest OUTSTANDING balance — i.e. pledge.amount minus the sum of
// paid payments. Same arithmetic the dashboard uses, so the rows here are exactly what
// inflates that figure.
//
// We use a LEFT JOIN to fr_donors so a pledge whose donor was deleted out-of-band (e.g.
// via direct DB editing, or before FK constraints were enforced) still shows up. The UI
// labels these "Orphan — donor missing" and offers a delete-forever action.
//
// Manager-only — same reasoning as the payments audit: fundraisers shouldn't poke at
// unscoped data.

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  // Pull every open pledge for this owner; compute outstanding = amount - sum(paid).
  // ORDER BY outstanding DESC, LIMIT 20.
  //
  // LEFT JOIN on fr_donors so pledges with a missing donor still surface — the donor_id
  // column survives even if the FK target is gone (CASCADE only fires when the actual
  // DELETE runs through a libsql connection with foreign_keys=ON; legacy data may not
  // have been cleaned).
  const r = await db().execute({
    sql: `SELECT
            p.id, p.amount, p.status, p.pledge_date, p.due_date, p.notes,
            COALESCE(p.is_standalone, 0) AS is_standalone,
            p.donor_id, p.project_id,
            d.first_name, d.last_name, d.hebrew_name,
            prj.name AS project_name,
            COALESCE(paid.total, 0) AS paid_total
          FROM fr_pledges p
          LEFT JOIN fr_donors d ON d.id = p.donor_id
          LEFT JOIN fr_projects prj ON prj.id = p.project_id
          LEFT JOIN (
            SELECT pledge_id, SUM(amount) AS total
            FROM fr_pledge_payments
            WHERE status = 'paid'
            GROUP BY pledge_id
          ) paid ON paid.pledge_id = p.id
          WHERE p.owner_id = ? AND p.status = 'open'
          ORDER BY (p.amount - COALESCE(paid.total, 0)) DESC
          LIMIT 20`,
    args: [session.ownerId],
  });

  const rows = r.rows.map((row) => {
    const paidTotal = Number(row.paid_total || 0);
    const amount = Number(row.amount || 0);
    return {
      id: String(row.id),
      amount,
      paid_total: paidTotal,
      outstanding: amount - paidTotal,
      status: String(row.status || ''),
      pledge_date: row.pledge_date ? String(row.pledge_date) : null,
      due_date: row.due_date ? String(row.due_date) : null,
      notes: row.notes ? String(row.notes) : null,
      is_standalone: Number(row.is_standalone || 0) === 1,
      donor_id: String(row.donor_id),
      project_id: row.project_id ? String(row.project_id) : null,
      // donor_missing=true when the LEFT JOIN didn't find a matching donor — first_name
      // would be NULL. That row is a true orphan and can be cleaned up via the audit UI.
      donor_missing: row.first_name == null,
      donor_first_name: row.first_name ? String(row.first_name) : null,
      donor_last_name: row.last_name ? String(row.last_name) : null,
      donor_hebrew_name: row.hebrew_name ? String(row.hebrew_name) : null,
      project_name: row.project_name ? String(row.project_name) : null,
    };
  });

  // Sum of the listed rows so the UI can show "These 20 rows account for $X of the total".
  const sum_outstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return NextResponse.json({ audit: 'top_open_pledges', sum_outstanding, rows });
}
