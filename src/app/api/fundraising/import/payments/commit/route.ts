import { NextResponse } from 'next/server';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { hebrewCoreKey, parseHebrewName } from '@/lib/hebrew-name';
import { promoteDonorIfNeeded, recomputeDonorTotals, recomputePledgeStatus } from '@/lib/fundraising-totals';

// POST /api/fundraising/import/payments/commit
//
// Multipart body:
//   file              — the same workbook the user previewed
//   default_project_id (optional) — tag every imported pledge to this project
//   auto_create       — "1" to create donors for unmatched rows, "0" to skip them
//
// Pipeline:
//   1. Parse rows (same logic as /preview but kept in-process so we don't re-upload)
//   2. Group rows by receipt_base — each group becomes ONE pledge with N payments
//   3. For each group:
//        a. Match or create the donor
//        b. Create the pledge with status='open', amount = sum of payment rows
//        c. Insert each payment row (paid/scheduled per status column)
//   4. Recompute pledge_status + donor totals
//
// Returns: { created_donors, created_pledges, created_payments, skipped, errors[] }

const HEADER_MAP: Record<string, string> = {
  'reciept #': 'receipt',
  'receipt #': 'receipt',
  'receipt number': 'receipt',
  'payment date': 'date',
  'date': 'date',
  'donor jewish name': 'jewish_name',
  'jewish name': 'jewish_name',
  'hebrew name': 'jewish_name',
  'amount': 'amount',
  'payment type': 'payment_type',
  'method': 'payment_type',
  'ref #': 'ref',
  'ref': 'ref',
  'reference': 'ref',
  'status': 'status',
  'schedule #': 'installment_n',
  'installment': 'installment_n',
  'card holder name': 'card_holder',
  'cardholder name': 'card_holder',
  'name on card': 'card_holder',
  'source': 'source',
};

interface PaymentRow {
  index: number;
  receipt: string;
  receipt_base: string;
  installment_n: number | null;
  date: string | null; // ISO yyyy-mm-dd
  jewish_name: string;
  hebrew_core: string;
  amount: number | null;
  payment_type: string;
  ref: string;
  status: string;
  card_holder: string;
  source: string;
}

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/[$,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const m = mdy[1].padStart(2, '0');
    const d = mdy[2].padStart(2, '0');
    let y = mdy[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }
  const num = Number(s);
  if (!isNaN(num) && num > 25569 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
function parseInstallment(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}
function parseReceiptBase(receipt: string): { base: string; inst: number | null } {
  const trimmed = receipt.trim();
  if (!trimmed) return { base: '', inst: null };
  const m = trimmed.match(/^(.+?)-(\d+)$/);
  if (m) return { base: m[1], inst: Number(m[2]) };
  return { base: trimmed, inst: null };
}

// Map the source-system Payment Type column → our PAYMENT_METHODS enum
function detectMethod(type: string, ref: string): string {
  const t = type.toLowerCase().trim();
  const r = ref.toLowerCase().trim();

  const explicit: Record<string, string> = {
    'credit card': 'credit_card',
    'creditcard': 'credit_card',
    cc: 'credit_card',
    check: 'check',
    'check cash': 'check_cash',
    cash: 'cash',
    wire: 'wire',
    ach: 'ach',
    'ojc check': 'ojc_check',
    'ojc online': 'ojc_online',
    'ojc credit card': 'ojc_credit_card',
    'ojc creditcard': 'ojc_credit_card',
    'ojc cc': 'ojc_credit_card',
    ojc: 'ojc_check',
    pledger: 'pledger',
    matbia: 'matbia',
    'quick pay': 'quick_pay',
    quickpay: 'quick_pay',
    'donors fund': 'donors_fund',
  };
  if (explicit[t]) return explicit[t];

  // Type "Other" — examine the ref for a service hint
  if (t === 'other' || !t) {
    if (r.includes('ojc online')) return 'ojc_online';
    if (r.includes('ojc credit') || r.includes('ojc cc')) return 'ojc_credit_card';
    if (r.includes('ojc')) return 'ojc_check';
    if (r.includes('pledger')) return 'pledger';
    if (r.includes('matbia')) return 'matbia';
    if (r.includes('quick pay') || r.includes('quickpay')) return 'quick_pay';
    if (r.includes('donors fund')) return 'donors_fund';
    if (r.includes('cc') || r.includes('credit')) return 'credit_card';
  }
  // Default fallback
  return 'credit_card';
}

// Map status column → our PAYMENT_STATUSES enum
function detectStatus(s: string): string {
  const v = s.toLowerCase().trim();
  if (!v || v === 'success' || v === 'successful' || v === 'paid' || v === 'completed') return 'paid';
  if (v === 'pending' || v === 'scheduled') return 'scheduled';
  if (v === 'failed' || v === 'declined') return 'failed';
  if (v === 'bounced' || v === 'returned') return 'bounced';
  if (v === 'cancelled' || v === 'canceled' || v === 'void' || v === 'refunded') return 'cancelled';
  return 'paid';
}

// Pull CC last 4 digits out of refs like "Master-1960" / "Visa-4217". Returns null if not a CC ref.
function extractCcLast4(ref: string): string | null {
  const m = ref.match(/-(\d{4})$/);
  if (m) return m[1];
  return null;
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const defaultProjectId = (formData.get('default_project_id') as string) || '';
  const autoCreate = (formData.get('auto_create') as string) === '1';

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

  let workbook: XLSX.WorkBook;
  try {
    if (isCsv) {
      let text = buf.toString('utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      workbook = XLSX.read(text, { type: 'string', raw: false });
    } else {
      workbook = XLSX.read(buf, { type: 'buffer', raw: false });
    }
  } catch {
    return NextResponse.json({ error: 'Could not parse file' }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (rows.length < 2) return NextResponse.json({ error: 'No data rows' }, { status: 400 });

  const headers = (rows[0] as unknown[]).map((h) => String(h || '').toLowerCase().trim());
  const colToField: Record<number, string> = {};
  headers.forEach((h, i) => {
    if (HEADER_MAP[h]) colToField[i] = HEADER_MAP[h];
  });

  // ----- Parse all rows -----
  const parsed: PaymentRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (row.every((c) => c === '' || c == null)) continue;

    const p: PaymentRow = {
      index: r + 1,
      receipt: '',
      receipt_base: '',
      installment_n: null,
      date: null,
      jewish_name: '',
      hebrew_core: '',
      amount: null,
      payment_type: '',
      ref: '',
      status: '',
      card_holder: '',
      source: '',
    };
    for (const [colIdx, field] of Object.entries(colToField)) {
      const v = row[Number(colIdx)];
      switch (field) {
        case 'receipt': p.receipt = String(v ?? '').trim(); break;
        case 'date': p.date = parseDate(v); break;
        case 'jewish_name': p.jewish_name = String(v ?? '').trim(); break;
        case 'amount': p.amount = parseAmount(v); break;
        case 'payment_type': p.payment_type = String(v ?? '').trim(); break;
        case 'ref': p.ref = String(v ?? '').trim(); break;
        case 'status': p.status = String(v ?? '').trim(); break;
        case 'installment_n': p.installment_n = parseInstallment(v); break;
        case 'card_holder': p.card_holder = String(v ?? '').trim(); break;
        case 'source': p.source = String(v ?? '').trim(); break;
      }
    }
    const rb = parseReceiptBase(p.receipt);
    p.receipt_base = rb.base;
    if (p.installment_n == null) p.installment_n = rb.inst;
    p.hebrew_core = hebrewCoreKey(p.jewish_name);
    parsed.push(p);
  }

  // ----- Build donor indexes -----
  const donorsRes = await db().execute({
    sql: `SELECT id, first_name, last_name, hebrew_name, hebrew_first_name, hebrew_last_name
          FROM fr_donors WHERE owner_id = ?`,
    args: [session.ownerId],
  });
  const hebrewIndex = new Map<string, string>();
  const englishIndex = new Map<string, string>();
  for (const row of donorsRes.rows) {
    const id = String(row.id);
    const hebrew = String(row.hebrew_name || '');
    const hebrewFirst = String(row.hebrew_first_name || '');
    const hebrewLast = String(row.hebrew_last_name || '');
    const firstName = String(row.first_name || '');
    const lastName = String(row.last_name || '');
    if (hebrew) {
      const k = hebrewCoreKey(hebrew);
      if (k && !hebrewIndex.has(k)) hebrewIndex.set(k, id);
    }
    if (hebrewFirst || hebrewLast) {
      const k = hebrewCoreKey(`${hebrewFirst} ${hebrewLast}`);
      if (k && !hebrewIndex.has(k)) hebrewIndex.set(k, id);
    }
    if (firstName || lastName) {
      const k = `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, ' ');
      if (k && !englishIndex.has(k)) englishIndex.set(k, id);
    }
  }

  // ----- Group rows by receipt_base (each group → one pledge) -----
  const groups = new Map<string, PaymentRow[]>();
  for (const p of parsed) {
    // Group key: receipt_base if present, otherwise hebrew_core to bucket loose rows by donor
    const key = p.receipt_base || `loose:${p.hebrew_core || p.jewish_name}`;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  }

  // ----- Process each group -----
  const errors: { row: number; reason: string }[] = [];
  let createdDonors = 0;
  let createdPledges = 0;
  let createdPayments = 0;
  let skipped = 0;

  for (const [, rowsInGroup] of groups) {
    // Resolve donor for this group — use the first row's name (they should all be same person)
    const first = rowsInGroup[0];
    if (!first.jewish_name && !first.card_holder) {
      for (const r of rowsInGroup) errors.push({ row: r.index, reason: 'No donor name provided' });
      skipped += rowsInGroup.length;
      continue;
    }

    let donorId: string | null = null;
    if (first.hebrew_core && hebrewIndex.has(first.hebrew_core)) {
      donorId = hebrewIndex.get(first.hebrew_core)!;
    } else if (first.card_holder) {
      const ek = first.card_holder.toLowerCase().replace(/\s+/g, ' ').trim();
      if (englishIndex.has(ek)) donorId = englishIndex.get(ek)!;
    }

    if (!donorId) {
      if (!autoCreate) {
        for (const r of rowsInGroup) errors.push({ row: r.index, reason: 'Donor not found and auto-create disabled' });
        skipped += rowsInGroup.length;
        continue;
      }
      // Auto-create the donor.
      donorId = crypto.randomUUID();
      const parsed = parseHebrewName(first.jewish_name);
      const englishFirst = first.card_holder.split(/\s+/)[0] || '(Unknown)';
      const englishLast = first.card_holder.split(/\s+/).slice(1).join(' ') || null;

      try {
        await db().execute({
          sql: `INSERT INTO fr_donors
                  (id, owner_id, status, first_name, last_name,
                   hebrew_name, hebrew_title, hebrew_suffix_title,
                   notes, preferred_contact, do_not_contact, created_at, created_by, converted_at)
                VALUES (?, ?, 'donor', ?, ?, ?, ?, ?, ?, 'phone', 0, datetime('now'), ?, datetime('now'))`,
          args: [
            donorId,
            session.ownerId,
            englishFirst,
            englishLast,
            first.jewish_name || null,
            parsed.prefix || null,
            parsed.suffix || null,
            `Auto-created from payments import (${first.source || 'imported'})`,
            session.actorId,
          ],
        });
        createdDonors++;
        // Cache so subsequent groups with the same name find this donor
        if (first.hebrew_core) hebrewIndex.set(first.hebrew_core, donorId);
      } catch (e) {
        for (const r of rowsInGroup) errors.push({ row: r.index, reason: `Failed to create donor: ${(e as Error).message}` });
        skipped += rowsInGroup.length;
        continue;
      }
    }

    // Compute pledge amount = sum of valid row amounts
    const totalAmount = rowsInGroup.reduce((acc, r) => acc + (r.amount || 0), 0);
    if (totalAmount <= 0) {
      for (const r of rowsInGroup) errors.push({ row: r.index, reason: 'Pledge amount is zero or all rows missing amount' });
      skipped += rowsInGroup.length;
      continue;
    }

    // Earliest date in the group is the pledge_date
    const dates = rowsInGroup.map((r) => r.date).filter((d): d is string => !!d).sort();
    const pledgeDate = dates[0] || new Date().toISOString().slice(0, 10);

    const pledgeId = crypto.randomUUID();
    try {
      await db().execute({
        sql: `INSERT INTO fr_pledges
                (id, owner_id, donor_id, project_id, fundraiser_id, amount, status, pledge_date,
                 installments_total, payment_plan, notes)
              VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        args: [
          pledgeId,
          session.ownerId,
          donorId,
          defaultProjectId || null,
          session.fundraiserId,
          totalAmount,
          pledgeDate,
          rowsInGroup.length,
          rowsInGroup.length === 1 ? 'lump_sum' : 'custom',
          `Imported from payments file (${first.source || 'unknown source'})`,
        ],
      });
      createdPledges++;
    } catch (e) {
      for (const r of rowsInGroup) errors.push({ row: r.index, reason: `Failed to create pledge: ${(e as Error).message}` });
      skipped += rowsInGroup.length;
      continue;
    }

    // Sort by installment_n so payment.installment_number reads sensibly
    rowsInGroup.sort((a, b) => (a.installment_n || 0) - (b.installment_n || 0));

    for (let i = 0; i < rowsInGroup.length; i++) {
      const p = rowsInGroup[i];
      if (!p.amount || p.amount <= 0) {
        errors.push({ row: p.index, reason: 'Missing amount' });
        skipped++;
        continue;
      }
      const method = detectMethod(p.payment_type, p.ref);
      const status = detectStatus(p.status);
      const isCheckLike = method === 'check' || method === 'check_cash' || method === 'ojc_check';
      const checkNum = isCheckLike && p.ref && p.ref !== '0000' ? p.ref : null;
      const ccLast4 = method === 'credit_card' ? extractCcLast4(p.ref) : null;
      // Anything not parsed into a structured field goes into transaction_ref so it's visible.
      const txnRef = !isCheckLike && !ccLast4 && p.ref ? p.ref : null;

      const notes = [
        p.source ? `Source: ${p.source}` : null,
        p.receipt ? `Receipt: ${p.receipt}` : null,
      ].filter(Boolean).join(' · ') || null;

      try {
        await db().execute({
          sql: `INSERT INTO fr_pledge_payments
                  (id, pledge_id, donor_id, project_id, installment_number, method, amount, status,
                   due_date, paid_date, check_number, cc_last4, cc_holder, transaction_ref, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            crypto.randomUUID(),
            pledgeId,
            donorId,
            defaultProjectId || null,
            p.installment_n || i + 1,
            method,
            p.amount,
            status,
            p.date || null,
            status === 'paid' ? p.date : null,
            checkNum,
            ccLast4,
            method === 'credit_card' ? (p.card_holder || null) : null,
            txnRef,
            notes,
          ],
        });
        createdPayments++;
      } catch (e) {
        errors.push({ row: p.index, reason: `Payment insert failed: ${(e as Error).message}` });
        skipped++;
      }
    }

    // Recompute totals for this pledge + donor. Also promote prospect → donor: a bulk
    // import of historical payments is one of the most common ways people first populate
    // their donor list, so leads with imported payments should auto-flip to active donors.
    try {
      await recomputePledgeStatus(pledgeId);
      await promoteDonorIfNeeded(donorId);
      await recomputeDonorTotals(donorId);
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({
    created_donors: createdDonors,
    created_pledges: createdPledges,
    created_payments: createdPayments,
    skipped,
    errors: errors.slice(0, 50),
    total_groups: groups.size,
  });
}
