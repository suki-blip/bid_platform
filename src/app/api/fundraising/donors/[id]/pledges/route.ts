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

const VALID_PLANS = ['lump_sum', 'monthly', 'quarterly', 'annual', 'custom'] as const;
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
  const installmentsTotal = Math.max(1, Number(body.installments_total) || 1);
  const pledgeDate = body.pledge_date || new Date().toISOString().slice(0, 10);
  const defaultMethod = body.default_method || 'credit_card';
  const projectId = body.project_id || null;

  const pledgeId = crypto.randomUUID();

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO fr_pledges
              (id, owner_id, donor_id, project_id, fundraiser_id, amount, currency, status,
               pledge_date, due_date, installments_total, payment_plan, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
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
      ],
    },
  ];

  // Build installment schedule
  let payments: PaymentInput[];
  if (Array.isArray(body.payments) && body.payments.length > 0) {
    payments = body.payments;
  } else {
    const dates = generateInstallmentDates(pledgeDate, installmentsTotal, plan);
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
