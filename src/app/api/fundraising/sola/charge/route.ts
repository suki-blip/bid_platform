import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { isPositiveAmount } from '@/lib/fundraising-types';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
import { loadSolaCredentials, solaSale, solaApproved, ccLast4, SolaError } from '@/lib/sola-client';

// POST /api/fundraising/sola/charge
//
// In-system credit-card charge via Sola/Cardknox cc:sale. The browser collected the
// card via iFields and gave us SUTs (single-use tokens) instead of the real card
// number. We never see the PAN.
//
// Body:
//   donor_id        — required
//   mode            — 'existing_pledge' | 'new_donation'
//   pledge_id?      — required when mode=existing_pledge
//   payment_id?     — optional installment to charge against
//   project_id?     — optional
//   amount          — required, positive number (dollars)
//   notes?          — free text saved to the payment row
//   sut_card        — required, iFields SUT for card number
//   sut_cvv?        — optional, iFields SUT for CVV
//   exp             — required, MMYY (e.g. "1228")
//   zip?            — optional, for AVS
//   street?         — optional, for AVS
//   bill_first_name?, bill_last_name? — optional
//
// Returns:
//   { ok: true, status: 'paid', payment_id, pledge_id, transaction_ref, cc_last4 } on approve
//   { ok: false, status: 'failed', reason } on decline (a row is still recorded as 'failed')

interface ChargeBody {
  donor_id: string;
  mode: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null;
  project_id?: string | null;
  amount: number;
  notes?: string | null;
  sut_card: string;
  sut_cvv?: string | null;
  exp: string;
  zip?: string | null;
  street?: string | null;
  bill_first_name?: string | null;
  bill_last_name?: string | null;
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  let body: ChargeBody;
  try {
    body = (await request.json()) as ChargeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ----- Validation -----
  if (!body.donor_id) return NextResponse.json({ error: 'donor_id required' }, { status: 400 });
  if (body.mode !== 'existing_pledge' && body.mode !== 'new_donation') {
    return NextResponse.json({ error: 'mode must be existing_pledge or new_donation' }, { status: 400 });
  }
  if (!isPositiveAmount(body.amount)) return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
  if (!body.sut_card) return NextResponse.json({ error: 'sut_card (iFields card token) required' }, { status: 400 });
  if (!body.exp || !/^\d{4}$/.test(body.exp)) {
    return NextResponse.json({ error: 'exp must be MMYY (4 digits)' }, { status: 400 });
  }

  // ----- Verify donor scope -----
  const donorRow = await db().execute({
    sql: 'SELECT id, first_name, last_name, email FROM fr_donors WHERE id = ? AND owner_id = ?',
    args: [body.donor_id, session.ownerId],
  });
  if (donorRow.rows.length === 0) return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
  const donor = donorRow.rows[0];
  const donorFirst = String(donor.first_name || '');
  const donorLast = String(donor.last_name || '');
  const donorEmail = (donor.email as string | null) || null;

  // ----- Load Sola credentials -----
  let creds;
  try {
    creds = await loadSolaCredentials(session.ownerId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // ----- Reserve / locate pledge + payment rows BEFORE charging -----
  // We pre-create rows as 'pending_processor' so we can attach the gateway response to them
  // even if the charge half-completes. After Cardknox responds, we flip to 'paid' or 'failed'.
  let pledgeId: string;
  let paymentId: string;
  let projectId: string | null = body.project_id || null;
  const ourToken = crypto.randomBytes(12).toString('hex');

  if (body.mode === 'existing_pledge') {
    if (!body.pledge_id) return NextResponse.json({ error: 'pledge_id required' }, { status: 400 });
    const pl = await db().execute({
      sql: 'SELECT id, project_id FROM fr_pledges WHERE id = ? AND donor_id = ? AND owner_id = ?',
      args: [body.pledge_id, body.donor_id, session.ownerId],
    });
    if (pl.rows.length === 0) return NextResponse.json({ error: 'Pledge not found' }, { status: 404 });
    pledgeId = String(pl.rows[0].id);
    projectId = projectId || (pl.rows[0].project_id ? String(pl.rows[0].project_id) : null);

    if (body.payment_id) {
      paymentId = body.payment_id;
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET status = 'pending_processor', method = 'credit_card', amount = ? WHERE id = ?`,
        args: [body.amount, paymentId],
      });
    } else {
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

  // ----- Call Cardknox cc:sale -----
  let saleRes;
  try {
    saleRes = await solaSale(creds, {
      amount: body.amount,
      cardNumToken: body.sut_card,
      cvvToken: body.sut_cvv || null,
      exp: body.exp,
      invoice: ourToken,
      description: body.notes || (body.mode === 'new_donation' ? 'Donation' : 'Pledge payment'),
      street: body.street || null,
      zip: body.zip || null,
      billFirstName: body.bill_first_name || donorFirst,
      billLastName: body.bill_last_name || donorLast,
      email: donorEmail,
    });
  } catch (e) {
    // Network / Cardknox-side error — mark payment as failed, surface error
    const msg = e instanceof SolaError ? e.message : (e as Error).message || 'Sola request failed';
    await db().execute({
      sql: `UPDATE fr_pledge_payments SET status = 'failed', notes = COALESCE(notes, '') || ? WHERE id = ?`,
      args: [` [Sola error: ${msg}]`, paymentId],
    });
    return NextResponse.json({ ok: false, status: 'failed', reason: msg }, { status: 502 });
  }

  // ----- Parse result -----
  if (solaApproved(saleRes)) {
    const last4 = ccLast4(saleRes.xMaskedCardNumber);
    const holder =
      [saleRes.xBillFirstName, saleRes.xBillLastName].filter(Boolean).join(' ').trim() ||
      `${donorFirst} ${donorLast}`.trim() ||
      null;
    await db().execute({
      sql: `UPDATE fr_pledge_payments
            SET status = 'paid', paid_date = date('now'),
                transaction_ref = ?, cc_last4 = ?, cc_holder = ?
            WHERE id = ?`,
      args: [saleRes.xRefNum, last4, holder, paymentId],
    });
    await recomputePledgeStatus(pledgeId);
    await recomputeDonorTotals(body.donor_id);

    return NextResponse.json({
      ok: true,
      status: 'paid',
      payment_id: paymentId,
      pledge_id: pledgeId,
      transaction_ref: saleRes.xRefNum,
      cc_last4: last4,
      auth_code: saleRes.xAuthCode,
    });
  } else {
    // Decline / error
    const reason = saleRes.xError || saleRes.xStatus || 'Declined';
    await db().execute({
      sql: `UPDATE fr_pledge_payments
            SET status = 'failed', transaction_ref = ?,
                notes = COALESCE(notes, '') || ?
            WHERE id = ?`,
      args: [saleRes.xRefNum || null, ` [Declined: ${reason}]`, paymentId],
    });
    await recomputePledgeStatus(pledgeId);

    return NextResponse.json({
      ok: false,
      status: 'failed',
      payment_id: paymentId,
      pledge_id: pledgeId,
      reason,
      sola_result: saleRes.xResult,
      sola_status: saleRes.xStatus,
    });
  }
}
