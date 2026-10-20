// ─── «סבב אחד» (20.10.2026) ────────────────────────────────────────────────────────────────────────────────────────
// ‼ מה נעול כאן (בדיקת השלמות — docs/plans/2026-10-20-simplicity-roadmap.md §5):
//   · שאלה שתשובה חיובית בה פותחת המשך — נושאת אותו מראש (prompt.onYes / option.followUps), כדי שלא יידרש סבב נוסף.
//   · אותו כלל כמו השרת (264): «כן», «זה עדיין נכון», «מי מכם?» לתפקיד שנבחר, תחולה «כל השנה/חלק».
//   · מסמך שהועלה לשאלה של «שניכם» מכסה את שני האנשים; שאלת עסקה בלי מזהה נסגרת כשנענתה.
//   · בשנת פטירה, מה שהיה רק של בן/בת הזוג בדוח הקודם — בענף הפטירה, לא באריח של הלקוח.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, onYesFor, ANNUAL_GRID_KEY, type AskCtx } from '../asks';
import { withOneRound } from '../oneRound';
import type { Evidence, InfoAsk, MultiFollowUp, MultiOption, YearFact } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'ישראלי', familyStatus: 'married', spouseFirstName: 'ישראלה', gender: 'male',
  children: [], employers: [{ id: 'e1', name: 'ישראלי רובוטיקס' }], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [],
  foreignAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const pin = (c: Client, extra: Partial<PictureInput> = {}): PictureInput =>
  ({ client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-20', facts: [], evidence: [], asks: [], ...extra });
const ctxOf = (c: Client, p: Partial<AskCtx> = {}): AskCtx => ({ client: c, taxYear: 2025, purpose: 'annual', ...p });
const planFor = (c: Client, extra: Partial<PictureInput> = {}, cx: Partial<AskCtx> = {}) => {
  const i = pin(c, extra);
  const p = buildYearPicture(i);
  return withOneRound(buildAskPlan([...p.toConfirm, ...p.toAsk], ctxOf(c, cx)), i, ctxOf(c, cx));
};
const fus = (o?: MultiOption): MultiFollowUp[] => [...(o?.followUp ? [o.followUp] : []), ...(o?.followUps ?? [])];
const keys = (l: MultiFollowUp[] | undefined) => (l ?? []).map(f => `${f.itemKey}@${f.subjectRole}`).sort().join(',');

export const TESTS: TestCase[] = [
  test('ביטוח חיים מהכרטיס: «זה עדיין נכון» נושא מראש את האישור השנתי; «השתנה» — לא פותח', () => {
    const e = planFor(client({ hasLifeInsurance: true })).find(x => x.itemKey === 'savings.insurance' && x.subjectRole === 'client')!;
    assert(!!e, 'אין אישור ביטוח חיים');
    assert(keys(e.prompt.onYes).includes('savings.insuranceCert@client'), keys(e.prompt.onYes));
    equal(onYesFor(e.prompt, { kind: 'unchanged' }).length, e.prompt.onYes!.length);
    equal(onYesFor(e.prompt, { kind: 'changed', note: 'בוטל' }).length, 0);
  }),
  test('חשבון בלי תאריך פתיחה: «היה קיים ב-2025?» נושא את ה-867 — כל השנה/חלק פותח, «לא היה» — לא', () => {
    const c = client({ investmentAccounts: [{ id: 'a1', institutionName: 'בנק לאומי', kind: 'other' }] as Client['investmentAccounts'] });
    const e = planFor(c).find(x => x.itemKey === 'period.account' && x.entityRef === 'a1')!;
    assert(!!e, 'אין שאלת תחולה');
    assert(keys(e.prompt.onYes).includes('capital.form867'), keys(e.prompt.onYes));
    assert(onYesFor(e.prompt, { kind: 'record', value: { inPeriod: 'part' } }).length > 0, 'חלק מהשנה לא פתח');
    equal(onYesFor(e.prompt, { kind: 'record', value: { inPeriod: 'none' } }).length, 0);
    equal(onYesFor(e.prompt, { kind: 'record', value: null, none: true }).length, 0);
  }),
  test('מסך הרשת: אריח «כספים מביטוח לאומי» פותח מיד גם את «דמי לידה?», לא רק את האישור', () => {
    const g = planFor(client()).find(x => x.itemKey === ANNUAL_GRID_KEY)!;
    if (g.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    const o = g.prompt.input.options.find(x => x.key === 'niBenefits.received');
    assert(!!o, 'אין אריח ביטוח לאומי');
    const k = keys(fus(o));
    assert(k.includes('niBenefits.cert') && k.includes('niBenefits.maternity'), k);
  }),
  test('«מי מכם?»: נפתח רק לתפקיד שנבחר, ומה ששייך לשניכם — תמיד', () => {
    const prompt = { title: 'x', why: '', input: { kind: 'who', clientName: 'א', spouseName: 'ב' } as never,
      onYes: [{ itemKey: 'a', subjectRole: 'client', prompt: { title: 'a', why: '', input: { kind: 'yesno' } } },
              { itemKey: 'b', subjectRole: 'spouse', prompt: { title: 'b', why: '', input: { kind: 'yesno' } } },
              { itemKey: 'c', subjectRole: 'couple', prompt: { title: 'c', why: '', input: { kind: 'yesno' } } }] } as InfoAsk['prompt'];
    equal(keys(onYesFor(prompt, { kind: 'who', value: 'spouse' })), 'b@spouse,c@couple');
    equal(onYesFor(prompt, { kind: 'who', value: 'both' }).length, 3);
    equal(onYesFor(prompt, { kind: 'who', value: 'none' }).length, 0);
  }),
  test('מסמך שהועלה לשאלה של «שניכם» מכסה את שני האנשים — לא מתבקש שוב מכל אחד', () => {
    const c = client();
    const facts = [{ id: 'f1', clientId: 'c1', taxYear: 2025, itemKey: 'niBenefits.received', subjectRole: 'couple', periodKind: 'year', periodFrom: '2025-01-01',
      periodTo: '2025-12-31', answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'pending', createdAt: '2026-10-20T10:00:00Z' }] as unknown as YearFact[];
    const evidence = [{ id: 'ev1', clientId: 'c1', taxYear: 2025, docKind: 'niAnnualCert', subjectRole: 'couple', fileName: 'ni.pdf', receivedAt: '2026-10-20T10:01:00Z',
      receivedVia: 'portal', extraction: 'not_supported', identityMatch: 'unchecked', periodMatch: 'unchecked', review: 'needs_review' }] as unknown as Evidence[];
    const p = buildYearPicture(pin(c, { facts, evidence }));
    const asked = p.toAsk.filter(s => s.item.key === 'niBenefits.cert').map(s => s.subjectRole);
    equal(asked.join(','), '');
  }),
  test('עסקה בלי מזהה: שאלה שנענתה סוגרת את היעד «new» — לא נשאלת שוב', () => {
    const c = client();
    const facts = [
      { itemKey: 'sales.sold', subjectRole: 'client', answer: 'value', value: true },
      { itemKey: 'sales.transaction', subjectRole: 'client', entityKind: 'transaction', answer: 'value', value: 'דירה' },
    ].map((f, i) => ({ id: `f${i}`, clientId: 'c1', taxYear: 2025, periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31', basis: 'actual',
      source: 'portal', status: 'pending', createdAt: `2026-10-20T10:0${i}:00Z`, ...f })) as unknown as YearFact[];
    const p = buildYearPicture(pin(c, { facts }));
    assert(!p.toAsk.some(s => s.item.key === 'sales.transaction'), 'שאלת העסקה נשאלת שוב');
  }),
  test('אלמן/ה מ-2025: קצבה ופטור נכות שהיו רק של בן/בת הזוג — לא אריח של הלקוח; הקצבה מסומנת בענף הפטירה', () => {
    const c = client({ familyStatus: 'widowed', widowhoodYear: 2025, spouseFirstName: undefined, employers: [] });
    const lastYear = { year: 2024, tiles: { 'pension.received': 'מינהלת הגמלאות · ישראלה', 'special.disability': '100% · ישראלה' }, spouseName: 'ישראלה',
      tilePeople: { 'pension.received': ['spouse' as const], 'special.disability': ['spouse' as const] } };
    const g = planFor(c, {}, { lastYear }).find(x => x.itemKey === ANNUAL_GRID_KEY)!;
    if (g.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    const opts = g.prompt.input.options;
    assert(!opts.find(o => o.key === 'pension.received')?.preset, 'אריח הקצבה סומן כשל הלקוח');
    assert(!opts.find(o => o.key === 'special.disability')?.preset, 'אריח הנכות סומן כשל הלקוח');
    const death = fus(opts.find(o => o.key === 'household.familyChange'));
    const inc = death.find(f => f.itemKey === 'family.deathIncome');
    const pension = inc?.prompt.input.kind === 'multi' ? inc.prompt.input.options.find(o => o.key === 'family.deathGotPension') : undefined;
    assert(!!pension?.preset && !!pension.note?.startsWith('ב-2024: מינהלת הגמלאות'), JSON.stringify(pension));
  }),
];
