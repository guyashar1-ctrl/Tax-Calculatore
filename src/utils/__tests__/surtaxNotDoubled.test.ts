// ─── בדיקות: מס יסף נספר פעם אחת (10.10.2026) ──────────────────────────────
// ‼ מה נעול כאן: בלוח העזר הרשמי (2025 עמ׳ 8, 2026 עמ׳ 10) המדרגה העליונה היא
// 47% «מכל שקל נוסף»; מס יסף 3% הוא מס נפרד. עד היום הטבלה כללה מדרגת 50%
// וגם החישוב הוסיף 3% — מעל הסף נגבה 53%.

import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { TAX_YEARS } from '../../data/taxData';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { calculateTax } from '../taxCalculations';
import type { TaxCalcInput } from '../../types';

const input = (selfEmployedGrossIncome: number): TaxCalcInput => ({
  client: SAMPLE_CLIENTS[0], year: 2026, grossSalary: 0, employeePensionPct: 0,
  selfEmployedGrossIncome, recognizedExpenses: 0, selfEmployedPensionAmount: 0,
  rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0,
  donationsSection46: 0, krenHashtalmutSE: 0, overrideCreditPoints: true, manualCreditPoints: 0,
});

export const TESTS: TestCase[] = [
  test('אין מדרגת 50% בטבלה — המדרגה העליונה 47% עד אינסוף, בכל השנים', () => {
    for (const ty of TAX_YEARS) {
      const last = ty.incomeTaxBrackets[ty.incomeTaxBrackets.length - 1];
      equal(last.rate, 47, `${ty.year}: מדרגה עליונה`);
      equal(last.upTo, Infinity, `${ty.year}: עד אינסוף`);
      assert(!ty.incomeTaxBrackets.some(b => b.rate === 50), `${ty.year}: אין 50%`);
    }
  }),

  test('הכנסה מעל הסף: מס המדרגות ב-47% ועוד 3% יסף — פעם אחת', () => {
    const data = TAX_YEARS.find(t => t.year === 2026)!;
    const r = calculateTax(input(1_000_000), data);
    const base = r.taxableIncome;
    assert(base > data.surtaxThreshold, `ההכנסה החייבת ${base} מעל הסף`);
    const top = r.bracketLines[r.bracketLines.length - 1];
    equal(top.rate, 47);
    equal(Math.round(r.surtax), Math.round((base - data.surtaxThreshold) * 0.03));
    equal(r.marginalRate, 50, 'שולי אפקטיבי = 47 + 3');
  }),

  test('הכנסה מתחת לסף: אין יסף, השולי לפי המדרגה', () => {
    const data = TAX_YEARS.find(t => t.year === 2026)!;
    const r = calculateTax(input(300_000), data);
    equal(r.surtax, 0);
    assert(r.marginalRate < 47, `שולי ${r.marginalRate}`);
  }),
];
