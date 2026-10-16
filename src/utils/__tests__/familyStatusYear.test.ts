// מצב משפחתי לפי שנת המס (16.10.2026). ‼ האורקל כאן הוא הכלל העסקי, לא הקוד: נשוי/אה משנת הנישואין,
// גרוש/ה ואלמן/ה משנת האירוע, «לא ידוע» כשהשנה חסרה והמצב היום לא מוכיח את העבר
// (docs/TAX-FILE-TEMPORAL-RELEVANCE-2026-10-13.md), ושנת הנישואין — בחירה משותף/נפרד (מדריך 1301 לשנת 2025, עמ׳ 5).
import { test, assert, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import type { Client, TaxCalcInput } from '../../types';
import {
  clientForTaxYear, familyStatusDisplay, familyStatusForCalc, familyStatusForYear, familyStatusYearProblem,
} from '../familyStatusYear';
import { calcCreditPoints, calculateFamilyTax } from '../taxCalculations';
import { getTaxYearData } from '../../data/taxData';
import { computeEstimate } from '../../features/taxEstimate/engine';
import { buildSummary } from '../../features/taxEstimate/summary';
import type { EstimateDraft } from '../../features/taxEstimate/types';
import { defaultPersons } from '../../features/annualReturn/engine';
import { cardSnapshot, changesSinceApproval } from '../../features/taxFile/hub';

const TODAY = new Date('2026-10-16T12:00:00');
const fy = (p: Partial<Client>, y: number) => familyStatusForYear(p as Client, y, TODAY);
const client = (p: Partial<Client> = {}): Client => ({ id: 'c', firstName: 'א', lastName: 'ב', gender: 'male', familyStatus: 'single', birthDate: '1980-05-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p } as unknown as Client);
const spouse = { firstName: 'ב', lastName: 'ב', gender: 'female', birthDate: '1982-01-01', niType: 'employee', incomeTaxType: 'employee', grossSalary: 150_000, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0, employerPensionPct: 0 } as unknown as Client['spouse'];
const kid = { id: 'k', birthDate: '2015-03-01', birthYear: 2015, hasDisability: false };
const pts = (lines: { points: number }[]) => lines.reduce((a, l) => a + l.points, 0);
const has = (lines: { description: string }[], s: string) => lines.some(l => l.description.includes(s));
const draft = (year: number, preparedOn: string): EstimateDraft => ({
  cutoffMonth: 12, preparedOn, oneOffs: [], adjustments: [], payments: [], savings: [], reconciliations: [], decisions: [], vat: { via: 'manual', periods: [] },
  lines: [{ id: 's', person: 'client', source: 'salary', label: 'משכורת', actualToCutoff: 200_000 }],
  it: { via: 'manual', readOn: `${year}-12-31`, method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual', readOn: `${year}-12-31`, paidToCutoff: 0 },
});

export const TESTS: TestCase[] = [
  // ── הפונקציה ──
  test('נשוי/אה משנת הנישואין: 2019 ⇒ ב-2025 נשוי/אה, ודאי, עם הבסיס', () => {
    const r = fy({ familyStatus: 'married', marriageYear: 2019 }, 2025);
    equal(r.status, 'married'); equal(r.married, true); equal(r.certainty, 'known');
    equal(r.line, 'מצב משפחתי בשנת המס 2025: נשוי/אה (לפי שנת הנישואין 2019)');
  }),
  test('נישאו ב-2026 ⇒ ב-2025 לא נשואים (בלי בן/בת זוג), והמצב הקודם — לבדיקה', () => {
    const r = fy({ familyStatus: 'married', marriageYear: 2026 }, 2025);
    equal(r.married, false); equal(r.status, null); equal(r.certainty, 'review'); equal(familyStatusForCalc(r), 'single');
    assert(!!r.review?.includes('לפני הנישואין (2026)'), r.review ?? '');
  }),
  test('שנת הנישואין עצמה ⇒ נשוי/אה + כלל שנת האירוע עם מקור (בחירה משותף/נפרד, 5329) — לא «פתוח»', () => {
    const r = fy({ familyStatus: 'married', marriageYear: 2025 }, 2025);
    equal(r.status, 'married'); equal(r.isEventYear, true); equal(r.eventOpen, false);
    assert(!!r.eventNote?.includes('5329') && !!r.eventNote.includes('מדריך רשות המסים'), r.eventNote ?? '');
  }),
  test('נשוי/אה בלי שנת נישואין: לשנה שעברה — לא ידוע; לשנה הנוכחית — המצב היום, עם «לרשום»', () => {
    const past = fy({ familyStatus: 'married' }, 2025);
    equal(past.status, null); equal(past.married, null); equal(past.certainty, 'unknown'); equal(familyStatusForCalc(past), 'married');
    const now = fy({ familyStatus: 'married' }, 2026);
    equal(now.status, 'married'); equal(now.certainty, 'review'); assert(!!now.review?.includes('שנת הנישואין לא נרשמה'), now.review ?? '');
  }),
  test('גרוש/ה מ-2024: 2025 גרוש/ה (ודאי); 2024 שנת האירוע — פתוח; 2023 עם נישואין ב-2015 — נשוי/אה; בלי — לא ידוע', () => {
    equal(fy({ familyStatus: 'divorced', divorceYear: 2024 }, 2025).status, 'divorced');
    const ev = fy({ familyStatus: 'divorced', divorceYear: 2024 }, 2024);
    equal(ev.isEventYear, true); equal(ev.eventOpen, true); equal(ev.status, 'divorced');
    const before = fy({ familyStatus: 'divorced', divorceYear: 2024, marriageYear: 2015 }, 2023);
    equal(before.status, 'married'); equal(before.certainty, 'known');
    const unknown = fy({ familyStatus: 'divorced', divorceYear: 2024 }, 2023);
    equal(unknown.certainty, 'unknown'); equal(unknown.married, null);
  }),
  test('אלמן/ה: מ-2019 ⇒ 2025 אלמן/ה; בלי שנה ⇒ ב-2023 לא ידוע (לא מניחים); שנת הפטירה — פתוח', () => {
    equal(fy({ familyStatus: 'widowed', widowhoodYear: 2019 }, 2025).status, 'widowed');
    const u = fy({ familyStatus: 'widowed' }, 2023);
    equal(u.certainty, 'unknown'); assert(!!u.review?.includes('שנת הפטירה לא נרשמה'), u.review ?? '');
    const ev = fy({ familyStatus: 'widowed', widowhoodYear: 2025 }, 2025);
    equal(ev.eventOpen, true); assert(!!ev.eventNote?.includes('פתוח'), ev.eventNote ?? '');
  }),
  test('רווק/ה — אותו מצב בכל שנה; הורה יחיד לשנה שעברה — אותו מצב, «לבדיקה» (אין שדה ממתי)', () => {
    equal(fy({ familyStatus: 'single' }, 2015).certainty, 'known');
    const sp = fy({ familyStatus: 'singleParent' }, 2025);
    equal(sp.status, 'singleParent'); equal(sp.certainty, 'review');
    equal(fy({ familyStatus: 'singleParent' }, 2026).certainty, 'known');
  }),
  test('בלי מצב משפחתי בכרטיס — «לא ידוע», לא «רווק/ה»; החישוב בלי בן/בת זוג (כמו קודם)', () => {
    const r = fy({}, 2026);
    equal(r.certainty, 'unknown'); equal(r.label, 'לא ידוע'); equal(familyStatusForCalc(r), undefined);
    const c = client({ familyStatus: undefined });
    equal(clientForTaxYear(c, 2025, TODAY), c);
  }),
  test('שנה עתידית או לא תקינה בכרטיס — כאילו לא נרשמה', () => {
    equal(fy({ familyStatus: 'widowed', widowhoodYear: 2030 }, 2025).certainty, 'unknown');
    equal(familyStatusYearProblem(2030, { today: TODAY }), 'שנה עתידית');
    equal(familyStatusYearProblem(1995, { birthYear: 1990, today: TODAY }), 'לפני גיל 14 (נולד/ה ב-1990) — לבדוק');
    equal(familyStatusYearProblem(2019, { birthYear: 1980, today: TODAY }), undefined);
  }),
  test('תצוגה: «אלמן/ה · מ-2019», ובלי שנה — «ממתי? טרם נרשם» (לא ריק שקט); רווק/ה בלי תוספת', () => {
    equal(familyStatusDisplay({ familyStatus: 'widowed', widowhoodYear: 2019 } as Client, TODAY), 'אלמן/ה · מ-2019');
    equal(familyStatusDisplay({ familyStatus: 'widowed' } as Client, TODAY), 'אלמן/ה · ממתי? טרם נרשם');
    equal(familyStatusDisplay({ familyStatus: 'single' } as Client, TODAY), 'רווק/ה');
  }),
  test('הלקוח בשנת המס: רק familyStatus מוחלף; הפעלה חוזרת לא משנה (אותו אובייקט)', () => {
    const c = client({ familyStatus: 'married', marriageYear: 2026 });
    const p = clientForTaxYear(c, 2025, TODAY);
    equal(p.familyStatus, 'single'); equal(p.marriageYear, 2026);
    equal(clientForTaxYear(p, 2025, TODAY), p);
    equal(clientForTaxYear(c, 2026, TODAY), c);
  }),

  // ── החיבורים ──
  test('נקודות: «בן/בת זוג ללא הכנסה» (סעיף 37) רק בשנה שבה נשואים — נישאו ב-2026 ⇒ לא ב-2025', () => {
    const c = client({ familyStatus: 'married', marriageYear: 2026, spouseNoIncomeEligible: true });
    assert(!has(calcCreditPoints(c, 2025, 2_904), 'בן/בת זוג ללא הכנסות'), '2025');
    assert(has(calcCreditPoints(c, 2026, 2_904), 'בן/בת זוג ללא הכנסות'), '2026');
  }),
  test('נקודות: גרוש/ה עם ילד מ-2026 (נשוי/אה מ-2010) — «משתתף בכלכלת ילדיו» רק מ-2026', () => {
    const c = client({ familyStatus: 'divorced', divorceYear: 2026, marriageYear: 2010, children: [kid] } as Partial<Client>);
    const y25 = calcCreditPoints(c, 2025, 2_904), y26 = calcCreditPoints(c, 2026, 2_904);
    assert(!has(y25, 'גרוש/פרוד המשתתף'), '2025 — עוד נשוי/אה'); assert(has(y26, 'גרוש/פרוד המשתתף'), '2026');
    equal(pts(y26) - pts(y25), 1);
  }),
  test('מחשבון: חישוב בני זוג רק בשנה שבה נשואים', () => {
    const c = client({ familyStatus: 'married', marriageYear: 2026, spouse, niType: 'employee', incomeTaxType: 'employee' } as Partial<Client>);
    const input = (year: number): TaxCalcInput => ({ client: c, year, grossSalary: 200_000, employeePensionPct: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: 0, krenHashtalmutSE: 0, overrideCreditPoints: false, manualCreditPoints: 0 } as TaxCalcInput);
    equal(calculateFamilyTax(input(2025), getTaxYearData(2025)!).spouse, null);
    assert(calculateFamilyTax(input(2026), getTaxYearData(2026)!).spouse != null, '2026 — יש חישוב לבן/בת הזוג');
  }),
  test('הערכה: «מה בדקנו» כולל את המצב המשפחתי בשנת המס, עם הבסיס', () => {
    const o = computeEstimate(draft(2026, '2026-10-16'), { client: client({ familyStatus: 'widowed', widowhoodYear: 2019 }), taxYear: 2026 });
    const ch = (o.checks ?? []).find(c => c.id === 'family-year')!;
    equal(ch.status, 'checked'); equal(ch.title, 'מצב משפחתי בשנת המס 2026');
    assert(ch.detail.startsWith('אלמן/ה (לפי שנת הפטירה 2019)'), ch.detail);
    assert(!o.blockers.some(b => b.code === 'family_status_year'), 'אין חוסם');
  }),
  test('הערכה לשנה שעברה, אלמן/ה בלי שנה ⇒ «לבדיקה»: חוסם אישור, ושורת «מה בדקנו» «חסר מידע»', () => {
    const o = computeEstimate(draft(2025, '2026-02-01'), { client: client({ familyStatus: 'widowed' }), taxYear: 2025 });
    assert(o.blockers.some(b => b.code === 'family_status_year' && b.text.includes('שנת הפטירה')), JSON.stringify(o.blockers.map(b => b.code)));
    equal((o.checks ?? []).find(c => c.id === 'family-year')?.status, 'missingData');
  }),
  test('הערכה בשנת הגירושין ⇒ שאלה פתוחה גלויה (לא כלל מומצא), בלי חוסם', () => {
    const o = computeEstimate(draft(2026, '2026-10-16'), { client: client({ familyStatus: 'divorced', divorceYear: 2026 }), taxYear: 2026 });
    assert((o.openQuestions ?? []).some(q => q.id === 'family-event-year' && q.text.includes('שנת הגירושין')), JSON.stringify(o.openQuestions));
    assert(!o.blockers.some(b => b.code === 'family_status_year'), 'אין חוסם');
  }),
  test('הערכה: זוג שנישא ב-2026 — שורות בן/בת הזוג ב-2025 לא מחושבות כזוג (חסר בכרטיס), וב-2026 כן', () => {
    const c = client({ familyStatus: 'married', marriageYear: 2026, spouse, niType: 'employee' } as Partial<Client>);
    const d = (y: number): EstimateDraft => ({ ...draft(y, `${y}-12-31`), lines: [...draft(y, `${y}-12-31`).lines, { id: 's2', person: 'spouse', source: 'salary', label: 'משכורת', actualToCutoff: 150_000 }] });
    assert(computeEstimate(d(2025), { client: c, taxYear: 2025 }).partial.some(p => p.code === 'spouse_card_missing'), '2025');
    assert(!computeEstimate(d(2026), { client: c, taxYear: 2026 }).partial.some(p => p.code === 'spouse_card_missing'), '2026');
  }),
  test('דוח שנתי: בן/בת הזוג נכלל/ת כברירת מחדל רק בשנה שבה נשואים', () => {
    const c = client({ familyStatus: 'married', marriageYear: 2026, spouse, employers: [{ id: 'e', name: 'מעסיק', belongsToSpouse: true }] } as unknown as Partial<Client>);
    equal(defaultPersons(c, 2025).join(','), 'client');
    equal(defaultPersons(c, 2026).join(','), 'client,spouse');
  }),
  test('תוצר מאושר: שינוי שנת הפטירה אחרי האישור ⇒ «לבדיקה»; צילום ישן בלי השנה — לא מסמן', () => {
    const before = client({ familyStatus: 'widowed' });
    const after = client({ familyStatus: 'widowed', widowhoodYear: 2019 });
    const items = changesSinceApproval({ inputFacts: cardSnapshot(before), client: after, facts: [], taxYear: 2025 });
    assert(items.some(x => x.text.includes('שנת הנישואין / הגירושין / הפטירה השתנתה')), JSON.stringify(items));
    const old = cardSnapshot(before).filter(x => x.id !== 'card:familyStatusYear');
    equal(changesSinceApproval({ inputFacts: old, client: after, facts: [], taxYear: 2025 }).length, 0);
  }),
  test('סיכום ללקוח: «מצב משפחתי בשנת המס» — מה ולפי מה, בלי «לרשום בכרטיס»', () => {
    const d = draft(2026, '2026-10-16');
    const o = computeEstimate(d, { client: client({ familyStatus: 'married', spouse }), taxYear: 2026 });
    const row = buildSummary({ clientName: 'א', taxYear: 2026, version: 1, draft: d, outputs: o }).checks.find(c => c.title.startsWith('מצב משפחתי'))!;
    equal(row.detail, 'נשוי/אה (לפי המצב היום)'); equal(row.result, 'לבדיקה ידנית במשרד');
  }),
];
