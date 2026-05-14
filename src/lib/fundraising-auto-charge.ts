// Auto-charge engine — shared by the Vercel cron and any manual "run now" admin trigger.
//
// Picks up scheduled fr_pledge_payments whose due_date has arrived AND whose parent pledge
// has auto_charge_card_id set, then charges each via Cardknox cc:sale (saved-token path).
//
// Multi-tenant: iterates by owner_id, loading each owner's xKey separately. A failure on one
// owner does NOT abort the run for others.
//
// Idempotency: we flip rows to 'pending_processor' before calling Cardknox, then to 'paid'
// or 'failed' based on the response. xRefNum is persisted on the payment row so duplicate
// runs (same payment, already paid) will skip cleanly because we only pick up status='scheduled'.

import crypto from 'crypto';
import { db } from './db';
import {
  loadSolaCredentials,
  solaTokenSale,
  solaApproved,
  ccLast4,
  SolaError,
} from './sola-client';
import { recomputeDonorTotals, recomputePledgeStatus } from './fundraising-totals';

export interface AutoChargeResult {
  owner_id: string;
  payment_id: string;
  pledge_id: string;
  donor_id: string;
  card_id: string;
  amount: number;
  result: 'approved' | 'declined' | 'error' | 'skipped';
  gateway_ref: string | null;
  reason: string | null;
}

interface DueRow {
  payment_id: string;
  pledge_id: string;
  donor_id: string;
  owner_id: string;
  amount: number;
  card_id: string;
  sola_token: string;
  exp_month: number | null;
  exp_year: number | null;
  billing_zip: string | null;
  billing_street: string | null;
  donor_first: string | null;
  donor_last: string | null;
  donor_email: string | null;
}

/**
 * Find all payment rows that should be auto-charged today.
 *
 * Criteria:
 *   - pp.status = 'scheduled'
 *   - pp.due_date <= today (so we also catch rows the cron missed earlier)
 *   - pp.method = 'credit_card' (we won't override an installment marked as e.g. 'check')
 *   - parent pledge has auto_charge_card_id set, and that card is still active
 */
async function findDuePayments(today: string): Promise<DueRow[]> {
  const result = await db().execute({
    sql: `SELECT pp.id AS payment_id, pp.pledge_id, pp.donor_id, pp.amount,
                 pl.owner_id, pl.auto_charge_card_id AS card_id,
                 dc.sola_token, dc.exp_month, dc.exp_year,
                 dc.billing_zip, dc.billing_street,
                 d.first_name AS donor_first, d.last_name AS donor_last, d.email AS donor_email
          FROM fr_pledge_payments pp
          JOIN fr_pledges pl ON pl.id = pp.pledge_id
          JOIN fr_donor_cards dc ON dc.id = pl.auto_charge_card_id
          JOIN fr_donors d ON d.id = pp.donor_id
          WHERE pp.status = 'scheduled'
            AND pp.method IN ('credit_card', 'pending')
            AND pp.due_date IS NOT NULL
            AND pp.due_date <= ?
            AND pl.status = 'open'
            AND dc.status = 'active'`,
    args: [today],
  });
  return result.rows.map((r) => ({
    payment_id: String(r.payment_id),
    pledge_id: String(r.pledge_id),
    donor_id: String(r.donor_id),
    owner_id: String(r.owner_id),
    amount: Number(r.amount),
    card_id: String(r.card_id),
    sola_token: String(r.sola_token),
    exp_month: r.exp_month ? Number(r.exp_month) : null,
    exp_year: r.exp_year ? Number(r.exp_year) : null,
    billing_zip: (r.billing_zip as string | null) || null,
    billing_street: (r.billing_street as string | null) || null,
    donor_first: (r.donor_first as string | null) || null,
    donor_last: (r.donor_last as string | null) || null,
    donor_email: (r.donor_email as string | null) || null,
  }));
}

async function logAttempt(
  ownerId: string,
  paymentId: string,
  cardId: string,
  amount: number,
  result: 'approved' | 'declined' | 'error',
  gatewayRef: string | null,
  errorMsg: string | null,
): Promise<void> {
  try {
    await db().execute({
      sql: `INSERT INTO fr_auto_charge_log
              (id, owner_id, payment_id, card_id, amount, result, gateway_ref, gateway_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), ownerId, paymentId, cardId, amount, result, gatewayRef, errorMsg],
    });
  } catch (err) {
    console.error('[auto-charge] failed to write log row:', err);
  }
}

/**
 * Process one due payment row. Sets status to 'pending_processor' before the API call,
 * then to 'paid' or 'failed' based on the response. Returns a result record.
 *
 * Errors thrown from this function (network, programming bugs) are caught by the caller.
 */
async function processOne(row: DueRow): Promise<AutoChargeResult> {
  // Reserve the row first.
  await db().execute({
    sql: "UPDATE fr_pledge_payments SET status = 'pending_processor', method = 'credit_card' WHERE id = ? AND status = 'scheduled'",
    args: [row.payment_id],
  });

  let creds;
  try {
    creds = await loadSolaCredentials(row.owner_id);
  } catch (e) {
    const msg = (e as Error).message;
    // Revert and mark failed.
    await db().execute({
      sql: `UPDATE fr_pledge_payments SET status = 'failed', notes = COALESCE(notes, '') || ? WHERE id = ?`,
      args: [` [Auto-charge skipped: ${msg}]`, row.payment_id],
    });
    await logAttempt(row.owner_id, row.payment_id, row.card_id, row.amount, 'error', null, msg);
    return {
      owner_id: row.owner_id,
      payment_id: row.payment_id,
      pledge_id: row.pledge_id,
      donor_id: row.donor_id,
      card_id: row.card_id,
      amount: row.amount,
      result: 'error',
      gateway_ref: null,
      reason: msg,
    };
  }

  const expStr =
    row.exp_month && row.exp_year
      ? `${String(row.exp_month).padStart(2, '0')}${String(row.exp_year).slice(-2)}`
      : null;
  const invoice = crypto.randomBytes(12).toString('hex');

  let saleRes;
  try {
    saleRes = await solaTokenSale(creds, {
      amount: row.amount,
      token: row.sola_token,
      exp: expStr,
      invoice,
      description: 'Recurring auto-charge',
      zip: row.billing_zip,
      street: row.billing_street,
      billFirstName: row.donor_first,
      billLastName: row.donor_last,
      email: row.donor_email,
    });
  } catch (e) {
    const msg = e instanceof SolaError ? e.message : (e as Error).message || 'Cardknox call failed';
    await db().execute({
      sql: `UPDATE fr_pledge_payments SET status = 'failed', notes = COALESCE(notes, '') || ? WHERE id = ?`,
      args: [` [Auto-charge error: ${msg}]`, row.payment_id],
    });
    await logAttempt(row.owner_id, row.payment_id, row.card_id, row.amount, 'error', null, msg);
    return {
      owner_id: row.owner_id,
      payment_id: row.payment_id,
      pledge_id: row.pledge_id,
      donor_id: row.donor_id,
      card_id: row.card_id,
      amount: row.amount,
      result: 'error',
      gateway_ref: null,
      reason: msg,
    };
  }

  if (solaApproved(saleRes)) {
    const last4 = ccLast4(saleRes.xMaskedCardNumber);
    await db().execute({
      sql: `UPDATE fr_pledge_payments
            SET status = 'paid', paid_date = date('now'),
                transaction_ref = ?, cc_last4 = ?
            WHERE id = ?`,
      args: [saleRes.xRefNum, last4, row.payment_id],
    });
    await db().execute({
      sql: "UPDATE fr_donor_cards SET last_used_at = datetime('now') WHERE id = ?",
      args: [row.card_id],
    });
    await recomputePledgeStatus(row.pledge_id);
    await recomputeDonorTotals(row.donor_id);
    await logAttempt(row.owner_id, row.payment_id, row.card_id, row.amount, 'approved', saleRes.xRefNum, null);
    return {
      owner_id: row.owner_id,
      payment_id: row.payment_id,
      pledge_id: row.pledge_id,
      donor_id: row.donor_id,
      card_id: row.card_id,
      amount: row.amount,
      result: 'approved',
      gateway_ref: saleRes.xRefNum,
      reason: null,
    };
  }

  const reason = saleRes.xError || saleRes.xStatus || 'Declined';
  await db().execute({
    sql: `UPDATE fr_pledge_payments
          SET status = 'failed', transaction_ref = ?,
              notes = COALESCE(notes, '') || ?
          WHERE id = ?`,
    args: [saleRes.xRefNum || null, ` [Auto-charge declined: ${reason}]`, row.payment_id],
  });
  await logAttempt(row.owner_id, row.payment_id, row.card_id, row.amount, 'declined', saleRes.xRefNum, reason);
  return {
    owner_id: row.owner_id,
    payment_id: row.payment_id,
    pledge_id: row.pledge_id,
    donor_id: row.donor_id,
    card_id: row.card_id,
    amount: row.amount,
    result: 'declined',
    gateway_ref: saleRes.xRefNum,
    reason,
  };
}

/**
 * Run one pass of the auto-charge cron. Returns the list of attempts (one entry per row
 * processed). Safe to invoke multiple times per day — only picks up status='scheduled'.
 */
export async function runAutoChargeBatch(): Promise<AutoChargeResult[]> {
  const today = new Date().toISOString().slice(0, 10);
  const due = await findDuePayments(today);
  const results: AutoChargeResult[] = [];
  // Serial, not parallel — Cardknox per-account rate limits + cleaner ordering for logs.
  for (const row of due) {
    try {
      const r = await processOne(row);
      results.push(r);
    } catch (err) {
      console.error('[auto-charge] processOne threw:', err);
      results.push({
        owner_id: row.owner_id,
        payment_id: row.payment_id,
        pledge_id: row.pledge_id,
        donor_id: row.donor_id,
        card_id: row.card_id,
        amount: row.amount,
        result: 'error',
        gateway_ref: null,
        reason: (err as Error).message || 'unknown',
      });
    }
  }
  return results;
}
