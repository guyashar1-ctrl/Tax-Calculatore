// הצהרת הון — הגישור (27.10.2026): לוח 5, רמת חיים, ריבית מהחזר המשכנתא, מה שנכנס, והפער.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { bridgeYears, computeBridge, personsFrom, type BridgeInput } from '../bridge';
import { tableExpense, tableFor } from '../livingTables';

const base = (p: Partial<BridgeInput> = {}): BridgeInput => ({
  prevAsOf: '2020-12-31', asOf: '2022-12-31', prevTotal: 1_000_000, nowTotal: 1_200_000, prevLiabilities: 500_000, nowLiabilities: 440_000,
  incomes: [{ year: 2021, income: 200_000, tax: 30_000 }, { year: 2022, income: 210_000, tax: 32_000 }],
  personsInYear: () => 4,
  life: { items: [{ cat: 'car', yearly: 20_000 }, { cat: 'abroad', yearly: 15_000 }], mortgageMonthly: 4_000 },
  moneyIn: [{ kind: 'inherit', amount: 100_000, year: 2022 }], moneyOut: [],
  ...p,
});

export const TESTS: TestCase[] = [
  test('לוח 5: קבוצת ההכנסה לפי הגבולות ומספר הנפשות (2021, 4 נפשות, 200,000 ⇒ קבוצה 6)', () => {
    const t = tableExpense(2021, 200_000, 4);
    equal(t.group, 6); equal(t.amount, 72_300); equal(t.exact, true);
    equal(tableExpense(2021, 600_000, 9).amount, 141_324); // מעל הגבול העליון, 6+ נפשות
  }),
  test('שנה בלי לוח — הלוח האחרון שפורסם לפניה, ומסומן «לא מדויק»', () => {
    const t = tableFor(2025);
    equal(t.table.year, 2022); equal(t.exact, false);
    equal(tableFor(2018).table.year, 2020);
  }),
  test('השנים שבין ההצהרות', () => {
    equal(bridgeYears('2020-12-31', '2025-12-31').join(','), '2021,2022,2023,2024,2025');
    equal(bridgeYears(undefined, '2025-12-31').length, 0);
  }),
  test('הגישור: הכנסות − מס + ירושה − (לוח + רמת חיים + ריבית); הפער = הגידול פחות המוסבר', () => {
    const r = computeBridge(base());
    equal(r.missing.length, 0);
    // לוח: 2021 (200,000 ⇒ ק׳ 6, 4 נפשות) 72,300; 2022 (210,000 ⇒ ק׳ 6, 4 נפשות) 85,848
    equal(r.years[0].table!.amount, 72_300); equal(r.years[1].table!.amount, 85_848);
    // ריבית: החזרים 48,000 × 2 = 96,000 פחות הקטנת ההתחייבויות 60,000 = 36,000 ⇒ 18,000 לשנה
    equal(r.interestTotal, 36_000); equal(r.years[0].interest, 18_000);
    equal(r.living, 72_300 + 85_848 + 2 * (35_000 + 18_000));
    equal(r.incomeNet, 348_000);
    equal(r.explained, 348_000 + 100_000 - r.living!);
    equal(r.growth, 200_000);
    equal(r.gap, 200_000 - r.explained!);
  }),
  test('חסר ≠ 0: שנה בלי הכנסה, רמת חיים שלא נענתה — אין פער, יש «חסר»', () => {
    const r = computeBridge(base({ incomes: [{ year: 2021, income: 200_000, tax: 30_000 }], life: null }));
    equal(r.gap, null);
    assert(r.missing.some(m => m.includes('2022')) && r.missing.some(m => m.includes('רמת חיים')), JSON.stringify(r.missing));
  }),
  test('החזר משכנתא בלי התחייבויות קודמות — הריבית לא מנוחשת', () => {
    const r = computeBridge(base({ prevLiabilities: null }));
    equal(r.interestTotal, null); equal(r.gap, null);
  }),
  test('נפשות בבית: נשואים + ילדים שנולדו עד השנה', () => {
    const f = personsFrom(y => y >= 2015, [2016, 2022]);
    equal(f(2014), 1); equal(f(2020), 3); equal(f(2023), 4);
  }),
];
