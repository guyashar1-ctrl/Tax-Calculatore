// ─── מסך בדיקה ל"תמונת מצב מול הרשויות" ─────────────────────────────────────
// ‼ למה זה קיים: המסך חי בתוך כרטיס לקוח אמיתי, ומשתמש הבדיקות חסום ב-RLS.
// כאן מרכיבים אותו עם לקוח ושלבים מדומים — כדי לאמת את מחולל הדגלים, את
// סימון "מה השתנה", ואת המצב הריק, בלי לגעת בנתוני אמת ובלי כתיבה לשרת.
//
// פתיחה:  http://localhost:5173/?test-alignment-status        (DEV בלבד)
//         &case=empty | clean | first     — תרחישים נוספים

import { useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import AlignmentStatusView from './AlignmentStatusView';

{
  const t = /[?&]theme=(light|dark)/.exec(window.location.search)?.[1];
  if (t) document.documentElement.dataset.theme = t;
}

const CASE = new URLSearchParams(window.location.search).get('case') ?? 'full';

/** לקוח עם כל סוגי הבעיות — חוב, אין אישור ניכוי, הצהרת הון, אין הרשאה. */
const FULL: Partial<Client> = {
  niBalance: 0,
  niIncomeBasisMonthly: 9500,
  niAdvanceMonthly: 612,
  niDebitAuthorization: false,
  niOccupations: [
    { id: 'o1', type: 'self_employed', fromDate: '2023-03-01' },
    { id: 'o2', type: 'employee', employerName: 'טכנוסופט בע״מ' },
  ] as Client['niOccupations'],
  vatFileType: 'עוסק מורשה',
  vatOpeningDate: '2023-03-15',
  vatPrimaryIndustry: 'ייעוץ והדרכה',
  vatFrequency: 'monthly',
  vatLastReportPeriod: '06/2026',
  vatBalance: 8340,
  vatDebitAuthorization: true,
  incomeTaxFileType: '94 · עצמאי',
  taxOfficeName: 'תל אביב 3',
  incomeTaxUnit: '21',
  incomeTaxEconomicIndustry: '7020 · ייעוץ ניהולי',
  pitAdvancePercent: 6,
  pitAdvanceFrequency: 'bi_monthly',
  incomeTaxBalance: 0,
  incomeTaxReportingStatus: 'אין דיווחים חסרים',
  capitalDeclarationRequired: true,
  capitalDeclarationDeadline: '2026-11-30',
  incomeTaxDebitAuthorization: true,
  withholdingStatus: 'none',
  bookStatus: 'kosher',
};

/** לקוח תקין לגמרי — לאמת שהמסך אומר "אין מה לטפל" ולא ממציא דגלים. */
const CLEAN: Partial<Client> = {
  ...FULL,
  // ‼ קוד גולמי כפי ששע״ם מחזירה — כדי שהתרחיש הזה יכסה את הצגת הפירוש
  // מהטבלה, בעוד FULL נשאר עם הניסוח הישן ומכסה מעבר-דרך של ערך לא מוכר.
  incomeTaxFileType: '52',
  vatBalance: 0,
  vatFrequency: 'bi_monthly',
  niDebitAuthorization: true,
  capitalDeclarationRequired: false,
  capitalDeclarationDeadline: undefined,
  withholdingStatus: 'exempt',
};

const BASE = {
  id: 'fixture-status-client',
  firstName: 'דניאל',
  lastName: 'כהן',
  idNumber: '029384756',
  phone: '054-8823001',
  email: 'daniel@example.invalid',
  city: 'תל אביב',
  notes: '',
  taxFiles: [],
  lifecycleStage: 'active',
};

const CLIENT = {
  ...BASE,
  // ‼ 'sparse' — יישור קו **בוצע** אבל שדות מס הכנסה ריקים. זה המצב של גיא
  // כלקוח ה-QA הראשון, וזה מה שמאמת שכל שדה נרשם גם בלי ערך («—») במקום
  // להיעלם. 'empty' הוא משהו אחר לגמרי: יישור קו שטרם בוצע.
  ...(CASE === 'clean' ? CLEAN : (CASE === 'empty' || CASE === 'sparse') ? {} : FULL),
} as unknown as Client;

/** היסטוריה = ריצה קודמת. ב-case=first אין היסטוריה ⇒ אסור שיופיעו סימוני שינוי. */
function makeStep(key: 'btl' | 'vat' | 'income', collected: Record<string, unknown>,
  history?: Array<{ checkedAt: string; collected: Record<string, unknown>; exceptions: Record<string, unknown> }>): OnboardingStep {
  return {
    id: `fixture-status-${key}`,
    clientId: CLIENT.id,
    stepType: `institution_alignment_${key}` as OnboardingStep['stepType'],
    track: 'office',
    scope: 'person',
    status: 'completed',
    ball: 'office',
    payload: {
      institution: key,
      checkedAt: '2026-08-17T09:00:00.000Z',
      collected,
      ...(history ? { history } : {}),
    },
  } as unknown as OnboardingStep;
}

const withHistory = CASE !== 'first' && CASE !== 'empty';

const STEPS: OnboardingStep[] = CASE === 'empty' ? [
  // שלבים שנוצרו אך טרם נבדקו — המצב הריק המכובד
  { ...makeStep('btl', {}), status: 'pending', payload: { institution: 'btl' } } as unknown as OnboardingStep,
  { ...makeStep('vat', {}), status: 'pending', payload: { institution: 'vat' } } as unknown as OnboardingStep,
  { ...makeStep('income', {}), status: 'pending', payload: { institution: 'income' } } as unknown as OnboardingStep,
] : [
  makeStep('btl',
    { niBalance: '0', incomeBasisMonthly: '9500', niAdvanceMonthly: '612' },
    withHistory ? [{ checkedAt: '2026-01-12T09:00:00.000Z',
      collected: { niBalance: '0', incomeBasisMonthly: '7200', niAdvanceMonthly: '464' }, exceptions: {} }] : undefined),
  makeStep('vat',
    { vatBalance: '8340', vatFrequency: 'חודשי', vatFileType: 'עוסק מורשה' },
    withHistory ? [{ checkedAt: '2026-01-12T09:00:00.000Z',
      collected: { vatBalance: '0', vatFrequency: 'חודשי', vatFileType: 'עוסק מורשה' }, exceptions: {} }] : undefined),
  makeStep('income',
    { withholdingStatus: 'אין אישור תקף', bookStatus: 'תקין', pitAdvancePercent: '6' },
    withHistory ? [{ checkedAt: '2026-01-12T09:00:00.000Z',
      collected: { withholdingStatus: 'פטור מניכוי', bookStatus: 'תקין', pitAdvancePercent: '6' }, exceptions: {} }] : undefined),
];

/** בקשה שכבר נוצרה לדגל הרשאת החיוב — לאמת את החותמת במקום הכפתור. */
const EXISTING_REQUEST = {
  id: 'fixture-existing-req',
  clientId: CLIENT.id,
  stepType: 'custom_request',
  status: 'pending',
  payload: { title: 'הקמת הרשאה לחיוב בביטוח לאומי', flagKey: 'niDebitAuthorization' },
} as unknown as OnboardingStep;

export default function TestAlignmentStatus() {
  const [log, setLog] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  return (
    <div style={{ padding: 20, background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <b>מסך בדיקה · תמונת מצב מול הרשויות</b>
        <span>תרחיש: {CASE}</span>
        <a href="?test-alignment-status&case=full">מלא</a>
        <a href="?test-alignment-status&case=clean">תקין</a>
        <a href="?test-alignment-status&case=first">ריצה ראשונה</a>
        <a href="?test-alignment-status&case=sparse">נבדק אך ריק</a>
        <a href="?test-alignment-status&case=empty">טרם בוצע</a>
      </div>

      <AlignmentStatusView
        client={CLIENT}
        steps={STEPS}
        allSteps={[...STEPS, EXISTING_REQUEST]}
        returnLabel="חזרה לבקשות"
        onClose={() => setLog(l => [...l, 'סגירה'])}
        onRerun={() => setLog(l => [...l, 'בצע מחדש'])}
        onCreateTask={(title) => setLog(l => [...l, `משימה: ${title}`])}
        onCreateRequest={(flag) => {
          setBusyKey(flag.key);
          setTimeout(() => { setBusyKey(null); setLog(l => [...l, `בקשה: ${flag.requestTitle}`]); }, 300);
        }}
        creatingRequestKey={busyKey}
      />

      {log.length > 0 && (
        <div style={{ marginTop: 20, fontSize: 12, padding: 10, background: 'var(--surface-0)',
          border: '1px solid var(--hairline-1)', borderRadius: 8 }}>
          <b>פעולות שנקראו:</b>
          {log.map((l, i) => <div key={i}>· {l}</div>)}
        </div>
      )}
    </div>
  );
}
