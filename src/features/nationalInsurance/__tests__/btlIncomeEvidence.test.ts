// ─── בדיקות: הראיה האחרונה מרשימת ההכנסות — לכל אדם, לאורך ההיסטוריה (219) ────
// ביקורת שנייה (05.10): «הקריאה האחרונה בכלל» אינה ראיה לכל אדם. משימה שהצליחה
// רק לבן/בת הזוג, או שמקטע ההכנסות שלה נכשל / חלקי / חתוך, אינה מבטלת קריאה
// שלמה קודמת של הלקוח. וגם: בזמן טעינה / שגיאה / החלפת לקוח — לא «מאומת».
//
// ‼ מה נבדק כאן: הלוגיקה שה-hook עוטף (collectIncomeEvidence + deriveIncomeReads),
// והמסכים הצרכנים (כרטיס הרשויות, 6101). עטיפת ה-React עצמה — בדפדפן בלבד.

import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, NiIncomeEntry, NiIncomeList } from '../../../types';
import { niClientIncomeTrust, niIncomeTrust, niIncomeReadsFromJob, niIncomeTrusted } from '../niIncome';
import type { NiIncomeEvidenceJob } from '../niIncome';
import {
  collectIncomeEvidence, deriveIncomeReads, incomeEvidenceKey, liveIncomeReads, newestComplete, retainCompleteReads,
} from '../btlIncomeEvidence';
import type { FetchIncomeJobsPage, IncomeEvidenceState } from '../btlIncomeEvidence';
import { buildAuthorityRows } from '../../../utils/authorityRows';
import { resolve6101 } from '../../smartForms/btl6101/resolve';
import { snapshotFor } from '../../smartForms/btl6101/document';
import { FX_FULL } from '../../smartForms/btl6101/fixtures';

type Role = 'client' | 'spouse';

const row = (p: Partial<NiIncomeEntry>): NiIncomeEntry => ({
  year: 2025, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי',
  amount: 0, receivedDate: null, status: 'תקף', ...p,
});
const DECL = row({ fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', amount: 16500, receivedDate: '2025-06-15' });
const DECL_NEW = row({ year: 2026, fromMonth: 7, toMonth: 7, infoSource: 'הצהרה', amount: 18000, receivedDate: '2026-07-10' });
const SPOUSE_DECL = row({ fromMonth: 3, toMonth: 3, infoSource: 'הצהרה', amount: 8000, receivedDate: '2025-03-15' });

// ── בניית משימות (כפי שהעובד מחזיר) — מהחדשה לישנה לפי סדר המערך ──
const complete = (records: NiIncomeEntry[]) => ({ ok: true, value: null, records, rows: records.length, candidatesComplete: true });
const truncated = (records: NiIncomeEntry[]) => ({ ok: true, value: null, records, rows: records.length + 30, candidatesComplete: false });
const legacyPartial = (r: NiIncomeEntry) => ({ ok: true, rows: 1, value: { ...r, monthlyAmount: r.amount } });
const failed = { ok: false };
const person = (role: Role, directIncome: Record<string, unknown>, ok = true) =>
  ({ role, ok, sections: { directIncome } });
const mkJob = (day: number, ...persons: unknown[]): NiIncomeEvidenceJob =>
  ({ finishedAt: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`, result: { persons } });

/** fetchPage מדומה על רשימה קבועה (מהחדשה לישנה), עם ספירת קריאות. */
function pager(jobs: NiIncomeEvidenceJob[], opts: { failAt?: number } = {}) {
  const calls: number[] = [];
  const fn: FetchIncomeJobsPage = async (offset, limit) => {
    calls.push(offset);
    if (opts.failAt === offset) return { jobs: [], error: 'boom' };
    return { jobs: jobs.slice(offset, offset + limit) };
  };
  return { fn, calls };
}

const AUTO = { source: 'automation' as const, syncedAt: '2026-10-05T09:08:00Z' };
/** לקוח אחרי אישור: הצהרה 16,500 שמורה ומאומתת; בן/בת זוג עם 8,000. */
const trustedClient = (): Client => ({
  ...FX_FULL,
  id: 'c1', familyStatus: 'married', niIncomeBasisMonthly: 16500,
  niIncomeList: { declaration: DECL, assessment: null },
  spouseNiIncomeBasisMonthly: 8000, spouseNiIncomeList: { declaration: SPOUSE_DECL, assessment: null },
  fieldMeta: { niIncomeBasisMonthly: AUTO, niIncomeList: AUTO, spouseNiIncomeBasisMonthly: AUTO, spouseNiIncomeList: AUTO },
}) as unknown as Client;

type Reads = ReturnType<typeof deriveIncomeReads>;
const trustOf = (c: Client, reads: Reads, role: Role = 'client') => niClientIncomeTrust(c, reads[role], role);
const reasonOf = (t: ReturnType<typeof niClientIncomeTrust>) => (t as { reason?: string }).reason;
const ready = (clientId: string, roles: Role[], reads: Awaited<ReturnType<typeof collectIncomeEvidence>>): IncomeEvidenceState =>
  ({ key: incomeEvidenceKey(clientId, roles), status: 'ready', reads });
const derive = (clientId: string | undefined, state: IncomeEvidenceState | null, roles: Role[] = ['client'], liveReads = {}) =>
  deriveIncomeReads({ clientId, roles, state, liveReads });

// הרצף הבסיסי: א׳ (ישנה) — קריאה שלמה של הלקוח בלי הצהרה (סותרת). ב׳ (חדשה) — משהו אחר.
const A_CONTRADICTORY = mkJob(1, person('client', complete([])), person('spouse', complete([SPOUSE_DECL])));

export const TESTS: TestCase[] = [
  test('בסיס: קריאה שלמה וסותרת של הלקוח ⇒ אמון נשלל; בן/בת הזוג נשאר מאומת', async () => {
    const reads = await collectIncomeEvidence(pager([A_CONTRADICTORY]).fn, ['client', 'spouse']);
    const c = trustedClient();
    const d = derive('c1', ready('c1', ['client', 'spouse'], reads), ['client', 'spouse']);
    equal(trustOf(c, d).kind, 'unverified');
    equal(reasonOf(trustOf(c, d)), 'contradicted');
    equal(trustOf(c, d, 'spouse').kind, 'declaration', 'בן/בת הזוג לא נסתרו');
  }),

  test('סתירה, ואחריה הצלחה רק של בן/בת הזוג ⇒ הסתירה נשמרת (בעקבות ביקורת: השחזור השקט)', async () => {
    const B_SPOUSE_ONLY = mkJob(2, person('spouse', complete([SPOUSE_DECL])));
    const reads = await collectIncomeEvidence(pager([B_SPOUSE_ONLY, A_CONTRADICTORY]).fn, ['client', 'spouse']);
    const d = derive('c1', ready('c1', ['client', 'spouse'], reads), ['client', 'spouse']);
    equal(trustOf(trustedClient(), d).kind, 'unverified', 'הצהרת הלקוח לא חזרה להיות מאומתת');
    // ‼ הלוגיקה הישנה (משימה אחרונה בלבד) הייתה אומרת «מאומת» — ההוכחה שהמקרה שבר אותה:
    const latestOnly = niIncomeReadsFromJob({ status: 'succeeded', ...B_SPOUSE_ONLY }).client;
    equal(niClientIncomeTrust(trustedClient(), latestOnly).kind, 'declaration');
  }),

  test('סתירה, ואחריה משימה שהצליחה אבל מקטע ההכנסות נכשל / חלקי / חתוך / האדם נכשל / לא נכלל ⇒ הסתירה נשמרת', async () => {
    const newer: NiIncomeEvidenceJob[] = [
      mkJob(2, person('client', failed)),
      mkJob(2, person('client', legacyPartial(DECL))),
      mkJob(2, person('client', truncated([DECL]))),
      mkJob(2, person('client', complete([]), false)),
      mkJob(2),
    ];
    for (const n of newer) {
      const reads = await collectIncomeEvidence(pager([n, A_CONTRADICTORY]).fn, ['client']);
      const d = derive('c1', ready('c1', ['client'], reads));
      equal(trustOf(trustedClient(), d).kind, 'unverified', JSON.stringify(n.result));
    }
  }),

  test('טעינה מחדש (שליפה חדשה מאפס) ⇒ אותה תוצאה בשני הרצפים — הראיה לא נשענת על זיכרון הדפדפן', async () => {
    const jobsSpouseOnly = [mkJob(2, person('spouse', complete([SPOUSE_DECL]))), A_CONTRADICTORY];
    const jobsFailed = [mkJob(2, person('client', failed)), A_CONTRADICTORY];
    for (const jobs of [jobsSpouseOnly, jobsFailed]) {
      for (let reload = 0; reload < 2; reload++) {
        const reads = await collectIncomeEvidence(pager(jobs).fn, ['client']);
        equal(trustOf(trustedClient(), derive('c1', ready('c1', ['client'], reads))).kind, 'unverified');
      }
    }
  }),

  test('קריאה שלמה מאוחרת עם ההצהרה ⇒ האמון חוזר; קריאה שלמה מאוחרת בסכום אחר ⇒ הישנה נסתרת', async () => {
    const restored = [mkJob(3, person('client', complete([DECL]))), mkJob(2, person('spouse', complete([]))), A_CONTRADICTORY];
    let reads = await collectIncomeEvidence(pager(restored).fn, ['client']);
    equal(trustOf(trustedClient(), derive('c1', ready('c1', ['client'], reads))).kind, 'declaration');

    const changed = [mkJob(3, person('client', complete([DECL_NEW]))), A_CONTRADICTORY];
    reads = await collectIncomeEvidence(pager(changed).fn, ['client']);
    const t = trustOf(trustedClient(), derive('c1', ready('c1', ['client'], reads)));
    equal(t.kind, 'unverified');
    equal(reasonOf(t), 'contradicted');
  }),

  test('בלי תקרה שרירותית: קריאה שלמה אחרי 12 משימות לא רלוונטיות נמצאת; ההיסטוריה נגמרת ⇒ «אין ראיה», בלי מסקנה', async () => {
    const noise = Array.from({ length: 12 }, (_, i) => mkJob(20 - i, i % 2 ? person('spouse', complete([])) : person('client', failed)));
    const p = pager([...noise, A_CONTRADICTORY]);
    const reads = await collectIncomeEvidence(p.fn, ['client'], 5);
    assert(reads.client?.ok, 'נמצאה');
    deepEqual(p.calls, [0, 5, 10], 'נעצר ברגע שנמצאה');
    // אין בכלל קריאה שלמה ⇒ סורק עד הסוף ומחזיר ריק, ואין סתירה ידועה
    const p2 = pager(noise);
    const none = await collectIncomeEvidence(p2.fn, ['client'], 5);
    deepEqual(none, {});
    deepEqual(p2.calls, [0, 5, 10], 'עמוד אחרון חלקי ⇒ נגמרה ההיסטוריה');
    equal(trustOf(trustedClient(), derive('c1', ready('c1', ['client'], none))).kind, 'declaration');
  }),

  test('שליפה שנכשלה (גם בעמוד מאוחר) ⇒ error: ערך אוטומטי לא מאומת; ידני נשמר', async () => {
    const jobs = [mkJob(5, person('spouse', complete([]))), mkJob(4, person('spouse', complete([]))), A_CONTRADICTORY];
    let failedState: IncomeEvidenceState | null = null;
    try { await collectIncomeEvidence(pager(jobs, { failAt: 2 }).fn, ['client'], 2); }
    catch { failedState = { key: incomeEvidenceKey('c1', ['client']), status: 'error' }; }
    assert(failedState, 'השליפה זרקה');
    const d = derive('c1', failedState);
    const t = trustOf(trustedClient(), d);
    equal(t.kind, 'unverified');
    equal(reasonOf(t), 'unavailable');
    const manual = { ...trustedClient(), fieldMeta: { niIncomeBasisMonthly: { source: 'manual' as const } } } as unknown as Client;
    equal(trustOf(manual, d).kind, 'manual');
  }),

  test('טעינה: לפני שהראיה הגיעה ערך אוטומטי אינו מאומת (כרטיס ו-6101); אחרי שהגיעה — כן', async () => {
    const c = trustedClient();
    const loading = derive('c1', null);
    const t = trustOf(c, loading);
    equal(t.kind, 'unverified');
    equal(reasonOf(t), 'checking');
    // הכרטיס
    const facts = buildAuthorityRows(c, undefined, undefined, loading).find(r => r.authority === 'national_insurance')!.persons![0].facts;
    const f = facts.find(x => x.k === 'הכנסה מוצהרת')!;
    assert(/בודק מול הקריאה האחרונה/.test(f.sub![0]), f.sub![0]);
    assert(f.tone !== 'warn', 'טעינה אינה אזהרה');
    // 6101: לא «מאומת» בזמן טעינה
    const r = resolve6101({ client: c, purposes: ['change'], entered: {}, asOf: '2026-10-05', btlIncomeRead: loading.client });
    equal(r.data.incomeBefore, '');
    equal(r.fields.incomeBefore.status, 'missing');
    // הראיה הגיעה (בלי סתירה) ⇒ מאומת
    const reads = await collectIncomeEvidence(pager([mkJob(1, person('client', complete([DECL])))]).fn, ['client']);
    const done = derive('c1', ready('c1', ['client'], reads));
    equal(niIncomeTrusted(trustOf(c, done)), true);
    const r2 = resolve6101({ client: c, purposes: ['change'], entered: {}, asOf: '2026-10-05', btlIncomeRead: done.client });
    equal(r2.data.incomeBefore, '16500');
  }),

  test('טעינה: הזנה ידנית אמיתית נשמרת (לא נשללת בזמן בדיקה)', () => {
    const manual = { ...trustedClient(), fieldMeta: { niIncomeBasisMonthly: { source: 'manual' as const } } } as unknown as Client;
    const loading = derive('c1', null);
    equal(trustOf(manual, loading).kind, 'manual');
    const r = resolve6101({ client: manual, purposes: ['change'], entered: {}, asOf: '2026-10-05', btlIncomeRead: loading.client });
    equal(r.data.incomeBefore, '16500');
  }),

  test('החלפת לקוח לפני סיום השליפה ⇒ המצב של הלקוח הקודם לא דולף; משימה חיה של לקוח אחר מתעלמים ממנה', async () => {
    const reads = await collectIncomeEvidence(pager([A_CONTRADICTORY]).fn, ['client']);
    const stateOfC1 = ready('c1', ['client'], reads);
    // c2 נפתח בזמן שהמצב עדיין של c1 ⇒ טעינה, לא הסתירה של c1 ולא «מאומת»
    deepEqual(derive('c2', stateOfC1).client, { ok: false, unavailable: 'loading' });
    // חזרה ל-c1 ⇒ הראיה שלו
    equal(derive('c1', stateOfC1).client?.ok, true);
    // אותו לקוח, תפקידים שונים (נוסף בן/בת זוג) ⇒ שליפה חדשה, לא מצב ישן
    deepEqual(derive('c1', stateOfC1, ['client', 'spouse']).client, { ok: false, unavailable: 'loading' });
    // משימה חיה שנשארה מלקוח קודם
    const staleJob = { clientId: 'c1', status: 'succeeded', finishedAt: '2026-10-09T00:00:00Z', result: { persons: [person('client', complete([DECL]))] } };
    deepEqual(liveIncomeReads('c2', staleJob), {});
    equal(liveIncomeReads('c1', staleJob).client?.ok, true);
    // בלי לקוח (כרטיס חדש שטרם נשמר) ⇒ אין ראיה נדרשת
    deepEqual(derive(undefined, null), {});
  }),

  test('משימה חיה שהסתיימה גוברת על ההיסטוריה, גם בזמן טעינה; חיה שנכשלה/חלקית/רצה לא מוחקת ראיה', async () => {
    const liveComplete = liveIncomeReads('c1', { clientId: 'c1', status: 'succeeded', finishedAt: '2026-10-09T00:00:00Z', result: { persons: [person('client', complete([]))] } });
    const loading = derive('c1', null, ['client'], liveComplete);
    equal(loading.client?.ok, true, 'קריאה חיה שלמה ⇒ ראיה מיידית');
    equal(trustOf(trustedClient(), loading).kind, 'unverified');

    const reads = await collectIncomeEvidence(pager([A_CONTRADICTORY]).fn, ['client']);
    const liveFailedIncome = liveIncomeReads('c1', { clientId: 'c1', status: 'succeeded', finishedAt: '2026-10-09T00:00:00Z', result: { persons: [person('client', failed)] } });
    const d = derive('c1', ready('c1', ['client'], reads), ['client'], liveFailedIncome);
    equal(trustOf(trustedClient(), d).kind, 'unverified', 'הסתירה מההיסטוריה נשמרת');
    const liveRunning = liveIncomeReads('c1', { clientId: 'c1', status: 'running' });
    equal(trustOf(trustedClient(), derive('c1', ready('c1', ['client'], reads), ['client'], liveRunning)).kind, 'unverified');
  }),

  test('אישור חלקי: רשימה נוקתה אך הסכום לא ⇒ עדיין לא מאומת; סכום חדש אושר בלי הרשימה ⇒ נתמך רק אם הקריאה השלמה מכילה אותו', async () => {
    const reads = await collectIncomeEvidence(pager([A_CONTRADICTORY]).fn, ['client']);
    const d = derive('c1', ready('c1', ['client'], reads));
    const onlyListCleared = { ...trustedClient(), niIncomeList: { declaration: null, assessment: null } as NiIncomeList } as Client;
    equal(trustOf(onlyListCleared, d).kind, 'unverified');
    const newDecl = await collectIncomeEvidence(pager([mkJob(3, person('client', complete([DECL_NEW]))), A_CONTRADICTORY]).fn, ['client']);
    const dNew = derive('c1', ready('c1', ['client'], newDecl));
    const onlyValueApproved = { ...trustedClient(), niIncomeBasisMonthly: 18000 } as Client;
    equal(trustOf(onlyValueApproved, dNew).kind, 'declaration', 'הסכום החדש תואם הצהרה בקריאה השלמה');
    const wrongValue = { ...trustedClient(), niIncomeBasisMonthly: 17000 } as Client;
    equal(trustOf(wrongValue, dNew).kind, 'unverified');
    equal(niIncomeTrust(18000, AUTO, undefined, dNew.client).kind, 'declaration');
  }),

  // ── 6101 על בן/בת זוג ──
  test('6101 להגשה על בן/בת הזוג: הכנסת הלקוח לעולם לא מוצעת כמאומתת; של בן/בת הזוג — לפי הראיה שלו/ה', async () => {
    const c = trustedClient();
    const reads = await collectIncomeEvidence(pager([A_CONTRADICTORY]).fn, ['client', 'spouse']);
    const d = derive('c1', ready('c1', ['client', 'spouse'], reads), ['client', 'spouse']);
    const forClient = resolve6101({ client: c, purposes: ['change'], entered: {}, asOf: '2026-10-05', btlIncomeRead: d.client, subjectRole: 'client' });
    equal(forClient.data.incomeBefore, '', 'של הלקוח נסתרה');
    const forSpouse = resolve6101({ client: c, purposes: ['change'], entered: {}, asOf: '2026-10-05', btlIncomeRead: d.spouse, subjectRole: 'spouse' });
    equal(forSpouse.data.incomeBefore, '8000', 'לא 16,500 של הלקוח');
    // בן/בת זוג בלי עובדות הכנסה משלו/ה — נשאר חסר, גם כשללקוח יש הצהרה מאומתת
    const noSpouseFacts = { ...c, spouseNiIncomeBasisMonthly: undefined, spouseNiIncomeList: undefined } as Client;
    const spouseMissing = resolve6101({ client: noSpouseFacts, purposes: ['change'], entered: {}, asOf: '2026-10-05', subjectRole: 'spouse' });
    equal(spouseMissing.data.incomeBefore, '');
    equal(spouseMissing.fields.incomeBefore.status, 'missing');
    // ובלי subjectRole — כמו קודם (הלקוח)
    equal(resolve6101({ client: c, purposes: ['change'], entered: {}, asOf: '2026-10-05' }).data.incomeBefore, '16500');
  }),

  test('6101 לבן/בת זוג — טופס מעורב לעולם אינו מוכן: חוסם קבוע, ו«נעל» נדחה גם בשרת (has_blockers)', () => {
    const c = trustedClient();
    const isGuard = (i: { code: string; severity: string }) => i.code === 'subject_not_supported' && i.severity === 'blocker';
    for (const purposes of [['change'], ['update_details'], ['multi_year_report']] as const) {
      const spouse = resolve6101({ client: c, purposes: [...purposes], entered: {}, asOf: '2026-10-05', subjectRole: 'spouse' });
      assert(spouse.issues.some(isGuard), `חוסם לבן/בת זוג (${purposes[0]})`);
      const snap = snapshotFor(spouse, []);
      assert(snap.blockers.some((m: string) => m.includes('לבן/בת זוג עדיין לא נתמך')), 'החוסם נשלח לשרת בנעילה');
      // ‼ גם כשכל שאר השדות הוזנו בהגשה — עדיין חוסם.
      const allEntered = resolve6101({ client: FX_FULL, purposes: [...purposes], entered: spouse.data, asOf: '2026-10-05', subjectRole: 'spouse' });
      assert(allEntered.issues.some(isGuard), 'הזנה ידנית לא עוקפת');
      const client = resolve6101({ client: c, purposes: [...purposes], entered: {}, asOf: '2026-10-05', subjectRole: 'client' });
      assert(!client.issues.some(isGuard), 'ללקוח — אין חוסם כזה');
    }
  }),

  // ── ביקורת שלישית: אותו מסך פתוח, משימות חיות מתחלפות ──
  // ‼ אותו מעבר מצבים שההוק עושה בכל רינדור: זיכרון = retainCompleteReads(זיכרון, חי);
  // תצוגה = deriveIncomeReads({... liveReads: חי, retained: זיכרון}). (ההוק עצמו נבדק
  // בדפדפן — ?test-btl-sync&case=live-sequence.)
  test('רצף חי: היסטוריה תקפה → A סותרת → B (בתור/רצה/רק בן-זוג/מקטע נכשל/חלקי/חתוך) → C תקפה', () => {
    const c = trustedClient();
    const roles: Role[] = ['client'];
    const live = (status: string, minute: number | null, ...persons: unknown[]) => ({
      clientId: 'c1', status, ...(minute != null ? { finishedAt: `2026-10-05T09:${String(minute).padStart(2, '0')}:00Z` } : {}),
      ...(persons.length ? { result: { persons } } : {}),
    });
    const history = ready('c1', roles, { client: niIncomeReadsFromJob({ status: 'succeeded', finishedAt: '2026-10-03T08:00:00Z', result: { persons: [person('client', complete([DECL]))] } }).client! });
    for (const historyArrivesLate of [false, true]) {
      let memory: Reads = {};
      const show = (job: ReturnType<typeof live> | null, state: IncomeEvidenceState | null) => {
        const liveReads = liveIncomeReads('c1', job);
        memory = retainCompleteReads(memory, liveReads, roles);
        return trustOf(c, deriveIncomeReads({ clientId: 'c1', roles, state, liveReads, retained: memory })).kind;
      };
      const hist = (afterA: boolean) => (historyArrivesLate && !afterA ? null : history);
      equal(show(null, hist(false)), historyArrivesLate ? 'unverified' : 'declaration', 'לפני A');
      equal(show(live('succeeded', 10, person('client', complete([]))), hist(false)), 'unverified', 'A סותרת');
      const Bs = [
        live('queued', null), live('running', null),
        live('succeeded', 20, person('spouse', complete([]))),
        live('succeeded', 20, person('client', failed)),
        live('succeeded', 20, person('client', legacyPartial(DECL))),
        live('succeeded', 20, person('client', { ok: true, value: null, records: [DECL], rows: 300, candidatesComplete: false })),
        live('succeeded', 20, { role: 'client', ok: false }),
        live('failed', 20),
        null,
      ];
      for (const b of Bs) {
        const t = trustOf(c, deriveIncomeReads({ clientId: 'c1', roles, state: hist(true), liveReads: liveIncomeReads('c1', b), retained: retainCompleteReads(memory, liveIncomeReads('c1', b), roles) }));
        equal(t.kind, 'unverified', `B=${JSON.stringify(b).slice(0, 60)} (היסטוריה ${historyArrivesLate ? 'מאחרת' : 'מוכנה'})`);
        equal(reasonOf(t), 'contradicted');
        show(b, hist(true));
      }
      // ההיסטוריה (תקפה, ישנה מ-A) הגיעה עכשיו — לא דורסת את A.
      equal(show(null, history), 'unverified', 'היסטוריה מאוחרת לא דורסת');
      equal(show(live('succeeded', 30, person('client', complete([DECL]))), history), 'declaration', 'C תקפה מחזירה');
      equal(show(live('queued', null), history), 'declaration', 'ונשארת כשמשימה אחרת מתחילה');
    }
  }),

  test('newestComplete: לפי מועד הקריאה; חלקית/נכשלה לעולם לא דוחקת; לקוח אחר לא נכנס לזיכרון', () => {
    const at = (m: number, recs: NiIncomeEntry[]) => niIncomeReadsFromJob({ status: 'succeeded', finishedAt: `2026-10-05T09:${m}:00Z`, result: { persons: [person('client', complete(recs))] } }).client!;
    const older = at(10, []), newer = at(20, [DECL]);
    equal(newestComplete(older, newer), newer);
    equal(newestComplete(newer, older), newer, 'סדר הקריאה לא משנה');
    equal(newestComplete(newer, { ok: false }), newer);
    const partial = niIncomeReadsFromJob({ status: 'succeeded', finishedAt: '2026-10-05T09:59:00Z', result: { persons: [person('client', legacyPartial(DECL))] } }).client!;
    equal(newestComplete(older, partial), older, 'חלקית חדשה יותר — לא דוחקת');
    const mem = retainCompleteReads({}, { client: older }, ['client']);
    equal(retainCompleteReads(mem, {}, ['client']), mem, 'אין שינוי ⇒ אותו אובייקט');
    deepEqual(liveIncomeReads('c1', { clientId: 'c2', status: 'succeeded', result: { persons: [person('client', complete([]))] } }), {}, 'משימה של לקוח אחר');
  }),
];
