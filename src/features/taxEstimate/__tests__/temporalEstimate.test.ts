// תחולה בזמן בהערכת המס (13.10.2026) — החוזה המשותף taxYear/temporal.ts, דוגמאות הקבלה מ-TAX-FILE-TEMPORAL-RELEVANCE
// בהתאמה לתקופת אמת (1.1–החתך) ותקופת תחזית. ‼ תאריך פעילות מהתיק, לא מועד יצירת רשומה או בדיקה; «0 עד החתך» רק
// כשהתאריכים מבססים שלא הייתה פעילות; סגירה אינה בהכרח היעדר תקבולים מאוחרים.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { YearFact } from '../../taxYear/types';
import { buildDraft, cardAdvances, linePeriod } from '../prefill';
import { computeEstimate } from '../engine';
import { parse134, parseEsna } from '../importers';
import { cardSnapshot, changesSinceApproval } from '../../taxFile/hub';
import type { EstimateDraft } from '../types';

const base = { id: 'c1', firstName: 'נוי', lastName: 'בר', gender: 'female', familyStatus: 'single', birthDate: '1985-01-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {} };
const cl = (o: Partial<Client>) => ({ ...base, ...o }) as unknown as Client;
const draftOf = (c: Client, m = 9, facts: YearFact[] = []) => buildDraft({ client: c, taxYear: 2026, cutoffMonth: m, facts, evidence: [], today: '2026-10-13' });

export const TESTS: TestCase[] = [
  test('linePeriod: התחלה לא ידועה ופעיל היום — אמת «לא ידוע», תחזית «בתוקף» (הנחת התחזית); מועד בדיקה אינו תחולה', () => {
    const p = linePeriod({ start: undefined, end: 'open' }, 2026, 9, null);
    equal(p.actual, 'unknown'); equal(p.forecast, 'in');
  }),
  test('מעסיק שהתחיל 1.11.2026 (חתך ספטמבר): 0 ידוע עד החתך, עם הסבר — לא «חסר»; תחזית בתוקף', () => {
    const { draft } = draftOf(cl({ employers: [{ id: 'e1', name: 'חברה', startDate: '2026-11-01' }] as never }));
    const l = draft.lines.find(x => x.id === 'sal-e1')!;
    equal(l.actualToCutoff, 0); assert(!!l.actualSource?.note?.includes('לא פעיל עד סוף החתך'), JSON.stringify(l.actualSource));
    equal(l.period?.actual, 'out'); equal(l.period?.forecast, 'in');
  }),
  test('מעסיק שהתחיל בשנה לא ידועה: אין 0 — נשאר «חסר», עם «לא ידוע אם היה פעיל»', () => {
    const { draft } = draftOf(cl({ employers: [{ id: 'e1', name: 'חברה' }] as never }));
    const l = draft.lines.find(x => x.id === 'sal-e1')!;
    equal(l.actualToCutoff, undefined); equal(l.period?.actual, 'unknown');
    const o = computeEstimate(draft, { client: cl({ employers: [{ id: 'e1', name: 'חברה' }] as never }), taxYear: 2026 });
    assert(o.blockers.some(b => b.code === 'missing_actual' && b.text.includes('לא ידוע מהתיק אם היה פעיל')), JSON.stringify(o.blockers.map(b => b.text)));
  }),
  test('מעסיק שעזב 31.5.2026: נשאר בתקופת האמת; קצב אוטומטי לתחזית — חוסם; סכום שהמשרד הזין (תקבולים מאוחרים) — מותר עם מגבלה', () => {
    const c = cl({ employers: [{ id: 'e1', name: 'חברה', endDate: '2026-05-31' }] as never });
    const { draft } = draftOf(c);
    const l = draft.lines.find(x => x.id === 'sal-e1')!;
    equal(l.period?.forecast, 'out');
    const run = (side: EstimateDraft['lines'][0]['office']) => computeEstimate({ ...draft, lines: [{ ...l, actualToCutoff: 50_000, office: side, chosen: 'office' }] }, { client: c, taxYear: 2026 });
    assert(run({ method: 'runRate' }).blockers.some(b => b.code === 'forecast_after_end'), 'קצב — חוסם');
    const o2 = run({ method: 'manual', amount: 4_000, assumption: 'פדיון חופשה' });
    assert(!o2.blockers.some(b => b.code === 'forecast_after_end') && o2.limits.some(x => x.includes('תקבולים מאוחרים')), 'סכום מכוון — מגבלה, לא חוסם');
  }),
  test('עסק שנסגר ב-2025: לא נכנס להערכת 2026, והרמז מזכיר תקבולים מאוחרים', () => {
    const { draft, hints } = draftOf(cl({ businesses: [{ id: 'b1', name: 'הסטודיו', isClosed: true, closedYear: 2025 }] as never }));
    equal(draft.lines.some(x => x.id === 'biz-b1'), false);
    assert(hints.some(h => h.text.includes('הסטודיו') && h.text.includes('תקבולים מאוחרים')), JSON.stringify(hints));
  }),
  test('עסק שנסגר ב-2026 (שנה בלבד): נשאר בהערכה — «נסגר» של היום אינו מוציא את השנה; סיום התחזית «לא ידוע»', () => {
    const { draft } = draftOf(cl({ businesses: [{ id: 'b1', name: 'הסטודיו', isClosed: true, closedYear: 2026 }] as never }));
    const l = draft.lines.find(x => x.id === 'biz-b1')!;
    assert(!!l, 'השורה קיימת'); equal(l.period?.forecast, 'unknown');
  }),
  test('דירה שנרכשה 11/2026 ומושכרת (חתך ספטמבר): שכר דירה עד החתך 0 ידוע; דירה שנרכשה בשנה לא ידועה — «חסר»', () => {
    const { draft } = draftOf(cl({ properties: [{ id: 'p1', address: 'הגפן 3', isRented: true, purchaseDate: '2026-11', purchasePrecision: 'month' }] as never }));
    const r = draft.lines.find(x => x.id === 'rent')!;
    equal(r.actualToCutoff, 0); equal(r.period?.actual, 'out');
    const d2 = draftOf(cl({ properties: [{ id: 'p1', address: 'הגפן 3', isRented: true }] as never })).draft;
    equal(d2.lines.find(x => x.id === 'rent')!.actualToCutoff, undefined);
  }),
  test('חשבון השקעות שנסגר ב-2026: נשאר (קודם סוננו כל הסגורים); תשובה מפורשת «לא היה בשנה» — יוצא', () => {
    const acct = [{ id: 'a1', institutionName: 'בית ההשקעות', isClosed: true, closedYear: 2026 }];
    equal(draftOf(cl({ investmentAccounts: acct as never })).draft.lines.some(x => x.id === 'capital'), true);
    const no = { id: 'f1', clientId: 'c1', taxYear: 2026, itemKey: 'period.account', entityRef: 'a1', status: 'accepted', answer: 'no', createdAt: '2026-10-01' } as unknown as YearFact;
    equal(draftOf(cl({ investmentAccounts: acct as never }), 9, [no]).draft.lines.some(x => x.id === 'capital'), false);
  }),
  test('דוגמת קבלה 6: שינוי תאריך בתיק אחרי אישור — «לבדיקה» בלי לשכתב את הגרסה המאושרת; צילום ישן בלי תאריכים לא מתריע לשווא', () => {
    const before = cl({ employers: [{ id: 'e1', name: 'חברה', startDate: '2024-01-01' }] as never });
    const snap = cardSnapshot(before);
    const after = cl({ employers: [{ id: 'e1', name: 'חברה', startDate: '2024-01-01', endDate: '2026-06-30' }] as never });
    const imp = changesSinceApproval({ inputFacts: snap, approvedAt: '2026-10-01T00:00:00Z', client: after, facts: [], taxYear: 2026 });
    assert(imp.some(i => i.text.includes('השתנו תאריכי הפעילות') && i.text.includes('חברה')), JSON.stringify(imp));
    // צילום שנשמר לפני שהתאריכים נכנסו (בלי start/end) — אין «השתנה» רק בגלל השדות החדשים
    const legacy = snap.map(x => x.id === 'card:employers' ? { ...x, value: (x.value as { id: string; label: string; spouse: boolean }[]).map(({ id, label, spouse }) => ({ id, label, spouse })) } : x);
    equal(changesSinceApproval({ inputFacts: legacy, approvedAt: '2026-10-01T00:00:00Z', client: after, facts: [], taxYear: 2026 }).length, 0);
  }),
  test('134: «עודכן ב» אינו מועד הבדיקה; «לא דווח» אינו «דווח»', () => {
    const r = parse134([['תקופה', 'מצב דיווח', 'מחזור', 'חיוב', 'תשלומים'], ['01/2026', 'דווח', '10,000', '1,000', '1,000'], ['02/2026', 'לא דווח', '', '', ''], ['עודכן ב-05/10/2026']]);
    equal(r.readOn, undefined); equal(r.decisionUpdatedOn, '2026-10-05');
    equal(r.periods.find(p => p.period === '2026-01')?.state, 'reported'); equal(r.periods.find(p => p.period === '2026-02')?.state, 'unknown');
  }),
  test('ESNA: המחזור = חייבות + פטורות מסומן כהנחה של הקליטה', () => {
    const r = parseEsna([['תקופה', 'עסקאות חייבות', 'עסקאות פטורות'], ['01/2026', '10,000', '500']]);
    equal(r.periods[0].turnover, 10_500); assert(r.warnings.some(w => w.includes('הנחה של הקליטה')), JSON.stringify(r.warnings));
  }),
  test('כרטיס: 0% בלי תדירות («לא נדרש» / «בוטלה») ⇒ «אין מקדמות», לא «0% מהמחזור, חודשי»', () => {
    const a = cardAdvances(cl({ pitAdvancePercent: 0 } as never));
    equal(a.it?.method, 'none');
    const b = cardAdvances(cl({ pitAdvancePercent: 12, pitAdvanceFrequency: 'bi_monthly' } as never));
    equal(b.it?.method, 'turnoverRate'); equal(b.it?.frequency, 2);
  }),
];
