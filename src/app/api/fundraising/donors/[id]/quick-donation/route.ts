import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';
import { recomputeDonorTotals } from '@/lib/fundraising-totals';

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
  const pledgeId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();

  await db().batch(
    [
      {
        sql: `INSERT INTO fr_pledges
                (id, owner_id, donor_id, project_id, fundraiser_id, amount, currency, status,
                 pledge_date, installments_total, payment_plan, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'fulfilled', ?, 1, 'lump_sum', ?)`,
        args: [
          pledgeId,
          session.ownerId,
          donorId,
          projectId,
          body.fundraiser_id || session.fundraiserId,
          amount,
          body.currency || 'USD',
          paidDate,
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
          paymentId,
          pledgeId,
          donorId,
          projectId,
          method,
          amount,
          body.currency || 'USD',
          paidDate,
          paidDate,
          body.check_number || null,
          body.check_date || null,
          body.bank_name || null,
          body.cc_last4 || null,
          body.cc_holder || null,
          body.cc_expiry || null,
          body.transaction_ref || null,
          body.receipt_number || null,
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

  await recomputeDonorTotals(donorId);

  return NextResponse.json({ pledgeId, paymentId });
}
