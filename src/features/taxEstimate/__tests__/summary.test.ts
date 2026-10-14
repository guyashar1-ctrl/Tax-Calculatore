// סיכום ללקוח — נבנה מגרסה מאושרת; בלי הערות פנימיות; «עכשיו» מול «בהמשך»; חלקי מסומן.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { computeEstimate } from '../engine';
import { buildSummary, summaryHtml } from '../summary';
import type { EstimateDraft } from '../types';

const client = { id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null } as unknown as Client;
const draft: EstimateDraft = {
  cutoffMonth: 9, preparedOn: '2026-10-11', oneOffs: [], adjustments: [], payments: [], savings: [{ person: 'client', studyFundToCutoff: 3_000 }], reconciliations: [],
  decisions: [{ ruleId: 'x', text: 'הכרעה פנימית סודית' }], note: 'הערת משרד פנימית',
  lines: [{ id: 'b1', person: 'client', source: 'business', label: 'העסק', actualToCutoff: 270_000, turnoverToCutoff: 300_000, turnoverForecast: 100_000, office: { method: 'runRate', assumption: 'עונתיות — דצמבר חלש' }, chosen: 'office' }],
  it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: [7, 8, 9].map(m => ({ period: `2026-0${m}`, state: 'reported' as const, turnover: 33_000, charged: 1_650 })) },
  ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, paidToCutoff: 27_000 },
  catchUps: [{ id: 'cu', authority: 'it', person: 'client', effectiveFrom: '2026-07', method: 'manualAmount', amount: 9_000, justification: 'דרישת פקיד השומה', approvedAt: '2026-10-11' }],
  vat: { via: 'manual', periods: [] },
};

export const TESTS: TestCase[] = [
  test('הסיכום: תוצאה, מקדמות היום מול מומלץ, השלמה עכשיו, יתרה בדוח השנתי, הנחות וחלופת קרן השתלמות', () => {
    const outputs = computeEstimate(draft, { client, taxYear: 2026 });
    const m = buildSummary({ clientName: 'דוד כהן', taxYear: 2026, version: 3, approvedAt: '2026-10-11T10:00:00Z', draft, outputs });
    equal(m.subtitle.startsWith('גרסה 3 · אושרה 11.10.2026'), true);
    assert(m.period.includes('ספטמבר') && m.period.includes('3 החודשים הבאים'), m.period);
    assert(m.advances.some(a => a.authority === 'מקדמת מס הכנסה' && a.now === '5% מהמחזור' && a.recommended.includes('%')), JSON.stringify(m.advances));
    assert(m.nowVsLater.some(x => x.includes('להשלים עכשיו') && x.includes('9,000')), JSON.stringify(m.nowVsLater));
    assert(m.nowVsLater.some(x => x.includes('דוח השנתי')), 'מה שנשאר — בדוח השנתי');
    assert(m.assumptions[0].includes('עונתיות — דצמבר חלש'), m.assumptions[0]);
    assert(m.savings.some(x => x.includes('קרן השתלמות')), JSON.stringify(m.savings));
    assert(m.disclaimer.includes('אינו חיוב'), m.disclaimer);
  }),
  test('בלי הערות פנימיות, חוסמים או כללים — ובלי «החזר מיידי»', () => {
    const outputs = computeEstimate(draft, { client, taxYear: 2026 });
    const html = summaryHtml(buildSummary({ clientName: 'דוד כהן', taxYear: 2026, version: 1, draft, outputs }));
    assert(!/הכרעה פנימית|הערת משרד|rulesetVersion|usedRules|core\./.test(html), 'דליפה של שדה פנימי');
    assert(html.startsWith('<!doctype html><html lang="he" dir="rtl">'), 'מסמך עברי RTL עצמאי');
  }),
  test('כל יתרה עם הרשות שלה: זכות במ״ה לא מסתירה חוב בב״ל', () => {
    const d: EstimateDraft = { ...draft, catchUps: [], it: { ...draft.it, ratePct: 30 }, ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 1_000, paidToCutoff: 9_000 } };
    const outputs = computeEstimate(d, { client, taxYear: 2026 });
    const m = buildSummary({ clientName: 'דוד כהן', taxYear: 2026, version: 1, draft: d, outputs });
    const labels = m.headline.map(h => h.label);
    assert(labels.filter(l => l.includes('בסוף השנה')).every(l => l.startsWith('מס הכנסה') || l.startsWith('ביטוח לאומי')), JSON.stringify(labels));
    const ni = m.headline.find(h => h.label.startsWith('ביטוח לאומי בסוף השנה'));
    assert(!!ni && ni.tone === 'due' && ni.value.includes('חוב'), JSON.stringify(ni));
    assert(!!ni!.detail?.some(x => x.includes('ששולמו')), 'פירוט: דמי ביטוח פחות ששולם');
    assert(m.nowVsLater.some(x => x.startsWith('בביטוח לאומי')), JSON.stringify(m.nowVsLater));
  }),
  test('סיכום חלקי מסומן; מה שלא חושב מופיע ב«מה חסר», לא כ-0', () => {
    const d: EstimateDraft = { ...draft, lines: [...draft.lines, { id: 's2', person: 'spouse', source: 'salary', label: 'משכורת', actualToCutoff: 90_000, office: { method: 'runRate' }, chosen: 'office' }] };
    const outputs = computeEstimate(d, { client, taxYear: 2026 });
    const m = buildSummary({ clientName: 'דוד כהן', taxYear: 2026, version: 1, draft: d, outputs });
    assert(!!m.partial && m.gaps.length > 0, JSON.stringify({ p: m.partial, g: m.gaps }));
  }),
];
