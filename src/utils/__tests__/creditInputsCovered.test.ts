// ─── 290 · שמירה: כל קלט של חישוב נקודות הזיכוי — ממי הוא מגיע (23.10.2026) ─────────────────────────────────────
// ‼ הכלל (גיא, 23.10.2026): השאלון השנתי אוסף כל מה שהחישוב צריך, כדי שהמשרד לא יקליד נתוני זיכוי ביד. הדרך היחידה לכרטיס —
//   «אשר ועדכן בתיק» (recordToCard › cardUpdateFor ⇒ apply_tax_facts).
// ‼ מה הבדיקה עושה: לכל שדה של TaxPerson (בעל/ת התיק ובן/בת הזוג) — רשימה מפורשת של פריטי השאלון שכותבים אותו, ומריצה את
//   התוכנית שלהם עם תשובה לדוגמה: אם התוכנית כבר לא מייצרת את המפתח — נופלת. שדה בלי כותב — רק byDesign עם סיבה אמיתית
//   (ערך קבוע, נגזר, או פרט זהות מהכרטיס). ‼ אין «פער פתוח»: גיא (23.10.2026) — 100%, בלי הקלדה במשרד. שדה חדש ב-TaxPerson
//   בלי שורה כאן — נופלת (וגם tsc).

import { test, assert, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { EMPTY_SPOUSE, type Child, type Client } from '../../types';
import { clientToTaxPerson, spouseToTaxPerson, type TaxPerson } from '../taxCalculations';
import { cardUpdateFor, updatesCard } from '../../features/taxYear/recordToCard';
import { ITEM_BY_KEY } from '../../features/taxYear/catalog';

type Role = 'client' | 'spouse';
interface Writer {
  item: string;
  /** תשובה לדוגמה — הערך של העובדה כפי שהשרת שומר אותו. */
  answer: unknown;
  /** המפתח שהתוכנית חייבת לכתוב (לבן/בת הזוג — בתוך patch.spouse). */
  writes: string;
  /** כשהשדה נגזר מהמפתח שנכתב (טריגר בשרת וכו׳). */
  via?: string;
  /** הכרטיס שהתשובה נבדקת מולו (ברירת מחדל: זוג נשוי בלי פרטי בן/בת זוג). */
  card?: Partial<Client>;
}
type Source = { writers: Writer[] } | { byDesign: string };

const studies = { items: [{ kind: 'army', branch: 'idf', month: '08', year: '2024', months: '32' }, { kind: 'ma', year: '2023' }] };
const national = { items: [{ kind: 'army', branch: 'national', month: '07', year: '2023', months: '24' }] };
const aliyah = { items: [{ status: 'immigrant', month: '03', year: '2023' }] };
const disability = { items: [{ determined: 'yes', percent: 60, year: '2018' }] };
const divorced: Partial<Client> = { familyStatus: 'divorced', spouseFirstName: undefined };
const kids = { items: [{ firstName: 'נועה', birthDate: '2015-04-01', livesWith: 'withUs' }] };
const reserve = { items: [{ days: 40 }] };
const withKid: Partial<Client> = { children: [{ id: 'k1', firstName: 'נוי', birthDate: '2016-01-01', birthYear: 2016, hasDisability: false }] as Client['children'] };

const w = (item: string, answer: unknown, writes: string, extra: Partial<Writer> = {}): Writer => ({ item, answer, writes, ...extra });

/** בעל/ת התיק. */
const CLIENT: Record<keyof TaxPerson, Source> = {
  gender: { byDesign: 'שדה חובה בכרטיס — נקבע בפתיחה (תעודת הזהות), לא שאלה' },
  familyStatus: { byDesign: 'אירוע מחזור חיים — המשרד (CLAUDE.md §9: אין אוטומציה על שינוי מצב משפחתי). השאלון שואל «מה קרה?» ופותח את הענף' },
  children: { writers: [w('household.children', kids, 'children', { card: divorced })] },
  isNewImmigrant: { writers: [w('household.aliyahDetails', aliyah, 'isNewImmigrant')] },
  aliyahYear: { writers: [w('household.aliyahDetails', aliyah, 'aliyahYear')] },
  aliyahMonth: { writers: [w('household.aliyahDetails', aliyah, 'aliyahMonth')] },
  disabilityPercentage: { writers: [w('special.disabilityDetails', disability, 'disabilityPercentage')] },
  hasAcademicDegree: { writers: [w('household.studies', studies, 'hasAcademicDegree')] },
  academicDegreeYear: { writers: [w('household.studies', studies, 'academicDegreeYear')] },
  academicDegreeType: { writers: [w('household.studies', studies, 'academicDegreeType')] },
  completedIdf: { writers: [w('household.studies', studies, 'completedIdf')] },
  idfReleaseYear: { writers: [w('household.studies', studies, 'idfReleaseYear')] },
  completedNationalService: { writers: [w('household.studies', national, 'completedNationalService')] },
  nationalServiceYear: { writers: [w('household.studies', national, 'nationalServiceYear')] },
  idfReleaseMonth: { writers: [w('household.studies', studies, 'idfReleaseMonth')] },
  serviceMonths: { writers: [w('household.studies', studies, 'serviceMonths')] },
  qualifyingSettlementId: { writers: [w('household.address', { items: [{ city: 'שדרות', street: 'הרצל', houseNumber: '1' }] }, 'city', { via: 'טריגר 285: היישוב המזכה נגזר מסמל היישוב' })] },
  paysAlimonyToEx: { writers: [w('household.alimonyPaid', true, 'paysAlimonyToEx')] },
  reserveCombatDaysPrevYear: { writers: [w('household.reserveDays', reserve, 'reserveCombatDaysPrevYear')] },
  spouseNoIncomeEligible: { writers: [w('household.noIncomeSpouse', 'retirement', 'spouseNoIncomeEligible')] },
  birthYear: { byDesign: 'מתאריך הלידה בכרטיס (פרטי זהות), לא שאלה' },
};

/** בן/בת הזוג — הכול נכתב במיזוג לתוך clients.spouse (288). */
const SPOUSE: Record<keyof TaxPerson, Source> = {
  gender: { writers: [w('household.spouseBasics', { items: [{ gender: 'female', birthDate: '1988-02-01' }] }, 'gender')] },
  familyStatus: { byDesign: 'קבוע «נשוי/אה» בצד בן/בת הזוג (spouseToTaxPerson)' },
  children: { byDesign: 'אותה רשימת ילדים של הכרטיס (household.children), מנקודת המבט של בן/בת הזוג' },
  isNewImmigrant: { writers: [w('household.aliyahDetails', aliyah, 'isNewImmigrant')] },
  aliyahYear: { writers: [w('household.aliyahDetails', aliyah, 'aliyahYear')] },
  aliyahMonth: { writers: [w('household.aliyahDetails', aliyah, 'aliyahMonth')] },
  disabilityPercentage: { writers: [w('special.disabilityDetails', disability, 'disabilityPercentage')] },
  hasAcademicDegree: { writers: [w('household.studies', studies, 'hasAcademicDegree')] },
  academicDegreeYear: { writers: [w('household.studies', studies, 'academicDegreeYear')] },
  academicDegreeType: { writers: [w('household.studies', studies, 'academicDegreeType')] },
  completedIdf: { writers: [w('household.studies', studies, 'completedIdf')] },
  idfReleaseYear: { writers: [w('household.studies', studies, 'idfReleaseYear')] },
  completedNationalService: { writers: [w('household.studies', national, 'completedNationalService')] },
  nationalServiceYear: { writers: [w('household.studies', national, 'nationalServiceYear')] },
  idfReleaseMonth: { writers: [w('household.studies', studies, 'idfReleaseMonth')] },
  serviceMonths: { writers: [w('household.studies', studies, 'serviceMonths')] },
  qualifyingSettlementId: { byDesign: 'לא נכנס לנקודות (personToProfile); בחישוב המלא — היישוב של הכרטיס (spouseAsClient), מהכתובת המשותפת' },
  paysAlimonyToEx: { writers: [w('household.alimonyPaid', true, 'paysAlimonyToEx')] },
  reserveCombatDaysPrevYear: { writers: [w('household.reserveDays', reserve, 'reserveCombatDaysPrevYear')] },
  spouseNoIncomeEligible: { byDesign: 'נקודה של בעל/ת התיק בלבד (סעיף 37) — לא בצד בן/בת הזוג' },
  birthYear: { writers: [w('household.spouseBasics', { items: [{ gender: 'female', birthDate: '1988-02-01' }] }, 'birthDate', { via: 'spouseToTaxPerson: שנת הלידה מתאריך הלידה' })] },
};

/** תת-קלטים של ילד שהחישוב קורא (personToProfile). */
const CHILD: Partial<Record<keyof Child, Source>> = {
  birthYear: { writers: [w('household.children', kids, 'children', { card: divorced })] },
  custody: { writers: [w('household.children', kids, 'children', { card: divorced })] },
  hasDisability: { writers: [w('household.disabledChildDetails', { items: [{ child: 'k1', pointsTo: 'spouse' }] }, 'children', { card: withKid })] },
  disabilityPointsTo: { writers: [w('household.disabledChildDetails', { items: [{ child: 'k1', pointsTo: 'spouse' }] }, 'children', { card: withKid })] },
  monthlyAlimonyPaid: { writers: [w('family.childSupport', { items: [{ child: 'k1', monthly: 1500 }] }, 'children', { card: withKid })] },
};

const married = (over: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'בדיקה', familyStatus: 'married', spouseFirstName: 'ישראלה', spouseLastName: 'בדיקה', spouseIdNumber: '000000018',
  gender: 'male', birthDate: '1985-01-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [],
  fieldMeta: {}, spouse: null, isNewImmigrant: false, aliyahYear: 0, isReturningResident: false, returningYear: 0, disabilityPercentage: 0,
  completedIdf: false, idfReleaseYear: 0, completedNationalService: false, nationalServiceYear: 0, hasAcademicDegree: false, academicDegreeYear: 0, ...over,
} as unknown as Client);

/** מה התוכנית של הפריט כותבת לאדם הזה. */
function writtenKeys(wr: Writer, role: Role): { keys: string[]; patch: Record<string, unknown> } {
  const plan = cardUpdateFor(married(wr.card), wr.item, wr.answer, { factId: 'f', itemKey: wr.item, year: 2025 }, role);
  const props = plan?.proposals ?? [];
  if (role === 'spouse') {
    const sp = props.find(p => p.fieldKey === 'spouse');
    const patch = ((sp?.newValue as unknown as { patch?: { spouse?: Record<string, unknown> } })?.patch?.spouse) ?? {};
    return { keys: Object.keys(patch), patch };
  }
  const patch: Record<string, unknown> = {};
  for (const p of props) Object.assign(patch, (p.newValue as unknown as { patch: Record<string, unknown> }).patch);
  return { keys: props.map(p => p.fieldKey), patch };
}

function check(table: Record<string, Source>, role: Role, label: string) {
  const bad: string[] = [];
  for (const [input, src] of Object.entries(table)) {
    if ('open' in (src as object)) { bad.push(`${label}.${input}: «פער פתוח» אסור — כותב בשאלון או byDesign`); continue; }
    if ('byDesign' in src) { if (src.byDesign.trim().length < 15) bad.push(`${label}.${input}: בלי סיבה`); continue; }
    if (!src.writers.length) { bad.push(`${label}.${input}: אין כותב`); continue; }
    for (const wr of src.writers) {
      if (!ITEM_BY_KEY[wr.item]) { bad.push(`${label}.${input}: ${wr.item} לא בקטלוג`); continue; }
      if (!updatesCard(wr.item)) { bad.push(`${label}.${input}: ${wr.item} לא מעדכן את התיק`); continue; }
      const got = writtenKeys(wr, role);
      if (!got.keys.includes(wr.writes)) bad.push(`${label}.${input}: ${wr.item} לא כותב ${wr.writes} (כתב: ${got.keys.join(',') || 'כלום'})`);
    }
  }
  return bad;
}

export const TESTS: TestCase[] = [
  test('אין אף «פער פתוח» — רק כותבים, או byDesign עם סיבה', () => {
    const open = [...Object.entries(CLIENT).map(([k, v]) => ['client.' + k, v] as const), ...Object.entries(SPOUSE).map(([k, v]) => ['spouse.' + k, v] as const),
      ...Object.entries(CHILD).map(([k, v]) => ['child.' + k, v] as const)].filter(([, v]) => !!v && !('writers' in v) && !('byDesign' in v)).map(([k]) => k);
    equal(open.length, 0, open.join(', '));
  }),
  test('כל שדה של TaxPerson מופיע ברשימה — לבעל/ת התיק ולבן/בת הזוג', () => {
    const c = Object.keys(clientToTaxPerson(married())).sort();
    const s = Object.keys(spouseToTaxPerson({ ...EMPTY_SPOUSE }, [])).sort();
    const missing = [...c.filter(k => !(k in CLIENT)).map(k => `client.${k}`), ...s.filter(k => !(k in SPOUSE)).map(k => `spouse.${k}`)];
    assert(!missing.length, `קלט חדש לחישוב בלי שורה בבדיקה: ${missing.join(', ')}`);
  }),
  test('בעל/ת התיק: כל קלט — פריט בשאלון שכותב אותו (התוכנית רצה), או סיבה כתובה', () => {
    const bad = check(CLIENT, 'client', 'client');
    assert(!bad.length, bad.join(' | '));
  }),
  test('בן/בת הזוג: כל קלט — פריט שכותב אותו בתוך spouse, או סיבה כתובה', () => {
    const bad = check(SPOUSE, 'spouse', 'spouse');
    assert(!bad.length, bad.join(' | '));
  }),
  test('ילדים: שנת הלידה, המשמורת, המוגבלות (ולמי הנקודות) והמזונות — כולם נכתבים', () => {
    const bad = check(CHILD as Record<string, Source>, 'client', 'child');
    assert(!bad.length, bad.join(' | '));
    const run = (item: string, answer: unknown) => (writtenKeys(w(item, answer, 'children', { card: withKid }), 'client').patch.children as Child[])[0];
    const dis = run('household.disabledChildDetails', { items: [{ child: 'k1', pointsTo: 'spouse' }] });
    assert(dis.hasDisability === true && dis.disabilityPointsTo === 'spouse', JSON.stringify(dis));
    equal(run('family.childSupport', { items: [{ child: 'k1', monthly: 1500 }] }).monthlyAlimonyPaid, 1500);
    // ‼ לא רק «כתב children» — הילד עצמו נושא את שנת הלידה ואת המשמורת
    const kid = (writtenKeys(w('household.children', kids, 'children', { card: divorced }), 'client').patch.children as Child[])[0];
    assert(kid.birthYear === 2015 && kid.custody === 'self', JSON.stringify(kid));
  }),
];
