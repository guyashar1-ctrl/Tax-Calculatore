// ─── בדיקות: «דלג על הבקשה», פריט אישור בבקשה בשם בן/בת הזוג, משימה פנימית ───
// ‼ מה נעול כאן:
//   · דילוג על בקשה של מסלול נשלח כ-'not_applicable' (סיבה שהשרת מכיר), ומה
//     שהוקלד נשמר כהערה — אחרת השלב במסלול נתקע לתמיד. מחוץ למסלול — כמו קודם.
//   · «דולג · …» מציג את מה שהוקלד או שם עברי — לא קוד פנימי.
//   · בבקשה בשם בן/בת הזוג «לקרוא ולאשר» לא מוצע, והשמירה נחסמת אם נשאר.
//   · «אני» ביצירה מסמן משימה פנימית; עריכה ובעלים אחרים — לא.

import { test, equal, deepEqual, includes, excludes } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  internalTaskMarker, requirementKindsFor, skipPayloadFor, skippedLabel, spouseConfirmError,
} from '../InlineComposer';

export const TESTS: TestCase[] = [
  test('דילוג על בקשה של מסלול: הסיבה not_applicable, הטקסט כהערה', () => {
    deepEqual(skipPayloadFor({ flowRunId: 'run-1' }, '  לא רלוונטי השנה '),
      { reason: 'not_applicable', note: 'לא רלוונטי השנה', skipNote: 'לא רלוונטי השנה' });
  }),

  test('דילוג על בקשה מחוץ למסלול: כמו קודם — הטקסט הוא הסיבה', () => {
    deepEqual(skipPayloadFor({ flowRunId: null }, 'יש כבר בתיק'), { reason: 'יש כבר בתיק', note: 'יש כבר בתיק' });
    deepEqual(skipPayloadFor({}, 'יש כבר בתיק'), { reason: 'יש כבר בתיק', note: 'יש כבר בתיק' });
  }),

  test('בלי סיבה (ביטול או ריק) — לא שולחים כלום', () => {
    equal(skipPayloadFor({ flowRunId: 'run-1' }, null), null);
    equal(skipPayloadFor({ flowRunId: 'run-1' }, '   '), null);
    equal(skipPayloadFor({}, undefined), null);
  }),

  test('«דולג · …»: מה שהוקלד גובר; קוד מוכר — בעברית; קוד לא מוכר — לא מוצג', () => {
    equal(skippedLabel({ skipReason: 'not_applicable', skipNote: 'לא רלוונטי השנה' }), 'דולג · לא רלוונטי השנה');
    equal(skippedLabel({ skipReason: 'not_applicable' }), 'דולג · אין צורך');
    equal(skippedLabel({ skipReason: 'already_connected' }), 'דולג · הלקוח כבר מחובר');
    equal(skippedLabel({ skipReason: 'יש כבר בתיק' }), 'דולג · יש כבר בתיק');
    equal(skippedLabel({ skipReason: 'some_internal_code' }), 'דולג');
    equal(skippedLabel({}), 'דולג');
    equal(skippedLabel(null), 'דולג');
  }),

  test('בקשה בשם בן/בת הזוג: «לקרוא ולאשר» לא מוצע', () => {
    excludes(requirementKindsFor('spouse'), 'confirm');
    excludes(requirementKindsFor('spouse', 'file'), 'confirm');
    includes(requirementKindsFor('spouse'), 'file');
    includes(requirementKindsFor('client'), 'confirm');
    includes(requirementKindsFor(undefined), 'confirm');
  }),

  test('שורה ישנה שכבר «לקרוא ולאשר» — נשארת בתפריט שלה, והשמירה נחסמת', () => {
    includes(requirementKindsFor('spouse', 'confirm'), 'confirm');
    const err = spouseConfirmError('spouse', ['file', 'confirm'], 'רונית');
    equal(typeof err, 'string');
    equal((err ?? '').includes('רונית'), true);
    equal(spouseConfirmError('spouse', ['file', 'text'], 'רונית'), null);
    equal(spouseConfirmError('client', ['confirm'], 'רונית'), null);
  }),

  test('«אני» ביצירה מסמן משימה פנימית; עריכה או בעלים אחר — בלי סימון', () => {
    deepEqual(internalTaskMarker('me', false), { internalTask: true });
    deepEqual(internalTaskMarker('me', true), {});
    deepEqual(internalTaskMarker('client', false), {});
    deepEqual(internalTaskMarker('external', false), {});
  }),
];
