// ─── בדיקות: ביטול בקשת ייצוג בב״ל לאדם — מתי מוצע, ומה החלון אומר אחרי התשובה ───────
// ‼ מה נעול כאן:
//   · H1.b — «אושר» כמו בשרת (ni_subject_stage, 212): confirmedAt **או** תיק ב״ל פעיל.
//     פעיל ⇒ אין «ביטול/מחיקת הבקשה». המרכז מעביר את אותה נגזרת שאומרת «הייצוג פעיל».
//   · H1.c — «כבר אושרה» / «כבר לא פעילה» הן תשובות סופיות: חלון בלי נוסח ביטול.
//     תשובה לא ברורה (רשת/חריגה) — «לא ידוע אם הפעולה נקלטה», לא «לא בוצעה».

import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { niCancelStage, finalOutcome, reasonText, NI_CANCEL_LABEL } from '../NiCancelRequest';
import CANCEL_SOURCE from '../NiCancelRequest.tsx?raw';
import CENTER_SOURCE from '../RepresentationExecutionCenter.tsx?raw';

export const TESTS: TestCase[] = [
  test('שלב: לא נשלח ⇒ מחיקה; נשלח ⇒ ביטול; confirmedAt ⇒ כלום', () => {
    equal(niCancelStage({}), 'not_sent');
    equal(niCancelStage({ instructionsSentAt: '2026-09-23T17:25:18Z' }), 'sent');
    equal(niCancelStage({ instructionsSentAt: '2026-09-23T17:25:18Z', confirmedAt: '2026-09-24T08:00:00Z' }), null);
    equal(NI_CANCEL_LABEL.not_sent, 'מחיקת הבקשה');
    equal(NI_CANCEL_LABEL.sent, 'ביטול הבקשה');
  }),

  test('H1.b · תיק ב״ל פעיל בלי confirmedAt על המסלול ⇒ אין פעולה (כמו בשרת)', () => {
    equal(niCancelStage({ instructionsSentAt: '2026-09-23T17:25:18Z' }, true), null);
    equal(niCancelStage(undefined, true), null);
    equal(niCancelStage({ instructionsSentAt: '2026-09-23T17:25:18Z' }, false), 'sent');
  }),

  test('H1.b · המרכז מעביר «אושר» מאותה נגזרת של «הייצוג פעיל» בשורה', () => {
    assert(/approved=\{niTrackView\(niExecutionByRole\[role\], niLineFor\(role\)\)\.final\}/.test(CENTER_SOURCE),
      'NiCancelRequest במרכז מקבל approved מ-niTrackView(...).final');
  }),

  test('H1.c · «כבר אושרה» / «כבר לא פעילה» — חלון סופי עם «סגירה» בלבד, ורענון', () => {
    const a = finalOutcome('already_active', 'רותם');
    equal(a?.title, 'הבקשה עבור רותם כבר אושרה');
    assert(!/לבטל את|\?$/.test(a!.title), 'בלי נוסח ביטול בכותרת');
    equal(finalOutcome('not_requested', 'רותם')?.title, 'הבקשה עבור רותם כבר לא פעילה');
    equal(finalOutcome('automation_running', 'רותם'), null, 'לא סופי — נשאר בחלון הביטול');
    equal(finalOutcome(undefined, 'רותם'), null);
    assert(/open && outcome && \(/.test(CANCEL_SOURCE), 'חלון התוצאה נפרד');
    assert(/סגירה\s*<\/button>/.test(CANCEL_SOURCE), 'כפתור «סגירה» אחד');
    assert(/if \(final\) \{ setOutcome\(final\); onChanged\?\.\(\); return; \}/.test(CANCEL_SOURCE), 'התוצאה הסופית מרעננת את המסך');
  }),

  test('H1.c · תשובה לא ברורה — «לא ידוע אם הפעולה נקלטה», בכתום, עם רענון; לא «לא בוצעה»', () => {
    const t = reasonText('', 'רותם');
    assert(t.startsWith('לא ידוע אם הפעולה נקלטה'), t);
    assert(!t.includes('לא בוצעה'), t);
    assert(/chip-amber-tx/.test(CANCEL_SOURCE), 'צבע «לא ידוע» — כתום, לא אדום');
    assert(/if \(rpcError\) \{[^}]*setUnknown\(true\); onChanged\?\.\(\);/.test(CANCEL_SOURCE), 'שגיאת רשת ⇒ לא ידוע + רענון');
  }),

  test('H1.c · אזהרת «נשלח» אומרת שהתזכורות לאדם ייפסקו (השרת עוצר אותן, 212)', () => {
    assert(/התזכורות אל \{name\} ייפסקו/.test(CANCEL_SOURCE), 'המשפט באזהרה');
  }),
];
