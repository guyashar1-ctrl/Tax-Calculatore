// ─── «מה קורה עכשיו» — התצוגה המהירה והכרטיס עונים אותו דבר (ביקורת F:X-2) ────
// · אותו הקשר כמו בכרטיס: ב"ל לפי אדם (niExecution) ומייל חתימה שטרם יצא (repSendPhase).
// · אין «נשלח לחתימת הלקוח» בלי שהמייל יצא.
// · בקשה תקועה (אדומה ב«בקשות») קודמת למשימה הדחופה ביותר.
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import type { Client, Task } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { nextActionForClient } from '../nextActionForClient';

const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const dayIso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

let n = 0;
function step(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType' | 'status'>): OnboardingStep {
  n += 1;
  return {
    id: p.id ?? `s${n}`, clientId: 'c1', engagementId: 'e1', track: 'authorities', scope: 'person', ball: 'client',
    needsAttention: false, payload: {}, completionMethod: 'manual', createdAt: ago(10), publishedAt: ago(10), ...p,
  } as OnboardingStep;
}
function task(p: Partial<Task>): Task {
  n += 1;
  return {
    id: p.id ?? `t${n}`, clientId: 'c1', category: 'management', title: `משימה ${n}`, ballWith: 'me', status: 'open',
    priority: 'normal', createdAt: ago(30), updatedAt: ago(30), ...p,
  } as Task;
}
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'שרון', lastName: 'מזרחי', lifecycleStage: 'active',
  representationStatus: 'active', representationRequestId: 'r1', ...p,
} as Client);

/** ב"ל לבן/בת הזוג — ההוראות כבר יצאו, ממתינים לאישור המבוטח (הלשונית: «ממתין»). */
const niWaitingSteps = [
  step({ id: 'rep', stepType: 'representation', status: 'completed', ball: 'me', completedAt: ago(30) }),
  step({
    id: 'ni-s', stepType: 'authority_representation', status: 'waiting_client', ball: 'client',
    payload: { authority: 'national_insurance', subjectRole: 'spouse', subjectName: 'רותם', representationRequestId: 'r1' },
  }),
];
const niExecution = {
  spouse: { enteredAt: ago(8), referenceNumber: '75160002', deadline: dayIso(14), instructionsSentAt: ago(7) },
};

export const TESTS: TestCase[] = [
  test('ב"ל שממתין למבוטח: עם ההקשר של הכרטיס — «ממתינות לאחרים», לא «לטיפולך»', () => {
    const na = nextActionForClient({ client: client(), quotations: [], openTasks: [], steps: niWaitingSteps, niExecution });
    equal(na?.headline, 'הבקשות ממתינות לאחרים');
    equal(na?.tone, 'calm');
    // ובלי ההקשר — זה הבאג שהתצוגה המהירה הציגה
    const blind = nextActionForClient({ client: client(), quotations: [], openTasks: [], steps: niWaitingSteps });
    assert(blind?.detail?.includes('לטיפולך') ?? false, String(blind?.detail));
  }),
  test('בקשת ייצוג «ממתין לחתימה» שהמייל שלה לא יצא — «מוכן לשליחה ללקוח», לא «נשלח»', () => {
    const steps = [step({ id: 'rep', stepType: 'representation', status: 'waiting_client', ball: 'client' })];
    const c = client({ representationStatus: 'pending_signature' });
    const na = nextActionForClient({ client: c, quotations: [], openTasks: [], steps, repSendPhase: 'unsent' });
    equal(na?.headline, 'הייצוג טרם הושלם');
    equal(na?.detail, 'מוכן לשליחה ללקוח');
    assert(!(na?.detail ?? '').includes('נשלח'), String(na?.detail));
    // המייל יצא ⇒ «נשלח לחתימת הלקוח» הוא אמת
    const sent = nextActionForClient({ client: c, quotations: [], openTasks: [], steps, repSendPhase: null });
    equal(sent?.detail, 'נשלח לחתימת הלקוח');
  }),
  test('בקשה תקועה קודמת למשימה באיחור; המילה הקצרה אומרת שהיא תקועה', () => {
    const steps = [step({ id: 'b', stepType: 'custom_request', status: 'blocked', payload: { title: 'אישור תושבות מהרשות המקומית' } })];
    const late = task({ title: 'לענות למכתב מהרשות', dueDate: dayIso(-5) });
    const na = nextActionForClient({ client: client(), quotations: [], openTasks: [late], steps });
    equal(na?.headline, 'אישור תושבות מהרשות המקומית');
    equal(na?.tone, 'urgent');
    equal(na?.flag, 'תקועה');
  }),
  test('בלי בקשה תקועה — המשימה באיחור, עם «באיחור N ימים»', () => {
    const late = task({ title: 'לענות למכתב מהרשות', dueDate: dayIso(-5) });
    const na = nextActionForClient({ client: client(), quotations: [], openTasks: [late], steps: [] });
    equal(na?.headline, 'לענות למכתב מהרשות');
    equal(na?.flag, 'באיחור 5 ימים');
    equal(na?.buttons[0]?.action, 'openTask');
  }),
];
