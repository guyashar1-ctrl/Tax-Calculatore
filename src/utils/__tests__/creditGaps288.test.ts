// ─── בדיקות: פערי הזיכויים (288, 22.10.2026) ───────────────────────────────────
// ‼ מה נעול כאן — כל פער שהיה: נתון בכרטיס/בשאלון ⇒ החישוב משתנה (CLAUDE.md §13):
//   · חודשי השירות וחודש השחרור משנים את הנקודות (39א: 1/6 או 1/12 לחודש, 36 חודשים).
//   · גרוש/ה שהילדים אצלו — 40(ב)(2), לא «משתתף בכלכלה»; ההורה השני — כן.
//   · 40א מזונות לבן/בת זוג לשעבר; 40ב נער/ה 16–17.
//   · בן/בת הזוג לא יורש/ת את המילואים ואת «בן זוג ללא הכנסה» של בעל/ת התיק; בלי מין — לא מחושב.
//   · מה שחסר — נכתב (creditGaps), «לימודים וצבא» מהשאלון ⇒ הצעה לתיק, והשאלון הישן לא מוריד «הורה יחיד».

import { test, equal, assert, deepEqual } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { calcCreditPoints, spouseAsClient } from '../taxCalculations';
import { clientCreditGaps, spouseCreditGaps } from '../../features/taxFile/creditGaps';
import { cardUpdateFor } from '../../features/taxYear/recordToCard';
import { computeDiffs } from '../../features/annualReport/reconcile';
import { EMPTY_SPOUSE, type Client } from '../../types';

const V = 2904;
const base = (over: Partial<Client>): Client => ({
  ...SAMPLE_CLIENTS[0], familyStatus: 'single', children: [], gender: 'male', birthDate: '1990-05-01',
  completedIdf: false, idfReleaseYear: 0, completedNationalService: false, nationalServiceYear: 0,
  hasAcademicDegree: false, academicDegreeYear: 0, isNewImmigrant: false, aliyahYear: 0,
  reserveCombatDaysPrevYear: 0, spouse: null, ...over,
} as Client);
const find = (c: Client, y: number, re: RegExp) => calcCreditPoints(c, y, V).filter(l => re.test(l.description));
const sum = (c: Client, y: number, re: RegExp) => find(c, y, re).reduce((a, l) => a + l.points, 0);

export const TESTS: TestCase[] = [
  test('שירות 32 חודשים: 2 נק׳ בשנה מלאה בחלון', () => {
    equal(sum(base({ completedIdf: true, idfReleaseYear: 2024, idfReleaseMonth: 8, serviceMonths: 32 }), 2026, /חייל/), 2);
  }),
  test('שירות 15 חודשים (גבר): נקודה אחת בשנה — לא 2 כמו «24 חודשים» שהונח', () => {
    equal(sum(base({ completedIdf: true, idfReleaseYear: 2024, idfReleaseMonth: 8, serviceMonths: 15 }), 2026, /חייל/), 1);
  }),
  test('חודש השחרור: שחרור 10/2023 ⇒ ב-2026 רק 10 חודשים בחלון', () => {
    equal(sum(base({ completedIdf: true, idfReleaseYear: 2023, idfReleaseMonth: 10, serviceMonths: 30 }), 2026, /חייל/), 1.67);
  }),
  test('גרוש עם ילד שגר אצלו: 40(ב)(2), בלי «משתתף בכלכלה»', () => {
    const c = base({ familyStatus: 'divorced', children: [{ id: 'k', firstName: 'א', birthDate: '2016-01-01', birthYear: 2016, hasDisability: false, custody: 'self' }] as Client['children'] });
    assert(find(c, 2026, /החי בנפרד/).length === 1, 'נקודת ההורה שהילדים אצלו');
    equal(find(c, 2026, /המשתתף בכלכלת/).length, 0);
  }),
  test('גרושה שהילד אצל האב: «משתתפת בכלכלה», בלי 40(ב)(2)', () => {
    const c = base({ gender: 'female', familyStatus: 'divorced', children: [{ id: 'k', firstName: 'א', birthDate: '2016-01-01', birthYear: 2016, hasDisability: false, custody: 'spouse' }] as Client['children'] });
    equal(find(c, 2026, /החי בנפרד/).length, 0);
    equal(find(c, 2026, /המשתתף בכלכלת/).length, 1);
  }),
  test('40א: נשוי בשנית שמשלם מזונות לגרושתו — נקודה', () => {
    equal(sum(base({ familyStatus: 'married', paysAlimonyToEx: true }), 2026, /לשעבר/), 1);
    equal(sum(base({ familyStatus: 'single', paysAlimonyToEx: true }), 2026, /לשעבר/), 0);
  }),
  test('40ב: בן 17 בשנת המס — נקודת נער/ה', () => {
    equal(sum(base({ birthDate: '2009-03-01' }), 2026, /נער/), 1);
    equal(sum(base({ birthDate: '1990-03-01' }), 2026, /נער/), 0);
  }),
  test('בן/בת הזוג לא יורש/ת מילואים ו«בן זוג ללא הכנסה»; בלי מין — אין חישוב', () => {
    const c = base({ familyStatus: 'married', reserveCombatDaysPrevYear: 40, spouseNoIncomeEligible: true,
      spouse: { ...EMPTY_SPOUSE, firstName: 'ישראלה', gender: 'female' } });
    const s = spouseAsClient(c)!;
    equal(s.reserveCombatDaysPrevYear, 0);
    equal(s.spouseNoIncomeEligible, false);
    equal(spouseAsClient(base({ familyStatus: 'married', spouse: { ...EMPTY_SPOUSE, gender: '' as never } })), null);
  }),
  test('מה חסר: תואר בלי שנה — לא נכלל; חודשי שירות — לפי הנחה; זוג בלי פרטים — לא נכלל', () => {
    const g = clientCreditGaps(base({ hasAcademicDegree: true, academicDegreeYear: 0, completedIdf: true, idfReleaseYear: 2025 }), 2026);
    deepEqual(g.map(x => x.effect), ['included', 'included', 'excluded']);
    deepEqual(spouseCreditGaps(base({ familyStatus: 'married', spouse: null }), 2026).map(x => x.effect), ['excluded']);
  }),
  test('«לימודים וצבא» מהשאלון ⇒ הצעה לתיק: בעל/ת התיק — עובדות; בן/בת הזוג — «spouse» אחת', () => {
    const items = { items: [{ kind: 'army', branch: 'idf', month: '08', year: '2024', months: '32' }, { kind: 'ba', year: '2023' }] };
    const from = { factId: 'f', itemKey: 'household.studies', year: 2025 };
    const mine = cardUpdateFor(base({}), 'household.studies', items, from, 'client')!;
    const keys = mine.proposals.map(p => p.fieldKey);
    for (const k of ['completedIdf', 'idfReleaseYear', 'idfReleaseMonth', 'serviceMonths', 'hasAcademicDegree', 'academicDegreeYear']) assert(keys.includes(k), k);
    const sp = cardUpdateFor(base({ familyStatus: 'married', spouse: { ...EMPTY_SPOUSE, gender: 'female' } }), 'household.studies', items, from, 'spouse')!;
    deepEqual(sp.proposals.map(p => p.fieldKey), ['spouse']);
    equal((sp.proposals[0].newValue as unknown as { patch: { spouse: { serviceMonths: number } } }).patch.spouse.serviceMonths, 32);
  }),
  test('השאלון הישן: «הורה יחיד» בכרטיס מול «גרוש/ה» — אין הצעה להחליף', () => {
    const diffs = computeDiffs({ model: { identity: { maritalStatus: 'divorced' } } } as never, base({ familyStatus: 'singleParent' }));
    equal(diffs.filter(d => d.key === 'maritalStatus').length, 0);
  }),
];
