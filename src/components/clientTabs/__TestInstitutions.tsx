// ─── מסך בדיקה ליישור קו מול הרשויות ────────────────────────────────────────
// ‼ למה זה קיים: המסך הזה חי עמוק בתוך לשונית הבקשות של לקוח אמיתי, ומשתמש
// הבדיקות חסום ב-RLS. כאן מרכיבים את שלושת מסכי המיקוד עם שלבים מדומים —
// בלי לגעת בנתוני אמת ובלי לכתוב לשרת (advance מדומה ושומר בזיכרון בלבד).
//
// פתיחה:  http://localhost:5173/?test-institutions   (DEV בלבד)

import { useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { INSTITUTION_NAMES } from '../../types/onboarding';
import type { InstitutionKey } from '../../types/onboarding';
import InstitutionAlignmentGroup, { InstitutionFocus } from './InstitutionAlignment';

// ?theme=light|dark — קיבוע ערכה לצילומי מסך ללא-ראש (אין App שמפעיל useTheme).
{
  const t = /[?&]theme=(light|dark)/.exec(window.location.search)?.[1];
  if (t) document.documentElement.dataset.theme = t;
}

/**
 * ?client=<uuid> — מריץ את המסך על לקוח אמיתי של משתמש הבדיקה. נחוץ כדי לאמת
 * צירוף אישורים: מסמך נשמר בטבלת documents עם FK ללקוח, ולכן לקוח מדומה לא
 * מאפשר לבדוק את השמירה בפועל. השלבים עדיין מדומים — advance לא כותב לשרת.
 */
const CLIENT_ID_OVERRIDE = new URLSearchParams(window.location.search).get('client');

const CLIENT: Client = {
  id: CLIENT_ID_OVERRIDE || 'fixture-inst-client',
  firstName: 'אילן',
  lastName: 'סימנטוב',
  idNumber: '029384756',
  phone: '054-8823001',
  email: 'ilan.s@example.invalid',
  city: 'תל אביב',
  notes: '',
  // ‼ נחוץ כדי ש«קרא משע״ם» בסעיף מס הכנסה ייראה בכלל: הוא מותנה בקיום
  // מספר תיק במס הכנסה. עם ?client=<uuid> אמיתי, ההוק מושך את המשימה
  // האחרונה של אותו לקוח ומציג את התוצאה האמיתית.
  taxFiles: [{ id: 'fixture-tf-1', authority: 'income_tax', fileNumber: '000000000', owner: 'client', repStatus: 'active' }],
  lifecycleStage: 'active',
} as unknown as Client;

const KEYS: InstitutionKey[] = ['btl', 'vat', 'income'];

function makeStep(key: InstitutionKey): OnboardingStep {
  return {
    id: `fixture-step-${key}`,
    clientId: CLIENT.id,
    stepType: `institution_alignment_${key}` as OnboardingStep['stepType'],
    track: 'office',
    scope: 'person',
    status: 'pending',
    ball: 'office',
    payload: { institution: key },
  } as unknown as OnboardingStep;
}

/** מצב פתיחה מלא — לבדיקת "כבר יש ערכים" ולא רק מסך ריק. */
const POPULATED: Record<InstitutionKey, Record<string, unknown>> = {
  btl: {
    niBalance: '1240', incomeBasisMonthly: '18500', niAdvanceMonthly: '1180',
    occupations: [
      { id: 'occ_a', type: 'self_employed', fromDate: '2021-03-01', weeklyHours: 42, definitionIncome: 220000 },
      { id: 'occ_b', type: 'employee', employerName: 'מרקורי מדיה בע״מ', withholdingFile: '911423' },
    ],
  },
  vat: {
    vatFileType: 'עוסק מורשה', vatOpeningDate: '2021-03-01', vatPrimaryIndustry: '7311 - פרסום',
    vatFrequency: 'דו-חודשי', vatLastReportPeriod: '05-06/2026', vatBalance: '0',
  },
  income: {
    incomeTaxFileType: 'עצמאי', taxOfficeName: 'תל אביב 3', incomeTaxUnit: '12',
    incomeTaxEconomicIndustry: '7311', pitAdvancePercent: '6%', pitAdvanceFrequency: 'חודשי',
    incomeTaxBalance: '0', reportingStatus: 'אין דיווחים חסרים',
    withholdingStatus: 'שיעור/ים לפי פעילות', withholdingDetail: '0% שירותים, 30% קבלנות',
    bookStatus: 'תקין',
  },
};

/** ?populate — נכנסים ישר למצב "כבר יש ערכים", ו-?inst=vat|income בוחר מוסד. */
const PARAMS = new URLSearchParams(window.location.search);

function withValues(s: OnboardingStep): OnboardingStep {
  return { ...s, payload: { ...s.payload, collected: POPULATED[s.payload.institution as InstitutionKey] } };
}

export default function TestInstitutions() {
  const [steps, setSteps] = useState<OnboardingStep[]>(
    () => KEYS.map(makeStep).map(s => PARAMS.has('populate') ? withValues(s) : s));
  const [focus, setFocus] = useState<InstitutionKey>(
    (PARAMS.get('inst') as InstitutionKey | null) ?? 'btl');
  const [log, setLog] = useState<string[]>([]);
  /** מסך המיקוד קורא את ה-payload בטעינה בלבד — מילוי/איפוס מחייבים הרכבה מחדש. */
  const [gen, setGen] = useState(0);

  const step = steps.find(s => s.payload.institution === focus)!;

  async function advance(stepId: string, action: string, payload?: Record<string, unknown>) {
    // ה-payload המלא, לא רק שמות המפתחות — אחרת אי אפשר לאמת מה באמת נשמר לשלב.
    setLog(l => [`${action} · ${stepId}${payload ? '\n' + JSON.stringify(payload) : ''}`, ...l].slice(0, 8));
    setSteps(prev => prev.map(s => s.id !== stepId ? s : {
      ...s,
      status: action === 'complete' ? 'completed' : s.status,
      payload: { ...s.payload, ...(payload ?? {}) },
    }));
    return { ok: true };
  }

  function populate() {
    setSteps(prev => prev.map(withValues));
    setGen(g => g + 1);
    setLog(l => ['נטענו ערכים לשלושת המוסדות', ...l]);
  }

  function reset() {
    setSteps(KEYS.map(makeStep));
    setGen(g => g + 1);
    setLog(['אופס'].concat(log).slice(0, 8));
  }

  return (
    <div style={{ padding: 20, background: 'var(--surface-1)', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {KEYS.map(k => (
          <button key={k} type="button" className={`btn ${focus === k ? 'btn-primary' : ''}`}
            onClick={() => setFocus(k)}>{INSTITUTION_NAMES[k]}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={populate}>מלא ערכים</button>
        <button type="button" className="btn" onClick={reset}>אפס</button>
      </div>

      {/* ‼ תצוגת השורות — זו הסטייה שתוקנה מהמוקאפ המאושר (אריחים ⇐ שורות),
          ולכן היא חייבת להיות ניתנת לבדיקה בעין ולא רק דרך הקוד. */}
      <div style={{ maxWidth: 780, margin: '0 auto 22px' }}>
        <InstitutionAlignmentGroup steps={steps} onOpen={setFocus} />
      </div>

      <InstitutionFocus
        key={`${focus}-${gen}-${String(step.payload.checkedAt ?? '')}`}
        client={CLIENT}
        step={step}
        allSteps={steps}
        advance={advance}
        onClientPersisted={() => {}}
        returnLabel="חזרה לבקשות"
        onClose={() => setLog(l => ['סגירה', ...l])}
        onAdvanceInstitution={next => { if (next) setFocus(next); }}
      />

      <pre style={{ marginTop: 16, fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'pre-wrap' }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}
