// ─── מה שרשום בביטוח לאומי בשאלון (26.10.2026; גיא: «הוא לא צריך לדעת שזה לפי ביטוח לאומי») ─────────────────────
// ‼ מה נעול כאן (לקוח כמו יובל: סטודנט 10.2023–09.2026, עצמאי מ-06.2025, בלי עסק ובלי מעסיק בכרטיס):
//   · «עסק או חשבוניות» מסומן מראש — בלי הערה ובלי המילה «ביטוח לאומי» אצל הלקוח; עם עסק בכרטיס — לא.
//   · הריבוע של הלימודים: «סיום התואר», והמסך: «מתי סיימת את התואר?» עם «תואר» כבר נבחר.
//   · במשרד: «לברר» רק כשהתשובה סותרת את הרישום; המקור — רק במשרד.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, ANNUAL_GRID_KEY, ANNUAL_LESS_KEY, type AskCtx } from '../asks';
import type { MultiOption, YearFact } from '../types';
import { niOfficeChecks, niSelfEmployedSince, niStudentUntil } from '../niRegistrations';
import { materialsOf } from '../../annualReturn/workspace';
import { ITEM_BY_KEY } from '../catalog';
import type { ItemStatus } from '../picture';

const yuval = (p: Partial<Client> = {}): Client => ({
  id: 'y1', firstName: 'יובל', lastName: 'גרוסמן', familyStatus: 'single', gender: 'male', city: 'תל אביב', address: 'הרצל 1',
  children: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], employers: [], fieldMeta: {},
  niOccupations: [
    { id: 'o1', type: 'student', source: 'btl_portal', sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2023-10-01', toDate: '2026-09-30' },
    { id: 'o2', type: 'self_employed', source: 'btl_portal', sourceLabel: 'עצמאי', fromDate: '2025-06-01' },
  ], ...p,
} as unknown as Client);
const ctxOf = (c: Client): AskCtx => ({ client: c, taxYear: 2025, purpose: 'annual' });
const plan = (c: Client) => {
  const i: PictureInput = { client: c, taxYear: 2025, purpose: 'annual', today: '2026-10-26', facts: [], evidence: [], asks: [] };
  const p = buildYearPicture(i);
  return buildAskPlan([...p.toConfirm, ...p.toAsk], ctxOf(c));
};
const opts = (c: Client, key: string): MultiOption[] => {
  const e = plan(c).find(x => x.itemKey === key && x.subjectRole === 'client');
  return e && e.prompt.input.kind === 'multi' ? e.prompt.input.options : [];
};
const fact = (itemKey: string, p: Partial<YearFact>): YearFact => ({ id: itemKey, clientId: 'y1', taxYear: 2025, itemKey, subjectRole: 'client', periodKind: 'year',
  answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'accepted', createdAt: '2026-10-26', ...p } as YearFact);

export const TESTS: TestCase[] = [
  test('הרישום לשנת הדוח: עצמאי מ-06.2025, סטודנט עד 30.09.2026; עם עסק בכרטיס — אין «עצמאי בלי עסק»', () => {
    equal(niSelfEmployedSince(yuval(), 'client', 2025), '2025-06-01');
    equal(niStudentUntil(yuval(), 'client', 2025), '2026-09-30');
    equal(niSelfEmployedSince(yuval(), 'client', 2024), undefined);
    equal(niSelfEmployedSince(yuval({ businesses: [{ id: 'b1', name: 'יובל הפקות' }] } as Partial<Client>), 'client', 2025), undefined);
  }),
  test('«עסק או חשבוניות» מסומן מראש — בלי הערה ובלי «ביטוח לאומי» אצל הלקוח; בלי רישום — לא מסומן', () => {
    const biz = opts(yuval(), ANNUAL_GRID_KEY).find(o => o.key === 'business.started');
    assert(!!biz, 'אין ריבוע «עסק»');
    equal(biz!.preset, true);
    assert(!biz!.note && !JSON.stringify(biz).includes('ביטוח לאומי'), JSON.stringify(biz));
    const plain = opts(yuval({ niOccupations: [] } as Partial<Client>), ANNUAL_GRID_KEY).find(o => o.key === 'business.started');
    assert(!plain?.preset, 'מסומן בלי רישום');
  }),
  test('סטודנט: «סיום התואר», והמסך — «מתי סיימת את התואר?» עם «תואר» כבר נבחר; בלי רישום — כמו קודם', () => {
    const st = opts(yuval(), ANNUAL_LESS_KEY).find(o => o.key === 'household.creditChanges');
    equal(st?.label, 'סיום התואר');
    const fu = st!.followUps![0];
    equal(fu.prompt.title, 'מתי סיימת את התואר?');
    assert(fu.prompt.input.kind === 'record' && JSON.stringify(fu.prompt.input.initial) === JSON.stringify([{ kind: 'ba' }]), JSON.stringify(fu.prompt.input));
    assert(!JSON.stringify(st).includes('ביטוח לאומי') && !JSON.stringify(st).includes('סטודנט'), 'המקור דלף ללקוח');
    const plain = opts(yuval({ niOccupations: [] } as Partial<Client>), ANNUAL_LESS_KEY).find(o => o.key === 'household.creditChanges');
    equal(plain?.label, 'סיום לימודים או צבא');
  }),
  test('במשרד: «לברר» רק כשהתשובה סותרת — עצמאי וענה «לא»; סיים תואר ב-2025 ועדיין רשום כסטודנט', () => {
    equal(niOfficeChecks(yuval(), [], 2025).length, 0);
    const no = niOfficeChecks(yuval(), [fact('business.started', { answer: 'no', value: undefined })], 2025);
    equal(no.map(x => x.key).join(), 'niSelfEmployed-client');
    assert(no[0].sub.includes('06.2025'), no[0].sub);
    equal(niOfficeChecks(yuval(), [fact('business.started', { value: true })], 2025).length, 0);
    const deg = niOfficeChecks(yuval(), [fact('household.studies', { value: { items: [{ kind: 'ba', year: '2025' }] } })], 2025);
    equal(deg.map(x => x.key).join(), 'niStudent-client');
    equal(niOfficeChecks(yuval(), [fact('household.studies', { value: { items: [{ kind: 'army', year: '2025' }] } })], 2025).length, 0);
  }),
  test('במשרד: שורת רווח והפסד — עם המקור «לפי ביטוח לאומי: עצמאי מ-06.2025»', () => {
    const s = { item: ITEM_BY_KEY['business.startedDocs'], subjectRole: 'client', state: 'missing' } as unknown as ItemStatus;
    const m = materialsOf({ client: yuval(), year: 2025, stepId: 'r', asks: [], evidence: [], facts: [], statuses: [s] });
    assert((m[0].sub ?? '').startsWith('לפי ביטוח לאומי: עצמאי מ-06.2025'), m[0].sub ?? '');
  }),
];
