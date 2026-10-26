// ─── הצהרת הון: סעיפים, סיכומים ושינוי (300) ───────────────────────────────────────────────────────────────────
// ‼ מה נעול כאן: סעיף חסר ≠ 0 (הסיכום «חסר»); «לא» מכל מי שנשאל ⇒ «אין» לבד; 200/210/220/800 כמו בטופס;
//   עובדה ליום אחר לא נספרת; הצהרה קודמת מהמערכת גוברת על סכום שהוקלד; הערכים בקוד הנכון בעמוד הנכון.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { YearFact } from '../../taxYear/types';
import { ITEM_BY_KEY } from '../../taxYear/catalog';
import { computeWealth, SECTIONS, wealthValuesOnPage } from '../engine';
import { wealthSnapshot, snapshotKey } from '../../annualReturn/signing';
import { wealthSummaryRows } from '../print';

const AS = '2025-12-31';
let n = 0;
const f = (itemKey: string, value: unknown, p: Partial<YearFact> = {}): YearFact => ({
  id: `f${++n}`, clientId: 'c', taxYear: 2025, itemKey, subjectRole: 'couple', periodKind: 'as_of', periodTo: AS,
  answer: value === 0 ? 'zero' : value === false ? 'no' : 'value', value: value === 0 || value === false ? undefined : value,
  basis: 'actual', source: 'office', status: 'accepted', createdAt: `2026-10-26T10:00:${String(n).padStart(2, '0')}Z`, ...p,
} as YearFact);
const all = (over: Record<string, number> = {}) => SECTIONS.map(s => f(s.itemKey, over[s.itemKey] ?? 0));

export const TESTS: TestCase[] = [
  test('כל פריט סעיף קיים בקטלוג, סכום של המשרד (או מזומן של הלקוח)', () => {
    for (const s of SECTIONS) {
      const it = ITEM_BY_KEY[s.itemKey];
      assert(!!it, `חסר בקטלוג: ${s.itemKey}`);
      equal(it.kind, 'amount', s.itemKey);
    }
  }),
  test('הסיכומים כמו בטופס: 200 = רכוש · 210 = התחייבויות · 220 = 200 − 210 · 800 = 220 + עסקים', () => {
    const o = computeWealth(all({ 'wealth.realEstate.total': 1_200_000, 'wealth.bank.total': 80_000, 'wealth.liabilities.total': 600_000, 'wealth.loansReceived.total': 50_000, 'wealth.business.total': 30_000 }), AS);
    equal(o.assets, 1_280_000); equal(o.liabilities, 650_000); equal(o.netPrivate, 630_000); equal(o.total, 660_000);
    equal(o.missing.length, 0);
  }),
  test('סעיף בלי סכום ⇒ חסר, והסיכום «חסר» — לא 0', () => {
    const o = computeWealth(all().filter(x => x.itemKey !== 'wealth.vehicles.total'), AS);
    equal(o.assets, null); equal(o.total, null);
    equal(o.missing.map(s => s.code).join(), '90');
  }),
  test('«לא» בשאלת הפתיחה (מכל מי שנשאל) ⇒ «אין» לבד; «כן» של אחד מבני הזוג ⇒ עדיין חסר', () => {
    const base = all().filter(x => x.itemKey !== 'wealth.vehicles.total' && x.itemKey !== 'wealth.crypto.total');
    const o = computeWealth([...base, f('wealth.vehicles.has', false, { subjectRole: 'client' }), f('wealth.vehicles.has', false, { subjectRole: 'spouse' }),
      f('wealth.crypto.has', false, { subjectRole: 'client' }), f('wealth.crypto.has', true, { subjectRole: 'spouse' })], AS);
    const v = o.sections.find(s => s.code === '90')!;
    equal(`${v.amount}|${v.none}|${v.byClient}`, '0|true|true');
    equal(o.missing.map(s => s.code).join(), '40');
  }),
  test('נכס בכרטיס של הלקוח + «לא» של בת הזוג ⇒ נדל״ן עדיין חסר (לא «אין»)', () => {
    const base = all().filter(x => x.itemKey !== 'wealth.realEstate.total');
    const o = computeWealth([...base, f('wealth.realEstate.has', false, { subjectRole: 'spouse' })], AS, undefined, { onCard: new Set(['wRealEstate']) });
    equal(o.missing.map(s => s.code).join(), '10');
  }),
  test('עובדה ליום אחר לא נספרת; האחרונה ליום ההצהרה גוברת', () => {
    const facts = [...all(), f('wealth.bank.total', 99_999, { periodTo: '2024-12-31' }), f('wealth.bank.total', 50_000), f('wealth.bank.total', 70_000)];
    equal(computeWealth(facts, AS).assets, 70_000);
  }),
  test('השינוי מול ההצהרה הקודמת: מהמערכת גובר על מה שהוקלד; בלי מערכת — מה שהוקלד', () => {
    const prevAs = '2020-12-31';
    const prev = SECTIONS.map(s => f(s.itemKey, s.itemKey === 'wealth.bank.total' ? 10_000 : 0, { periodTo: prevAs }));
    const now = all({ 'wealth.bank.total': 25_000 });
    equal(computeWealth(now, AS, { facts: prev, asOf: prevAs, typedNetWorth: 1 }).change, 15_000);
    equal(computeWealth(now, AS, { asOf: prevAs, typedNetWorth: 5_000 }).change, 20_000);
  }),
  test('בטופס: כל סכום בקוד שלו בעמוד שבו הוא מודפס; 0 בסעיף לא נכתב, 200/210/220/800 כן', () => {
    const o = computeWealth(all({ 'wealth.realEstate.total': 1_000, 'wealth.funds.total': 2_000, 'wealth.liabilities.total': 500 }), AS);
    const p1 = Object.fromEntries(wealthValuesOnPage(1, o).map(v => [v.code, v.text]));
    equal(p1['10'], (1000).toLocaleString('he-IL'));
    assert(!('20' in p1), '0 נכתב');
    const p2 = Object.fromEntries(wealthValuesOnPage(2, o).map(v => [v.code, v.text]));
    equal(p2['60'], (2000).toLocaleString('he-IL'));
    const all7 = [1, 2, 3, 4, 5, 6, 7].flatMap(p => wealthValuesOnPage(p, o)).map(v => v.code);
    for (const c of ['200', '210', '220', '800']) assert(all7.includes(c), `חסר ${c}`);
  }),
  test('הצילום לחתימה: «השתנה» רק כשסכום בסעיף השתנה; שורות ההדפסה מהצילום', () => {
    const meta = { year: 2025, clientName: 'דוד', docs: [] };
    const a = wealthSnapshot(computeWealth(all({ 'wealth.bank.total': 1 }), AS), meta);
    const b = wealthSnapshot(computeWealth(all({ 'wealth.bank.total': 1 }), AS), { ...meta, docs: [{ title: 'x', who: 'y' }] });
    equal(snapshotKey(a), snapshotKey(b));
    assert(snapshotKey(a) !== snapshotKey(wealthSnapshot(computeWealth(all({ 'wealth.bank.total': 2 }), AS), meta)), 'שינוי לא זוהה');
    const rows = wealthSummaryRows(a);
    equal(rows.find(r => r.code === '800')?.value, `${(1).toLocaleString('he-IL')} ₪`);
  }),
];
