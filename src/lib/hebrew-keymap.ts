// Maps a US-English physical key to the Hebrew character it produces on the
// standard Israeli (SI 1452) Hebrew keyboard layout.
//
// This lets a user type Hebrew in our forms even when their OS keyboard is set
// to English: we transliterate the Latin keystrokes by *layout position*.
//
// Example: pressing the 'a' key on an English-mode keyboard would type 'a',
// but on a Hebrew-mode keyboard the same physical key types 'ש'. So when the
// user types 'a' in a HebrewInput, we substitute 'ש'.
//
// Final-form Hebrew letters (sofiyot) live on their own keys — same as on the
// physical Israeli keyboard:
//   l → ך  (final kaf)
//   o → ם  (final mem)
//   i → ן  (final nun)
//   ; → ף  (final pe)
//   . → ץ  (final tsade)

export const EN_KEY_TO_HE: Record<string, string> = {
  // Top row punctuation
  '`': ';',
  // Numbers row stays the same.
  // QWERTY row
  q: '/',
  w: "'",
  e: 'ק',
  r: 'ר',
  t: 'א',
  y: 'ט',
  u: 'ו',
  i: 'ן',
  o: 'ם',
  p: 'פ',
  // ASDF row
  a: 'ש',
  s: 'ד',
  d: 'ג',
  f: 'כ',
  g: 'ע',
  h: 'י',
  j: 'ח',
  k: 'ל',
  l: 'ך',
  ';': 'ף',
  "'": ',',
  // ZXCV row
  z: 'ז',
  x: 'ס',
  c: 'ב',
  v: 'ה',
  b: 'נ',
  n: 'מ',
  m: 'צ',
  ',': 'ת',
  '.': 'ץ',
  '/': '.',
};

/**
 * Convert a single character. Latin letters get lowercased before lookup
 * (Hebrew has no case). Hebrew characters, digits, whitespace, and anything
 * not in the map pass through unchanged — so typing real Hebrew, numbers,
 * spaces, "@", etc. still works.
 */
export function transliterateChar(ch: string): string {
  if (!ch) return ch;
  // Only transform if the character is in our map. Lookup is case-insensitive.
  const lower = ch.toLowerCase();
  const mapped = EN_KEY_TO_HE[lower];
  return mapped !== undefined ? mapped : ch;
}

/**
 * Convert a full string. Useful for paste handlers — converts every
 * Latin-keyboard char in one pass. Hebrew chars survive intact.
 */
export function transliterateToHebrew(s: string): string {
  if (!s) return s;
  let out = '';
  for (const ch of s) out += transliterateChar(ch);
  return out;
}

/**
 * Heuristic: does the string look like it contains characters we'd want to
 * transliterate? (Has Latin letters or our mapped punctuation.) Hebrew-only
 * strings return false — no work needed.
 */
export function looksLikeWrongLayout(s: string): boolean {
  if (!s) return false;
  return /[A-Za-z;'`,./\\[\]]/.test(s);
}
