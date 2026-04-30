import { NextResponse } from 'next/server';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

interface ImportStmt {
  sql: string;
  args: (string | number | null)[];
}

function safe(v: unknown): string {
  return String(v ?? '').trim();
}

function isoDate(v: unknown): string | null {
  const s = safe(v);
  if (!s) return null;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Excel serial number?
  const num = Number(s);
  if (!isNaN(num) && num > 25569) {
    // Excel epoch starts 1900-01-01
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  // Try to parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const mappingJson = formData.get('mapping') as string | null;
  const defaultStatus = (formData.get('default_status') as string) || 'prospect';
  const defaultSourceId = (formData.get('default_source_id') as string) || '';

  if (!file || !mappingJson) {
    return NextResponse.json({ error: 'File and mapping required' }, { status: 400 });
  }

  const mapping: Record<string, string> = JSON.parse(mappingJson);
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
  const headers = (rows[0] as unknown[]).map((h) => String(h || '').trim());
  const dataRows = rows.slice(1).filter((r) => (r as unknown[]).some((c) => c !== '' && c !== null && c !== undefined));

  // Build a header→field map
  const headerToField: Record<number, string> = {};
  headers.forEach((h, i) => {
    if (h && mapping[h] && mapping[h] !== 'skip') headerToField[i] = mapping[h];
  });

  // Resolve / create sources by name
  const sourceCache: Record<string, string> = {};
  const existingSources = await db().execute({
    sql: 'SELECT id, name FROM fr_sources WHERE owner_id = ?',
    args: [session.ownerId],
  });
  for (const s of existingSources.rows) {
    sourceCache[String(s.name).toLowerCase()] = String(s.id);
  }

  let created = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r] as unknown[];
    const fieldsObj: Record<string, string> = {};
    for (const [idx, fieldKey] of Object.entries(headerToField)) {
      fieldsObj[fieldKey] = safe(row[Number(idx)]);
    }

    if (!fieldsObj.first_name && !fieldsObj.last_name) {
      skipped++;
      errors.push({ row: r + 2, reason: 'Missing first and last name' });
      continue;
    }

    // Source — match by name or create
    let sourceId: string | null = defaultSourceId || null;
    if (fieldsObj.source) {
      const key = fieldsObj.source.toLowerCase();
      if (sourceCache[key]) {
        sourceId = sourceCache[key];
      } else {
        const newSourceId = crypto.randomUUID();
        await db().execute({
          sql: 'INSERT INTO fr_sources (id, owner_id, name) VALUES (?, ?, ?)',
          args: [newSourceId, session.ownerId, fieldsObj.source],
        });
        sourceCache[key] = newSourceId;
        sourceId = newSourceId;
      }
    }

    const donorId = crypto.randomUUID();
    const status = fieldsObj.status?.toLowerCase().includes('donor') ? 'donor' : defaultStatus === 'donor' ? 'donor' : 'prospect';
    const tags = fieldsObj.tags ? fieldsObj.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : [];

    const stmts: ImportStmt[] = [
      {
        sql: `INSERT INTO fr_donors
                (id, owner_id, status, first_name, last_name, hebrew_name, title, spouse_name,
                 email, organization, occupation, birthday, anniversary, yahrzeit, tags, source_id, notes, preferred_contact)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'phone')`,
        args: [
          donorId,
          session.ownerId,
          status,
          fieldsObj.first_name || '(Unknown)',
          fieldsObj.last_name || null,
          fieldsObj.hebrew_name || null,
          fieldsObj.title || null,
          fieldsObj.spouse_name || null,
          fieldsObj.email || null,
          fieldsObj.organization || null,
          fieldsObj.occupation || null,
          isoDate(fieldsObj.birthday),
          isoDate(fieldsObj.anniversary),
          fieldsObj.yahrzeit || null,
          JSON.stringify(tags),
          sourceId,
          fieldsObj.notes || null,
        ],
      },
    ];

    let phoneOrder = 0;
    if (fieldsObj.phone) {
      stmts.push({
        sql: 'INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
        args: [crypto.randomUUID(), donorId, 'mobile', fieldsObj.phone, phoneOrder++],
      });
    }
    if (fieldsObj.phone_home) {
      stmts.push({
        sql: `INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, 'home', ?, ?, ?)`,
        args: [crypto.randomUUID(), donorId, fieldsObj.phone_home, phoneOrder === 0 ? 1 : 0, phoneOrder++],
      });
    }
    if (fieldsObj.phone_office) {
      stmts.push({
        sql: `INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, 'office', ?, ?, ?)`,
        args: [crypto.randomUUID(), donorId, fieldsObj.phone_office, phoneOrder === 0 ? 1 : 0, phoneOrder++],
      });
    }

    const hasAddress = fieldsObj.street || fieldsObj.city || fieldsObj.state || fieldsObj.zip || fieldsObj.country;
    if (hasAddress) {
      stmts.push({
        sql: `INSERT INTO fr_donor_addresses
                (id, donor_id, label, street, city, state, zip, country, is_primary, sort_order)
              VALUES (?, ?, 'home', ?, ?, ?, ?, ?, 1, 0)`,
        args: [
          crypto.randomUUID(),
          donorId,
          fieldsObj.street || null,
          fieldsObj.city || null,
          fieldsObj.state || null,
          fieldsObj.zip || null,
          fieldsObj.country || null,
        ],
      });
    }

    try {
      await db().batch(stmts, 'write');
      created++;
    } catch (e) {
      skipped++;
      errors.push({ row: r + 2, reason: (e as Error).message || 'DB error' });
    }
  }

  return NextResponse.json({ created, skipped, errors: errors.slice(0, 20), total: dataRows.length });
}
