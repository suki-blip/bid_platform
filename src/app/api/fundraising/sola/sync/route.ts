import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { loadSolaCredentials, solaReportTransactions, ccLast4, SolaError } from '@/lib/sola-client';
import { recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';

// POST /api/fundraising/sola/sync
//
// Pulls Cardknox transactions from a date range and reconciles them against local
// fr_pledge_payments. Three outcomes per transaction:
//   1. Already linked (we have a payment row with the same xRefNum) → maybe update status
//   2. Matchable to a session by xInvoice → link it, update status
//   3. Orphan (made directly in Sola portal, not via our app) → record as a new payment
//      under a placeholder pledge for the donor (or under an "unattributed" virtual donor
//      we lazily create on first sync)
//
// Body:
//   from_date?  YYYY-MM-DD — default 30 days ago
//   to_date?    YYYY-MM-DD — default today
//   record_orphans? boolean — when true, create payments for orphan transactions.
//                              Default false (safer; surfaces orphans in the response so
//                              the user can decide).
//
// Response:
//   { transactions_seen, payments_updated, payments_created,
//     orphan_count, orphans: [...details...] }

interface SyncBody {
  from_date?: string;
  to_date?: string;
  record_orphans?: boolean;
}

interface ReconcileResult {
  transactions_seen: number;
  payments_updated: number;
  payments_created: number;
  orphan_count: number;
  orphans: {
    xRefNum: string | null;
    xAmount: string | null;
    xMaskedCardNumber: string | null;
    xBillFirstName: string | null;
    xBillLastName: string | null;
    xEmail: string | null;
    xInvoice: string | null;
    xDate: string | null;
    xResult: string;
    xStatus: string;
  }[];
}

// Normalise Cardknox result codes ('A'/'D'/'E') → our payment_status enum
function solaToStatus(xResult: string, xStatus: string): 'paid' | 'failed' | 'cancelled' | 'scheduled' | null {
  const r = (xResult || '').toUpperCase();
  if (r === 'A') return 'paid';
  if (r === 'D' || r === 'E') return 'failed';
  const s = (xStatus || '').toLowerCase();
  if (s === 'approved') return 'paid';
  if (s === 'declined' || s === 'error') return 'failed';
  if (s === 'voided' || s === 'cancelled') return 'cancelled';
  return null;
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = (await request.json().catch(() => ({}))) as SyncBody;

  // Load credentials. If not configured, fail cleanly.
  let creds;
  try {
    creds = await loadSolaCredentials(session.ownerId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Start a sync log row up front so we can finalise it whether we succeed or fail.
  const logId = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_sola_sync_log (id, owner_id, from_date, to_date) VALUES (?, ?, ?, ?)`,
    args: [logId, session.ownerId, body.from_date || null, body.to_date || null],
  });

  let report;
  try {
    report = await solaReportTransactions(creds, {
      fromDate: body.from_date,
      toDate: body.to_date,
    });
  } catch (e) {
    const msg = e instanceof SolaError ? e.message : (e as Error).message;
    await db().execute({
      sql: 'UPDATE fr_sola_sync_log SET finished_at = datetime("now"), error = ? WHERE id = ?',
      args: [msg, logId],
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const txs = report.transactions;

  // Reconciliation: for each transaction, try to find a local payment row.
  // We match by transaction_ref (=xRefNum) first, then by the invoice token (=xInvoice).
  const result: ReconcileResult = {
    transactions_seen: txs.length,
    payments_updated: 0,
    payments_created: 0,
    orphan_count: 0,
    orphans: [],
  };

  // Pre-build a lookup for fast matching: existing payments with transaction_ref OR by linked session token
  // We'll do these matches inside the loop so we always read fresh state (a newly-created row in this loop
  // should be visible to later iterations).

  for (const tx of txs) {
    const xRefNum = tx.xRefNum != null ? String(tx.xRefNum) : null;
    const xInvoice = tx.xInvoice != null ? String(tx.xInvoice) : null;
    const xAmount = tx.xAmount != null ? String(tx.xAmount) : null;
    const xResult = tx.xResult != null ? String(tx.xResult) : '';
    const xStatus = tx.xStatus != null ? String(tx.xStatus) : '';
    const xMasked = tx.xMaskedCardNumber != null ? String(tx.xMaskedCardNumber) : null;
    const xBillFirst = tx.xBillFirstName != null ? String(tx.xBillFirstName) : null;
    const xBillLast = tx.xBillLastName != null ? String(tx.xBillLastName) : null;
    const xEmail = tx.xEmail != null ? String(tx.xEmail) : null;
    const xDate = (tx.xEnteredDate || tx.xDate || tx.xCreatedDate) as string | undefined;
    const dateIso = xDate ? parseCardknoxDate(String(xDate)) : null;

    const newStatus = solaToStatus(xResult, xStatus);
    if (!newStatus) continue; // unrecognised; skip

    // --- Attempt 1: find existing payment by transaction_ref ---
    let foundRow: { id: string; pledge_id: string; donor_id: string; status: string } | null = null;
    if (xRefNum) {
      const r = await db().execute({
        sql: `SELECT pp.id, pp.pledge_id, pp.donor_id, pp.status
              FROM fr_pledge_payments pp
              JOIN fr_donors d ON d.id = pp.donor_id
              WHERE d.owner_id = ? AND pp.transaction_ref = ?
              LIMIT 1`,
        args: [session.ownerId, xRefNum],
      });
      if (r.rows.length) {
        const row = r.rows[0];
        foundRow = { id: String(row.id), pledge_id: String(row.pledge_id), donor_id: String(row.donor_id), status: String(row.status) };
      }
    }

    // --- Attempt 2: find by payment-session token (xInvoice = our token) ---
    if (!foundRow && xInvoice) {
      const r = await db().execute({
        sql: `SELECT pp.id, pp.pledge_id, pp.donor_id, pp.status
              FROM fr_payment_sessions s
              JOIN fr_pledge_payments pp ON pp.id = s.payment_id
              WHERE s.owner_id = ? AND s.token = ?
              LIMIT 1`,
        args: [session.ownerId, xInvoice],
      });
      if (r.rows.length) {
        const row = r.rows[0];
        foundRow = { id: String(row.id), pledge_id: String(row.pledge_id), donor_id: String(row.donor_id), status: String(row.status) };
      }
    }

    if (foundRow) {
      // Only update if status differs OR we're filling in metadata
      if (foundRow.status !== newStatus) {
        await db().execute({
          sql: `UPDATE fr_pledge_payments
                SET status = ?,
                    paid_date = CASE WHEN ? = 'paid' AND paid_date IS NULL THEN COALESCE(?, date('now')) ELSE paid_date END,
                    transaction_ref = COALESCE(transaction_ref, ?),
                    cc_last4 = COALESCE(cc_last4, ?),
                    cc_holder = COALESCE(cc_holder, ?)
                WHERE id = ?`,
          args: [
            newStatus,
            newStatus,
            dateIso,
            xRefNum,
            ccLast4(xMasked),
            [xBillFirst, xBillLast].filter(Boolean).join(' ').trim() || null,
            foundRow.id,
          ],
        });
        await recomputePledgeStatus(foundRow.pledge_id);
        await recomputeDonorTotals(foundRow.donor_id);
        result.payments_updated++;
      }
      continue;
    }

    // --- Orphan: no matching record. Either skip-and-report or auto-create. ---
    if (!body.record_orphans) {
      result.orphan_count++;
      if (result.orphans.length < 50) {
        result.orphans.push({
          xRefNum, xAmount, xMaskedCardNumber: xMasked,
          xBillFirstName: xBillFirst, xBillLastName: xBillLast,
          xEmail, xInvoice,
          xDate: dateIso,
          xResult, xStatus,
        });
      }
      continue;
    }

    // Auto-record. Try to attribute to a known donor by email or billing-name.
    let donorId: string | null = null;
    if (xEmail) {
      const r = await db().execute({
        sql: `SELECT id FROM fr_donors WHERE owner_id = ? AND lower(email) = lower(?) LIMIT 1`,
        args: [session.ownerId, xEmail],
      });
      if (r.rows.length) donorId = String(r.rows[0].id);
    }
    if (!donorId && (xBillFirst || xBillLast)) {
      const r = await db().execute({
        sql: `SELECT id FROM fr_donors WHERE owner_id = ?
              AND lower(first_name) = lower(?) AND lower(COALESCE(last_name, '')) = lower(?)
              LIMIT 1`,
        args: [session.ownerId, xBillFirst || '', xBillLast || ''],
      });
      if (r.rows.length) donorId = String(r.rows[0].id);
    }
    if (!donorId) {
      // Create a placeholder donor for orphan attribution. Could be merged later by the user.
      donorId = crypto.randomUUID();
      const name = [xBillFirst, xBillLast].filter(Boolean).join(' ') || 'Unknown donor (Sola)';
      await db().execute({
        sql: `INSERT INTO fr_donors (id, owner_id, status, first_name, last_name, email, preferred_contact, notes, created_at, converted_at)
              VALUES (?, ?, 'donor', ?, ?, ?, 'phone', 'Auto-created from Sola sync — not linked to a pledge', datetime('now'), datetime('now'))`,
        args: [donorId, session.ownerId, xBillFirst || name, xBillLast || null, xEmail],
      });
    }

    // Create a one-off pledge + payment to hold the orphan transaction
    const pledgeId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const amount = Number(xAmount) || 0;
    if (amount <= 0) continue;

    await db().execute({
      sql: `INSERT INTO fr_pledges (id, owner_id, donor_id, amount, status, pledge_date, installments_total, payment_plan, notes)
            VALUES (?, ?, ?, ?, 'open', ?, 1, 'lump_sum', 'Synced from Sola portal — direct charge')`,
      args: [pledgeId, session.ownerId, donorId, amount, dateIso || new Date().toISOString().slice(0, 10)],
    });
    await db().execute({
      sql: `INSERT INTO fr_pledge_payments
              (id, pledge_id, donor_id, installment_number, method, amount, status,
               due_date, paid_date, transaction_ref, cc_last4, cc_holder, notes)
            VALUES (?, ?, ?, 1, 'credit_card', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        paymentId, pledgeId, donorId,
        amount, newStatus,
        dateIso, newStatus === 'paid' ? (dateIso || new Date().toISOString().slice(0, 10)) : null,
        xRefNum,
        ccLast4(xMasked),
        [xBillFirst, xBillLast].filter(Boolean).join(' ').trim() || null,
        'Synced from Sola portal',
      ],
    });
    await recomputePledgeStatus(pledgeId);
    await recomputeDonorTotals(donorId);
    result.payments_created++;
  }

  // Finalise log
  await db().execute({
    sql: `UPDATE fr_sola_sync_log
          SET finished_at = datetime('now'),
              transactions_seen = ?, payments_created = ?, payments_updated = ?
          WHERE id = ?`,
    args: [result.transactions_seen, result.payments_created, result.payments_updated, logId],
  });

  return NextResponse.json(result);
}

// Cardknox returns dates like "5/12/2026 11:58:00 AM" or "2026-05-12T11:58:00".
// Normalise to YYYY-MM-DD or null.
function parseCardknoxDate(s: string): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // M/D/YYYY (optionally with time)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
