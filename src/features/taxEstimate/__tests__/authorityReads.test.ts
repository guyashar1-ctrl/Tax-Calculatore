// הערכת מס: מה שהקריאה מהרשויות מביאה לבד (31.10.2026) — 134 (ההחלטה והתשלומים) וב״ל (ממתי חלה, יתרה). נתוני דמה.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { EstimateDraft } from '../types';
import { itFrom134, niFromRead, withAuthorityReads } from '../authorityReads';
import { itMissingPeriods, niPaymentGaps } from '../cashflow';

const it0: EstimateDraft['it'] = { via: 'automation', readOn: '2026-10-20', method: 'turnoverRate', ratePct: 15, frequency: 2, periods: [] };
const per = (from: string, to: string, status: string, paid: number) => ({ from, to, status, turnover: paid * 5, charge: status === 'דווח' ? paid : 0, paid, withheld: 0 });
const r134 = { at: '2026-10-31', value: {
  updatedOn: '2026-03-29', changeMonth: '2026-03', firstMonth: '2026-01', decision: 'דרישת שעור — הגדלה ע"פ בקשה', updatedBy: 'מייצגים',
  periods: [per('2026-01', '2026-02', 'דווח', 4125), per('2026-03', '2026-04', 'דווח', 8700), per('2026-05', '2026-06', 'דווח', 3000), per('2026-07', '2026-08', 'דווח', 2600),
    per('2026-09', '2026-10', 'טרם הגיע המועד', 0), per('2026-11', '2026-12', 'טרם הגיע המועד', 0)],
} };
const draft = (it = it0, ni: EstimateDraft['ni'] = { via: 'automation', readOn: '2026-10-20', monthlyAdvance: 2062 }): EstimateDraft => ({
  cutoffMonth: 9, preparedOn: '2026-10-31', lines: [], oneOffs: [], adjustments: [], it, ni, vat: { via: 'manual', periods: [] }, payments: [], savings: [], reconciliations: [], decisions: [],
});
const niRead = (balance: number, chargedFrom: string | null) => ({ at: '2026-10-31', persons: [{ role: 'client', ok: true, sections: {
  advance: { ok: true, value: { advanceMonthly: 2062, chargedFrom } }, balance: { ok: true, value: balance } } }] });

export const TESTS: TestCase[] = [
  test('134: התקופות לפי חודש הסיום, «עודכן ברשות», «חל מ-», וההחלטה — ו«חסר מ-134» נעלם', () => {
    assert(itMissingPeriods(it0, draft(), 2026, 'client').length > 0, 'לפני: חסר');
    const it = itFrom134(it0, r134, 2026);
    equal(it.periods.map(p => `${p.period}:${p.state}:${p.paid}`).slice(0, 2).join(','), '2026-02:reported:4125,2026-04:reported:8700');
    equal(it.periods[4].state, 'not_due');
    equal(it.decision?.updatedOn, '2026-03-29');
    equal(it.decision?.changeMonth, '2026-03');
    equal(it.readOn, '2026-10-31');
    equal(itMissingPeriods(it, draft(it), 2026, 'client').length, 0);
  }),
  test('134: קריאה ישנה מזו שבטיוטה — לא דורסת', () => {
    const newer = { ...it0, readOn: '2026-11-15', periods: [{ period: '2026-02', state: 'reported' as const, paid: 1 }] };
    equal(itFrom134(newer, r134, 2026).periods[0].paid, 1);
  }),
  test('ב״ל: יתרה 0 והמקדמה חלה מינואר ⇒ «שולם עד החתך» = מקדמה × חודשים, עם ההסבר; אחרת — לא ממלאים', () => {
    const ni = niFromRead(draft().ni, niRead(0, '2026-01'), 'client', 9, 2026);
    equal(ni.paidToCutoff, 2062 * 9);
    equal(ni.chargedFrom, '2026-01');
    assert(/יתרה 0/.test(ni.paidNote ?? ''), ni.paidNote ?? '');
    equal(niPaymentGaps(ni, 9, 2026).missing.length, 0);
    equal(niFromRead(draft().ni, niRead(1200, '2026-01'), 'client', 9, 2026).paidToCutoff, undefined);
    equal(niFromRead(draft().ni, niRead(0, '2026-07'), 'client', 9, 2026).paidToCutoff, undefined);
  }),
  test('עסק חדש — בלי קריאות; בלי קריאה — כמו שהיה', () => {
    const d = { ...draft(), newBusiness: {} };
    equal(withAuthorityReads(d, { it134: r134, ni: niRead(0, '2026-01') }, 2026), d);
    equal(withAuthorityReads(draft(), undefined, 2026).it.periods.length, 0);
    equal(withAuthorityReads(draft(), { it134: r134 }, 2026).it.periods.length, 6);
  }),
];
