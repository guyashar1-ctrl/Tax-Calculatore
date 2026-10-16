// ─── ממתי המצב המשפחתי — שאלה ללקוח בקליטה (16.10.2026) ─────────────────────────────
// ‼ מה נעול:
//   · השאלה נשאלת רק למצב הנוכחי (תשובת הלקוח בקליטה קודמת לכרטיס), ורק כשבכרטיס אין שנה.
//   · כשיש שנה — היא חלק מאישור «המצב המשפחתי» («נשוי מ-2015»), לא שאלה נוספת.
//   · תשובה ⇒ «אשר ועדכן בתיק» (הצעה עם הערך הקודם). אושרה בלי לעדכן ⇒ משימת משרד «רשום שנה»; נעלמת כשהכרטיס אומר אותה שנה.
//   · ‼ השנים — עובדות מנוהלות בשני הצדדים (249ג + GOVERNED_FACT_KEYS); בלי אחד מהם עריכה רגילה נכשלת.
//   · השנה: ארבע ספרות, לא עתידית, לא לפני 1930 — אותו כלל כמו בתיק המס (utils/familyStatusYear.ts).

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture } from '../picture';
import { cardLines } from '../asks';
import { ITEM_BY_KEY } from '../catalog';
import { schemaFor, validateRecord } from '../records';
import { cardUpdateFor, updatesCard } from '../recordToCard';
import { GOVERNED_FACT_KEYS, GOVERNED_FIELD_LABELS } from '../../../types/taxFacts';
import type { YearFact } from '../types';

const AS_OF = '2026-10-16';
let n = 0;
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', gender: 'female', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const fact = (p: Partial<YearFact> & Pick<YearFact, 'itemKey'>): YearFact => ({
  id: `f${++n}`, clientId: 'c1', taxYear: 2026, subjectRole: 'couple', periodKind: 'as_of', periodTo: AS_OF, answer: 'value', value: true,
  basis: 'actual', source: 'portal', status: 'accepted', createdAt: '2026-10-16T10:00:00Z', ...p,
});
const intake = (c: Client, facts: YearFact[] = []) =>
  buildYearPicture({ client: c, taxYear: 2026, purpose: 'intake', asOfDate: AS_OF, today: AS_OF, facts, evidence: [], asks: [] });
const YEAR_KEYS = ['intake.marriageYear', 'intake.divorceYear', 'intake.widowhoodYear'];
const asked = (p: ReturnType<typeof intake>) => p.statuses.filter(s => YEAR_KEYS.includes(s.item.key)).map(s => s.item.key);

export const TESTS: TestCase[] = [
  test('שנה חסרה ⇒ נשאלת רק השנה של המצב; רווק/ה והורה יחיד — לא נשאל', () => {
    deepEqual(asked(intake(client({ familyStatus: 'married' }))), ['intake.marriageYear']);
    deepEqual(asked(intake(client({ familyStatus: 'divorced' }))), ['intake.divorceYear']);
    deepEqual(asked(intake(client({ familyStatus: 'widowed' }))), ['intake.widowhoodYear']);
    deepEqual(asked(intake(client({ familyStatus: 'single' }))), []);
    deepEqual(asked(intake(client({ familyStatus: 'singleParent' }))), []);
    const s = intake(client({ familyStatus: 'widowed' })).statuses.find(x => x.item.key === 'intake.widowhoodYear')!;
    assert(s.state === 'missing' && s.askable, JSON.stringify({ state: s.state, askable: s.askable }));
    equal(ITEM_BY_KEY['intake.widowhoodYear'].question, 'באיזו שנה נפטר/ה בן/בת הזוג?');
    equal(ITEM_BY_KEY['intake.marriageYear'].question, 'באיזו שנה התחתנתם?');
    equal(ITEM_BY_KEY['intake.divorceYear'].question, 'באיזו שנה התגרשתם?');
  }),
  test('שנה בכרטיס ⇒ לא נשאלת; מוצגת לאישור בתוך «המצב המשפחתי» — לכל מצב, לא רק לנשוי', () => {
    deepEqual(asked(intake(client({ familyStatus: 'married', marriageYear: 2015 }))), []);
    deepEqual(asked(intake(client({ familyStatus: 'widowed', widowhoodYear: 2019 }))), []);
    const fam = ITEM_BY_KEY['intake.family'];
    deepEqual(cardLines(fam, client({ familyStatus: 'widowed', widowhoodYear: 2019 }), { subjectRole: 'couple' }), ['אלמנה מ-2019']);
    deepEqual(cardLines(fam, client({ familyStatus: 'divorced', divorceYear: 2021 }), { subjectRole: 'couple' }), ['גרושה מ-2021']);
    deepEqual(cardLines(fam, client({ familyStatus: 'divorced' }), { subjectRole: 'couple' }), ['גרושה']);
    // שנה עתידית בכרטיס = כאילו לא נרשמה ⇒ נשאלת
    deepEqual(asked(intake(client({ familyStatus: 'married', marriageYear: 2099 }))), ['intake.marriageYear']);
  }),
  test('הלקוח בחר מצב אחר בקליטה ⇒ נשאלת השנה של המצב שבחר (גם כשהתשובה עוד ממתינה)', () => {
    const c = client({ familyStatus: 'married', marriageYear: 2010 });
    const div = fact({ itemKey: 'intake.family', value: 'divorced', status: 'pending' });
    deepEqual(asked(intake(c, [div])), ['intake.divorceYear']);
    // נדחתה ⇒ חוזרים לכרטיס
    deepEqual(asked(intake(c, [{ ...div, status: 'rejected' }])), []);
  }),
  test('אושרה בלי לעדכן ⇒ משימת משרד «לרשום בתיק»; כשהכרטיס אומר אותה שנה — נעלמת', () => {
    const ans = fact({ itemKey: 'intake.widowhoodYear', value: { items: [{ year: '2019' }] } });
    const p = intake(client({ familyStatus: 'widowed' }), [ans]);
    const s = p.statuses.find(x => x.item.key === 'intake.widowhoodYear')!;
    deepEqual(s.officeTask, { kind: 'cardEdit', factId: ans.id, text: 'שנת הפטירה של בן/בת הזוג 2019' });
    assert(/רשום שנה/.test(s.officeAction ?? ''), s.officeAction ?? '');
    assert(p.officeTodo.some(x => x.item.key === 'intake.widowhoodYear'), 'לא ב«להשלים במשרד»');
    const p2 = intake(client({ familyStatus: 'widowed', widowhoodYear: 2019 }), [ans]);
    assert(!p2.statuses.find(x => x.item.key === 'intake.widowhoodYear')?.officeTask, 'המשימה נשארה אחרי העדכון');
  }),
  test('«אשר ועדכן בתיק» באותה לחיצה: הצעה לשדה של המצב, עם הערך הקודם; שנה זהה — אין הצעה', () => {
    const from = { factId: 'f1', itemKey: 'intake.divorceYear', year: 2026 };
    for (const k of ['intake.marriageYear', 'intake.divorceYear', 'intake.widowhoodYear']) assert(updatesCard(k), k);
    const plan = cardUpdateFor(client({ familyStatus: 'divorced' }), 'intake.divorceYear', { items: [{ year: '2021' }] }, from)!;
    equal(plan.proposals.length, 1);
    deepEqual([plan.proposals[0].fieldKey, plan.proposals[0].newValue?.patch, plan.proposals[0].oldValue?.patch], ['divorceYear', { divorceYear: 2021 }, { divorceYear: null }]);
    deepEqual(plan.lines, ['שנת הגירושין: — ← 2021']);
    equal(cardUpdateFor(client({ familyStatus: 'divorced', divorceYear: 2021 }), 'intake.divorceYear', { items: [{ year: '2021' }] }, from)!.proposals.length, 0);
  }),
  test('‼ עובדות מנוהלות בדפדפן — כמו בשרת (249ג): עריכה רגילה של השנה עוברת ב-p_facts, לא ב-p_patch שנדחה', () => {
    for (const k of ['marriageYear', 'divorceYear', 'widowhoodYear']) assert(GOVERNED_FACT_KEYS.has(k) && !!GOVERNED_FIELD_LABELS[k], k);
  }),
  test('השנה עצמה: ארבע ספרות, לא עתידית, לא לפני 1930', () => {
    const sch = schemaFor('familyYear');
    const err = (y: string) => validateRecord(sch, { year: y }).year;
    equal(err('2015'), undefined);
    equal(err('15'), 'שנה בארבע ספרות');
    equal(err(String(new Date().getFullYear() + 1)), 'שנה עתידית');
    equal(err('1890'), 'שנה לא סבירה');
    assert(!!err(''), 'שנה ריקה התקבלה');
  }),
];
