import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getFundraisingSession } from '@/lib/fundraising-session';

const KNOWN_FIELDS = [
  { key: 'first_name', label: 'First name', synonyms: ['first', 'firstname', 'first name', 'given name', 'fname'] },
  { key: 'last_name', label: 'Last name', synonyms: ['last', 'lastname', 'last name', 'surname', 'family name', 'lname'] },
  { key: 'hebrew_name', label: 'Hebrew name', synonyms: ['hebrew', 'hebrew name', 'jewish name', 'shem'] },
  { key: 'title', label: 'Title', synonyms: ['title', 'salutation', 'mr/mrs'] },
  { key: 'spouse_name', label: 'Spouse', synonyms: ['spouse', 'wife', 'husband', 'spouse name'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'phone', label: 'Phone', synonyms: ['phone', 'mobile', 'cell', 'telephone', 'phone number'] },
  { key: 'phone_home', label: 'Home phone', synonyms: ['home phone', 'home', 'home number'] },
  { key: 'phone_office', label: 'Office phone', synonyms: ['office phone', 'work phone', 'work', 'office'] },
  { key: 'organization', label: 'Organization', synonyms: ['organization', 'org', 'company', 'business', 'employer'] },
  { key: 'occupation', label: 'Occupation', synonyms: ['occupation', 'job', 'profession', 'role'] },
  { key: 'street', label: 'Street', synonyms: ['street', 'address', 'address line 1', 'street address', 'addr'] },
  { key: 'city', label: 'City', synonyms: ['city', 'town'] },
  { key: 'state', label: 'State', synonyms: ['state', 'province', 'region'] },
  { key: 'zip', label: 'Zip', synonyms: ['zip', 'zip code', 'postal code', 'postcode'] },
  { key: 'country', label: 'Country', synonyms: ['country'] },
  { key: 'birthday', label: 'Birthday', synonyms: ['birthday', 'birth date', 'dob', 'date of birth'] },
  { key: 'anniversary', label: 'Anniversary', synonyms: ['anniversary', 'wedding'] },
  { key: 'yahrzeit', label: 'Yahrzeit', synonyms: ['yahrzeit', 'yarzeit', 'yorzeit'] },
  { key: 'source', label: 'Source', synonyms: ['source', 'how heard', 'lead source', 'referral'] },
  { key: 'tags', label: 'Tags', synonyms: ['tags', 'categories', 'labels'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'comments', 'memo'] },
  { key: 'status', label: 'Status', synonyms: ['status', 'donor type', 'donor status'] },
  { key: 'skip', label: '— Skip column —', synonyms: [] },
];

function autoMatch(header: string): string {
  const norm = header.trim().toLowerCase();
  for (const f of KNOWN_FIELDS) {
    if (f.key === 'skip') continue;
    if (f.synonyms.some((s) => s === norm) || norm === f.key) return f.key;
  }
  // Loose match — contains
  for (const f of KNOWN_FIELDS) {
    if (f.key === 'skip') continue;
    if (f.synonyms.some((s) => norm.includes(s)) || norm.includes(f.key)) return f.key;
  }
  return 'skip';
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (10MB max)' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

  let workbook: XLSX.WorkBook;
  try {
    if (isCsv) {
      // CSV: decode as UTF-8 (strip BOM if present) and read as string so Hebrew/Unicode survive
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
  if (!sheetName) return NextResponse.json({ error: 'File contains no sheets' }, { status: 400 });
  const sheet = workbook.Sheets[sheetName];

  // Get rows as arrays so we can capture headers explicitly
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (rows.length === 0) return NextResponse.json({ error: 'Sheet is empty' }, { status: 400 });

  const headers = (rows[0] as unknown[]).map((h) => String(h || '').trim());
  if (headers.every((h) => !h)) {
    return NextResponse.json({ error: 'No headers found in first row' }, { status: 400 });
  }

  const dataRows = rows.slice(1).filter((r) => (r as unknown[]).some((c) => c !== '' && c !== null && c !== undefined));

  const mapping: Record<string, string> = {};
  for (const h of headers) {
    if (h) mapping[h] = autoMatch(h);
  }

  // Preview first 5 rows as objects
  const preview = dataRows.slice(0, 5).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = String((row as unknown[])[i] ?? '');
    });
    return obj;
  });

  return NextResponse.json({
    headers,
    mapping,
    preview,
    total_rows: dataRows.length,
    sheet_name: sheetName,
    available_fields: KNOWN_FIELDS,
  });
}
