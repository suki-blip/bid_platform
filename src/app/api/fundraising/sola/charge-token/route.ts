import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { isPositiveAmount } from '@/lib/fundraising-types';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';
import { loadSolaCredentials, solaTokenSale, solaApproved, ccLast4, SolaError } from '@/lib/sola-client';

// POST /api/fundraising/sola/charge-token
//
// Charge a previously-saved card by its card_id. No iFields involved — the user just
// confirms the amount + which saved card to use. Used by:
//   - donor profile "Charge again" button
//   - the future auto-charge cron (although the cron will share helper code, not this route)
//   - "use saved card" mode in the Payment page (skips card-entry UI entirely)
//
// Allocation logic mirrors /api/fundraising/sola/charge (single or multi-allocation).
// The only differences vs /charge: no SUTs, no exp re-entry, no save_card flag — we pull
// the vault token from fr_donor_cards by card_id.

interface Allocation {
  type: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null;
  project_id?: string | null;
  amount: number;
}

interface ChargeTokenBody {
  donor_id: string;
  card_id: string;
  mode?: 'existing_pledge' | 'new_donation';
  pledge_id?: string | null;
  payment_id?: string | null;
  project_id?: string | null;
  amount?: number;
  allocations?: Allocation[];
  notes?: string | null;
}

function normaliseAllocations(body: ChargeTokenBody): Allocation[] | { error: string } {
  if (Array.isArray(body.allocations) && body.allocations.length > 0) {
    for (const a of body.allocations) {
      if (a.type !== 'existing_pledge' && a.type !== 'new_donation') {
        return { error: 'allocation.type must be existing_pledge or new_donation' };
      }
      if (!isPositiveAmount(a.amount)) return { error: 'each allocation amount must be positive' };
      if (a.type === 'existing_pledge' && !a.pledge_id) {
        return { error: 'existing_pledge allocation requires pledge_id' };
      }
    }
    return body.allocations;
  }
  if (!body.mode || (body.mode !== 'existing_pledge' && body.mode !== 'new_donation')) {
    return { error: 'mode (or allocations[]) is required' };
  }
  if (!isPositiveAmount(body.amount)) return { error: 'amount must be positive' };
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

  let body: ChargeTokenBody;
  try {
    body = (await request.json()) as ChargeTokenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.donor_id) return NextResponse.json({ error: 'donor_id required' }, { status: 400 });
  if (!body.card_id) return NextResponse.json({ error: 'card_id required' }, { status: 400 });
  const normResult = normaliseAllocations(body);
  if (!Array.isArray(normResult)) return NextResponse.json({ error: normResult.error }, { status: 400 });
  const allocations = normResult;
  const totalAmount = allocations.reduce((s, a) => s + a.amount, 0);

  // Verify donor scope.
  const donorRow = await db().execute({
    sql: 'SELECT id, first_name, last_name, email FROM fr_donors WHERE id = ? AND owner_id = ?',
    args: [body.donor_id, session.ownerId],
  });
  if (donorRow.rows.length === 0) return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
  const donor = donorRow.rows[0];

  // Look up the saved card. Must belong to this donor + owner + still active.
  const cardRow = await db().execute({
    sql: `SELECT id, sola_token, exp_month, exp_year, billing_zip, billing_street, cc_last4
          FROM fr_donor_cards
          WHERE id = ? AND donor_id = ? AND owner_id = ? AND status = 'active'`,
    args: [body.card_id, body.donor_id, session.ownerId],
  });
  if (cardRow.rows.length === 0) {
    return NextResponse.json({ error: 'Card not found or no longer active' }, { status: 404 });
  }
  const card = cardRow.rows[0];
  const token = String(card.sola_token);

  // Load credentials and reserve rows.
  let creds;
  try {
    creds = await loadSolaCredentials(session.ownerId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  interface Reserved {
    paymentId: string;
    pledgeId: string;
  }
  const reserved: Reserved[] = [];

  for (const a of allocations) {
    let pledgeId: string;
    let paymentId: string;
    const projectId: string | null = a.project_id || null;

    if (a.type === 'existing_pledge') {
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

      await db().execute({
        sql: "UPDATE fr_donors SET status = 'donor', converted_at = COALESCE(converted_at, datetime('now')) WHERE id = ? AND status = 'prospect'",
        args: [body.donor_id],
      });
    }

    reserved.push({ paymentId, pledgeId });
  }

  // Call Cardknox cc:sale via stored token.
  const ourInvoice = crypto.randomBytes(12).toString('hex');
  const expStr = card.exp_month && card.exp_year
    ? `${String(card.exp_month).padStart(2, '0')}${String(card.exp_year).slice(-2)}`
    : null;

  let saleRes;
  try {
    saleRes = await solaTokenSale(creds, {
      amount: totalAmount,
      token,
      exp: expStr,
      invoice: ourInvoice,
      description: body.notes || (allocations.length > 1 ? 'Saved-card split charge' : 'Saved-card charge'),
      zip: (card.billing_zip as string | null) || null,
      street: (card.billing_street as string | null) || null,
      billFirstName: String(donor.first_name || ''),
      billLastName: String(donor.last_name || ''),
      email: (donor.email as string | null) || null,
    });
  } catch (e) {
    const msg = e instanceof SolaError ? e.message : (e as Error).message || 'Sola request failed';
    for (const r of reserved) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments SET status = 'failed', notes = COALESCE(notes, '') || ? WHERE id = ?`,
        args: [` [Sola error: ${msg}]`, r.paymentId],
      });
    }
    return NextResponse.json({ ok: false, status: 'failed', reason: msg }, { status: 502 });
  }

  if (solaApproved(saleRes)) {
    const last4 = ccLast4(saleRes.xMaskedCardNumber) || (card.cc_last4 as string | null);
    for (const r of reserved) {
      await db().execute({
        sql: `UPDATE fr_pledge_payments
              SET status = 'paid', paid_date = date('now'),
                  transaction_ref = ?, cc_last4 = ?
              WHERE id = ?`,
        args: [saleRes.xRefNum, last4, r.paymentId],
      });
    }
    const uniquePledges = Array.from(new Set(reserved.map((r) => r.pledgeId)));
    for (const pid of uniquePledges) await recomputePledgeStatus(pid);
    await recomputeDonorTotals(body.donor_id);

    // Bump last_used_at on the card.
    await db().execute({
      sql: "UPDATE fr_donor_cards SET last_used_at = datetime('now') WHERE id = ?",
      args: [body.card_id],
    });

    return NextResponse.json({
      ok: true,
      status: 'paid',
      total_amount: totalAmount,
      transaction_ref: saleRes.xRefNum,
      cc_last4: last4,
      auth_code: saleRes.xAuthCode,
      payments: reserved.map((r) => ({ payment_id: r.paymentId, pledge_id: r.pledgeId })),
    });
  } else {
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
    const uniquePledges = Array.from(new Set(reserved.map((r) => r.pledgeId)));
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
