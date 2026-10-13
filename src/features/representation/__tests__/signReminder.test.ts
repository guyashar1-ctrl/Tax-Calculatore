// ─── 240 · תזכורת חתימה לא יוצאת לפני הודעה ראשונה ─────────────────────────────
// ‼ בבידוד: הכלל שמנגנון התזכורות (representation-reminders §1) מפעיל על כל בקשה
// «ממתינה לחתימה» — בלי להריץ את המנגנון ובלי לקוחות.
import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { signReminderDecision } from '../../../../supabase/functions/_shared/signReminder';

const now = new Date('2026-10-20T09:00:00Z');
const base = { now, afterDays: 3, maxReminders: 2 };

export const TESTS: TestCase[] = [
  test('אושר לדף, שום מייל לא יצא — גם אחרי חודש: אין תזכורת', () => {
    equal(signReminderDecision({ ...base, rem: {}, signatureEmailSentAt: undefined }), 'not_notified');
    equal(signReminderDecision({ ...base, now: new Date('2026-12-01T09:00:00Z'), rem: null, signatureEmailSentAt: null }), 'not_notified');
  }),
  test('מייל הדף עם החתימה יצא לפני יומיים (סף 3) — עוד לא', () => {
    equal(signReminderDecision({ ...base, signatureEmailSentAt: '2026-10-18T09:00:00Z' }), 'not_due');
  }),
  test('מייל הדף עם החתימה יצא לפני 4 ימים — מגיעה תזכורת', () => {
    equal(signReminderDecision({ ...base, signatureEmailSentAt: '2026-10-16T09:00:00Z' }), 'due');
  }),
  test('תזכורת קודמת — הספירה מהתזכורת, לא מהמייל', () => {
    equal(signReminderDecision({ ...base, signatureEmailSentAt: '2026-10-01T09:00:00Z', rem: { count: 1, lastSentAt: '2026-10-19T09:00:00Z' } }), 'not_due');
  }),
  test('הגיעו למספר התזכורות המרבי — לא שולחים יותר', () => {
    equal(signReminderDecision({ ...base, signatureEmailSentAt: '2026-10-01T09:00:00Z', rem: { count: 2, lastSentAt: '2026-10-05T09:00:00Z' } }), 'capped');
  }),
];
