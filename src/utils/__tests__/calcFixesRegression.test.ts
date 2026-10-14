// ─── רגרסיה לתיקוני החישוב של 10.10.2026 (סבב 3) ───────────────────────────
// ‼ התרחישים והערכים הושוו בהרצה על הקוד שלפני התיקון (b9588ca) ועל הקוד הנוכחי —
// ראו docs/tax-foundation/calc-fixes-regression-2026-10-10.md. כאן נעולים ערכי
// «אחרי», וגם מה שלא אמור היה להשתנות.

import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { TAX_YEARS } from '../../data/taxData';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { calculateTax } from '../taxCalculations';
import { calcCreditPointsV2 } from '../creditPoints';
import { compareRentalRoutes } from '../rentalTax';
import type { TaxCalcInput } from '../../types';

const yr = (y: number) => TAX_YEARS.find(t => t.year === y)!;
const inp = (over: Partial<TaxCalcInput>): TaxCalcInput => ({
  client: SAMPLE_CLIENTS[0], year: 2026, grossSalary: 0, employeePensionPct: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0,
  selfEmployedPensionAmount: 0, rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: 0,
  krenHashtalmutSE: 0, overrideCreditPoints: true, manualCreditPoints: 2.25, ...over,
});
const pts = (p: Record<string, unknown>) => calcCreditPointsV2({ year: 2026, gender: 'female', children: [], ...p } as never, 2_904).lines.reduce((a, l) => a + l.points, 0);

export const TESTS: TestCase[] = [
  test('יסף — עצמאי 1,000,000 (2026): 356,850 (היה 365,203 — 8,353 נספרו פעמיים)', () => {
    const r = calculateTax(inp({ selfEmployedGrossIncome: 1_000_000 }), yr(2026));
    equal(Math.round(r.taxBeforeCredit), 355_030);
    equal(Math.round(r.surtax), 8_353);
    equal(Math.round(r.totalIncomeTax), 356_850);
  }),
  test('יסף — זיכויים לא מתקזזים מהיסף: מס המדרגות פחות זיכויים, ואז היסף', () => {
    const r = calculateTax(inp({ selfEmployedGrossIncome: 1_000_000 }), yr(2026));
    equal(Math.round(r.incomeTax), Math.round(r.taxBeforeCredit - 2.25 * yr(2026).creditPointValue));
    equal(Math.round(r.totalIncomeTax), Math.round(r.incomeTax + r.surtax));
  }),
  test('יסף — אישית מתחת לסף + רווח הון: אותו מס כמו קודם; השולי מוצג 50% (47 + 3)', () => {
    const r = calculateTax(inp({ selfEmployedGrossIncome: 600_000, capitalGains: 300_000 }), yr(2026));
    equal(Math.round(r.totalIncomeTax), 165_850);
    equal(Math.round(r.surtax), 5_353);
    equal(r.marginalRate, 50);
  }),
  test('יסף — הכנסה הונית מעל הסף: 2% נוסף רק על ההונית; המדרגות כבר לא כוללות 50%', () => {
    const r = calculateTax(inp({ selfEmployedGrossIncome: 750_000, dividendInterest: 800_000 }), yr(2026));
    equal(Math.round(r.taxBeforeCredit), 237_530);
    equal(Math.round(r.surtaxCapitalExtra), 1_569);
    equal(Math.round(r.totalIncomeTax), 257_418);
  }),
  test('יסף — מתחת לסף: לא השתנה', () => {
    const r = calculateTax(inp({ selfEmployedGrossIncome: 500_000 }), yr(2026));
    equal(Math.round(r.totalIncomeTax), 120_730);
    equal(r.surtax, 0);
  }),
  test('נקודות — הורה אחד: 6.75 לילד בן 10 (היה 5.75), 12.75 לילד בן 2 (היה 8.25); לא הורה אחד — ללא שינוי', () => {
    equal(pts({ children: [{ birthYear: 2016 }], isSoleParent: true }), 6.75);
    equal(pts({ children: [{ birthYear: 2024 }], isSoleParent: true }), 12.75);
    equal(pts({ children: [{ birthYear: 2016 }] }), 4.75);
  }),
  test('נקודות — שירות לאומי 22 חודשים לאישה: 2 נקודות (היה 1); צבאי — ללא שינוי', () => {
    equal(pts({ service: { kind: 'national', months: 22, releaseYear: 2025, releaseMonth: 1 } }), 4.75);
    equal(pts({ service: { kind: 'military', months: 22, releaseYear: 2025, releaseMonth: 1 } }), 4.75);
  }),
  test('נקודות — תואר שני של שנה אחת: חצי נקודה בשנה הראשונה בלבד (היה גם בשנייה)', () => {
    equal(pts({ year: 2026, degrees: [{ kind: 'master', endYear: 2025, studyYears: 1 }] }), 3.25);
    equal(pts({ year: 2027, degrees: [{ kind: 'master', endYear: 2025, studyYears: 1 }] }), 2.75);
    equal(pts({ year: 2027, degrees: [{ kind: 'master', endYear: 2025, studyYears: 2 }] }), 3.25);
  }),
  test('שכ״ד — פטור מופחת: פחת לא מנוכה (חייב 52,785, היה 41,055); מסלול שולי — ללא שינוי', () => {
    const r = compareRentalRoutes({ year: 2026, monthlyRent: 8_000, exemptCeilingMonthly: 5_654, marginalRatePct: 31, isAge60Plus: false, annualExpenses: 6_000, annualDepreciation: 20_000, eligibleForRentPaidDeduction: false, annualRentPaidForOwnHome: 0, propertyCount: 1 });
    equal(Math.round(r.routes.find(x => x.key === 'exempt')!.taxableAnnual), 52_785);
    equal(Math.round(r.routes.find(x => x.key === 'marginal')!.taxableAnnual), 70_000);
    assert(r.routes.find(x => x.key === 'exempt')!.steps.some(s => s.includes('פחת לפי תקנות 1989 לא נוכה')), 'ההסבר מופיע בצעדים');
  }),
  // ‼ 11.10.2026 (שחרור הידע): כשהכלל המעודכן לא מחשב — שנה בלי ערכים במרשם (2024) או גיל 50 ומעלה
  // (pen.age50Cap פתוח) — המחשבון הכללי שומר את חישוב הפנסיה הקודם ומסמן אותו, ולא מוחק את הפנסיה מהחישוב.
  // 13.10.2026: גיל 50 בלי משכורת מחושב בכלל המעודכן (research/pension-age50) — המקרה הזה נשאר רק לשנה בלי ערכים במרשם (2024).
  test('פנסיה לעצמאי — 2024: החישוב הקודם נשמר ומסומן «לא מאומת» (ניכוי 15,400, זיכוי על 4,600)', () => {
    const se = { ...SAMPLE_CLIENTS[0], incomeTaxType: 'selfEmployed', niType: 'selfEmployed' } as typeof SAMPLE_CLIENTS[0];
    for (const [year, birthDate] of [[2024, '1985-05-01']] as const) {
      const r = calculateTax(inp({ client: { ...se, birthDate }, year, selfEmployedGrossIncome: 140_000, selfEmployedPensionAmount: 20_000, overrideCreditPoints: true }), yr(year));
      equal(Math.round(r.totalDeductions - r.niDeductionFromIncomeTax), 15_400, `${year}: ניכוי 11%`);
      equal(Math.round(r.pensionCredit), 1_610, `${year}: זיכוי 35% על 4,600`);
      assert(r.deductionBreakdown.some(l => l.includes('לפי החישוב הקודם') && l.includes('לא מאומת')), `${year}: מסומן`);
    }
  }),
  test('פנסיה לעצמאי — מתחת לגיל 50 ב-2026: הכלל המעודכן (מסלול א׳), בלי סימון «החישוב הקודם»', () => {
    const se = { ...SAMPLE_CLIENTS[0], incomeTaxType: 'selfEmployed', niType: 'selfEmployed', birthDate: '1985-05-01' } as typeof SAMPLE_CLIENTS[0];
    const r = calculateTax(inp({ client: se, selfEmployedGrossIncome: 140_000, selfEmployedPensionAmount: 15_000 }), yr(2026));
    equal(Math.round(r.totalDeductions - r.niDeductionFromIncomeTax), 9_800);
    assert(!r.deductionBreakdown.some(l => l.includes('לפי החישוב הקודם')), 'לא מסומן');
  }),
];
