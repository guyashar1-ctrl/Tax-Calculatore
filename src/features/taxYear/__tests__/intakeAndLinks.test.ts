// ─── קליטה, ישות חדשה, שאלה שאינה רלוונטית, מסמך שכבר בתיק, עדכון הכרטיס (12.10.2026) ──
// ‼ מה נעול כאן:
//   · קליטה בלי דוח שנתי: מה שבכרטיס — לאישור; מה שאין — שאלת פתיחה; כרטיס ריק — שאלה מובנית, לא «אין אצלנו פרטים».
//   · «כן» בלי ישות בתיק ⇒ ישות זמנית: פרטים ומסמך נשאלים מיד; לבן/בת הזוג — ישות משלו/ה.
//   · תשובה ששונתה ל«לא» ⇒ השאלות הפתוחות שנשענו עליה מסומנות «לא רלוונטיות» (לביטול, עם היסטוריה).
//   · מסמך קבוע שאושר (בכל שנה ובכל תהליך) — לא מתבקש שוב; מסמך לתקופה — כן.
//   · אישור תשובה ≠ עדכון הכרטיס: משימה גלויה עד שהכרטיס עודכן (הצעה) או סומן «עודכן בתיק».
//   · הצהרת המשך: מה שהוצהר בקודמת — מוצג, לא מועתק ליום החדש.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, fillTemplate } from '../asks';
import { previousFromFacts, mergePrevious } from '../wealthPrevious';
import type { Evidence, InfoAsk, YearFact } from '../types';
import { ITEMS } from '../catalog';
import annexInfo from '../../taxForms/data/annex-info-2025.json';

const TODAY = '2026-10-12';
const AS_OF = '2026-10-12';
let n = 0;
const id = () => `i${++n}`;
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const married = (p: Partial<Client> = {}) => client({ familyStatus: 'married', spouseFirstName: 'יאיר', spouse: { firstName: 'יאיר' } as Client['spouse'], ...p });
const fact = (p: Partial<YearFact> & Pick<YearFact, 'itemKey'>): YearFact => ({
  id: id(), clientId: 'c1', taxYear: 2026, subjectRole: 'client', periodKind: 'as_of', periodTo: AS_OF, answer: 'value', value: true,
  basis: 'actual', source: 'portal', status: 'accepted', createdAt: '2026-10-12T10:00:00Z', ...p,
});
const intake = (p: Partial<PictureInput> & { client: Client }) =>
  buildYearPicture({ taxYear: 2026, purpose: 'intake', asOfDate: AS_OF, today: TODAY, facts: [], evidence: [], asks: [], ...p });
const ctx = (c: Client) => ({ client: c, taxYear: 2026, purpose: 'intake' as const, asOfDate: AS_OF });
const ask = (p: Partial<InfoAsk> & Pick<InfoAsk, 'itemKey'>): InfoAsk => ({
  id: id(), clientId: 'c1', taxYear: 2026, stepId: 'info', parentStepId: 'intake', subjectRole: 'client',
  prompt: { title: 't', why: '', input: { kind: 'yesno' } }, state: 'published', createdAt: TODAY, ...p,
});
const keys = (l: { item: { key: string } }[]) => l.map(s => s.item.key);

export const TESTS: TestCase[] = [
  test('נספחים: לכל שדה שמקורו לקוח או מסמך — שאלה, מסמך ייעודי או משימת משרד (לא «מסמך כללי»)', () => {
    const covered = new Set(ITEMS.flatMap(i => i.covers?.annexItems ?? []));
    const known = new Set((annexInfo as { annexes: { items: { key: string }[] }[] }).annexes.flatMap(a => a.items.map(x => x.key)));
    const gaps = (annexInfo as { annexes: { items: { key: string; source?: string }[] }[] }).annexes.flatMap(a => a.items)
      .filter(x => /client|document/.test(String(x.source)) && !/identity|addressee|applicant|taxYear|worker|sellerIdentity/.test(x.key) && !covered.has(x.key));
    equal(gaps.map(g => g.key).join(', '), '');
    const unknown = [...covered].filter(k => !known.has(k));
    equal(unknown.join(', '), '', 'covers מפנה לשדה שאינו במיפוי');
  }),
  test('עסק עם רכב: «כן» לרכב ⇒ פרטי הרכב ורישיון ללקוח, הוצאות הרכב למשרד; «לא» ⇒ כלום מזה', () => {
    const c = client({ businesses: [{ id: 'b1', name: 'סטודיו' }] as Client['businesses'] });
    const yr = (p: Partial<YearFact> & Pick<YearFact, 'itemKey'>) => fact({ taxYear: 2025, periodKind: 'year', periodTo: '2025-12-31', ...p });
    const base = [yr({ itemKey: 'business.active' })];
    const yes = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', today: TODAY, facts: [...base, yr({ itemKey: 'business.vehicle', entityKind: 'business', entityRef: 'b1' })], evidence: [], asks: [] });
    const ask1 = keys(yes.toAsk);
    assert(ask1.includes('business.vehicleDetails') && ask1.includes('business.vehicleLicense'), ask1.join());
    assert(yes.officeTodo.some(s => s.item.key === 'business.vehicleExpenses' && s.entityRef === 'b1'), 'הוצאות הרכב לא אצל המשרד');
    const no = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', today: TODAY, facts: [...base, yr({ itemKey: 'business.vehicle', entityKind: 'business', entityRef: 'b1', value: false })], evidence: [], asks: [] });
    assert(![...no.toAsk, ...no.officeTodo].some(s => /^business.vehicle(Details|License|Expenses)$/.test(s.item.key)), '«לא» לרכב ועדיין נשאל');
    assert(keys(no.toAsk).includes('business.inventory') && keys(no.toAsk).includes('business.employees'), 'שאלות העסק לא נשאלות');
  }),
  test('קליטה, כרטיס ריק: שאלות פתיחה, בלי אישורי כרטיס ריקים; ילדים — שאלה מובנית', () => {
    const p = intake({ client: client() });
    const asked = keys(p.toAsk);
    for (const k of ['intake.employed', 'intake.selfEmployed', 'intake.rents', 'intake.foreign', 'intake.crypto'])
      assert(asked.includes(k), `לא נשאל: ${k}`);
    // 16.10.2026 · בהיכרות אין מסמכים; דוחות קודמים ועניינים פתוחים — יישור הקו עונה (משרד), לא הלקוח
    for (const k of ['intake.idCard', 'intake.payslip', 'intake.bankCert']) assert(!p.statuses.some(s => s.item.key === k), `מסמך בהיכרות: ${k}`);
    for (const k of ['intake.prevReturns', 'intake.openIssues']) assert(!asked.includes(k) && p.officeTodo.some(s => s.item.key === k), `לא אצל המשרד: ${k}`);
    for (const k of ['intake.employers', 'intake.business', 'intake.rentals', 'intake.investments', 'intake.funds', 'intake.settlement'])
      assert(!p.statuses.some(s => s.item.key === k), `אישור כרטיס ריק נשאל: ${k}`);
    assert(!p.statuses.some(s => s.item.key === 'intake.payslip' || s.item.key === 'intake.employerDetails'), 'פרטי מעסיק נשאלו לפני «כן»');
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], ctx(client()));
    const kids = plan.find(e => e.itemKey === 'intake.children')!;
    // 13.10.2026 · ילדים — רשומה מובנית (שם ותאריך לידה לכל ילד, «אין ילדים» כתשובה), לא תיבת טקסט
    equal(kids.prompt.input.kind, 'record');
    equal((kids.prompt.input as { schema?: string }).schema, 'children');
    assert(kids.prompt.title.includes('הילדים'), kids.prompt.title);
    assert(!!kids.prompt.hint, 'אין הסבר גלוי לשאלה');
    const fam = plan.find(e => e.itemKey === 'intake.family')!;
    equal(fam.prompt.input.kind, 'confirm');
  }),
  test('קליטה: «כן, עובדת כשכירה» בלי מעסיק בתיק ⇒ מעסיק חדש: שם המעסיק (השדה החופשי היחיד) נשאל מיד, בלי תלוש', () => {
    const yes = fact({ itemKey: 'intake.employed', status: 'pending' });
    const p = intake({ client: client(), facts: [yes] });
    const det = p.statuses.find(s => s.item.key === 'intake.employerDetails')!;
    assert(!!det && det.provisional && det.askable && det.entityRef === 'emp-new-client-intake', `פרטים: ${det?.state} ${det?.entityRef}`);
    assert(!p.statuses.some(s => s.item.key === 'intake.payslip'), 'תלוש נשאל בהיכרות (16.10.2026: בלי מסמכים)');
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], ctx(client()));
    const e = plan.find(x => x.itemKey === 'intake.employerDetails')!;
    assert(e && e.prompt.input.kind === 'entity' && e.prompt.input.spec.fields.some(f => f.type === 'name') && !e.prompt.input.spec.fields.some(f => f.type === 'who'), `ליחיד: שם בלי «של מי»: ${JSON.stringify(e?.prompt.input)}`);
  }),
  test('זוג: «כן» של בן הזוג בלבד ⇒ ישות זמנית שלו, עם שמו; הלקוחה — לא', () => {
    const c = married();
    const p = intake({ client: c, facts: [fact({ itemKey: 'intake.employed', subjectRole: 'spouse' }), fact({ itemKey: 'intake.employed', subjectRole: 'client', answer: 'no', value: undefined })] });
    const dets = p.statuses.filter(s => s.item.key === 'intake.employerDetails');
    equal(dets.length, 1);
    equal(dets[0].entityRef, 'emp-new-spouse-intake');
    equal(dets[0].subjectRole, 'spouse');
    assert(!!dets[0].entityLabel?.includes('יאיר'), `התווית בלי שם בן הזוג: ${dets[0].entityLabel}`);
  }),
  test('מעסיקים בכרטיס: לא שואלים «עובד כשכיר?» — מאשרים את הרשימה; בלי תלוש (מסמכים — בדוח)', () => {
    const c = married({ employers: [{ id: 'e1', name: 'אינטל' }, { id: 'e2', name: 'משרד החינוך', belongsToSpouse: true }] as Client['employers'] });
    const p = intake({ client: c });
    assert(!p.statuses.some(s => s.item.key === 'intake.employed'), 'נשאל «עובד כשכיר?» למרות המעסיקים בכרטיס');
    equal(p.statuses.filter(s => s.item.key === 'intake.employers' && s.state === 'fromCard').length, 2);
    assert(!p.statuses.some(s => s.item.key === 'intake.payslip'), 'תלוש נשאל בהיכרות');
    assert(!p.statuses.some(s => s.item.key === 'intake.employerDetails'), 'פרטי «מעסיק חדש» נשאלו כשיש מעסיק');
  }),
  test('תשובה ששונתה ל«לא» ⇒ שאלת המעסיק החדש שנשלחה «לא רלוונטית» — לביטול', () => {
    const yes = fact({ itemKey: 'intake.employed', status: 'rejected', createdAt: '2026-10-12T09:00:00Z' });
    const no = fact({ itemKey: 'intake.employed', answer: 'no', value: undefined, source: 'office', createdAt: '2026-10-12T11:00:00Z' });
    const sent = ask({ itemKey: 'intake.employerDetails', entityKind: 'employer', entityRef: 'emp-new-client-intake', prompt: { title: 'מעסיק', why: '', input: { kind: 'entity', spec: { noun: 'מעסיק', fields: [] } } } });
    const p = intake({ client: client(), facts: [yes, no], asks: [sent] });
    equal(p.stale.length, 1);
    equal(p.stale[0].ask!.id, sent.id);
    assert(!p.toAsk.some(s => s.item.key === 'intake.employerDetails'), 'המעסיק החדש עדיין נשאל');
    // והשאלה שבוטלה (state cancelled) — כבר לא «לא רלוונטית פתוחה»
    const p2 = intake({ client: client(), facts: [yes, no], asks: [{ ...sent, state: 'cancelled' }] });
    equal(p2.stale.length, 0);
  }),
  test('מסמך קבוע שכבר אושר (בכל שנה) — לא מתבקש שוב בדוח; בהיכרות מסמכים לא נשאלים כלל', () => {
    const degOld: Evidence = { id: 'ev1', clientId: 'c1', taxYear: 2024, docKind: 'degreeCert', subjectRole: 'client', receivedAt: '2024-05-01T00:00:00Z',
      receivedVia: 'portal', extraction: 'not_supported', identityMatch: 'match', periodMatch: 'match', review: 'accepted', reviewedAt: '2024-05-02T00:00:00Z' };
    const c = client();
    // כרטיס בלי תואר ⇒ «שינוי שמזכה» נשאל; «כן» פותח את אישור התואר — שכבר בתיק
    const p = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', today: TODAY, facts: [fact({ itemKey: 'household.creditChanges', taxYear: 2025, periodKind: 'year', periodTo: '2025-12-31' })], evidence: [], asks: [], priorEvidence: [degOld] });
    const deg = p.statuses.find(s => s.item.key === 'household.degreeDocs')!;
    assert(!!deg && deg.state === 'known' && !!deg.reusedEvidence && deg.detail.includes('לא מבקשים שוב'), `${deg?.state} ${deg?.detail}`);
    const pi = intake({ client: client({ employers: [{ id: 'e1', name: 'אינטל' }] as Client['employers'] }) });
    assert(!pi.statuses.some(s => s.item.kind === 'document'), 'מסמך בהיכרות (16.10.2026: מסמכים רק בדוח ובהצהרה)');
  }),
  test('אישור ≠ עדכון הכרטיס: כן/לא ובחירה ⇒ «עדכן בתיק»; שינוי במילים ⇒ «עודכן בתיק»; ישות חדשה ⇒ «הוסף לתיק»', () => {
    const c = client({ hasCrypto: false } as Partial<Client>);
    const crypto = fact({ itemKey: 'intake.crypto', subjectRole: 'couple' });
    const kids = fact({ itemKey: 'intake.children', subjectRole: 'couple', value: 'יואב 2019, נועם 2022' });
    const fam = fact({ itemKey: 'intake.family', subjectRole: 'couple', value: 'married' });
    const yes = fact({ itemKey: 'intake.employed' });
    const det = fact({ itemKey: 'intake.employerDetails', entityKind: 'employer', entityRef: 'emp-new-client-intake', value: 'אינטל, מ-2024' });
    const p = intake({ client: c, facts: [crypto, kids, fam, yes, det] });
    const t = (k: string) => p.statuses.find(s => s.item.key === k)!.officeTask;
    assert(t('intake.crypto')?.kind === 'cardFlag' && (t('intake.crypto') as { value: boolean }).value === true, JSON.stringify(t('intake.crypto')));
    assert(t('intake.family')?.kind === 'cardChoice', JSON.stringify(t('intake.family')));
    assert(t('intake.children')?.kind === 'cardEdit', JSON.stringify(t('intake.children')));
    const add = t('intake.employerDetails') as { kind: string; entityRef: string };
    assert(add?.kind === 'addEntity' && add.entityRef === 'emp-new-client-intake', JSON.stringify(add));
    for (const k of ['intake.crypto', 'intake.family', 'intake.children', 'intake.employerDetails']) assert(p.officeTodo.some(s => s.item.key === k), `לא ב«להשלים במשרד»: ${k}`);
    // אחרי העדכון: הכרטיס אומר את אותו דבר (ונרשם שנבדק) / סומן «עודכן בתיק» / הישות בכרטיס — המשימות נעלמות
    const done = fact({ itemKey: 'intake.children', subjectRole: 'couple', source: 'office', value: { cardUpdated: true }, createdAt: '2026-10-12T12:00:00Z', decidedAt: '2026-10-12T12:00:00Z' });
    const c2 = client({ hasCrypto: true, familyStatus: 'married', fieldMeta: { hasCrypto: { source: 'questionnaire' } }, employers: [{ id: 'emp-new-client-intake', name: 'אינטל' }] } as Partial<Client>);
    const p2 = intake({ client: c2, facts: [crypto, kids, done, fam, yes, det] });
    for (const k of ['intake.crypto', 'intake.family', 'intake.children', 'intake.employerDetails'])
      assert(!p2.statuses.find(s => s.item.key === k)?.officeTask, `המשימה נשארה: ${k} ${JSON.stringify(p2.statuses.find(s => s.item.key === k)?.officeTask)}`);
  }),
  test('«לא» לכרטיס שנולד עם false: עדכון רק כשלא נרשם שנבדק («לא ידוע» ≠ «אין»)', () => {
    const no = fact({ itemKey: 'intake.crypto', subjectRole: 'couple', answer: 'no', value: undefined });
    const p = intake({ client: client({ hasCrypto: false } as Partial<Client>), facts: [no] });
    const task = p.statuses.find(s => s.item.key === 'intake.crypto')!.officeTask as { kind: string; value: boolean };
    assert(task?.kind === 'cardFlag' && task.value === false, JSON.stringify(task));
    const p2 = intake({ client: client({ hasCrypto: false, fieldMeta: { hasCrypto: { source: 'manual' } } } as Partial<Client>), facts: [no] });
    assert(!p2.statuses.find(s => s.item.key === 'intake.crypto')!.officeTask, 'משימה מיותרת כשהכרטיס כבר יודע «אין»');
  }),
  test('ניסוח ללקוח: «לך» ו«שלך» במקום «לאת/ה» ו«של את/ה»; לבן הזוג — בשמו; כל המופעים', () => {
    const c = married();
    equal(fillTemplate('האם ל{name} יש חשבון?', c, 'client'), 'האם לך יש חשבון?');
    equal(fillTemplate('צילום תעודת הזהות של {name}, עם הספח', c, 'client'), 'צילום תעודת הזהות שלך, עם הספח');
    equal(fillTemplate('האם {name} עלה/תה, או שיש ל{name} נכות?', c, 'spouse'), 'האם יאיר עלה/תה, או שיש ליאיר נכות?');
    equal(fillTemplate('האם ל{name} יש?', c, 'couple'), 'האם לכם יש?');
  }),
  test('דוח שנתי: מכירת ני״ע דרך ברוקר בחו״ל ⇒ דוח עסקאות לכל מכירה מהמקור (גם מקור חדש)', () => {
    const c = client({ foreignAccounts: [{ id: 'f1', institutionName: 'Interactive Brokers', country: 'ארה״ב' }] as Client['foreignAccounts'] });
    const facts = [fact({ itemKey: 'foreign.income', taxYear: 2025, periodKind: 'year', periodTo: '2025-12-31' }), fact({ itemKey: 'foreign.securitiesSold', taxYear: 2025, periodKind: 'year', periodTo: '2025-12-31' })];
    const p = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', today: TODAY, facts, evidence: [], asks: [] });
    const tr = p.statuses.find(s => s.item.key === 'foreign.tradeReport' && s.entityRef === 'f1')!;
    assert(!!tr && tr.askable, `דוח העסקאות לא מתבקש: ${tr?.state}`);
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2025, purpose: 'annual' });
    assert(plan.some(e => e.itemKey === 'foreign.tradeReport' && e.prompt.why.includes('Closed Lots')), 'ההסבר לא אומר איך מוציאים את הדוח מהברוקר');
    assert(p.toAsk.some(s => s.item.key === 'foreign.taxCert' && s.entityRef === 'f1'), 'אישור המס הזר לא מתבקש');
    assert(p.officeTodo.some(s => s.item.key === 'foreign.amounts' && s.entityRef === 'f1'), 'הסכומים מהדוחות לא אצל המשרד');
  }),
  test('הצהרת המשך: מה שאושר בהצהרה הקודמת — סיכום לפי תחום, ליום הקודם בלבד; סכום שהוקלד — רק כשאין', () => {
    const prev = '2023-12-31';
    const facts: YearFact[] = [
      fact({ itemKey: 'wealth.realEstate.total', subjectRole: 'couple', taxYear: 2023, periodTo: prev, value: 1_250_000 }),
      fact({ itemKey: 'wealth.bank.accounts', subjectRole: 'couple', taxYear: 2023, periodTo: prev, value: 'לאומי, דיסקונט' }),
      fact({ itemKey: 'wealth.cash', subjectRole: 'couple', taxYear: 2023, periodTo: '2022-12-31', value: 9_000 }),
      fact({ itemKey: 'wealth.securities.total', subjectRole: 'couple', taxYear: 2023, periodTo: prev, value: 50_000, status: 'pending' }),
    ];
    const m = previousFromFacts(facts, prev);
    assert(m.wRealEstate?.includes('1,250,000') || m.wRealEstate?.includes('1,250,000'.replace(/,/g, ',')), JSON.stringify(m));
    equal(m.wBank, 'לאומי, דיסקונט');
    assert(!m.wCash, 'עובדה מיום אחר נכנסה');
    assert(!m.wSecurities, 'עובדה שלא אושרה נכנסה');
    const merged = mergePrevious(m, { wRealEstate: '999 ₪', wFunds: '300,000 ₪' })!;
    assert(merged.wRealEstate.includes('1,250,000') && merged.wFunds === '300,000 ₪', JSON.stringify(merged));
  }),
  test('הפרדה: תשובות הקליטה לא נכנסות לתמונת הדוח השנתי, ולהפך', () => {
    const intakeYes = fact({ itemKey: 'intake.employed' });
    const annual = buildYearPicture({ client: client(), taxYear: 2026, purpose: 'annual', today: TODAY, facts: [intakeYes], evidence: [], asks: [] });
    assert(!annual.statuses.some(s => s.item.key.startsWith('intake.')), 'פריט קליטה בדוח השנתי');
    const yearYes = fact({ itemKey: 'salary.worked', periodKind: 'year', periodTo: '2026-12-31' });
    const p = intake({ client: client(), facts: [yearYes] });
    assert(!p.statuses.some(s => !s.item.key.startsWith('intake.')), 'פריט שנה בקליטה');
    assert(!p.statuses.some(s => s.item.key === 'intake.payslip'), 'תשובה לשנה פתחה תלוש בקליטה');
  }),
];
