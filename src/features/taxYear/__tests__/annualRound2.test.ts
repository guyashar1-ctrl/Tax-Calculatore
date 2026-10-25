// ─── שאלון הדוח השנתי — סבב 2 (21.10.2026; docs/proposals/2026-10-21-annual-questionnaire-fixes.html) ─────────────
// ‼ מה נעול כאן:
//   · לימודים וצבא: מה שבתיק — מסך ממולא (בלי ריבוע כפול); תואר ⇐ «ואז התמחות?» (40ג(ג1)); שחרור ⇐ חודש; המסמך לפי מה שנבחר.
//   · «השתנה» בשורת «זה עדיין נכון?» פותח את מה שבתוך השורה (onChanged) — ורק אז; «נכון» — לא.
//   · הסדר בדף: שאלה «בתוך השורה» אינה מסך; «לימודים וצבא» של כל בני הבית — מסך אחד בסוף.
//   · חשבון להחזר מהתיק — שורה ממולאת; «נכון» שולח את מה שבתיק (אובייקט בנק, כמו שהדוח קורא).
//   · ריבוע של משק הבית שאדם אחד סימן — «כן» לזוג; מכירה של בן/בת הזוג פותחת את פרטי העסקה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, ANNUAL_GRID_KEY, ANNUAL_LESS_KEY, onChangedFor, onValueFor, studiesAsk, type AskCtx } from '../asks';
import { withOneRound } from '../oneRound';
import { askIdentity, draftToAnswer, expandWithDrafts, inlineOf, walkScreens, type Draft } from '../flowDraft';
import { screenAsks } from '../screens';
import { schemaFor, validateRecord, initialFromCard } from '../records';
import type { InfoAsk, YearFact } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'ישראלי', familyStatus: 'married', spouseFirstName: 'ישראלה', gender: 'male', marriageYear: 2020, city: 'רמת גן', address: 'הרצל 10',
  children: [{ firstName: 'אלה', birthYear: 2019 }], employers: [{ id: 'e1', name: 'משרד דוגמה' }], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {},
  hasAcademicDegree: true, academicDegreeYear: 2022, academicDegreeType: 'bachelor',
  bankAccounts: [{ id: 'b1', bankName: 'לאומי', bankCode: '10', branchNumber: '800', accountNumber: '4821', isPrimary: true }],
  spouse: { firstName: 'ישראלה', completedIdf: true, idfReleaseYear: 2023 }, ...p,
} as unknown as Client);
const pin = (c: Client, facts: YearFact[] = []): PictureInput => ({ client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-21', facts, evidence: [], asks: [] });
const ctxOf = (c: Client): AskCtx => ({ client: c, taxYear: 2025, purpose: 'annual' });
const planFor = (c: Client) => { const i = pin(c); const p = buildYearPicture(i); return withOneRound(buildAskPlan([...p.toConfirm, ...p.toAsk], ctxOf(c)), i, ctxOf(c)); };
let n = 0;
const published = (c: Client): InfoAsk[] => planFor(c).map(e => ({ id: `a${++n}`, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p', itemKey: e.itemKey,
  subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt, state: 'published', createdAt: '2026-10-21' }) as InfoAsk);
const fact = (p: Partial<YearFact>): YearFact => ({ id: `f${++n}`, clientId: 'c1', taxYear: 2025, itemKey: '', subjectRole: 'client', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'pending', createdAt: '2026-10-21T10:00:00Z', ...p } as YearFact);

export const TESTS: TestCase[] = [
  test('לימודים מהתיק: מסך ממולא לכל אחד (תואר · שחרור), ואין ריבוע «סיום לימודים» אצל מי שכבר יש לו', () => {
    const plan = planFor(client());
    const st = plan.filter(e => e.itemKey === 'household.studies');
    equal(st.map(e => e.subjectRole).join(','), 'client,spouse');
    const init = (r: string) => { const e = st.find(x => x.subjectRole === r)!; return e.prompt.input.kind === 'record' ? e.prompt.input.initial ?? [] : []; };
    equal(JSON.stringify(init('client')), JSON.stringify([{ kind: 'ba', year: '2022' }]));
    equal(JSON.stringify(init('spouse')), JSON.stringify([{ kind: 'army', branch: 'idf', year: '2023' }]));
    assert(!plan.some(e => e.itemKey === 'household.degree' || e.itemKey === 'household.release'), 'שורת תואר/שחרור נשארה');
    const less = plan.filter(e => e.itemKey === ANNUAL_LESS_KEY).flatMap(e => (e.prompt.input.kind === 'multi' ? e.prompt.input.options : []));
    assert(!less.some(o => o.key === 'household.creditChanges'), 'ריבוע לימודים כפול');
    assert(!plan.some(e => e.itemKey === 'household.creditChanges'), '«מי מכם?» על לימודים');
  }),
  test('לימודים בלי תיק: הריבוע פותח את מסך הלימודים של אותו אדם', () => {
    const c = client({ hasAcademicDegree: false, academicDegreeYear: 0, spouse: { firstName: 'ישראלה' } } as Partial<Client>);
    const less = planFor(c).find(e => e.itemKey === ANNUAL_LESS_KEY && e.subjectRole === 'spouse')!;
    const o = less.prompt.input.kind === 'multi' ? less.prompt.input.options.find(x => x.key === 'household.creditChanges') : undefined;
    equal(o?.followUps?.[0]?.itemKey, 'household.studies');
    equal(o?.followUps?.[0]?.subjectRole, 'spouse');
  }),
  test('«ואז התמחות?» — רק לתואר מהשנים שבהן היא משנה; שחרור דורש חודש; התמחות דורשת שנים', () => {
    const s = schemaFor('studies', undefined, { taxYear: '2025' });
    equal(Object.keys(validateRecord(s, { kind: 'ba', year: '2022' })).join(','), 'intern');
    equal(Object.keys(validateRecord(s, { kind: 'ba', year: '2022', intern: 'no' })).length, 0);
    equal(Object.keys(validateRecord(s, { kind: 'ba', year: '2022', intern: 'yes' })).sort().join(','), 'internFrom,internTo');
    equal(Object.keys(validateRecord(s, { kind: 'army', year: '2023' })).join(','), 'branch,month'); // 288 · גם איזה שירות
    equal(Object.keys(validateRecord(s, { kind: 'ba', year: '2016' })).length, 0); // תואר ישן — בלי שאלת התמחות
    equal(s.summary({ kind: 'ba', year: '2022', intern: 'yes', internFrom: '2023', internTo: '2024' }), 'תואר ראשון · 2022 · התמחות 2023–2024');
    equal(s.summary({ kind: 'army', month: '08', year: '2023' }), 'צבא או שירות לאומי · אוגוסט 2023');
  }),
  test('המסמך לפי מה שנבחר: תואר ⇐ אישור זכאות · שחרור ⇐ תעודת שחרור · התמחות ⇐ אישור התמחות', () => {
    const p = studiesAsk('client', ctxOf(client())).prompt;
    const docs = (items: Record<string, string>[]) => onValueFor(p, { kind: 'record', value: { items } }).map(f => f.itemKey).join(',');
    equal(docs([{ kind: 'army', year: '2023', month: '08' }]), 'household.releaseDocs');
    equal(docs([{ kind: 'ba', year: '2022', intern: 'no' }]), 'household.degreeDocs');
    equal(docs([{ kind: 'ba', year: '2022', intern: 'yes', internFrom: '2023', internTo: '2024' }]), 'household.degreeDocs,household.internshipDocs');
    equal(docs([{ kind: 'army', year: '2022', month: '03' }, { kind: 'pro', year: '2024' }]), 'household.degreeDocs,household.releaseDocs');
    equal(onValueFor(p, { kind: 'record', value: null, none: true }).length, 0);
  }),
  test('תיק עם תואר ושחרור — שתי שורות ממולאות (לא אחת על חשבון השנייה)', () => {
    const c = client({ completedIdf: true, idfReleaseYear: 2019 } as Partial<Client>);
    equal(initialFromCard('studies', c, 'client').map(r => r.kind).join(','), 'ba,army');
  }),
  test('«השתנה» פותח את מה שבתוך השורה; «נכון» — לא', () => {
    const kids = planFor(client()).find(e => e.itemKey === 'household.children')!;
    equal(onChangedFor(kids.prompt, { kind: 'changed', note: 'נולד ילד' }).map(f => f.itemKey).join(','), 'household.childChange');
    equal(onChangedFor(kids.prompt, { kind: 'record', value: { items: [] }, assertion: 'changed' }).length, 1);
    equal(onChangedFor(kids.prompt, { kind: 'unchanged' }).length, 0);
    const addr = planFor(client()).find(e => e.itemKey === 'household.address')!;
    equal(onChangedFor(addr.prompt, { kind: 'changed', note: 'עברנו' })[0]?.itemKey, 'household.addressCert');
  }),
  // ‼ 25.10.2026 · פרקים: «לימודים וצבא» — בסוף הפרק של כל אדם (לא מסך משותף בסוף)
  test('הסדר בדף: «מה קרה?» בתוך שורת המשפחה (לא מסך), הענף שלו מיד אחריה, ו«לימודים וצבא» — בסוף הפרק של כל אדם', () => {
    const asks = published(client());
    const fam = asks.find(a => a.itemKey === 'household.maritalAtYearEnd')!;
    const drafts: Record<string, Draft> = { [askIdentity(fam)]: { choice: 'changed', text: 'ישראלה נפטרה' } };
    let ex = expandWithDrafts(asks, drafts);
    const ev = inlineOf(ex, fam)[0];
    equal(ev?.itemKey, 'household.familyEvent');
    drafts[askIdentity(ev)] = { selected: ['family.eventDeath'] };
    ex = expandWithDrafts(asks, drafts);
    const screens = walkScreens(ex, new Set());
    const keys = screens.map(s => screenAsks(s).map(a => a.itemKey).join('+'));
    assert(!keys.includes('household.familyEvent'), '«מה קרה?» הוא מסך');
    equal(screens[0].kind, 'confirmAll');
    equal(keys[1], 'family.death'); // הענף מיד אחרי השורה
    equal(keys[keys.length - 1], 'household.studies');
    equal(screenAsks(screens[screens.length - 1])[0].subjectRole, 'spouse');
    const cStudy = keys.findIndex((k, j) => k === 'household.studies' && screenAsks(screens[j])[0].subjectRole === 'client');
    assert(cStudy > keys.indexOf(ANNUAL_LESS_KEY) && cStudy < keys.length - 1, 'הלימודים של הלקוח לא בסוף הפרק שלו');
    assert(keys.indexOf(ANNUAL_GRID_KEY) > 1 && keys.indexOf(ANNUAL_LESS_KEY) > keys.indexOf(ANNUAL_GRID_KEY), 'מסכי הריבועים לא בסדר');
  }),
  test('חשבון להחזר מהתיק — שורה ממולאת ב«זה עדיין נכון?»; «נכון» שולח אובייקט בנק', () => {
    const asks = published(client());
    const r = asks.find(a => a.itemKey === 'filing.refundAccount')!;
    assert(!!r.prompt.knownRow, 'לא שורה ממולאת');
    const all = walkScreens(asks, new Set());
    assert(all[0].kind === 'confirmAll' && all[0].asks.some(a => a.id === r.id), 'לא במסך «זה עדיין נכון?»');
    const ans = draftToAnswer(r, { choice: 'yes' });
    assert(ans?.kind === 'record' && JSON.stringify(ans.value).includes('4821') && JSON.stringify(ans.value).includes('client'), JSON.stringify(ans));
  }),
  test('ריבוע של משק הבית שבן/בת הזוג סימן ⇒ נענה לזוג (לא «חסר»); מכירה של בן/בת הזוג ⇒ החוזה מהלקוח, הפרטים אצל המשרד', () => {
    const c = client();
    const p = buildYearPicture(pin(c, [
      fact({ itemKey: 'rent.newRental', subjectRole: 'client', answer: 'no', value: undefined }), fact({ itemKey: 'rent.newRental', subjectRole: 'spouse' }),
      fact({ itemKey: 'sales.sold', subjectRole: 'client', answer: 'no', value: undefined }), fact({ itemKey: 'sales.sold', subjectRole: 'spouse' }),
    ]));
    equal(p.statuses.find(s => s.item.key === 'rent.newRental' && s.subjectRole === 'couple')?.state, 'pendingReview');
    // ‼ 22.10.2026 · סבב 2.1: פרטי העסקה — מהחוזה, אצל המשרד (ANNUAL_OFFICE_DETAIL); החוזה עצמו — מהלקוח
    assert(p.officeTodo.some(s => s.item.key === 'sales.transaction') && !p.toAsk.some(s => s.item.key === 'sales.transaction'), 'פרטי העסקה לא אצל המשרד');
    assert(p.toAsk.some(s => s.item.key === 'sales.docs'), 'חוזה המכר לא מתבקש');
    const no = buildYearPicture(pin(c, [fact({ itemKey: 'rent.newRental', subjectRole: 'client', answer: 'no', value: undefined }), fact({ itemKey: 'rent.newRental', subjectRole: 'spouse', answer: 'no', value: undefined })]));
    equal(no.statuses.find(s => s.item.key === 'rent.newRental' && s.subjectRole === 'couple')?.state, 'pendingReview');
  }),
  test('ריבוע «מכירה» של בן/בת הזוג: מסמכי המכירה פעם אחת (לא גם «של הלקוח»)', () => {
    const g = planFor(client()).find(e => e.itemKey === ANNUAL_GRID_KEY && e.subjectRole === 'spouse')!;
    const o = g.prompt.input.kind === 'multi' ? g.prompt.input.options.find(x => x.key === 'sales.sold') : undefined;
    equal((o?.followUps ?? []).filter(f => f.itemKey === 'sales.docs').length, 1);
  }),
  test('מסך ריבועים ריק = «לא היה כלום»; «משהו אחר?» נשלח כהערה עם התשובה', () => {
    const g = published(client()).find(a => a.itemKey === ANNUAL_GRID_KEY)!;
    equal(draftToAnswer(g, {}), null);
    const a = draftToAnswer(g, { none: true, selected: [], note: 'זכייה בפרס' });
    assert(a?.kind === 'multi' && a.selected.length === 0 && a.note === 'זכייה בפרס', JSON.stringify(a));
  }),
];
