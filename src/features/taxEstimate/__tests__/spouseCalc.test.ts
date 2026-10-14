// בני זוג — נפרד מול מאוחד במספרים (13.10.2026). אורקלים ד-1 עד ד-5: חושבו עצמאית במחקר
// (docs/tax-foundation/research/spouses-joint-separate-numeric-2026-10-13.md, סעיף ג), לא מהמנוע — 2026, שכר בלבד.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { computeEstimate } from '../engine';
import { buildSummary } from '../summary';
import type { EstimateDraft } from '../types';

const kid = (y: number) => ({ id: `k${y}`, birthDate: `${y}-03-01`, birthYear: y, hasDisability: false });
function couple(o: { clientGender: 'male' | 'female'; owner?: 'client' | 'spouse'; children?: number[] }): Client {
  return {
    id: 'c1', firstName: 'דנה', lastName: 'לוי', gender: o.clientGender, familyStatus: 'married', birthDate: '1980-05-01',
    children: (o.children ?? []).map(kid), employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {},
    spouse: { firstName: 'אבי', lastName: 'לוי', idNumber: '', birthDate: '1981-02-01', gender: o.clientGender === 'male' ? 'female' : 'male', phone: '' },
    taxFiles: o.owner ? [{ id: 't1', authority: 'income_tax', owner: o.owner, repStatus: 'none' }] : [],
    // ‼ 14.10.2026: הרשום נלקח רק כשאושר מול שע״ם
    registeredSpouseVerified: !!o.owner,
  } as unknown as Client;
}
function draft(client: number, spouse: number, spouseSource: EstimateDraft['spouseSource'] = 'none'): EstimateDraft {
  return {
    cutoffMonth: 12, preparedOn: '2026-12-31', oneOffs: [], adjustments: [], payments: [], savings: [], reconciliations: [], decisions: [], spouseSource,
    lines: [
      { id: 'a', person: 'client', source: 'salary', label: 'משכורת', actualToCutoff: client },
      { id: 'b', person: 'spouse', source: 'salary', label: 'משכורת', actualToCutoff: spouse },
    ],
    it: { via: 'manual', method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual' }, vat: { via: 'manual', periods: [] },
  } as EstimateDraft;
}
const run = (c: Client, d: EstimateDraft) => computeEstimate(d, { client: c, taxYear: 2026 });

export const TESTS: TestCase[] = [
  test('ד-1: שני שכירים בלי ילדים — נפרד 62,184 מול מאוחד 98,148; חל נפרד, וזה מס משק הבית', () => {
    const o = run(couple({ clientGender: 'male', owner: 'client' }), draft(300_000, 150_000));
    equal(o.spouseCalc?.separate, 62_184); equal(o.spouseCalc?.jointLow, 98_148); equal(o.spouseCalc?.applies, 'separate');
    equal(o.household.annualLiability, 62_184);
    const c = o.checks!.find(x => x.id === 'spouse-calc')!;
    equal(c.status, 'compared'); assert(c.detail.includes('62,184') && c.detail.includes('98,148') && c.detail.includes('לא חיסכון של המשרד'), c.detail);
  }),
  test('ד-2: הכנסות נמוכות — המאוחד (0) זול מהנפרד (1,249): חל מאוחד, ולא «נפרד תמיד עדיף»', () => {
    const o = run(couple({ clientGender: 'female', owner: 'client' }), draft(90_000, 26_000));
    equal(o.spouseCalc?.separate, 1_249); equal(o.spouseCalc?.jointLow, 0); equal(o.spouseCalc?.applies, 'joint');
    equal(o.household.annualLiability, 0);
  }),
  test('ד-4: הכנסה גבוהה — מס יסף לכל אחד בנפרד (391,128) מול סף אחד במאוחד (501,768)', () => {
    const o = run(couple({ clientGender: 'male', owner: 'client' }), draft(900_000, 400_000));
    equal(o.spouseCalc?.separate, 391_128); equal(o.spouseCalc?.jointLow, 501_768); equal(o.household.annualLiability, 391_128);
  }),
  // 14.10.2026 (research/joint-child-points): במאוחד אין נקודות ילדים — הטווח נסגר על 97,422 (2 נקודות «בן זוג עובד» בגלל הילדים)
  test('ד-5: ילדים — המאוחד 97,422 (בלי נקודות ילדים); החל: נפרד 44,970', () => {
    const o = run(couple({ clientGender: 'male', owner: 'client', children: [2019, 2016] }), draft(300_000, 150_000));
    equal(o.spouseCalc?.jointLow, 97_422); equal(o.spouseCalc?.jointHigh, 97_422);
    equal(o.spouseCalc?.separate, 44_970); equal(o.spouseCalc?.applies, 'separate'); equal(o.household.annualLiability, 44_970);
    assert(!o.blockers.some(b => b.code === 'spouse_calc_open'), 'הכרעה יציבה — לא חוסם');
  }),
  test('מקור משותף בלי תנאי 66(ד): רק מאוחד — מס משק הבית 98,148, לא סכום הנפרד', () => {
    const o = run(couple({ clientGender: 'male', owner: 'client' }), draft(300_000, 150_000, 'dependentNotMet'));
    equal(o.spouseCalc?.separate, null); equal(o.household.annualLiability, 98_148);
    equal(o.checks!.find(x => x.id === 'spouse-calc')!.status, 'compared');
  }),
  test('מאוחד חובה + ילדים: 97,422 (אין נקודות ילדים במאוחד — 66(ג), המדריך, הו״ב 3/2015), עם הערה על הטענה ההפוכה', () => {
    const c = couple({ clientGender: 'male', owner: 'client', children: [2019, 2016] });
    const o = run(c, draft(300_000, 150_000, 'dependentNotMet'));
    equal(o.household.annualLiability, 97_422); assert(!o.blockers.some(b => b.code === 'spouse_calc_open'), 'הוכרע במחקר');
    assert(o.limits.some(x => x.includes('לא ניתנות נקודות ילדים')), JSON.stringify(o.limits));
  }),
  test('רשום שלא אושר מול שע״ם, והתוצאה תלויה בו (ד-2: מאוחד 0 מול נפרד 1,249): «לא הוכרע» — בלי ניחוש ובלי «הכרעת משרד»', () => {
    const o = run(couple({ clientGender: 'female' }), draft(90_000, 26_000));
    assert(o.blockers.some(b => b.code === 'spouse_calc_open' && b.text.includes('הפרטים הוזנו בשע״ם')), JSON.stringify(o.blockers.map(b => b.text)));
    equal(o.household.incomplete, true);
  }),
  test('לא ידוע מי הרשום: שתי האפשרויות בטווח; ההכרעה לנפרד יציבה ולכן מוצגת', () => {
    const o = run(couple({ clientGender: 'male' }), draft(300_000, 150_000));
    equal(o.spouseCalc?.jointLow, 96_696); equal(o.spouseCalc?.jointHigh, 98_148); equal(o.spouseCalc?.applies, 'separate');
  }),
  test('בלי סימון 66(ד): «ההשוואה טרם בוצעה», «חסר» במס משק הבית — לא «אין חיסכון»', () => {
    const o = run(couple({ clientGender: 'male', owner: 'client' }), { ...draft(300_000, 150_000), spouseSource: undefined });
    const c = o.checks!.find(x => x.id === 'spouse-calc')!;
    equal(c.status, 'notCompared'); equal(o.household.incomplete, true);
    assert(!o.checks!.some(x => x.status === 'noSaving' && x.id === 'spouse-calc'), 'אין «נבדק — אין חיסכון»');
  }),
  test('הסיכום ללקוח: מס משק הבית לפי החישוב שחל, והבדיקה «חושב בשתי הדרכים»', () => {
    const c = couple({ clientGender: 'female', owner: 'client' }), d = draft(90_000, 26_000);
    const o = run(c, d);
    const m = buildSummary({ clientName: 'דנה לוי', spouseName: 'אבי', taxYear: 2026, version: 1, draft: d, outputs: o });
    equal(m.headline[0].value, '0 ₪');
    assert(m.headline[0].detail!.some(x => x.includes('מאוחד')), JSON.stringify(m.headline[0].detail));
    assert(m.checks.some(x => x.result.includes('חושב בשתי הדרכים')), JSON.stringify(m.checks));
  }),
];
