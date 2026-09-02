// ─── מסך בדיקה לתיק המס (V6) ────────────────────────────────────────────────
// ‼ למה זה קיים: תיק המס חי בתוך כרטיס לקוח אמיתי, ומשתמש הבדיקות חסום
// ב-RLS. כאן מרכיבים אותו עם לקוחות מדומים — כדי לאמת את שורות הרשויות,
// מצבי הידיעה ושתי שורות המוכנות, בלי לגעת בנתוני אמת ובלי כתיבה לשרת.
//
// פתיחה:  http://localhost:5173/?test-taxfile          (DEV בלבד)
//         &case=complex|salary|sparse|stale|never|business

import type { Client } from '../../types';
import { useState, useEffect, useMemo } from 'react';
import TaxFileTab from './TaxFileTab';
import { ShaamReadinessProvider } from '../../hooks/shaamReadiness';
import { supabase } from '../../lib/supabase';
import { clientFromDb } from '../../lib/dbMappers';
import TaxFileEdit from './TaxFileEdit';
import type { FamilyKey } from '../../features/taxFile/editModel';

{
  const t = /[?&]theme=(light|dark)/.exec(window.location.search)?.[1];
  if (t) document.documentElement.dataset.theme = t;
}

const CASE = new URLSearchParams(window.location.search).get('case') ?? 'complex';

/**
 * ?client=<uuid> — מריץ את המסך על לקוח אמיתי של משתמש הבדיקה. נחוץ כדי
 * לאמת את «קרא משע״ם»: המשימה נשלפת לפי מזהה לקוח, ולקוח מדומה אין לו
 * שורה במסד ולכן אין לו משימות. שאר השדות נשארים מהפיקסצ׳ר.
 */
const CLIENT_ID_OVERRIDE = new URLSearchParams(window.location.search).get('client');

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

/** field_meta הוא פנקס הידיעה: קיום רשומה = נשאל ונענה. */
function meta(keys: Record<string, number>): Client['fieldMeta'] {
  const out: Record<string, { source: 'questionnaire'; syncedAt: string }> = {};
  for (const [k, days] of Object.entries(keys)) {
    out[k] = { source: 'questionnaire', syncedAt: iso(days) };
  }
  return out as Client['fieldMeta'];
}

const BASE = {
  id: CLIENT_ID_OVERRIDE || 'fixture-v6', idNumber: '027455811', firstName: 'יעל', lastName: 'ברק',
  birthDate: '1985-04-12', gender: 'female', phone: '050-2214467',
  email: 'yael@example.invalid', city: 'חיפה', address: 'רמת אלמוגי 8',
  familyStatus: 'married', spouseName: 'עמית ברק', spouseIdNumber: '038117762',
  spouseWorking: true, children: [{ id: 'c1', birthYear: 2016 }, { id: 'c2', birthYear: 2019 }],
  notes: '', lifecycleStage: 'active',
  createdAt: iso(400), updatedAt: iso(1),
} as unknown as Client;

/** עצמאית מלאה — יישור קו טרי, ידע מלא, וממתינה לנתוני הנהלה. */
const COMPLEX = {
  ...BASE,
  incomeTaxType: 'both', vatStatus: 'authorizedDealer', niType: 'both',
  businessDescription: 'אדריכלות ועיצוב פנים',
  businesses: [{ id: 'b1', name: 'סטודיו ברק', revenueAnnual: 890_000 }],
  employers: [{ id: 'e1', name: 'הטכניון', grossSalaryAnnual: 84_000 }],
  taxFiles: [
    { id: 'f1', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: '027455811' },
    { id: 'f2', authority: 'vat', owner: 'client', repStatus: 'active', fileNumber: '027455811' },
    { id: 'f3', authority: 'national_insurance', owner: 'client', repStatus: 'active', fileNumber: '027455811' },
  ],
  pitAdvancePercent: 12, pitAdvanceFrequency: 'bi_monthly',
  incomeTaxBalance: 0, incomeTaxReportingStatus: 'אין דיווחים חסרים',
  taxOfficeName: 'חיפה', incomeTaxUnit: '5', incomeTaxFileType: '42',
  capitalDeclarationRequired: true, capitalDeclarationDeadline: '2027-01-31',
  withholdingStatus: 'none', bookStatus: 'kosher', incomeTaxDebitAuthorization: true,
  vatFileType: 'עוסק מורשה', vatFrequency: 'bi_monthly', vatLastReportPeriod: '06/2026',
  vatBalance: 0, vatDebitAuthorization: true, vatOpeningDate: '2018-02-15',
  niAdvanceMonthly: 2940, niIncomeBasisMonthly: 24_500, niBalance: 0, niDebitAuthorization: true,
  hasInvestments: true, hasCrypto: true, hasResidentialProperty: true, hasRentalIncome: true,
  hasPension: true, hasForeignAssets: true, donationsAnnual: 4800, hasLifeInsurance: true,
  reserveCombatDaysPrevYear: 32,
  rentalIncomeAnnual: 72_000, rentalTaxTrack: 'flat10',
  capitalGainsAnnual: 18_500, dividendInterestAnnual: 6200,
  fieldMeta: meta({
    hasInvestments: 10, hasCrypto: 10, hasResidentialProperty: 10, hasRentalIncome: 10,
    hasPension: 10, hasForeignAssets: 10, donationsAnnual: 10, hasLifeInsurance: 10,
    reserveCombatDaysPrevYear: 10,
  }),
} as unknown as Client;

/** שכירה בלבד — אין עסק, ולכן אין שורת «נתוני העסק». */
const SALARY = {
  ...BASE, firstName: 'רונית', lastName: 'אלמוג', familyStatus: 'single',
  children: [], spouseName: '', incomeTaxType: 'employee', vatStatus: 'none', niType: 'employee',
  employers: [{ id: 'e1', name: 'בית חולים רמב״ם', grossSalaryAnnual: 156_000 }],
  taxFiles: [{ id: 'f1', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: '034889210' }],
  incomeTaxBalance: 0, incomeTaxReportingStatus: 'אין דיווחים חסרים', taxOfficeName: 'חיפה',
  hasInvestments: false, hasCrypto: false, hasResidentialProperty: false, hasRentalIncome: false,
  hasPension: true, hasForeignAssets: false, donationsAnnual: 0, hasLifeInsurance: false,
  reserveCombatDaysPrevYear: 0,
  fieldMeta: meta({
    hasInvestments: 5, hasCrypto: 5, hasResidentialProperty: 5, hasRentalIncome: 5,
    hasPension: 5, hasForeignAssets: 5, donationsAnnual: 5, hasLifeInsurance: 5,
    reserveCombatDaysPrevYear: 5,
  }),
} as unknown as Client;

/** דל נתונים — יישור קו בוצע, אבל כמעט שום דומיין לא נשאל. */
const SPARSE = {
  ...SALARY, firstName: 'דנה', lastName: 'שגב',
  hasPension: false,
  fieldMeta: meta({ hasPension: 20 }),
} as unknown as Client;

/** מיושן — נשאל לפני יותר משנה. */
const STALE = {
  ...COMPLEX,
  fieldMeta: meta({
    hasInvestments: 400, hasCrypto: 400, hasResidentialProperty: 400, hasRentalIncome: 400,
    hasPension: 400, hasForeignAssets: 400, donationsAnnual: 400, hasLifeInsurance: 400,
    reserveCombatDaysPrevYear: 400,
  }),
} as unknown as Client;

/** טרם בוצע יישור קו — ולכן שום נתון שמגיע ממנו לא קיים בתיק. */
const NEVER = {
  ...COMPLEX, taxFiles: [],
  pitAdvancePercent: undefined, pitAdvanceFrequency: undefined,
  incomeTaxBalance: undefined, incomeTaxReportingStatus: undefined,
  taxOfficeName: '', incomeTaxUnit: '', incomeTaxFileType: '',
  capitalDeclarationRequired: undefined, capitalDeclarationDeadline: '',
  vatStatus: 'none', incomeTaxType: 'both', niType: 'both',
  withholdingStatus: undefined, bookStatus: 'unknown', incomeTaxDebitAuthorization: undefined,
  vatFileType: '', vatFrequency: undefined, vatLastReportPeriod: '',
  vatBalance: undefined, vatDebitAuthorization: undefined,
  niAdvanceMonthly: undefined, niIncomeBasisMonthly: undefined,
  niBalance: undefined, niDebitAuthorization: undefined,
} as unknown as Client;

/** עצמאי בלבד — בלי שכר, עם הפקדות עצמאי ומילואים. */
const SELF = {
  ...COMPLEX, firstName: 'איתי', lastName: 'נבו', gender: 'male',
  familyStatus: 'married', employers: [], incomeTaxType: 'selfEmployed',
  selfEmployedPensionAmount: 24_000, krenHashtalmutSE: 12_700, hasKrenHashtalmut: true,
  reserveCombatDaysPrevYear: 45, spouseNoIncomeEligible: true,
} as unknown as Client;

/** «אין» מאומת מול «טרם ביררנו» — אותם דומיינים, שתי משמעויות. */
const NONE = {
  ...SALARY, firstName: 'אורי', lastName: 'כספי',
  hasInvestments: false, hasCrypto: false, hasResidentialProperty: false,
  hasRentalIncome: false, hasForeignAssets: false, donationsAnnual: 0,
  fieldMeta: meta({
    hasInvestments: 3, hasCrypto: 3, hasResidentialProperty: 3, hasRentalIncome: 3,
    hasForeignAssets: 3, donationsAnnual: 3, hasPension: 3, hasLifeInsurance: 3,
    reserveCombatDaysPrevYear: 3,
  }),
} as unknown as Client;
const CLIENTS: Record<string, Client> = {
  complex: COMPLEX, salary: SALARY, sparse: SPARSE, stale: STALE,
  never: NEVER, business: COMPLEX, self: SELF, none: NONE,
};

const STEPS_ALIGNED = [
  { stepType: 'institution_alignment_btl', status: 'completed' },
  { stepType: 'data_verification', status: 'completed' },
];
const STEPS_WAITING = [{ stepType: 'institution_alignment_btl', status: 'completed' }];

export default function TestTaxFileV6() {
  const [edit, setEdit] = useState<FamilyKey | null>(null);
  const fixture = CLIENTS[CASE] ?? COMPLEX;
  const aligned = CASE !== 'never';
  const steps = CASE === 'business' ? STEPS_WAITING : STEPS_ALIGNED;

  // ‼ מסך הבדיקה עוטף ב-ShaamReadinessProvider בדיוק כמו האפליקציה, אחרת
  // הפקדים נופלים לברירת המחדל «לא מוכן» ואי אפשר לבדוק לחיצה אמיתית.
  const [uid, setUid] = useState<string | undefined>(undefined);
  useEffect(() => { void supabase.auth.getUser().then(r => setUid(r.data.user?.id)); }, []);

  // ‼ עם ?client= — הערכים האמיתיים מהמסד נשפכים על הפיקסצ׳ר, ואישור
  // שמחזיר לקוח מעודכן נקלט כאן. בלי זה האישור המקובץ («אשר N שינויים»)
  // תמיד היה נופל על stale_conflict (התמונה בפיקסצ׳ר ≠ המסד), והמצבים לא
  // היו מתיישבים אחרי אישור — כלומר אי אפשר היה לבדוק את המסלול המוצלח.
  const [live, setLive] = useState<Partial<Client> | null>(null);
  useEffect(() => {
    if (!CLIENT_ID_OVERRIDE) return;
    void supabase.from('clients').select('*').eq('id', CLIENT_ID_OVERRIDE).maybeSingle()
      .then(r => { if (r.data) setLive(clientFromDb(r.data)); });
  }, []);
  const client = useMemo(
    () => (live ? { ...fixture, ...live, id: CLIENT_ID_OVERRIDE || fixture.id } as Client : fixture),
    [fixture, live],
  );
  const onClientPersisted = (c: Client) => setLive(prev => ({ ...(prev ?? {}), ...c }));

  return (
    <ShaamReadinessProvider userId={uid}>
    <div style={{ padding: 18, background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <b>מסך בדיקה · תיק מס V6</b>
        <span>תרחיש: {CASE}</span>
        {['complex', 'salary', 'sparse', 'stale', 'never', 'business', 'self', 'none'].map(c => (
          <a key={c} href={`?test-taxfile&case=${c}`}>{c}</a>
        ))}
      </div>
      <div className="cw-body" style={{ maxWidth: 900, margin: '0 auto' }}>
        {edit ? (
          <TaxFileEdit
            client={client}
            initialFamily={edit}
            onClientPersisted={onClientPersisted}
            onPatchAndSave={async () => { alert('בהדגמה — שמירה רגילה'); }}
            onClose={() => setEdit(null)}
            onRunAlignment={() => alert('בהדגמה — מפעיל יישור קו')}
            onOpenDetails={() => alert('בהדגמה — פרטי הלקוח המלאים')}
          />
        ) : (
        <TaxFileTab
          client={client}
          onClientPersisted={onClientPersisted}
          onSendQuestionnaire={() => alert('בהדגמה — נפתח חלון שליחת שאלון')}
          onOpenDetails={() => alert('בהדגמה — עריכת פרטי הלקוח')}
          onRunAlignment={() => alert('בהדגמה — מפעיל יישור קו')}
          alignBusy={false}
          alignedAt={aligned ? iso(12) : undefined}
          steps={steps}
          onCreateTask={(t) => alert('משימה: ' + t)}
          onCreateRequest={(f) => alert('בקשה ללקוח: ' + f.requestTitle)}
        />
        )}
      </div>
    </div>
    </ShaamReadinessProvider>
  );
}
