// הערכת מס בארבעה שלבים (27.10.2026): מהרו״ה לצפי, תשובת הלקוח לכל חודש, וההתאמות לפי הנוהל.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { YearFact } from '../../taxYear/types';
import type { EstimateDraft, IncomeLine } from '../types';
import { adjustmentRows, deriveDraft, FORECAST_ITEM, forecastAnswerOf, incomeExpenses, suggestedMonths } from '../forecastFlow';
import { recognizedOf, ruleFor } from '../adjustmentRules';
import { cleanRecord, forecastSummary, schemaFor, validateRecord } from '../../taxYear/records';

const months = Array.from({ length: 9 }, (_, i) => ({ m: i + 1, income: 30_000 + (i === 8 ? 30_000 : 0), expenses: 10_000 }));
const line = (p: Partial<IncomeLine> = {}): IncomeLine => ({
  id: 'b1', person: 'client', source: 'business', entityRef: 'biz-1', label: 'ייעוץ',
  actualToCutoff: 300_000 - 90_000, turnoverToCutoff: 300_000, months,
  bookCategories: [{ label: 'רכב', toCutoff: 12_000 }, { label: 'כיבוד', toCutoff: 3_000 }, { label: 'קנסות', toCutoff: 400 }, { label: 'שכירות', toCutoff: 20_000 }],
  ...p,
});
const draft = (l: IncomeLine): EstimateDraft => ({
  cutoffMonth: 9, preparedOn: '2026-10-27', lines: [l], oneOffs: [], adjustments: [], it: { via: 'manual', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: [] },
  ni: { via: 'manual' }, vat: { via: 'manual', periods: [] }, payments: [], savings: [], reconciliations: [], decisions: [],
});
const fact = (items: unknown[], status: YearFact['status'] = 'pending'): YearFact => ({
  id: 'f1', clientId: 'c', taxYear: 2026, itemKey: FORECAST_ITEM, subjectRole: 'client', entityKind: 'business', entityRef: 'biz-1', periodKind: 'year',
  answer: 'value', value: { items }, basis: 'forecast', source: 'portal', status, createdAt: '2026-10-28T10:00:00Z',
});

export const TESTS: TestCase[] = [
  test('הקצב: ממוצע חודשי מעוגל לאלף — ההצעה ללקוח לכל חודש שנשאר', () => {
    const s = suggestedMonths(line(), 9)!;
    equal(s.inc.join(','), '33000,33000,33000');
    equal(s.exp.join(','), '10000,10000,10000');
  }),
  test('בלי תשובה: הצפי לפי הקצב, של המשרד, ומסומן כך', () => {
    const d = deriveDraft(draft(line()), [], '2026-10-27');
    const l = d.lines[0];
    equal(l.chosen, 'office');
    equal(l.turnoverForecast, 100_000);               // 300,000 ÷ 9 × 3
    equal(l.office?.amount, 70_000);                  // (33,333 − 10,000) × 3
    assert(/לפי הקצב/.test(l.office?.assumption ?? ''), 'מסומן «לפי הקצב»');
  }),
  test('«נכון» — הקצב, של הלקוח; «יהיה אחרת» — סכום החודשים שקבע', () => {
    const ok = deriveDraft(draft(line()), [fact([{ incA: 'ok', expA: 'ok' }])], '2026-10-27').lines[0];
    equal(ok.chosen, 'client');
    equal(ok.turnoverForecast, 100_000);
    const chg = deriveDraft(draft(line()), [fact([{ incA: 'chg', incM: [30_000, 30_000, 60_000], expA: 'ok' }])], '2026-10-27').lines[0];
    equal(chg.turnoverForecast, 120_000);
    equal(chg.client?.amount, 120_000 - 30_000);
    assert(/שינה/.test(chg.client?.assumption ?? ''), 'מסומן «שינה»');
  }),
  test('תשובה שנדחתה או של עסק אחר — לא נספרת', () => {
    equal(forecastAnswerOf([fact([{ incA: 'ok' }], 'rejected')], line()), null);
    equal(forecastAnswerOf([{ ...fact([{ incA: 'ok' }]), entityRef: 'biz-2' }], line()), null);
  }),
  test('התאמות לפי הנוהל: רכב 45%, כיבוד 80%, קנס 0, שכירות — בלי התאמה; לשנה — באותו יחס כמו ההוצאות', () => {
    const rows = adjustmentRows(line(), 9);
    equal(rows.find(r => r.label === 'רכב')!.adj, 6_600);
    equal(rows.find(r => r.label === 'כיבוד')!.adj, 600);
    equal(rows.find(r => r.label === 'קנסות')!.adj, 400);
    equal(rows.find(r => r.label === 'שכירות')!.rule, undefined);
    const d = deriveDraft(draft(line()), [], '2026-10-27');
    const auto = d.adjustments.filter(a => a.auto);
    equal(auto.length, 3);
    // הוצאות עד החתך 90,000, צפי 30,000 ⇒ יחס 4/3
    equal(auto.find(a => a.bookCategory === 'רכב')!.amount, 8_800);
    const x = incomeExpenses(d, d.lines[0]);
    equal(x.adjTo, 7_600);
    equal(x.recognizedTo, 90_000 - 7_600);
  }),
  test('תיאום ידני לאותה קטגוריה — לא מתאמים פעמיים', () => {
    const base = draft(line());
    const d = deriveDraft({ ...base, adjustments: [{ id: 'm', person: 'client', lineId: 'b1', bookCategory: 'רכב', amount: 5_000, reason: 'לפי יומן רכב' }] }, [], '2026-10-27');
    equal(d.adjustments.filter(a => a.bookCategory === 'רכב').length, 1);
    equal(d.adjustments.find(a => a.bookCategory === 'רכב')!.amount, 5_000);
  }),
  test('טלפון נייד: חצי, עד 1,380 ₪ לשנה — יחסית לחודשים', () => {
    const r = ruleFor('טלפון נייד')!;
    equal(recognizedOf(r, 1_000, 9), 500);
    equal(recognizedOf(r, 6_000, 9), 1_035);          // 1,380 × 9/12
  }),
  test('תשובת הצפי בדף: בלי בחירה — חסר; «נכון» — שלם; הסיכום במילים', () => {
    const s = schemaFor('forecastMonths');
    assert(Object.keys(validateRecord(s, { needsExp: true })).length > 0, 'בלי בחירה — חסר');
    assert(Object.keys(validateRecord(s, { needsExp: true, incA: 'ok' })).length > 0, 'בלי הוצאות — חסר');
    equal(Object.keys(validateRecord(s, { needsExp: true, incA: 'ok', expA: 'chg', expM: [1, 2, 3] })).length, 0);
    equal(forecastSummary({ incA: 'chg', incM: [10_000, 10_000], expA: 'ok' }), 'הכנסות: 20,000 ₪ עד סוף השנה · הוצאות: לפי הקצב');
  }),
  test('השליחה מהדף שומרת את הצפי (ניקוי הרשומה לא מוחק אותו) — והתשובה נקראת במשרד', () => {
    const sent = cleanRecord(schemaFor('forecastMonths'), { incA: 'chg', incM: [30_000, 30_000, 40_000.4, -5], expA: 'ok', needsExp: true, junk: 1 });
    equal(JSON.stringify(sent), JSON.stringify({ incA: 'chg', expA: 'ok', incM: [30_000, 30_000, 40_000, 0] }));
    equal(forecastAnswerOf([fact([sent])], line())?.answer.incA, 'chg');
  }),
];
