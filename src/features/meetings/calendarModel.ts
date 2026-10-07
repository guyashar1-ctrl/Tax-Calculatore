// ─── לשונית «יומן» — חישובי התצוגה (סבב 3, הדמיה מאושרת 07.10.2026) ──────────
// ‼ טהור: בלי React ובלי רשת. הכול בשעון ישראל, בלי קשר לשעון המכשיר.
// ‼ השבוע מתחיל ביום ראשון, ומוצג א׳–ו׳; שבת מופיעה רק כשיש בה אירוע.

import { utcToIsrael } from '../../../supabase/functions/_shared/meetingInvite';
import type { CalendarEvent } from '../../../supabase/functions/_shared/meetingCore';

const noon = (d: string) => Date.parse(`${d}T12:00:00Z`);

export function addDays(date: string, n: number): string {
  return new Date(noon(date) + n * 86400000).toISOString().slice(0, 10);
}

/** יום ראשון של השבוע שבו נמצא התאריך. */
export function weekStart(date: string): string {
  return addDays(date, -new Date(noon(date)).getUTCDay());
}

export function weekdayOf(date: string): number {
  return new Date(noon(date)).getUTCDay();
}

const HE_DAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const dayLetter = (date: string) => HE_DAY[weekdayOf(date)];
export const dayNumber = (date: string) => Number(date.slice(8, 10));

const month = (date: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', month: 'long' }).format(new Date(noon(date)));

/** «4–9 באוקטובר 2026», ובין חודשים «28 בספטמבר – 3 באוקטובר 2026». */
export function rangeLabel(days: string[]): string {
  if (days.length === 0) return '';
  const a = days[0], b = days[days.length - 1];
  const y = b.slice(0, 4);
  if (a === b) return `${dayNumber(a)} ב${month(a)} ${y}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${dayNumber(a)}–${dayNumber(b)} ב${month(b)} ${y}`;
  return `${dayNumber(a)} ב${month(a)} – ${dayNumber(b)} ב${month(b)} ${y}`;
}

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, '0');
export const toTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export interface Placed {
  ev: CalendarEvent;
  /** דקות מחצות, בשעון ישראל, ביום הזה (אירוע שחוצה חצות נחתך). */
  start: number;
  end: number;
  /** עמודה בתוך קבוצת אירועים חופפים, ומספר העמודות בקבוצה. */
  col: number;
  cols: number;
}

/**
 * אירועים חופפים זה לצד זה, כמו ב-Google: קבוצה = אירועים שנוגעים זה בזה ברצף; בכל קבוצה
 * כל אירוע מקבל את העמודה הראשונה שהתפנתה.
 */
export function layoutOverlaps(items: { ev: CalendarEvent; start: number; end: number }[]): Placed[] {
  const sorted = [...items].sort((x, y) => x.start - y.start || y.end - x.end);
  const out: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map(g => g.col + 1));
    for (const g of group) g.cols = cols;
    out.push(...group);
    group = [];
  };
  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) { flush(); groupEnd = -1; }
    const used = new Set(group.filter(g => g.end > it.start).map(g => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ...it, col, cols: 1 });
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

/** האירועים של כל יום: עם שעה (מסודרים לתצוגה) ויום שלם. */
export function eventsByDay(events: CalendarEvent[], days: string[]): Map<string, { timed: Placed[]; allDay: CalendarEvent[] }> {
  const map = new Map<string, { timed: Placed[]; allDay: CalendarEvent[] }>();
  for (const d of days) {
    const timed: { ev: CalendarEvent; start: number; end: number }[] = [];
    const allDay: CalendarEvent[] = [];
    for (const e of events) {
      if (e.allDay) {
        if (e.startDate && e.endDate && e.startDate <= d && d < e.endDate) allDay.push(e);
        continue;
      }
      if (!e.startsAt || !e.endsAt) continue;
      const s = utcToIsrael(e.startsAt), en = utcToIsrael(e.endsAt);
      if (s.date > d || en.date < d) continue;
      const start = s.date < d ? 0 : toMin(s.time);
      const end = en.date > d ? 24 * 60 : toMin(en.time);
      if (end <= start) continue;
      timed.push({ ev: e, start, end });
    }
    map.set(d, { timed: layoutOverlaps(timed), allDay });
  }
  return map;
}

/** הימים שמוצגים בשבוע: א׳–ו׳, ושבת רק כשיש בה אירוע. */
export function visibleDays(start: string, events: CalendarEvent[]): string[] {
  const days = Array.from({ length: 6 }, (_, i) => addDays(start, i));
  const sat = addDays(start, 6);
  const hasSat = eventsByDay(events, [sat]).get(sat)!;
  return hasSat.timed.length || hasSat.allDay.length ? [...days, sat] : days;
}

/** טווח השעות בתצוגה: 07:00–21:00, ומתרחב כשיש אירוע מוקדם או מאוחר יותר. */
export function hourRange(byDay: Map<string, { timed: Placed[] }>): { from: number; to: number } {
  let from = 7, to = 21;
  for (const { timed } of byDay.values()) {
    for (const p of timed) {
      from = Math.min(from, Math.floor(p.start / 60));
      to = Math.max(to, Math.ceil(p.end / 60));
    }
  }
  return { from, to: Math.min(24, to) };
}

/** לחיצה על גובה y בעמודת יום ⇒ שעה, ברבעי שעה (מעוגל למטה). */
export function timeAtY(y: number, hourPx: number, fromHour: number, toHour: number): string {
  const m = fromHour * 60 + Math.floor((y / hourPx) * 60 / 15) * 15;
  return toTime(Math.max(fromHour * 60, Math.min(toHour * 60 - 15, m)));
}

/** «עכשיו» בשעון ישראל — תאריך ודקות מחצות. */
export function israelNow(now: Date = new Date()): { date: string; minutes: number } {
  const { date, time } = utcToIsrael(now.toISOString());
  return { date, minutes: toMin(time) };
}

/** טווח השעות של אירוע להצגה — «10:00–10:45», או «כל היום». */
export function eventRange(e: CalendarEvent): string {
  if (e.allDay || !e.startsAt || !e.endsAt) return 'כל היום';
  return `${utcToIsrael(e.startsAt).time}–${utcToIsrael(e.endsAt).time}`;
}
