// ─── מחשבון הלקוח: פנסיה לעצמאי (11.10.2026) ───────────────────────────────
// ‼ הכלל המעודכן (selfEmployedPension, אותה פונקציה של נושא «פנסיה לעצמאי») חל כשיש לו ערכים מאומתים.
// כשאין — שנה בלי ערכים במרשם (2024) או גיל 50 ומעלה (pen.age50Cap פתוח) — המחשבון שומר את החישוב
// הקודם, ו**מסמן את התוצאה** כלא מאומתת (result.unverified), לא רק שורה בפירוט.

import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { TAX_YEARS } from '../../data/taxData';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { calculateTax } from '../taxCalculations';
import type { TaxCalcInput } from '../../types';

const yr = (y: number) => TAX_YEARS.find(t => t.year === y)!;
const se = { ...SAMPLE_CLIENTS[0], incomeTaxType: 'selfEmployed', niType: 'selfEmployed' } as typeof SAMPLE_CLIENTS[0];
const inp = (over: Partial<TaxCalcInput>): TaxCalcInput => ({
  client: se, year: 2026, grossSalary: 0, employeePensionPct: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0,
  selfEmployedPensionAmount: 0, rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: 0,
  krenHashtalmutSE: 0, overrideCreditPoints: true, manualCreditPoints: 2.25, ...over,
});

export const TESTS: TestCase[] = [
  test('2024: החישוב הקודם (11% ניכוי, זיכוי עד 5.5%) — והתוצאה מסומנת «לא מאומת»', () => {
    for (const [year, birthDate] of [[2024, '1985-05-01']] as const) {
      const r = calculateTax(inp({ client: { ...se, birthDate }, year, selfEmployedGrossIncome: 140_000, selfEmployedPensionAmount: 20_000 }), yr(year));
      // ידני: ניכוי = min(20,000, 11% × 140,000 = 15,400); זיכוי 35% × min(4,600, 5.5% × 140,000 = 7,700) = 1,610
      equal(Math.round(r.totalDeductions - r.niDeductionFromIncomeTax), 15_400, `${year}: ניכוי`);
      equal(Math.round(r.pensionCredit), 1_610, `${year}: זיכוי`);
      assert((r.unverified ?? []).length === 1 && r.unverified![0].includes('פנסיה'), `${year}: התוצאה מסומנת`);
      assert(r.deductionBreakdown.some(l => l.includes('לפי החישוב הקודם') && l.includes('לא מאומת')), `${year}: גם בפירוט`);
    }
  }),
  test('מגיל 50 ב-2026, בלי משכורת (13.10.2026): 10.5% עד 11,508, ועוד עד 6% — הכול עד 18,084; בלי סימון', () => {
    const r = calculateTax(inp({ client: { ...se, birthDate: '1970-05-01' }, selfEmployedGrossIncome: 140_000, selfEmployedPensionAmount: 20_000 }), yr(2026));
    // ידני (research/pension-age50 §4): הכנסה מזכה 140,000; בסיסי min(20,000, 14,700, 11,508) = 11,508; זיכוי על min(8,492, 7,000) = 7,000;
    // נוסף min(20,000 − 18,508 = 1,492, 8,400, 18,084 − 11,508) = 1,492 ⇒ ניכוי 13,000; זיכוי 35% × 7,000 = 2,450.
    equal(Math.round(r.totalDeductions - r.niDeductionFromIncomeTax), 13_000);
    equal(Math.round(r.pensionCredit), 2_450);
    equal((r.unverified ?? []).length, 0, 'לא מסומן');
  }),
  test('מתחת לגיל 50 ב-2026: הכלל המעודכן — ניכוי 7% (9,800), זיכוי על 5,200; בלי סימון', () => {
    const r = calculateTax(inp({ client: { ...se, birthDate: '1985-05-01' }, selfEmployedGrossIncome: 140_000, selfEmployedPensionAmount: 15_000 }), yr(2026));
    // ידני (מדריך 2025 סעיף 53): הכנסה מזכה 140,000 (מתחת לתקרה 164,400); ניכוי 7% = 9,800;
    // זיכוי עד 5% = 7,000, אבל נשארו 15,000 − 9,800 = 5,200 ⇒ זיכוי על 5,200; אין תוספת (ההפקדה < 12% = 16,800).
    equal(Math.round(r.totalDeductions - r.niDeductionFromIncomeTax), 9_800);
    equal(Math.round(r.pensionCredit), Math.round(5_200 * 0.35));
    equal((r.unverified ?? []).length, 0, 'לא מסומן');
  }),
];
