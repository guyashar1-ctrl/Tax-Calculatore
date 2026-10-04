// ─── בדיקות: שורת המסלול בכרטיס הלקוח ──────────────────────────────────────
// ‼ מה נעול כאן:
//   · סדר הביצוע = עומק «נפתח אחרי», לא המקום ברשימה; שני שלבים באותו רגע — רגע אחד.
//   · «אחרי פריט» נמדד מהשלב של הפריט אצל הלקוח הזה.
//   · השורה: שם (+ שנה במסלול שנתי) · איפה ואצל מי · «הבא:»; בעצירה — המשפט הקבוע.
//   · גרסה/הצעה — סימן בתוך השורה; «רק בדף» — בלי תזכורת גם אם נשאר ערך ישן.
//   · צירוף מאוחר: רק בקשה חופשית/מסמכים, פתוחה, מחוץ למסלול, שנוצרה אחרי ההפעלה — וסימן בשורה.
//   · «לבד» רק כשהריצה הורשתה; «כבר נקרא השבוע» אינו «ממתין לך».
//   · «אצל מי» נספר לפי השורות שהרשימה מציגה (שרשרת מקופלת = שורה אחת).
//   · בקשה שדולגה בלי «אין צורך» (counts.stuck): השלב לעולם לא «הושלם», ונאמר למה הוא מחכה.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { ClientFlowRun, RunStage } from '../../../features/flows/api';
import { REPEATABLE_STEP_TYPES } from '../../../features/flows/compile';
import { DELIVERY_LABELS } from '../../../features/flows/types';
import {
  actionStatus, endedStageText, isSpouseConfirmTask, lateCandidates, nextStageKeys, previousRunText, rowCounts, runAutoPermitted, runLine,
  runMoments, spouseTaskName, stageDeliveryLines, stageStuckLine, stageWho, PAUSED_LINE, type RunNames, kindWaitPart,
} from '../runSummary';
import { countRequestsNeedingMe, stepAttention } from '../../../utils/requestAttention';
import type { OnboardingStep } from '../../../types/onboarding';

const counts = (p: Partial<RunStage['counts']> = {}): RunStage['counts'] =>
  ({ total: 0, done: 0, client: 0, office: 0, external: 0, unannounced: 0, drafts: 0, awaitingStage: 0, ...p });
const stage = (key: string, name: string, opens: RunStage['opens'], state: RunStage['state'], extra: Partial<RunStage> = {}): RunStage =>
  ({ key, name, opens, delivery: 'approve', notifyOffice: false, state, counts: counts(), actions: null, ...extra });
const run = (stages: RunStage[], extra: Partial<ClientFlowRun> = {}): ClientFlowRun => ({
  id: 'r1', flowId: 'f1', flowName: 'דוח שנתי', trigger: 'annual', version: 1, currentVersion: 1, upgradeAvailable: false,
  cycleKey: '2026', status: 'active', startedAt: '2026-09-01T08:00:00Z', stages, suggestions: 0, ...extra,
});
const names = (itemStages: Record<string, string> = {}): RunNames => ({
  stage: k => ({ a: 'איסוף', b: 'אישור הלקוח', c: 'שכר', d: 'חיבורים' } as Record<string, string>)[k] ?? 'שלב',
  item: k => (k === 'i1' ? 'מסמכים לפתיחת התיק' : 'בקשה'),
  itemStage: k => itemStages[k],
});

export const TESTS: TestCase[] = [
  test('רגעים: לפי עומק השרשרת — שלב שהוגדר ראשון אבל נפתח אחרי פריט בא אחרי השלב של הפריט', () => {
    const r = run([
      stage('c', 'שכר', { after: 'item', item: 'i1' }, 'waiting'),
      stage('a', 'איסוף', { after: 'start' }, 'open'),
      stage('d', 'חיבורים', { after: 'start' }, 'open'),
      stage('b', 'אישור הלקוח', { after: 'stage', stage: 'a' }, 'waiting'),
    ]);
    const m = runMoments(r, names({ i1: 'a' }));
    deepEqual(m.map(x => x.label), ['כשהמסלול מתחיל', 'אחרי שהבקשה «מסמכים לפתיחת התיק» הושלמה', 'אחרי שהשלב «איסוף» הושלם']);
    deepEqual(m[0].stages.map(s => s.key), ['a', 'd'], 'שני שלבים באותו רגע — רגע אחד (במקביל)');
    equal(m[0].parallel, 2);
  }),
  test('רגעים: מסלול הקליטה מתחיל «באישור ההצעה»; מעגל לא מפיל', () => {
    const r = run([
      stage('a', 'איסוף', { after: 'stage', stage: 'b' }, 'waiting'),
      stage('b', 'אישור', { after: 'stage', stage: 'a' }, 'waiting'),
      stage('s', 'פתיחה', { after: 'start' }, 'open'),
    ], { trigger: 'quote_approved' });
    const m = runMoments(r, names());
    equal(m[0].label, 'באישור ההצעה');
    equal(m.length, 3);
  }),
  test('רגעים: שלב שלא חל אינו «במקביל»', () => {
    const m = runMoments(run([stage('a', 'איסוף', { after: 'start' }, 'open'), stage('h', 'הצהרת הון', { after: 'start' }, 'not_applicable')]), names());
    equal(m[0].parallel, 1);
  }),
  test('שורה: שם + שנה · שלב פתוח ואצל מי · הבא', () => {
    const r = run([
      stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 3, client: 2, office: 1 }) }),
      stage('b', 'אישור הלקוח', { after: 'stage', stage: 'a' }, 'waiting'),
    ]);
    const l = runLine(r, 'דוד', names());
    equal(l.title, 'דוח שנתי 2026');
    equal(l.where, 'איסוף — 1 אצלך · 2 ממתינים לדוד', 'מה שאצלך קודם');
    equal(l.stage, 'איסוף');
    equal(l.next, 'הבא: אישור הלקוח');
    equal(l.tone, 'blue', 'יש משהו אצלך ⇒ כחול');
  }),
  test('שורה: «הבא» הוא הרגע הקרוב — לא השלב הבא ברשימה', () => {
    const r = run([
      stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 1, client: 1 }) }),
      stage('z', 'סגירת שנה', { after: 'stage', stage: 'b' }, 'waiting'),
      stage('b', 'אישור הלקוח', { after: 'stage', stage: 'a' }, 'waiting'),
    ]);
    equal(runLine(r, 'דוד', names()).next, 'הבא: אישור הלקוח');
    equal(runLine(r, 'דוד', names()).tone, 'gray', 'רק אצל הלקוח ⇒ אפור');
  }),
  test('שורה בעצירה: המשפט הקבוע, בלי «הבא», ענבר', () => {
    const l = runLine(run([stage('a', 'איסוף', { after: 'start' }, 'open')], { status: 'paused' }), 'דוד', names());
    equal(l.where, PAUSED_LINE);
    equal(l.next, null);
    equal(l.tone, 'amber');
  }),
  test('שורה: עדכון והצעה — סימנים בתוך השורה; מסלול ידני בלי שנה', () => {
    const l = runLine(run([stage('a', 'איסוף', { after: 'start' }, 'done')],
      { trigger: 'manual', cycleKey: 'manual:1', upgradeAvailable: true, currentVersion: 2, suggestions: 1 }), 'דוד', names());
    equal(l.title, 'דוח שנתי');
    deepEqual(l.marks.map(m => m.full), ['יש עדכון למסלול', 'פרטי הלקוח השתנו']);
    equal(l.where, 'הכול הושלם');
  }),
  test('שורה: «הכול באישורך» — טיוטות נספרות «מחכים לאישורך»', () => {
    const l = runLine(run([stage('a', 'פתיחה', { after: 'start' }, 'open',
      { delivery: 'hold', counts: counts({ total: 3, client: 1, drafts: 2 }) })]), 'שרון', names());
    equal(l.where, 'פתיחה — 2 מחכים לאישורך · 1 ממתין לשרון');
  }),
  test('שורה: פעולה מול רשות שנכשלה ⇒ אדום, ומופיעה בשם', () => {
    const l = runLine(run([stage('a', 'איסוף', { after: 'start' }, 'open', {
      counts: counts({ total: 1, client: 1 }),
      actions: [{ itemKey: 'x', ref: { kind: 'action', actionType: 'btl.sync_file' } as never, mode: 'manual', state: null,
        job: { id: 'j', status: 'failed', errorDetail: 'אתר ביטוח לאומי לא ענה בזמן. אפשר לנסות שוב.', createdAt: '2026-09-02T08:00:00Z', auto: false } }],
    })]), 'דוד', names());
    equal(l.tone, 'red');
    assert(l.where.includes('נכשלה'), l.where);
  }),
  test('פעולה: הסבר באנגלית לא מוצג; ממתין לך עם סיבה', () => {
    const f = actionStatus({ itemKey: 'x', ref: { kind: 'action', actionType: 'shaam.sync_income_tax_file' } as never, mode: 'auto', state: null,
      job: { id: 'j', status: 'failed', errorDetail: 'TimeoutError: page.click', createdAt: '', auto: true } }, true);
    equal(f.text, 'נכשל');
    const w = actionStatus({ itemKey: 'x', ref: { kind: 'action', actionType: 'shaam.sync_income_tax_file' } as never, mode: 'auto',
      state: { state: 'waiting_office', reason: 'worker_offline' }, job: null }, true);
    equal(w.text, 'ממתין לך — מחשב העבודה כבוי');
    assert(w.waitsForYou, 'ממתין לך');
  }),
  test('איך מגיע: short + mail מהמקור האחד; «רק בדף» בלי תזכורת', () => {
    const a = stageDeliveryLines({ delivery: 'auto', reminder: { afterDays: 7, max: 3 }, notifyOffice: true });
    equal(a[0], `${DELIVERY_LABELS.auto.short} — ${DELIVERY_LABELS.auto.mail}`);
    equal(a[1], 'תזכורת ללקוח אחרי 7 ימים, עד 3 פעמים · הודעה אליך כשהשלב מסתיים');
    deepEqual(stageDeliveryLines({ delivery: 'page', reminder: { afterDays: 7, max: 3 }, notifyOffice: false }),
      [`${DELIVERY_LABELS.page.short} — ${DELIVERY_LABELS.page.mail}`]);
  }),
  test('אצל מי בשלב: ממתין «הכול באישורך» אומר שיחכה לאישורך', () => {
    equal(stageWho(stage('b', 'x', { after: 'start' }, 'waiting', { delivery: 'hold', counts: counts({ awaitingStage: 2 }) }), 'דוד'),
      'בהמשך · יחכה לאישורך כשייפתח');
    equal(stageWho(stage('b', 'x', { after: 'start' }, 'not_applicable'), 'דוד'), 'לא חל על הלקוח הזה');
  }),
  test('צירוף מאוחר: רק מה שנוצר אחרי ההפעלה, פתוח, מחוץ למסלול, וחוזר', () => {
    const r = run([]);
    const base = { status: 'waiting_client', createdAt: '2026-09-05T00:00:00Z', payload: { title: 'חוזה שכירות' } };
    const steps = [
      { id: 'ok', stepType: 'custom_request', ...base },
      { id: 'old', stepType: 'custom_request', ...base, createdAt: '2026-08-01T00:00:00Z' },
      { id: 'inrun', stepType: 'custom_request', ...base, flowRunId: 'r1' },
      { id: 'done', stepType: 'custom_request', ...base, status: 'completed' },
      { id: 'locked', stepType: 'client_documents', ...base, status: 'locked' },
      { id: 'kyc', stepType: 'kyc_identification', ...base },
      { id: 'smart', stepType: 'custom_request', ...base, payload: { smartForm: { filingId: 'f' } } },
      { id: 'spouse', stepType: 'custom_request', ...base, ball: 'me', payload: { personalConfirmFor: 'i1' } },
      { id: 'docs', stepType: 'client_documents', ...base, payload: {} },
    ];
    deepEqual(lateCandidates(steps, r, REPEATABLE_STEP_TYPES, s => String((s.payload as { title?: string }).title ?? s.id)).map(c => c.id),
      ['ok', 'docs']);
  }),
  test('פעולה: «כבר נקרא השבוע» אינו «ממתין לך» — לא כחול ולא נספר בשורה', () => {
    const recent = { itemKey: 'x', ref: { kind: 'action', actionType: 'btl.sync_file' } as never, mode: 'auto' as const,
      state: { state: 'waiting_office' as const, reason: 'recent_job' }, job: null };
    const s = actionStatus(recent, true);
    assert(!s.waitsForYou, 'לא ממתין לך');
    assert(!/ממתין לך/.test(s.text), s.text);
    const l = runLine(run([stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 1, client: 1 }), actions: [recent] })]), 'דוד', names());
    equal(l.tone, 'gray', 'אין מה לעשות ⇒ אפור');
    assert(!l.where.includes('ממתינה לך'), l.where);
  }),
  test('פעולה: «לבד» רק כשהריצה הורשתה — לא לפי ההגדרה במסלול', () => {
    const a = { itemKey: 'x', ref: { kind: 'action', actionType: 'btl.sync_file' } as never, mode: 'auto' as const, state: null, job: null };
    assert(actionStatus(a, false, true).auto, 'הורשתה ⇒ לבד');
    const no = actionStatus(a, false, false);
    assert(!no.auto && no.text.includes('בלחיצה שלך'), no.text);
    const unknown = actionStatus(a, false, undefined);
    assert(!unknown.auto, 'לא ידוע ⇒ לא מבטיחים «לבד»');
    const notAuth = actionStatus({ ...a, state: { state: 'waiting_office', reason: 'run_not_authorized' } }, true);
    assert(notAuth.waitsForYou && !notAuth.auto && notAuth.text.includes('לא אושר להריץ פעולות לבד'), notAuth.text);
    equal(runAutoPermitted(run([stage('a', 'x', { after: 'start' }, 'open', { actions: [{ ...a, state: { state: 'waiting_office', reason: 'run_not_authorized' } }] })])), false);
    equal(runAutoPermitted(run([stage('a', 'x', { after: 'start' }, 'open', { actions: [{ ...a, state: { state: 'waiting_office', reason: 'worker_offline' } }] })])), true,
      'הגיע לבדיקת המחשב ⇒ ההרשאה כבר נבדקה');
    equal(runAutoPermitted(run([stage('a', 'x', { after: 'start' }, 'waiting', { actions: [a] })])), undefined);
    equal(runAutoPermitted({ stages: [], autoActions: false }), false, 'מה שהשרת שולח גובר');
  }),
  test('שורה: בקשה שנוספה ואפשר לצרף — סימן בשורה הסגורה, עם ניסוח קצר לטלפון', () => {
    const l = runLine(run([stage('a', 'איסוף', { after: 'start' }, 'open')], { upgradeAvailable: true, currentVersion: 2 }), 'דוד', names(), 1);
    deepEqual(l.marks.map(m => m.full), ['נוספה בקשה — לצרף לשלב?', 'יש עדכון למסלול']);
    assert(l.marks.every(m => m.short.length <= 12), l.marks.map(m => m.short).join(' | '));
  }),
  test('אצל מי לפי השורות שברשימה: שרשרת מקופלת נספרת פעם אחת, לפי מצב הראשית', () => {
    const base = counts({ total: 4, client: 3, office: 1 });
    const steps = [
      { id: 'docs', status: 'waiting_client', flowRunId: 'r1', flowStageKey: 'a' },
      { id: 'paperless', status: 'waiting_client', flowRunId: 'r1', flowStageKey: 'a' },
      { id: 'prev-details', status: 'pending', flowRunId: 'r1', flowStageKey: 'a' },
      { id: 'letter', status: 'locked', flowRunId: 'r1', flowStageKey: 'a' },
      { id: 'draft', status: 'pending', flowRunId: 'r1', flowStageKey: 'a' },
      { id: 'other-run', status: 'waiting_client', flowRunId: 'r2', flowStageKey: 'a' },
    ];
    const byId = new Map(steps.map(s => [s.id, s]));
    const rowOf = (s: typeof steps[number]) => (s.id === 'prev-details' ? byId.get('letter')! : s);
    const bucket = (s: typeof steps[number]) => (s.status === 'locked' ? null : s.id === 'draft' ? 'draft' as const : 'client' as const);
    const c = rowCounts('r1', 'a', steps, rowOf, bucket, base)!;
    equal(c.client, 2, 'פרטי הרו״ח הקודם בתוך «מכתב ההעברה» שמוצג «בהמשך» — לא נספרים');
    equal(c.drafts, 1);
    equal(c.office, 0);
    equal(c.total, 4, 'השאר — מהשרת');
    equal(rowCounts('r1', 'zz', steps, rowOf, bucket, base), null, 'אין בקשות של השלב בכרטיס ⇒ נשארים עם השרת');
  }),
  test('משימת האישור האישי: שם השורה שומר על מה מאשרים', () => {
    equal(spouseTaskName('אישור אישי של רותם — «אישור תנאי שכר טרחה»'), 'אישור אישי של רותם · אישור תנאי שכר טרחה');
    equal(spouseTaskName('אישור אישי של רותם'), 'אישור אישי של רותם');
    assert(isSpouseConfirmTask({ ball: 'me', payload: { personalConfirmFor: 'i9' } }), 'משימת משרד עם personalConfirmFor');
    assert(!isSpouseConfirmTask({ ball: 'client', payload: { personalConfirmFor: 'i9' } }), 'רק משימה של המשרד');
    assert(!isSpouseConfirmTask({ ball: 'me', payload: {} }), 'משימה פנימית רגילה');
  }),
  test('משימת האישור האישי: בקשה חובה שמחכה למשרד — כחולה ונספרת בתג; משימה פנימית רגילה לא', () => {
    const step = (payload: Record<string, unknown>, status = 'pending') => ({
      id: 'x', stepType: 'custom_request', ball: 'me', status, payload,
    }) as unknown as OnboardingStep;
    const spouse = step({ title: 'אישור אישי של רותם — «X»', personalConfirmFor: 'i9', officeNote: '…' });
    deepEqual(stepAttention(spouse), { kind: 'mine', tone: 'blue' });
    equal(countRequestsNeedingMe([spouse, step({ title: 'משימה פנימית' })]), 1, 'רק משימת האישור האישי');
    equal(countRequestsNeedingMe([step({ personalConfirmFor: 'i9' }, 'locked')]), 0, 'נעולה (השלב עוד לא נפתח) — לא נספרת');
  }),
  test('דולגה בלי «אין צורך»: השלב לא «הושלם» — גם כשכל השאר נסגר, וגם בשלב שסומן כגמור', () => {
    const open = stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 2, done: 1, stuck: 1 }) });
    const who = stageWho(open, 'דוד');
    assert(!who.includes('הושלם') && who.includes('דולגה בלי «אין צורך»'), who);
    const done = stage('a', 'איסוף', { after: 'start' }, 'done', { doneAt: '2026-09-02T00:00:00Z', counts: counts({ total: 2, done: 1, stuck: 1 }) });
    assert(!stageWho(done, 'דוד').includes('הושלם'), stageWho(done, 'דוד'));
    assert(!endedStageText(done).includes('הושלם'), endedStageText(done));
    equal(endedStageText({ ...done, counts: counts({ total: 2, done: 2 }) }), 'הושלם');
    const clean = stage('a', 'איסוף', { after: 'start' }, 'done', { counts: counts({ total: 2, done: 2 }) });
    assert(stageWho(clean, 'דוד').startsWith('הושלם'), 'בלי דילוג — כרגיל');
  }),

  test('דולגה בלי «אין צורך»: שורת הסבר — השלב מחכה עד «פתח מחדש» או «אין צורך»', () => {
    const one = stageStuckLine(stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 2, stuck: 1 }) }));
    assert(!!one && one.includes('השלב מחכה לה') && one.includes('«אין צורך»') && one.includes('מחדש'), String(one));
    const two = stageStuckLine(stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 3, stuck: 2 }) }));
    assert(!!two && two.startsWith('2 בקשות דולגו'), String(two));
    equal(stageStuckLine(stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 2 }) })), null);
    equal(stageStuckLine(stage('a', 'איסוף', { after: 'start' }, 'done', { counts: counts({ total: 2, stuck: 1 }) })), null, 'שלב שנסגר לא «מחכה»');
  }),

  test('דולגה בלי «אין צורך»: השורה הסגורה — לא «הכול הושלם», ונספרת כעבודה אצלך', () => {
    const r1 = run([stage('a', 'איסוף', { after: 'start' }, 'done', { counts: counts({ total: 1, stuck: 1 }) })]);
    const l1 = runLine(r1, 'דוד', names());
    assert(l1.who !== 'הכול הושלם' && l1.who.includes('דולגה'), l1.who);
    equal(l1.tone, 'blue');
    const r2 = run([stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 2, done: 1, stuck: 1 }) })]);
    const l2 = runLine(r2, 'דוד', names());
    assert(l2.who.includes('דולגה בלי «אין צורך»'), l2.who);
    equal(l2.tone, 'blue');
  }),

  test('rowCounts שומר את מה שרק השרת יודע — stuck ו-gates', () => {
    const base = counts({ total: 3, done: 1, stuck: 1, gates: 2 });
    const c = rowCounts('r1', 'a', [{ id: 's', status: 'skipped', flowRunId: 'r1', flowStageKey: 'a' }], s => s, () => null, base)!;
    equal(c.stuck, 1);
    equal(c.gates, 2);
  }),
  // ‼ (4.10.2026, B1) ענף שכבר ידוע שלא יחול (willApply=false מהשרת) — לא «בהמשך», לא «במקביל» ולא «הבא».
  test('ענף שלא יחול על הלקוח — «לא חל», בלי «במקביל» ובלי «הבא»', () => {
    const notMine = { willApply: false } as Partial<RunStage>;
    const r = run([
      stage('a', 'איסוף', { after: 'start' }, 'open'),
      stage('b', 'אישור הלקוח', { after: 'stage', stage: 'a' }, 'waiting'),
      stage('c', 'שכר', { after: 'stage', stage: 'a' }, 'waiting', notMine),
      stage('d', 'חיבורים', { after: 'stage', stage: 'a' }, 'waiting'),
    ]);
    const m = runMoments(r, names());
    equal(m[1].parallel, 2, 'שני ענפים חלים — לא שלושה');
    deepEqual([...nextStageKeys(r, names())].sort(), ['b', 'd']);
    equal(stageWho(r.stages[2], 'דוד'), 'לא חל על הלקוח הזה');
    equal(runLine(r, 'דוד', names()).next, 'הבא: אישור הלקוח ועוד 1');
    // סוג העוסק לא ידוע — «מחכה לסוג העוסק», לא «לא חל» (217).
    equal(stageWho({ ...r.stages[2], waitingKind: true }, 'דוד'), 'מחכה לסוג העוסק');
    // בלי השדה (שרת ישן) — כמו קודם.
    const old = run(r.stages.map(x => ({ ...x, willApply: undefined }) as RunStage));
    equal(runMoments(old, names())[1].parallel, 3);
  }),

  // ‼ (4.10.2026, B7) ריצה שנסגרה עם סיום ההתקשרות — לא «נסגר באמצע»; וכשהלקוח חזר — הבקשות עברו לקליטה.
  test('ריצה שנסגרה עם סיום ההתקשרות: השלב, ו«קודם:» אצל לקוח שחזר', () => {
    const open = stage('a', 'איסוף', { after: 'start' }, 'open');
    equal(endedStageText(open, 'engagement_ended'), 'נסגר עם סיום ההתקשרות');
    equal(endedStageText(open), 'נסגר באמצע');
    const prev = run([open], { trigger: 'quote_approved', flowName: 'קליטת לקוח חדש', status: 'cancelled', cancelledAt: '2026-10-02T09:00:00Z', closedBy: 'engagement_ended' });
    equal(previousRunText(prev, { trigger: 'quote_approved' }), 'קליטת לקוח חדש — נסגר עם סיום ההתקשרות 02.10.26; הבקשות שהיו פתוחות בו עברו לקליטה הזו');
    equal(previousRunText({ ...prev, closedBy: null }, { trigger: 'quote_approved' }), 'קליטת לקוח חדש — בוטל 02.10.26');
  }),
  // ‼ (4.10.2026, B4) kindWaitItems — «N מחכות לסוג העוסק» בשורת השלב, וסימן בשורה הסגורה.
  test('בקשות שמחכות לסוג העוסק: בשורת השלב ובסימן של הריצה', () => {
    equal(kindWaitPart({}), null);
    equal(kindWaitPart({ kindWaitItems: 0 }), null);
    equal(kindWaitPart({ kindWaitItems: 1 }), '1 מחכה לסוג העוסק');
    equal(kindWaitPart({ kindWaitItems: 2 }), '2 מחכות לסוג העוסק');
    const a = stage('a', 'איסוף', { after: 'start' }, 'open', { counts: counts({ total: 3, client: 1 }), kindWaitItems: 2 });
    equal(stageWho(a, 'דוד'), '2 מחכות לסוג העוסק · 1 ממתין לדוד');
    const b = stage('b', 'אישור הלקוח', { after: 'stage', stage: 'a' }, 'waiting', { kindWaitItems: 1 });
    equal(stageWho(b, 'דוד'), 'בהמשך · 1 מחכה לסוג העוסק');
    // שלב שכולו מחכה לסוג — בלי מספר כפול
    equal(stageWho({ ...b, waitingKind: true }, 'דוד'), 'מחכה לסוג העוסק');
    const l = runLine(run([a, b]), 'דוד', names());
    assert(l.marks.some(m => m.short === 'סוג העוסק'), JSON.stringify(l.marks));
    const none = runLine(run([{ ...a, kindWaitItems: 0 }, { ...b, kindWaitItems: 0 }]), 'דוד', names());
    equal(none.marks.some(m => m.short === 'סוג העוסק'), false);
  }),
];
