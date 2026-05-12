import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { hebrewCoreKey, parseHebrewName } from '@/lib/hebrew-name';

// POST /api/fundraising/import/payments/preview
//
// Multipart body: `file` (xlsx/csv).
//
// Parses the workbook, attempts to match each row to an existing donor, and returns
// a preview the UI can show. No DB writes happen here — that's reserved for /commit.

interface ParsedRow {
  index: number; // 1-based row in the original sheet (for error messages)
  receipt: string;
  receipt_base: string; // strip trailing "-N" so installments group together
  installment_n: number | null;
  date_iso: string | null;
  raw_jewish_name: string;
  hebrew_core: string;
  amount: number | null;
  payment_type: string;
  ref: string;
  status: string;
  card_holder_name: string;
  source: string;
}

interface MatchInfo {
  donor_id: string | null;
  donor_label: string | null; // for UI: "Yossi Cohen · יוסי כהן"
  match_kind: 'hebrew' | 'english' | 'none';
  will_create: boolean; // true when match=none — UI shows preview + lets user confirm auto-create
}

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  // English headers from the Transaction_Payment_List export
  'reciept #': 'receipt',
  'receipt #': 'receipt',
  'receipt number': 'receipt',
  'payment date': 'date_iso',
  'date': 'date_iso',
  'donor jewish name': 'raw_jewish_name',
  'jewish name': 'raw_jewish_name',
  'hebrew name': 'raw_jewish_name',
  'amount': 'amount',
  'payment type': 'payment_type',
  'method': 'payment_type',
  'ref #': 'ref',
  'ref': 'ref',
  'reference': 'ref',
  'status': 'status',
  'schedule #': 'installment_n',
  'installment': 'installment_n',
  'card holder name': 'card_holder_name',
  'cardholder name': 'card_holder_name',
  'name on card': 'card_holder_name',
  'source': 'source',
};

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/[$,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // M/D/YY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const m = mdy[1].padStart(2, '0');
    const d = mdy[2].padStart(2, '0');
    let y = mdy[3];
    if (y.length === 2) y = '20' + y; // assume 21st century
    return `${y}-${m}-${d}`;
  }

  // Excel serial number
  const num = Number(s);
  if (!isNaN(num) && num > 25569 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  // Try generic Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseInstallment(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseReceiptBase(receipt: string): { base: string; installment: number | null } {
  const trimmed = receipt.trim();
  if (!trimmed) return { base: '', installment: null };
  // "8892-3" → base "8892", inst 3.  "9047" → base "9047", inst null.
  const m = trimmed.match(/^(.+?)-(\d+)$/);
  if (m) return { base: m[1], installment: Number(m[2]) };
  return { base: trimmed, installment: null };
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (10MB max)' }, { status: 400 });

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
    return NextResponse.json({ error: 'Could not parse file. Use .xlsx, .xls, or .csv' }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return NextResponse.json({ error: 'File has no sheets' }, { status: 400 });
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (rows.length < 2) return NextResponse.json({ error: 'Sheet has no data rows' }, { status: 400 });

  const headers = (rows[0] as unknown[]).map((h) => String(h || '').toLowerCase().trim());
  // Build column index → field key
  const colToField: Record<number, keyof ParsedRow> = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key) colToField[i] = key;
  });

  if (!Object.values(colToField).includes('raw_jewish_name') || !Object.values(colToField).includes('amount')) {
    return NextResponse.json({
      error: 'Missing required columns. Need at least "Donor Jewish Name" (or similar) and "Amount".',
      headers_seen: rows[0],
    }, { status: 400 });
  }

  // ----- Parse data rows -----
  const parsed: ParsedRow[] = [];
  const dataRows = rows.slice(1);
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r] as unknown[];
    if (row.every((c) => c === '' || c == null)) continue;

    const p: ParsedRow = {
      index: r + 2,
      receipt: '',
      receipt_base: '',
      installment_n: null,
      date_iso: null,
      raw_jewish_name: '',
      hebrew_core: '',
      amount: null,
      payment_type: '',
      ref: '',
      status: '',
      card_holder_name: '',
      source: '',
    };

    for (const [colIdx, field] of Object.entries(colToField)) {
      const v = row[Number(colIdx)];
      switch (field) {
        case 'receipt':
          p.receipt = String(v ?? '').trim();
          break;
        case 'date_iso':
          p.date_iso = parseDate(v);
          break;
        case 'raw_jewish_name':
          p.raw_jewish_name = String(v ?? '').trim();
          break;
        case 'amount':
          p.amount = parseAmount(v);
          break;
        case 'payment_type':
          p.payment_type = String(v ?? '').trim();
          break;
        case 'ref':
          p.ref = String(v ?? '').trim();
          break;
        case 'status':
          p.status = String(v ?? '').trim();
          break;
        case 'installment_n':
          p.installment_n = parseInstallment(v);
          break;
        case 'card_holder_name':
          p.card_holder_name = String(v ?? '').trim();
          break;
        case 'source':
          p.source = String(v ?? '').trim();
          break;
      }
    }

    const r2 = parseReceiptBase(p.receipt);
    p.receipt_base = r2.base;
    if (p.installment_n == null) p.installment_n = r2.installment;
    p.hebrew_core = hebrewCoreKey(p.raw_jewish_name);

    parsed.push(p);
  }

  // ----- Load all donors for this owner so we can match in-memory -----
  const donorsRes = await db().execute({
    sql: `SELECT id, first_name, last_name, hebrew_name, hebrew_first_name, hebrew_last_name
          FROM fr_donors WHERE owner_id = ?`,
    args: [session.ownerId],
  });

  // Build two indexes:
  //   hebrewIndex[core] → donorId
  //   englishIndex[firstlast lowercased] → donorId
  const hebrewIndex = new Map<string, string>();
  const englishIndex = new Map<string, string>();
  const donorById = new Map<string, { firstName: string; lastName: string; hebrew: string }>();

  for (const row of donorsRes.rows) {
    const id = String(row.id);
    const firstName = String(row.first_name || '');
    const lastName = String(row.last_name || '');
    const hebrew = String(row.hebrew_name || '');
    const hebrewFirst = String(row.hebrew_first_name || '');
    const hebrewLast = String(row.hebrew_last_name || '');

    donorById.set(id, { firstName, lastName, hebrew });

    // Hebrew core from the legacy combined field
    if (hebrew) {
      const k = hebrewCoreKey(hebrew);
      if (k && !hebrewIndex.has(k)) hebrewIndex.set(k, id);
    }
    // Hebrew core from structured first+last
    if (hebrewFirst || hebrewLast) {
      const combined = `${hebrewFirst} ${hebrewLast}`.trim();
      const k = hebrewCoreKey(combined);
      if (k && !hebrewIndex.has(k)) hebrewIndex.set(k, id);
    }
    // English: normalize "First Last" → key
    if (firstName || lastName) {
      const k = `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, ' ');
      if (k && !englishIndex.has(k)) englishIndex.set(k, id);
    }
  }

  // ----- Match each row -----
  const matches: MatchInfo[] = parsed.map((p) => {
    // Try Hebrew core match first
    if (p.hebrew_core && hebrewIndex.has(p.hebrew_core)) {
      const id = hebrewIndex.get(p.hebrew_core)!;
      const d = donorById.get(id)!;
      return {
        donor_id: id,
        donor_label: `${d.firstName} ${d.lastName}`.trim() + (d.hebrew ? ` · ${d.hebrew}` : ''),
        match_kind: 'hebrew',
        will_create: false,
      };
    }
    // Then try English name match against Card Holder Name
    if (p.card_holder_name) {
      const k = p.card_holder_name.toLowerCase().replace(/\s+/g, ' ').trim();
      if (englishIndex.has(k)) {
        const id = englishIndex.get(k)!;
        const d = donorById.get(id)!;
        return {
          donor_id: id,
          donor_label: `${d.firstName} ${d.lastName}`.trim() + (d.hebrew ? ` · ${d.hebrew}` : ''),
          match_kind: 'english',
          will_create: false,
        };
      }
    }
    return { donor_id: null, donor_label: null, match_kind: 'none', will_create: true };
  });

  // Summary
  const matchedCount = matches.filter((m) => m.donor_id).length;
  const toCreateCount = matches.filter((m) => m.will_create).length;
  const distinctNewDonors = new Set(
    parsed
      .map((p, i) => (matches[i].will_create ? p.hebrew_core || p.raw_jewish_name : null))
      .filter((k): k is string => !!k),
  );

  return NextResponse.json({
    sheet_name: sheetName,
    total_rows: parsed.length,
    matched_count: matchedCount,
    new_donor_rows: toCreateCount,
    distinct_new_donors: distinctNewDonors.size,
    rows: parsed.map((p, i) => ({
      ...p,
      match: matches[i],
      // Helpful preview: what we'd save if committed
      parsed_titles: parseHebrewName(p.raw_jewish_name),
    })),
  });
}
