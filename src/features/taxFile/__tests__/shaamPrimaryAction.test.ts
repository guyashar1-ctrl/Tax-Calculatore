// ─── בדיקות: חוזה הפעולה הראשית מול שע״ם (24.09.2026) ────────────────────────
// ‼ הבאג שבגללו הקובץ קיים: לקוח ב-0/7 בשע״ם ראה «בדוק קבלת הייצוג» במקום
// «הזן ייפוי כוח בשע״ם», כי הבדיקה שאין כבר בקשה (הדסה סלע) נחשפה ככפתור
// נפרד. עכשיו היא חלק מהפעולה (בעובד, 202), והשלב נגזר בלי תלות בה.
// האותיות (A–L) תואמות לרשימת הבדיקות של המיילסטון.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { AutomationJob } from '../../../types/automation';
import {
  shaamRepresentationAction, shaamLifecycleStage, SHAAM_ENTER_LABEL,
} from '../shaamRepresentationAction';
import type { ShaamRequestTracking, ShaamSystemStatus } from '../../representation/shaamRepresentation';
import { columnAction, isReconcileAction } from '../../representation/representationCenter';
import { shaamStopState } from '../../representation/shaamJobSafety';
import CENTER_SOURCE from '../../../components/RepresentationExecutionCenter.tsx?raw';
import BUTTON_SOURCE from '../../../components/ShaamNextActionButton.tsx?raw';

const code = (src: string) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
const row = (systemLabel: string, rawSystemState: string, rawRequestState = 'המתנה למסמכים'): ShaamSystemStatus => ({
  systemLabel, rawSystemState, rawRequestState, clientName: 'רוקח עידן', enteredAt: '20/09/2026',
});
const SUB = '2026-09-23T20:42:35Z';

export const TESTS: TestCase[] = [
  test('A · 0/7 — הפעולה הראשית היא «הזן ייפוי כוח בשע״ם»', () => {
    const a = shaamRepresentationAction('pending_signature', undefined, false);
    equal(a?.kind, 'create');
    equal(a?.label, SHAAM_ENTER_LABEL);
    equal(SHAAM_ENTER_LABEL, 'הזן ייפוי כוח בשע״ם');
    equal(a?.disabled, undefined);
    equal(shaamLifecycleStage('pending_signature', undefined, false), 'not_started');
  }),

  test('B · «טרם נבדק» אינו שלב: בלי בדיקה, או בדיקה שלא מצאה — אותה פעולה', () => {
    for (const t of [undefined, {}, { syncedAt: '2026-09-24T08:00:00Z' }, { syncedAt: 'x', notInListAt: 'x', systems: [] }] as (ShaamRequestTracking | undefined)[]) {
      equal(shaamRepresentationAction('awaiting_accountant', t, false)?.kind, 'create', JSON.stringify(t));
    }
  }),

  test('D · נמצאה בקשה קיימת («הזן» בדק ומצא) ⇒ לעולם לא «הזן» שוב; השלב הבא נגזר מהמצב', () => {
    const found: ShaamRequestTracking = {
      foundBeforeCreateAt: '2026-09-24T09:00:00Z', syncedAt: 'x', observedAt: 'x',
      systems: [row('מס הכנסה', 'בטיפול'), row('מעמ', 'בטיפול')],
    };
    equal(shaamLifecycleStage('pending_signature', found, false), 'signatures_pending');
    const a = shaamRepresentationAction('pending_signature', found, false);
    assert(a?.kind !== 'create', 'אין יצירה על בקשה קיימת');
    equal(a?.kind, 'submit');
    equal(a?.disabled, true);
    equal(shaamRepresentationAction('pending_signature', { ...found, requestNumber: '2026500001' }, true)?.kind, 'submit');
  }),

  test('E · השורות שנמצאו אינן בקשה אחת ⇒ לא משדרים (ולא יוצרים)', () => {
    const two: ShaamRequestTracking = { systems: [row('מס הכנסה', 'בטיפול'), row('מס הכנסה', 'בטיפול')] };
    equal(shaamLifecycleStage('pending_signature', two, true), 'ambiguous');
    const a = shaamRepresentationAction('pending_signature', two, true);
    equal(a?.kind, 'submit');
    equal(a?.disabled, true);
  }),

  test('E · עצירה בבדיקה שלפני היצירה — «לא נגענו», עם צעד הבא ברור', () => {
    for (const errorCode of ['preflight_ambiguous', 'preflight_unreadable']) {
      const s = shaamStopState({ status: 'needs_human', errorCode, actionType: 'shaam.create_representation', progress: {} } as unknown as AutomationJob);
      equal(s?.mayHaveActed, false);
      assert(/שום דבר לא נשלח/.test(s!.next), s!.next);
      assert(/בקשות בתהליך/.test(s!.next), 'אומר איפה להסתכל');
    }
  }),

  test('F · מחשב האוטומציה כבוי אינו משנה את הפעולה העסקית, והמסך אומר למה לא ירוץ', () => {
    equal(shaamRepresentationAction('pending_signature', undefined, false)?.label, SHAAM_ENTER_LABEL);
    assert(/gate\.workerOffline/.test(code(BUTTON_SOURCE)), 'הכפתור קורא את מצב העובד');
    assert(BUTTON_SOURCE.includes('מחשב האוטומציה כבוי'), 'הודעה גלויה, לא רק tooltip');
  }),

  test('G · יישוב אינו מחליף את הפעולה הראשית', () => {
    const a = shaamRepresentationAction('pending_signature', undefined, false);
    equal(isReconcileAction(a?.kind), false);
    equal(columnAction(a)?.kind, 'create');
    // מה שכן יישוב — אחרי הגשה — לעולם לא בעמודה.
    equal(columnAction(shaamRepresentationAction('awaiting_authorities', { requestNumber: '1', submittedAt: SUB }, true)), null);
  }),

  test('H · «הזן» מצויר פעם אחת לכל אדם — בשלב 1, לא בראש העמודה', () => {
    const src = code(CENTER_SOURCE);
    equal((src.match(/shaamNode\(sub, 'create'\)/g) ?? []).length, 1, 'בשלב של ההגשה');
    assert(/columnAction\(shaamActionFor\(shaamLeadSubmission\)\)\?\.kind !== 'create'/.test(src), 'ראש העמודה מדלג על «הזן»');
    assert(!/הזן את הפרטים בשע״ם/.test(src), 'אין תווית ישנה');
  }),

  test('I · חתום ומוחתם ⇒ «שלח טופס חתום לשע״ם»', () => {
    const t: ShaamRequestTracking = { requestNumber: '2026500001', formDocumentId: 'poa' };
    equal(shaamLifecycleStage('awaiting_stamp', t, true), 'signed_ready');
    const a = shaamRepresentationAction('awaiting_stamp', t, true);
    equal(a?.kind, 'submit');
    equal(a?.disabled, undefined);
  }),

  test('J · נשלח / השהייה ⇒ אין «הזן» ואין «שלח»', () => {
    const t: ShaamRequestTracking = { requestNumber: '2026500001', submittedAt: SUB, suspensionEndsAt: '2026-10-06' };
    equal(shaamLifecycleStage('awaiting_authorities', t, true), 'submitted');
    const a = shaamRepresentationAction('awaiting_authorities', t, true);
    assert(a?.kind !== 'create' && a?.kind !== 'submit', String(a?.kind));
  }),

  test('J · «ממתין לרשויות» בלי עדות (סומן ידנית / תיק המס בלי מצב שע״ם) ⇒ לא «הזן»', () => {
    equal(shaamLifecycleStage('awaiting_authorities', undefined, false), 'submitted');
    equal(shaamRepresentationAction('awaiting_authorities', undefined, false)?.kind, 'check');
  }),

  test('K · «ממתין לאישור לקוח» ⇒ שלב נפרד, ואין «שלח»/«הזן»', () => {
    const t: ShaamRequestTracking = {
      requestNumber: '2026500001', submittedAt: SUB, clientApprovalRequiredAt: '2026-09-24T07:00:00Z',
      observedAt: '2026-09-24T07:00:00Z', systems: [row('מס הכנסה', 'ממתין לאישור לקוח', 'התקבלו המסמכים')],
    };
    equal(shaamLifecycleStage('awaiting_authorities', t, true), 'waiting_client');
    const a = shaamRepresentationAction('awaiting_authorities', t, true);
    assert(a?.kind !== 'create' && a?.kind !== 'submit', String(a?.kind));
  }),

  test('L · פעיל ⇒ סופי, גובר על כל השאר', () => {
    const accepted: ShaamRequestTracking = {
      requestNumber: '2026500001', submittedAt: SUB, observedAt: '2026-09-25T07:00:00Z',
      systems: [row('מס הכנסה', 'נקלט בהצלחה', 'מסמכים אושרו')],
    };
    equal(shaamLifecycleStage('active', accepted, true), 'active');
    equal(shaamRepresentationAction('active', accepted, true), null);
    // שע״ם אמרה שהכול נקלט לפני שהסטטוס זז — כבר סופי, בלי פעולה.
    equal(shaamLifecycleStage('awaiting_authorities', accepted, true), 'active');
    equal(shaamRepresentationAction('awaiting_authorities', accepted, true), null);
    // «פעיל» בלי שום ראיה מהרשות — אין מה להציע, ובוודאי לא «הזן».
    equal(shaamRepresentationAction('active', undefined, false), null);
  }),
];
