// ניכוי 47א ובסיס ב״ל לעצמאי (סעיף 345) — המחשבון הכללי מול חישוב ידני.
// ‼ ההשוואה להערכת המס (אותה פונקציה) — ב-features/taxEstimate/__tests__/niBaseParity.test.ts, מחוץ לשחרור הידע.
// לפני 11.10.2026 המחשבון חישב את דמי הביטוח על ההכנסה ברוטו ⇒ ניכוי גבוה מדי ומס נמוך בכ-440 ₪ ב-360 אלף.
import { test, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import type { Client, TaxCalcInput } from '../../types';
import { calculateTax } from '../taxCalculations';
import { getTaxYearData } from '../../data/taxData';

const BR: [number, number][] = [[84_120, 0.10], [120_720, 0.14], [228_000, 0.20], [301_200, 0.31], [560_280, 0.35], [Infinity, 0.47]];
const brackets = (t: number) => { let tax = 0, prev = 0; for (const [top, r] of BR) { if (t > prev) tax += (Math.min(t, top) - prev) * r; prev = top; } return tax; };
/** ידני: בסיס ב״ל = (I + 0.52×(t2−t1)×L) ÷ (1 + 0.52×t2) מעל הסף; ניכוי = 52% מהחלק הלאומי. L = הסף השנתי שנותר אחרי משכורת. */
function handNi(I: number, salary = 0) {
  const L = Math.max(0, 7_703 * 12 - Math.min(salary, 7_703 * 12)), t1 = 0.0447, t2 = 0.1283;
  const low = I / (1 + 0.52 * t1);
  const B = low <= L ? low : (I + 0.52 * (t2 - t1) * L) / (1 + 0.52 * t2);
  const ni = Math.min(B, L) * t1 + Math.max(0, B - L) * t2;
  return { base: B, ni, deduction: 0.52 * ni };
}
const client = (p: Partial<Client> = {}): Client => ({ id: 'c', firstName: 'א', lastName: 'ב', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p } as unknown as Client);
const input = (business: number, salary = 0): TaxCalcInput => ({
  client: client({ incomeTaxType: salary ? 'both' : 'selfEmployed', niType: salary ? 'employeeAndSE' : 'selfEmployed' } as Partial<Client>),
  year: 2026, grossSalary: salary, employeePensionPct: 0, selfEmployedGrossIncome: business, recognizedExpenses: 0, selfEmployedPensionAmount: 0,
  rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: 0, krenHashtalmutSE: 0, overrideCreditPoints: false, manualCreditPoints: 0,
} as TaxCalcInput);
const td = getTaxYearData(2026)!;
const itOf = (r: ReturnType<typeof calculateTax>) => r.totalTaxBurden - r.totalNI;
const near = (a: number, b: number, tol: number, m: string) => assert(Math.abs(a - b) <= tol, `${m}: ${Math.round(a)} מול ${Math.round(b)}`);

export const TESTS: TestCase[] = [
  test('עצמאי 360,000 (2026): המחשבון = החישוב הידני (65,168)', () => {
    const h = handNi(360_000);
    const want = brackets(360_000 - h.deduction) - 2.25 * 2_904;
    near(want, 65_168, 1, 'ידני');
    near(itOf(calculateTax(input(360_000), td)), want, 2, 'מחשבון');
  }),
  test('עצמאי מתחת לסף המופחת (60,000): הבסיס = הכנסה ÷ (1 + 0.52 × 4.47%)', () => {
    const h = handNi(60_000);
    const r = calculateTax(input(60_000), td);
    near(r.niDeductionFromIncomeTax ?? 0, h.deduction, 2, 'ניכוי 47א');
  }),
  test('שכיר 120,000 + עצמאי 150,000: הסף המופחת נוצל בשכר — המחשבון = החישוב הידני', () => {
    const h = handNi(150_000, 120_000);
    const want = brackets(120_000 + 150_000 - h.deduction) - 2.25 * 2_904;
    near(itOf(calculateTax(input(150_000, 120_000), td)), want, 2, 'מחשבון');
  }),
  test('מעל תקרת ההכנסה החייבת (1,000,000): הבסיס נעצר בתקרה — כמו קודם', () => {
    const r = calculateTax(input(1_000_000), td);
    near(r.niDeductionFromIncomeTax ?? 0, 0.52 * (7_703 * 12 * 0.0447 + (51_910 - 7_703) * 12 * 0.1283), 2, 'ניכוי בתקרה');
  }),
  test('פנסיה לעצמאי מעל תקרת ההכנסה המזכה: המחשבון = החישוב הידני (מסלול א׳: ניכוי 11,780, זיכוי על 8,220)', () => {
    const i = { ...input(300_000), selfEmployedPensionAmount: 20_000 } as TaxCalcInput;
    const r = calculateTax(i, td);
    const h = handNi(300_000);
    // מדריך 2025, סעיף 53: ניכוי 7% × 164,400 = 11,508; זיכוי עד 5% = 8,220; תוספת על מה שמעל 12% = 20,000 − 19,728 = 272
    const want = brackets(300_000 - 11_780 - h.deduction) - 2.25 * 2_904 - 0.35 * 8_220;
    near(itOf(r), want, 2, 'מחשבון: ניכוי 11,780 וזיכוי על 8,220');
  }),
];
