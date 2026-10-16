// שלב 0 (16.10.2026) — «המספרים שהמערכת מציגה היום נכונים». כל בדיקה מול מקור חיצוני (מדריך, דף ב״ל, נוסח החוק),
// לא מול הקוד עצמו. מפת העקיבות: docs/TRACEABILITY-R01-R14-C15-C29-2026-10-16.md §3 שלב 0, §5.
import { test, assert, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, TaxCalcInput } from '../../../types';
import { calculateTax, spouseAsClient, calcCreditPoints } from '../../../utils/taxCalculations';
import { getTaxYearData } from '../../../data/taxData';
import { computeEstimate } from '../engine';
import { buildSummary } from '../summary';
import type { EstimateDraft } from '../types';
import { isNum } from '../types';

const td = getTaxYearData(2026)!;
const near = (a: number, b: number, tol: number, m: string) => assert(Math.abs(a - b) <= tol, `${m}: ${Math.round(a)} מול ${Math.round(b)}`);
const client = (p: Partial<Client> = {}): Client => ({ id: 'c', firstName: 'א', lastName: 'ב', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p } as unknown as Client);
const spouse = { firstName: 'ב', lastName: 'ב', gender: 'female', birthDate: '1986-01-01', niType: 'employee', incomeTaxType: 'employee', grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0, employerPensionPct: 0 } as unknown as Client['spouse'];
const draft = (lines: EstimateDraft['lines'], extra: Partial<EstimateDraft> = {}): EstimateDraft => ({
  cutoffMonth: 12, preparedOn: '2026-12-31', oneOffs: [], adjustments: [], payments: [], savings: [], reconciliations: [], decisions: [], vat: { via: 'manual', periods: [] },
  lines, it: { via: 'manual', readOn: '2026-12-31', method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual', readOn: '2026-12-31', paidToCutoff: 0 }, ...extra,
});
const sal = (amt: number, person: 'client' | 'spouse' = 'client') => ({ id: `s-${person}`, person, source: 'salary' as const, label: 'משכורת', actualToCutoff: amt });
const biz = (amt: number) => ({ id: 'b', person: 'client' as const, source: 'business' as const, label: 'עסק', actualToCutoff: amt, turnoverToCutoff: amt });
const rent = (amt: number) => ({ id: 'r', person: 'client' as const, source: 'rent' as const, label: 'שכ״ד', actualToCutoff: amt });
const calcIn = (c: Client, salary: number): TaxCalcInput => ({ client: c, year: 2026, grossSalary: salary, employeePensionPct: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: 0, krenHashtalmutSE: 0, overrideCreditPoints: false, manualCreditPoints: 0 } as TaxCalcInput);
const pts = (lines: { points: number }[]) => lines.reduce((a, l) => a + l.points, 0);

export const TESTS: TestCase[] = [
  // ── C18 · סעיף 45: לנשואים 2 נקודות להורה אחד, לבחירתם ──
  test('C18: נשואים, שני שכירים 200,000, ילד בן 10 נטול יכולת ⇒ 2 נקודות במשק הבית, לא 4 (5,808 = 2 × 2,904)', () => {
    const kid = (dis: boolean, to?: 'client' | 'spouse') => [{ id: 'k', birthDate: '2016-01-01', birthYear: 2016, hasDisability: dis, disabilityPointsTo: to }];
    const fam = (children: Client['children']) => { const c = client({ familyStatus: 'married', spouse, children, niType: 'employee' } as Partial<Client>); return [c, spouseAsClient(c)!]; };
    const tax = (cs: Client[]) => cs.reduce((a, c) => a + calculateTax(calcIn(c, 200_000), td).incomeTax, 0);
    const none = tax(fam(kid(false))), withKid = tax(fam(kid(true)));
    near(none - withKid, 5_808, 1, 'ההפרש במס משק הבית = 2 נקודות בלבד');
    const [c1, s1] = fam(kid(true, 'spouse'));
    const sec45 = (c: Client) => calcCreditPoints(c, 2026, 2_904).filter(l => l.legalBasis === 'סעיף 45');
    equal(sec45(c1).length, 0); equal(pts(sec45(s1)), 2);
    const [c2, s2] = fam(kid(true));
    equal(pts(sec45(c2)), 2); equal(sec45(s2).length, 0); // ברירת המחדל — בעל/ת הכרטיס; לעולם לא לשניהם
  }),
  test('C18: לא נשואים (הורה יחיד / פרוד) — ההורה בכרטיס מקבל את 2 הנקודות', () => {
    const c = client({ familyStatus: 'singleParent', gender: 'female', children: [{ id: 'k', birthDate: '2016-01-01', birthYear: 2016, hasDisability: true, disabilityPointsTo: 'spouse' }] } as Partial<Client>);
    equal(pts(calcCreditPoints(c, 2026, 2_904).filter(l => l.legalBasis === 'סעיף 45')), 2);
  }),
  test('C18 · «מה בדקנו»: חושב לשני ההורים; כשההורה בכרטיס בלי מס מספיק — מומלץ לבקש אצל בן/בת הזוג', () => {
    const c = client({ familyStatus: 'married', spouse, niType: 'employee', children: [{ id: 'k', birthDate: '2016-01-01', birthYear: 2016, hasDisability: true }] } as Partial<Client>);
    const o = computeEstimate(draft([sal(60_000), sal(250_000, 'spouse')], { spouseSource: 'none' }), { client: c, taxYear: 2026 });
    const ch = (o.checks ?? []).find(x => x.id === 'disabled-child')!;
    assert(!!ch && ch.status === 'saving' && (ch.saving ?? 0) > 0 && !!ch.action?.includes('בן/בת הזוג'), JSON.stringify(ch));
  }),

  // ── R10 · מקדמה בסכום קבוע: 10 תשלומים ──
  test('R10: סכום קבוע, חתך יוני ⇒ 5 תשלומים (יולי עד נובמבר), כל אחד = עשירית מהמס שנובע מהעסק', () => {
    const o = computeEstimate({ ...draft([{ ...biz(100_000), turnoverForecast: 100_000, office: { method: 'runRate' }, chosen: 'office' }]), cutoffMonth: 6, preparedOn: '2026-07-10',
      it: { via: 'manual', readOn: '2026-07-01', method: 'fixed', fixedPerPeriod: 2_000, frequency: 1, periods: [] }, ni: { via: 'manual', readOn: '2026-07-01', monthlyAdvance: 2_000, paidToCutoff: 12_000 } }, { client: client({ niType: 'selfEmployed' } as Partial<Client>), taxYear: 2026 });
    const it = o.advances.find(a => a.authority === 'it')!;
    near(it.recommended!, (it.annualDue as { value: number }).value / 10, 1, 'עשירית');
    equal(it.schedule.map(s => s.period.slice(5)).join(','), '07,08,09,10,11');
  }),

  // ── R11 + C22 · ב״ל לעצמאי ──
  test('R11: הבסיס לב״ל אחרי הניכוי לקופת גמל (345); ב״ל ובריאות בנפרד; רק הלאומי בניכוי 47א', () => {
    const c = client({ niType: 'selfEmployed' } as Partial<Client>);
    const without = computeEstimate(draft([biz(300_000)]), { client: c, taxYear: 2026 });
    const withP = computeEstimate(draft([biz(300_000)], { savings: [{ person: 'client', pensionToCutoff: 20_000 }] }), { client: c, taxYear: 2026 });
    const p0 = without.persons[0], p1 = withP.persons[0];
    assert(isNum(p0.niSelfEmployed) && isNum(p1.niSelfEmployed), 'מחושב');
    // הניכוי (מדריך 2025 סעיף 53) = 11,780 ⇒ הבסיס יורד ב-11,780 ÷ (1 + 0.52 × 12.83%), כולו בשיעור הרגיל (12.83% + 5.17%)
    near((p0.niSelfEmployed as { value: number }).value - (p1.niSelfEmployed as { value: number }).value, 11_780 / (1 + 0.52 * 0.1283) * 0.18, 2, 'ב״ל יורד');
    assert(!!p1.niSplit && Math.abs(p1.niSplit.ni + p1.niSplit.health - (p1.niSelfEmployed as { value: number }).value) <= 1, JSON.stringify(p1.niSplit));
    const niAdv = withP.advances.find(a => a.authority === 'ni')!;
    assert(!!niAdv.split && niAdv.explain.some(e => e.includes('בריאות') && e.includes('47א')) && niAdv.explain.some(e => e.includes('345')), niAdv.explain.join(' | '));
  }),
  test('C22: המעמד מהכרטיס — «שכיר» עם הכנסה מעסק ⇒ חוסם ולא מחשב; «שאינו עונה להגדרה» ⇒ שיעורי הכנסה שלא מעבודה; ריק ⇒ עצמאי עם הערה', () => {
    const conflict = computeEstimate(draft([biz(144_000)]), { client: client({ niType: 'employee' } as Partial<Client>), taxYear: 2026 });
    assert(conflict.blockers.some(b => b.code === 'ni_status_client') && !isNum(conflict.persons[0].niSelfEmployed), JSON.stringify(conflict.blockers.map(b => b.code)));
    const nq = computeEstimate(draft([biz(60_000)]), { client: client({ niType: 'nonQualifying' } as Partial<Client>), taxYear: 2026 });
    // 60,000 ÷ (1 + 0.52 × 7%) = 57,893; פחות 41,304 = 16,589; הסף המופחת פנוי ⇒ 6.92% + 5.17%
    near((nq.persons[0].niNonWork as { value: number }).value, (60_000 / 1.0364 - 41_304) * (0.0692 + 0.0517), 2, 'שלא מעבודה');
    assert(nq.persons[0].breakdown!.niDeduction > 0, '47א חל גם כאן');
    const silent = computeEstimate(draft([biz(144_000)]), { client: client(), taxYear: 2026 });
    assert(isNum(silent.persons[0].niSelfEmployed) && silent.limits.some(l => l.includes('חושב כעצמאי')), 'כרטיס שותק — כעצמאי, כתוב');
    const occ = computeEstimate(draft([biz(144_000)]), { client: client({ niType: 'employee', niOccupations: [{ id: 'o', type: 'self_employed_non_qualifying', fromDate: '2024-01-01' }] } as Partial<Client>), taxYear: 2026 });
    assert(occ.persons[0].niStatus!.includes('נקראו מב״ל') && occ.persons[0].niNonWork != null, 'העיסוק שנקרא מב״ל גובר');
  }),

  // ── C29 · שכירות וב״ל ──
  test('C29: שכ״ד במסלול הרגיל — ב״ל על הכנסה שלא מעבודה (כל השיעורים מדף ב״ל 2026); פטור / 10% — אין', () => {
    const base = (track: 'regular' | 'exempt' | 'flat10', amt = 96_000) => computeEstimate(draft([sal(180_000), rent(amt)]), { client: client({ niType: 'employee', rentalTaxTrack: track } as Partial<Client>), taxYear: 2026 }).persons[0];
    const reg = base('regular');
    near((reg.niNonWork as { value: number }).value, (96_000 / 1.0364 - 41_304) * (0.07 + 0.0517), 2, 'רגיל');
    for (const t of ['exempt', 'flat10'] as const) assert(base(t, 60_000).niNonWork == null, t); // 5,000 לחודש — מתחת לתקרת הפטור
    // פטור חלקי (8,000 לחודש מול 5,654): החלק החייב (4,692 לחודש — 059) חייב בב״ל
    near((base('exempt').niNonWork as { value: number }).value, (56_304 / 1.0364 - 41_304) * (0.07 + 0.0517), 2, 'פטור חלקי');
  }),

  // ── R07 · פנסיה לשכיר בלי עסק; 045 חסר ⇒ חוסם ──
  test('R07: שכיר 150,000 לא מבוטח, הפקדה עצמאית 6,000 ⇒ ניכוי 5,820 (47(ב)(2)) ויתרה 180 לזיכוי (מדריך 2025 עמ׳ 61, דוגמה 1)', () => {
    const c = client({ niType: 'employee' } as Partial<Client>);
    const o = computeEstimate(draft([sal(150_000)], { savings: [{ person: 'client', pensionToCutoff: 6_000, insuredSalary: 0, employeeDeposits: 0 }] }), { client: c, taxYear: 2026 });
    const pen = o.persons[0].pension!;
    equal(pen.deduction, 5_820); equal(pen.creditBase, 180);
    const none = computeEstimate(draft([sal(150_000)]), { client: c, taxYear: 2026 });
    assert(o.persons[0].incomeTax < none.persons[0].incomeTax, 'המס יורד');
  }),
  test('R07: משכורת + הפקדה עצמאית ו-045 חסר ⇒ חוסם (לא אפס), וההפקדה לא מחושבת', () => {
    const o = computeEstimate(draft([biz(100_000), sal(100_000)], { savings: [{ person: 'client', pensionToCutoff: 15_000, insuredSalary: 100_000, employerDeposits: 6_500 }] }), { client: client({ niType: 'employeeAndSE' } as Partial<Client>), taxYear: 2026 });
    assert(o.blockers.some(b => b.code === 'pension_employee_client' && b.text.includes('045')), JSON.stringify(o.blockers.map(b => b.code)));
  }),

  // ── הסיכום ללקוח ──
  test('סיכום ללקוח: ב״ל ובריאות מופרדים בפירוט; ב״ל על שכירות מופיע גם בלי עסק', () => {
    const c = client({ niType: 'selfEmployed' } as Partial<Client>);
    const o = computeEstimate(draft([biz(144_000)]), { client: c, taxYear: 2026 });
    const m = buildSummary({ clientName: 'א', taxYear: 2026, version: 1, draft: draft([biz(144_000)]), outputs: o });
    const ni = m.headline.find(h => h.label.startsWith('ביטוח לאומי ובריאות לשנה'))!;
    assert(!!ni && ni.detail!.some(d => d.includes('ביטוח לאומי') && d.includes('בריאות')), JSON.stringify(m.headline.map(h => h.label)));
    const r = computeEstimate(draft([sal(180_000), rent(96_000)]), { client: client({ niType: 'employee', rentalTaxTrack: 'regular' } as Partial<Client>), taxYear: 2026 });
    const m2 = buildSummary({ clientName: 'א', taxYear: 2026, version: 1, draft: draft([sal(180_000), rent(96_000)]), outputs: r });
    assert(m2.headline.some(h => h.label.includes('הכנסה שלא מעבודה')), JSON.stringify(m2.headline.map(h => h.label)));
  }),
];
