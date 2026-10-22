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
import { buildAskPlan, answerToFacts, ANNUAL_GRID_KEY, ANNUAL_LESS_KEY, GRID_KEY, isLegacyAnnual } from '../asks';
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
// ‼ 21.10.2026 · סבב 2: מסכי ריבועים לכל אדם — «מאיפה נכנס כסף» (ANNUAL_GRID_KEY) ו«מה מוריד מס» (ANNUAL_LESS_KEY)
const gridOf = (c: Client, key = ANNUAL_GRID_KEY, role = 'client') => {
  const g = planFor(c).find(e => e.itemKey === key && e.subjectRole === role);
  if (!g || g.prompt.input.kind !== 'multi') throw new Error('אין מסך רשת');
  return g.prompt.input.options;
};
const bothGrids = (c: Client, role = 'client') => [...gridOf(c, ANNUAL_GRID_KEY, role), ...gridOf(c, ANNUAL_LESS_KEY, role)];
/** ‼ סבב 2: «מה קרה?» — בתוך שורת המשפחה («השתנה»), לא ריבוע. */
const familyEventOf = (c: Client): MultiFollowUp | undefined => planFor(c).find(e => e.itemKey === 'household.maritalAtYearEnd')?.prompt.onChanged?.[0];
const fus = (o?: MultiOption): MultiFollowUp[] => [...(o?.followUp ? [o.followUp] : []), ...(o?.followUps ?? [])];
const ask = (id: string, itemKey: string, kind: string, order?: number, state: InfoAsk['state'] = 'published'): InfoAsk =>
  ({ id, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p', itemKey, subjectRole: 'couple', state, createdAt: '',
     prompt: { title: itemKey, why: '', input: { kind } as never, ...(order !== undefined ? { order } : {}) } }) as InfoAsk;

export const TESTS: TestCase[] = [
  test('דוח שנתי לזוג: אישורים, מסכי ריבועים לכל אדם (כסף · מס), ומסמכי 106 למעסיקים שבתיק — בלי «מי מכם?»', () => {
    const plan = planFor(client());
    equal(plan.filter(e => e.prompt.input.kind === 'who').length, 0);
    equal(plan.filter(e => e.itemKey === ANNUAL_GRID_KEY || e.itemKey === ANNUAL_LESS_KEY).map(e => `${e.itemKey}@${e.subjectRole}`).join(','),
      `${ANNUAL_GRID_KEY}@client,${ANNUAL_LESS_KEY}@client,${ANNUAL_GRID_KEY}@spouse,${ANNUAL_LESS_KEY}@spouse`);
    equal(plan.filter(e => e.itemKey === 'salary.form106').map(e => e.entityRef).sort().join(','), 'e1,e2');
    assert(plan.length <= 14, `${plan.length} שאלות`);
  }),
  test('מה שידוע מהכרטיס (ביטוח חיים) — אישור «זה מה שידוע לנו», והכותרת היא הנושא', () => {
    const ins = planFor(client()).find(e => e.itemKey === 'savings.insurance' && e.subjectRole === 'client');
    equal(ins?.prompt.input.kind, 'confirm');
    assert(!!ins?.prompt.title.startsWith(ITEM_BY_KEY['savings.insurance'].label), ins?.prompt.title ?? '');
  }),
  test('האריחים: מעסיק בתיק ⇒ אין אריח «משכורת»; קצבה בכסף שנכנס, נכות ותרומות במה שמוריד מס; כל אריח פותח מסמך', () => {
    const inc = gridOf(client()).map(o => o.key);
    const less = gridOf(client(), ANNUAL_LESS_KEY).map(o => o.key);
    assert(!inc.includes('salary.worked'), 'משכורת כשיש מעסיקים בתיק');
    for (const k of ['pension.received', 'niBenefits.received', 'capital.newAccount', 'savings.withdrawal', 'business.started']) assert(inc.includes(k), `חסר ${k}`);
    for (const k of ['special.disability', 'donations.given', 'household.aliyah', 'household.relativeCare']) assert(less.includes(k), `חסר ${k}`);
    // ‼ סבב 2: «שינוי במשפחה» ו«השכרת ציוד» אינם ריבועים
    assert(![...inc, ...less].some(k => k === 'household.familyChange' || k === 'rent.otherProperty'), 'ריבוע שיצא');
    const opts = bothGrids(client());
    equal(fus(opts.find(o => o.key === 'pension.received'))[0]?.itemKey, 'pension.certs');
    equal(fus(opts.find(o => o.key === 'donations.given'))[0]?.itemKey, 'donations.receipts');
    equal(fus(opts.find(o => o.key === 'savings.withdrawal'))[0]?.itemKey, 'savings.withdrawalDocs');
    // ‼ ביטוח לאומי פותח «מה שולם?» לאדם הזה בלבד; «לימודים או צבא» — מסך הלימודים
    assert(opts.filter(o => !['niBenefits.received', 'household.creditChanges', 'income.other'].includes(o.key)).every(o => fus(o).every(f => f.prompt.input.kind === 'file')), 'אריח שפותח משהו שאינו מסמך');
    // ‼ 22.10.2026 · «הכנסה אחרת» (במקום «משהו אחר?» בטקסט חופשי) — בחירה סגורה: זכייה / תמלוגים / משהו אחר ⇒ המשרד מתקשר
    const other = fus(opts.find(o => o.key === 'income.other'));
    equal(other.map(f => f.itemKey).join(','), 'income.otherKinds');
    equal(other[0].prompt.input.kind, 'multi');
    equal((other[0].prompt.input as { options: { key: string }[] }).options.map(o => o.key).join(','), 'income.prize,income.royalties,rent.otherProperty,income.unlisted');
    equal(fus(opts.find(o => o.key === 'niBenefits.received')).map(f => f.itemKey + '@' + f.subjectRole).join(','), 'niBenefits.kinds@client');
    equal(fus(gridOf(client(), ANNUAL_GRID_KEY, 'spouse').find(o => o.key === 'niBenefits.received')).map(f => f.itemKey + '@' + f.subjectRole).join(','), 'niBenefits.kinds@spouse');
    assert(opts.every(o => !!o.group && !!o.example && !!o.hint), 'ריבוע בלי דוגמה, קבוצה או «?»');
    assert(opts.every(o => o.role === 'client'), 'ריבוע במסך של הלקוח שאינו שלו');
  }),
  test('בלי מעסיק בתיק ⇒ אריח «משכורת» שפותח 106 «מכל מעסיק», עם מזהה זמני', () => {
    const opts = gridOf(client({ employers: [], familyStatus: 'single', spouseFirstName: undefined }));
    const f = fus(opts.find(o => o.key === 'salary.worked'))[0];
    equal(f?.itemKey, 'salary.form106');
    assert(!!f?.entityRef && /-new-/.test(f.entityRef), f?.entityRef ?? '');
    assert(!!f?.prompt.title.includes('מכל מעסיק'), f?.prompt.title ?? '');
  }),
  test('«מה קרה?» לנשוי: פטירה וגירושין; ענף הפטירה — חמש שאלות בסדר, הראשונה עם משפט השתתפות', () => {
    const ev = familyEventOf(client());
    equal(ev?.itemKey, 'household.familyEvent');
    if (ev?.prompt.input.kind !== 'multi') throw new Error('«מה קרה?» אינו רשת');
    assert(!!ev.prompt.inline, '«מה קרה?» לא בתוך השורה');
    equal(ev.prompt.input.options.map(o => `${o.key}:${o.label}`).join(','), 'family.eventDivorce:נפרדנו,family.eventDeath:ישראלה נפטרה');
    const death = fus(ev.prompt.input.options[1]);
    equal(death.map(f => f.itemKey).join(','), 'family.death,family.deathIncome,family.deathPayouts,family.survivorPensions,family.deathDocs');
    equal(death.map(f => f.prompt.order).join(','), '1,2,3,4,5');
    assert(!!death[0].prompt.hint?.includes('משתתפים בצערך'), death[0].prompt.hint ?? '');
    assert(death[0].prompt.title.includes('ישראלה'), death[0].prompt.title);
  }),
  test('ענף הפטירה: משכורת של בן/בת הזוג שבתיק — בלי 106 נוסף; בלי מעסיק בתיק — 106 לבן/בת הזוג', () => {
    const incomeOf = (c: Client) => {
      const ev = familyEventOf(c);
      const death = ev?.prompt.input.kind === 'multi' ? fus(ev.prompt.input.options.find(o => o.key === 'family.eventDeath')) : [];
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
    const ev = familyEventOf(client({ familyStatus: 'single', spouseFirstName: undefined }));
    if (ev?.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    equal(ev.prompt.input.options.map(o => o.key).join(','), 'family.eventMarriage,family.eventDivorce');
  }),
  test('תשובה למסך הרשת: מה שסומן פותח את כל שאלות ההמשך שלו (followUps), מה שלא — «לא»', () => {
    const c = client();
    const g = planFor(c).find(e => e.itemKey === ANNUAL_GRID_KEY && e.subjectRole === 'client')!;
    const a = { ...ask('g', ANNUAL_GRID_KEY, 'multi'), subjectRole: 'client', prompt: g.prompt } as InfoAsk;
    const r = answerToFacts(a, { kind: 'multi', selected: ['savings.withdrawal', 'pension.received'] }, { client: c, taxYear: 2025, purpose: 'annual' }, '2026-10-19');
    equal((r.followUps ?? []).map(f => f.itemKey).sort().join(','), 'pension.certs,savings.withdrawalDocs');
    assert(r.facts.every(f => f.subjectRole === 'client'), 'עובדה שאינה של הלקוח');
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
    const ev = familyEventOf(client());
    if (ev?.prompt.input.kind !== 'multi') throw new Error('אין «מה קרה?»');
    const death = fus(ev.prompt.input.options.find(o => o.key === 'family.eventDeath'));
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
