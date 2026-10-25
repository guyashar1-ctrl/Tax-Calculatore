// ─── שאלון הדוח השנתי — פרקים לפי אדם (25.10.2026; docs/proposals/2026-10-25-annual-questionnaire-chapters.html) ─────────
// ‼ מה נעול כאן:
//   · הסדר: המשפחה ← הלקוח ← בן/בת הזוג. מין ותאריך הלידה של בן/בת הזוג פותחים את הפרק שלו/ה; העבודה פותחת את פרק האדם.
//   · תאריכי עבודה בחודשים של השנה («עד אוגוסט»), גם בשאלה שנשמרה לפני כן עם תאריכי ISO.
//   · «מאיפה עוד נכנס» — רק כשהמשכורת נשאלה במסך העבודה.
//   · «יש / אין» לפני הכרטיסים; בלי בחירה — אין תשובה.
//   · מילואים: נקודות מ-2026; מ-2028 הטבלה הקבועה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, employerWhen, gridTitle, workLineView, ANNUAL_GRID_KEY, type AskCtx } from '../asks';
import { withOneRound } from '../oneRound';
import { walkChapters, chapterOf } from '../flowDraft';
import { screenAsks } from '../screens';
import { answerValid, schemaFor } from '../records';
import { calcCreditPoints } from '../../../utils/taxCalculations';
import type { InfoAsk } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'ישראלי', familyStatus: 'married', spouseFirstName: 'ישראלה', gender: 'male', marriageYear: 2020, city: 'רמת גן', address: 'הרצל 10',
  children: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {},
  employers: [{ id: 'ni-1', name: 'כהן ושות׳', startDate: '2024-07-01', endDate: '2025-08-20' }, { id: 'ni-2', name: 'לוי', startDate: '2025-10-01' },
    { id: 'ni-3', name: 'פרי', startDate: '2022-02-01', belongsToSpouse: true }],
  bankAccounts: [{ id: 'b1', bankName: 'לאומי', bankCode: '10', branchNumber: '800', accountNumber: '4821', isPrimary: true }],
  spouse: { firstName: 'ישראלה' }, ...p,
} as unknown as Client);
const ctxOf = (c: Client): AskCtx => ({ client: c, taxYear: 2025, purpose: 'annual' });
let n = 0;
const published = (c: Client): InfoAsk[] => {
  const i: PictureInput = { client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-25', facts: [], evidence: [], asks: [] };
  const p = buildYearPicture(i);
  return withOneRound(buildAskPlan([...p.toConfirm, ...p.toAsk], ctxOf(c)), i, ctxOf(c)).map(e => ({ id: `a${++n}`, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p',
    itemKey: e.itemKey, subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt, state: 'published', createdAt: '2026-10-25' }) as InfoAsk);
};

export const TESTS: TestCase[] = [
  test('פרקים: המשפחה ← ישראל ← ישראלה; פרטי ישראלה פותחים את הפרק שלה; העבודה פותחת את פרק האדם', () => {
    const w = walkChapters(published(client()), new Set());
    const seq = w.map(x => x.chapter);
    // הפרקים רציפים ובסדר
    equal([...new Set(seq)].join(','), 'family,client,spouse');
    assert(seq.every((c, k) => k === 0 || ['family', 'client', 'spouse'].indexOf(c) >= ['family', 'client', 'spouse'].indexOf(seq[k - 1])), 'פרק חוזר אחורה');
    const first = (ch: string) => screenAsks(w.find(x => x.chapter === ch)!.screen);
    assert(first('family').some(a => a.itemKey === 'household.maritalAtYearEnd'), 'המשפחה לא פותחת');
    assert(!first('family').some(a => a.itemKey === 'salary.employers'), 'עבודה בפרק המשפחה');
    equal(first('client').map(a => `${a.itemKey}/${a.subjectRole}`).join(), 'salary.employers/client');
    equal(first('spouse')[0].itemKey, 'household.spouseBasics');
    equal(chapterOf({ itemKey: 'household.spouseBasics', subjectRole: 'couple' }), 'spouse');
    // הריבועים של כל אדם — בפרק שלו
    for (const x of w) for (const a of screenAsks(x.screen)) if (a.itemKey.startsWith('annual.')) equal(x.chapter, a.subjectRole);
  }),
  test('תאריכי עבודה: בחודשים של השנה, ו«לפי ביטוח לאומי» נפרד מהשורה — גם לשאלה שנשמרה עם תאריכי ISO', () => {
    equal(employerWhen('2024-07-01', '2025-08-20', 2025), 'עד אוגוסט');
    equal(employerWhen('2025-10-01', undefined, 2025), 'מאוקטובר');
    equal(employerWhen('2022-02-01', undefined, 2025), 'כל השנה');
    equal(employerWhen('2025-01-01', '2025-02-28', 2025), 'עד פברואר');
    equal(employerWhen('2025-03-01', '2025-05-31', 2025), 'מרץ עד מאי');
    equal(employerWhen('2020-01-01', '2023-06-30', 2025), 'הסתיים לפני 2025');
    equal(employerWhen(undefined, undefined, 2025), '');
    const legacy = workLineView('כהן ושות׳ · מ-2024-07-01 · עד 2025-08-20 · לפי ביטוח לאומי', 2025);
    equal(`${legacy.name}|${legacy.when}|${legacy.ni}`, 'כהן ושות׳|עד אוגוסט|true');
    const asks = published(client());
    const work = asks.find(a => a.itemKey === 'salary.employers' && a.subjectRole === 'client')!;
    if (work.prompt.input.kind !== 'confirm') throw new Error('לא אישור');
    equal(work.prompt.input.lines.map(l => workLineView(l, 2025).when).join(','), 'עד אוגוסט,מאוקטובר');
    assert(!work.prompt.input.lines.some(l => /\d{4}-\d{2}/.test(l)), 'תאריך ISO בשורה חדשה');
  }),
  test('«מאיפה עוד נכנס» — רק כשהמשכורת לא ריבוע (נשאלה במסך העבודה)', () => {
    equal(gridTitle(ANNUAL_GRID_KEY, 'מאיפה נכנס לך כסף ב-2025?', [{ key: 'pension.received' }]), 'מאיפה עוד נכנס לך כסף ב-2025?');
    equal(gridTitle(ANNUAL_GRID_KEY, 'מאיפה נכנס לך כסף ב-2025?', [{ key: 'salary.worked' }]), 'מאיפה נכנס לך כסף ב-2025?');
    const noJob = published(client({ employers: [] } as Partial<Client>)).find(a => a.itemKey === ANNUAL_GRID_KEY && a.subjectRole === 'client')!;
    equal(noJob.prompt.title, 'מאיפה נכנס לך כסף ב-2025?');
  }),
  test('«יש / אין» לפני הכרטיסים: לילדים, למעסיקים ולמזונות; בלי בחירה — אין תשובה', () => {
    equal(JSON.stringify(schemaFor('children').gate), JSON.stringify({ yes: 'יש', no: 'אין' }));
    equal(schemaFor('employer', undefined, { taxYear: '2025' }).gate?.no, 'לא היו');
    equal(schemaFor('employer', undefined, { taxYear: '2025', additionalEmployer: '1' }).gate?.yes, 'יש');
    assert(!!schemaFor('childSupport').gate, 'מזונות בלי שער');
    const kids = schemaFor('children');
    assert(!answerValid(kids, { items: [] }), 'בלי בחירה נחשב לתשובה');
    assert(answerValid(kids, { items: [], none: true }), '«אין» אינו תשובה');
  }),
  test('מילואים: אין נקודות ב-2025; 2026 — מ-30 ימים; מ-2028 הטבלה הקבועה (מ-20 ימים, עד 4)', () => {
    const pts = (days: number, y: number) => calcCreditPoints(client({ familyStatus: 'single', reserveCombatDaysPrevYear: days } as Partial<Client>), y, 2904)
      .filter(l => /מילואים/.test(l.description)).reduce((s, l) => s + l.points, 0);
    equal(pts(45, 2025), 0);
    equal(pts(25, 2026), 0);
    equal(pts(45, 2026), 0.75);
    equal(pts(55, 2026), 1.25);
    equal(pts(19, 2028), 0);
    equal(pts(20, 2028), 0.75);
    equal(pts(30, 2028), 1.25);
    equal(pts(85, 2028), 4);
    equal(pts(200, 2028), 4);
  }),
];
