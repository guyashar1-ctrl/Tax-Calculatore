// ─── בדיקות: מה המסך אומר כשהאוטומציה נעצרה ──────────────────────────────────
// ‼ הכלל שנבדק כאן: כשייתכן ששע״ם כבר עשתה משהו, המסך **לא** מציע «נסה שוב»
// כפעולה ראשית — הוא מציע לבדוק. זה ההבדל בין עבודה בטוחה מול רשות לבין
// «ננסה עד שיעבוד».

import type { AutomationJob } from '../../../types/automation';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  shaamStopState, isShaamMutation, touchedShaam, SHAAM_MUTATION_ACTIONS,
} from '../shaamJobSafety';

function job(over: Partial<AutomationJob> = {}): AutomationJob {
  return {
    id: 'j1', userId: 'u', clientId: 'c', actionType: 'shaam.submit_poa',
    input: {}, status: 'needs_human', attempts: 1, maxAttempts: 1,
    artifacts: [], createdAt: '', updatedAt: '',
    ...over,
  } as AutomationJob;
}
const touched = { externalAttempt: { at: '2026-01-01T00:00:00Z', stage: 'upload_signed_form' } };

export const TESTS: TestCase[] = [
  test('הרשימה תואמת את מה שהשרת מגן עליו', () => {
    equal(isShaamMutation('shaam.create_representation'), true);
    equal(isShaamMutation('shaam.submit_poa'), true);
    equal(isShaamMutation('shaam.check_representation'), false, 'קריאה בלבד אינה מוטציה');
    equal(isShaamMutation(undefined), false);
    equal(SHAAM_MUTATION_ACTIONS.length, 2);
  }),

  test('«נגע בשע״ם» נקרא מהסימן שה-worker כתב', () => {
    equal(touchedShaam(job({ progress: touched })), true);
    equal(touchedShaam(job({ progress: {} })), false);
    equal(touchedShaam(null), false);
  }),

  test('6/7 · תוצאה לא ידועה — בודקים, לא משדרים שוב', () => {
    const s = shaamStopState(job({ errorCode: 'external_outcome_unknown', progress: touched }));
    assert(s, 'stop state');
    equal(s.kind, 'outcome_unknown');
    equal(s.mayHaveActed, true);
    equal(s.allowDirectRetry, false, 'אסור להציע ניסיון ישיר');
    equal(s.suggestCheck, true, 'הצעד הנכון הוא בדיקה');
  }),

  test('7 · שידור דו-משמעי מטופל כמו תוצאה לא ידועה', () => {
    const s = shaamStopState(job({ errorCode: 'ambiguous_submit_result', progress: touched }));
    equal(s?.kind, 'outcome_unknown');
    equal(s?.allowDirectRetry, false);
  }),

  test('2/5 · סימן חסימה/אבטחה עוצר ואינו מציע ניסיון ישיר', () => {
    for (const code of ['shaam_too_many_attempts', 'shaam_access_blocked', 'shaam_card_problem', 'shaam_otp_required']) {
      const s = shaamStopState(job({ errorCode: code }));
      assert(s, code);
      equal(s.kind, 'blocked', code);
      equal(s.allowDirectRetry, false, code);
    }
  }),

  test('9 · מסך לא מזוהה — עצירה, והקוד צריך תיקון', () => {
    const s = shaamStopState(job({ errorCode: 'shaam_unexpected_screen' }));
    equal(s?.kind, 'unexpected_screen');
    equal(s?.allowDirectRetry, false);
  }),

  test('3 · אימות ישות שנדחה — לא ננסה שוב, בודקים מול הלקוח', () => {
    const s = shaamStopState(job({ errorCode: 'entity_verification_failed' }));
    equal(s?.kind, 'verification_rejected');
    equal(s?.allowDirectRetry, false);
    equal(s?.suggestCheck, false, 'בדיקת מצב אינה עוזרת כאן — הנתונים בכרטיס הם הבעיה');
    assert((s?.next ?? '').includes('תאריך לידה'), 'אומר מה לבדוק');
  }),

  test('כשל מקומי לפני נגיעה — ניסיון נוסף מותר', () => {
    const s = shaamStopState(job({ errorCode: 'worker_stopped_before_external', progress: {} }));
    equal(s?.kind, 'before_external');
    equal(s?.mayHaveActed, false);
    equal(s?.allowDirectRetry, true);
  }),

  test('כשל בכתיבת הסימן — לא נגענו, ולכן מותר לנסות', () => {
    const s = shaamStopState(job({ errorCode: 'progress_write_failed_before_external', progress: {} }));
    equal(s?.kind, 'before_external');
    equal(s?.allowDirectRetry, true);
  }),

  test('אין חיבור — מתחברים ומריצים שוב', () => {
    const s = shaamStopState(job({ errorCode: 'awaiting_shaam_auth', progress: {} }));
    equal(s?.kind, 'not_connected');
    equal(s?.mayHaveActed, false);
    equal(s?.allowDirectRetry, true);
  }),

  test('‼ ברירת המחדל הבטוחה: קוד לא מוכר על משימה שנגעה ⇒ «לא ידוע»', () => {
    const s = shaamStopState(job({ errorCode: 'something_new_we_never_saw', progress: touched }));
    equal(s?.kind, 'outcome_unknown');
    equal(s?.mayHaveActed, true);
    equal(s?.allowDirectRetry, false);
  }),

  test('משימה שרצה או הצליחה אינה «עצירה»', () => {
    equal(shaamStopState(job({ status: 'running' })), null);
    equal(shaamStopState(job({ status: 'succeeded' })), null);
    equal(shaamStopState(job({ status: 'queued' })), null);
    equal(shaamStopState(null), null);
  }),

  test('כל מצב עצירה אומר מה קרה ומה הצעד הבא', () => {
    for (const code of [
      'external_outcome_unknown', 'ambiguous_submit_result', 'shaam_access_blocked',
      'shaam_unexpected_screen', 'entity_verification_failed', 'awaiting_shaam_auth',
      'worker_stopped_before_external',
    ]) {
      const s = shaamStopState(job({ errorCode: code, progress: touched }));
      assert(s, code);
      assert(s.title.length > 5, `${code}: כותרת`);
      assert(s.next.length > 10, `${code}: צעד הבא`);
    }
  }),
];
