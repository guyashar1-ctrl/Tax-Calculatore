// ─── «בקשה אחת לתיק המס» שלב 2 (16.10.2026): השאלון מהתיק, רשימות סגורות, בלי מסמכים ─────────────
// ‼ מה נעול כאן:
//   · לקוח חדש (כרטיס ריק): מסך רשת אחד עם כל שאלות הפתיחה + השאלות שהכרטיס לא יכול לענות; אף מסמך, אף טקסט חופשי.
//   · לקוח עם תיק מלא: מסך «נכון?» אחד (כל אישורי הכרטיס), ומסך רשת רק למה שהתיק לא יודע; אף «של מי / איפה» לפני סימון.
//   · מסך הרשת: לזוג — העובדה נשמרת למשק הבית; מה שסומן פותח «של מי / איפה» (צילום בתוך האריח) עם המזהה הזמני.
//   · «של מי / איפה»: ערך מחוץ לרשימה נדחה; «אחר» מתקבל; שם המעסיק הוא השדה החופשי היחיד.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture } from '../picture';
import { buildAskPlan, answerToFacts, GRID_KEY, type AskPlanEntry } from '../asks';
import { buildScreens, firstOpenScreen } from '../screens';
import { ITEMS } from '../catalog';
import type { InfoAsk } from '../types';
import { validateEntity, entityLines } from '../entities';
import { INSTITUTION_LISTS } from '../../../data/institutions';

const TODAY = '2026-10-16';
let n = 0;
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'דניאל', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const married = (p: Partial<Client> = {}) => client({ familyStatus: 'married', spouseFirstName: 'מיכל', spouse: { firstName: 'מיכל' } as Client['spouse'], ...p });
const ctx = (c: Client) => ({ client: c, taxYear: 2026, purpose: 'intake' as const, asOfDate: TODAY });
const plan = (c: Client) => {
  const p = buildYearPicture({ client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY, today: TODAY, facts: [], evidence: [], asks: [] });
  return buildAskPlan([...p.toConfirm, ...p.toAsk], ctx(c));
};
/** שאלות כפי שהשרת היה מפרסם אותן מהתוכנית. */
const asksOf = (entries: AskPlanEntry[]): InfoAsk[] => entries.map(e => ({
  id: `a${++n}`, clientId: 'c1', taxYear: 2026, stepId: 'info', parentStepId: 'intake', itemKey: e.itemKey, subjectRole: e.subjectRole,
  entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt, state: 'published', createdAt: TODAY,
}));
const kinds = (entries: AskPlanEntry[]) => entries.map(e => e.prompt.input.kind);

export const TESTS: TestCase[] = [
  test('לקוח חדש, כרטיס ריק: מסך רשת אחד עם 11 אריחים + 4 שאלות שהכרטיס לא יודע; אף מסמך, אף טקסט חופשי', () => {
    const entries = plan(client());
    const grid = entries.filter(e => e.prompt.input.kind === 'multi');
    equal(grid.length, 1);
    equal(grid[0].itemKey, GRID_KEY);
    const opts = grid[0].prompt.input.kind === 'multi' ? grid[0].prompt.input.options : [];
    equal(opts.length, 11);
    assert(opts.every(o => o.role === (['intake.rents', 'intake.hasInvestments', 'intake.crypto'].includes(o.key) ? 'couple' : 'client')), 'ליחיד — העובדה לאדם (ולמשק הבית — לשאלות של משק הבית)');
    assert(!kinds(entries).includes('file') && !kinds(entries).includes('text'), `מסמך או טקסט חופשי: ${kinds(entries).join(',')}`);
    const screens = buildScreens(asksOf(entries), new Set());
    equal(screens.length, 5, screens.map(s => (s.kind === 'ask' ? s.ask.itemKey : 'confirmAll')).join(','));
    equal(screens[0].kind, 'ask');
    assert(screens.some(s => s.kind === 'ask' && s.ask.prompt.input.kind === 'multi'), 'אין מסך רשת');
  }),
  test('לקוח עם תיק מלא: מסך «נכון?» אחד לכל אישורי הכרטיס, מסך רשת רק למה שהתיק לא יודע, ואף «של מי / איפה» לפני סימון', () => {
    const c = client({
      children: [{ id: 'k1', firstName: 'נועם', birthYear: 2018 }], city: 'רעננה', address: 'הרצל 12',
      employers: [{ id: 'e1', name: 'קופת חולים מאוחדת' }], businesses: [{ id: 'b1', name: 'סטודיו לוי' }],
      properties: [{ id: 'p1', address: 'אחד העם 3', city: 'תל אביב', isRented: true }], investmentAccounts: [{ id: 'a1', institutionName: 'IBI' }],
      pensionFunds: [{ id: 'f1', institutionName: 'הראל', hasSelfDeposits: true }], foreignAccounts: [{ id: 'fr1', institutionName: 'IBKR', country: 'ארה״ב' }],
      bankAccounts: [{ id: 'bk1', bankName: 'בנק הפועלים', accountNumber: '154822' }], hasCrypto: true, hasLifeInsurance: true, hasAcademicDegree: true, academicDegreeYear: 2010,
    } as Partial<Client>);
    const entries = plan(c);
    const confirms = entries.filter(e => e.prompt.input.kind === 'confirm');
    assert(confirms.length >= 8, `אישורי כרטיס: ${confirms.length}`);
    const grid = entries.filter(e => e.prompt.input.kind === 'multi');
    equal(grid.length, 1);
    const opts = grid[0].prompt.input.kind === 'multi' ? grid[0].prompt.input.options : [];
    assert(opts.length <= 4 && opts.every(o => ['intake.credits', 'intake.special', 'intake.allowances', 'intake.selfDeposits'].includes(o.key)), `אריחים מיותרים: ${opts.map(o => o.key).join(',')}`);
        // הנהלת החשבונות של העסק שבתיק נשאלת תמיד (ברשימות); שאר «של מי / איפה» — רק אחרי סימון
    assert(entries.filter(e => e.prompt.input.kind === 'entity').every(e => e.itemKey === 'intake.bookkeeping'), '«של מי / איפה» לפני שסומן');
    const screens = buildScreens(asksOf(entries), new Set());
    equal(screens[0].kind, 'confirmAll');
    equal(screens.length, 3, screens.map(s => (s.kind === 'ask' ? s.ask.itemKey : 'confirmAll')).join(','));
    equal(firstOpenScreen(screens), 0);
    // «יש שינוי» בשורה אחת ⇒ המסך שלה נפתח מיד אחרי מסך האישור
    const asks = asksOf(entries);
    const changed = asks.find(a => a.itemKey === 'intake.children')!;
    const sc2 = buildScreens(asks, new Set([changed.id]));
    equal(sc2.length, 4);
    assert(sc2[1].kind === 'ask' && sc2[1].ask.id === changed.id, 'השורה שסומנה לא נפתחה אחרי האישור');
  }),
  test('מסך הרשת לזוג: מה שסומן ⇒ «כן» למשק הבית ו«של מי / איפה» נפתח עם המזהה הזמני; מה שלא ⇒ «לא»; «מי מכם?» כשאין פריט המשך', () => {
    const c = married();
    const grid = plan(c).find(e => e.prompt.input.kind === 'multi')!;
    const opts = grid.prompt.input.kind === 'multi' ? grid.prompt.input.options : [];
    const inv = opts.find(o => o.key === 'intake.hasInvestments')!;
    assert(inv.followUp?.itemKey === 'intake.accountDetails' && inv.followUp.entityRef === 'inv-new-couple-intake' && inv.followUp.prompt.input.kind === 'entity', JSON.stringify(inv.followUp));
    const emp = opts.find(o => o.key === 'intake.employed')!;
    assert(emp.followUp?.itemKey === 'intake.employerDetails' && emp.followUp.entityRef === 'emp-new-couple-intake' && emp.followUp.prompt.input.kind === 'entity'
      && emp.followUp.prompt.input.spec.fields.some(f => f.type === 'who') && emp.followUp.prompt.input.spec.fields.filter(f => f.type === 'name').length === 1, JSON.stringify(emp.followUp));
    const cred = opts.find(o => o.key === 'intake.credits')!;
    assert(cred.followUp?.itemKey === 'intake.credits' && cred.followUp.subjectRole === 'couple' && cred.followUp.prompt.input.kind === 'who', JSON.stringify(cred.followUp));
    const [ask] = asksOf([grid]);
    const r = answerToFacts(ask, { kind: 'multi', selected: ['intake.hasInvestments', 'intake.crypto'] }, ctx(c), TODAY);
    equal(r.facts.length, opts.length);
    equal(r.facts.filter(f => f.answer === 'value').map(f => `${f.itemKey}:${f.subjectRole}`).sort().join(','), 'intake.crypto:couple,intake.hasInvestments:couple');
    assert(r.facts.filter(f => f.answer === 'no').length === opts.length - 2, '«לא» לכל אריח שלא סומן');
    equal((r.followUps ?? []).map(f => f.itemKey).sort().join(','), 'intake.accountDetails,intake.cryptoDetails');
    // אריח לא מוכר — נדחה
    let threw = false; try { answerToFacts(ask, { kind: 'multi', selected: ['intake.nope'] }, ctx(c), TODAY); } catch { threw = true; }
    assert(threw, 'אריח לא מוכר התקבל');
  }),
  test('אחרי מסך הרשת: הישות הזמנית של משק הבית נשארת בתמונה (לא נשאלת שוב), והאדם מכוסה בעובדת משק הבית', () => {
    const c = married();
    const grid = plan(c).find(e => e.prompt.input.kind === 'multi')!;
    const [ask] = asksOf([grid]);
    const r = answerToFacts(ask, { kind: 'multi', selected: ['intake.employed'] }, ctx(c), TODAY);
    const facts = r.facts.map((f, k) => ({ ...f, id: `f${k}`, createdAt: TODAY }));
    const fu = r.followUps![0];
    const fuAsk: InfoAsk = { id: 'fu1', clientId: 'c1', taxYear: 2026, stepId: 'info', parentStepId: 'intake', itemKey: fu.itemKey, subjectRole: fu.subjectRole, entityKind: fu.entityKind, entityRef: fu.entityRef, prompt: fu.prompt, state: 'published', createdAt: TODAY };
    const p = buildYearPicture({ client: c, taxYear: 2026, purpose: 'intake', asOfDate: TODAY, today: TODAY, facts, evidence: [], asks: [{ ...ask, state: 'answered' }, fuAsk] });
    const det = p.statuses.filter(s => s.item.key === 'intake.employerDetails');
    equal(det.map(s => `${s.entityRef}:${s.state}`).join(','), 'emp-new-couple-intake:asked');
    assert(!p.toAsk.some(s => s.item.key === 'intake.employed'), 'שאלת הפתיחה נשאלת שוב');
    assert(p.statuses.filter(s => s.item.key === 'intake.employed').every(s => s.state === 'pendingReview'), 'עובדת משק הבית לא מכסה את האנשים');
    assert(p.statuses.filter(s => s.item.key === 'intake.crypto').every(s => s.state === 'pendingReview'), '«לא» של משק הבית לא נרשם');
  }),
  test('«של מי / איפה»: רק מהרשימה (גם «אחר»); שם המעסיק חופשי; הערך נשמר עם שם הגוף לצד המזהה', () => {
    const c = married();
    const emp = plan(c).find(e => e.prompt.input.kind === 'multi')!;
    const opts = emp.prompt.input.kind === 'multi' ? emp.prompt.input.options : [];
    const inv = opts.find(o => o.key === 'intake.hasInvestments')!.followUp!;
    const spec = inv.prompt.input.kind === 'entity' ? inv.prompt.input.spec : null!;
    const names = inv.prompt.input.kind === 'entity' ? inv.prompt.input.context : undefined;
    equal(Object.keys(validateEntity(spec, { who: 'spouse', where: 'bank-12' }, names)).length, 0);
    equal(validateEntity(spec, { who: 'spouse', where: 'בנק שלי' }, names).where, 'לבחור מהרשימה');
    equal(validateEntity(spec, { who: 'uncle', where: 'bank-12' }, names).who, 'לבחור מהרשימה');
    equal(Object.keys(validateEntity(spec, { who: 'both', where: 'other' }, names)).length, 0, '«אחר» תשובה לגיטימית');
    const ask: InfoAsk = { id: 'e1', clientId: 'c1', taxYear: 2026, stepId: 'info', parentStepId: 'intake', itemKey: inv.itemKey, subjectRole: inv.subjectRole, entityKind: inv.entityKind, entityRef: inv.entityRef, prompt: inv.prompt, state: 'published', createdAt: TODAY };
    const r = answerToFacts(ask, { kind: 'entity', items: [{ who: 'spouse', where: 'ih-ibi', junk: 'x' }] }, ctx(c), TODAY);
    const v = r.facts[0].value as { items: Record<string, string>[] };
    equal(JSON.stringify(v.items[0]), JSON.stringify({ who: 'spouse', where: 'ih-ibi', whereLabel: 'IBI בית השקעות' }));
    equal(entityLines(spec, v.items, names)[0], 'של מיכל · IBI בית השקעות');
    let threw = false; try { answerToFacts(ask, { kind: 'entity', items: [{ who: 'spouse', where: 'nope' }] }, ctx(c), TODAY); } catch { threw = true; }
    assert(threw, 'ערך מחוץ לרשימה התקבל');
    // רשימות: לכל רשימה (חוץ ממנהלי ספרים) יש «אחר»; מזהים ייחודיים
    for (const l of Object.values(INSTITUTION_LISTS)) {
      const ids = l.items.map(e => e.id);
      equal(new Set(ids).size, ids.length, `מזהה כפול ב-${l.id}`);
      if (l.id !== 'bookkeepers') assert(ids.includes('other'), `אין «אחר» ב-${l.id}`);
    }
  }),
  test('זוג: העוסק הרשום הוא הלקוח — פרטי העסק נשאלים רק עליו, לא על בן/בת הזוג (הכרטיס של אחד אינו עונה על השני)', () => {
    const c = married({ dealerType: 'licensed' } as Partial<Client>);
    const entries = plan(c);
    equal(entries.filter(e => e.itemKey === 'intake.businessDetails').map(e => e.subjectRole).join(','), 'client');
    assert(entries.find(e => e.itemKey === 'intake.businessDetails')!.prompt.title.startsWith('רשום/ה אצלנו'), 'בלי מה שידוע');
    const grid = entries.find(e => e.prompt.input.kind === 'multi')!;
    assert(grid.prompt.input.kind === 'multi' && grid.prompt.input.options.some(o => o.key === 'intake.selfEmployed'), 'לבן/בת הזוג שאלת הפתיחה נשארת באריח');
  }),
  test('הקטלוג: בהיכרות אין מסמכים ואין טקסט חופשי; בהערכה אין מסמכים; המפתחות הישנים קיימים', () => {
    const intakeItems = ITEMS.filter(i => i.key.startsWith('intake.') && i.purposes.includes('intake') && i.who === 'client');
    assert(!intakeItems.some(i => i.input === 'file' || i.input === 'text'), intakeItems.filter(i => i.input === 'file' || i.input === 'text').map(i => i.key).join(','));
    assert(!ITEMS.some(i => i.input === 'file' && i.purposes.includes('estimate')), 'מסמך בהערכת מס');
    for (const k of ['intake.idCard', 'intake.payslip', 'intake.bankCert', 'intake.prevReturns', 'intake.openIssues', 'salary.payslipToDate'])
      assert(ITEMS.some(i => i.key === k), `מפתח נעלם: ${k}`);
    equal(ITEMS.filter(i => i.key.startsWith('intake.') && i.input === 'entity').length, 10);
    equal(ITEMS.filter(i => i.key.startsWith('intake.') && i.tile).length, 11);
  }),
];
