import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { isPositiveAmount } from '@/lib/fundraising-types';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
import { loadSolaCredentials, solaSale, solaApproved, ccLast4, ccBrand, parseExp, SolaError } from '@/lib/sola-client';

// POST /api/fundraising/sola/charge
//
// Two input shapes are accepted:
//
//   A) Legacy single-allocation (still used by older payment-flow code paths):
//      { donor_id, mode, pledge_id?, payment_id?, project_id?, amount, notes?,
//        sut_card, sut_cvv?, exp, zip?, ... }
//
//   B) Multi-allocation (new — supports splitting one charge across pledges + donations):
//      { donor_id, allocations: [
//          { type: 'existing_pledge', pledge_id, payment_id?, amount },
//          { type: 'new_donation',    project_id?,  amount },
//          ...
//        ],
//        notes?, sut_card, sut_cvv?, exp, zip?, ... }
//
// In shape B, the total card-charge amount = sum(allocations[].amount). We make ONE
// cc:sale call to Cardknox for that total and then write N fr_pledge_payments rows
// (one per allocation), each tagged with the same xRefNum so they're traceable.

interface Allocation {
  type: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null;
  project_id?: string | null;
  amount: number;
}

interface ChargeBody {
  donor_id: string;
  // Legacy single-allocation
  mode?: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null;
  project_id?: string | null;
  amount?: number;
  // New multi-allocation
  allocations?: Allocation[];
  // Common
  notes?: string | null;
  sut_card: string;
  sut_cvv?: string | null;
  exp: string;
  zip?: string | null;
  street?: string | null;
  bill_first_name?: string | null;
  bill_last_name?: string | null;
  /** If true, ask Cardknox to return a vault token (xCreateToken=1) and persist it as a fr_donor_cards row. */
  save_card?: boolean;
  /** If true (along with save_card), mark the new card as the donor's default. */
  set_default?: boolean;
  /** Optional cardholder name to store with the saved card (separate from billFirst/billLast on the txn). */
  cardholder_name?: string | null;
}

// Normalise the request body into a single shape: a list of allocations.
function normaliseAllocations(body: ChargeBody): Allocation[] | { error: string } {
  if (Array.isArray(body.allocations) && body.allocations.length > 0) {
    for (const a of body.allocations) {
      if (a.type !== 'existing_pledge' && a.type !== 'new_donation') {
        return { error: `allocation.type must be existing_pledge or new_donation` };
      }
      if (!isPositiveAmount(a.amount)) {
        return { error: `each allocation amount must be positive` };
      }
      if (a.type === 'existing_pledge' && !a.pledge_id) {
        return { error: `existing_pledge allocation requires pledge_id` };
      }
    }
    return body.allocations;
  }
  // Legacy single-target
  if (!body.mode || (body.mode !== 'existing_pledge' && body.mode !== 'new_donation')) {
    return { error: 'mode (or allocations[]) is required' };
  }
  if (!isPositiveAmount(body.amount)) {
    return { error: 'amount must be positive' };
  }
  if (body.mode === 'existing_pledge' && !body.pledge_id) {
    return { error: 'pledge_id required for existing_pledge mode' };
  }
  return [
    {
      type: body.mode,
      pledge_id: body.pledge_id || null,
      payment_id: body.payment_id || null,
      project_id: body.project_id || null,
      amount: body.amount!,
    },
  ];
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
  if (!body.sut_card) return NextResponse.json({ error: 'sut_card (iFields card token) required' }, { status: 400 });
  if (!body.exp || !/^\d{4}$/.test(body.exp)) {
    return NextResponse.json({ error: 'exp must be MMYY (4 digits)' }, { status: 400 });
  }
  const normResult = normaliseAllocations(body);
  if (!Array.isArray(normResult)) return NextResponse.json({ error: normResult.error }, { status: 400 });
  const allocations = normResult;
  const totalAmount = allocations.reduce((s, a) => s + a.amount, 0);

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

  // ----- Reserve pledge + payment rows for each allocation BEFORE charging -----
  // Pre-create as 'pending_processor'. After Cardknox responds we flip them all together.
  interface Reserved {
    paymentId: string;
    pledgeId: string;
    affectedPledgeId: string; // for recompute after success
    affectedDonorId: string;
  }
  const reserved: Reserved[] = [];

  for (const a of allocations) {
    let pledgeId: string;
    let paymentId: string;
    const projectId: string | null = a.project_id || null;

    if (a.type === 'existing_pledge') {
      // pledge_id is guaranteed non-null here — normaliseAllocations validates it.
      const aPledgeId = a.pledge_id as string;
      const pl = await db().execute({
        sql: 'SELECT id, project_id FROM fr_pledges WHERE id = ? AND donor_id = ? AND owner_id = ?',
        args: [aPledgeId, body.donor_id, session.ownerId],
      });
      if (pl.rows.length === 0) return NextResponse.json({ error: `Pledge ${a.pledge_id} not found` }, { status: 404 });
      pledgeId = String(pl.rows[0].id);
      const pledgeProject = pl.rows[0].project_id ? String(pl.rows[0].project_id) : null;

      if (a.payment_id) {
        paymentId = a.payment_id;
        await db().execute({
          sql: `UPDATE fr_pledge_payments SET status = 'pending_processor', method = 'credit_card', amount = ? WHERE id = ?`,
          args: [a.amount, paymentId],
        });
      } else {
        paymentId = crypto.randomUUID();
        await db().execute({
          sql: `INSERT INTO fr_pledge_payments
                  (id, pledge_id, donor_id, project_id, installment_number, method, amount, status, due_date)
                VALUES (?, ?, ?, ?,
                        (SELECT COALESCE(MAX(installment_number), 0) + 1 FROM fr_pledge_payments WHERE pledge_id = ?),
                        'credit_card', ?, 'pending_processor', date('now'))`,
          args: [paymentId, pledgeId, body.donor_id, projectId || pledgeProject, pledgeId, a.amount],
        });
      }
    } else {
      // new_donation — wrap the payment in a synthetic lump-sum pledge (is_standalone=1).
      // Required by the NOT NULL pledge_id constraint on fr_pledge_payments. The is_standalone
      // flag tells the UI to hide this from the donor's Pledges list — they only see the payment.
      pledgeId = crypto.randomUUID();
      await db().execute({
        sql: `INSERT INTO fr_pledges (id, owner_id, donor_id, project_id, fundraiser_id, amount, status, pledge_date, installments_total, payment_plan, notes, is_standalone)
              VALUES (?, ?, ?, ?, ?, ?, 'fulfilled', date('now'), 1, 'lump_sum', ?, 1)`,
        args: [pledgeId, session.ownerId, body.donor_id, projectId, session.fundraiserId, a.amount, body.notes || null],
      });
      paymentId = crypto.randomUUID();
      await db().execute({
        sql: `INSERT INTO fr_pledge_payments (id, pledge_id, donor_id, project_id, installment_number, method, amount, status, due_date)
              VALUES (?, ?, ?, ?, 1, 'credit_card', ?, 'pending_processor', date('now'))`,
        args: [paymentId, pledgeId, body.donor_id, projectId, a.amount],
      });

      // Auto-convert lead → donor on first donation
      await db().execute({
        sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, datetime('now')) WHERE id = ? AND status = 'prospect'",
        args: [body.donor_id],
      });
    }

    reserved.push({ paymentId, pledgeId, affectedPledgeId: pledgeId, affectedDonorId: body.donor_id });
  }

  // ----- Call Cardknox cc:sale ONCE for the total amount -----
  const ourToken = crypto.randomBytes(12).toString('hex');
  let saleRes;
  try {
    saleRes = await solaSale(creds, {
      amount: totalAmount,
      cardNumToken: body.sut_card,
      cvvToken: body.sut_cvv || null,
      exp: body.exp,
      invoice: ourToken,
      description:
        body.notes ||
        (allocations.length > 1
          ? `Split donation (${allocations.length} allocations)`
          : allocations[0].type === 'new_donation'
          ? 'Donation'
          : 'Pledge payment'),
      street: body.street || null,
      zip: body.zip || null,
      billFirstName: body.bill_first_name || donorFirst,
      billLastName: body.bill_last_name || donorLast,
      email: donorEmail,
      createToken: !!body.save_card,
    });
  } catch (e) {
    const msg = e instanceof SolaError ? e.message : (e as Error).message || 'Sola request failed';
    // Mark all reserved rows as failed
    for (const r of reserved) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET status = 'failed', notes = COALESCE(notes, '') || ? WHERE id = ?`,
        args: [` [Sola error: ${msg}]`, r.paymentId],
      });
    }
    return NextResponse.json({ ok: false, status: 'failed', reason: msg }, { status: 502 });
  }

  // ----- Parse result and update ALL rows together -----
  if (solaApproved(saleRes)) {
    const last4 = ccLast4(saleRes.xMaskedCardNumber);
    const holder =
      [saleRes.xBillFirstName, saleRes.xBillLastName].filter(Boolean).join(' ').trim() ||
      `${donorFirst} ${donorLast}`.trim() ||
      null;

    for (const r of reserved) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments
              SET status = 'paid', paid_date = date('now'),
                  transaction_ref = ?, cc_last4 = ?, cc_holder = ?
              WHERE id = ?`,
        args: [saleRes.xRefNum, last4, holder, r.paymentId],
      });
    }
    // Recompute the unique set of affected pledges + the donor once
    const uniquePledges = Array.from(new Set(reserved.map((r) => r.affectedPledgeId)));
    for (const pid of uniquePledges) await recomputePledgeStatus(pid);
    await recomputeDonorTotals(body.donor_id);

    // ----- Save card on file if requested + Cardknox returned a token -----
    // This runs AFTER the charge so a failed token-store doesn't break a successful donation.
    // Wrap in try/catch — saving the card is best-effort, never poison the response.
    let savedCardId: string | null = null;
    if (body.save_card && saleRes.xToken) {
      try {
        // If set_default is true, demote any existing default first.
        if (body.set_default) {
          await db().execute({
            sql: "UPDATE fr_donor_cards SET is_default = 0 WHERE donor_id = ? AND is_default = 1",
            args: [body.donor_id],
          });
        }
        // Avoid duplicating: if a card with the same token already exists for this donor, reuse it.
        const existing = await db().execute({
          sql: 'SELECT id FROM fr_donor_cards WHERE donor_id = ? AND sola_token = ?',
          args: [body.donor_id, saleRes.xToken],
        });
        if (existing.rows.length > 0) {
          savedCardId = String(existing.rows[0].id);
          await db().execute({
            sql: `UPDATE fr_donor_cards
                  SET last_used_at = datetime('now'), status = 'active'
                      ${body.set_default ? ", is_default = 1" : ''}
                  WHERE id = ?`,
            args: [savedCardId],
          });
        } else {
          const { month: expMonth, year: expYear } = parseExp(body.exp || saleRes.xExp);
          const brand = ccBrand(saleRes.xMaskedCardNumber, saleRes.xCardType);
          savedCardId = crypto.randomUUID();
          await db().execute({
            sql: `INSERT INTO fr_donor_cards
                    (id, owner_id, donor_id, sola_token, cc_last4, cc_brand,
                     exp_month, exp_year, cardholder_name, billing_zip, billing_street,
                     is_default, status, last_used_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
            args: [
              savedCardId,
              session.ownerId,
              body.donor_id,
              saleRes.xToken,
              last4,
              brand,
              expMonth,
              expYear,
              body.cardholder_name || holder,
              body.zip || null,
              body.street || null,
              body.set_default ? 1 : 0,
            ],
          });
        }
      } catch (err) {
        // Log but don't fail the response — the donation succeeded, just the card-save didn't.
        console.error('[sola/charge] save_card failed:', err);
      }
    }

    return NextResponse.json({
      ok: true,
      status: 'paid',
      total_amount: totalAmount,
      transaction_ref: saleRes.xRefNum,
      cc_last4: last4,
      auth_code: saleRes.xAuthCode,
      saved_card_id: savedCardId,
      payments: reserved.map((r) => ({ payment_id: r.paymentId, pledge_id: r.pledgeId })),
    });
  } else {
    // Decline / error — mark all rows as failed
    const reason = saleRes.xError || saleRes.xStatus || 'Declined';
    for (const r of reserved) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments
              SET status = 'failed', transaction_ref = ?,
                  notes = COALESCE(notes, '') || ?
              WHERE id = ?`,
        args: [saleRes.xRefNum || null, ` [Declined: ${reason}]`, r.paymentId],
      });
    }
    const uniquePledges = Array.from(new Set(reserved.map((r) => r.affectedPledgeId)));
    for (const pid of uniquePledges) await recomputePledgeStatus(pid);

    return NextResponse.json({
      ok: false,
      status: 'failed',
      reason,
      sola_result: saleRes.xResult,
      sola_status: saleRes.xStatus,
    });
  }
}
