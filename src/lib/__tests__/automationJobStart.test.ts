// ─── בדיקות: הפעלת משימה מלחיצה — ניסיון חדש אחרי «לא ידוע אם נקלט» ─────────
// ‼ האירוע (23.09.2026): משימת shaam.submit_poa נעצרה אחרי שכבר נגעה בשע״ם.
// שש לחיצות על הכפתור הראשי ביקשו ביטול בלי אישור, השרת סירב, ולא נוצר כלום.
// כאן נבדק המעבר המלא — עם מסד מדומה, בלי שע״ם.

import type { AutomationJob } from '../../types/automation';
import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { startAutomationJob, startJobMessage, type StartJobDeps } from '../automationJobStart';
import { jobIsLive } from '../automationJobLease';

/** מסד מדומה עם אותם חוקים כמו השרת: פתוחה אחת לכל (לקוח, פעולה); 196. */
function fakeDb(initial: AutomationJob[]) {
  const jobs = [...initial];
  const calls: string[] = [];
  let seq = 0;
  const open = (j: AutomationJob) => ['queued', 'running', 'needs_human'].includes(j.status);
  const deps: StartJobDeps = {
    async fetchLatest(clientId, actionType) {
      calls.push('fetch');
      const j = jobs.filter(x => x.clientId === clientId && x.actionType === actionType).slice(-1)[0] ?? null;
      return { job: j };
    },
    async cancel(id, ack) {
      calls.push(`cancel:${ack}`);
      const j = jobs.find(x => x.id === id);
      if (!j) return { ok: false, error: 'not_cancellable' };
      const touched = !!(j.progress as Record<string, unknown> | undefined)?.externalAttempt;
      if (!ack && touched && j.actionType === 'shaam.submit_poa') return { ok: false, error: 'external_attempt_requires_acknowledgement' };
      if (!open(j)) return { ok: false, error: 'not_cancellable' };
      j.status = 'cancelled';
      return { ok: true };
    },
    async create(clientId, actionType, input) {
      calls.push('create');
      const existing = jobs.find(x => x.clientId === clientId && x.actionType === actionType && open(x));
      if (existing) return { ok: true, created: false, job: existing };
      const j = { id: `new-${++seq}`, clientId, actionType, status: 'queued', input, progress: {} } as unknown as AutomationJob;
      jobs.push(j);
      return { ok: true, created: true, job: j };
    },
    // ‼ הכלל האמיתי: queued חי; running חי רק עם חכירה בתוקף.
    isLive: (j) => jobIsLive(j),
  };
  return { jobs, calls, deps };
}

const UNKNOWN = {
  id: '6cb22ea9', clientId: 'c1', actionType: 'shaam.submit_poa', status: 'needs_human',
  errorCode: 'ambiguous_submit_result',
  progress: { externalAttempt: { at: '2026-09-23T19:54:08.219Z', stage: 'upload_signed_form' } },
  input: { submissionKey: 'person:client' },
} as unknown as AutomationJob;
const ARGS = { clientId: 'c1', actionType: 'shaam.submit_poa', input: { submissionKey: 'person:client' } };

export const TESTS: TestCase[] = [
  test('בלי אישור: סירוב מפורש, לא נוצרת משימה, הקודמת נשארת כפי שהיא', async () => {
    const db = fakeDb([{ ...UNKNOWN }]);
    const r = await startAutomationJob(db.deps, ARGS);
    equal(r.ok, false);
    equal(r.code, 'requires_acknowledgement');
    assert(!db.calls.includes('create'), 'לא נקראה יצירה');
    equal(db.jobs.length, 1);
    equal(db.jobs[0].status, 'needs_human');
    assert((startJobMessage(r) ?? '').includes('כן, נסה שוב'), 'ההודעה אומרת מה ללחוץ');
  }),

  test('עם אישור מפורש: הקודמת נסגרת (היסטוריה), ונוצרת בדיוק משימה חדשה אחת בתור', async () => {
    const db = fakeDb([{ ...UNKNOWN }]);
    const r = await startAutomationJob(db.deps, { ...ARGS, acknowledgeExternal: true });
    equal(r.ok, true);
    equal(r.code, 'created');
    equal(r.replacedJobId, '6cb22ea9');
    equal(db.jobs.find(j => j.id === '6cb22ea9')?.status, 'cancelled');
    const open = db.jobs.filter(j => ['queued', 'running', 'needs_human'].includes(j.status));
    equal(open.length, 1, 'בדיוק משימה פתוחה אחת');
    equal(open[0].status, 'queued');
    equal(db.calls.join(','), 'fetch,cancel:true,create', 'ביטול אחד, יצירה אחת, בלי לולאה');
    equal(startJobMessage(r), null);
  }),

  test('אישור כפול (לחיצה שנייה): משימה חיה כבר קיימת — לא נוצרת שנייה', async () => {
    const db = fakeDb([{ ...UNKNOWN }]);
    await startAutomationJob(db.deps, { ...ARGS, acknowledgeExternal: true });
    const r2 = await startAutomationJob(db.deps, { ...ARGS, acknowledgeExternal: true });
    equal(r2.code, 'already_running');
    equal(db.jobs.filter(j => j.status === 'queued').length, 1);
  }),

  test('ביטול נכשל מסיבה אחרת: לא ממשיכים ליצירה, והודעה מפורשת', async () => {
    const db = fakeDb([{ ...UNKNOWN }]);
    db.deps.cancel = async () => ({ ok: false, error: 'not_cancellable' });
    const r = await startAutomationJob(db.deps, { ...ARGS, acknowledgeExternal: true });
    equal(r.code, 'cancel_failed');
    assert(!db.calls.includes('create'), 'לא נקראה יצירה');
    assert((startJobMessage(r) ?? '').includes('לא נפתח ניסיון חדש'), 'הודעה מפורשת');
  }),

  test('השרת החזיר את הישנה (created=false, needs_human): «לא נוצר», לא «הצליח»', async () => {
    const db = fakeDb([{ ...UNKNOWN }]);
    db.deps.cancel = async () => ({ ok: true });   // «בוטלה» אבל בפועל נשארה פתוחה
    const r = await startAutomationJob(db.deps, { ...ARGS, acknowledgeExternal: true });
    equal(r.ok, false);
    equal(r.code, 'not_created');
  }),

  test('משימה שלא נגעה ברשות (needs_human רגיל): לחיצה רגילה מספיקה', async () => {
    const plain = { ...UNKNOWN, progress: {}, errorCode: 'shaam_unexpected_screen' } as unknown as AutomationJob;
    const db = fakeDb([plain]);
    const r = await startAutomationJob(db.deps, ARGS);
    equal(r.code, 'created');
    equal(db.calls.join(','), 'fetch,cancel:false,create');
  }),

  test('משימה רצה באמת: לא מבטלים, לא יוצרים שנייה', async () => {
    const live = { ...UNKNOWN, status: 'running', progress: {}, leaseUntil: new Date(Date.now() + 60000).toISOString() } as unknown as AutomationJob;
    const db = fakeDb([live]);
    const r = await startAutomationJob(db.deps, { ...ARGS, acknowledgeExternal: true });
    equal(r.code, 'already_running');
    assert(!db.calls.some(c => c.startsWith('cancel')), 'לא ביטלנו משימה חיה');
  }),

  test('שגיאת קריאה: שום דבר לא הופעל', async () => {
    const db = fakeDb([]);
    db.deps.fetchLatest = async () => ({ job: null, error: 'network' });
    const r = await startAutomationJob(db.deps, ARGS);
    equal(r.code, 'fetch_failed');
    assert(!db.calls.includes('create'), 'לא נקראה יצירה');
  }),
];
