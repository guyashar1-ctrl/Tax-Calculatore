// ─── בדיקות: סינון יומן המיילים כשמגיעים מעמוד אחר ────────────────────────────
// ‼ מה נעול כאן: «מה יצא ←» מ«אוטומציות» מסנן גם לפי מי הפעיל (meta.origin='auto') —
// היומן לא מערבב מה ששלחת בעצמך עם מה שיצא לבד.

import { test, equal } from '../../../../testkit/tinyTest';
import type { TestCase } from '../../../../testkit/tinyTest';
import type { EmailMessage } from '../../../../types/emailActivity';
import { matchesFilter } from '../activityFilter';

const mail = (kind: string, origin?: 'auto' | 'manual'): EmailMessage => ({
  id: kind + (origin ?? ''), toEmail: 'a@example.com', kind, status: 'delivered',
  ...(origin ? { meta: { origin } } : {}),
} as EmailMessage);

export const TESTS: TestCase[] = [
  test('origin: auto — רק מה שיצא לבד, מהסוגים שבסינון', () => {
    const f = { label: 'תזכורות', kinds: ['portal_reminder'], origin: 'auto' as const };
    equal(matchesFilter(mail('portal_reminder', 'auto'), f), true);
    equal(matchesFilter(mail('portal_reminder', 'manual'), f), false);
    equal(matchesFilter(mail('portal_reminder'), f), false);
    equal(matchesFilter(mail('process_open', 'auto'), f), false);
  }),
  test('בלי origin — כמו קודם: לפי הסוג בלבד', () => {
    const f = { label: 'תזכורות', kinds: ['portal_reminder'] };
    equal(matchesFilter(mail('portal_reminder', 'manual'), f), true);
    equal(matchesFilter(mail('portal_reminder'), f), true);
    equal(matchesFilter(mail('x'), null), true);
  }),
];
