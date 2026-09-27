// ─── בדיקות: הכללים של מרכז ביצוע הייצוג (24.09.2026) ────────────────────────
// ‼ נבדק המצב הנגזר — מה המסך אמור להציג — ולא צילום של המסך. בסוף הקובץ
// יש גם בדיקות מקור: שלושת סוגי הבאגים שחזרו (כפתור כפול, מצב ישן ליד מצב
// סופי, הודעה בוורוד של פעולה) נחסמים ברמת הקוד, כדי שפיצ'ר הבא לא יחזיר אותם.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { NiTracking } from '../../../types';
import {
  NOTICE_STYLES, columnAction, isReconcileAction, niTrackView, shaamSubmittedFacts, daysUntil,
  niReconcileLine, niReconcileLineFromJob, shaamReconcileLine, checkedAtText,
  niInstructionsDelivered, reconcileIsPremature,
} from '../representationCenter';
import type { ShaamRequestTracking, ShaamSystemStatus } from '../shaamRepresentation';
import { shaamRepresentationAction } from '../../taxFile/shaamRepresentationAction';
import CENTER_SOURCE from '../../../components/RepresentationExecutionCenter.tsx?raw';
import RECONCILE_SOURCE from '../../../components/RepresentationReconcileButton.tsx?raw';

/** המקור בלי הערות — כדי שהבדיקה תספור רק טקסט שהמשתמש רואה. */
const code = (src: string) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

const TODAY = new Date('2026-09-24T09:00:00');
const SUBMITTED = '2026-09-23T20:42:35Z';
const row = (systemLabel: string, rawSystemState: string, rawRequestState = 'התקבלו המסמכים'): ShaamSystemStatus => ({
  systemLabel, rawSystemState, rawRequestState, clientName: 'סלע הדסה', enteredAt: '23/09/2026', requestNumber: '2026538930',
});
/** הדסה כפי שהיא שמורה היום: הוגש, יש אישור קליטה עם צפי, והקריאה היחידה מלפני ההגשה. */
const hadassaNow = (): ShaamRequestTracking => ({
  requestNumber: '2026538930', submittedAt: SUBMITTED, syncedAt: '2026-09-23T14:50:03Z',
  rawRequestState: 'המתנה למסמכים', systems: [row('מס הכנסה', '', 'המתנה למסמכים')],
  suspensionEndsAt: '2026-10-06', suspensionEndsSource: 'submission_confirmation',
  submissionConfirmation: { text: 'בקשתך תיקלט במערכת ותמתין לסיום השהייה הצפויה להסתיים ביום 06/10/2026.', at: SUBMITTED },
});
const reconciled = (systems: ShaamSystemStatus[], extra: Partial<ShaamRequestTracking> = {}): ShaamRequestTracking => ({
  ...hadassaNow(), observedAt: '2026-09-24T07:00:00Z', syncedAt: '2026-09-24T07:00:05Z',
  rawRequestState: systems[0]?.rawRequestState, systems, suspensionEndsSource: 'request_list', ...extra,
});

export const TESTS: TestCase[] = [
  // ── שע״ם ─────────────────────────────────────────────────────────────────
  test('מרכז · שע״ם לפני הגשה — אין עובדות לשלב 6', () => {
    equal(shaamSubmittedFacts({ requestNumber: '2026538930', rawRequestState: 'המתנה למסמכים' }), null);
    equal(shaamSubmittedFacts(undefined), null);
  }),

  test('מרכז · שע״ם הוגש + השהייה (הדסה היום): שלוש עובדות, בלי «המתנה למסמכים»', () => {
    const f = shaamSubmittedFacts(hadassaNow())!;
    equal(f.submittedAt, SUBMITTED);
    equal(f.status, 'השהייה');
    equal(f.suspensionEndsAt, '2026-10-06');
    equal(f.clientApprovalRequired, false);
    equal(f.final, false);
  }),

  test('מרכז · שע״ם אחרי קריאה: «השהייה» בכל המערכים ⇒ סטטוס אחד + צפי', () => {
    const f = shaamSubmittedFacts(reconciled([row('מס הכנסה', 'השהייה'), row('מעמ', 'השהייה')]))!;
    equal(f.status, 'השהייה');
    equal(f.suspensionEndsAt, '2026-10-06');
  }),

  test('מרכז · שע״ם ממתין לאישור לקוח ⇒ פעולה נדרשת, בלי צפי השהייה', () => {
    const f = shaamSubmittedFacts(reconciled([row('מס הכנסה', 'ממתין לאישור לקוח')]))!;
    equal(f.status, 'ממתין לאישור לקוח');
    equal(f.clientApprovalRequired, true);
    equal(f.suspensionEndsAt, undefined);
  }),

  test('מרכז · שע״ם מצבים שונים במערכים ⇒ כל מערך במילים של שע״ם', () => {
    const f = shaamSubmittedFacts(reconciled([row('מס הכנסה', 'השהייה'), row('ניכויים', 'ממתין לפתיחת תיק')]))!;
    equal(f.status, 'מס הכנסה: השהייה · ניכויים: ממתין לפתיחת תיק');
  }),

  test('מרכז · שע״ם דרישת מסמך נשמרת לשלב 6', () => {
    const f = shaamSubmittedFacts({ ...hadassaNow(), requiredDocuments: [{ label: 'צילום תעודת זהות', kind: 'idCard', handling: 'requested' }] })!;
    equal(f.requiredDocuments.length, 1);
  }),

  test('מרכז · שע״ם פעיל ⇒ final, סטטוס «נקלט בהצלחה», בלי צפי', () => {
    const f = shaamSubmittedFacts(reconciled([row('מס הכנסה', 'נקלט בהצלחה', 'מסמכים אושרו')]))!;
    equal(f.final, true);
    equal(f.status, 'נקלט בהצלחה');
    equal(f.suspensionEndsAt, undefined);
  }),

  test('מרכז · שע״ם קריאה מלפני ההגשה אינה גוברת על ההגשה', () => {
    // «נקלט» בקריאה שקדמה להגשה — לא ראיה, ולא «סופי».
    const f = shaamSubmittedFacts({ ...hadassaNow(), systems: [row('מס הכנסה', 'נקלט בהצלחה')] })!;
    equal(f.final, false);
    equal(f.status, 'השהייה', 'מה שמסך האישור אמר');
  }),

  // ── יישוב: פעולה אחת של המרכז ────────────────────────────────────────────
  test('מרכז · «בדוק» אינו פעולת עמודה; שאר הפעולות כן', () => {
    assert(isReconcileAction('check') && isReconcileAction('check_btl'), 'check/check_btl');
    equal(columnAction({ kind: 'check' }), null);
    equal(columnAction({ kind: 'check_btl' }), null);
    deepEqual(columnAction({ kind: 'submit' }), { kind: 'submit' });
    deepEqual(columnAction({ kind: 'enter_btl' }), { kind: 'enter_btl' });
    // אחרי ההגשה הפעולה הנגזרת היא «בדוק» ⇒ אין פעולה בראש עמודת מס הכנסה.
    equal(columnAction(shaamRepresentationAction('awaiting_authorities', hadassaNow(), true)), null);
  }),

  // ── ב״ל: קדימות סופי > נוכחי > היסטורי ────────────────────────────────────
  test('מרכז · ב״ל ממתין לפני המועד ⇒ מידע, לא אזהרה', () => {
    const v = niTrackView({ referenceNumber: '75165449', deadline: '2026-11-15' }, { kind: 'pending' }, TODAY);
    equal(v.final, false);
    equal(v.deadlineNotice?.tone, 'info');
    equal(v.editableReference, true);
    equal(v.showManualConfirm, true);
  }),

  test('מרכז · ב״ל המועד עבר ועדיין ממתין ⇒ אזהרה (לא ורוד, לא «סכנה» ממולאת)', () => {
    const v = niTrackView({ referenceNumber: '75165449', deadline: '2026-09-23' }, { kind: 'pending' }, TODAY);
    equal(v.deadlineNotice?.tone, 'warning');
    assert(/עבר לפני 1 ימים/.test(v.deadlineNotice!.text), v.deadlineNotice!.text);
  }),

  test('מרכז · ב״ל אושר אחרי המועד ⇒ אין אזהרה, אין «הזן מחדש», אין טופס, אין «סמן כאושר»', () => {
    const ni: NiTracking = { referenceNumber: '75165449', deadline: '2026-09-23', confirmedAt: '2026-09-23T20:00:00Z', externalState: 'approved' };
    const v = niTrackView(ni, { kind: 'active' }, TODAY);
    equal(v.final, true);
    equal(v.deadlineNotice, null);
    equal(v.editableReference, false);
    equal(v.showExternalEvidence, false);
    equal(v.showManualConfirm, false);
  }),

  test('מרכז · ב״ל פעיל לפי הכרטיס גובר על מסלול ישן בלי confirmedAt', () => {
    const v = niTrackView({ referenceNumber: '75165449', deadline: '2026-09-01', externalState: 'pending' }, { kind: 'active' }, TODAY);
    equal(v.final, true);
    equal(v.deadlineNotice, null, 'מועד ישן לא דורס מצב פעיל');
  }),

  test('מרכז · daysUntil', () => {
    equal(daysUntil('2026-09-24', TODAY), 0);
    equal(daysUntil('2026-09-23', TODAY), -1);
    equal(daysUntil(undefined, TODAY), null);
  }),

  // ── צבע: הודעה אינה פעולה ────────────────────────────────────────────────
  test('מרכז · אף סוג הודעה אינו ורוד של אוטומציה, ו«שגיאה» אינה מילוי ורדרד', () => {
    for (const [tone, st] of Object.entries(NOTICE_STYLES)) {
      assert(!JSON.stringify(st).includes('automation'), `${tone}: ורוד שמור לאוטומציה`);
      assert(!/err-bg|red-light|danger-bg/.test(st.background), `${tone}: בלי מילוי ורדרד`);
    }
    assert(NOTICE_STYLES.required.border !== NOTICE_STYLES.info.border, 'פעולה נדרשת נבדלת ממידע');
  }),

  // ── «בדוק קבלת הייצוג»: התוצאה מתחת לכפתור (27.09.2026) ─────────────────
  test('מרכז · ב״ל ממתין ⇒ «טרם אושר» + מועד + שעת הבדיקה, לא «נבדק» בלבד', () => {
    const at = new Date(2026, 8, 27, 15, 47).toISOString();
    const l = niReconcileLine({ externalState: 'pending', syncedAt: at, deadline: '2026-11-23', referenceNumber: '75204909', instructionsSentWith: 'signature' }, new Date(2026, 8, 27, 18, 0))!;
    equal(l.text, 'טרם אושר - ממתין לאישור המבוטח עד 23.11.2026 · נבדק היום 15:47');
    equal(l.tone, 'required');
    equal(l.at, at);
  }),

  test('מרכז · ב״ל: כל מצב במילים שלו; «לא מזוהה» לעולם אינו «אושר»', () => {
    const at = new Date(2026, 8, 27, 9, 5).toISOString();
    const T = new Date(2026, 8, 27, 12, 0);
    equal(niReconcileLine({ externalState: 'approved', syncedAt: at }, T)!.text, 'אושר - הייצוג בב״ל פעיל · נבדק היום 09:05');
    equal(niReconcileLine({ externalState: 'expired', syncedAt: at }, T)!.text, 'פג תוקף - צריך להזין מחדש בב״ל · נבדק היום 09:05');
    equal(niReconcileLine({ externalState: 'not_found', syncedAt: at, referenceNumber: '75204909' }, T)!.text, 'לא נמצא בב״ל רישום לאסמכתא 75204909 · נבדק היום 09:05');
    const u = niReconcileLine({ externalState: 'unknown', rawExternalState: 'בטיפול', syncedAt: at }, T)!;
    assert(!u.text.includes('אושר'), 'unknown אינו אישור');
    assert(u.text.includes('«בטיפול»'), 'מצטט את מה שב״ל הציגה');
  }),

  test('מרכז · ב״ל ממתין אבל המועד כבר עבר ⇒ «המועד עבר», לא «ממתין עד»', () => {
    const at = new Date(2026, 8, 21, 12, 52).toISOString();
    const l = niReconcileLine({ externalState: 'pending', syncedAt: at, deadline: '2026-09-20' }, new Date(2026, 8, 27, 9, 0))!;
    equal(l.text, 'טרם אושר - המועד לאישור עבר ב-20.9.2026 · נבדק 21.9.2026 12:52');
    equal(l.tone, 'warning');
  }),

  test('מרכז · ב״ל ההוראות עוד לא יצאו (עידן רוקח, 27.09) ⇒ הסיבה האמיתית, לא «ממתין לאישור המבוטח»', () => {
    const at = new Date(2026, 8, 27, 19, 19).toISOString();
    const T = new Date(2026, 8, 27, 20, 0);
    const idan: NiTracking = { referenceNumber: '75204909', deadline: '2026-11-23', externalState: 'pending', syncedAt: at };
    const l = niReconcileLine(idan, T)!;
    equal(l.text, 'טרם אושר - ההוראות לאישור עוד לא נשלחו למבוטח · נבדק היום 19:19');
    equal(l.tone, 'required');
    // ‼ גם לפני בדיקה ראשונה יש מה לומר — למה עדיין אין טעם לבדוק.
    const before = niReconcileLine({ referenceNumber: '75204909' }, T)!;
    equal(before.text, 'ההוראות לאישור עוד לא נשלחו למבוטח - עד אז אין לו מה לאשר');
    // ‼ מה שב״ל אמרה גובר: אושר הוא אושר גם בלי שסומנו הוראות.
    assert(niReconcileLine({ ...idan, externalState: 'approved' }, T)!.text.startsWith('אושר'), 'אושר גובר על הוראות שלא סומנו');
  }),

  test('מרכז · ההוראות נחשבות שיצאו כמו בשלב 3: עם מייל החתימה, בנפרד, או בקישור', () => {
    equal(niInstructionsDelivered({}), false);
    equal(niInstructionsDelivered({ instructionsSentWith: 'signature' }), true);
    equal(niInstructionsDelivered({ instructionsSentAt: '2026-09-24T10:00:00Z' }), true);
    equal(niInstructionsDelivered({ instructionsSentAt: '2026-09-24T10:00:00Z', instructionsSentWith: 'link' }), true);
  }),

  test('מרכז · הכפתור «שקט» רק כשכל הבדיקות מוקדמות מדי', () => {
    equal(reconcileIsPremature([]), false);
    equal(reconcileIsPremature([{ premature: true }]), true);
    equal(reconcileIsPremature([{ premature: true }, { premature: false }]), false);
    equal(reconcileIsPremature([{ premature: true }, {}]), false);
  }),

  test('מרכז · ב״ל שעוד לא נבדק ⇒ אין שורה', () => {
    equal(niReconcileLine({ externalState: 'pending' }), null);
    equal(niReconcileLine({ syncedAt: '2026-09-27T10:00:00Z' }), null);
  }),

  test('מרכז · ב״ל ישר מתוצאת המשימה: אותו נרמול כמו השרת, ומועד שמור לא נמחק', () => {
    const fin = new Date(2026, 8, 27, 15, 47).toISOString();
    const T = new Date(2026, 8, 27, 16, 0);
    const prev: NiTracking = { referenceNumber: '75204909', deadline: '2026-11-23', instructionsSentAt: '2026-09-24T10:00:00Z' };
    equal(niReconcileLineFromJob({ status: 'pending', deadline: null }, fin, prev, T)!.text,
      'טרם אושר - ממתין לאישור המבוטח עד 23.11.2026 · נבדק היום 15:47');
    const weird = niReconcileLineFromJob({ status: 'approved-ish', rawStatus: 'X' }, fin, prev, T)!;
    assert(!weird.text.startsWith('אושר'), 'סטטוס לא מוכר ⇒ לא מזוהה, לא אושר');
  }),

  test('מרכז · שעת הבדיקה: היום ⇒ «היום», יום אחר ⇒ תאריך', () => {
    const T = new Date(2026, 8, 27, 12, 0);
    equal(checkedAtText(new Date(2026, 8, 27, 8, 3).toISOString(), T), 'נבדק היום 08:03');
    equal(checkedAtText(new Date(2026, 8, 26, 23, 59).toISOString(), T), 'נבדק 26.9.2026 23:59');
  }),

  test('מרכז · שע״ם: קריאה מלפני ההגשה אינה תוצאה; ממתין לאישור לקוח ⇒ פעולה נדרשת', () => {
    equal(shaamReconcileLine(hadassaNow()), null);
    equal(shaamReconcileLine(undefined), null);
    const l = shaamReconcileLine(reconciled([row('מס הכנסה', 'ממתין לאישור לקוח')]))!;
    assert(l.text.startsWith('הייצוג ממתין לאישור הלקוח · נבדק'), l.text);
    equal(l.tone, 'required');
    equal(shaamReconcileLine(reconciled([row('מס הכנסה', 'נקלט בהצלחה')]))!.tone, 'success');
  }),

  // ── בדיקות מקור: המבנה שחוסם את סוגי הבאגים ─────────────────────────────
  test('מסך · «בדוק קבלת הייצוג» מופיע כטקסט רק בכפתור המרכזי', () => {
    equal((code(CENTER_SOURCE).match(/בדוק קבלת הייצוג/g) ?? []).length, 0, 'לא בתוך המרכז עצמו');
    equal((RECONCILE_SOURCE.match(/'בדוק קבלת הייצוג'/g) ?? []).length, 1, 'כפתור אחד');
    equal((CENTER_SOURCE.match(/<RepresentationReconcileButton/g) ?? []).length, 1, 'מוצג פעם אחת, ליד הכותרת');
  }),

  test('מסך · בדיקה שהצליחה אינה מסתכמת ב«נבדק» — השורה היא התוצאה, מהנתון השמור', () => {
    assert(!/'נבדק'/.test(code(RECONCILE_SOURCE)), 'אין יותר «נבדק» כתוצאה');
    assert(CENTER_SOURCE.includes('last: niReconcileLine('), 'ב״ל: השורה נקראת מהנתון השמור');
    assert(CENTER_SOURCE.includes('last: shaamReconcileLine('), 'שע״ם: השורה נקראת מהנתון השמור');
  }),

  test('מסך · הכפתור צמוד לכותרת, ותוצאת ב״ל מוצגת פעם אחת', () => {
    assert(/<RepresentationReconcileButton heading=\{<div className="card-title">/.test(CENTER_SOURCE), 'הכותרת עוברת אל שורת הכפתור');
    assert(!/justifyContent: 'space-between'[^\n]*\n[^\n]*card-title">ביצוע הייצוג/.test(CENTER_SOURCE), 'לא בקצה השני של השורה');
    assert(/external && view\.showExternalEvidence && !resultShownAbove/.test(CENTER_SOURCE), 'התיבה בשלב 4 יורדת כשהשורה למעלה קיימת');
  }),

  test('מסך · בלי הוראת «בדקו» כללית, בלי «יש להזין מחדש» קשיח, בלי מילוי ורדרד', () => {
    for (const bad of ['בדקו מול שע״ם אם הייצוג נקלט', 'בדקו באתר ב״ל שהאישור נקלט', 'בדקו בשע״ם אם הייצוג נקלט', "var(--red-light)", 'ShaamLifecyclePanel']) {
      assert(!code(CENTER_SOURCE).includes(bad), `נמצא במרכז: ${bad}`);
    }
  }),

  test('מסך · פעולות עמודה עוברות דרך columnAction (אין «בדוק» בעמודה)', () => {
    assert(/action=\{columnAction\(niActionFor\(role\)\)\}/.test(CENTER_SOURCE), 'ב״ל');
    assert(/const a = columnAction\(shaamActionFor\(sub\)\)/.test(CENTER_SOURCE), 'שע״ם');
  }),
];
