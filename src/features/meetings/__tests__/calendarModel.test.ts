// ─── בדיקות: לשונית «יומן» — שבוע, חפיפות, ושעון ישראל (סבב 3) ─────────────
// ‼ מה נעול כאן: השבוע מתחיל בראשון ומוצג א׳–ו׳ (שבת רק כשיש בה אירוע); אירועים חופפים
//   זה לצד זה; אירוע שחוצה חצות נחתך לכל יום; לחיצה בגובה העמודה ⇒ רבע שעה; כותרת הטווח.

import { test, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  addDays, weekStart, rangeLabel, layoutOverlaps, eventsByDay, visibleDays, hourRange, timeAtY,
} from '../calendarModel';
import type { CalendarEvent } from '../../../../supabase/functions/_shared/meetingCore';

const ev = (id: string, o: Partial<CalendarEvent>): CalendarEvent => ({
  id, title: id, allDay: false, startsAt: null, endsAt: null, startDate: null, endDate: null, busy: true, meetingId: null, htmlLink: null, ...o,
});

export const TESTS: TestCase[] = [
  test('שבוע: מתחיל ביום ראשון', () => {
    equal(weekStart('2026-10-07'), '2026-10-04');
    equal(weekStart('2026-10-04'), '2026-10-04');
    equal(weekStart('2026-10-10'), '2026-10-04');
    equal(addDays('2026-10-31', 1), '2026-11-01');
  }),
  test('כותרת הטווח: בתוך חודש, בין חודשים, ויום אחד', () => {
    equal(rangeLabel(['2026-10-04', '2026-10-09']), '4–9 באוקטובר 2026');
    equal(rangeLabel(['2026-09-27', '2026-10-02']), '27 בספטמבר – 2 באוקטובר 2026');
    equal(rangeLabel(['2026-10-07']), '7 באוקטובר 2026');
  }),
  test('חפיפות: שני אירועים חופפים זה לצד זה; שלישי אחריהם — רוחב מלא', () => {
    const out = layoutOverlaps([
      { ev: ev('a', {}), start: 540, end: 600 },
      { ev: ev('b', {}), start: 570, end: 630 },
      { ev: ev('c', {}), start: 660, end: 700 },
    ]);
    deepEqual(out.map(p => [p.ev.id, p.col, p.cols]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
  }),
  test('חפיפות: עמודה שהתפנתה חוזרת לשימוש', () => {
    const out = layoutOverlaps([
      { ev: ev('a', {}), start: 540, end: 660 },
      { ev: ev('b', {}), start: 540, end: 570 },
      { ev: ev('c', {}), start: 600, end: 630 },
    ]);
    deepEqual(out.map(p => [p.ev.id, p.col, p.cols]), [['a', 0, 2], ['b', 1, 2], ['c', 1, 2]]);
  }),
  test('ימים: אירוע שחוצה חצות נחתך; יום שלם בנפרד; שעון ישראל', () => {
    const m = eventsByDay([
      ev('late', { startsAt: '2026-10-07T20:00:00Z', endsAt: '2026-10-07T22:00:00Z' }),
      ev('vat', { allDay: true, startDate: '2026-10-08', endDate: '2026-10-09' }),
    ], ['2026-10-07', '2026-10-08']);
    deepEqual(m.get('2026-10-07')!.timed.map(p => [p.start, p.end]), [[23 * 60, 24 * 60]]);
    deepEqual(m.get('2026-10-08')!.timed.map(p => [p.start, p.end]), [[0, 60]]);
    deepEqual(m.get('2026-10-08')!.allDay.map(e => e.id), ['vat']);
  }),
  test('שבת מוצגת רק כשיש בה אירוע', () => {
    equal(visibleDays('2026-10-04', []).length, 6);
    equal(visibleDays('2026-10-04', [ev('s', { startsAt: '2026-10-10T07:00:00Z', endsAt: '2026-10-10T08:00:00Z' })]).length, 7);
  }),
  test('טווח השעות: 07–21, ומתרחב לאירוע מוקדם או מאוחר', () => {
    deepEqual(hourRange(eventsByDay([], ['2026-10-07'])), { from: 7, to: 21 });
    deepEqual(hourRange(eventsByDay([ev('e', { startsAt: '2026-10-07T03:30:00Z', endsAt: '2026-10-07T04:00:00Z' })], ['2026-10-07'])), { from: 6, to: 21 });
  }),
  test('לחיצה בגובה העמודה ⇒ שעה ברבעי שעה, בתוך הטווח', () => {
    equal(timeAtY(0, 48, 7, 21), '07:00');
    equal(timeAtY(48 * 4 + 20, 48, 7, 21), '11:15');
    equal(timeAtY(48 * 20, 48, 7, 21), '20:45');
  }),
];
