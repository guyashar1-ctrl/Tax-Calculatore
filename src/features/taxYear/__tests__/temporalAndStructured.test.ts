// ─── תחולה בזמן, רשומות מובנות והסברים גלויים (13.10.2026) ─────────────────────────
// ‼ מה נעול כאן (docs/TAX-FILE-TEMPORAL-RELEVANCE-2026-10-13.md, docs/COLLECTION-UX-USER-FEEDBACK-2026-10-13.md):
//   · נכס שנקנה אחרי השנה לא מוצג כבעלות באותה שנה, ולא נשאל עליו שכר דירה.
//   · נכס שנמכר במהלך השנה — עדיין בדוח של אותה שנה.
//   · תאריך לא ידוע ⇒ שאלה ממוקדת לכל ישות, והפריטים התלויים בה מחכים. לא מנחשים 1 בינואר.
//   · הצהרת הון — לפי יום ההצהרה, לא לפי היום.
//   · «רשום כעוסק» בלי עסק ברשימה ⇒ לא שואלים «האם אתה עצמאי?»; מבקשים להשלים את הפרטים.
//   · ילדים / בנק / מעסיק — שדות נפרדים; אפסים מובילים נשמרים; «אין ילדים» היא תשובה.
//   · לכל שאלה ללקוח — הסבר גלוי.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { ITEMS } from '../catalog';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, promptFor, answerToFacts, UNAVAILABLE_LABEL } from '../asks';
import { relevanceFor, yearPeriod, dayPeriod, propertySpan, accountSpan } from '../temporal';
import { schemaFor, validateRecord, cleanRecord, answerValid, initialFromCard } from '../records';
import { HINTS } from '../hints';
import type { InfoAsk, YearFact } from '../types';

const TODAY = '2026-10-13';
let n = 0;
const id = () => `t${++n}`;
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const fact = (p: Partial<YearFact> & Pick<YearFact, 'itemKey'>): YearFact => ({
  id: id(), clientId: 'c1', taxYear: 2025, subjectRole: 'couple', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'pending', createdAt: '2026-10-13T10:00:00Z', ...p,
});
const annual = (p: Partial<PictureInput> & { client: Client }) =>
  buildYearPicture({ taxYear: 2025, purpose: 'annual', today: TODAY, facts: [], evidence: [], asks: [], ...p });
const keysOf = (p: ReturnType<typeof annual>, ref: string) => p.statuses.filter(s => s.entityRef === ref).map(s => s.item.key);

export const TESTS: TestCase[] = [
  test('תחולה: ארבע דוגמאות הקבלה של גיא (נקנה אחרי, נמכר במהלך, לא ידוע, יום הצהרה)', () => {
    const y25 = yearPeriod(2025);
    equal(relevanceFor(y25, { date: '2026-01-01', precision: 'year' }, 'open'), 'out', 'נקנה ב-2026');
    equal(relevanceFor(y25, { date: '2019-01-01', precision: 'year' }, { date: '2025-06-15', precision: 'day' }), 'in', 'נמכר ביוני 2025');
    equal(relevanceFor(y25, undefined, 'open'), 'unknown', 'מועד פתיחה לא ידוע');
    equal(relevanceFor(dayPeriod('2025-12-31'), { date: '2026-02-01', precision: 'day' }, 'open'), 'out', 'נקנה אחרי יום ההצהרה');
    equal(relevanceFor(dayPeriod('2025-12-31'), { date: '2025-12-01', precision: 'month' }, 'open'), 'in', 'נקנה בדצמבר — לפני היום');
    // «שנה בלבד» אינו 1 בינואר: נקנה «ב-2025» — בתוך 2025, אבל ליום 30.6.2025 לא ידוע
    equal(relevanceFor(dayPeriod('2025-06-30'), { date: '2025-01-01', precision: 'year' }, 'open'), 'unknown', 'שנה בלבד מול יום באמצע השנה');
    // «בערך 2024» (2023 עד 2025) ועדיין בבעלות ⇒ בוודאות היה בבעלות במהלך 2025; «בערך 2025» (2024 עד 2026) — לא ידוע
    equal(relevanceFor(y25, { date: '2024-01-01', precision: 'approx' }, 'open'), 'in', '«בערך 2024» ועדיין בבעלות');
    equal(relevanceFor(y25, { date: '2025-01-01', precision: 'approx' }, 'open'), 'unknown', '«בערך 2025» חוצה את סוף 2025');
    // מהכרטיס: purchaseYear הוא שנה, isClosed בלי שנה — סיום לא ידוע
    equal(relevanceFor(y25, propertySpan({ purchaseYear: 2020 }).start, propertySpan({ purchaseYear: 2020 }).end), 'in');
    const closedNoYear = accountSpan({ openedDate: '2020-01-01', isClosed: true });
    equal(relevanceFor(y25, closedNoYear.start, closedNoYear.end), 'unknown', 'חשבון סגור בלי שנה');
  }),

  test('דוח 2025, נכס שנקנה ב-2026: לא ברשימה, לא שכר דירה, לא שאלת תחולה', () => {
    const c = client({ properties: [{ id: 'p26', address: 'הדקל 2', city: 'חיפה', isRented: true, purchaseYear: 2026 }] as Client['properties'] });
    const p = annual({ client: c });
    equal(keysOf(p, 'p26').length, 0, keysOf(p, 'p26').join(','));
    const list = p.statuses.find(s => s.item.key === 'rent.properties');
    assert(!list || list.state === 'notApplicable', `הנכס מ-2026 הוצג לאישור ל-2025: ${list?.state}`);
  }),

  test('דוח 2025, נכס שנמכר ביוני 2025: עדיין ברשימה ושכר דירה נשאל', () => {
    const c = client({ properties: [{ id: 'ps', address: 'הגפן 1', city: 'חיפה', isRented: true, purchaseYear: 2015, soldDate: '2025-06-15' } as never] });
    const p = annual({ client: c });
    const list = p.statuses.find(s => s.item.key === 'rent.properties')!;
    equal(list.state, 'fromCard');
    assert((list.lineRefs ?? []).includes('ps'), 'הנכס שנמכר לא ברשימה');
    const pr = promptFor(list, { client: c, taxYear: 2025, purpose: 'annual' });
    assert(pr.input.kind === 'confirm' && pr.input.lines.some(l => l.includes('הגפן 1') && l.includes('נמכר')), JSON.stringify(pr.input));
    assert(pr.title.includes('בשנת 2025'), pr.title);
    assert(keysOf(p, 'ps').includes('rent.income'), 'שכר הדירה לא נשאל');
  }),

  test('נכס בלי תאריך רכישה: שאלת תחולה ממוקדת; שכר הדירה מחכה; «נקנה אחרי» ⇒ לא חל', () => {
    const c = client({ properties: [{ id: 'px', address: 'הורד 4', city: 'חיפה', isRented: true }] as Client['properties'] });
    const p = annual({ client: c });
    const per = p.statuses.find(s => s.item.key === 'period.property' && s.entityRef === 'px');
    assert(per && per.askable, 'אין שאלת תחולה לנכס');
    assert(!keysOf(p, 'px').includes('rent.income'), 'שכר דירה נשאל לפני התחולה');
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2025, purpose: 'annual' });
    const q = plan.find(e => e.itemKey === 'period.property')!;
    assert(q.prompt.title.includes('הורד 4') && q.prompt.title.includes('בשנת 2025'), q.prompt.title);
    equal(q.prompt.input.kind, 'record');
    // התשובה «התחיל אחרי 2025» ⇒ הנכס לא חל לשנה
    const after = annual({ client: c, facts: [fact({ itemKey: 'period.property', entityKind: 'property', entityRef: 'px', value: { inPeriod: 'after' } })] });
    assert(!keysOf(after, 'px').includes('rent.income'), 'שכר דירה נשאל לנכס שנקנה אחרי');
    // «כל השנה» ⇒ שכר הדירה נשאל
    const all = annual({ client: c, facts: [fact({ itemKey: 'period.property', entityKind: 'property', entityRef: 'px', value: { inPeriod: 'all' } })] });
    assert(keysOf(all, 'px').includes('rent.income'), 'שכר דירה לא נשאל אחרי «כל השנה»');
  }),

  test('חשבון השקעות בלי מועד פתיחה: «האם היה קיים בשנת 2025?» — לא מניחים כן ולא לא; 867 מחכה', () => {
    const c = client({ investmentAccounts: [{ id: 'ax', institutionName: 'אלטשולר' }] as Client['investmentAccounts'] });
    const p = annual({ client: c });
    assert(p.statuses.some(s => s.item.key === 'period.account' && s.entityRef === 'ax' && s.askable), 'אין שאלת תחולה לחשבון');
    assert(!keysOf(p, 'ax').includes('capital.form867'), '867 התבקש לפני התחולה');
  }),

  test('הצהרת הון ל-31.12.2025 שממולאת ב-2026: נכס שנקנה בפברואר 2026 — לא נכס ליום ההצהרה', () => {
    const c = client({ properties: [
      { id: 'old', address: 'הזית 1', city: 'חיפה', purchaseYear: 2010 },
      { id: 'new', address: 'הזית 9', city: 'חיפה', purchaseDate: '2026-02-01', purchasePrecision: 'day' } as never,
    ] as Client['properties'] });
    const p = buildYearPicture({ client: c, taxYear: 2025, purpose: 'wealth', asOfDate: '2025-12-31', declKind: 'first', today: TODAY, facts: [], evidence: [], asks: [] });
    const list = p.statuses.find(s => s.item.key === 'wealth.realEstate.list')!;
    deepIncludes(list.lineRefs ?? [], ['old'], ['new']);
    assert(!p.statuses.some(s => s.item.key === 'wealth.period.property' && s.entityRef === 'new'), 'נשאלה תחולה לנכס שידוע שנקנה אחרי');
  }),

  test('«רשום כעוסק» בלי עסק ברשימה: לא שואלים «האם עצמאי?» — מבקשים את פרטי העסק, עם מה שידוע', () => {
    const c = client({ vatStatus: 'authorizedDealer', businesses: [] } as Partial<Client>);
    const p = buildYearPicture({ client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY, today: TODAY, facts: [], evidence: [], asks: [] });
    assert(!p.toAsk.some(s => s.item.key === 'intake.selfEmployed'), 'נשאל «האם עצמאי?» למרות שהתיק יודע');
    const det = p.toAsk.find(s => s.item.key === 'intake.businessDetails');
    assert(det, 'פרטי העסק לא נשאלו');
    const pr = promptFor(det!, { client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY });
    assert(pr.title.startsWith('רשום/ה אצלנו כעוסק מורשה'), pr.title);
    // 16.10.2026 · «של מי / איפה»: שם העסק (חופשי) ואיך רשום (בחירה) — עם מה שידוע מהתיק
    assert(pr.input.kind === 'entity' && pr.input.initial?.[0]?.dealer === 'murshe' && pr.input.spec.fields.some(f => f.key === 'dealer'), JSON.stringify(pr.input));
  }),

  test('חשבון בנק: שדות נפרדים, אפסים מובילים, סניף שייך לבנק, חשבון בחו״ל בלי לכפות בנק ישראלי', () => {
    const s = schemaFor('bank', client());
    const dir = { banks: [{ code: '12', name: 'בנק הפועלים בע"מ' }], branches: [['12', '044', 'רמת אביב', 'תל אביב', 0, '', '']] as [string, string, string, string, number, string, string][] };
    const r = cleanRecord(s, { foreign: 'no', bankCode: '12', branchCode: '44', accountNumber: '0012345', owners: 'client' }, dir);
    equal(r.branchCode, '044', 'אפס מוביל בסניף');
    equal(r.accountNumber, '0012345', 'אפס מוביל בחשבון');
    equal(r.branchName, 'רמת אביב');
    equal(r.branchInList, true);
    // סניף שאינו ברשימה — נשמר כפי שהוזן, עם סימון; לא נדחה ולא «מתוקן»
    const r2 = cleanRecord(s, { foreign: 'no', bankCode: '12', branchCode: '999', accountNumber: '1', owners: 'client' }, dir);
    equal(r2.branchInList, false);
    equal(r2.branchCode, '999');
    // חשבון בחו״ל: אין בנק/סניף ישראלי
    const errs = validateRecord(s, { foreign: 'yes', country: 'גרמניה', bankName: 'N26', iban: 'DE89370400440532013000', owners: 'client' });
    equal(Object.keys(errs).length, 0, JSON.stringify(errs));
    equal(validateRecord(s, { foreign: 'no', bankCode: '12', branchCode: '44', accountNumber: '12-34', owners: 'client' }).accountNumber, 'רק ספרות');
  }),

  test('ילדים: שם ותאריך לידה לכל ילד, «אין ילדים» תשובה, וילדים מהתיק מוצגים לעריכה', () => {
    const s = schemaFor('children', client());
    assert(answerValid(s, { items: [], none: true }), '«אין ילדים» לא התקבל');
    assert(!answerValid(s, { items: [{ firstName: 'דנה' }] }), 'ילד בלי תאריך לידה התקבל');
    assert(answerValid(s, { items: [{ firstName: 'דנה', birthDate: '2014-03-01' }, { firstName: 'יואב', birthDate: '2018-09-12' }] }), 'שני ילדים תקינים נדחו');
    const c = client({ children: [{ id: 'k1', firstName: 'דנה', birthYear: 2014, birthDate: '2014-03-01', hasDisability: false }] as Client['children'] });
    const init = initialFromCard('children', c, 'couple');
    equal(init.length, 1); equal(init[0].firstName, 'דנה'); equal(init[0].birthDate, '2014-03-01');
    // «אין ילדים» ⇒ עובדה 'no' (לא «חסר»); רשימה ⇒ עובדה עם הרשומות
    const ask: InfoAsk = { id: 'a1', clientId: 'c1', taxYear: 2026, stepId: 's', parentStepId: 'p', itemKey: 'intake.children', subjectRole: 'couple', prompt: { title: 't', why: '', input: { kind: 'record', schema: 'children' } }, state: 'published', createdAt: TODAY };
    equal(answerToFacts(ask, { kind: 'record', value: null, none: true }, { client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY }, TODAY).facts[0].answer, 'no');
    const f = answerToFacts(ask, { kind: 'record', value: { items: [{ firstName: 'דנה', birthDate: '2014-03-01' }] }, assertion: 'changed', was: ['דנה — נולד/ה ב-2014'] }, { client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY }, TODAY).facts[0];
    equal(f.clientAssertion, 'changed');
  }),

  test('«משהו השתנה» ברשימה שיש לה רשומה — נפתח בשדות עם מה שבתיק, לא בכתיבה חופשית', () => {
    const c = client({ employers: [{ id: 'e1', name: 'אינטל', startDate: '2019-05-01' }] as Client['employers'] });
    const p = buildYearPicture({ client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY, today: TODAY, facts: [], evidence: [], asks: [] });
    const conf = p.toConfirm.find(s => s.item.key === 'intake.employers')!;
    const pr = promptFor(conf, { client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY });
    assert(pr.input.kind === 'confirm' && pr.input.edit?.schema === 'employer' && pr.input.edit.initial?.[0]?.name === 'אינטל', JSON.stringify(pr.input));
  }),

  test('הסבר גלוי לכל שאלה ללקוח — בכל שלושת השאלונים', () => {
    const missing = ITEMS.filter(i => i.who === 'client' && !HINTS[i.key]).map(i => i.key);
    equal(missing.length, 0, `בלי הסבר: ${missing.join(', ')}`);
    // ההסברים שגיא ביקש במפורש
    assert(HINTS['savings.selfDeposits'].includes('דרך העבודה') && HINTS['savings.selfDeposits'].includes('בעצמכם'), 'פנסיה: עבודה מול עצמאי');
    assert(HINTS['intake.insurance'].includes('משכנתה') && HINTS['intake.insurance'].includes('ביטוח מבנה') && !/כל בעל דירה/.test(HINTS['intake.insurance']), 'ביטוח חיים');
    assert(HINTS['intake.hasInvestments'].includes('קרן כספית'), 'השקעות: קרן כספית');
    assert(HINTS['intake.rents'].includes('מקבלים') && HINTS['rent.ownRent'].includes('משלמים'), 'מקבלים מול משלמים');
  }),

  test('«אין לי עדיין» הישן נשאר בלי קוד ובלי משמעות חדשה; הקודים החדשים — שלוש משמעויות שונות', () => {
    equal(UNAVAILABLE_LABEL.legacy, 'אין לי עדיין');
    const labels = new Set([UNAVAILABLE_LABEL.later, UNAVAILABLE_LABEL.notYet, UNAVAILABLE_LABEL.needHelp]);
    equal(labels.size, 3);
  }),
];

function deepIncludes(list: string[], yes: string[], no: string[]) {
  for (const y of yes) assert(list.includes(y), `חסר ברשימה: ${y} (${list.join(',')})`);
  for (const x of no) assert(!list.includes(x), `לא אמור להיות ברשימה: ${x}`);
}
