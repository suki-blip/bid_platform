import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { isPositiveAmount } from '@/lib/fundraising-types';

interface PaymentSessionBody {
  donor_id: string;
  // Mode: either apply to an existing pledge (with optional installment) OR create a new lump-sum pledge
  mode: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null; // optional: existing scheduled payment row to charge against
  project_id?: string | null;
  amount: number;
  notes?: string | null;
}

/**
 * Resolves the gateway URL template for the current owner. Substitutes {placeholders}.
 *   {amount} {ref} {donor_name} {donor_email} {description} {return_url}
 *
 * Lookup order:
 *  1. saas_users.payment_gateway_url (per-owner, set in Settings)
 *  2. process.env.PAYMENT_GATEWAY_URL (global default)
 *
 * If neither is set we still return a session — the page will show the manager an error
 * and a link to /fundraising/settings to configure the gateway.
 */
function buildGatewayUrl(
  template: string,
  vars: { amount: number; ref: string; donor_name: string; donor_email: string; description: string; return_url: string },
): string {
  return template
    .replace(/\{amount\}/g, vars.amount.toFixed(2))
    .replace(/\{ref\}/g, encodeURIComponent(vars.ref))
    .replace(/\{donor_name\}/g, encodeURIComponent(vars.donor_name))
    .replace(/\{donor_email\}/g, encodeURIComponent(vars.donor_email))
    .replace(/\{description\}/g, encodeURIComponent(vars.description))
    .replace(/\{return_url\}/g, encodeURIComponent(vars.return_url));
}

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

  if (!body.donor_id) return NextResponse.json({ error: 'donor_id required' }, { status: 400 });
  if (!body.mode || (body.mode !== 'existing_pledge' && body.mode !== 'new_donation')) {
    return NextResponse.json({ error: 'mode must be existing_pledge or new_donation' }, { status: 400 });
  }
  if (!isPositiveAmount(body.amount)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  // Verify donor belongs to this owner.
  const donorRow = await db().execute({
    sql: 'SELECT id, first_name, last_name, email FROM fr_donors WHERE id = ? AND owner_id = ?',
    args: [body.donor_id, session.ownerId],
  });
  if (donorRow.rows.length === 0) return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
  const donor = donorRow.rows[0];
  const donorName = `${donor.first_name} ${donor.last_name || ''}`.trim();

  let pledgeId: string;
  let paymentId: string;
  let projectId: string | null = body.project_id || null;

  if (body.mode === 'existing_pledge') {
    if (!body.pledge_id) return NextResponse.json({ error: 'pledge_id required for existing_pledge mode' }, { status: 400 });

    // Verify pledge belongs to this donor (and so to this owner)
    const pledgeRow = await db().execute({
      sql: `SELECT id, project_id, currency FROM fr_pledges WHERE id = ? AND donor_id = ? AND owner_id = ?`,
      args: [body.pledge_id, body.donor_id, session.ownerId],
    });
    if (pledgeRow.rows.length === 0) return NextResponse.json({ error: 'Pledge not found' }, { status: 404 });
    pledgeId = String(pledgeRow.rows[0].id);
    projectId = projectId || (pledgeRow.rows[0].project_id ? String(pledgeRow.rows[0].project_id) : null);

    if (body.payment_id) {
      // Charge against an existing scheduled installment — flip its status to pending_processor.
      const payRow = await db().execute({
        sql: 'SELECT id, status FROM fr_pledge_payments WHERE id = ? AND pledge_id = ? AND donor_id = ?',
        args: [body.payment_id, pledgeId, body.donor_id],
      });
      if (payRow.rows.length === 0) return NextResponse.json({ error: 'Payment installment not found' }, { status: 404 });
      const status = String(payRow.rows[0].status);
      if (status === 'paid') return NextResponse.json({ error: 'Payment is already marked paid' }, { status: 400 });
      paymentId = String(payRow.rows[0].id);
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET status = 'pending_processor', method = 'credit_card', amount = ? WHERE id = ?`,
        args: [body.amount, paymentId],
      });
    } else {
      // No specific installment — create a new payment row attached to this pledge.
      paymentId = crypto.randomUUID();
      await db().execute({
        sql: `INSERT INTO fr_pledge_payments
              (id, pledge_id, donor_id, project_id, installment_number, method, amount, status, due_date)
              VALUES (?, ?, ?, ?,
                      (SELECT COALESCE(MAX(installment_number), 0) + 1 FROM fr_pledge_payments WHERE pledge_id = ?),
                      'credit_card', ?, 'pending_processor', date('now'))`,
        args: [paymentId, pledgeId, body.donor_id, projectId, pledgeId, body.amount],
      });
    }
  } else {
    // mode === 'new_donation': create a new lump-sum pledge + a single payment row.
    pledgeId = crypto.randomUUID();
    await db().execute({
      sql: `INSERT INTO fr_pledges (id, owner_id, donor_id, project_id, fundraiser_id, amount, status, pledge_date, installments_total, payment_plan, notes)
            VALUES (?, ?, ?, ?, ?, ?, 'open', date('now'), 1, 'lump_sum', ?)`,
      args: [pledgeId, session.ownerId, body.donor_id, projectId, session.fundraiserId, body.amount, body.notes || null],
    });
    paymentId = crypto.randomUUID();
    await db().execute({
      sql: `INSERT INTO fr_pledge_payments (id, pledge_id, donor_id, project_id, installment_number, method, amount, status, due_date)
            VALUES (?, ?, ?, ?, 1, 'credit_card', ?, 'pending_processor', date('now'))`,
      args: [paymentId, pledgeId, body.donor_id, projectId, body.amount],
    });

    // Auto-convert lead → donor on first donation
    await db().execute({
      sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, datetime('now')) WHERE id = ? AND status = 'prospect'",
      args: [body.donor_id],
    });
  }

  // Create the payment session.
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('hex');
  const webhookSecret = crypto.randomBytes(16).toString('hex');

  // Resolve gateway URL template (per-owner override > env var)
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
    // Determine origin for webhook return URL
    const url = new URL(request.url);
    const origin = url.origin;
    const returnUrl = `${origin}/api/fundraising/payment-webhook?token=${token}&secret=${webhookSecret}`;
    const description = body.notes || (body.mode === 'new_donation' ? 'Donation' : 'Pledge payment');

    gatewayUrl = buildGatewayUrl(gatewayTemplate, {
      amount: body.amount,
      ref: token,
      donor_name: donorName,
      donor_email: (donor.email as string | null) || '',
      description,
      return_url: returnUrl,
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
