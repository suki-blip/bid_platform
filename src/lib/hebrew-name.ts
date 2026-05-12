// Hebrew name parsing and matching utilities.
//
// Excel exports from frum/yeshiva-world systems typically encode a donor's name with
// honorifics inline, e.g.:
//   "מו"ה חנני' דוב בוכינגער הי"ו"
//   "ר' יצחק ראכליץ"
//   "הערשל וויינבערגער הי"ו"
//
// To match these against existing donor rows in fr_donors (which may store the
// pieces separately or just have hebrew_name), we need to:
//   1. Strip the prefix and suffix titles
//   2. Normalize whitespace and quotes (so "מו"ה" and "מו״ה" collide)
//   3. Compare core names

// Common Hebrew prefix titles. The matcher checks each variant at the START of the name.
const PREFIX_TITLES = [
  'מוה',     // also matches "מו'ה", "מו\"ה", "מו״ה"
  'הרב',
  'מרן',
  'הגאון',
  'הראב"ד',
  'הר"ר',
  'הרר',
  'מרת',
  'ר',       // matches "ר'" and "ר׳"
  'הב\'',    // sometimes used
];

// Common Hebrew suffix titles — checked at the END of the name.
const SUFFIX_TITLES = [
  'שליטא',  // also שליט"א, שליט״א
  'זצל',    // also זצ"ל, זצ״ל
  'זל',     // ז"ל
  'עה',     // ע"ה
  'היו',    // הי"ו
  'ני',     // נ"י (matches as standalone too)
  'הכהן',
  'הלוי',
  'הישראלי',
  'שיחי',   // שיחי'
];

/**
 * Normalize a Hebrew string for comparison:
 *   - Replace any quote variant (", ', ״, ׳, `) with a unified marker, then drop them
 *   - Collapse whitespace
 *   - Trim
 *
 * "מו\"ה" → "מוה"
 * "ר'"   → "ר"
 * "שליט\"א" → "שליטא"
 */
export function normalizeHebrew(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/[״׳"'`]/g, '') // strip every kind of quote
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip leading prefix titles + trailing suffix titles from a Hebrew name.
 * Returns { prefix, core, suffix } — `core` is the bare name suitable for matching.
 */
export function parseHebrewName(raw: string | null | undefined): {
  raw: string;
  prefix: string | null;
  core: string;
  suffix: string | null;
} {
  const rawTrimmed = String(raw || '').trim();
  if (!rawTrimmed) return { raw: '', prefix: null, core: '', suffix: null };

  // Work on a normalized copy (quote-stripped) so suffix/prefix detection isn't
  // confused by ״ vs " vs ' variants. But also keep the original tokens.
  const normalized = normalizeHebrew(rawTrimmed);
  const tokens = normalized.split(/\s+/);

  let prefix: string | null = null;
  let suffix: string | null = null;
  const coreTokens = [...tokens];

  // Try to detect a prefix — single-token check on the first word
  if (coreTokens.length > 0) {
    const first = coreTokens[0];
    if (PREFIX_TITLES.includes(first)) {
      prefix = first;
      coreTokens.shift();
    }
  }

  // Try to detect a suffix — single-token check on the last word
  if (coreTokens.length > 0) {
    const last = coreTokens[coreTokens.length - 1];
    if (SUFFIX_TITLES.includes(last)) {
      suffix = last;
      coreTokens.pop();
    }
  }

  return {
    raw: rawTrimmed,
    prefix,
    core: coreTokens.join(' ').trim(),
    suffix,
  };
}

/**
 * Compare two Hebrew names for likely-same-person. Strips titles, normalizes quotes,
 * then compares the core. Empty core never matches anything.
 */
export function hebrewNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = parseHebrewName(a).core;
  const cb = parseHebrewName(b).core;
  if (!ca || !cb) return false;
  return ca === cb;
}

/**
 * Build a search key for indexing donors. Always returns the normalized core
 * (no titles, no quotes) so an Excel row can probe `coreKey(rowName) → donor.id`.
 */
export function hebrewCoreKey(s: string | null | undefined): string {
  return parseHebrewName(s).core;
}
