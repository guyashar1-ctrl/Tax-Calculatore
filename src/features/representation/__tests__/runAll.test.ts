// ─── «הפעל הכול» (269/270): מה ירוץ, ואיך השרשרת נבנית ──────────────────────────
// המקרה: זוג נשוי, עסק חדש — מ"ה ומע"מ בשע״ם, וב״ל לשניהם (נתוני דמה).

import { test, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, RepresentationRequest } from '../../../types';
import type { AutomationJob } from '../../../types/automation';
import { runAllPlan } from '../runAllPlan';
import { runChain, chainsOf, type RunAllDeps } from '../../../lib/runAllStart';

const client = (over: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראלה', lastName: 'ישראלי', idNumber: '000000018', birthDate: '1995-07-16',
  phone: '0500000000', email: 'a@example.test',
  familyStatus: 'married', spouseFirstName: 'ישראל', spouseLastName: 'ישראלי', spouseIdNumber: '000000026',
  spouseBirthYear: 1995, spousePhone: '0500000001',
  representationStatus: 'awaiting_accountant',
  taxFiles: [
    { id: 't1', authority: 'vat', owner: 'client', fileNumber: '000000018', repStatus: 'pending' },
    { id: 't2', authority: 'income_tax', owner: 'client', fileNumber: '000000018', repStatus: 'pending' },
    { id: 't3', authority: 'national_insurance', owner: 'client', fileNumber: '000000018', repStatus: 'pending' },
    { id: 't4', authority: 'national_insurance', owner: 'spouse', fileNumber: '000000026', repStatus: 'pending' },
  ],
  authorityRepresentations: {
    vat: { level: 'primary', status: 'in_process' },
    incomeTax: { level: 'primary', status: 'in_process' },
    nationalInsurance: { status: 'in_process', targets: ['client', 'spouse'] },
  },
  ...over,
} as unknown as Client);

const request = (over: Partial<RepresentationRequest> = {}): RepresentationRequest => ({
  id: 'r1', linkedClientId: 'c1', status: 'awaiting_accountant', onboardingStatus: 'submitted',
  authorities: ['vat', 'incomeTax'], execution: {},
  identification: { secondaryType: 'parentId', secondaryValue: '000000034', birthDate: '1995-07-16' },
  ...over,
} as unknown as RepresentationRequest);

const job = (id: string, status: AutomationJob['status'], input: Record<string, unknown>): AutomationJob =>
  ({ id, status, input, actionType: 'x', clientId: 'c1' } as unknown as AutomationJob);

/** תלויות מדומות: רושמות מה נקרא, ומחזירות לפי מצב «השרת». */
function fakeDeps(latest: AutomationJob | null) {
  const calls: string[] = [];
  let n = 0;
  const deps: RunAllDeps = {
    fetchLatest: async () => ({ job: latest }),
    start: async ({ input }) => {
      calls.push(`start:${String(input.role)}`);
      return { ok: true, code: 'created', job: job(`j${++n}`, 'queued', input) };
    },
    after: async (_c, _a, input, afterId) => {
      calls.push(`after:${String(input.role)}>${afterId}`);
      return { ok: true, followup: { id: `f${++n}`, actionType: 'x', input, afterJobId: afterId, status: 'waiting', createdAt: '' } };
    },
  };
  return { deps, calls };
}

export const TESTS: TestCase[] = [
  test('זוג, עסק חדש: שע״ם (מ"ה+מע"מ) אחת, וב״ל לכל אחד', () => {
    const items = runAllPlan(request(), client());
    deepEqual(items.map(i => i.key), ['shaam:person:client', 'btl:client', 'btl:spouse']);
    equal(items.every(i => !!i.input), true, JSON.stringify(items.map(i => i.blocked)));
  }),
  test('שע״ם שכבר הוזנה ידנית — לא ירוץ שוב', () => {
    const items = runAllPlan(request({ execution: { incomeTax: { enteredAt: '2026-10-21T10:00:00Z' } } } as Partial<RepresentationRequest>), client());
    equal(items.some(i => i.authority === 'shaam'), false);
  }),
  test('ב״ל שכבר הוזן לאדם — לא ירוץ שוב', () => {
    const items = runAllPlan(request({ execution: { nationalInsuranceSpouse: { enteredAt: 'x', referenceNumber: '1' } } } as Partial<RepresentationRequest>), client());
    deepEqual(items.map(i => i.key), ['shaam:person:client', 'btl:client']);
  }),
  test('חסר תאריך לידה ⇒ שע״ם מסומנת «לא ירוץ» עם הסיבה, בן/בת הזוג עדיין ירוץ', () => {
    const items = runAllPlan(request({ identification: { secondaryType: 'parentId', secondaryValue: '1' } } as Partial<RepresentationRequest>),
      client({ birthDate: undefined }));
    const s = items.find(i => i.authority === 'shaam');
    equal(!!s?.blocked && /תאריך לידה/.test(s.blocked), true, JSON.stringify(s));
    equal(!!items.find(i => i.key === 'btl:spouse')?.input, true, 'בן/בת הזוג עדיין ירוץ');
  }),
  test('רווק/ה — ב״ל רק לאדם עצמו', () => {
    const items = runAllPlan(request(), client({ familyStatus: 'single' }));
    equal(items.some(i => i.key === 'btl:spouse'), false);
  }),
  test('בקשה שכבר נחתמה — אין הזנות', () => {
    equal(runAllPlan(request({ status: 'awaiting_authorities' }), client()).some(i => i.authority === 'shaam'), false);
  }),
  test('שרשרת: הראשון נפתח, השני ממתין אחריו', async () => {
    const { deps, calls } = fakeDeps(null);
    const out = await runChain('c1', [
      { key: 'btl:client', actionType: 'btl', input: { role: 'client' }, who: 'client' },
      { key: 'btl:spouse', actionType: 'btl', input: { role: 'spouse' }, who: 'spouse' },
    ], deps);
    deepEqual(calls, ['start:client', 'after:spouse>j1']);
    deepEqual(out.map(o => o.kind), ['started', 'waiting']);
  }),
  test('משימה פתוחה של אדם אחר — לא מבוטלת; מצטרפים אחריה', async () => {
    const { deps, calls } = fakeDeps(job('old', 'needs_human', { role: 'client' }));
    const out = await runChain('c1', [{ key: 'btl:spouse', actionType: 'btl', input: { role: 'spouse' }, who: 'spouse' }], deps);
    deepEqual(calls, ['after:spouse>old']);
    deepEqual(out.map(o => o.kind), ['waiting']);
  }),
  test('ניסיון קודם שנגע ברשות ⇒ «נעצר באמצע», לא ניסיון שקט', async () => {
    const { deps } = fakeDeps(null);
    deps.start = async ({ input }) => ({ ok: false, code: 'requires_acknowledgement', job: job('stuck', 'needs_human', input) });
    const out = await runChain('c1', [
      { key: 'btl:client', actionType: 'btl', input: { role: 'client' }, who: 'client' },
      { key: 'btl:spouse', actionType: 'btl', input: { role: 'spouse' }, who: 'spouse' },
    ], deps);
    deepEqual(out.map(o => o.kind), ['needs_confirm', 'waiting']);
  }),
  test('קיבוץ לפי סוג — שע״ם וב״ל בשרשראות נפרדות, הסדר נשמר', () => {
    const c = chainsOf([
      { key: 'a', actionType: 'shaam', input: {}, who: 'x' },
      { key: 'b', actionType: 'btl', input: {}, who: 'client' },
      { key: 'c', actionType: 'btl', input: {}, who: 'spouse' },
    ]);
    deepEqual(c.map(x => x.map(s => s.key)), [['a'], ['b', 'c']]);
  }),
];
