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

import { useEffect, useState } from 'react';
import type { Client, NiOccupation } from '../../types';
import type { AutomationJob } from '../../types/automation';
import AuthoritiesPanel from './AuthoritiesPanel';
import { ShaamReadinessProvider } from '../../hooks/shaamReadiness';
import { supabase } from '../../lib/supabase';

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
    directIncome: { ok: true, rows: 1, value: { year: 2025, monthlyAmount: 16_500, infoSource: 'הצהרה', incomeSource: 'עצמאי', receivedDate: '2025-06-15', fromMonth: 6, toMonth: 6 } },
    debitAuthorization: { ok: true, value: true, openSince: '2025-06-24', source: 'table' },
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
};

export default function TestBtlSync() {
  const [uid, setUid] = useState<string | undefined>(undefined);
  useEffect(() => { void supabase.auth.getUser().then(r => setUid(r.data.user?.id)); }, []);
  const c = CASES[CASE] ?? CASES.synced;
  const [client, setClient] = useState<Client>(c.client);
  return (
    <ShaamReadinessProvider userId={uid}>
      <div style={{ padding: 18, background: 'var(--bg)', minHeight: '100vh' }}>
        <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <b>מסך בדיקה · ב"ל</b>
          <span>{c.title}</span>
          {Object.keys(CASES).map(k => <a key={k} href={`?test-btl-sync&case=${k}`}>{k}</a>)}
        </div>
        <div className="cw-body" style={{ maxWidth: 760, margin: '0 auto' }}>
          <AuthoritiesPanel
            client={client}
            onClientPersisted={setClient}
            alignedAt={iso(37)}
            onOpenDetailed={() => alert('תצוגה מפורטת')}
            jobOverrides={{ national_insurance: c.job }}
          />
        </div>
      </div>
    </ShaamReadinessProvider>
  );
}
