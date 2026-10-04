// ─── בדיקות: «נשלחו לאחרונה» — סופר רק מה שיצא ─────────────────────────────
// ‼ «לא ידוע אם יצא» (unknown) ו«לא הגיע» (נכשל/חזר) נספרים לחוד, ואף פעם לא
// נכנסים ל«נשלחו N». «צפייה במה שיצא» — רק כשבאמת יצא משהו.
import { test, equal, assert, deepEqual } from '../../../../testkit/tinyTest';
import type { TestCase } from '../../../../testkit/tinyTest';
import type { EmailMessage, EmailStatus } from '../../../../types/emailActivity';
import { sentLineSummary, sentLineTags } from '../recentSends';

const at = (d: number) => new Date(Date.UTC(2026, 9, d, 10)).toISOString();
const mail = (id: string, status: EmailStatus, day: number): EmailMessage =>
  ({ id, status, toEmail: `${id}@x.test`, sentAt: at(day), kind: 'portal_reminder' });

export const TESTS: TestCase[] = [
  test('unknown ו-failed לא נספרים ב«נשלחו»', () => {
    const list = [mail('u', 'unknown', 3), mail('s1', 'delivered', 2), mail('f', 'failed', 2), mail('s2', 'sent', 1)];
    const s = sentLineSummary(list);
    equal(s.sent, 2);
    equal(s.unknown, 1);
    equal(s.failed, 1);
    assert(s.text.startsWith('נשלחו 2 ב-30 יום'), s.text);
    equal(s.last?.id, 's1', 'האחרון שיצא — לא הניסיון שלא ידוע אם יצא');
    equal(s.lastWentOut, true);
  }),
  test('רק ניסיונות שלא ידוע אם יצאו ⇒ לא «נשלחו», ו«צפייה» בלי «במה שיצא»', () => {
    const s = sentLineSummary([mail('u1', 'unknown', 3), mail('u2', 'unknown', 2)]);
    equal(s.sent, 0);
    assert(!s.text.includes('נשלחו'), s.text);
    assert(s.text.startsWith('2 ניסיונות שליחה ב-30 יום'), s.text);
    equal(s.lastWentOut, false);
    equal(s.last?.id, 'u1');
  }),
  test('ניסיון אחד ⇒ «ניסיון שליחה אחד»', () => {
    assert(sentLineSummary([mail('f', 'bounced', 1)]).text.startsWith('ניסיון שליחה אחד'), 'יחיד');
  }),
  test('התגים: unknown כתום בנפרד מ«לא הגיע»; אין תג כשאין', () => {
    deepEqual(sentLineTags({ unknown: 0, failed: 0 }), {});
    equal(sentLineTags({ unknown: 1, failed: 0 }).unknown, 'מייל אחד: לא ידוע אם יצא');
    equal(sentLineTags({ unknown: 3, failed: 0 }).unknown, '3 מיילים: לא ידוע אם יצאו');
    equal(sentLineTags({ unknown: 0, failed: 2 }).failed, '2 לא הגיעו');
    equal(sentLineTags({ unknown: 0, failed: 1 }).failed, 'אחד לא הגיע');
  }),
  test('נפתח / נלחץ / מתעכב — נספרים כ«נשלחו»', () => {
    equal(sentLineSummary([mail('a', 'opened', 3), mail('b', 'clicked', 2), mail('c', 'delivery_delayed', 1)]).sent, 3);
  }),
];
