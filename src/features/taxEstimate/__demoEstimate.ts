// ─── הדגמה בלבד: הערכת מס 2026 מוכנה לאורית שפירא (sample-4) ──────────────────
// ‼ נטען רק מהמסד המדומה (__fakeTaxYear, ‎?office-app‎). נתוני דמה — לא לקוח אמיתי.
// מה ההדגמה מראה: שכירה ועצמאית (מקדמת מ״ה לפי מחזור + ב״ל), בן זוג שכיר, ריבית לא צמודה, אירוע חד־פעמי,
// תחזית לקוח מול תחזית משרד, 134 שנקרא מול הרשות, ב״ל מהאוטומציה, «מה בדקנו» ותזרים עד סוף השנה.
import type { EstimateDraft } from './types';

const months = (n: number, f: (m: number) => object) => Array.from({ length: n }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, ...f(i + 1) }));

export const DEMO_ESTIMATE_STEP_ID = 'ty-est-2026-orit';

export const DEMO_ESTIMATE_DRAFT: EstimateDraft = {
  cutoffMonth: 9,
  preparedOn: '2026-10-12',
  lines: [
    { id: 'o-sal', person: 'client', source: 'salary', entityRef: 'emp-o1', label: 'משכורת · משרד ההדרכה', actualToCutoff: 72_000, withheldToCutoff: 3_000, withheldForecast: 1_000,
      actualSource: { note: 'תלושים ינואר עד ספטמבר (הדגמה)', provenance: 'document', checkedAt: '2026-10-10' }, actualFrom: 'document', office: { method: 'runRate', assumption: 'אותה משרה עד סוף השנה' }, chosen: 'office' },
    { id: 'o-biz', person: 'client', source: 'business', entityRef: 'biz-o1', label: 'הדרכה ופיתוח ארגוני', actualToCutoff: 108_000, turnoverToCutoff: 140_000, withheldToCutoff: 2_000,
      actualSource: { note: 'רווח והפסד מפייפרלס עד 09/2026 — לפני תיאומים (הדגמה)', provenance: 'import', checkedAt: '2026-10-10' }, actualFrom: 'import',
      client: { method: 'manual', amount: 30_000, assumption: 'הלקוחה: דצמבר חלש בגלל החגים' },
      office: { method: 'runRate', assumption: 'קצב ינואר עד ספטמבר, בלי המענק החד־פעמי' }, chosen: 'office', turnoverForecast: 45_000 },
    { id: 'a-sal', person: 'spouse', source: 'salary', entityRef: 'emp-a1', label: 'משכורת · עמית', actualToCutoff: 150_000, withheldToCutoff: 17_100, withheldForecast: 5_700,
      actualSource: { note: 'תלושים (הדגמה)', provenance: 'document', checkedAt: '2026-10-10' }, actualFrom: 'document', office: { method: 'runRate' }, chosen: 'office' },
    { id: 'o-int', person: 'client', source: 'capital', label: 'ריבית בפיקדון לא צמוד', actualToCutoff: 3_000, withheldToCutoff: 450, capitalKind: 'interestUnlinked',
      office: { method: 'manual', amount: 1_000, assumption: 'הפיקדון ממשיך באותה ריבית' }, chosen: 'office' },
  ],
  oneOffs: [{ id: 'o-once', person: 'client', lineId: 'o-biz', label: 'הרצאה בכנס — חד־פעמי', amount: 10_000, timing: 'inActual' }],
  adjustments: [{ id: 'o-adj', person: 'client', lineId: 'o-biz', bookCategory: 'כיבוד', amount: 1_200, reason: '20% מכיבוד אינו מוכר' }],
  // כמו בכרטיס: 12% מהמחזור, דו־חודשי (תקופות שמסתיימות בפברואר, אפריל, יוני, אוגוסט עד החתך)
  it: { via: 'manual', readOn: '2026-10-08', method: 'turnoverRate', ratePct: 12, frequency: 2, evidence: { note: 'מסך 134 בשע״ם — הוזן ביד (הדגמה)' },
    periods: [2, 4, 6, 8].map(m => { const t = m === 6 ? 39_375 : 28_750; return { period: `2026-${String(m).padStart(2, '0')}`, state: 'reported' as const, turnover: t, charged: Math.round(t * 0.12), paid: Math.round(t * 0.12) }; }) },
  ni: { via: 'automation', readOn: '2026-10-08', monthlyAdvance: 1_200, basisMonthlyIncome: 12_000, source: { note: 'קריאת ב״ל מהכרטיס · 08.10.2026 (הדגמה)' },
    periods: months(9, () => ({ charged: 1_200, paid: 1_200 })) },
  vat: { via: 'manual', periods: [] },
  payments: [],
  savings: [
    { person: 'client', pensionToCutoff: 6_000, pensionPlanned: 2_000, studyFundToCutoff: 0, insuredSalary: 96_000, employeeDeposits: 5_760, employerDeposits: 12_000 },
  ],
  credits: [{ person: 'client', donations: 1_500 }],
  spouseSource: 'none',
  reconciliations: [],
  decisions: [],
  note: 'הדגמה: לקוחה שכירה ועצמאית; בן זוג שכיר',
};
