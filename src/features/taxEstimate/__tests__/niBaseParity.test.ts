// ניכוי 47א, בסיס ב״ל ופנסיה לעצמאי — הערכת המס מחשבת בדיוק כמו המחשבון הכללי (אותה פונקציה).
// ‼ פוצל מ-utils/__tests__/niBaseFormula.test.ts ב-11.10.2026: שם — המחשבון מול חישוב ידני (חלק משחרור הידע);
// כאן — ההערכה מול המחשבון, שתלויה בקוד שעוד לא שוחרר.
import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, TaxCalcInput } from '../../../types';
import { calculateTax } from '../../../utils/taxCalculations';
import { getTaxYearData } from '../../../data/taxData';
import { computeEstimate } from '../engine';
import type { EstimateDraft } from '../types';

const client = (p: Partial<Client> = {}): Client => ({ id: 'c', firstName: 'א', lastName: 'ב', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p } as unknown as Client);
const input = (business: number, salary = 0): TaxCalcInput => ({
  client: client({ incomeTaxType: salary ? 'both' : 'selfEmployed', niType: salary ? 'employeeAndSE' : 'selfEmployed' } as Partial<Client>),
  year: 2026, grossSalary: salary, employeePensionPct: 0, selfEmployedGrossIncome: business, recognizedExpenses: 0, selfEmployedPensionAmount: 0,
  rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: 0, krenHashtalmutSE: 0, overrideCreditPoints: false, manualCreditPoints: 0,
} as TaxCalcInput);
const td = getTaxYearData(2026)!;
const itOf = (r: ReturnType<typeof calculateTax>) => r.totalTaxBurden - r.totalNI;
const near = (a: number, b: number, tol: number, m: string) => assert(Math.abs(a - b) <= tol, `${m}: ${Math.round(a)} מול ${Math.round(b)}`);
const draft = (business: number, salary = 0): EstimateDraft => ({
  cutoffMonth: 12, preparedOn: '2026-12-31', oneOffs: [], adjustments: [], payments: [], savings: [], reconciliations: [], decisions: [], vat: { via: 'manual', periods: [] },
  lines: [{ id: 'b', person: 'client', source: 'business', label: 'עסק', actualToCutoff: business, turnoverToCutoff: business }, ...(salary ? [{ id: 's', person: 'client' as const, source: 'salary' as const, label: 'משכורת', actualToCutoff: salary }] : [])],
  it: { via: 'manual', readOn: '2026-12-31', method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual', readOn: '2026-12-31' },
});

export const TESTS: TestCase[] = [
  test('עצמאי 360,000 (2026): ההערכה = המחשבון', () => {
    near(computeEstimate(draft(360_000), { client: client(), taxYear: 2026 }).persons[0].incomeTax, itOf(calculateTax(input(360_000), td)), 2, 'הערכה');
  }),
  test('שכיר 120,000 + עצמאי 150,000: ההערכה = המחשבון', () => {
    near(computeEstimate(draft(150_000, 120_000), { client: client(), taxYear: 2026 }).persons[0].incomeTax, itOf(calculateTax(input(150_000, 120_000), td)), 3, 'הערכה');
  }),
  test('פנסיה לעצמאי מעל תקרת ההכנסה המזכה: ההערכה = המחשבון', () => {
    const r = calculateTax({ ...input(300_000), selfEmployedPensionAmount: 20_000 } as TaxCalcInput, td);
    const d = { ...draft(300_000), savings: [{ person: 'client' as const, pensionToCutoff: 20_000 }] };
    near(computeEstimate(d, { client: client(), taxYear: 2026 }).persons[0].incomeTax, itOf(r), 2, 'הערכה = מחשבון');
  }),
];
