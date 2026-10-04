// ─── בדיקות: לקוח שחוזר, ומה עמוד האוטומציות אומר על הודעה ללקוח ────────────────
// ‼ מה נעול כאן:
//   · ריצה שנסגרה כי ההתקשרות הקודמת הסתיימה — «נסגר עם סיום ההתקשרות», לא «בוטל».
//   · מה שהשרת קבע («לא יצא — נעצר לפני ספק הדואר») נבדל ממה שהמשרד החליט («שחררת…»),
//     ושחרור של המשרד אינו «לא נשלח».
//   · «בשליחה» שהחכירה שלו פקעה — «לא ידוע אם יצא», לא «נשלח עכשיו»; נתפס ולא נשלח — לא יצא.
//   · מייל במצב «לא ידוע» ביומן — ענבר, לא «נכשלה».
//   · הנוסח בבונה: הקליטה נפתחת גם ללקוח שחוזר.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { endedRunText } from '../runSummary';
import { emailResult, noticeEvent, NOTICE_REASON, type NoticeRow } from '../../../features/automation/automationList';
import FlowBuilderSrc from '../FlowBuilder.tsx?raw';
import AddSheetSrc from '../builder/AddSheet.tsx?raw';
import SaveSheetSrc from '../builder/SaveSheet.tsx?raw';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const n = (p: Partial<NoticeRow>): NoticeRow => ({ id: 'n1', clientId: 'c1', kind: 'new', status: 'failed', createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:00:00Z', ...p });

export const TESTS: TestCase[] = [
  test('ריצה שהסתיימה: «נסגר עם סיום ההתקשרות» כשההתקשרות הקודמת הסתיימה — לא «בוטל»', () => {
    const at = '2026-10-02T09:00:00Z';
    equal(endedRunText({ status: 'cancelled', cancelledAt: at, closedBy: 'engagement_ended' }), 'נסגר עם סיום ההתקשרות 02.10.26');
    equal(endedRunText({ status: 'cancelled', cancelledAt: at }), 'בוטל 02.10.26');
    equal(endedRunText({ status: 'done', doneAt: at, closedBy: 'engagement_ended' }), 'הושלם 02.10.26', 'הושלם — הושלם');
    equal(endedRunText({ status: 'cancelled', cancelledAt: null, closedBy: 'engagement_ended' }), 'נסגר עם סיום ההתקשרות');
  }),

  test('עמוד האוטומציות: מה שהשרת קבע נבדל ממה שהמשרד החליט, ושחרור אינו «לא נשלח»', () => {
    const never = noticeEvent(n({ reason: 'never_sent' }), NOW);
    const office = noticeEvent(n({ reason: 'office_marked_not_sent' }), NOW);
    assert(never.label !== office.label, 'שתי תוויות שונות');
    equal(never.label, 'לא יצא — נעצר לפני ספק הדואר');
    equal(office.label, 'שחררת לשליחה מחדש — לא ידוע אם יצא');
    equal(office.tone, 'muted', 'הוכרע במשרד — לא כשל');
    for (const r of ['office_marked_not_sent', 'recipient_changed']) {
      assert(!/לא נשלח/.test(NOTICE_REASON[r].label), `${r}: ${NOTICE_REASON[r].label}`);
      assert(!NOTICE_REASON[r].attention, `${r}: כבר הוכרע — לא «צריך אותך»`);
    }
  }),

  test('«בשליחה» שהחכירה פקעה — «לא ידוע אם יצא»; חיה — «נשלח עכשיו»; נתפס ולא נשלח — לא יצא', () => {
    const live = noticeEvent(n({ status: 'sending', leaseUntil: '2026-10-03T12:05:00Z' }), NOW);
    equal(live.label, 'נשלח עכשיו');
    const expired = noticeEvent(n({ status: 'sending', leaseUntil: '2026-10-03T11:50:00Z' }), NOW);
    assert(/לא ידוע אם יצא/.test(expired.label), expired.label);
    equal(expired.sticky, true, 'חוסם את ההודעות הבאות עד הכרעה — נשאר ב«צריך אותך»');
    const claimed = noticeEvent(n({ status: 'claimed', leaseUntil: '2026-10-03T11:50:00Z' }), NOW);
    equal(claimed.label, NOTICE_REASON.lease_expired_before_send.label);
    equal(noticeEvent(n({ status: 'sending' }), NOW).label, 'נשלח עכשיו', 'בלי חכירה (שרת ישן) — כמו קודם');
  }),

  test('מייל «לא ידוע» ביומן — ענבר «לא ידוע אם יצא», לא «נכשלה»', () => {
    const r = emailResult({ status: 'unknown' as never });
    equal(r.label, 'לא ידוע אם יצא');
    equal(r.tone, 'warn');
  }),

  test('הבונה: מסלול הקליטה נפתח גם ללקוח שחוזר; עדכון הסכם — לא', () => {
    assert(FlowBuilderSrc.includes('ואצל לקוח שחוזר אחרי שההתקשרות הקודמת הסתיימה. עדכון הסכם ללקוח פעיל אינו פותח קליטה.'), 'FlowBuilder');
    assert(AddSheetSrc.includes("'נפתחת לכל לקוח חדש או חוזר'"), 'AddSheet');
    assert(SaveSheetSrc.includes('מה שכל לקוח חדש או חוזר מקבל באישור ההצעה'), 'SaveSheet');
  }),
];
