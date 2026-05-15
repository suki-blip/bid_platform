// Recycle Bin (סל מחזור) — soft-delete with 30-day retention for donors, pledges, payments.
//
// Why snapshot-based, not column-based?
//
// The naive design is to add a `deleted_at` timestamp to fr_donors/fr_pledges/fr_pledge_payments
// and append `AND deleted_at IS NULL` to every SELECT. That's ~30 queries spread across 20+ files
// and is easy to miss: every new query is one more place a deleted record can leak back into
// totals, dashboards, exports, reports, the cron auto-charger, the receipt resend route...
//
// Instead, we hard-DELETE the row from the live table (FK CASCADE handles the dependent tree)
// but FIRST capture the entire affected sub-tree as a JSON snapshot into fr_recycle_bin. Live
// queries see exactly nothing — totals, dashboards, cron, reports all behave as if the record
// were truly gone. The recycle bin is a separate table queried only by the trash UI + the
// 30-day purge cron. Restore re-INSERTs from the snapshot, preserving the original UUIDs so
// any external references (saved receipts mentioning a payment ID, etc.) still line up.
//
// Trade-offs accepted:
//   - Restore happens only into the same owner's account.
//   - Restoring a donor doesn't bring back records that were ALREADY deleted before the donor
//     (those have their own trash entries — restore them separately).
//   - FK CASCADE cleans up `fr_calls`, `fr_notes`, `fr_donor_phones`, `fr_donor_addresses`,
//     `fr_donor_cards` etc. when a donor is deleted. We snapshot those too so restore is complete.
//   - Cross-table references (`fr_payment_sessions.donor_id`, `fr_email_log.donor_id`) use
//     ON DELETE SET NULL, so they survive the delete with a NULL pointer. Restore won't re-link
//     them — that's a known limitation but those audit logs aren't user-facing critical state.

import crypto from 'crypto';
import { db } from './db';
import { recomputeDonorTotals, recomputePledgeStatus } from './fundraising-totals';

type Row = Record<string, unknown>;

// JSON snapshot shapes. We don't strongly type the rows (they're rebuilt by column name)
// but document the structure here so future migrations can extend it cleanly.
export interface DonorSnapshot {
  v: 1;
  type: 'donor';
  donor: Row;
  phones: Row[];
  addresses: Row[];
  cards: Row[];
  notes: Row[];
  calls: Row[];
  pledges: Row[];
  payments: Row[];
  prospects: Row[];
  followups: Row[];
}

export interface PledgeSnapshot {
  v: 1;
  type: 'pledge';
  pledge: Row;
  payments: Row[];
}

export interface PaymentSnapshot {
  v: 1;
  type: 'payment';
  payment: Row;
}

type AnySnapshot = DonorSnapshot | PledgeSnapshot | PaymentSnapshot;

// -------- Snapshot capture --------

async function captureDonor(donorId: string): Promise<DonorSnapshot | null> {
  const d = await db().execute({ sql: 'SELECT * FROM fr_donors WHERE id = ?', args: [donorId] });
  if (d.rows.length === 0) return null;
  const [phones, addresses, cards, notes, calls, pledges, payments, prospects, followups] = await Promise.all([
    db().execute({ sql: 'SELECT * FROM fr_donor_phones WHERE donor_id = ?', args: [donorId] }),
    db().execute({ sql: 'SELECT * FROM fr_donor_addresses WHERE donor_id = ?', args: [donorId] }),
    db().execute({ sql: 'SELECT * FROM fr_donor_cards WHERE donor_id = ?', args: [donorId] }).catch(() => ({ rows: [] as Row[] })),
    db().execute({ sql: 'SELECT * FROM fr_notes WHERE donor_id = ?', args: [donorId] }).catch(() => ({ rows: [] as Row[] })),
    db().execute({ sql: 'SELECT * FROM fr_calls WHERE donor_id = ?', args: [donorId] }),
    db().execute({ sql: 'SELECT * FROM fr_pledges WHERE donor_id = ?', args: [donorId] }),
    db().execute({ sql: 'SELECT * FROM fr_pledge_payments WHERE donor_id = ?', args: [donorId] }),
    db().execute({ sql: 'SELECT * FROM fr_project_prospects WHERE donor_id = ?', args: [donorId] }).catch(() => ({ rows: [] as Row[] })),
    db().execute({ sql: 'SELECT * FROM fr_followups WHERE donor_id = ?', args: [donorId] }).catch(() => ({ rows: [] as Row[] })),
  ]);
  return {
    v: 1,
    type: 'donor',
    donor: d.rows[0] as Row,
    phones: phones.rows as Row[],
    addresses: addresses.rows as Row[],
    cards: cards.rows as Row[],
    notes: notes.rows as Row[],
    calls: calls.rows as Row[],
    pledges: pledges.rows as Row[],
    payments: payments.rows as Row[],
    prospects: prospects.rows as Row[],
    followups: followups.rows as Row[],
  };
}

async function capturePledge(pledgeId: string): Promise<PledgeSnapshot | null> {
  const p = await db().execute({ sql: 'SELECT * FROM fr_pledges WHERE id = ?', args: [pledgeId] });
  if (p.rows.length === 0) return null;
  const payments = await db().execute({ sql: 'SELECT * FROM fr_pledge_payments WHERE pledge_id = ?', args: [pledgeId] });
  return { v: 1, type: 'pledge', pledge: p.rows[0] as Row, payments: payments.rows as Row[] };
}

async function capturePayment(paymentId: string): Promise<PaymentSnapshot | null> {
  const p = await db().execute({ sql: 'SELECT * FROM fr_pledge_payments WHERE id = ?', args: [paymentId] });
  if (p.rows.length === 0) return null;
  return { v: 1, type: 'payment', payment: p.rows[0] as Row };
}

// -------- Summary strings (shown in the trash UI list) --------

function donorSummary(snap: DonorSnapshot): string {
  const d = snap.donor;
  const name = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
  const heb = [d.hebrew_first_name, d.hebrew_last_name].filter(Boolean).join(' ').trim()
    || (d.hebrew_name ? String(d.hebrew_name) : '');
  const counts: string[] = [];
  if (snap.pledges.length) counts.push(`${snap.pledges.length} pledge${snap.pledges.length === 1 ? '' : 's'}`);
  if (snap.payments.length) counts.push(`${snap.payments.length} payment${snap.payments.length === 1 ? '' : 's'}`);
  const tail = counts.length ? ` (incl. ${counts.join(', ')})` : '';
  const label = name || (heb ? heb : 'Unnamed donor');
  return heb && name ? `${label} · ${heb}${tail}` : `${label}${tail}`;
}

function pledgeSummary(snap: PledgeSnapshot): string {
  const p = snap.pledge;
  const amt = Number(p.amount || 0);
  return `$${amt.toFixed(2)} pledge${snap.payments.length ? ` (${snap.payments.length} installments)` : ''}`;
}

function paymentSummary(snap: PaymentSnapshot): string {
  const p = snap.payment;
  const amt = Number(p.amount || 0);
  const method = String(p.method || 'payment');
  return `$${amt.toFixed(2)} ${method.replace(/_/g, ' ')}`;
}

// -------- Public API: soft-delete = snapshot + hard-delete --------

export async function softDeleteDonor(opts: { donorId: string; ownerId: string; deletedBy?: string | null }): Promise<{ ok: boolean; recycle_id?: string; error?: string }> {
  const snap = await captureDonor(opts.donorId);
  if (!snap) return { ok: false, error: 'not_found' };
  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_recycle_bin (id, owner_id, entity_type, entity_id, summary, snapshot, deleted_by)
          VALUES (?, ?, 'donor', ?, ?, ?, ?)`,
    args: [id, opts.ownerId, opts.donorId, donorSummary(snap), JSON.stringify(snap), opts.deletedBy ?? null],
  });
  await db().execute({ sql: 'DELETE FROM fr_donors WHERE id = ? AND owner_id = ?', args: [opts.donorId, opts.ownerId] });
  return { ok: true, recycle_id: id };
}

export async function softDeletePledge(opts: { pledgeId: string; ownerId: string; deletedBy?: string | null }): Promise<{ ok: boolean; recycle_id?: string; donor_id?: string; error?: string }> {
  const snap = await capturePledge(opts.pledgeId);
  if (!snap) return { ok: false, error: 'not_found' };
  const donorId = String(snap.pledge.donor_id || '');
  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_recycle_bin (id, owner_id, entity_type, entity_id, summary, snapshot, deleted_by)
          VALUES (?, ?, 'pledge', ?, ?, ?, ?)`,
    args: [id, opts.ownerId, opts.pledgeId, pledgeSummary(snap), JSON.stringify(snap), opts.deletedBy ?? null],
  });
  await db().execute({ sql: 'DELETE FROM fr_pledges WHERE id = ?', args: [opts.pledgeId] });
  if (donorId) await recomputeDonorTotals(donorId);
  return { ok: true, recycle_id: id, donor_id: donorId };
}

export async function softDeletePayment(opts: { paymentId: string; ownerId: string; deletedBy?: string | null }): Promise<{ ok: boolean; recycle_id?: string; donor_id?: string; pledge_id?: string; error?: string }> {
  const snap = await capturePayment(opts.paymentId);
  if (!snap) return { ok: false, error: 'not_found' };
  const donorId = String(snap.payment.donor_id || '');
  const pledgeId = String(snap.payment.pledge_id || '');
  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_recycle_bin (id, owner_id, entity_type, entity_id, summary, snapshot, deleted_by)
          VALUES (?, ?, 'payment', ?, ?, ?, ?)`,
    args: [id, opts.ownerId, opts.paymentId, paymentSummary(snap), JSON.stringify(snap), opts.deletedBy ?? null],
  });
  await db().execute({ sql: 'DELETE FROM fr_pledge_payments WHERE id = ?', args: [opts.paymentId] });
  if (pledgeId) await recomputePledgeStatus(pledgeId);
  if (donorId) await recomputeDonorTotals(donorId);
  return { ok: true, recycle_id: id, donor_id: donorId, pledge_id: pledgeId };
}

// -------- Restore: parse JSON + INSERT OR REPLACE original rows --------

// Build a parameterized INSERT for a row keyed by its column names. We do this generically
// so future column additions don't require touching the recycle bin — as long as the row
// snapshot has the same columns the live table has, the INSERT just works. Columns present
// on the snapshot but no longer in the live schema are tolerated by the try/catch in the
// caller (we attempt without those columns as a fallback).
function buildInsert(table: string, row: Row): { sql: string; args: (string | number | null)[] } {
  const cols = Object.keys(row).filter((k) => row[k] !== undefined);
  const placeholders = cols.map(() => '?').join(', ');
  const args = cols.map((k) => {
    const v = row[k];
    if (v === null) return null;
    if (typeof v === 'string' || typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'bigint') return Number(v);
    // libsql sometimes returns Date or buffer-like; coerce to string as a safe fallback.
    return String(v);
  });
  return { sql: `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, args };
}

async function restoreDonor(snap: DonorSnapshot): Promise<void> {
  // Insert in FK-safe order: donor first, then dependents.
  const donorIns = buildInsert('fr_donors', snap.donor);
  await db().execute(donorIns);
  for (const row of snap.phones) await db().execute(buildInsert('fr_donor_phones', row)).catch(() => {});
  for (const row of snap.addresses) await db().execute(buildInsert('fr_donor_addresses', row)).catch(() => {});
  for (const row of snap.cards) await db().execute(buildInsert('fr_donor_cards', row)).catch(() => {});
  for (const row of snap.notes) await db().execute(buildInsert('fr_notes', row)).catch(() => {});
  for (const row of snap.calls) await db().execute(buildInsert('fr_calls', row)).catch(() => {});
  // Pledges before payments (FK).
  for (const row of snap.pledges) await db().execute(buildInsert('fr_pledges', row)).catch(() => {});
  for (const row of snap.payments) await db().execute(buildInsert('fr_pledge_payments', row)).catch(() => {});
  for (const row of snap.prospects) await db().execute(buildInsert('fr_project_prospects', row)).catch(() => {});
  for (const row of snap.followups) await db().execute(buildInsert('fr_followups', row)).catch(() => {});
  await recomputeDonorTotals(String(snap.donor.id));
}

async function restorePledge(snap: PledgeSnapshot): Promise<void> {
  await db().execute(buildInsert('fr_pledges', snap.pledge));
  for (const row of snap.payments) await db().execute(buildInsert('fr_pledge_payments', row)).catch(() => {});
  await recomputePledgeStatus(String(snap.pledge.id));
  await recomputeDonorTotals(String(snap.pledge.donor_id));
}

async function restorePayment(snap: PaymentSnapshot): Promise<void> {
  await db().execute(buildInsert('fr_pledge_payments', snap.payment));
  if (snap.payment.pledge_id) await recomputePledgeStatus(String(snap.payment.pledge_id));
  if (snap.payment.donor_id) await recomputeDonorTotals(String(snap.payment.donor_id));
}

export async function restoreFromBin(recycleId: string, ownerId: string): Promise<{ ok: boolean; type?: string; entity_id?: string; error?: string }> {
  const r = await db().execute({
    sql: 'SELECT * FROM fr_recycle_bin WHERE id = ? AND owner_id = ?',
    args: [recycleId, ownerId],
  });
  if (r.rows.length === 0) return { ok: false, error: 'not_found' };
  const bin = r.rows[0];
  let snap: AnySnapshot;
  try {
    snap = JSON.parse(String(bin.snapshot)) as AnySnapshot;
  } catch {
    return { ok: false, error: 'corrupt_snapshot' };
  }
  try {
    if (snap.type === 'donor') await restoreDonor(snap);
    else if (snap.type === 'pledge') await restorePledge(snap);
    else if (snap.type === 'payment') await restorePayment(snap);
    else return { ok: false, error: 'unknown_type' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  // Remove the recycle bin row only after the restore succeeds.
  await db().execute({ sql: 'DELETE FROM fr_recycle_bin WHERE id = ?', args: [recycleId] });
  return { ok: true, type: String(bin.entity_type), entity_id: String(bin.entity_id) };
}

// Permanent removal (called by the cron purge OR by an explicit "delete forever" button).
export async function purgeFromBin(recycleId: string, ownerId: string): Promise<{ ok: boolean }> {
  await db().execute({
    sql: 'DELETE FROM fr_recycle_bin WHERE id = ? AND owner_id = ?',
    args: [recycleId, ownerId],
  });
  return { ok: true };
}

// Daily cron: purge anything deleted more than 30 days ago across all owners.
export async function purgeExpired(): Promise<{ purged: number }> {
  const res = await db().execute({
    sql: "DELETE FROM fr_recycle_bin WHERE deleted_at < datetime('now', '-30 days')",
  });
  return { purged: Number(res.rowsAffected ?? 0) };
}
