// ─── שאלון הדוח השנתי — מחדש (20.10.2026; docs/proposals/2026-10-20-annual-questionnaire-v2.html) ─────────────
// ‼ מה נעול כאן:
//   · טיוטה עד «שליחה»: מה שהלקוח סימן פותח את ההמשך בדפדפן (בלי שום דבר שנשלח), ביטול סימון — ההמשך נעלם.
//   · בשליחה נשלחות רק שאלות אמיתיות; ההמשך נשלח בסבב הבא, אחרי שהשרת פתח אותו (אותה זהות).
//   · ביטוח לאומי: «מה שולם?» לכל אדם; «דמי לידה» רק אם סומן — ואין «דמי לידה?» לאלמן. האישור — המשרד.
//   · בלי לוכסנים לפי המין שבכרטיס; «שינוי במשפחה ב-{שנה}», ו«מה כבר ידוע לנו» לפני הריבועים.
//   · מעסיק בשנת הדוח: «עדיין שם» הוא תשובה, חודש מחוץ לשנה — לא.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, ANNUAL_GRID_KEY, ANNUAL_LESS_KEY, type AskCtx } from '../asks';
import { withOneRound } from '../oneRound';
import { askIdentity, draftToAnswer, expandWithDrafts, readyToSend, answerText, type Draft } from '../flowDraft';
import { genderize, genderOf } from '../gender';
import { schemaFor, validateRecord, monthInText } from '../records';
import type { InfoAsk } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'דני', lastName: 'כהן', familyStatus: 'married', spouseFirstName: 'נועה', gender: 'male', marriageYear: 2023,
  children: [{ firstName: 'א', birthYear: 2019 }], employers: [{ id: 'e1', name: 'אינטל' }, { id: 'e2', name: 'משרד החינוך', belongsToSpouse: true }],
  businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const pin = (c: Client): PictureInput => ({ client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-20', facts: [], evidence: [], asks: [] });
const ctxOf = (c: Client): AskCtx => ({ client: c, taxYear: 2025, purpose: 'annual' });
const planFor = (c: Client) => { const i = pin(c); const p = buildYearPicture(i); return withOneRound(buildAskPlan([...p.toConfirm, ...p.toAsk], ctxOf(c)), i, ctxOf(c)); };
let n = 0;
/** השאלות כפי שהן אחרי פרסום — רק מה שבתוכנית (השרת יוצר את ההמשך רק בשליחה). */
const published = (c: Client): InfoAsk[] => planFor(c).map(e => ({ id: `a${++n}`, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p', itemKey: e.itemKey,
  subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt, state: 'published', createdAt: '2026-10-20' }) as InfoAsk);

export const TESTS: TestCase[] = [
  test('טיוטה: סימון «ביטוח לאומי» במסך של כל אחד פותח «מה שולם?» שלו — בדפדפן, ושום דבר לא «מוכן לשליחה» חוץ מהשאלות האמיתיות', () => {
    const asks = published(client());
    const grid = asks.find(a => a.itemKey === ANNUAL_GRID_KEY && a.subjectRole === 'client')!;
    const grid2 = asks.find(a => a.itemKey === ANNUAL_GRID_KEY && a.subjectRole === 'spouse')!;
    const drafts: Record<string, Draft> = { [askIdentity(grid)]: { selected: ['niBenefits.received'] }, [askIdentity(grid2)]: { selected: ['niBenefits.received'] } };
    const ex = expandWithDrafts(asks, drafts);
    const kinds = ex.filter(a => a.itemKey === 'niBenefits.kinds');
    equal(kinds.map(a => a.subjectRole).join(','), 'client,spouse');
    equal(expandWithDrafts(asks, { [askIdentity(grid)]: { selected: ['niBenefits.received'] } }).filter(a => a.itemKey === 'niBenefits.kinds').map(a => a.subjectRole).join(','), 'client');
    assert(kinds.every(a => a.id.startsWith('v:')), 'וירטואליות עד השליחה');
    assert(!ex.some(a => a.itemKey === 'niBenefits.cert' || a.itemKey === 'niBenefits.maternity'), 'אין אישור ב״ל ואין «דמי לידה?» לבד');
    // ביטול הסימון ⇒ ההמשך נעלם
    equal(expandWithDrafts(asks, { [askIdentity(grid)]: { selected: [] , none: true }, [askIdentity(grid2)]: { selected: [], none: true } }).filter(a => a.itemKey === 'niBenefits.kinds').length, 0);
    // בשליחה: רק אמיתיות (הרשת וכו׳) — «מה שולם?» נשלח בסבב הבא, אחרי שהשרת פתח אותה
    const ready = readyToSend(ex, { ...drafts, [askIdentity(kinds[0])]: { selected: ['niBenefits.maternity'] } });
    assert(ready.some(r => r.ask.id === grid.id) && !ready.some(r => r.ask.id.startsWith('v:')), 'נשלחות רק אמיתיות');
    // הסבב הבא: השרת פתח — אותה זהות, התשובה מהטיוטה
    const real = { ...kinds[0], id: 'real-1' };
    const after = readyToSend([...asks.map(a => (a.id === grid.id ? { ...a, state: 'answered' as const } : a)), real], { ...drafts, [askIdentity(kinds[0])]: { selected: ['niBenefits.maternity'] } });
    equal(after.find(r => r.ask.id === 'real-1')?.answer.kind, 'multi');
  }),
  test('«מה שולם?»: «דמי לידה» היא העובדה niBenefits.maternity (כמו התשובה הישנה), ותצוגה קצרה בסיכום', () => {
    const asks = published(client());
    const grid = asks.find(a => a.itemKey === ANNUAL_GRID_KEY && a.subjectRole === 'spouse')!;
    const k = expandWithDrafts(asks, { [askIdentity(grid)]: { selected: ['niBenefits.received'] } }).find(a => a.itemKey === 'niBenefits.kinds' && a.subjectRole === 'spouse')!;
    assert(k.prompt.input.kind === 'multi' && k.prompt.input.options.some(o => o.key === 'niBenefits.maternity' && o.role === 'spouse'), 'אפשרות דמי לידה לבת הזוג');
    equal(answerText(k, { selected: ['niBenefits.maternity'] }), 'דמי לידה');
    equal(k.prompt.subjectName, 'נועה');
  }),
  test('סבב 2 · ריבועים: לכל אדם «מאיפה נכנס כסף» ו«מה מוריד מס», עם שם, דוגמה ו«?»; «מה כבר ידוע לנו» לפני הריבועים', () => {
    const plan = planFor(client());
    const grid = plan.find(e => e.itemKey === ANNUAL_GRID_KEY && e.subjectRole === 'client')!;
    const less = plan.find(e => e.itemKey === ANNUAL_LESS_KEY && e.subjectRole === 'spouse')!;
    if (grid.prompt.input.kind !== 'multi' || less.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    equal(grid.prompt.title, 'מאיפה נכנס לך כסף ב-2025?');
    equal(less.prompt.title, 'מה יכול להוריד לנועה מס?');
    equal(less.prompt.subjectName, 'נועה');
    equal(grid.prompt.subjectName, 'דני');
    assert(!grid.prompt.input.options.some(o => o.key === 'household.familyChange'), '«שינוי במשפחה» הוא שורה, לא ריבוע');
    equal(grid.prompt.input.options.find(o => o.key === 'pension.received')?.label, 'פנסיה או קצבה');
    equal(grid.prompt.input.options.find(o => o.key === 'pension.received')?.hint, 'תשלום חודשי. סכום חד-פעמי — ב«משיכה מקופה».');
    equal(less.prompt.input.options.find(o => o.key === 'savings.selfDeposits')?.group, 'less');
    equal(less.prompt.input.options.find(o => o.key === 'household.creditChanges')?.example, 'מ-2020');
    // ‼ 22.10.2026 · בלי טקסט חופשי: «משהו אחר?» הוחלף בריבוע «הכנסה אחרת»
    assert(!grid.prompt.otherNote && !less.prompt.otherNote, 'נשאר «משהו אחר?» בטקסט חופשי');
    assert(grid.prompt.input.options.some(o => o.key === 'income.other'), 'אין ריבוע «הכנסה אחרת»');
    const known = Object.fromEntries(grid.prompt.known ?? []);
    equal(known['מצב משפחתי'], 'נשואים מ-2023');
    equal(known['נועה'], 'משרד החינוך');
    equal(grid.prompt.addressee, 'p');
  }),
  test('בלי לוכסנים: לפי המין שבכרטיס; בן/בת הזוג — ההפך כשלא רשום; ילד/ה — לא נוגעים', () => {
    equal(genderize('האם {x} קיבל/ה דמי לידה? את/ה נשוי/אה', 'f'), 'האם {x} קיבלה דמי לידה? את נשואה');
    equal(genderize('מתי רחל נפטר/ה?', 'f'), 'מתי רחל נפטרה?');
    equal(genderize('עובד/ת · לא בטוח/ה · ילד/ה', 'm'), 'עובד · לא בטוח · ילד/ה');
    equal(genderize('נפטר/ה', undefined), 'נפטר/ה');
    equal(genderOf(client(), 'spouse'), 'f');
    equal(genderOf(client({ gender: 'female' } as Partial<Client>), 'client'), 'f');
  }),
  test('מעסיק בשנת הדוח: «עדיין שם» = סיום ריק ותקין; חודש מחוץ לשנה — שגיאה; הסיום לא לפני ההתחלה', () => {
    const s = schemaFor('employer', undefined, { taxYear: '2025' });
    equal(s.fields.find(f => f.key === 'startDate')?.type, 'monthIn');
    equal(Object.keys(validateRecord(s, { name: 'המדינה', startDate: { precision: 'month', date: '2025-03-01' } })).length, 0);
    equal(validateRecord(s, { name: 'המדינה', startDate: { precision: 'month', date: '2026-10-01' } }).startDate, 'רק חודש ב-2025');
    equal(validateRecord(s, { name: 'א', startDate: { precision: 'month', date: '2025-05-01' }, endDate: { precision: 'month', date: '2025-02-01' } }).endDate, 'הסיום לפני ההתחלה');
    equal(monthInText(undefined, 2025, 'end'), 'עדיין שם');
    equal(monthInText({ precision: 'unknown' }, 2025, 'start'), 'לפני 2025');
    // בלי שנת דוח (היכרות) — כמו קודם
    equal(schemaFor('employer').fields.find(f => f.key === 'startDate')?.type, 'dated');
  }),
  test('לקוח חדש בלי «קליטה»: הערכת מס שואלת כתובת וילדים כשחסרים בכרטיס (רשומה), ומראה אותם לאישור כשקיימים', () => {
    const empty = client({ children: [], city: undefined, address: undefined } as Partial<Client>);
    const i = { client: empty, taxYear: 2026, purpose: 'estimate' as const, today: '2026-10-21', facts: [], evidence: [], asks: [] };
    const p = buildYearPicture(i);
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], { client: empty, taxYear: 2026, purpose: 'estimate', cutoffMonth: 9 });
    const kinds = Object.fromEntries(plan.map(e => [e.itemKey, e.prompt.input.kind]));
    equal(kinds['household.address'], 'record');
    equal(kinds['household.children'], 'record');
    const full = client({ city: 'חיפה', address: 'הרצל 1' } as Partial<Client>);
    const p2 = buildYearPicture({ ...i, client: full });
    const plan2 = buildAskPlan([...p2.toConfirm, ...p2.toAsk], { client: full, taxYear: 2026, purpose: 'estimate', cutoffMonth: 9 });
    equal(plan2.find(e => e.itemKey === 'household.address')?.prompt.input.kind, 'confirm');
  }),
  test('«משכורת» לזוג בלי מעסיק בתיק: טופס 106 אחד למעסיק החדש — לא עוד אחד «של הלקוח» (הכפילות אצל דין)', () => {
    const grid = planFor(client({ employers: [] } as Partial<Client>)).find(e => e.itemKey === ANNUAL_GRID_KEY)!;
    if (grid.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    const o = grid.prompt.input.options.find(x => x.key === 'salary.worked')!;
    const all = (o.followUps ?? []).flatMap(f => [f, ...(f.prompt.onYes ?? [])]);
    equal(all.filter(f => f.itemKey === 'salary.form106').length, 1);
    assert(all.some(f => f.itemKey === 'salary.employerDetails'), 'פרטי המעסיק החדש נשאלים');
  }),
  test('אלמן: מסכי ריבועים רק ללקוח; «נכון» בשורת המשפחה פותח את ענף הפטירה; נכות של מי שנפטרה — בענף', () => {
    const c = client({ familyStatus: 'widowed', widowhoodYear: 2025, gender: 'male', spouseFirstName: 'רחל' } as Partial<Client>);
    const plan = planFor(c);
    equal(plan.filter(e => e.itemKey === ANNUAL_GRID_KEY || e.itemKey === ANNUAL_LESS_KEY).map(e => e.subjectRole).join(','), 'client,client');
    const grid = plan.find(e => e.itemKey === ANNUAL_GRID_KEY)!;
    if (grid.prompt.input.kind !== 'multi') throw new Error('אין רשת');
    const ni = grid.prompt.input.options.find(o => o.key === 'niBenefits.received')!;
    equal((ni.followUps ?? []).map(f => `${f.itemKey}@${f.subjectRole}`).join(','), 'niBenefits.kinds@client');
    const fam = plan.find(e => e.itemKey === 'household.maritalAtYearEnd')!;
    const income = (fam.prompt.onYes ?? []).find(f => f.itemKey === 'family.deathIncome')!;
    assert(income.prompt.input.kind === 'multi' && income.prompt.input.options.some(o => o.key === 'special.disability' && o.role === 'spouse'), 'נכות של רחל בענף');
    assert(income.prompt.input.kind === 'multi' && !income.prompt.input.options.some(o => (o.followUps ?? []).some(f => f.itemKey === 'niBenefits.cert')), 'אישור ב״ל לא מהלקוח');
    assert(!/\//.test(income.prompt.title), income.prompt.title);
    // התשובה מהטיוטה תקינה רק כשסומן משהו
    equal(draftToAnswer({ ...grid, id: 'g' } as unknown as InfoAsk, {}), null);
  }),
];
