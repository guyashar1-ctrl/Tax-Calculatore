// ─── «היום שלך ביומן» — פס של היום שנבחר, בתוך חלון הפגישה (הדמיה מאושרת 07.10.2026) ───
// ‼ מה שתפוס ביומן Google באותו יום (כולל אירועים שאינם מ-PIVO), המועד שנבחר, ובדיקת
//   התנגשות. לחיצה על מקום בפס בוחרת שעה (ברבעי שעה). הציר משמאל לימין, כמו השעות עצמן.
// ‼ אירוע «פנוי» ב-Google (transparent) מוצג בהיר ואינו התנגשות; הפגישה שמזיזים — לא «תפוסה».

import { utcToIsrael, addMinutes } from '../../../supabase/functions/_shared/meetingInvite';
import type { CalendarEvent } from '../../../supabase/functions/_shared/meetingCore';

const START = 7 * 60;
const END = 21 * 60;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export interface DaySlot { title: string; start: string; end: string; busy: boolean; pivo: boolean }

/** האירועים של יום אחד, בשעות ישראל. ‼ אירוע שחוצה חצות נחתך ליום הזה. */
export function slotsOfDay(events: CalendarEvent[], date: string, skipMeetingId?: string): { timed: DaySlot[]; allDay: string[] } {
  const timed: DaySlot[] = [];
  const allDay: string[] = [];
  for (const e of events) {
    if (skipMeetingId && e.meetingId === skipMeetingId) continue;
    if (e.allDay) {
      if (e.startDate && e.endDate && e.startDate <= date && date < e.endDate) allDay.push(e.title);
      continue;
    }
    if (!e.startsAt || !e.endsAt) continue;
    const s = utcToIsrael(e.startsAt), en = utcToIsrael(e.endsAt);
    if (s.date > date || en.date < date) continue;
    const start = s.date < date ? '00:00' : s.time;
    const end = en.date > date ? '24:00' : en.time;
    if (end <= start) continue;
    timed.push({ title: e.title, start, end, busy: e.busy, pivo: !!e.meetingId });
  }
  timed.sort((a, b) => a.start.localeCompare(b.start));
  return { timed, allDay };
}

/** מה מתנגש במועד שנבחר — רק אירועים שתופסים זמן. */
export function clashesWith(slots: DaySlot[], time: string, durationMin: number): DaySlot[] {
  const end = addMinutes(time, durationMin);
  const endM = end < time ? 24 * 60 : toMin(end);
  return slots.filter(s => s.busy && toMin(s.start) < endM && toMin(time) < (s.end === '24:00' ? 24 * 60 : toMin(s.end)));
}

const pct = (m: number) => `${((Math.min(END, Math.max(START, m)) - START) / (END - START)) * 100}%`;

export default function DayStrip({ slots, time, durationMin, onPick, disabled }: {
  slots: DaySlot[];
  time: string;
  durationMin: number;
  onPick: (time: string) => void;
  disabled?: boolean;
}) {
  const t = toMin(time);
  const hours = [8, 11, 14, 17, 20];
  return (
    <div className="mt-strip-wrap">
      <div className={`mt-strip${disabled ? ' is-off' : ''}`} dir="ltr" role="group" aria-label="היום שלך ביומן — לחיצה בוחרת שעה"
        onClick={e => {
          if (disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          const m = START + Math.floor(((e.clientX - r.left) / r.width) * (END - START) / 15) * 15;
          onPick(toTime(Math.max(START, Math.min(END - 15, m))));
        }}>
        {hours.map(h => <span key={h} className="mt-strip-tick" style={{ left: pct(h * 60) }} aria-hidden="true" />)}
        {slots.filter(s => toMin(s.end === '24:00' ? '23:59' : s.end) > START && toMin(s.start) < END).map((s, i) => (
          <span key={i} className={`mt-strip-ev${s.busy ? '' : ' is-free'}${s.pivo ? ' is-pivo' : ''}`}
            style={{ left: pct(toMin(s.start)), width: `calc(${pct(s.end === '24:00' ? END : toMin(s.end))} - ${pct(toMin(s.start))})` }}
            title={`${s.title} · ${s.start}–${s.end}`}>
            <span className="mt-strip-ev-t">{s.title}</span>
          </span>
        ))}
        <span className="mt-strip-pick" style={{ left: pct(t), width: `calc(${pct(t + durationMin)} - ${pct(t)})` }} aria-hidden="true" />
      </div>
      <div className="mt-strip-axis" dir="ltr" aria-hidden="true">
        {hours.map(h => <span key={h} style={{ left: pct(h * 60) }}>{pad(h)}:00</span>)}
      </div>
    </div>
  );
}
