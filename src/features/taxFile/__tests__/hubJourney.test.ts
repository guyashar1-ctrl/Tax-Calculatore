// תיק המס כמרכז — מסלול לקוח חדש מקצה לקצה: קליטה → הערכת מס → דוח שנתי → הצהרת הון שחושפת דירה.
// ‼ מה נבדק: הישות החדשה עוברת כהצעה (לא כתיבה ישירה); אחרי אישור היא בתיק; ההערכה והדוח שאושרו לא משתנים,
//   ומסומנים «לבדיקה»; דוח חדש מאותו תיק רואה את הדירה (ואם היא מושכרת — פער, לא שקט); הצעה שנבנתה על תיק ישן
//   נדחית כסתירה במקום לדרוס.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { ProposedFact } from '../../../types/taxFacts';
import type { Evidence, YearFact } from '../../taxYear/types';
import { buildDraft } from '../../taxEstimate/prefill';
import { computeEstimate } from '../../taxEstimate/engine';
import { computeReturn } from '../../annualReturn/engine';
import { sliceYear } from '../../annualReturn/facts';
import { cardSnapshot, changesSinceApproval, entityConflicts, newEntityProposal, NEW_ENTITY_ITEMS, updateEntityProposal } from '../hub';

let n = 0;
const fact = (itemKey: string, value: unknown, o: Partial<YearFact> = {}): YearFact => ({
  id: `f${++n}`, clientId: 'c9', taxYear: 2025, itemKey, subjectRole: 'client', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value, basis: 'final', source: 'office', status: 'accepted', createdAt: '2026-02-01T10:00:00Z', decidedAt: '2026-02-01T10:00:00Z', ...o,
});
const ev: Evidence[] = [];
/** כמו accept_tax_fact_change: בדיקת עדכניות מול old_value.patch, ואז כתיבת המערך כולו. */
function accept(c: Client, p: ProposedFact): Client {
  const old = (p.oldValue as { patch: Record<string, unknown> }).patch;
  for (const k of Object.keys(old)) if (JSON.stringify((c as unknown as Record<string, unknown>)[k] ?? null) !== JSON.stringify(old[k] ?? null)) throw new Error(`stale_conflict:${k}`);
  return { ...c, ...(p.newValue as { patch: Partial<Client> }).patch } as Client;
}
const newClient = (): Client => ({ id: 'c9', firstName: 'נועה', lastName: 'לוי', gender: 'female', familyStatus: 'single', birthDate: '1988-03-01', children: [],
  employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null } as unknown as Client);

export const TESTS: TestCase[] = [
  test('מסלול מלא: קליטה → הערכה → דוח → הון חושף דירה; התיק מתעדכן רק באישור, התוצרים המאושרים לא משתנים', () => {
    // ── 1. קליטה: מעסיק חדש — הצעה לתיק, ואישור המשרד ──
    let card = newClient();
    const empProp = newEntityProposal(card, 'employers', { name: 'הייטק בע״מ' }, { factId: 'intake', itemKey: 'salary.employers', year: 2025 });
    equal(((empProp.oldValue?.patch ?? {}) as { employers: unknown[] }).employers.length, 0);
    card = accept(card, empProp);
    const emp = card.employers![0] as { id: string; name: string };
    assert(emp.id.startsWith('emp-') && emp.name === 'הייטק בע״מ', 'המעסיק בתיק עם מזהה יציב');

    // ── 2. הערכת מס עד ספטמבר — עובדות חלקיות לשנה, מאותה ישות ──
    const salaryToSep = fact('salary.amounts', { gross: 180_000, withheld: 25_000 }, { entityRef: emp.id, basis: 'actual_to_date', periodKind: 'months', periodTo: '2025-09-30' });
    const pre = buildDraft({ client: card, taxYear: 2025, cutoffMonth: 9, facts: [salaryToSep], evidence: ev, today: '2025-10-15' });
    const estOut = computeEstimate(pre.draft, { client: card, taxYear: 2025 });
    const approvedEstimate = { version: 1, approvedAt: '2025-10-20T09:00:00Z', inputFacts: [...pre.inputFacts, ...cardSnapshot(card)], outputs: estOut };
    const estFrozen = JSON.stringify(approvedEstimate.outputs);
    assert(approvedEstimate.inputFacts.some(x => x.id === salaryToSep.id), 'ההערכה נשענת על עובדת המשכורת');

    // ── 3. הדוח השנתי: נתון חלקי מההערכה — פער מפורש; 106 סופי — נכנס ──
    const draft = { taxYear: 2025, preparedOn: '2026-03-01', persons: ['client' as const], completions: [], adjustments: [], micro: {}, decisions: [] };
    const partial = computeReturn({ client: card, draft, facts: [salaryToSep], evidence: ev, estimate: { version: 1, cutoffMonth: 9, outputs: estOut } });
    assert(partial.gaps.some(g => /עד 09\/2025 \(מהערכת המס\)/.test(g.text)), 'פער «יש נתון עד 09/2025 (מהערכת המס)»');
    assert(/הערכת המס \(גרסה 1\) כיסתה עד סוף חודש 9/.test(partial.coverage.text), 'הכיסוי מתואר');
    assert(partial.household.incomplete, 'בלי נתון סופי — «חסר», לא 0 ולא «מאוזן»');
    const final106 = fact('salary.amounts', { gross: 240_000, withheld: 33_000 }, { entityRef: emp.id });
    const facts = [salaryToSep, final106];
    const ret = computeReturn({ client: card, draft, facts, evidence: ev, estimate: { version: 1, cutoffMonth: 9, outputs: estOut } });
    equal(ret.fields.find(f => f.code === '158')?.amount, 240_000);
    equal(ret.household.incomplete, false);
    const approvedReturn = { version: 1, approvedAt: '2026-03-05T09:00:00Z', inputFacts: [...sliceYear(facts, 2025).full.map(f => ({ id: f.id, value: f.value })), ...cardSnapshot(card)], outputs: ret };
    const retFrozen = JSON.stringify(approvedReturn.outputs);
    equal(changesSinceApproval({ ...approvedReturn, client: card, facts, taxYear: 2025 }).length, 0);

    // ── 4. הצהרת הון: דירה שלא הייתה בתיק — עובדה «נכון ליום» + הצעה לתיק ──
    const wealthFact = fact('wealth.realEstate.details', [{ address: 'הרצל 5', city: 'חיפה' }], { taxYear: 2025, periodKind: 'as_of', periodTo: '2025-12-31', createdAt: '2026-04-01T10:00:00Z', decidedAt: '2026-04-01T10:00:00Z' });
    equal(NEW_ENTITY_ITEMS[wealthFact.itemKey], 'properties');
    const allFacts = [...facts, wealthFact];
    // לפני האישור — התיק לא השתנה, ואין «לבדיקה» (נתון הון ליום ההצהרה אינו נתון שנתי)
    equal(changesSinceApproval({ ...approvedReturn, client: card, facts: allFacts, taxYear: 2025 }).length, 0);
    const aptProp = newEntityProposal(card, 'properties', { address: 'הרצל 5', city: 'חיפה', isRented: true }, { factId: wealthFact.id, itemKey: wealthFact.itemKey, year: 2025 });
    assert(/נכס חדש מהשאלון: הרצל 5, חיפה/.test(aptProp.label) && /wealth\.realEstate\.details/.test(aptProp.note ?? ''), 'ההצעה אומרת מאיפה באה');
    const cardBefore = card;
    card = accept(card, aptProp);
    equal((card.properties ?? []).length, 1);

    // ── 5. אחרי האישור: שני התוצרים «לבדיקה», והם עצמם לא השתנו ──
    const estImpact = changesSinceApproval({ ...approvedEstimate, client: card, facts: allFacts, taxYear: 2025 });
    const retImpact = changesSinceApproval({ ...approvedReturn, client: card, facts: allFacts, taxYear: 2025 });
    for (const imp of [estImpact, retImpact]) assert(imp.some(x => x.kind === 'card_added' && x.text.includes('הרצל 5') && /שכר דירה/.test(x.affects)), 'נוסף לתיק — עשוי להשפיע על שכר דירה');
    equal(JSON.stringify(approvedEstimate.outputs), estFrozen);
    equal(JSON.stringify(approvedReturn.outputs), retFrozen);
    // דוח חדש מאותו תיק — הדירה המושכרת היא פער גלוי, לא שקט
    const redo = computeReturn({ client: card, draft, facts: allFacts, evidence: ev });
    assert(redo.gaps.some(g => g.code === 'rent') && redo.status === 'internalDraft', 'דירה מושכרת בלי סכום → «חסר»');

    // ── 6. הצעה שנבנתה על התיק הישן (לפני הדירה) — נדחית כסתירה, לא דורסת ──
    const staleProp = newEntityProposal(cardBefore, 'properties', { address: 'הרצל 5', city: 'חיפה' }, { factId: wealthFact.id, itemKey: wealthFact.itemKey, year: 2025 });
    let err = '';
    try { accept(card, staleProp); } catch (e) { err = (e as Error).message; }
    equal(err, 'stale_conflict:properties');

    // ── 7. נתון שנתי שתוקן אחרי האישור — «לבדיקה» גם הוא ──
    const corrected = { ...final106, status: 'superseded' as const };
    const fixed = fact('salary.amounts', { gross: 241_000, withheld: 33_000 }, { entityRef: emp.id, createdAt: '2026-05-01T10:00:00Z', decidedAt: '2026-05-01T10:00:00Z' });
    const after = changesSinceApproval({ ...approvedReturn, client: card, facts: [salaryToSep, corrected, fixed, wealthFact], taxYear: 2025 });
    assert(after.some(x => x.kind === 'fact_changed') && after.some(x => x.kind === 'fact_new'), 'עובדה שהוחלפה + עובדה חדשה לשנה');
  }),
  test('אותן עובדות בהערכה ובדוח: רכיבים בשם (העברה מהכרטיס, שאלון ישן) נקראים בשניהם — ולא נעלמים מההערכה', () => {
    const card = { ...newClient(), employers: [{ id: 'em7', name: 'מעסיק' }], properties: [{ id: 'pr7', address: 'הגפן 3', isRented: true }] } as unknown as Client;
    // כך נוצרות עובדות מהעברת הכרטיס: עובדה לכל שדה, בשם השדה בכרטיס
    const gross = fact('salary.amounts', { 'employers.grossSalaryAnnual': 200_000 }, { entityRef: 'em7', source: 'card_migration' });
    const tax = fact('salary.amounts', { 'employers.mandatoryTaxWithheld': 21_000 }, { entityRef: 'em7', source: 'card_migration' });
    const rent = fact('rent.incomeTotal', { rentalIncomeAnnual: 48_000 }, { subjectRole: 'couple', source: 'legacy_questionnaire' });
    const facts = [gross, tax, rent];
    const pre = buildDraft({ client: card, taxYear: 2025, cutoffMonth: 12, facts, evidence: ev, today: '2026-01-10' });
    const sal = pre.draft.lines.find(l => l.id === 'sal-em7')!, rl = pre.draft.lines.find(l => l.id === 'rent')!;
    equal(sal.actualToCutoff, 200_000); equal(sal.withheldToCutoff, 21_000); equal(rl.actualToCutoff, 48_000);
    for (const x of facts) assert(pre.inputFacts.some(i => i.id === x.id), `ההערכה רושמת את ${x.id}`);
    const ret = computeReturn({ client: card, draft: { taxYear: 2025, preparedOn: '2026-03-01', persons: ['client'], completions: [], adjustments: [], micro: {}, decisions: [] }, facts, evidence: ev });
    equal(ret.fields.find(f => f.code === '158')?.amount, 200_000);
    equal(ret.fields.find(f => f.code === '042')?.amount, 21_000);
  }),
  test('ישות קיימת: תשובה שסותרת את התיק מוצגת כסתירה; עדכון = הצעה; אחרי אישור — «השתנה בתיק» בתוצר המאושר; הצעה מקבילה נדחית', () => {
    let card = { ...newClient(), properties: [{ id: 'pr1', address: 'הגפן 3', city: 'חיפה', isRented: true }], investmentAccounts: [{ id: 'ac1', institutionName: 'בנק' }] } as unknown as Client;
    const approved = { inputFacts: cardSnapshot(card), approvedAt: '2026-03-01T00:00:00Z' };
    // השאלון: הדירה כבר לא מושכרת; החשבון נסגר
    const f1 = fact('rent.properties', { isRented: false }, { entityRef: 'pr1', entityKind: 'property', status: 'pending' });
    const f2 = fact('capital.accounts', { isClosed: true }, { entityRef: 'ac1', entityKind: 'account' });
    const conf = entityConflicts(card, [f1, f2]);
    equal(conf.length, 2);
    assert(conf.some(c => c.entityId === 'pr1' && c.field === 'isRented' && c.card === true && c.answer === false), 'דירה: מושכר ← לא');
    // שתי הצעות שנבנו על אותו תיק: הראשונה מתקבלת, השנייה — סתירה (התיק השתנה בינתיים)
    const p1 = updateEntityProposal(card, 'properties', 'pr1', { isRented: false }, { factId: f1.id, itemKey: f1.itemKey, year: 2025 });
    const p2 = updateEntityProposal(card, 'properties', 'pr1', { city: 'עכו' }, { factId: f1.id, itemKey: f1.itemKey, year: 2025 });
    assert(/מושכר: true ← false/.test(p1.label), p1.label);
    card = accept(card, p1);
    equal((card.properties![0] as { isRented?: boolean }).isRented, false);
    let err = ''; try { accept(card, p2); } catch (e) { err = (e as Error).message; }
    equal(err, 'stale_conflict:properties');
    // אחרי האישור — אין עוד סתירה; התוצר שאושר קודם מסומן «השתנה בתיק»
    equal(entityConflicts(card, [f1]).length, 0);
    const imp = changesSinceApproval({ ...approved, client: card, facts: [], taxYear: 2025 });
    assert(imp.some(x => x.kind === 'card_changed' && /הגפן 3/.test(x.text)), JSON.stringify(imp));
  }),
  test('צילום התיק: יציב לסדר הרשימות, ומזהה שינוי בישות קיימת', () => {
    const a = { ...newClient(), properties: [{ id: 'p1', address: 'א' }, { id: 'p2', address: 'ב' }] } as unknown as Client;
    const b = { ...newClient(), properties: [{ id: 'p2', address: 'ב' }, { id: 'p1', address: 'א' }] } as unknown as Client;
    equal(JSON.stringify(cardSnapshot(a)), JSON.stringify(cardSnapshot(b)));
    const c = { ...newClient(), properties: [{ id: 'p1', address: 'א', isRented: true }, { id: 'p2', address: 'ב' }] } as unknown as Client;
    const imp = changesSinceApproval({ inputFacts: cardSnapshot(a), client: c, facts: [], taxYear: 2025 });
    equal(imp.length, 1); equal(imp[0].kind, 'card_changed');
  }),
];
