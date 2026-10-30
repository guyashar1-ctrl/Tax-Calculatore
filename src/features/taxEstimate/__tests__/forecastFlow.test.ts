// הערכת מס בארבעה שלבים (27.10.2026): מהרו״ה לצפי, תשובת הלקוח לכל חודש, וההתאמות לפי הנוהל.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { YearFact } from '../../taxYear/types';
import type { EstimateDraft, IncomeLine } from '../types';
import { adjustmentRows, deriveDraft, FORECAST_ITEM, forecastAnswerOf, incomeExpenses, suggestedMonths, withClientAnswers } from '../forecastFlow';
import type { Client } from '../../../types';
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
  // ── 30.10.2026 · הערכת מס פשוטה (docs/proposals/2026-10-30-tax-estimate-simple.html) ──
  test('משכורת וב״ל «בערך» מהשאלון — שורות בהערכה; משכורת מהתיק בלי סכום מוחלפת', () => {
    const c = { id: 'c', firstName: 'גיא', businessTransfer: true, pitAdvancePercent: 5 } as unknown as Client;
    const sal = { ...fact([{ monthly: 9_000, months: 12 }], 'pending'), id: 's1', itemKey: 'salary.estimate', entityKind: undefined, entityRef: undefined };
    const ni = { ...fact([], 'accepted'), id: 'n1', itemKey: 'niBenefits.estimate', value: 6_000, entityKind: undefined, entityRef: undefined };
    const emp: IncomeLine = { id: 'sal-e1', person: 'client', source: 'salary', entityRef: 'e1', label: 'משכורת · מעסיק' };
    const d = withClientAnswers({ ...draft(line()), lines: [line(), emp] }, [sal, ni], c, '2026-10-30');
    assert(!d.lines.some(l => l.id === 'sal-e1'), 'המשכורת מהתיק בלי סכום נשארה');
    const s = d.lines.find(l => l.id === 'sal-est-client')!;
    equal(s.actualToCutoff, 81_000);
    equal(s.client?.amount, 27_000);
    equal(d.lines.find(l => l.id === 'ni-est-client')?.actualToCutoff, 6_000);
    equal(d.newBusiness, undefined);
  }),
  test('עסק חדש: שורה לעסק, צפי לשנה מלאה מהלקוח, מקדמה לפי מחזור — ובלי לדרוש קריאות מהרשויות', () => {
    const c = { id: 'c', firstName: 'דנה', businessTransfer: false, hasPreviousAccountant: false } as unknown as Client;
    const ans = cleanRecord(schemaFor('forecastMonths'), { incA: 'chg', incY: 180_000, expA: 'chg', expY: 36_000, start: '2026-12', needsExp: true });
    equal(JSON.stringify(ans), JSON.stringify({ incA: 'chg', expA: 'chg', incY: 180_000, expY: 36_000, start: '2026-12' }));
    equal(forecastSummary(ans), 'מתחיל ב-12.2026 · הכנסות 15,000 ₪ בחודש · הוצאות 3,000 ₪ בחודש');
    const f = { ...fact([ans]), entityKind: undefined, entityRef: undefined };
    const base: EstimateDraft = { ...draft(line()), lines: [], it: { via: 'manual', method: 'unknown', frequency: 1, periods: [] } };
    const d = deriveDraft(base, [f], '2026-10-30', c);
    equal(d.newBusiness?.start, '2026-12');
    const l = d.lines.find(x => x.id === 'biz-new')!;
    equal(l.turnoverForecast, 180_000);
    equal(l.client?.amount, 144_000);
    equal(l.actualToCutoff, 0);
    equal(d.it.method, 'turnoverRate');
    // שהלקוח כבר לא «עסק חדש» (נפתח תיק עם מקדמות) — השורה הזמנית והסימון יורדים
    const after = deriveDraft(d, [f], '2026-10-30', { ...c, pitAdvancePercent: 6 } as Client);
    assert(!after.lines.some(x => x.id === 'biz-new') && !after.newBusiness, 'נשאר עסק חדש');
  }),
  test('משכורת בערך: חודשים בין 1 ל-12, וחובה סכום', () => {
    const s = schemaFor('salaryEstimate');
    equal(Object.keys(validateRecord(s, { monthly: 9_000, months: 12 })).length, 0);
    assert(!!validateRecord(s, { monthly: 9_000, months: 13 }).months, '13 חודשים');
    assert(!!validateRecord(s, { months: 6 }).monthly, 'בלי סכום');
  }),
  test('נגזר פעמיים — אותה טיוטה (אחרת «ההמלצה בדף» נראית כאילו השתנתה)', () => {
    const c = { id: 'c', firstName: 'דנה', businessTransfer: false, hasPreviousAccountant: false } as unknown as Client;
    const f = { ...fact([{ incA: 'chg', incY: 180_000, expA: 'chg', expY: 36_000, start: '2026-12' }]), entityKind: undefined, entityRef: undefined };
    const sal = { ...fact([{ monthly: 9_000, months: 12 }]), id: 's1', itemKey: 'salary.estimate', entityKind: undefined, entityRef: undefined };
    const base: EstimateDraft = { ...draft(line()), lines: [], it: { via: 'manual', method: 'unknown', frequency: 1, periods: [] } };
    const once = deriveDraft(base, [f, sal], '2026-10-30', c);
    equal(JSON.stringify(deriveDraft(once, [f, sal], '2026-10-30', c)), JSON.stringify(once));
  }),
  test('«קרא שוב»: קריאה חדשה מהרשות בכרטיס נכנסת לחישוב — והתקופות שנקלטו ביד נשמרות', () => {
    const c = { id: 'c', firstName: 'גיא', businessTransfer: true, pitAdvancePercent: 7, pitAdvanceFrequency: 'monthly', niAdvanceMonthly: 2_000,
      fieldMeta: { pitAdvancePercent: { source: 'shaam', syncedAt: '2026-10-30T08:00:00Z' }, niAdvanceMonthly: { source: 'shaam', syncedAt: '2026-10-30T08:00:00Z' } } } as unknown as Client;
    const old: EstimateDraft = { ...draft(line()), it: { via: 'automation', readOn: '2026-10-01', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: [{ period: '2026-01', state: 'reported', paid: 1_500 }] }, ni: { via: 'automation', readOn: '2026-10-01', monthlyAdvance: 1_450, paidToCutoff: 13_050 } };
    const d = withClientAnswers(old, [], c, '2026-10-30');
    equal(d.it.ratePct, 7);
    equal(d.it.readOn, '2026-10-30');
    equal(d.it.periods.length, 1);
    equal(d.ni.monthlyAdvance, 2_000);
    equal(d.ni.paidToCutoff, 13_050);
    // קריאה ישנה מזו שבטיוטה — לא דורסת
    const stale = withClientAnswers({ ...old, it: { ...old.it, readOn: '2026-11-15' } }, [], c, '2026-10-30');
    equal(stale.it.ratePct, 5);
  }),
];
