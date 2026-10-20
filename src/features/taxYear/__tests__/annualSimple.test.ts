// ─── השאלון הפשוט לדוח השנתי (19.10.2026) ──────────────────────────────────────────────────────────
// ‼ מה נעול כאן (הדמיה מאושרת: docs/proposals/2026-10-19-simple-annual-questionnaire.html):
//   · דוח שנתי = אישורים מהכרטיס → מסך רשת אחד «מה היה לכם ב-{שנה}?» → מסמכים לישויות שבתיק. אין «מי מכם?» לכל נושא.
//   · כל אריח פותח מיד את המסמך שלו (followUps); «נישואין, גירושין או פטירה» פותח את «מה קרה?».
//   · ענף הפטירה: תאריך · מה התקבל עד הפטירה · כספים בגלל הפטירה · קצבאות שאירים · תעודת פטירה — בסדר הזה.
//   · מה שידוע מהכרטיס (ביטוח חיים) — אישור, לא «מי מכם?».
//   · הסדר בדף: אישורים → רשת → שאלות ההמשך לפי order → מסמכים.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture } from '../picture';
import { buildAskPlan, answerToFacts, ANNUAL_GRID_KEY, GRID_KEY, isLegacyAnnual } from '../asks';
import { sortAsks } from '../screens';
import { ITEM_BY_KEY } from '../catalog';
import type { InfoAsk, MultiFollowUp, MultiOption } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'בדיקה', familyStatus: 'married', spouseFirstName: 'ישראלה', gender: 'male',
  children: [{ firstName: 'דן', birthYear: 2008 }], employers: [{ id: 'e1', name: 'הייפר פוד' }, { id: 'e2', name: 'משרד החינוך', belongsToSpouse: true }],
  businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, hasLifeInsurance: true, ...p,
} as unknown as Client);
const planFor = (c: Client) => {
  const p = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-19', facts: [], evidence: [], asks: [] });
  return buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2025, purpose: 'annual' });
};
const gridOf = (c: Client) => {
  const g = planFor(c).find(e => e.itemKey === ANNUAL_GRID_KEY);
  if (!g || g.prompt.input.kind !== 'multi') throw new Error('אין מסך רשת');
  return g.prompt.input.options;
};
const fus = (o?: MultiOption): MultiFollowUp[] => [...(o?.followUp ? [o.followUp] : []), ...(o?.followUps ?? [])];
const ask = (id: string, itemKey: string, kind: string, order?: number, state: InfoAsk['state'] = 'published'): InfoAsk =>
  ({ id, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p', itemKey, subjectRole: 'couple', state, createdAt: '',
     prompt: { title: itemKey, why: '', input: { kind } as never, ...(order !== undefined ? { order } : {}) } }) as InfoAsk;

export const TESTS: TestCase[] = [
  test('דוח שנתי לזוג: אישורים, מסך רשת אחד, ומסמכי 106 למעסיקים שבתיק — בלי «מי מכם?»', () => {
    const plan = planFor(client());
    equal(plan.filter(e => e.prompt.input.kind === 'who').length, 0);
    assert(plan.some(e => e.itemKey === ANNUAL_GRID_KEY), 'אין מסך רשת');
    equal(plan.filter(e => e.itemKey === 'salary.form106').map(e => e.entityRef).sort().join(','), 'e1,e2');
    assert(plan.length <= 11, `${plan.length} שאלות`);
  }),
  test('מה שידוע מהכרטיס (ביטוח חיים) — אישור «זה מה שידוע לנו», והכותרת היא הנושא', () => {
    const ins = planFor(client()).find(e => e.itemKey === 'savings.insurance' && e.subjectRole === 'client');
    equal(ins?.prompt.input.kind, 'confirm');
    assert(!!ins?.prompt.title.startsWith(ITEM_BY_KEY['savings.insurance'].label), ins?.prompt.title ?? '');
  }),
  test('האריחים: מעסיק בתיק ⇒ אין אריח «משכורת»; יש קצבה, נכות ואירוע משפחתי; כל אריח פותח מסמך', () => {
    const opts = gridOf(client());
    const keys = opts.map(o => o.key);
    assert(!keys.includes('salary.worked'), 'משכורת כשיש מעסיקים בתיק');
    for (const k of ['household.familyChange', 'pension.received', 'special.disability', 'donations.given']) assert(keys.includes(k), `חסר ${k}`);
    equal(keys[0], 'household.familyChange');
    equal(fus(opts.find(o => o.key === 'pension.received'))[0]?.itemKey, 'pension.certs');
    equal(fus(opts.find(o => o.key === 'donations.given'))[0]?.itemKey, 'donations.receipts');
    // ‼ 20.10.2026 · ביטוח לאומי פותח «מה שולם?» (בחירה לכל אדם) — את האישור המשרד מוציא
    assert(opts.filter(o => o.key !== 'household.familyChange' && o.key !== 'niBenefits.received').every(o => fus(o).every(f => f.prompt.input.kind === 'file')), 'אריח שפותח משהו שאינו מסמך');
    equal(fus(opts.find(o => o.key === 'niBenefits.received')).map(f => f.itemKey + '@' + f.subjectRole).join(','), 'niBenefits.kinds@client,niBenefits.kinds@spouse');
    assert(opts.every(o => !!o.group) && opts.filter(o => o.key !== 'household.familyChange').every(o => !!o.example), 'ריבוע בלי דוגמה או קבוצה');
  }),
  test('בלי מעסיק בתיק ⇒ אריח «משכורת» שפותח 106 «מכל מעסיק», עם מזהה זמני', () => {
    const opts = gridOf(client({ employers: [], familyStatus: 'single', spouseFirstName: undefined }));
    const f = fus(opts.find(o => o.key === 'salary.worked'))[0];
    equal(f?.itemKey, 'salary.form106');
    assert(!!f?.entityRef && /-new-/.test(f.entityRef), f?.entityRef ?? '');
    assert(!!f?.prompt.title.includes('מכל מעסיק'), f?.prompt.title ?? '');
  }),
  test('«מה קרה?» לנשוי: פטירה וגירושין; ענף הפטירה — חמש שאלות בסדר, הראשונה עם משפט השתתפות', () => {
    const ev = fus(gridOf(client()).find(o => o.key === 'household.familyChange'))[0];
    equal(ev?.itemKey, 'household.familyEvent');
    if (ev?.prompt.input.kind !== 'multi') throw new Error('«מה קרה?» אינו רשת');
    equal(ev.prompt.input.options.map(o => o.key).join(','), 'family.eventDeath,family.eventDivorce');
    const death = fus(ev.prompt.input.options[0]);
    equal(death.map(f => f.itemKey).join(','), 'family.death,family.deathIncome,family.deathPayouts,family.survivorPensions,family.deathDocs');
    equal(death.map(f => f.prompt.order).join(','), '1,2,3,4,5');
    assert(!!death[0].prompt.hint?.includes('משתתפים בצערך'), death[0].prompt.hint ?? '');
    assert(death[0].prompt.title.includes('ישראלה'), death[0].prompt.title);
  }),
  test('ענף הפטירה: משכורת של בן/בת הזוג שבתיק — בלי 106 נוסף; בלי מעסיק בתיק — 106 לבן/בת הזוג', () => {
    const incomeOf = (c: Client) => {
      const ev = fus(gridOf(c).find(o => o.key === 'household.familyChange'))[0];
      const death = ev?.prompt.input.kind === 'multi' ? fus(ev.prompt.input.options[0]) : [];
      const inc = death.find(f => f.itemKey === 'family.deathIncome');
      return inc?.prompt.input.kind === 'multi' ? inc.prompt.input.options : [];
    };
    equal(fus(incomeOf(client()).find(o => o.key === 'family.deathGotSalary')).length, 0);
    const noEmp = fus(incomeOf(client({ employers: [{ id: 'e1', name: 'הייפר פוד' }] as Client['employers'] })).find(o => o.key === 'family.deathGotSalary'));
    equal(noEmp[0]?.itemKey, 'salary.form106');
    equal(noEmp[0]?.subjectRole, 'spouse');
    equal(fus(incomeOf(client()).find(o => o.key === 'family.deathGotPension'))[0]?.subjectRole, 'spouse');
  }),
  test('לא נשוי: «מה קרה?» — נישואין וגירושין', () => {
    const ev = fus(gridOf(client({ familyStatus: 'single', spouseFirstName: undefined })).find(o => o.key === 'household.familyChange'))[0];
    if (ev?.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    equal(ev.prompt.input.options.map(o => o.key).join(','), 'family.eventMarriage,family.eventDivorce');
  }),
  test('תשובה למסך הרשת: מה שסומן פותח את כל שאלות ההמשך שלו (followUps), מה שלא — «לא»', () => {
    const c = client();
    const g = planFor(c).find(e => e.itemKey === ANNUAL_GRID_KEY)!;
    const a = { ...ask('g', ANNUAL_GRID_KEY, 'multi'), prompt: g.prompt } as InfoAsk;
    const r = answerToFacts(a, { kind: 'multi', selected: ['household.familyChange', 'pension.received'] }, { client: c, taxYear: 2025, purpose: 'annual' }, '2026-10-19');
    equal((r.followUps ?? []).map(f => f.itemKey).sort().join(','), 'household.familyEvent,pension.certs');
    assert(r.facts.filter(f => f.answer === 'no').length >= 5, 'אריחים שלא סומנו');
  }),
  test('הסדר בדף: אישור → רשת → שאלות המשך לפי order → מסמכים', () => {
    const list = sortAsks([
      ask('f', 'pension.certs', 'file', 7), ask('d', 'family.deathIncome', 'multi', 2), ask('c', 'household.children', 'confirm'),
      ask('r', 'family.death', 'record', 1), ask('g', ANNUAL_GRID_KEY, 'multi'), ask('e', 'household.familyEvent', 'multi', 0),
    ]);
    equal(list.map(a => a.id).join(','), 'c,g,e,r,d,f');
  }),
  test('ההיכרות לא השתנתה: מסך הרשת שלה הוא עדיין intake.whatYouHave', () => {
    const c = client();
    const p = buildYearPicture({ client: c, taxYear: 2026, purpose: 'intake', today: '2026-10-19', asOfDate: '2026-10-19', facts: [], evidence: [], asks: [] });
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2026, purpose: 'intake', asOfDate: '2026-10-19' });
    assert(plan.some(e => e.itemKey === GRID_KEY), 'אין רשת בהיכרות');
    assert(!plan.some(e => e.itemKey === ANNUAL_GRID_KEY), 'רשת שנתית בהיכרות');
  }),
  test('20.10 · גרסה קודמת: «מי מכם?» לנושא עם אריח ⇒ ישנה (לא מוסיפים לה); שאלון חדש — אישורים, רשת ומסמכים — אינו ישן', () => {
    const plan = planFor(client());
    const asNew = plan.map((e, i) => ({ ...ask(String(i), e.itemKey, e.prompt.input.kind), prompt: e.prompt }));
    assert(!isLegacyAnnual(asNew), 'שאלון חדש זוהה כישן');
    assert(isLegacyAnnual([...asNew, ask('w', 'salary.worked', 'who')]), '«מי מכם?» על משכורת לא זוהה כישן');
    assert(!isLegacyAnnual([ask('w', 'salary.worked', 'who', undefined, 'cancelled')]), 'שאלה שבוטלה נספרה');
  }),
  test('20.10 · פערי יריב בענף הפטירה: פדיון ימי מחלה, היוון שפותח את המכתב, אישור לכל משלם ו«מתי התחילו לשלם»', () => {
    const ev = fus(gridOf(client()).find(o => o.key === 'household.familyChange'))[0];
    if (ev?.prompt.input.kind !== 'multi') throw new Error('אין «מה קרה?»');
    const death = fus(ev.prompt.input.options[0]);
    const multi = (k: string) => { const f = death.find(x => x.itemKey === k); return f?.prompt.input.kind === 'multi' ? f.prompt.input.options : []; };
    equal(fus(multi('family.deathPayouts').find(o => o.key === 'family.payoutSickDays'))[0]?.itemKey, 'family.sickPayDocs');
    const cap = fus(multi('family.deathIncome').find(o => o.key === 'family.deathGotPension')).find(f => f.itemKey === 'family.pensionCapitalized');
    equal(cap?.prompt.onYes?.[0]?.itemKey, 'family.capitalizationDocs');
    const surv = multi('family.survivorPensions');
    equal(surv.map(o => fus(o).map(f => f.itemKey).join('+')).join(' | '),
      'family.survivorDocs+family.survivorPaidWhen | family.survivorDocsState+family.survivorPaidWhen | family.survivorPaidWhen' /* 20.10.2026 · אישור ב״ל — המשרד */);
    const when = fus(surv[0]).find(f => f.itemKey === 'family.survivorPaidWhen');
    assert(when?.prompt.input.kind === 'choice' && when.prompt.input.options.some(o => o.label.includes('2026')), 'בתשובות אין את השנה');
  }),
  test('20.10 · אריח «מניות או אופציות מהעבודה» פותח את אישור הנאמן', () => {
    equal(fus(gridOf(client()).find(o => o.key === 'salary.equity'))[0]?.itemKey, 'salary.equityDocs');
  }),
];
