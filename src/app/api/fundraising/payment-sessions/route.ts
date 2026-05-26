import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { isPositiveAmount, PAYMENT_METHODS, inEnum, methodIsCheckLike } from '@/lib/fundraising-types';
import { promoteDonorIfNeeded, recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
import { buildGatewayUrl } from '@/lib/payment-gateway';

interface PaymentSessionBody {
  donor_id: string;
  // Mode: either apply to an existing pledge (with optional installment) OR create a new lump-sum pledge
  mode: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null; // optional: existing scheduled payment row to charge against
  project_id?: string | null;
  amount: number;
  notes?: string | null;

  // Payment method + behaviour
  method?: string; // credit_card | check | wire | ach | cash
  // record_manually = true → mark the payment paid immediately, skip the gateway redirect.
  // For non-credit-card methods this is implied (we always record manually).
  record_manually?: boolean;
  paid_date?: string | null; // optional override (defaults to today). Useful for backdating cash/check.

  // Method-specific fields
  check_number?: string | null;
  check_date?: string | null;
  bank_name?: string | null;
  cc_last4?: string | null;
  cc_holder?: string | null;
  cc_expiry?: string | null;
  transaction_ref?: string | null;
}

/**
 * Resolves the gateway URL template for the current owner. Substitutes {placeholders}.
 *   {amount} {ref} {donor_name} {donor_email} {description} {return_url}
 *
 * Lookup order:
 *  1. saas_users.payment_gateway_url (per-owner, set in Settings)
 *  2. process.env.PAYMENT_GATEWAY_URL (global default)
 */

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  let body: PaymentSessionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ----- Validation -----
  if (!body.donor_id) return NextResponse.json({ error: 'donor_id required' }, { status: 400 });
  if (!body.mode || (body.mode !== 'existing_pledge' && body.mode !== 'new_donation')) {
    return NextResponse.json({ error: 'mode must be existing_pledge or new_donation' }, { status: 400 });
  }
  if (!isPositiveAmount(body.amount)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const method = body.method || 'credit_card';
  if (!inEnum(PAYMENT_METHODS, method) || method === 'pending') {
    return NextResponse.json({ error: 'invalid payment method' }, { status: 400 });
  }

  // Non-credit-card methods always record manually. CC defaults to gateway, unless record_manually=true.
  const recordManually = method !== 'credit_card' ? true : body.record_manually === true;

  // ----- Verify donor scope -----
  const donorRow = await db().execute({
    sql: 'SELECT id, first_name, last_name, email FROM fr_donors WHERE id = ? AND owner_id = ?',
    args: [body.donor_id, session.ownerId],
  });
  if (donorRow.rows.length === 0) return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
  const donor = donorRow.rows[0];
  const donorName = `${donor.first_name} ${donor.last_name || ''}`.trim();

  // ----- Decide initial payment status -----
  // - recordManually = true → 'paid' (no external gateway involved)
  // - recordManually = false (CC + gateway) → 'pending_processor' (gateway will flip to 'paid' via webhook)
  const initialStatus = recordManually ? 'paid' : 'pending_processor';
  const paidDate = recordManually ? (body.paid_date || new Date().toISOString().slice(0, 10)) : null;

  // ----- Create / locate pledge + payment rows -----
  let pledgeId: string;
  let paymentId: string;
  let projectId: string | null = body.project_id || null;

  if (body.mode === 'existing_pledge') {
    if (!body.pledge_id) return NextResponse.json({ error: 'pledge_id required for existing_pledge mode' }, { status: 400 });

    const pledgeRow = await db().execute({
      sql: 'SELECT id, project_id, currency FROM fr_pledges WHERE id = ? AND donor_id = ? AND owner_id = ?',
      args: [body.pledge_id, body.donor_id, session.ownerId],
    });
    if (pledgeRow.rows.length === 0) return NextResponse.json({ error: 'Pledge not found' }, { status: 404 });
    pledgeId = String(pledgeRow.rows[0].id);
    projectId = projectId || (pledgeRow.rows[0].project_id ? String(pledgeRow.rows[0].project_id) : null);

    if (body.payment_id) {
      // Charge against an existing scheduled installment.
      const payRow = await db().execute({
        sql: 'SELECT id, status FROM fr_pledge_payments WHERE id = ? AND pledge_id = ? AND donor_id = ?',
        args: [body.payment_id, pledgeId, body.donor_id],
      });
      if (payRow.rows.length === 0) return NextResponse.json({ error: 'Payment installment not found' }, { status: 404 });
      const existingStatus = String(payRow.rows[0].status);
      if (existingStatus === 'paid') return NextResponse.json({ error: 'Payment is already marked paid' }, { status: 400 });
      paymentId = String(payRow.rows[0].id);

      const updates = ['status = ?', 'method = ?', 'amount = ?'];
      const updateArgs: (string | number | null)[] = [initialStatus, method, body.amount];
      if (paidDate) {
        updates.push('paid_date = ?');
        updateArgs.push(paidDate);
      }
      // Method-specific fields
      if (methodIsCheckLike(method)) {
        updates.push('check_number = ?', 'check_date = ?', 'bank_name = ?');
        updateArgs.push(body.check_number || null, body.check_date || paidDate || null, body.bank_name || null);
      } else if (method === 'credit_card') {
        updates.push('cc_last4 = ?', 'cc_holder = ?', 'cc_expiry = ?');
        updateArgs.push(body.cc_last4 || null, body.cc_holder || null, body.cc_expiry || null);
      }
      if (body.transaction_ref) {
        updates.push('transaction_ref = ?');
        updateArgs.push(body.transaction_ref);
      }
      if (body.notes) {
        updates.push('notes = ?');
        updateArgs.push(body.notes);
      }
      updateArgs.push(paymentId);
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET ${updates.join(', ')} WHERE id = ?`,
        args: updateArgs,
      });
    } else {
      // No specific installment — append a new payment row.
      paymentId = crypto.randomUUID();
      await db().execute({
        sql: `INSERT INTO fr_pledge_payments
              (id, pledge_id, donor_id, project_id, installment_number, method, amount, status, due_date, paid_date,
               check_number, check_date, bank_name, cc_last4, cc_holder, cc_expiry, transaction_ref, notes)
              VALUES (?, ?, ?, ?,
                      (SELECT COALESCE(MAX(installment_number), 0) + 1 FROM fr_pledge_payments WHERE pledge_id = ?),
                      ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          paymentId, pledgeId, body.donor_id, projectId, pledgeId,
          method, body.amount, initialStatus, paidDate,
          methodIsCheckLike(method) ? body.check_number || null : null,
          methodIsCheckLike(method) ? body.check_date || paidDate || null : null,
          methodIsCheckLike(method) ? body.bank_name || null : null,
          method === 'credit_card' ? body.cc_last4 || null : null,
          method === 'credit_card' ? body.cc_holder || null : null,
          method === 'credit_card' ? body.cc_expiry || null : null,
          body.transaction_ref || null,
          body.notes || null,
        ],
      });
    }
  } else {
    // mode === 'new_donation': create a new lump-sum pledge + a single payment row.
    pledgeId = crypto.randomUUID();
    await db().execute({
      // Synthetic pledge for a free donation — hidden from the donor's Pledges list (is_standalone=1).
      // We still need the row because fr_pledge_payments.pledge_id is NOT NULL.
      sql: `INSERT INTO fr_pledges (id, owner_id, donor_id, project_id, fundraiser_id, amount, status, pledge_date, installments_total, payment_plan, notes, is_standalone)
            VALUES (?, ?, ?, ?, ?, ?, 'fulfilled', date('now'), 1, 'lump_sum', ?, 1)`,
      args: [pledgeId, session.ownerId, body.donor_id, projectId, session.fundraiserId, body.amount, body.notes || null],
    });
    paymentId = crypto.randomUUID();
    await db().execute({
      sql: `INSERT INTO fr_pledge_payments
            (id, pledge_id, donor_id, project_id, installment_number, method, amount, status, due_date, paid_date,
             check_number, check_date, bank_name, cc_last4, cc_holder, cc_expiry, transaction_ref, notes)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        paymentId, pledgeId, body.donor_id, projectId,
        method, body.amount, initialStatus, paidDate,
        method === 'check' ? body.check_number || null : null,
        method === 'check' ? body.check_date || paidDate || null : null,
        method === 'check' ? body.bank_name || null : null,
        method === 'credit_card' ? body.cc_last4 || null : null,
        method === 'credit_card' ? body.cc_holder || null : null,
        method === 'credit_card' ? body.cc_expiry || null : null,
        body.transaction_ref || null,
        body.notes || null,
      ],
    });

    // Auto-convert lead → donor on first donation
    await db().execute({
      sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, datetime('now')) WHERE id = ? AND status = 'prospect'",
      args: [body.donor_id],
    });
  }

  // ----- Manual record path: recompute totals and return immediately. -----
  if (recordManually) {
    await recomputePledgeStatus(pledgeId);
    // Manual cash/check/wire entry — promote prospect to donor on first recorded payment.
    // Idempotent; no-op if status is already 'donor'.
    await promoteDonorIfNeeded(body.donor_id);
    await recomputeDonorTotals(body.donor_id);
    return NextResponse.json({
      recorded: true,
      payment_id: paymentId,
      pledge_id: pledgeId,
      method,
      amount: body.amount,
    });
  }

  // ----- Gateway path: create payment session + redirect URL -----
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('hex');
  const webhookSecret = crypto.randomBytes(16).toString('hex');

  const ownerRow = await db().execute({
    sql: 'SELECT payment_gateway_url FROM saas_users WHERE id = ?',
    args: [session.ownerId],
  });
  const gatewayTemplate =
    (ownerRow.rows[0]?.payment_gateway_url as string | null) ||
    process.env.PAYMENT_GATEWAY_URL ||
    '';

  let gatewayUrl: string | null = null;
  if (gatewayTemplate) {
    const url = new URL(request.url);
    const origin = url.origin;
    const returnUrl = `${origin}/api/fundraising/payment-webhook?token=${token}&secret=${webhookSecret}`;
    const description = body.notes || (body.mode === 'new_donation' ? 'Donation' : 'Pledge payment');

    gatewayUrl = buildGatewayUrl(gatewayTemplate, {
      amount: body.amount,
      ref: token,
      donorName,
      donorEmail: (donor.email as string | null) || '',
      description,
      returnUrl,
    });
  }

  await db().execute({
    sql: `INSERT INTO fr_payment_sessions
          (id, owner_id, payment_id, donor_id, pledge_id, project_id, amount, currency, token, webhook_secret, status, gateway_url, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, 'pending', ?, ?, ?)`,
    args: [
      sessionId,
      session.ownerId,
      paymentId,
      body.donor_id,
      pledgeId,
      projectId,
      body.amount,
      token,
      webhookSecret,
      gatewayUrl,
      body.notes || null,
      session.actorId,
    ],
  });

  return NextResponse.json({
    session_id: sessionId,
    token,
    gateway_url: gatewayUrl,
    amount: body.amount,
    payment_id: paymentId,
    pledge_id: pledgeId,
    needs_gateway_config: !gatewayTemplate,
  });
}
