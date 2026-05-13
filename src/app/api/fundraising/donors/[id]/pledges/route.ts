import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';
import { generateInstallmentDates, recomputeDonorTotals } from '@/lib/fundraising-totals';
import { queueUpcomingReminders } from '@/lib/fundraising-reminders';

interface PaymentInput {
  amount: number;
  due_date?: string;
  method?: string;
  installment_number?: number;
  notes?: string;
  cc_last4?: string;
  cc_holder?: string;
  cc_expiry?: string;
  check_number?: string;
  check_date?: string;
  bank_name?: string;
}

const VALID_PLANS = ['lump_sum', 'weekly', 'monthly', 'quarterly', 'annual', 'custom'] as const;
type Plan = (typeof VALID_PLANS)[number];

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

  const plan: Plan = VALID_PLANS.includes(body.payment_plan) ? body.payment_plan : 'lump_sum';
  const installmentsTotalRequested = Math.max(1, Number(body.installments_total) || 1);
  const pledgeDate = body.pledge_date || new Date().toISOString().slice(0, 10);

  // payment_day: optional override for when each installment falls. Validate per-plan:
  //   monthly/quarterly/annual → day-of-month (1..31)
  //   weekly                   → day-of-week (0..6)
  //   other plans              → ignored
  let paymentDay: number | null = null;
  if (body.payment_day != null && body.payment_day !== '') {
    const n = Number(body.payment_day);
    if (plan === 'weekly') {
      if (Number.isInteger(n) && n >= 0 && n <= 6) paymentDay = n;
    } else if (plan === 'monthly' || plan === 'quarterly' || plan === 'annual') {
      if (Number.isInteger(n) && n >= 1 && n <= 31) paymentDay = n;
    }
  }
  // 'pending' means the donor pledged but the payment method will be decided later
  // (the Collections team will fill it in when the payment is actually made).
  const defaultMethod = body.default_method || 'pending';
  const projectId = body.project_id || null;

  // collection_mode controls how many scheduled rows we generate:
  //   'manual'    → one row per installment (Collections will show each month's row)
  //   'automatic' → one row for the WHOLE pledge (donor pays via auto-debit, no chasing)
  const collectionMode: 'manual' | 'automatic' =
    body.collection_mode === 'automatic' ? 'automatic' : 'manual';
  const installmentsTotal = collectionMode === 'automatic' ? 1 : installmentsTotalRequested;

  const pledgeId = crypto.randomUUID();

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO fr_pledges
              (id, owner_id, donor_id, project_id, fundraiser_id, amount, currency, status,
               pledge_date, due_date, installments_total, payment_plan, notes, collection_mode, payment_day)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        pledgeId,
        session.ownerId,
        donorId,
        projectId,
        body.fundraiser_id || session.fundraiserId,
        amount,
        body.currency || 'USD',
        pledgeDate,
        body.due_date || null,
        installmentsTotal,
        plan,
        body.notes || null,
        collectionMode,
        paymentDay,
      ],
    },
  ];

  // Build installment schedule
  let payments: PaymentInput[];
  if (Array.isArray(body.payments) && body.payments.length > 0) {
    payments = body.payments;
  } else if (collectionMode === 'automatic') {
    // Single row holding the FULL amount — Collections won't fragment it.
    payments = [
      {
        amount,
        due_date: pledgeDate,
        method: defaultMethod,
        installment_number: 1,
      },
    ];
  } else {
    const dates = generateInstallmentDates(pledgeDate, installmentsTotal, plan, paymentDay);
    const baseAmt = Math.floor((amount * 100) / installmentsTotal) / 100;
    const remainder = Math.round((amount - baseAmt * installmentsTotal) * 100) / 100;
    payments = dates.map((d, i) => ({
      amount: i === 0 ? baseAmt + remainder : baseAmt,
      due_date: d,
      method: defaultMethod,
      installment_number: i + 1,
    }));
  }

  payments.forEach((p, i) => {
    if (!p.amount) return;
    const paymentId = crypto.randomUUID();
    statements.push({
      sql: `INSERT INTO fr_pledge_payments
              (id, pledge_id, donor_id, project_id, installment_number, method, amount, currency,
               due_date, status, check_number, check_date, bank_name, cc_last4, cc_holder, cc_expiry, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        paymentId,
        pledgeId,
        donorId,
        projectId,
        p.installment_number || i + 1,
        p.method || defaultMethod,
        p.amount,
        body.currency || 'USD',
        p.due_date || null,
        p.check_number || null,
        p.check_date || null,
        p.bank_name || null,
        p.cc_last4 || null,
        p.cc_holder || null,
        p.cc_expiry || null,
        p.notes || null,
      ],
    });
  });

  // Promote prospect to donor automatically — they just made a financial commitment.
  statements.push({
    sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, datetime('now')) WHERE id = ? AND status = 'prospect'",
    args: [donorId],
  });

  await db().batch(statements, 'write');
  await recomputeDonorTotals(donorId);

  // Auto-queue reminders for any installments due within the next 7 days.
  // Don't fail the pledge create if reminder generation hits an error.
  try {
    await queueUpcomingReminders(session.ownerId, 7);
  } catch (err) {
    console.error('Failed to queue reminders for new pledge:', err);
  }

  return NextResponse.json({ id: pledgeId });
}
