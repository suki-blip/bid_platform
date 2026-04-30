import { HDate, HebrewCalendar, Locale } from '@hebcal/core';

export interface HebrewDateInfo {
  iso: string;
  gregorian: string;
  hebrew: string;
  hebrewEn: string;
  dayOfWeek: string;
  isShabbat: boolean;
  holidays: string[];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromGregorian(date: Date): HebrewDateInfo {
  const hd = new HDate(date);
  const iso = toIso(date);

  const events = HebrewCalendar.getHolidaysOnDate(hd) || [];
  const holidays = events.map((e) => e.render('en'));

  return {
    iso,
    gregorian: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    hebrew: hd.renderGematriya(),
    hebrewEn: hd.render('en'),
    dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
    isShabbat: date.getDay() === 6,
    holidays,
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
  hebrewMonth: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isShabbat: boolean;
  holidays: string[];
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
    days.push({
      iso,
      date: d.getDate(),
      hebrew: String(hd.getDate()),
      hebrewMonth: Locale.gettext(hd.getMonthName(), 'en'),
      isCurrentMonth: d.getMonth() === monthIndex0,
      isToday: iso === todayIso,
      isShabbat: d.getDay() === 6,
      holidays: events.map((e) => e.render('en')),
    });
  }
  return days;
}
