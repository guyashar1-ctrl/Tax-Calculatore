// ─── «לטיפולי» במסך המשימות = התג בכותרת (04.10.2026, ביקורת E:X-1) ───────────
// משימה שהכדור בה אצל הלקוח / הרשות — «ממתינים לאחרים», לא «לטיפולי»;
// לקוח בארכיון — לא נספר, אלא אם המסך סונן אליו; התג = מספר השורות ב«לטיפולי».
import { test, equal, deepEqual, type TestCase } from '../../testkit/tinyTest';
import type { Client, Task } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { splitOpenTasks, splitJourneyRows, tasksPageMineCount, taskDisplayTitle } from '../tasksPage';

let n = 0;
function task(p: Partial<Task> & Pick<Task, 'ballWith'>): Task {
  n += 1;
  return {
    id: p.id ?? `t${n}`, clientId: 'c1', category: 'management', title: `משימה ${n}`, status: 'open', priority: 'normal',
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...p,
  } as Task;
}
function step(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType' | 'status' | 'clientId'>): OnboardingStep {
  n += 1;
  return {
    id: p.id ?? `s${n}`, engagementId: 'e1', track: 'tools', scope: 'person', ball: 'client',
    needsAttention: false, payload: {}, completionMethod: 'manual', createdAt: '2026-09-01T00:00:00Z', ...p,
  } as OnboardingStep;
}
const clients = [
  { id: 'c1', lifecycleStage: 'active' },
  { id: 'c2', lifecycleStage: 'onboarding' },
  { id: 'old', lifecycleStage: 'archived' },
] as Pick<Client, 'id' | 'lifecycleStage'>[];

export const TESTS: TestCase[] = [
  test('אצלי ותקועה ⇒ «לטיפולי»; אצל הלקוח / הרשות ⇒ «ממתינים לאחרים»; הושלמה ⇒ אף אחד', () => {
    const tasks = [
      task({ id: 'me', ballWith: 'me' }),
      task({ id: 'stuck', ballWith: 'stuck' }),
      task({ id: 'client', ballWith: 'client' }),
      task({ id: 'auth', ballWith: 'authority' }),
      task({ id: 'done', ballWith: 'me', status: 'done' }),
    ];
    const s = splitOpenTasks(tasks, clients);
    deepEqual(s.mine.map(t => t.id), ['me', 'stuck']);
    deepEqual(s.waiting.map(t => t.id), ['client', 'auth']);
  }),
  test('לקוח בארכיון — לא נספר בשום רשימה; אבל כשהמסך סונן אליו במפורש — כן', () => {
    const tasks = [task({ id: 'a', ballWith: 'me', clientId: 'old' }), task({ id: 'b', ballWith: 'client', clientId: 'old' })];
    equal(splitOpenTasks(tasks, clients).mine.length, 0);
    equal(splitOpenTasks(tasks, clients).waiting.length, 0);
    deepEqual(splitOpenTasks(tasks, clients, 'old').mine.map(t => t.id), ['a']);
    deepEqual(splitOpenTasks(tasks, clients, 'old').waiting.map(t => t.id), ['b']);
  }),
  test('משימה כללית (בלי לקוח בכרטיסים) נספרת', () => {
    equal(splitOpenTasks([task({ ballWith: 'me', clientId: 'system' })], clients).mine.length, 1);
  }),
  test('שורות קליטה: דורשת אותי ⇒ «לטיפולי»; ממתינה ללקוח ⇒ «ממתינים»; לקוח לא מוכר / בארכיון ⇒ לא', () => {
    const steps = [
      // c1: בדיקה שלי (הלקוח סיים) ⇒ לטיפולי
      step({ clientId: 'c1', stepType: 'client_documents', status: 'in_progress', needsAttention: true }),
      // c2: ממתינה ללקוח ⇒ ממתינים
      step({ clientId: 'c2', stepType: 'client_documents', status: 'waiting_client' }),
      // לא מוכר ובארכיון ⇒ לא מוצגים
      step({ clientId: 'ghost', stepType: 'client_documents', status: 'in_progress', needsAttention: true }),
      step({ clientId: 'old', stepType: 'client_documents', status: 'in_progress', needsAttention: true }),
    ];
    const j = splitJourneyRows(steps, clients);
    deepEqual(j.mine.map(s => s.clientId), ['c1']);
    deepEqual(j.waiting.map(s => s.clientId), ['c2']);
  }),
  test('התג בכותרת = משימות שדורשות אותי + שורות קליטה שדורשות אותי', () => {
    const tasks = [task({ ballWith: 'me' }), task({ ballWith: 'client' }), task({ ballWith: 'stuck', clientId: 'c2' })];
    const steps = [step({ clientId: 'c1', stepType: 'client_documents', status: 'in_progress', needsAttention: true })];
    equal(tasksPageMineCount(tasks, clients, steps), 3);
  }),
  test('משימת מערכת: המפתח הפנימי בסוגריים לא מוצג (E:X-12.3)', () => {
    equal(taskDisplayTitle({ clientId: 'system', title: 'בדיקת עדכניות נתוני מרכז הידע - Q4/2026 [בדיקת-עדכניות Q4/2026]' }),
      'בדיקת עדכניות נתוני מרכז הידע - Q4/2026');
  }),
  test('משימת לקוח: סוגריים שהמשתמש כתב נשארים', () => {
    equal(taskDisplayTitle({ clientId: 'c1', title: 'להחזיר טופס [דחוף]' }), 'להחזיר טופס [דחוף]');
  }),
  test('כותרת שכולה מפתח — לא נעלמת', () => {
    equal(taskDisplayTitle({ clientId: 'system', title: '[בדיקת-עדכניות Q4/2026]' }), '[בדיקת-עדכניות Q4/2026]');
  }),
];
