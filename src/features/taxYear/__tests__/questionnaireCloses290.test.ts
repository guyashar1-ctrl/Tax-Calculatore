// ─── 290 · השאלון סוגר את קלטי נקודות הזיכוי (23.10.2026, גיא אישר) ─────────────────────────────────────────────
// ‼ מה נעול כאן — כל קלט חדש עובר את כל הדרך: נשאל (מתי ולמי) ⇒ תשובה ⇒ «אשר ועדכן בתיק» (cardUpdateFor) ⇒ החישוב:
//   · עלייה: אחרי «כן» בריבוע — מעמד, חודש ושנה. עולה ⇒ isNewImmigrant + aliyahYear + aliyahMonth; תושב חוזר ⇒ isReturningResident + returningYear.
//   · נכות: אחרי «כן» — «נקבעו?», אחוז וממתי ⇒ disabilityPercentage. «עוד לא» ⇒ אין עדכון.
//   · מזונות לגרוש/ה (40א): ריבוע לכל נשוי/אה בדוח השנתי (לא «חריג») ⇒ paysAlimonyToEx — גם «לא» נכתב.
//   · מין בן/בת הזוג: נשאל רק לזוג נשוי שאין בכרטיס מין לבן/בת הזוג, מוקדם ⇒ clients.spouse (עם השם והת.ז. מהעמודות).
//   · ילדים של הורה שאינו נשוי: «איפה גר/ה» ⇒ Child.custody.
//   · בן/בת הזוג — תמיד הצעה אחת «spouse» שממוזגת (288).

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { EMPTY_SPOUSE, type Client } from '../../../types';
import type { ProposedFact } from '../../../types/taxFacts';
import { cardUpdateFor, updatesCard } from '../recordToCard';
import { buildYearPicture } from '../picture';
import { buildAskPlan, ANNUAL_LESS_KEY, promptFor } from '../asks';
import { sortAsks } from '../screens';
import { ITEM_BY_KEY } from '../catalog';
import { schemaFor, validateRecord, initialFromCard } from '../records';
import { RECORD_OF } from '../structured';
import { calcCreditPoints, spouseAsClient } from '../../../utils/taxCalculations';
import { clientCreditGaps } from '../../taxFile/creditGaps';
import type { InfoAsk, MultiFollowUp, MultiOption, YearFact } from '../types';
import type { ItemStatus } from '../picture';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'בדיקה', familyStatus: 'married', spouseFirstName: 'ישראלה', spouseLastName: 'בדיקה', spouseIdNumber: '000000018',
  gender: 'male', birthDate: '1985-01-01', children: [], employers: [{ id: 'e1', name: 'מעסיק לדוגמה' }], businesses: [], properties: [], investmentAccounts: [],
  pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, isNewImmigrant: false, aliyahYear: 0, isReturningResident: false, returningYear: 0,
  disabilityPercentage: 0, completedIdf: false, idfReleaseYear: 0, completedNationalService: false, nationalServiceYear: 0, hasAcademicDegree: false, academicDegreeYear: 0, ...p,
} as unknown as Client);
const from = (itemKey: string) => ({ factId: 'f1', itemKey, year: 2025 });
const patchOf = (p: ProposedFact) => (p.newValue as unknown as { patch: Record<string, unknown> }).patch;
const plan = (c: Client, itemKey: string, value: unknown, role = 'client') => cardUpdateFor(c, itemKey, value, from(itemKey), role);
const keys = (c: Client, itemKey: string, value: unknown, role = 'client') => (plan(c, itemKey, value, role)?.proposals ?? []).map(p => p.fieldKey);
const pic = (c: Client, purpose: 'annual' | 'estimate' = 'annual', facts: YearFact[] = []) =>
  buildYearPicture({ client: c, taxYear: 2025, purpose, today: '2026-10-23', facts, evidence: [], asks: [] });
const planFor = (c: Client) => { const p = pic(c); return buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2025, purpose: 'annual' }); };
const lessOf = (c: Client, role = 'client'): MultiOption[] => {
  const g = planFor(c).find(e => e.itemKey === ANNUAL_LESS_KEY && e.subjectRole === role);
  return g && g.prompt.input.kind === 'multi' ? g.prompt.input.options : [];
};
const fus = (o?: MultiOption): MultiFollowUp[] => [...(o?.followUp ? [o.followUp] : []), ...(o?.followUps ?? [])];
let n = 0;
const fact = (p: Partial<YearFact>): YearFact => ({ id: `f${++n}`, clientId: 'c1', taxYear: 2025, itemKey: '', subjectRole: 'client', periodKind: 'year', periodFrom: '2025-01-01',
  periodTo: '2025-12-31', answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'pending', createdAt: '2026-10-23T10:00:00Z', ...p } as YearFact);

export const TESTS: TestCase[] = [
  test('כל הפריטים החדשים מעדכנים את התיק — ובשרת הם פריטים מוכרים מהקטלוג', () => {
    for (const k of ['household.aliyahDetails', 'special.disabilityDetails', 'household.alimonyPaid', 'household.spouseBasics', 'household.children', 'household.noIncomeSpouse', 'household.reserveDays', 'household.disabledChildDetails', 'family.childSupport']) {
      assert(!!ITEM_BY_KEY[k], `${k} לא בקטלוג`);
      assert(updatesCard(k), `${k} לא מעדכן את התיק`);
    }
    // ‼ «פרטי מעסיק חדש» עדיין לא כאן — נכנס ב«הוסף לתיק» עם המזהה הזמני
    assert(!updatesCard('salary.employerDetails'), 'פרטי מעסיק חדש');
  }),

  // ── עלייה ──
  test('עלייה, בעל/ת התיק: עולה ⇒ עולה + שנה + חודש; תושב חוזר ⇒ תושב חוזר + שנה', () => {
    deepEqual(keys(client(), 'household.aliyahDetails', { items: [{ status: 'immigrant', month: '03', year: '2023' }] }), ['isNewImmigrant', 'aliyahYear', 'aliyahMonth']);
    const p = plan(client(), 'household.aliyahDetails', { items: [{ status: 'immigrant', month: '03', year: '2023' }] })!;
    equal(patchOf(p.proposals[2]).aliyahMonth, 3);
    deepEqual(keys(client(), 'household.aliyahDetails', { items: [{ status: 'returning', month: '08', year: '2021' }] }), ['isReturningResident', 'returningYear']);
    // כבר בתיק — אין הצעה
    deepEqual(keys(client({ isNewImmigrant: true, aliyahYear: 2023, aliyahMonth: 3 }), 'household.aliyahDetails', { items: [{ status: 'immigrant', month: '03', year: '2023' }] }), []);
    // מעמד שני בתיק — לא נמחק בשקט; שורה למשרד
    const both = plan(client({ isNewImmigrant: true, aliyahYear: 2019 }), 'household.aliyahDetails', { items: [{ status: 'returning', month: '01', year: '2022' }] })!;
    assert(both.lines.some(l => l.includes('לבדוק איזה מעמד')), both.lines.join(' | '));
  }),
  test('עלייה, בן/בת הזוג: הצעה אחת «spouse»; בלי אובייקט spouse — השם והת.ז. נזרעים מהעמודות', () => {
    const p = plan(client(), 'household.aliyahDetails', { items: [{ status: 'immigrant', month: '11', year: '2024' }] }, 'spouse')!;
    deepEqual(p.proposals.map(x => x.fieldKey), ['spouse']);
    deepEqual(patchOf(p.proposals[0]).spouse, { firstName: 'ישראלה', lastName: 'בדיקה', idNumber: '000000018', isNewImmigrant: true, aliyahYear: 2024, aliyahMonth: 11 });
    // יש אובייקט spouse — רק מה שהשתנה
    const q = plan(client({ spouse: { ...EMPTY_SPOUSE, firstName: 'ישראלה', gender: 'female' } }), 'household.aliyahDetails', { items: [{ status: 'immigrant', month: '11', year: '2024' }] }, 'spouse')!;
    deepEqual(patchOf(q.proposals[0]).spouse, { isNewImmigrant: true, aliyahYear: 2024, aliyahMonth: 11 });
  }),
  test('עלייה: החודש משנה את הנקודות (סעיף 35), ובן/בת הזוג מקבלים את החודש שלהם', () => {
    const pts = (c: Client) => calcCreditPoints(c, 2025, 2904).filter(l => /עולה/.test(l.description)).reduce((a, l) => a + l.points, 0);
    const jan = pts(client({ familyStatus: 'single', isNewImmigrant: true, aliyahYear: 2024 }));
    const oct = pts(client({ familyStatus: 'single', isNewImmigrant: true, aliyahYear: 2024, aliyahMonth: 10 }));
    assert(jan !== oct, `${jan} = ${oct}`);
    equal(spouseAsClient(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female', isNewImmigrant: true, aliyahYear: 2024, aliyahMonth: 10 } }))?.aliyahMonth, 10);
    // חסר חודש בחלון — נכתב כהנחה
    assert(clientCreditGaps(client({ isNewImmigrant: true, aliyahYear: 2024 }), 2025).some(g => g.text.includes('חודש העלייה')), 'פער חודש העלייה');
  }),
  test('עלייה — הרשומה: מעמד, חודש ושנה חובה; השנים כמו הריבוע; מה שבתיק — ממולא', () => {
    const sc = schemaFor('aliyah', undefined, { taxYear: '2025' });
    deepEqual(Object.keys(validateRecord(sc, {})).sort(), ['month', 'status', 'year']);
    const years = sc.fields.find(f => f.key === 'year')!.options!.map(o => o.value);
    equal(years[0], '2015'); equal(years[years.length - 1], '2025');
    deepEqual(initialFromCard('aliyah', client({ isNewImmigrant: true, aliyahYear: 2022, aliyahMonth: 7 }), 'client'), [{ status: 'immigrant', year: '2022', month: '07' }]);
    deepEqual(initialFromCard('aliyah', client({ spouse: { ...EMPTY_SPOUSE, isReturningResident: true, returningYear: 2020 } }), 'spouse'), [{ status: 'returning', year: '2020' }]);
  }),

  // ── נכות ──
  test('נכות: אחוז ⇒ disabilityPercentage (גם לבן/בת הזוג, במיזוג); «עוד לא נקבעו» ⇒ אין עדכון; התחילה בשנת הדוח ⇒ שורה למשרד', () => {
    const mine = plan(client(), 'special.disabilityDetails', { items: [{ determined: 'yes', percent: 50, year: '2019' }] })!;
    deepEqual(mine.proposals.map(p => p.fieldKey), ['disabilityPercentage']);
    equal(patchOf(mine.proposals[0]).disabilityPercentage, 50);
    const sp = plan(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female' } }), 'special.disabilityDetails', { items: [{ determined: 'yes', percent: 100, year: '2025', month: '06' }] }, 'spouse')!;
    deepEqual(sp.proposals.map(p => p.fieldKey), ['spouse']);
    deepEqual(patchOf(sp.proposals[0]).spouse, { disabilityPercentage: 100 });
    assert(sp.lines.some(l => l.includes('06/2025') && l.includes('9(5)')), sp.lines.join(' | '));
    const not = plan(client(), 'special.disabilityDetails', { items: [{ determined: 'no' }] })!;
    equal(not.proposals.length, 0);
    // הרשומה: «עוד לא» — בלי אחוז; חודש רק כשהנכות מהשנה האחרונה
    const sc = schemaFor('disability', undefined, { taxYear: '2025' });
    deepEqual(Object.keys(validateRecord(sc, { determined: 'no' })), []);
    deepEqual(Object.keys(validateRecord(sc, { determined: 'yes', percent: 40, year: '2010' })), []);
    deepEqual(Object.keys(validateRecord(sc, { determined: 'yes', percent: 40, year: '2025' })), ['month']);
  }),

  // ── מזונות לגרוש/ה ──
  test('מזונות לגרוש/ה (40א): «כן» ⇒ true, «לא» ⇒ false (גם «לא» נכתב); בן/בת הזוג — מיזוג; לא נשוי — אין עדכון', () => {
    deepEqual(keys(client(), 'household.alimonyPaid', true), ['paysAlimonyToEx']);
    equal(patchOf(plan(client(), 'household.alimonyPaid', true)!.proposals[0]).paysAlimonyToEx, true);
    equal(patchOf(plan(client(), 'household.alimonyPaid', { yes: true, note: 'לפי פסק דין' })!.proposals[0]).paysAlimonyToEx, true);
    equal(patchOf(plan(client(), 'household.alimonyPaid', null)!.proposals[0]).paysAlimonyToEx, false);
    deepEqual(keys(client({ paysAlimonyToEx: false }), 'household.alimonyPaid', null), []);
    const sp = plan(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female' } }), 'household.alimonyPaid', true, 'spouse')!;
    deepEqual(patchOf(sp.proposals[0]).spouse, { paysAlimonyToEx: true });
    equal(plan(client({ familyStatus: 'divorced' }), 'household.alimonyPaid', true), null);
    // והחישוב: נשוי/אה שמשלם/ת — נקודה
    equal(calcCreditPoints(client({ paysAlimonyToEx: true }), 2025, 2904).filter(l => /לשעבר/.test(l.description)).reduce((a, l) => a + l.points, 0), 1);
  }),
  test('מזונות לגרוש/ה — נשאל: ריבוע ב«מה יכול להוריד לך מס?» לכל אחד מבני הזוג; לא ליחיד ולא בהערכת המס', () => {
    for (const role of ['client', 'spouse']) {
      const o = lessOf(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female' } }), role).find(x => x.key === 'household.alimonyPaid');
      assert(!!o && o.role === role && !!o.example && !!o.hint && o.group === 'less', `${role}: ${JSON.stringify(o)}`);
    }
    assert(!lessOf(client({ familyStatus: 'single', spouseFirstName: undefined })).some(o => o.key === 'household.alimonyPaid'), 'יחיד נשאל על 40א');
    assert(!pic(client(), 'estimate').statuses.some(s => s.item.key === 'household.alimonyPaid'), 'נשאל בהערכת המס');
    // ‼ לא שאלה לבד («מי מכם?») — רק ריבוע
    assert(!planFor(client()).some(e => e.itemKey === 'household.alimonyPaid'), 'נשאל גם לבד');
  }),

  // ── בן/בת הזוג: מין ותאריך לידה ──
  test('בן/בת הזוג — מין ותאריך לידה: נשאל רק לזוג נשוי כשאחד מהם חסר — מוקדם; התשובה ⇒ spouse עם השם', () => {
    const asked = (c: Client, purpose: 'annual' | 'estimate' = 'annual') => pic(c, purpose).toAsk.some(s => s.item.key === 'household.spouseBasics');
    assert(asked(client()) && asked(client(), 'estimate'), 'לא נשאל כשאין spouse');
    assert(asked(client({ spouse: { ...EMPTY_SPOUSE, gender: '' as never, birthDate: '1988-02-01' } })), 'לא נשאל כשאין מין');
    assert(asked(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female', birthDate: '' } })), 'לא נשאל כשאין תאריך לידה');
    assert(!asked(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female', birthDate: '1988-02-01' } })), 'נשאל למרות שהכול ידוע');
    assert(!asked(client({ familyStatus: 'single' })), 'נשאל יחיד');
    const pend = pic(client(), 'annual', [fact({ itemKey: 'household.spouseBasics', subjectRole: 'couple', value: { items: [{ gender: 'female', birthDate: '1988-02-01' }] } })]);
    equal(pend.statuses.find(s => s.item.key === 'household.spouseBasics')?.state, 'pendingReview');
    // הנוסח: שם בן/בת הזוג; רשומה — מין (בחירה) ותאריך לידה; מה שבתיק ממולא
    const p = promptFor({ item: ITEM_BY_KEY['household.spouseBasics'], subjectRole: 'couple', state: 'missing', facts: [], evidence: [], askable: true } as unknown as ItemStatus,
      { client: client({ spouse: { ...EMPTY_SPOUSE, gender: 'female', birthDate: '' } }), taxYear: 2025, purpose: 'annual' });
    equal(p.title, 'כמה פרטים על ישראלה');
    assert(p.input.kind === 'record' && p.input.schema === 'spouseBasics' && p.input.initial?.[0]?.gender === 'female', JSON.stringify(p.input));
    deepEqual(Object.keys(validateRecord(schemaFor('spouseBasics'), {})).sort(), ['birthDate', 'gender']);
    const mk = (itemKey: string, kind: string): InfoAsk => ({ id: itemKey, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p', itemKey, subjectRole: 'couple', state: 'published', createdAt: '',
      prompt: { title: itemKey, why: '', input: { kind } as never } }) as InfoAsk;
    equal(sortAsks([mk(ANNUAL_LESS_KEY, 'multi'), mk('household.spouseBasics', 'record')])[0].itemKey, 'household.spouseBasics');
    const g = plan(client(), 'household.spouseBasics', { items: [{ gender: 'female', birthDate: '2008-05-01' }] }, 'couple')!;
    deepEqual(g.proposals.map(x => x.fieldKey), ['spouse']);
    deepEqual(patchOf(g.proposals[0]).spouse, { firstName: 'ישראלה', lastName: 'בדיקה', idNumber: '000000018', gender: 'female', birthDate: '2008-05-01' });
    equal(plan(client({ familyStatus: 'single' }), 'household.spouseBasics', { items: [{ gender: 'female' }] }), null);
    // אחרי העדכון — בן/בת הזוג מחושבים, ותאריך הלידה נכנס (נקודת «נער/ה» לבת 17)
    const after = client({ spouse: { ...EMPTY_SPOUSE, ...(patchOf(g.proposals[0]).spouse as object) } });
    const sp = spouseAsClient(after);
    assert(sp !== null && calcCreditPoints(sp, 2025, 2904).some(l => /נער/.test(l.description)), 'בן/בת הזוג לא מחושבים אחרי העדכון');
  }),

  // ── סעיף 37 ──
  test('סעיף 37: נשאל רק לזוג נשוי בלי עבודה או עסק לבן/בת הזוג בכרטיס; גיל פרישה/עיוור/נכה ⇒ זכאי, אחרת לא', () => {
    const asked = (c: Client) => pic(c).toAsk.some(s => s.item.key === 'household.noIncomeSpouse');
    assert(asked(client()), 'לא נשאל');
    assert(!asked(client({ employers: [{ id: 'e2', name: 'מעסיק', belongsToSpouse: true }] } as Partial<Client>)), 'נשאל כשיש לבן/בת הזוג מעסיק');
    assert(!asked(client({ spouseNoIncomeEligible: false })), 'נשאל כשכבר נקבע');
    assert(!asked(client({ familyStatus: 'single' })), 'נשאל יחיד');
    const p = promptFor({ item: ITEM_BY_KEY['household.noIncomeSpouse'], subjectRole: 'couple', state: 'missing', facts: [], evidence: [], askable: true } as unknown as ItemStatus,
      { client: client(), taxYear: 2025, purpose: 'annual' });
    assert(p.input.kind === 'choice' && p.input.options.length === 5 && p.title.includes('ישראלה') && p.title.includes('2025'), JSON.stringify(p));
    equal(patchOf(plan(client(), 'household.noIncomeSpouse', 'retirement', 'couple')!.proposals[0]).spouseNoIncomeEligible, true);
    equal(patchOf(plan(client(), 'household.noIncomeSpouse', 'hadIncome', 'couple')!.proposals[0]).spouseNoIncomeEligible, false);
    equal(plan(client(), 'household.noIncomeSpouse', 'x', 'couple'), null);
    equal(calcCreditPoints(client({ spouseNoIncomeEligible: true }), 2025, 2904).filter(l => l.legalBasis === 'סעיף 37').length, 1);
  }),

  // ── מילואים ──
  test('מילואים כלוחם/ת (39ב): ריבוע מ-2026 ב«מה יכול להוריד לך מס?» ⇒ כמה ימים ⇒ האישור; הימים ⇒ reserveCombatDaysPrevYear', () => {
    const plan26 = (c: Client) => { const p = buildYearPicture({ client: c, taxYear: 2026, purpose: 'annual', today: '2027-03-01', facts: [], evidence: [], asks: [] });
      return buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2026, purpose: 'annual' }); };
    const sp = client({ spouse: { ...EMPTY_SPOUSE, gender: 'female', birthDate: '1988-01-01' } });
    for (const role of ['client', 'spouse']) {
      const g = plan26(sp).find(e => e.itemKey === ANNUAL_LESS_KEY && e.subjectRole === role);
      const o = g && g.prompt.input.kind === 'multi' ? g.prompt.input.options.find(x => x.key === 'household.reserveDuty') : undefined;
      assert(!!o && o.example === 'ב-2025' && !!o.hint, `${role}: ${JSON.stringify(o)}`);
      deepEqual(fus(o).map(f => `${f.itemKey}@${f.subjectRole}:${f.prompt.input.kind}`), [`household.reserveDays@${role}:record`, `household.reserveDocs@${role}:file`]);
    }
    // ‼ 25.10.2026 · ל-2025 אין נקודות — אבל ימי 2025 נותנים את הנקודות של 2026, ולכן שאלון 2025 שואל על 2025 עצמה
    const r25 = lessOf(sp).find(o => o.key === 'household.reserveDuty');
    assert(!!r25 && r25.example === 'ב-2025 · מוריד מס ב-2026', `2025: ${JSON.stringify(r25)}`);
    equal(fus(r25)[0]?.prompt.title, 'כמה ימי מילואים כלוחם היו לך ב-2025?');
    deepEqual(keys(client(), 'household.reserveDays', { items: [{ days: 45 }] }), ['reserveCombatDaysPrevYear']);
    deepEqual(patchOf(plan(sp, 'household.reserveDays', { items: [{ days: 45 }] }, 'spouse')!.proposals[0]).spouse, { reserveCombatDaysPrevYear: 45 });
    assert(calcCreditPoints(client({ familyStatus: 'single', reserveCombatDaysPrevYear: 45 }), 2026, 2904).some(l => /מילואים/.test(l.description)), 'נקודות מילואים');
  }),

  // ── ילד עם מוגבלות ──
  test('ילד עם מוגבלות (45): «השתנה» בילדים ⇒ איזה ילד ולמי הנקודות ⇒ hasDisability + disabilityPointsTo', () => {
    const c = client({ children: [{ id: 'k1', firstName: 'נוי', birthDate: '2016-01-01', birthYear: 2016, hasDisability: false }, { id: 'k2', firstName: 'טל', birthDate: '2019-01-01', birthYear: 2019, hasDisability: false }] as Client['children'] });
    const row = planFor(c).find(e => e.itemKey === 'household.children');
    const inline = row?.prompt.onChanged?.[0];
    const opt = inline && inline.prompt.input.kind === 'multi' ? inline.prompt.input.options.find(o => o.key === 'household.disabledChild') : undefined;
    const det = fus(opt).find(f => f.itemKey === 'household.disabledChildDetails');
    assert(!!det && det.prompt.input.kind === 'record' && det.prompt.input.schema === 'childDisability', JSON.stringify(fus(opt).map(f => f.itemKey)));
    // בדף האישי אין כרטיס — הילדים מהשאלה
    const sc = schemaFor('childDisability', undefined, det!.prompt.input.kind === 'record' ? det!.prompt.input.context : {});
    deepEqual(sc.fields.find(f => f.key === 'child')!.options!.map(o => o.label), ['נוי', 'טל']);
    deepEqual(Object.keys(validateRecord(sc, { child: 'k2' })), ['pointsTo']);
    const p = plan(c, 'household.disabledChildDetails', { items: [{ child: 'k2', pointsTo: 'spouse' }] }, 'couple')!;
    const kids = patchOf(p.proposals[0]).children as { id: string; hasDisability: boolean; disabilityPointsTo?: string }[];
    equal(kids.find(k => k.id === 'k2')?.hasDisability, true); equal(kids.find(k => k.id === 'k2')?.disabilityPointsTo, 'spouse');
    equal(kids.find(k => k.id === 'k1')?.hasDisability, false);
    // הוחל — אין שינוי
    equal(plan({ ...c, children: kids } as Client, 'household.disabledChildDetails', { items: [{ child: 'k2', pointsTo: 'spouse' }] }, 'couple')!.proposals.length, 0);
  }),

  // ── מזונות ילדים ──
  test('מזונות ילדים: «אני משלם/ת» בגירושין ⇒ כמה בחודש לכל ילד ⇒ Child.monthlyAlimonyPaid', () => {
    const c = client({ children: [{ id: 'k1', firstName: 'נוי', birthDate: '2016-01-01', birthYear: 2016, hasDisability: false }] as Client['children'] });
    const row = planFor(c).find(e => e.itemKey === 'household.maritalAtYearEnd');
    const inline = row?.prompt.onChanged?.[0];
    const div = inline && inline.prompt.input.kind === 'multi' ? inline.prompt.input.options.find(o => o.key === 'family.eventDivorce') : undefined;
    const rec = fus(div).find(f => f.itemKey === 'family.divorce');
    const ov = rec?.prompt.onValue?.find(v => v.field === 'alimony');
    assert(!!ov && ov.in.join() === 'pay' && ov.ask.itemKey === 'family.childSupport', JSON.stringify(rec?.prompt.onValue));
    const p = plan(c, 'family.childSupport', { items: [{ child: 'k1', monthly: 1800 }] }, 'couple')!;
    equal((patchOf(p.proposals[0]).children as { monthlyAlimonyPaid?: number }[])[0].monthlyAlimonyPaid, 1800);
    // «רק מזונות לבן/בת הזוג» — תשובה, לא חסר
    assert(schemaFor('childSupport').noneLabel !== undefined, 'אין «רק מזונות לבן/בת הזוג»');
  }),

  // ── ילדים: משמורת ──
  test('ילדים של הורה שאינו נשוי: «איפה גר/ה» ⇒ custody; שינוי במשמורת של ילד קיים — עדכון', () => {
    const div = client({ familyStatus: 'divorced', spouseFirstName: undefined });
    const add = plan(div, 'household.children', { items: [{ firstName: 'נועה', birthDate: '2015-04-01', livesWith: 'otherParent' }] })!;
    const kids = patchOf(add.proposals[0]).children as { custody?: string; livesWithTaxpayer?: boolean }[];
    equal(kids[0].custody, 'spouse'); equal(kids[0].livesWithTaxpayer, false);
    const has = client({ familyStatus: 'divorced', children: [{ id: 'k1', firstName: 'נועה', birthDate: '2015-04-01', birthYear: 2015, hasDisability: false, custody: 'spouse', livesWithTaxpayer: false }] as Client['children'] });
    const upd = plan(has, 'household.children', { items: [{ id: 'k1', firstName: 'נועה', birthDate: '2015-04-01', livesWith: 'withUs' }] })!;
    equal((patchOf(upd.proposals[0]).children as { custody: string }[])[0].custody, 'self');
    assert(upd.lines.some(l => l.includes('גר/ה: איתנו')), upd.lines.join(' | '));
    // אותה משמורת — אין שינוי; המשמורת מהתיק ממולאת
    equal(plan(has, 'household.children', { items: [{ id: 'k1', firstName: 'נועה', birthDate: '2015-04-01', livesWith: 'otherParent' }] })!.proposals.length, 0);
    equal(initialFromCard('children', has, 'couple')[0].livesWith, 'otherParent');
    // והחישוב: הילד אצלו ⇒ 40(ב)(2)
    const after = { ...has, children: patchOf(upd.proposals[0]).children } as Client;
    assert(calcCreditPoints(after, 2025, 2904).some(l => /החי בנפרד/.test(l.description)), 'נקודת ההורה שהילדים אצלו');
  }),

  test('המפה: הפריטים החדשים — רשומה בסכמה הנכונה; בדוח השנתי עם שנת הדוח בהקשר', () => {
    equal(RECORD_OF['household.aliyahDetails'], 'aliyah');
    equal(RECORD_OF['special.disabilityDetails'], 'disability');
    const p = promptFor({ item: ITEM_BY_KEY['household.aliyahDetails'], subjectRole: 'spouse', state: 'missing', facts: [], evidence: [], askable: true } as unknown as ItemStatus,
      { client: client({ spouse: { ...EMPTY_SPOUSE, isNewImmigrant: true, aliyahYear: 2023 } }), taxYear: 2025, purpose: 'annual' });
    assert(p.input.kind === 'record' && p.input.schema === 'aliyah' && p.input.context?.taxYear === '2025', JSON.stringify(p.input));
    // מה שבתיק — ממולא
    assert(p.input.kind === 'record' && p.input.initial?.[0]?.status === 'immigrant', JSON.stringify(p.input));
    // ‼ «כן» בריבוע ⇒ הפרטים, בשמו של האדם
    const o = lessOf(client({ spouse: { ...EMPTY_SPOUSE, gender: 'female' } }), 'spouse').find(x => x.key === 'household.aliyah');
    deepEqual(fus(o).map(f => `${f.itemKey}@${f.subjectRole}`), ['household.aliyahDetails@spouse', 'household.aliyahDocs@spouse']);
  }),
];
