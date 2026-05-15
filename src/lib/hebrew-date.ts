import { HDate, HebrewCalendar, Locale } from '@hebcal/core';

export interface HebrewDateInfo {
  iso: string;
  gregorian: string;
  hebrew: string;
  hebrewEn: string;
  dayOfWeek: string;
  isShabbat: boolean;
  // Holiday names rendered in Hebrew (primary — shown in the UI).
  holidays: string[];
  // Holiday names rendered in English (kept for tooltips / accessibility / search).
  holidaysEn: string[];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Try to render a holiday/event in Hebrew. `@hebcal/core` exposes a 'he' locale; some
// events fall back to English if no Hebrew string is available, which is fine — we still
// keep the English version in `holidaysEn` for tooltips.
function renderHe(e: { render: (locale: string) => string; renderBrief?: (locale: string) => string }): string {
  try {
    const s = e.render('he');
    if (s) return s;
  } catch {}
  try {
    return e.renderBrief?.('he') || e.render('en');
  } catch {
    return e.render('en');
  }
}

export function fromGregorian(date: Date): HebrewDateInfo {
  const hd = new HDate(date);
  const iso = toIso(date);

  const events = HebrewCalendar.getHolidaysOnDate(hd) || [];
  const holidaysEn = events.map((e) => e.render('en'));
  const holidays = events.map((e) => renderHe(e));

  return {
    iso,
    gregorian: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    hebrew: hd.renderGematriya(),
    hebrewEn: hd.render('en'),
    dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
    isShabbat: date.getDay() === 6,
    holidays,
    holidaysEn,
  };
}

export function fromIso(iso: string): HebrewDateInfo {
  const [y, m, d] = iso.split('-').map(Number);
  return fromGregorian(new Date(y, (m || 1) - 1, d || 1));
}

export interface CalendarDay {
  iso: string;
  date: number;
  hebrew: string;
  hebrewMonth: string;            // Hebrew month name in Hebrew letters (תשרי, חשון, ...)
  hebrewMonthEn: string;          // English transliteration kept for sort/grouping logic
  isCurrentMonth: boolean;
  isToday: boolean;
  isShabbat: boolean;
  holidays: string[];             // Holiday names in Hebrew (display)
  holidaysEn: string[];           // English versions (tooltips / search)
}

// Hebrew month name helper. `@hebcal/core`'s built-in 'he' locale gives Hebrew letters
// for months; English is kept as a fallback (and on the field for sorting needs).
function hebrewMonthName(monthName: string): string {
  try {
    const he = Locale.gettext(monthName, 'he');
    if (he && he !== monthName) return he;
  } catch {}
  return monthName; // already English
}

export function buildMonthGrid(year: number, monthIndex0: number, todayIso: string): CalendarDay[] {
  const first = new Date(year, monthIndex0, 1);
  const startDay = first.getDay();
  const gridStart = new Date(year, monthIndex0, 1 - startDay);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const hd = new HDate(d);
    const events = HebrewCalendar.getHolidaysOnDate(hd) || [];
    const iso = toIso(d);
    const monthEn = Locale.gettext(hd.getMonthName(), 'en');
    days.push({
      iso,
      date: d.getDate(),
      hebrew: String(hd.getDate()),
      hebrewMonth: hebrewMonthName(hd.getMonthName()),
      hebrewMonthEn: monthEn,
      isCurrentMonth: d.getMonth() === monthIndex0,
      isToday: iso === todayIso,
      isShabbat: d.getDay() === 6,
      holidays: events.map((e) => renderHe(e)),
      holidaysEn: events.map((e) => e.render('en')),
    });
  }
  return days;
}
