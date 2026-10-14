// ─── הדוח השנתי: קריאה אחידה של עובדות שנת המס ───────────────────────────────────
// ‼ מקור אחד: אותן עובדות שאושרו בתיק המס (tax_year_facts) — אותו אדם, ישות, שנה, תקופה, מקור ואישור — שהערכת
//   המס, השאלונים והדוח קוראים. כאן רק «קריאה»: איזה רכיב, לאיזו תקופה, וכמה אפשר לסמוך עליו.
// ‼ נתון לשנה = עובדה שמכסה 1.1–31.12 בבסיס «סופי» או «בפועל». «עד החתך» (מהערכת המס) אינו שנה מלאה — הוא
//   מוצג כחלק שהדוח צריך להשלים, לא נכנס כאילו הוא השנה.
// ‼ «ריק ≠ אפס»: חסר = אין עובדה; answer 'zero'/'no' הם תשובות.

import type { Evidence, YearFact } from '../taxYear/types';

/** כמה אפשר לסמוך על נתון: נקרא מהרשות · הוזן / הוצהר · אומת מול מסמך. */
export type Trust = 'read' | 'manual' | 'verified';

export interface FactReading {
  fact: YearFact;
  /** הרכיב (למשל gross / withheld) — לעובדה שערכה אובייקט של רכיבים. */
  component: string;
  amount: number;
  trust: Trust;
}

/** שמות הרכיבים שבהם נשמרים ערכים (מהכרטיס, מהשאלון הישן, מהמשרד) — לשם אחיד. */
const ALIASES: Record<string, Record<string, string>> = {
  'salary.amounts': { gross: 'gross', grossSalaryAnnual: 'gross', 'employers.grossSalaryAnnual': 'gross', taxWithheld: 'withheld', withheld: 'withheld',
    mandatoryTaxWithheld: 'withheld', 'employers.mandatoryTaxWithheld': 'withheld', insured: 'insured', insuredIncome: 'insured',
    employerDeposits: 'employerDeposits', studyFundSalary: 'studyFundSalary', employeePension: 'employeePension' },
  'business.profit': { profit: 'profit', netIncome: 'profit', 'businesses.netIncome': 'profit', turnover: 'turnover', revenueAnnual: 'turnover',
    'businesses.revenueAnnual': 'turnover', customerWithholding: 'customerWithholding' },
  'capital.amounts': { gains: 'gains', capitalGainsRealized: 'gains', 'investmentAccounts.capitalGainsRealized': 'gains', dividend: 'dividend',
    dividendIncome: 'dividend', 'investmentAccounts.dividendIncome': 'dividend', interest: 'interest', interestIncome: 'interest',
    'investmentAccounts.interestIncome': 'interest', withheld: 'withheld', taxWithheld: 'withheld', lossCarried: 'loss' },
  'rent.income': { amount: 'income', income: 'income', rentalIncomeAnnual: 'income' },
  'rent.incomeTotal': { amount: 'income', income: 'income', rentalIncomeAnnual: 'income' },
  'savings.selfAmounts': { pension: 'pension', selfEmployedPensionAmount: 'pension', 'spouse.selfEmployedPensionAmount': 'pension',
    studyFund: 'studyFund', krenHashtalmutSE: 'studyFund', 'spouse.krenHashtalmutSE': 'studyFund' },
  'savings.insuranceAmounts': { life: 'life', lifeInsuranceAnnual: 'life', disability: 'disability', disabilityInsuranceAnnual: 'disability' },
};
/** עובדה שערכה מספר — לאיזה רכיב הוא שייך. */
const DEFAULT_COMPONENT: Record<string, string> = {
  'salary.amounts': 'gross', 'business.profit': 'profit', 'rent.income': 'income', 'rent.incomeTotal': 'income', 'capital.amounts': 'gains',
  'donations.amount': 'amount', 'payments.advances': 'amount', 'payments.withholding': 'amount', 'special.otherIncome': 'amount',
  'household.alimonyPaid': 'amount', 'rent.expenses': 'amount', 'special.gambling': 'amount',
};

export function trustOf(f: YearFact, evidence: Evidence[]): Trust {
  if (f.source === 'automation') return 'read';
  const ev = f.evidenceId ? evidence.find(e => e.id === f.evidenceId) : undefined;
  if (f.status === 'accepted' && ev && (f.basis === 'final' || f.basis === 'actual')) return 'verified';
  return 'manual';
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : undefined);

/** רכיבי הסכום שבעובדה (מספר או אובייקט רכיבים), בשמות אחידים. */
export function readComponents(f: YearFact): { component: string; amount: number }[] {
  if (f.answer === 'zero') return [{ component: DEFAULT_COMPONENT[f.itemKey] ?? 'amount', amount: 0 }];
  if (f.answer !== 'value') return [];
  const n = num(f.value);
  if (n != null) return [{ component: DEFAULT_COMPONENT[f.itemKey] ?? 'amount', amount: n }];
  if (f.value && typeof f.value === 'object' && !Array.isArray(f.value)) {
    const al = ALIASES[f.itemKey] ?? {};
    return Object.entries(f.value as Record<string, unknown>).flatMap(([k, v]) => { const a = num(v); return a == null ? [] : [{ component: al[k] ?? k, amount: a }]; });
  }
  return [];
}

/** האם העובדה מכסה את כל שנת המס (ולא עד חתך / חודשים). */
export function coversFullYear(f: YearFact, year: number): boolean {
  if (f.basis !== 'final' && f.basis !== 'actual') return false;
  if (f.periodKind !== 'year' && f.periodKind !== 'months') return false;
  const from = f.periodFrom ?? `${year}-01-01`, to = f.periodTo ?? `${year}-12-31`;
  return from <= `${year}-01-01` && to >= `${year}-12-31`;
}

export interface YearSlice {
  /** עובדות מאושרות לשנה המלאה, לפי מפתח → לכל אדם/ישות — האחרונה. */
  full: YearFact[];
  /** עובדות מאושרות שמכסות רק חלק מהשנה (עד חתך / חודשים) — חלק שהדוח משלים. */
  partial: YearFact[];
  /** ממתינות לאישור המשרד — לא נכנסות. */
  pending: YearFact[];
}

/** מפריד את עובדות השנה: מלאות ומאושרות · חלקיות · ממתינות. בכל קבוצה — הגרסה האחרונה לכל (מפתח, אדם, ישות). */
export function sliceYear(facts: YearFact[], year: number): YearSlice {
  const ofYear = facts.filter(f => f.taxYear === year && f.status !== 'rejected' && f.status !== 'superseded' && f.basis !== 'forecast');
  const latest = (xs: YearFact[]) => {
    const m = new Map<string, YearFact>();
    for (const f of [...xs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) m.set(`${f.itemKey}|${f.subjectRole}|${f.entityRef ?? ''}|${componentsKey(f)}`, f);
    return [...m.values()];
  };
  const accepted = ofYear.filter(f => f.status === 'accepted');
  const full = latest(accepted.filter(f => coversFullYear(f, year) || f.periodKind === 'carry_forward' || f.periodKind === 'transaction'));
  const fullKeys = new Set(full.map(f => `${f.itemKey}|${f.subjectRole}|${f.entityRef ?? ''}`));
  return {
    full,
    partial: latest(accepted.filter(f => !coversFullYear(f, year) && f.periodKind !== 'carry_forward' && f.periodKind !== 'transaction' && f.periodKind !== 'as_of'
      && !fullKeys.has(`${f.itemKey}|${f.subjectRole}|${f.entityRef ?? ''}`))),
    pending: ofYear.filter(f => f.status === 'pending'),
  };
}
// עובדה עם רכיבים שונים (ברוטו ומס שנוכה בנפרד) — לא «מחליפות» זו את זו
const componentsKey = (f: YearFact) => readComponents(f).map(c => c.component).sort().join(',');

/** סכום רכיב לאדם (ולישות, אם צוינה) מהעובדות המלאות — עם הקריאות שתרמו לו (למקור). */
export function sumComponent(slice: YearSlice, itemKey: string, component: string, role: 'client' | 'spouse' | 'couple', evidence: Evidence[], entityRef?: string): { amount?: number; readings: FactReading[] } {
  const readings: FactReading[] = [];
  for (const f of slice.full) {
    if (f.itemKey !== itemKey || f.subjectRole !== role || (entityRef != null && f.entityRef !== entityRef)) continue;
    for (const c of readComponents(f)) if (c.component === component) readings.push({ fact: f, component, amount: c.amount, trust: trustOf(f, evidence) });
  }
  return { amount: readings.length ? readings.reduce((a, r) => a + r.amount, 0) : undefined, readings };
}

/** תשובת «כן» לשאלת סינון (מקור הכנסה שהדוח צריך לדעת עליו). */
export function screenerYes(slice: YearSlice, itemKey: string, role?: 'client' | 'spouse' | 'couple'): boolean {
  return [...slice.full, ...slice.partial].some(f => f.itemKey === itemKey && f.answer === 'value' && f.value !== false && (role == null || f.subjectRole === role));
}
