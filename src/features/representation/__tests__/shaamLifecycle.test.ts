// ─── בדיקות: הייצוג בשע״ם אחרי ההגשה (201) ───────────────────────────────────
// ‼ המקרה האמיתי: הדסה סלע, בקשה 2026538930. הטופס נקלט ב-23.09.2026 20:42;
// שע״ם הראתה «התקבלו המסמכים» / «השהייה», צפי לסיום 06/10/2026. ב-PIVO
// נשאר צילום מ-14:50 («המתנה למסמכים»). כאן נבדק מה המסך גוזר מהעובדות
// השמורות — ולכן גם מה שייראה אחרי F5: אותה עובדה ⇒ אותו מסך.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  shaamLifecycle, shaamProgressLine, shaamReconciledAfterSubmission, allSystemsAccepted,
  shaamIdentityDocKind, shaamRequiredDocumentText, parseShaamSystemState, parseShaamRequestState,
  type ShaamRequestTracking, type ShaamSystemStatus,
} from '../shaamRepresentation';
import { shaamRepresentationAction } from '../../taxFile/shaamRepresentationAction';

const SUBMITTED = '2026-09-23T20:42:35Z';
const row = (systemLabel: string, rawRequestState: string, rawSystemState: string, extra: Partial<ShaamSystemStatus> = {}): ShaamSystemStatus => ({
  systemLabel, rawRequestState, rawSystemState, clientName: 'סלע הדסה', fileNumber: '034605212',
  repType: 'ראשי', enteredAt: '23/09/2026', requestNumber: '2026538930', ...extra,
});

/** המצב השמור של הדסה לפני 201 — צילום מ-14:50 ושידור מ-20:42. */
function hadassaBefore(): ShaamRequestTracking {
  return {
    requestNumber: '2026538930', syncedAt: '2026-09-23T14:50:03Z', submittedAt: SUBMITTED,
    rawRequestState: 'המתנה למסמכים',
    systems: [row('מס הכנסה', 'המתנה למסמכים', ''), row('מעמ', 'המתנה למסמכים', ''), row('ניכויים', 'המתנה למסמכים', '', { fileNumber: 'לא קיים תיק' })],
  };
}

/** אחרי המילוי החד-פעמי של 201 — מה שמסך האישור של שע״ם אמר. */
function hadassaWithConfirmation(): ShaamRequestTracking {
  return {
    ...hadassaBefore(),
    suspensionEndsAt: '2026-10-06', suspensionEndsSource: 'submission_confirmation',
    submissionConfirmation: { text: 'בקשתך תיקלט במערכת ותמתין לסיום השהייה הצפויה להסתיים ביום 06/10/2026.', at: SUBMITTED },
  };
}

/** אחרי «בדוק קבלת הייצוג» (קריאה בלבד) — מה ששע״ם מציגה עכשיו. */
function hadassaReconciled(): ShaamRequestTracking {
  return {
    ...hadassaWithConfirmation(),
    syncedAt: '2026-09-24T07:00:05Z', observedAt: '2026-09-24T07:00:00Z',
    rawRequestState: 'התקבלו המסמכים',
    suspensionEndsAt: '2026-10-06', suspensionEndsSource: 'request_list',
    systems: [
      row('מס הכנסה', 'התקבלו המסמכים', 'השהייה', { suspensionEndsRaw: '06/10/2026' }),
      row('מעמ', 'התקבלו המסמכים', 'השהייה'),
      row('ניכויים', 'התקבלו המסמכים', 'השהייה', { fileNumber: 'לא קיים תיק' }),
    ],
  };
}

const withSystems = (t: ShaamRequestTracking, systems: ShaamSystemStatus[]): ShaamRequestTracking => ({ ...t, systems });

export const TESTS: TestCase[] = [
  test('201-1 · צילום מלפני ההגשה אינו מוצג כמצב של עכשיו', () => {
    const l = shaamLifecycle(hadassaBefore());
    equal(l.submitted, true);
    equal(l.reconciled, false);
    deepEqual(l.systems, []);
    equal(l.requestStateRaw, undefined, '«המתנה למסמכים» הישן לא מוצג');
    assert(!/המתנה למסמכים/.test(l.headline), l.headline);
    equal(shaamReconciledAfterSubmission(hadassaBefore()), false);
  }),

  test('201-2 · אחרי ההגשה, לפני קריאה — צפי ההשהייה ממסך האישור של שע״ם', () => {
    const l = shaamLifecycle(hadassaWithConfirmation());
    equal(l.ball, 'authority');
    equal(l.nextMilestone?.date, '2026-10-06');
    assert(/אישור הקליטה/.test(l.nextMilestone?.text ?? ''), 'המקור מוצג');
    // ‼ אין «הריצו בדוק» בתוך המצב — לבדיקה כפתור אחד ליד כותרת המרכז.
    equal(l.officeAction, undefined);
  }),

  test('201-3 · הדסה אחרי יישוב: «התקבלו המסמכים» + «השהייה», צפי 06/10/2026', () => {
    const l = shaamLifecycle(hadassaReconciled());
    equal(l.reconciled, true);
    equal(l.requestStateRaw, 'התקבלו המסמכים');
    deepEqual(l.systems.map(s => s.raw), ['השהייה', 'השהייה', 'השהייה']);
    deepEqual(l.systems.map(s => s.state), ['suspended', 'suspended', 'suspended']);
    equal(l.ball, 'authority');
    equal(l.nextMilestone?.date, '2026-10-06');
    equal(l.clientAction, undefined, 'השהייה אינה דורשת פעולה מהלקוח');
    assert(/השהייה/.test(l.headline), l.headline);
  }),

  test('201-4 · «מצב בקשה» ו«מצב מערך» נשארים שני דברים', () => {
    const l = shaamLifecycle(withSystems(hadassaReconciled(), [
      row('מס הכנסה', 'התקבלו המסמכים', 'נקלט בהצלחה'),
      row('מעמ', 'התקבלו המסמכים', 'השהייה'),
    ]));
    equal(l.requestStateRaw, 'התקבלו המסמכים');
    deepEqual(l.systems.map(s => s.raw), ['נקלט בהצלחה', 'השהייה']);
    equal(parseShaamRequestState('התקבלו המסמכים'), 'documents_received');
    equal(parseShaamSystemState('השהייה'), 'suspended');
  }),

  test('201-5 · «ממתין לאישור לקוח» — פעולת חובה של הלקוח, לא זירוז', () => {
    const l = shaamLifecycle(withSystems(hadassaReconciled(), [
      row('מס הכנסה', 'התקבלו המסמכים', 'ממתין לאישור לקוח'),
      row('מעמ', 'התקבלו המסמכים', 'השהייה'),
    ]));
    equal(l.ball, 'client');
    equal(l.clientAction?.required, true);
    equal(l.clientAction?.title, 'הייצוג ממתין לאישור הלקוח');
    assert(/חייב/.test(l.clientAction?.text ?? ''), 'חובה, לא המלצה');
    assert(!/זירוז|אופציונל|אפשר לקצר|אם רוצים/.test(`${l.headline} ${l.clientAction?.text}`), 'בלי ניסוח של רשות');
    equal(shaamProgressLine(withSystems(hadassaReconciled(), [row('מס הכנסה', 'x', 'ממתין לאישור לקוח')])).ball, 'client');
  }),

  test('201-6 · «ממתין לפתיחת תיק» — אצל הרשות, מוצג כמידע', () => {
    const l = shaamLifecycle(withSystems(hadassaReconciled(), [
      row('מס הכנסה', 'התקבלו המסמכים', 'נקלט בהצלחה'),
      row('ניכויים', 'התקבלו המסמכים', 'ממתין לפתיחת תיק'),
    ]));
    equal(l.ball, 'authority');
    assert(/ניכויים/.test(l.note ?? ''), 'מאיזה מערך');
    equal(allSystemsAccepted(withSystems(hadassaReconciled(), [row('ניכויים', 'x', 'ממתין לפתיחת תיק')])), false);
  }),

  test('201-7 · «נקלט בהצלחה» בכל המערכים — הושלם', () => {
    const t = withSystems(hadassaReconciled(), [
      row('מס הכנסה', 'מסמכים אושרו', 'נקלט בהצלחה'), row('מעמ', 'מסמכים אושרו', 'נקלט בהצלחה'),
    ]);
    equal(shaamLifecycle(t).ball, 'done');
    equal(allSystemsAccepted(t), true);
  }),

  test('201-8 · «נקלט» מצילום שלפני ההגשה אינו ראיה', () => {
    const t: ShaamRequestTracking = { ...hadassaBefore(), systems: [row('מס הכנסה', 'x', 'נקלט בהצלחה')] };
    equal(allSystemsAccepted(t), false);
  }),

  test('201-9 · נדחה / בוטל — מוצג כמו ששע״ם כתבה, והכדור אצל המשרד', () => {
    const l = shaamLifecycle(withSystems(hadassaReconciled(), [row('מס הכנסה', 'x', 'הבקשה נדחתה')]));
    equal(l.systems[0].state, 'rejected');
    equal(l.ball, 'office');
    assert(l.headline.includes('«הבקשה נדחתה»'), l.headline);
    equal(parseShaamSystemState('בוטל'), 'cancelled');
    equal(parseShaamRequestState('הבקשה בוטלה'), 'cancelled');
  }),

  test('201-10 · לא נמצאה ברשימה אחרי ההגשה — עובדה, לא מסקנה', () => {
    const l = shaamLifecycle({ ...hadassaReconciled(), notInListAt: '2026-09-25T08:00:00Z', observedAt: '2026-09-25T08:00:00Z' });
    equal(l.ball, 'office');
    assert(/לא מסיקה/.test(l.officeAction ?? ''), 'לא מכריזים «נקלט»');
  }),

  test('201-11 · מצב לא מוכר מוצג במילים של שע״ם', () => {
    const l = shaamLifecycle(withSystems(hadassaReconciled(), [row('מס הכנסה', 'x', 'בבדיקה מיוחדת')]));
    equal(l.systems[0].state, 'unknown');
    assert(l.headline.includes('«בבדיקה מיוחדת»'), l.headline);
  }),

  test('201-12 · F5: אותן עובדות שמורות ⇒ אותו מסך (הנגזרת טהורה)', () => {
    const saved = JSON.parse(JSON.stringify(hadassaReconciled())) as ShaamRequestTracking;
    deepEqual(shaamLifecycle(saved), shaamLifecycle(hadassaReconciled()));
  }),

  test('201-13 · אחרי ההגשה הפעולה היחידה היא «בדוק» — לא שידור ולא יצירה', () => {
    for (const t of [hadassaBefore(), hadassaWithConfirmation(), hadassaReconciled()]) {
      const a = shaamRepresentationAction('awaiting_authorities', t, true);
      equal(a?.kind, 'check');
    }
  }),

  test('201-14 · סיווג מסמך מזהה ששע״ם מבקשת', () => {
    equal(shaamIdentityDocKind('צילום תעודת זהות'), 'idCard');
    equal(shaamIdentityDocKind('ת.ז. + ספח'), 'idCard');
    equal(shaamIdentityDocKind('צילום דרכון'), 'passport');
    equal(shaamIdentityDocKind('תעודת זהות או דרכון'), 'idOrPassport');
    equal(shaamIdentityDocKind('טופס ייפוי כוח'), null);
    equal(shaamIdentityDocKind('אישור ניהול חשבון'), null);
    equal(shaamIdentityDocKind(''), null);
  }),

  test('201-15 · מה נעשה עם דרישת מסמך — משפט לכל מצב', () => {
    equal(shaamRequiredDocumentText({ label: 'x', handling: 'exists' }).includes('לא נדרש לבקש שוב'), true);
    equal(shaamRequiredDocumentText({ label: 'x', handling: 'requested' }).includes('נוספה בקשת מסמך'), true);
    equal(shaamRequiredDocumentText({ label: 'x' }), '');
    equal(shaamLifecycle({ ...hadassaReconciled(), requiredDocuments: [{ label: 'צילום ת.ז.', kind: 'idCard', handling: 'requested' }] }).requiredDocuments.length, 1);
  }),
];
