import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';

// POST /api/fundraising/donors/[id]/quick-donation
//
// Records a one-shot, already-paid donation.
//
// Two modes:
//   • No pledge_id in body  → creates a new lump-sum pledge marked 'fulfilled' +
//     one paid payment row. This is the original Quick-donation behaviour: a clean
//     standalone donation that doesn't need pledge tracking.
//
//   • pledge_id in body     → attaches the paid payment to that EXISTING pledge.
//     No new pledge row is created. The donor's outstanding pledge balance goes
//     down by the payment amount. Useful for back-recording cash/check/etc. that
//     should have been on a pledge from the start — works even if the paid_date
//     is earlier than the pledge's pledge_date (no date validation).
//
// After insert, recompute the affected pledge's status (open / fulfilled) and the
// donor's totals.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: donorId } = await params;

  const access = await ensureDonorAccess(donorId, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });

  const paidDate = body.paid_date || new Date().toISOString().slice(0, 10);
  const method = body.method || 'credit_card';
  const projectId = body.project_id || null;
  const paymentId = crypto.randomUUID();
  const currency = body.currency || 'USD';

  let pledgeId: string;

  // ----- Branch: existing-pledge attachment vs new-pledge creation -----
  if (body.pledge_id) {
    // Validate the target pledge belongs to this donor + owner
    const pledgeRow = await db().execute({
      sql: 'SELECT id, project_id FROM fr_pledges WHERE id = ? AND donor_id = ? AND owner_id = ?',
      args: [String(body.pledge_id), donorId, session.ownerId],
    });
    if (pledgeRow.rows.length === 0) {
      return NextResponse.json({ error: 'Pledge not found for this donor' }, { status: 404 });
    }
    pledgeId = String(pledgeRow.rows[0].id);
    // If caller didn't specify a project, inherit from the pledge.
    const effectiveProjectId = projectId || (pledgeRow.rows[0].project_id ? String(pledgeRow.rows[0].project_id) : null);

    await db().batch(
      [
        {
          sql: `INSERT INTO fr_pledge_payments
                  (id, pledge_id, donor_id, project_id, installment_number, method, amount, currency,
                   due_date, paid_date, status, check_number, check_date, bank_name, cc_last4, cc_holder, cc_expiry,
                   transaction_ref, receipt_number, notes)
                VALUES (?, ?, ?, ?,
                        (SELECT COALESCE(MAX(installment_number), 0) + 1 FROM fr_pledge_payments WHERE pledge_id = ?),
                        ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            paymentId, pledgeId, donorId, effectiveProjectId, pledgeId,
            method, amount, currency,
            paidDate, paidDate,
            body.check_number || null, body.check_date || null, body.bank_name || null,
            body.cc_last4 || null, body.cc_holder || null, body.cc_expiry || null,
            body.transaction_ref || null, body.receipt_number || null,
            body.notes || null,
          ],
        },
        {
          sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, ?) WHERE id = ? AND status = 'prospect'",
          args: [new Date().toISOString(), donorId],
        },
      ],
      'write',
    );

    // Recompute the pledge: status (open vs fulfilled) and paid_amount
    await recomputePledgeStatus(pledgeId);
  } else {
    // New-pledge path — original Quick-donation behaviour.
    pledgeId = crypto.randomUUID();
    await db().batch(
      [
        {
          sql: `INSERT INTO fr_pledges
                  (id, owner_id, donor_id, project_id, fundraiser_id, amount, currency, status,
                   pledge_date, installments_total, payment_plan, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'fulfilled', ?, 1, 'lump_sum', ?)`,
          args: [
            pledgeId, session.ownerId, donorId, projectId,
            body.fundraiser_id || session.fundraiserId,
            amount, currency, paidDate,
            body.notes || null,
          ],
        },
        {
          sql: `INSERT INTO fr_pledge_payments
                  (id, pledge_id, donor_id, project_id, installment_number, method, amount, currency,
                   due_date, paid_date, status, check_number, check_date, bank_name, cc_last4, cc_holder, cc_expiry,
                   transaction_ref, receipt_number, notes)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            paymentId, pledgeId, donorId, projectId,
            method, amount, currency,
            paidDate, paidDate,
            body.check_number || null, body.check_date || null, body.bank_name || null,
            body.cc_last4 || null, body.cc_holder || null, body.cc_expiry || null,
            body.transaction_ref || null, body.receipt_number || null,
            body.notes || null,
          ],
        },
        {
          sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, ?) WHERE id = ? AND status = 'prospect'",
          args: [new Date().toISOString(), donorId],
        },
      ],
      'write',
    );
  }

  await recomputeDonorTotals(donorId);

  return NextResponse.json({ pledgeId, paymentId });
}
