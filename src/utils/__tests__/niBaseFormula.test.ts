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
    // ‼ 16.10.2026 (R11): ההכנסה לב״ל — אחרי הניכוי לקופת גמל (סעיף 345, דף ב״ל «דוגמה לחישוב דמי ביטוח לעובד עצמאי»)
    const h = handNi(300_000 - 11_780);
    // מדריך 2025, סעיף 53: ניכוי 7% × 164,400 = 11,508; זיכוי עד 5% = 8,220; תוספת על מה שמעל 12% = 20,000 − 19,728 = 272
    const want = brackets(300_000 - 11_780 - h.deduction) - 2.25 * 2_904 - 0.35 * 8_220;
    near(itOf(r), want, 2, 'מחשבון: ניכוי 11,780 וזיכוי על 8,220');
    near(r.niSelfEmployed, h.ni, 2, 'ב״ל לאומי על הבסיס אחרי הפנסיה');
  }),
  test('ב״ל לעצמאי (דף ב״ל 2026): 12,000 לחודש ⇒ בסיס רבעוני 34,690, 3,864 לרבעון — ב״ל ובריאות בנפרד', () => {
    const r = calculateTax(input(144_000), td);
    near(r.niSelfEmployed / 4, 1_032.9 + 1_485.8, 3, 'לאומי לרבעון');
    near(r.healthSelfEmployed / 4, 746.4 + 598.7, 3, 'בריאות לרבעון');
    near((r.niSelfEmployed + r.healthSelfEmployed) / 4, 3_864, 3, 'סה״כ לרבעון');
  }),
  test('שכ״ד במסלול הרגיל אצל שכיר — חייב בב״ל כהכנסה שלא מעבודה (C29); פטור ו-10% — פטורים', () => {
    const base = { ...input(0, 180_000), client: client({ incomeTaxType: 'employee', niType: 'employee' } as Partial<Client>) } as TaxCalcInput;
    const reg = calculateTax({ ...base, rentalIncome: 96_000, rentalTaxTrack: 'regular' }, td);
    // 345: 96,000 ÷ (1 + 0.52 × 7%) = 92,628.4; 348: פחות 3,442 × 12 = 41,304 ⇒ 51,324; הסף המופחת נוצל במשכורת ⇒ 7% + 5.17%
    const ch = 96_000 / (1 + 0.52 * 0.07) - 41_304;
    near(reg.niNonWork ?? 0, ch * 0.07, 2, 'לאומי על השכירות');
    near(reg.healthNonWork ?? 0, ch * 0.0517, 2, 'בריאות על השכירות');
    near(reg.niDeductionFromIncomeTax, 0.52 * ch * 0.07, 2, '47א — 52% מהלאומי בלבד');
    for (const track of ['exempt', 'flat10'] as const) {
      const r = calculateTax({ ...base, rentalIncome: 60_000, rentalTaxTrack: track }, td);
      assert((r.niNonWork ?? 0) === 0 && (r.healthNonWork ?? 0) === 0, `${track}: פטור מב״ל`);
    }
    // פטור חלקי: 7,000 לחודש מול תקרה 5,654 ⇒ החלק החייב (059) חייב בב״ל
    const part = calculateTax({ ...base, rentalIncome: 84_000, rentalTaxTrack: 'exempt' }, td);
    assert((part.taxableRental ?? 0) > 0 && (part.niNonWork ?? 0) === 0, 'פטור חלקי 32,304 לשנה — מתחת לסכום הפטור בב״ל אחרי 345');
  }),
];
