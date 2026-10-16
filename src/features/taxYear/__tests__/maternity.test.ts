// ─── דמי לידה שחוצים שנה — הצעת חלוקה (16.10.2026) ─────────────────────────────────
// ‼ מה נעול: ימים כולל שני הקצוות; יחס לפי ימים בפועל (105 אינו קבוע); סך החלקים = הסכום והמס שבאישור;
//   דוגמת גיא מהקורס (C21): 08.12.2023–21.03.2024, 39,942 ⇒ 9,129.6 / 30,812.4; מס 256 ⇒ 58.5 / 197.5.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { crossesYearEnd, daysInclusive, maternityAmountsOf, maternityPeriodOf, maternitySplit } from '../maternity';
import type { YearFact } from '../types';
import type { Client } from '../../../types';
import { buildYearPicture } from '../picture';
import { ITEM_BY_KEY } from '../catalog';

const cli = { id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {} } as unknown as Client;
const yf = (itemKey: string, value: unknown, taxYear = 2023) => ({ id: itemKey + taxYear, clientId: 'c1', taxYear, itemKey, subjectRole: 'client', periodKind: 'year', periodFrom: `${taxYear}-01-01`, periodTo: `${taxYear}-12-31`, answer: 'value', value, basis: 'actual', source: 'portal', status: 'pending', createdAt: '2026-10-16T10:00:00Z' } as unknown as YearFact);
const pic = (facts: YearFact[], taxYear = 2023) => buildYearPicture({ client: cli, taxYear, purpose: 'annual', today: '2026-10-16', facts, evidence: [], asks: [] });
const has = (p: ReturnType<typeof pic>, key: string) => p.statuses.find(x => x.item.key === key);

const fact = (itemKey: string, value: unknown, status = 'accepted', role = 'client', createdAt = '2026-10-16T10:00:00Z') =>
  ({ itemKey, subjectRole: role, status, answer: 'value', value, createdAt } as unknown as YearFact);

export const TESTS: TestCase[] = [
  test('שאלות דמי הלידה — רק אחרי «כן» לכספים מביטוח לאומי ול«דמי לידה»; פריט המשרד — רק כשהתקופה חוצה את 31.12', () => {
    equal(has(pic([]), 'niBenefits.maternity'), undefined);
    const yes = [yf('niBenefits.received', true)];
    equal(has(pic(yes), 'niBenefits.maternity')?.state, 'missing');
    equal(has(pic(yes), 'niBenefits.maternityPeriod'), undefined);
    const mat = [...yes, yf('niBenefits.maternity', true)];
    equal(has(pic(mat), 'niBenefits.maternityPeriod')?.state, 'missing');
    equal(has(pic(mat), 'niBenefits.maternitySpread'), undefined);
    const inside = [...mat, yf('niBenefits.maternityPeriod', { items: [{ from: '2023-03-01', to: '2023-06-13' }] })];
    equal(has(pic(inside), 'niBenefits.maternitySpread'), undefined);
    const cross = [...mat, yf('niBenefits.maternityPeriod', { items: [{ from: '2023-12-08', to: '2024-03-21' }] })];
    const sp = has(pic(cross), 'niBenefits.maternitySpread');
    assert(!!sp && pic(cross).officeTodo.some(x => x.item.key === 'niBenefits.maternitySpread'), 'חוצה ⇒ במשימות המשרד');
  }),
  test('ההחלטה שנרשמה לשנה השנייה (2024) מוצגת שם כידועה — בלי צורך בתקופה בשנה הזו', () => {
    const dec = { ...yf('niBenefits.maternitySpread', { decision: 'spread' }, 2024), source: 'office', status: 'accepted' } as YearFact;
    equal(has(pic([dec], 2024), 'niBenefits.maternitySpread')?.state, 'known');
  }),
  test('פריט המשרד — שדות הדוח בקטלוג (250/270, 194/196)', () => {
    deepEqual(ITEM_BY_KEY['niBenefits.maternity'].covers?.fields, ['250', '270', '194', '196']);
    equal(ITEM_BY_KEY['niBenefits.maternitySpread'].who, 'office');
  }),
  test('דוגמת גיא: 24 ימים ב-2023 ו-81 ב-2024 (2024 מעוברת), סכום ומס יחסיים', () => {
    equal(daysInclusive('2023-12-08', '2024-03-21'), 105);
    const s = maternitySplit('2023-12-08', '2024-03-21', 39942, 256)!;
    equal(s.totalDays, 105);
    deepEqual(s.years.map(y => [y.year, y.days, y.amount, y.tax]), [[2023, 24, 9129.6, 58.5], [2024, 81, 30812.4, 197.5]]);
  }),
  test('105 אינו קבוע — תקופה ארוכה יותר מחושבת לפי הימים בפועל, והסכומים מסתכמים בדיוק', () => {
    const s = maternitySplit('2025-11-20', '2026-03-31', 50000, 1000)!;
    equal(s.totalDays, 132);
    equal(s.years[0].days + s.years[1].days, 132);
    equal(Math.round((s.years[0].amount! + s.years[1].amount!) * 10) / 10, 50000);
    equal(Math.round((s.years[0].tax! + s.years[1].tax!) * 10) / 10, 1000);
  }),
  test('בלי סכומים — רק ימים; תקופה בתוך שנה אחת — לא חוצה; תאריכים הפוכים — אין הצעה', () => {
    const s = maternitySplit('2023-12-08', '2024-03-21')!;
    equal(s.years[0].amount, undefined);
    assert(!crossesYearEnd('2025-01-05', '2025-04-19') && crossesYearEnd('2025-11-01', '2026-02-13'), 'חציית שנה');
    equal(maternitySplit('2025-04-19', '2025-01-05'), null);
  }),
  test('התקופה והסכומים נקראים מהרשומה — מאושרת קודמת לממתינה', () => {
    const facts = [
      fact('niBenefits.maternityPeriod', { items: [{ from: '2025-11-01', to: '2026-02-13' }] }, 'pending', 'client', '2026-10-17T00:00:00Z'),
      fact('niBenefits.maternityPeriod', { items: [{ from: '2025-11-02', to: '2026-02-14' }] }, 'accepted'),
      fact('niBenefits.maternityAmounts', { items: [{ amount: '40000', tax: '' }] }),
    ];
    deepEqual(maternityPeriodOf(facts, 'client'), { from: '2025-11-02', to: '2026-02-14' });
    deepEqual(maternityAmountsOf(facts, 'client'), { amount: 40000, tax: undefined });
    equal(maternityPeriodOf(facts, 'spouse'), null);
  }),
];
