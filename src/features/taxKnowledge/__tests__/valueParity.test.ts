// ─── בדיקות: אותו ערך בשני מאגרים — אותו מספר (15.10.2026) ─────────────────────────────────
// ‼ יש שלושה מאגרים: נתוני השנה (taxData — המחשבונים), מרשם הכללים (הלימוד וההערכה), והטבלה הישנה (מחרוזות).
//   כל ערך מוצג במקום אחד, אבל כמה מספרים חיים בשני מאגרים. כאן נעול שהם שווים.
// ‼ כשמבחן כאן נכשל — לא «מתקנים» מספר כדי שיעבור. סתירה בין מאגרים היא שאלה מקצועית: לבדוק מול המקור ולהחליט.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { TAX_YEARS } from '../../../data/taxData';
import { getRule } from '../../taxRules/registry';
import { legacyRow, legacyValueFor } from '../domainValues';

const ruleValue = (id: string, year: number): number | string | undefined => getRule(id)?.values.find(v => v.taxYear === year)?.value;
const yearData = (y: number) => TAX_YEARS.find(t => t.year === y)!;
const digits = (n: number) => n.toLocaleString('en-US');

/** [שדה ב-taxData, כלל במרשם, מכפיל: ערך המרשם = שדה × מכפיל] */
const TAXDATA_VS_RULES: [keyof ReturnType<typeof yearData>, string, number][] = [
  ['creditPointValue', 'core.creditPoint', 1],
  ['rentalExemptMonthly', 'core.rentalExemption', 1],
  ['surtaxThreshold', 'core.surtaxThreshold', 1],
  ['niMaxIncomeMonthly', 'ni.se.maxIncome', 1],
  ['niThreshold60Monthly', 'ni.se.reducedThreshold', 1],
  ['qualifyingIncomeMonthly', 'pen.qualifying.work', 12],
];

/** [שורה ישנה, כלל, מכפיל] — המחרוזת מכילה את מספר הכלל (÷ מכפיל) לשנה. */
const LEGACY_VS_RULES: [string, string, number][] = [
  ['vat.exemptCeiling', 'micro.turnoverCeiling', 1],
  ['studyFund.seCeiling', 'sf.se.ceiling', 1],
  ['studyFund.seExemptDeposit', 'sf.se.exemptDeposit', 1],
  ['studyFund.salaryCeiling', 'sf.mixed.maxDeterminingSalary', 12],
  ['pension.beneficialCeiling', 'pen.credit.extraCeiling', 1],
  ['pension.qualifyingSalary', 'pen.qualifying.work', 12],
  ['realEstate.rentExempt', 'core.rentalExemption', 1],
  ['deadlines.vatAdvances15', 'it.advances.dueDay', 1],
];

export const TESTS: TestCase[] = [
  test('נתוני השנה (מחשבונים) = מרשם הכללים, בכל שנה שיש לשניהם', () => {
    let compared = 0;
    for (const [field, ruleId, mult] of TAXDATA_VS_RULES) {
      assert(!!getRule(ruleId), ruleId);
      for (const ty of TAX_YEARS) {
        const r = ruleValue(ruleId, ty.year);
        if (typeof r !== 'number') continue;
        equal((ty[field] as number) * mult, r, `${String(field)} ↔ ${ruleId} · ${ty.year}`);
        compared++;
      }
    }
    assert(compared >= 8, `השוואות: ${compared}`);
  }),

  test('שורה בטבלה הישנה מכילה את מספר המרשם לאותה שנה', () => {
    let compared = 0;
    for (const [rowId, ruleId, mult] of LEGACY_VS_RULES) {
      const [g, k] = rowId.split('.');
      const row = legacyRow(g, k);
      assert(!!row, rowId);
      for (const y of [2025, 2026]) {
        const r = ruleValue(ruleId, y);
        const text = row ? legacyValueFor(row, y) : undefined;
        if (typeof r !== 'number' || !text || text === '-' || /כמו/.test(text)) continue;
        const want = r / mult;
        assert(text.includes(digits(want)) || text.includes(String(want)), `${rowId} ${y}: «${text}» לא מכיל ${digits(want)} (${ruleId})`);
        compared++;
      }
    }
    assert(compared >= 8, `השוואות: ${compared}`);
  }),

  // ‼ 16.10 (ביקורת כפילויות): עוד שלושה זוגות שחיים בשני מאגרים ולא היו נעולים
  test('מדרגות מס הכנסה: taxData = הטקסט במרשם (כל גבול וכל שיעור)', () => {
    let compared = 0;
    for (const y of [2025, 2026]) {
      const text = ruleValue('core.incomeTaxBrackets', y);
      if (typeof text !== 'string') continue;
      for (const b of yearData(y).incomeTaxBrackets) {
        assert(text.includes(`${b.rate}%`), `${y}: שיעור ${b.rate}% חסר במרשם — «${text}»`);
        if (Number.isFinite(b.upTo)) assert(text.includes(digits(b.upTo)), `${y}: גבול ${digits(b.upTo)} חסר במרשם — «${text}»`);
        compared++;
      }
    }
    assert(compared >= 12, `השוואות: ${compared}`);
  }),
  test('ב״ל לעצמאי: שיעורי taxData = כללי המרשם', () => {
    let compared = 0;
    const pairs: [keyof ReturnType<typeof yearData>['selfEmployedNI'], string][] = [['lowRate', 'ni.se.lowRateNi'], ['highRate', 'ni.se.highRateNi'], ['healthLowRate', 'ni.se.lowRateHealth'], ['healthHighRate', 'ni.se.highRateHealth']];
    for (const ty of TAX_YEARS) for (const [k, id] of pairs) {
      const r = ruleValue(id, ty.year);
      if (typeof r !== 'number') continue;
      equal(Math.round(ty.selfEmployedNI[k] * 100) / 100, Math.round(r * 10000) / 100, `${String(k)} ↔ ${id} · ${ty.year}`);
      compared++;
    }
    assert(compared >= 4, `השוואות: ${compared}`);
  }),
  test('פנסיית חובה: השיעורים בטבלה הישנה = המרשם', () => {
    const row = legacyRow('pension', 'mandatory');
    assert(!!row, 'pension.mandatory');
    for (const y of [2025, 2026]) {
      const text = row ? legacyValueFor(row, y) : undefined;
      for (const id of ['pen.mandatory.lowRate', 'pen.mandatory.highRate']) {
        const r = ruleValue(id, y);
        if (typeof r !== 'number' || !text) continue;
        const pct = `${Math.round(r * 10000) / 100}%`;
        assert(text.includes(pct), `${y}: «${text}» לא מכיל ${pct} (${id})`);
      }
    }
  }),
];
