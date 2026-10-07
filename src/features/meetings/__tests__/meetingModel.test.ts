// ─── בדיקות: הצגת פגישות במסך ───────────────────────────────────────────────
// ‼ מה נעול כאן:
//   · טווח השעות ברמז/בשבב עטוף בבידוד שמאל-לימין — אחרת בשורה עברית «10:30–10:00».
//   · «פגישות קרובות» — רק מה שעוד לא נגמר, ורק מה שביומן (או «לא ידוע»), לפי מועד.
//   · רמז לרשימת האנשים — הפגישה הקרובה, גם ללקוח וגם לליד.
//   · שגיאות מהשרת בעברית, עם מה עושים; «לא ידוע» אומר שליחה חוזרת בטוחה.
//   · «היום» / «מחר» לפי שעון ישראל.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  meetingWhen, upcomingMeetings, meetingCueByPerson, meetingErrorText, dayHeading, historyTitle, type Meeting,
} from '../meetingModel';
import { nextWorkday } from '../MeetingDialog';

const NOW = new Date('2026-10-07T09:00:00Z'); // 12:00 בישראל

function mk(id: string, startsAt: string, extra: Partial<Meeting> = {}): Meeting {
  return { id, kind: 'intro', startsAt, durationMin: 30, guests: [], title: '', description: '', status: 'scheduled', history: [], ...extra };
}

export const TESTS: TestCase[] = [
  test('מועד: בשעון ישראל, וטווח השעות מבודד', () => {
    const w = meetingWhen({ startsAt: '2026-10-08T07:00:00Z', durationMin: 30 });
    equal(w.date, '2026-10-08');
    equal(w.time, '10:00');
    assert(w.label.includes('⁦10:00–10:30⁩'), `בידוד: ${w.label}`);
  }),
  test('קרובות: בלי שעברו, בלי מבוטלות/שנכשלו, «לא ידוע» כן, לפי מועד', () => {
    const list = [
      mk('later', '2026-10-09T07:00:00Z'),
      mk('past', '2026-10-06T07:00:00Z'),
      mk('now', '2026-10-07T08:45:00Z'), // התחילה ב-11:45 ועוד לא נגמרה
      mk('canceled', '2026-10-08T07:00:00Z', { status: 'canceled' }),
      mk('failed', '2026-10-08T07:00:00Z', { status: 'failed' }),
      mk('unknown', '2026-10-08T08:00:00Z', { status: 'unknown' }),
    ];
    deepEqual(upcomingMeetings(list, NOW).map(m => m.id), ['now', 'unknown', 'later']);
  }),
  test('רמז ברשימת האנשים: הפגישה הקרובה ללקוח ולליד', () => {
    const cues = meetingCueByPerson([
      mk('b', '2026-10-09T07:00:00Z', { clientId: 'c1', kind: 'work' }),
      mk('a', '2026-10-08T07:00:00Z', { clientId: 'c1', kind: 'work' }),
      mk('c', '2026-10-08T09:00:00Z', { leadId: 'l1' }),
    ], NOW);
    assert(cues.get('c1')!.startsWith('פגישה · יום ה׳'), `לקוח: ${cues.get('c1')}`);
    assert(cues.get('l1')!.startsWith('שיחת היכרות · '), `ליד: ${cues.get('l1')}`);
  }),
  test('שגיאות: לא מחובר / לא ידוע / שדה עבר', () => {
    assert(meetingErrorText({ error: 'google_not_connected' }).includes('חיבורים'), 'לאן הולכים');
    assert(meetingErrorText({ error: 'unknown_outcome' }).includes('לא ייצור פגישה שנייה'), 'שליחה חוזרת בטוחה');
    equal(meetingErrorText({ error: 'bad_input', detail: { field: 'past' } }), 'המועד כבר עבר.');
    assert(meetingErrorText({ error: 'something_new' }).includes('שום דבר לא נשלח'), 'ברירת מחדל');
  }),
  test('כותרות ימים ורישומים ביומן הפעילות', () => {
    assert(dayHeading('2026-10-07', '2026-10-07').startsWith('היום · '), 'היום');
    assert(dayHeading('2026-10-08', '2026-10-07').startsWith('מחר · '), 'מחר');
    equal(historyTitle({ at: 'x', kind: 'moved', askedBy: 'guest' }), 'מועד הפגישה שונה לבקשת המוזמנים');
    equal(historyTitle({ at: 'x', kind: 'canceled_in_google' }), 'הפגישה בוטלה ביומן');
  }),
  test('יום העבודה הבא: מחמישי — ראשון, לא שישי ושבת', () => {
    equal(nextWorkday('2026-10-08'), '2026-10-11');
    equal(nextWorkday('2026-10-06'), '2026-10-07');
  }),
];
