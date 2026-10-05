// ─── מסך בדיקה: «עדכן נתונים מביטוח לאומי» ──────────────────────────────────
// ‼ למה זה קיים: כרטיס ב"ל חי בתוך לקוח אמיתי, והקריאה עצמה רצה בעובד מול
// הפורטל. כאן מרכיבים את AuthoritiesPanel עם לקוחות מדומים ומשימה מדומה
// (jobOverrides) — כדי לראות בדיוק מה הרו"ח רואה אחרי קריאה, בלי עובד, בלי
// פורטל ובלי לגעת בנתוני אמת.
//
// ‼ לא ללחוץ כאן על «עדכן נתונים…» או «אשר שינויים»: הראשון פותח חיבור
// אמיתי לביטוח לאומי, השני שולח הצעות לשרת על לקוח שאינו קיים.
//
// פתיחה:  http://localhost:5173/?test-btl-sync&case=synced|before|couple|couple-partial|running|failed|single-occ|none
//          (219) |assessment-legacy|assessment-fixed|declaration|legacy-unverified|partial-assessment|declaration-gone|form-6101

import { useEffect, useState } from 'react';
import type { Client, NiIncomeEntry, NiInsuranceBasis, NiOccupation } from '../../types';
import type { AutomationJob } from '../../types/automation';
import AuthoritiesPanel from './AuthoritiesPanel';
import { ShaamReadinessProvider } from '../../hooks/shaamReadiness';
import { supabase } from '../../lib/supabase';
import { setIncomeEvidenceFetcherForHarness } from '../../hooks/useBtlIncomeReads';
import { BtlNow } from '../../features/smartForms/btl6101/ui';
import { currentBtlState } from '../../features/smartForms/btl6101/resolve';

const CASE = new URLSearchParams(window.location.search).get('case') ?? 'synced';

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

/** העיסוקים כפי שהם אחרי אישור קריאה מהפורטל (מהקלטת 23.09.2026). */
const OCC_PORTAL: NiOccupation[] = [
  {
    id: 'btl-self_employed-2025-06-01', type: 'self_employed', sourceLabel: 'עצמאי', source: 'btl_portal',
    fromDate: '2025-06-01', sourcePeriods: [{ fromDate: '2025-06-01', toDate: null }],
  },
  {
    id: 'btl-student-2023-10-01', type: 'student', sourceLabel: 'תלמיד להשכלה גבוהה', source: 'btl_portal',
    fromDate: '2023-10-01', toDate: '2026-09-30',
    sourcePeriods: [
      { fromDate: '2023-10-01', toDate: '2024-09-30' },
      { fromDate: '2024-10-01', toDate: '2025-09-30' },
      { fromDate: '2025-10-01', toDate: '2026-09-30' },
    ],
  },
];

/** מה שהיה בכרטיס לפני (צילום המסך): שני עיסוקים ידניים, בלי תקופות. */
const OCC_MANUAL: NiOccupation[] = [
  { id: 'm1', type: 'self_employed' },
  { id: 'm2', type: 'student' },
];

const BASE = {
  id: 'fixture-btl-sync', idNumber: '123456782', firstName: 'דנה', lastName: 'ישראלי',
  birthDate: '1995-01-01', familyStatus: 'single', phone: '', email: '', city: 'חיפה', address: '',
  children: [], notes: '', lifecycleStage: 'active', createdAt: iso(60), updatedAt: iso(1),
  taxFiles: [{ id: 'tf1', authority: 'national_insurance', owner: 'client', repStatus: 'active', fileNumber: '' }],
} as unknown as Client;

const SYNCED: Client = {
  ...BASE,
  niOccupations: OCC_PORTAL, niIncomeBasisMonthly: 16_500, niAdvanceMonthly: 2_062, niBalance: 0,
  niDebitAuthorization: true,
  niInsuranceBasis: { year: 2026, fromMonth: 7, toMonth: 9, months: 3, periodBasis: 47_583, category: 'עצמאי', advanceMonthly: 2_062, sourceIncomeYear: 2025 },
};

const BEFORE: Client = {
  ...BASE,
  niOccupations: OCC_MANUAL, niIncomeBasisMonthly: 16_500, niAdvanceMonthly: 2_055, niBalance: 0,
  niDebitAuthorization: true,
};

const COUPLE: Client = {
  ...SYNCED, familyStatus: 'married', spouseName: 'רון ישראלי', spouseFirstName: 'רון', spouseLastName: 'ישראלי',
  spouseIdNumber: '300000007',
  taxFiles: [
    { id: 'tf1', authority: 'national_insurance', owner: 'client', repStatus: 'active', fileNumber: '' },
    { id: 'tf2', authority: 'national_insurance', owner: 'spouse', repStatus: 'active', fileNumber: '' },
  ],
  spouseNiOccupations: [{ id: 's1', type: 'employee', sourceLabel: 'עובד', source: 'btl_portal', fromDate: '2020-01-01' }],
  spouseNiAdvanceMonthly: 1_180, spouseNiBalance: 320, spouseNiDebitAuthorization: false,
} as Client;

const SINGLE_OCC: Client = {
  ...SYNCED,
  niOccupations: [OCC_PORTAL[0]],
};

// ── תוצאת העובד (btl.sync_file), בצורה המדויקת שהוא מחזיר ──

const INSURED_RESULT = {
  role: 'client', label: 'דנה ישראלי', ok: true,
  representation: { found: true, type: 'מבוטח', receivedDate: '2026-08-04' },
  sections: {
    advance: { ok: true, value: { year: 2026, fromMonth: 7, toMonth: 9, months: 3, basisCategory: 'עצמאי', periodBasis: 47_583, advanceMonthly: 2_062 } },
    occupations: {
      ok: true, warnings: [], drilled: 3,
      value: [
        { sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2023-10-01', toDate: '2026-09-30', sourcePeriods: OCC_PORTAL[1].sourcePeriods },
        { sourceLabel: 'עצמאי', fromDate: '2025-06-01', toDate: null, sourcePeriods: [{ fromDate: '2025-06-01', toDate: null }] },
      ],
    },
    directIncome: {
      ok: true, rows: 1,
      value: { year: 2025, amount: 16_500, monthlyAmount: 16_500, infoSource: 'הצהרה', incomeSource: 'עצמאי', receivedDate: '2025-06-15', fromMonth: 6, toMonth: 6, status: 'תקף' },
      records: [{ year: 2025, amount: 16_500, infoSource: 'הצהרה', incomeSource: 'עצמאי', receivedDate: '2025-06-15', fromMonth: 6, toMonth: 6, status: 'תקף' }],
    },
    debitAuthorization: { ok: true, value: true, openSince: '2025-06-24', source: 'table' },
    balance: { ok: true, value: 0, source: 'ledger', warnings: [] },
  },
};

// ── (219) הכנסה: הצהרה חודשית ≠ שומה שנתית — נתונים מדומים, לא של לקוח אמיתי ──

const AUTO_META = { source: 'automation' as const, syncedAt: '2026-10-05T06:08:00Z' };
const DECL: NiIncomeEntry = { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16_500, receivedDate: '2025-06-15', status: 'תקף' };
const ann = (year: number, amount: number, receivedDate: string): NiIncomeEntry =>
  ({ year, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', amount, receivedDate, status: 'תקף' });
const ASSESS = ann(2025, 47_800, '2026-09-05');
const RECORDS_ASSESS: NiIncomeEntry[] = [
  ASSESS, ann(2024, 21_327, '2026-01-05'), ann(2023, 0, '2025-12-05'), ann(2022, 46_800, '2023-08-05'),
  { year: 2021, fromMonth: null, toMonth: null, infoSource: null, incomeSource: 'עובד', amount: 4_860, receivedDate: null, status: null },
];
const BASIS_Q4: NiInsuranceBasis = { year: 2026, fromMonth: 10, toMonth: 12, months: 3, periodBasis: 16_708, category: 'עצמאי', advanceMonthly: 429 };

/** מה שנשמר היום בכרטיס של מקרה ב׳: 47,800 «לחודש» מקריאה ישנה. */
const ASSESS_LEGACY: Client = {
  ...BASE,
  niOccupations: [OCC_PORTAL[0]], niIncomeBasisMonthly: 47_800, niAdvanceMonthly: 429, niBalance: 0,
  niDebitAuthorization: false, niInsuranceBasis: { ...BASIS_Q4, sourceIncomeYear: 2025 },
  fieldMeta: { niIncomeBasisMonthly: AUTO_META, niInsuranceBasis: AUTO_META },
} as Client;

const ASSESS_FIXED: Client = {
  ...ASSESS_LEGACY, niIncomeBasisMonthly: undefined, niInsuranceBasis: BASIS_Q4,
  niIncomeList: { declaration: null, assessment: ASSESS },
  fieldMeta: { niIncomeBasisMonthly: AUTO_META, niInsuranceBasis: AUTO_META, niIncomeList: AUTO_META },
} as Client;

const DECLARED: Client = {
  ...SYNCED, niInsuranceBasis: { year: 2026, fromMonth: 7, toMonth: 9, months: 3, periodBasis: 47_583, category: 'עצמאי', advanceMonthly: 2_062 },
  niIncomeList: { declaration: DECL, assessment: null },
  fieldMeta: { niIncomeBasisMonthly: AUTO_META, niInsuranceBasis: AUTO_META, niIncomeList: AUTO_META },
} as Client;

const LEGACY_UNVERIFIED: Client = { ...SYNCED, fieldMeta: { niIncomeBasisMonthly: AUTO_META, niInsuranceBasis: AUTO_META } } as Client;

const PARTIAL_ASSESS: Client = {
  ...ASSESS_FIXED,
  niIncomeList: { declaration: null, assessment: { ...ASSESS, fromMonth: 3, toMonth: 12, amount: 30_000 } },
} as Client;

const ASSESS_READ = {
  role: 'client', label: 'דנה ישראלי', ok: true, representation: { found: true, receivedDate: '2026-08-02' },
  sections: {
    advance: { ok: true, value: { year: 2026, fromMonth: 10, toMonth: 12, months: 3, basisCategory: 'עצמאי', periodBasis: 16_708, advanceMonthly: 429 } },
    occupations: { ok: true, warnings: [], value: [{ sourceLabel: 'עצמאי', fromDate: '2025-06-01', toDate: null, sourcePeriods: [{ fromDate: '2025-06-01', toDate: null }] }] },
    directIncome: { ok: true, rows: RECORDS_ASSESS.length, value: null, records: RECORDS_ASSESS },
    debitAuthorization: { ok: true, value: false, source: 'table' },
    balance: { ok: true, value: 0, source: 'ledger', warnings: [] },
  },
};

function job(status: AutomationJob['status'], result?: Record<string, unknown>, extra: Partial<AutomationJob> = {}): AutomationJob {
  return {
    id: `job-${CASE}`, userId: 'u', clientId: BASE.id, actionType: 'btl.sync_file', input: {},
    status, attempts: 1, maxAttempts: 3, artifacts: [], result,
    createdAt: iso(0), updatedAt: new Date().toISOString(), finishedAt: status === 'succeeded' || status === 'failed' ? new Date().toISOString() : undefined,
    ...extra,
  };
}

const CASES: Record<string, { client: Client; job: AutomationJob | null; title: string }> = {
  synced: { client: SYNCED, job: null, title: 'אחרי עדכון — הכרטיס כפי שנשמר' },
  before: { client: BEFORE, job: job('succeeded', { system: 'btl', persons: [INSURED_RESULT] }), title: 'המצב של היום + קריאה חדשה מהפורטל' },
  'single-occ': { client: SINGLE_OCC, job: null, title: 'עיסוק אחד' },
  couple: {
    client: COUPLE,
    job: job('succeeded', { system: 'btl', persons: [INSURED_RESULT, {
      role: 'spouse', label: 'רון ישראלי', ok: true, representation: { found: true, receivedDate: '2026-05-01' },
      sections: {
        advance: { ok: true, value: { year: 2026, fromMonth: 7, toMonth: 9, months: 3, basisCategory: 'עצמאי', periodBasis: 30_000, advanceMonthly: 1_180 } },
        occupations: { ok: true, warnings: [], value: [{ sourceLabel: 'עובד', fromDate: '2020-01-01', toDate: null, sourcePeriods: [{ fromDate: '2020-01-01', toDate: null }] }] },
        directIncome: { ok: true, value: null },
        debitAuthorization: { ok: false, reason: 'debit_table_not_found' },
        balance: { ok: true, value: 320, source: 'ledger' },
      },
    }] }),
    title: 'זוג — שני אנשים, כל אחד בנפרד',
  },
  'couple-partial': {
    client: COUPLE,
    job: job('succeeded', { system: 'btl', persons: [INSURED_RESULT, {
      role: 'spouse', label: 'רון ישראלי', ok: false, errorCode: 'not_found', error: 'לא נמצא ברשימת המיוצגים בביטוח לאומי',
    }] }),
    title: 'זוג — אחד נקרא, השני לא נמצא',
  },
  running: { client: BEFORE, job: job('running', undefined, { leaseUntil: new Date(Date.now() + 60_000).toISOString(), claimedBy: 'w' }), title: 'הקריאה רצה' },
  failed: { client: SYNCED, job: job('needs_human', undefined, { needsHuman: 'החיבור לביטוח לאומי אינו מוכן. לחצו על "ביטוח לאומי" בכותרת והשלימו את ההתחברות, ואז הריצו שוב.' }), title: 'החיבור לא מוכן' },
  none: { client: { ...BASE, taxFiles: BASE.taxFiles } as Client, job: null, title: 'אין עדיין נתונים' },
  'assessment-legacy': { client: ASSESS_LEGACY, job: job('succeeded', { system: 'btl', persons: [ASSESS_READ] }), title: 'שומה שנתית שנרשמה «לחודש» + קריאה חדשה' },
  'assessment-fixed': { client: ASSESS_FIXED, job: null, title: 'שומה שנתית — אחרי האישור' },
  declaration: { client: DECLARED, job: null, title: 'הצהרה חודשית מאומתת' },
  'legacy-unverified': { client: LEGACY_UNVERIFIED, job: null, title: 'ערך ישן מקריאה אוטומטית — טעון אימות' },
  'partial-assessment': { client: PARTIAL_ASSESS, job: null, title: 'שומה לחלק משנה — יחידה לא ידועה' },
  'declaration-gone': {
    client: { ...DECLARED, niIncomeList: { declaration: DECL, assessment: ASSESS } } as Client,
    job: job('succeeded', { system: 'btl', persons: [{ ...ASSESS_READ, sections: { ...ASSESS_READ.sections,
      advance: INSURED_RESULT.sections.advance,
      directIncome: { ok: true, rows: 0, value: null, records: [], omitted: 0, candidatesComplete: true } } }] }),
    title: 'הצהרה שאושרה + קריאה שלמה שלא מוצאת אותה',
  },
  // ‼ ביקורת שנייה: ראיה לכל אדם מההיסטוריה (המשימות שהצליחו, מהחדשה לישנה) — ראה HISTORIES.
  'evidence-contradicted-spouse-only': { client: DECLARED, job: null, title: 'הצהרה שאושרה · הקריאה השלמה הסותרת ישנה, ואחריה הצליחה קריאה רק של בן/בת הזוג' },
  'evidence-contradicted-failed-income': { client: DECLARED, job: null, title: 'הצהרה שאושרה · אחרי הסתירה — משימה שהצליחה אך מקטע ההכנסות נכשל' },
  'evidence-restored': { client: DECLARED, job: null, title: 'הצהרה שאושרה · קריאה שלמה מאוחרת החזירה אותה' },
  'evidence-loading': { client: DECLARED, job: null, title: 'הצהרה שאושרה · הראיה עדיין נשלפת (לא «מאומת»)' },
  'evidence-error': { client: DECLARED, job: null, title: 'הצהרה שאושרה · שליפת הראיה נכשלה (לא «מאומת»)' },
  // ‼ ביקורת שלישית: אותו מסך פתוח, משימות חיות מתחלפות — ראה SEQ_STEPS. &delay=ms ⇒ ההיסטוריה מאחרת.
  'live-sequence': { client: DECLARED, job: null, title: 'רצף חי באותו מסך: היסטוריה תקפה → A סותרת → B מתחילה → C תקפה' },
};

const histJob = (day: number, ...persons: unknown[]) =>
  ({ finishedAt: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`, result: { persons } });
const histPerson = (role: 'client' | 'spouse', directIncome: Record<string, unknown>) => ({ role, ok: true, sections: { directIncome } });
const completeIncome = (records: NiIncomeEntry[]) => ({ ok: true, value: null, records, rows: records.length, candidatesComplete: true });
const CONTRADICTORY_OLD = histJob(1, histPerson('client', completeIncome([])));

/** היסטוריית המשימות שהצליחו לכל מקרה (מהחדשה לישנה). ברירת מחדל: ריקה. */
const HISTORIES: Record<string, ReturnType<typeof histJob>[]> = {
  'evidence-contradicted-spouse-only': [histJob(2, histPerson('spouse', completeIncome([]))), CONTRADICTORY_OLD],
  'evidence-contradicted-failed-income': [histJob(2, histPerson('client', { ok: false })), CONTRADICTORY_OLD],
  'evidence-restored': [histJob(3, histPerson('client', completeIncome([DECL]))), CONTRADICTORY_OLD],
};
// ── רצף חי (ביקורת שלישית) — המשימה החיה מתחלפת בלחיצה, באותו מסך ──
const seqJob = (id: string, status: AutomationJob['status'], minute: number | null, persons?: unknown[]): AutomationJob => ({
  id, userId: 'u', clientId: BASE.id, actionType: 'btl.sync_file', input: {}, status, attempts: 1, maxAttempts: 3, artifacts: [],
  result: persons ? { system: 'btl', persons } : undefined,
  createdAt: '2026-10-05T09:00:00Z', updatedAt: '2026-10-05T09:00:00Z',
  ...(minute != null ? { finishedAt: `2026-10-05T09:${String(minute).padStart(2, '0')}:00Z` } : {}),
});
const seqPerson = (role: 'client' | 'spouse', directIncome: Record<string, unknown>) =>
  ({ role, ok: true, representation: { found: true }, sections: { directIncome } });
export const SEQ_STEPS: Record<string, AutomationJob | null> = {
  'A-contradicts': seqJob('job-A', 'succeeded', 10, [seqPerson('client', completeIncome([]))]),
  'B-queued': seqJob('job-B', 'queued', null),
  'B-running': seqJob('job-B', 'running', null),
  'B-spouse-only': seqJob('job-B', 'succeeded', 20, [seqPerson('spouse', completeIncome([]))]),
  'B-income-failed': seqJob('job-B', 'succeeded', 20, [seqPerson('client', { ok: false, reason: 'table_not_found' })]),
  'B-partial': seqJob('job-B', 'succeeded', 20, [seqPerson('client', { ok: true, value: { year: 2025, monthlyAmount: 16_500, infoSource: 'הצהרה', incomeSource: 'עצמאי', fromMonth: 6, toMonth: 6, status: 'תקף' } })]),
  'B-truncated': seqJob('job-B', 'succeeded', 20, [seqPerson('client', { ok: true, value: null, records: [DECL], rows: 300, omitted: 99, candidatesComplete: false })]),
  'B-person-failed': seqJob('job-B', 'succeeded', 20, [{ role: 'client', ok: false, errorCode: 'navigation_failed' }]),
  'B-failed-job': seqJob('job-B', 'failed', 20),
  'C-valid': seqJob('job-C', 'succeeded', 30, [seqPerson('client', completeIncome([DECL]))]),
  none: null,
};
HISTORIES['live-sequence'] = [histJob(3, histPerson('client', completeIncome([DECL])))];

const DELAY_MS = Number(new URLSearchParams(window.location.search).get('delay') ?? 0);
setIncomeEvidenceFetcherForHarness(() => async (offset, limit) => {
  if (CASE === 'evidence-loading') await new Promise(() => { /* לעולם לא מסתיים */ });
  if (DELAY_MS) await new Promise(r => setTimeout(r, DELAY_MS));
  if (CASE === 'evidence-error') return { jobs: [], error: 'מדומה' };
  return { jobs: (HISTORIES[CASE] ?? []).slice(offset, offset + limit) };
});

export default function TestBtlSync() {
  const [uid, setUid] = useState<string | undefined>(undefined);
  useEffect(() => { void supabase.auth.getUser().then(r => setUid(r.data.user?.id)); }, []);
  // ‼ (219) «מה ב"ל מחזיק» בטופס 6101 — שלושה מצבי הכנסה זה לצד זה.
  if (CASE === 'form-6101') {
    const asOf = new Date().toISOString().slice(0, 10);
    return (
      <div style={{ padding: 18, background: 'var(--bg)', minHeight: '100vh', display: 'grid', gap: 16, maxWidth: 560, margin: '0 auto' }}>
        {([['47,800 «לחודש» מקריאה ישנה', ASSESS_LEGACY], ['אחרי התיקון — שומה בלבד', ASSESS_FIXED], ['הצהרה מאומתת', DECLARED]] as const).map(([t, cl]) => (
          <div key={t} className="txf-sect" style={{ padding: 14 }}>
            <b style={{ display: 'block', marginBottom: 8 }}>{t}</b>
            <BtlNow btl={currentBtlState(cl, asOf)} />
          </div>
        ))}
      </div>
    );
  }
  const c = CASES[CASE] ?? CASES.synced;
  const [client, setClient] = useState<Client>(c.client);
  const [seq, setSeq] = useState<string>('none');
  const liveJob = CASE === 'live-sequence' ? SEQ_STEPS[seq] ?? null : c.job;
  return (
    <ShaamReadinessProvider userId={uid}>
      <div style={{ padding: 18, background: 'var(--bg)', minHeight: '100vh' }}>
        <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <b>מסך בדיקה · ב"ל</b>
          <span>{c.title}</span>
          {Object.keys(CASES).map(k => <a key={k} href={`?test-btl-sync&case=${k}`}>{k}</a>)}
        </div>
        {CASE === 'live-sequence' && (
          <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>המשימה החיה:</b>
            {Object.keys(SEQ_STEPS).map(k => (
              <button key={k} type="button" data-seq={k} className={`ui-btn${seq === k ? ' ui-btn-primary' : ''}`} onClick={() => setSeq(k)}>{k}</button>
            ))}
          </div>
        )}
        <div className="cw-body" style={{ maxWidth: 760, margin: '0 auto' }}>
          <AuthoritiesPanel
            client={client}
            onClientPersisted={setClient}
            alignedAt={iso(37)}
            onOpenDetailed={() => alert('תצוגה מפורטת')}
            jobOverrides={{ national_insurance: liveJob }}
          />
        </div>
      </div>
    </ShaamReadinessProvider>
  );
}
