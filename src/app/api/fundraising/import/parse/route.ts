import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getFundraisingSession } from '@/lib/fundraising-session';

// Every field a donor record can hold gets a row here. Synonyms cover English variants
// AND Hebrew column headers so users can keep their spreadsheets in Hebrew without
// re-labeling. Auto-match runs case-insensitively and supports both exact and "contains".
const KNOWN_FIELDS = [
  // --- Names (English) ---
  {
    key: 'first_name',
    label: 'First name',
    synonyms: ['first', 'firstname', 'first name', 'given name', 'fname', 'שם פרטי', 'שם'],
  },
  {
    key: 'last_name',
    label: 'Last name',
    synonyms: ['last', 'lastname', 'last name', 'surname', 'family name', 'lname', 'שם משפחה', 'משפחה'],
  },

  // --- Names (Hebrew) ---
  {
    key: 'hebrew_first_name',
    label: 'שם פרטי בעברית (Hebrew first name)',
    synonyms: ['hebrew first', 'hebrew first name', 'שם פרטי בעברית', 'שם פרטי עברית'],
  },
  {
    key: 'hebrew_last_name',
    label: 'שם משפחה בעברית (Hebrew last name)',
    synonyms: ['hebrew last', 'hebrew last name', 'hebrew surname', 'שם משפחה בעברית', 'משפחה בעברית', 'משפחה עברית'],
  },
  {
    key: 'hebrew_father_name',
    label: 'שם האב (Father\'s Hebrew name)',
    synonyms: ["father's name", "father", 'father name', 'av', 'שם האב', 'שם אבא', 'בן', 'אבא'],
  },
  {
    key: 'hebrew_name',
    label: 'Hebrew name (full / legacy)',
    synonyms: ['hebrew', 'hebrew name', 'jewish name', 'shem', 'שם בעברית', 'שם עברי', 'שם מלא בעברית', 'שם עברי מלא'],
  },

  { key: 'title', label: 'Title', synonyms: ['title', 'salutation', 'mr/mrs', 'תואר', 'כבוד'] },
  { key: 'spouse_name', label: 'Spouse', synonyms: ['spouse', 'wife', 'husband', 'spouse name', 'בן זוג', 'בת זוג', 'אישה', 'בעל'] },

  { key: 'email', label: 'Email', synonyms: ['email', 'e-mail', 'email address', 'mail', 'מייל', 'אימייל', 'דואל', 'דואר אלקטרוני'] },

  // --- Phones (each label gets its own column so the importer can fan them out) ---
  {
    key: 'phone',
    label: 'Phone (mobile / primary)',
    synonyms: ['phone', 'mobile', 'cell', 'telephone', 'phone number', 'cell phone', 'טלפון', 'נייד', 'סלולרי', 'פלאפון'],
  },
  {
    key: 'phone_home',
    label: 'Home phone',
    synonyms: ['home phone', 'home', 'home number', 'house phone', 'טלפון בית', 'בית'],
  },
  {
    key: 'phone_office',
    label: 'Office phone',
    synonyms: ['office phone', 'work phone', 'work', 'office', 'business phone', 'טלפון עבודה', 'טלפון משרד', 'משרד', 'עבודה'],
  },
  {
    key: 'phone_mother',
    label: 'Mother\'s phone (טלפון אמא)',
    synonyms: ["mother's phone", 'mother phone', 'mother', 'mom', 'mums phone', 'טלפון של האמא', 'טלפון אמא', 'אמא'],
  },
  {
    key: 'phone_father',
    label: 'Father\'s phone (טלפון אבא)',
    synonyms: ["father's phone", 'father phone', 'dad', 'dads phone', 'טלפון של האבא', 'טלפון אבא'],
  },
  {
    key: 'phone_spouse',
    label: 'Spouse\'s phone (טלפון בן/בת זוג)',
    synonyms: ["spouse's phone", 'spouse phone', 'wife phone', 'husband phone', 'טלפון בן זוג', 'טלפון בת זוג', 'טלפון אישה', 'טלפון בעל'],
  },

  { key: 'organization', label: 'Organization', synonyms: ['organization', 'org', 'company', 'business', 'employer', 'חברה', 'ארגון', 'מקום עבודה', 'עסק'] },
  { key: 'occupation', label: 'Occupation', synonyms: ['occupation', 'job', 'profession', 'role', 'מקצוע', 'תפקיד', 'עיסוק'] },

  // --- Address ---
  { key: 'street', label: 'Street', synonyms: ['street', 'address', 'address line 1', 'street address', 'addr', 'רחוב', 'כתובת'] },
  { key: 'city', label: 'City', synonyms: ['city', 'town', 'עיר', 'יישוב'] },
  { key: 'state', label: 'State / region', synonyms: ['state', 'province', 'region', 'מדינה', 'אזור'] },
  { key: 'zip', label: 'Zip', synonyms: ['zip', 'zip code', 'postal code', 'postcode', 'מיקוד'] },
  { key: 'country', label: 'Country', synonyms: ['country', 'ארץ', 'מדינה'] },

  // --- Dates ---
  { key: 'birthday', label: 'Birthday', synonyms: ['birthday', 'birth date', 'dob', 'date of birth', 'יום הולדת', 'תאריך לידה', 'לידה'] },
  { key: 'anniversary', label: 'Anniversary', synonyms: ['anniversary', 'wedding', 'יום נישואין', 'נישואין'] },
  { key: 'yahrzeit', label: 'Yahrzeit', synonyms: ['yahrzeit', 'yarzeit', 'yorzeit', 'יארצייט', 'יורצייט', 'אזכרה'] },

  // --- Misc ---
  { key: 'source', label: 'Source', synonyms: ['source', 'how heard', 'lead source', 'referral', 'מקור', 'הופנה על ידי'] },
  { key: 'source_notes', label: 'Source notes', synonyms: ['source notes', 'referral notes', 'how did you hear', 'הערות מקור'] },
  { key: 'preferred_contact', label: 'Preferred contact', synonyms: ['preferred contact', 'contact method', 'preferred method', 'אופן יצירת קשר', 'דרך קשר'] },
  { key: 'do_not_contact', label: 'Do not contact', synonyms: ['do not contact', 'dnc', 'no contact', 'opt out', 'אין ליצור קשר', 'לא ליצור קשר'] },
  { key: 'tags', label: 'Tags', synonyms: ['tags', 'categories', 'labels', 'תגיות', 'תוויות'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'comments', 'memo', 'הערות', 'הערה'] },
  { key: 'status', label: 'Status', synonyms: ['status', 'donor type', 'donor status', 'סטטוס', 'סוג תורם'] },

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
