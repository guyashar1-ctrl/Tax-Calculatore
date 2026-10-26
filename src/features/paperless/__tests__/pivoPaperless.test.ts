// ─── בדיקות: שורת PIVO בבקשת ההקמה בפייפרלס (304) ─────────────────────────────
// ‼ מה נעול כאן:
//   · «צריך אותך» קודם לכל: התחברות, «לא ידוע אם נשמר», פער בסכום.
//   · «לא ידוע» נשאר עד שקריאה מאוחרת יותר הכריעה — לא נעלם מעצמו.
//   · «הוקם» רק מחותמת שהשרת כתב (authorizationCreatedAt), לא מלחיצה.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { AutomationJob } from '../../../types/automation';
import { conflictText, lastCheckText, pivoPaperlessState } from '../pivoPaperless';

const job = (p: Partial<AutomationJob>): AutomationJob => ({
  id: 'j', userId: 'u', clientId: 'c', actionType: 'paperless.setup_client', input: {},
  status: 'succeeded', attempts: 1, maxAttempts: 1, artifacts: [],
  createdAt: '2026-10-26T08:00:00Z', updatedAt: '2026-10-26T08:01:00Z', finishedAt: '2026-10-26T08:01:00Z', ...p,
});
const step = (payload: Record<string, unknown> = {}) => ({ status: 'pending' as const, payload });
const S = (p: Partial<Parameters<typeof pivoPaperlessState>[0]>) =>
  pivoPaperlessState({ setupJob: null, checkJob: null, step: step(), ...p }).kind;

export const TESTS: TestCase[] = [
  test('בלי משימה ובלי חותמת ⇒ «הקם בפייפרלס»', () => {
    equal(S({}), 'idle');
  }),

  test('משימה רצה / ממתינה ⇒ «מקים…»; בדיקה רצה ⇒ «בודק…»', () => {
    equal(S({ setupJob: job({ status: 'queued' }) }), 'running');
    equal(S({ setupJob: job({ status: 'running' }) }), 'running');
    const r = pivoPaperlessState({ setupJob: null, checkJob: job({ actionType: 'paperless.check_card', status: 'running' }), step: step() });
    equal(r.kind === 'running' && r.what, 'check');
  }),

  test('ממתינה להתחברות לפייפרלס ⇒ «צריך אותך», גם כשיש פער', () => {
    equal(S({ setupJob: job({ status: 'needs_human', errorCode: 'awaiting_paperless_auth' }), step: step({ paperlessConflict: { agreedBeforeVat: 250 } }) }), 'login');
  }),

  test('נקטעה אחרי שהתחילה לכתוב ⇒ «לא ידוע», עד שקריאה מאוחרת יותר הכריעה', () => {
    const cut = job({ status: 'failed', progress: { externalAttempt: { at: 'x', stage: 'amount' } } as AutomationJob['progress'], finishedAt: '2026-10-26T08:05:00Z' });
    equal(S({ setupJob: cut }), 'unknown');
    equal(S({ setupJob: job({ status: 'needs_human', errorCode: 'external_outcome_unknown' }) }), 'unknown');
    const older = job({ actionType: 'paperless.check_card', status: 'succeeded', finishedAt: '2026-10-26T08:00:00Z' });
    equal(S({ setupJob: cut, checkJob: older }), 'unknown');
    const later = job({ actionType: 'paperless.check_card', status: 'succeeded', finishedAt: '2026-10-26T09:00:00Z' });
    // הוכרע ולא נשמר ⇒ «לא הושלם» (ואפשר לנסות שוב); הוכרע ונשמר ⇒ ממתין לכרטיס.
    equal(S({ setupJob: cut, checkJob: later }), 'failed');
    equal(S({ setupJob: cut, checkJob: later, retainer: { payload: { authorizationCreatedAt: '2026-10-26T09:00:00Z' } } }), 'waitingCard');
  }),

  test('נכשלה לפני שנגעה ⇒ «לא הושלם» עם הסיבה', () => {
    const r = pivoPaperlessState({ setupJob: job({ status: 'failed', errorDetail: 'הלקוח עוד לא מופיע ברשימת העוסקים' }), checkJob: null, step: step() });
    equal(r.kind, 'failed');
    equal(r.kind === 'failed' && r.detail, 'הלקוח עוד לא מופיע ברשימת העוסקים');
  }),

  test('פער בסכום ⇒ conflict, והמשפט אומר את שני הסכומים', () => {
    const r = pivoPaperlessState({ setupJob: job({}), checkJob: null, step: step({ paperlessConflict: { paperlessBeforeVat: 200, agreedBeforeVat: 250, paperlessPayment: 'credit' } }) });
    equal(r.kind, 'conflict');
    if (r.kind === 'conflict') equal(conflictText(r.conflict), 'בפייפרלס כבר מוגדר 200 ₪ + מע״מ, ובהסכם 250 ₪ + מע״מ. PIVO לא שינה.');
    equal(conflictText({ paperlessBeforeVat: null, agreedBeforeVat: 250, paperlessPayment: 'bank' }),
      'בפייפרלס מוגדר «העברה בנקאית», ובהסכם 250 ₪ + מע״מ בכרטיס אשראי. PIVO לא שינה.');
  }),

  test('«הוקם» רק מחותמת השרת; כרטיס שהוזן גובר', () => {
    const waiting = pivoPaperlessState({ setupJob: job({}), checkJob: null, step: step({ pivoCheckedAt: '2026-10-27T04:45:00Z' }),
      retainer: { payload: { authorizationCreatedAt: '2026-10-26T08:01:00Z', authorizationBy: 'pivo' } } });
    equal(waiting.kind, 'waitingCard');
    equal(waiting.kind === 'waitingCard' && waiting.byPivo, true);
    equal(S({ setupJob: job({}) }), 'idle');
    const card = pivoPaperlessState({ setupJob: job({}), checkJob: null, step: step(),
      retainer: { payload: { authorizationCreatedAt: 'a', cardEnteredAt: '2026-10-28T04:45:00Z', cardEnteredBy: 'pivo' } } });
    equal(card.kind, 'cardEntered');
  }),
  test('306 · «בדוק בפייפרלס»: מה הבדיקה האחרונה ראתה — במילים, בלי «נכשל» על «עוד אין כרטיס»', () => {
    const f = () => 'היום 07:45';
    const c = (p: Partial<AutomationJob>) => lastCheckText(job({ actionType: 'paperless.check_card', ...p }), f);
    equal(lastCheckText(null, f), null);
    equal(c({ status: 'running' })?.running, true);
    equal(c({ result: { observed: { inRetainer: true, cardEntered: false } } })?.text, 'PIVO בדק היום 07:45 · עוד אין כרטיס בפייפרלס');
    equal(c({ result: { observed: { inRetainer: true, cardEntered: true } } })?.text, 'PIVO בדק היום 07:45 · הכרטיס הוזן · החודש עוד לא חויב');
    equal(c({ result: { observed: { inRetainer: true, cardEntered: true, chargedPeriods: ['2610'] } } })?.text, 'PIVO בדק היום 07:45 · הכרטיס הוזן והחודש חויב');
    equal(c({ result: { observed: { inRetainer: false } } })?.text, 'PIVO בדק היום 07:45 · הלקוח לא נמצא בטבלת הריטיינר');
    equal(c({ status: 'needs_human', errorCode: 'awaiting_paperless_auth' })?.text, 'צריך להתחבר לפייפרלס — הבדיקה תמשיך לבד');
  }),
];
