// הערכת מס (שלב 3) — תרחישי הקבלה, מול חישוב עצמאי ולא מול מספר שהקוד הפיק.
// החישוב העצמאי (ref*) כתוב כאן מאפס לפי המקורות: מדרגות 2026 ונקודת זיכוי 2,904 (לוח העזר, אפריל 2026,
// עמ׳ 10, 12), שיעורי ב״ל לעצמאי 2026 (4.47/12.83, בריאות 3.23/5.17, סף 7,703 לחודש) והנוסחה הרבעונית
// (בסיס אחרי ניכוי 52% מדמי הביטוח הלאומי, סעיף 47א). דוגמה פתורה ביד — תרחיש א׳ למטה.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { annualFor, computeEstimate, forecastFor } from '../engine';
import type { AuthorityAdvance, EstimateDraft, EstimateOutputs, IncomeLine, Person } from '../types';
import { isNum } from '../types';

// ── חישוב עצמאי ─────────────────────────────────────────────────────────────
const BR26: [number, number][] = [[84_120, 0.10], [120_720, 0.14], [228_000, 0.20], [301_200, 0.31], [560_280, 0.35], [Infinity, 0.47]];
const CP26 = 2_904;
function refBrackets(taxable: number): number {
  let tax = 0, prev = 0;
  for (const [top, rate] of BR26) { if (taxable > prev) tax += (Math.min(taxable, top) - prev) * rate; prev = top; }
  return tax;
}
const refTax = (taxable: number, points: number) => Math.max(0, refBrackets(taxable) - points * CP26);
/** ב״ל לעצמאי לרבעון 2026: מחזיר את החלק הלאומי (לניכוי 47א) ואת הסך עם בריאות. */
function refNiQuarter(q: number) {
  const t1 = 0.0447, t2 = 0.1283, h1 = 0.0323, h2 = 0.0517, m3 = 7_703 * 3, z = 0.52;
  const low = q / (1 + t1 * z);
  const base = low <= m3 ? low : (q + m3 * z * (t2 - t1)) / (1 + t2 * z);
  const a = Math.min(base, m3), b = Math.max(0, base - m3);
  return { ni: a * t1 + b * t2, total: a * (t1 + h1) + b * (t2 + h2) };
}
/** שנתי; עם משכורת — הסף המופחת שנוצל במשכורת לא זמין לעסק (המשכורת קודם). */
const refNiAnnual = (biz: number, salary = 0) => {
  if (!salary) { const q = refNiQuarter(biz / 4); return { ni: q.ni * 4, total: q.total * 4 }; }
  const t1 = 0.0447, t2 = 0.1283, h1 = 0.0323, h2 = 0.0517, z = 0.52, L = Math.max(0, 7_703 * 12 - salary);
  const low = biz / (1 + t1 * z);
  const base = low <= L ? low : (biz + L * z * (t2 - t1)) / (1 + t2 * z);
  const a = Math.min(base, L), b = Math.max(0, base - L);
  return { ni: a * t1 + b * t2, total: a * (t1 + h1) + b * (t2 + h2) };
};
/** מס הכנסה לאדם: משכורת + עסק (אחרי ניכוי 52% מב״ל) + אחרת, לפי מדרגות; הון 25% בנפרד. */
const refIt = (o: { salary?: number; business?: number; other?: number; capital?: number; points: number }) => {
  const b = o.business ?? 0;
  const taxable = (o.salary ?? 0) + (b > 0 ? b - 0.52 * refNiAnnual(b, o.salary ?? 0).ni : 0) + (o.other ?? 0);
  return refTax(taxable, o.points) + 0.25 * (o.capital ?? 0);
};
const near = (got: number, want: number, tol: number, what: string) => assert(Math.abs(got - want) <= tol, `${what}: התקבל ${got}, צפוי ${Math.round(want)} (±${tol})`);

// ── נתונים ─────────────────────────────────────────────────────────────────
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p,
} as unknown as Client);
const spouse = { firstName: 'מיכל', gender: 'female', birthDate: '1987-01-01', grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0 } as unknown as Client['spouse'];
const married = client({ familyStatus: 'married', spouse });

const biz = (p: Partial<IncomeLine> = {}): IncomeLine => ({
  id: 'b1', person: 'client', source: 'business', entityRef: 'bz1', label: 'העסק', actualToCutoff: 270_000, turnoverToCutoff: 300_000,
  office: { method: 'runRate' }, chosen: 'office', turnoverForecast: 100_000, ...p,
});
const sal = (p: Partial<IncomeLine> = {}): IncomeLine => ({ id: 's1', person: 'client', source: 'salary', label: 'משכורת', actualToCutoff: 135_000, office: { method: 'runRate' }, chosen: 'office', ...p });

const PAID0 = Array.from({ length: 9 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, state: 'reported' as const, paid: 0 }));
const draft = (p: Partial<EstimateDraft> = {}): EstimateDraft => ({
  cutoffMonth: 9, preparedOn: '2026-10-11', lines: [biz()], oneOffs: [], adjustments: [],
  // ‼ 13.10.2026: חסר ≠ 0 — קריאת 134 בלי תקופות חוסמת. כאן התקופות נקראו ושולם בהן 0 במפורש.
  it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: PAID0 },
  ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, paidToCutoff: 27_000 },
  vat: { via: 'manual', periods: [] }, payments: [], savings: [], reconciliations: [], decisions: [], ...p,
});
const Y = { client: client(), taxYear: 2026 };
const microLine = (p: Partial<IncomeLine> = {}): IncomeLine => biz({ track: 'micro', actualToCutoff: undefined, turnoverToCutoff: 75_000, turnoverForecast: 25_000, ...p });
const sal0 = (): IncomeLine => ({ id: 's0', person: 'client', source: 'salary', label: 'משכורת', actualToCutoff: 60_000 });
const niOk = { id: 'n1', person: 'client' as const, method: 'assessedIncome70' as const, justification: 'שומת ב״ל 2025 לפי 70% מהמחזור', approvedAt: '2026-10-11' };
const noAdv: EstimateDraft['it'] = { via: 'manual', method: 'none', frequency: 1, periods: [] };
const adv = (o: EstimateOutputs, a: 'it' | 'ni', p: Person = 'client') => o.advances.find(x => x.authority === a && x.person === p) as AuthorityAdvance;
const val = (x: AuthorityAdvance['annualDue']) => { assert(isNum(x), `לא מספר: ${JSON.stringify(x)}`); return (x as { value: number }).value; };

export const TESTS: TestCase[] = [
  // ── תרחיש א׳: עצמאי, נתונים עד ספטמבר ותחזית ──
  // ביד: שנתי 270,000 + 270,000/9×3 = 360,000. ב״ל: רבעון 90,000 ⇒ בסיס 85,312.8; לאומי 9,013.7, בריאות 3,962.3
  //   ⇒ 12,976 לרבעון, 51,904 לשנה. ניכוי 47א: 52% × 36,055 = 18,749 ⇒ חייב 341,251.
  //   מס: 57,684 עד 301,200 + 40,051 × 35% = 71,702 − 2.25 × 2,904 (6,534) = 65,168.
  //   שיעור מקדמה: 65,168 ÷ מחזור 400,000 = 16.29% ⇒ 16.5% (מינימום, מעוגל כלפי מעלה לחצי אחוז). ב״ל: 51,904 ÷ 12 = 4,325 ⇒ 4,350 (ל-50 ₪).
  test('א׳ עצמאי עד ספטמבר + תחזית: מס, ב״ל ומקדמות — מול חישוב ידני', () => {
    const d = draft();
    equal(forecastFor(d.lines[0], d), 90_000);
    equal(annualFor(d.lines[0], d), 360_000);
    const o = computeEstimate(d, Y);
    equal(o.blockers.length, 0);
    const want = refIt({ business: 360_000, points: 2.25 });
    near(want, 65_168, 1, 'החישוב הידני עצמו');
    near(o.persons[0].incomeTax, want, 2, 'מס הכנסה');
    near(val(o.persons[0].niSelfEmployed), refNiAnnual(360_000).total, 4, 'ב״ל שנתי');
    const it = adv(o, 'it'), ni = adv(o, 'ni');
    equal(it.recommended, Math.ceil((want / 400_000) * 200) / 2);
    equal(it.recommended, 16.5);
    equal(it.futureAtRecommended, 16_500);        // 16.5% × 100,000 מחזור צפוי
    equal(it.futureAtCurrent, 5_000);             // 5% × 100,000
    equal(ni.recommended, 4_350);
    equal(ni.balanceAtCurrent && val(ni.balanceAtCurrent), 51_904 - 27_000 - 9_000);
    equal(o.household.balanceAtCurrent, o.household.annualLiability - 5_000);
    assert(it.explain.some(e => e.includes('16.5%')) && ni.explain.length > 0, 'שורות הסבר לבדיקה ידנית');
    assert(o.nextAction.includes('16.5%') && o.nextAction.includes('(היום 5%)'), o.nextAction);
  }),
  test('עסק שנפתח באמצע השנה: הקצב לפי החודשים שבאמת נמדדו', () => {
    const d = draft({ lines: [biz({ actualToCutoff: 80_000, actualMonths: 4 })] });
    equal(forecastFor(d.lines[0], d), 60_000);
  }),

  // ── תרחיש ב׳: שכיר + עצמאי ──
  test('ב׳ שכיר ועצמאי: המקדמה מכסה רק את המס השולי של העסק; הניכוי מהמשכורת נספר בחבות', () => {
    const d = draft({ lines: [biz({ actualToCutoff: 90_000, turnoverToCutoff: 100_000, turnoverForecast: 40_000 }), sal({ withheldToCutoff: 15_000, withheldForecast: 5_000 })] });
    const o = computeEstimate(d, Y);
    const all = refIt({ salary: 180_000, business: 120_000, points: 2.25 }), noBiz = refIt({ salary: 180_000, points: 2.25 });
    near(o.persons[0].incomeTax, all, 2, 'חבות כוללת');
    const it = adv(o, 'it');
    near(val(it.annualDue), all - noBiz, 3, 'מס שנובע מהעסק');
    equal(it.recommended, Math.ceil(((all - noBiz) / 140_000) * 200) / 2);
    equal(o.household.withheldAnnual, 20_000);
    equal(o.household.balanceAtCurrent, Math.round(all) - 20_000 - Math.round(0.05 * 40_000) + (o.household.balanceAtCurrent - (Math.round(all) - 20_000 - 2_000)));
    near(o.household.balanceAtCurrent, all - 20_000 - 2_000, 2, 'יתרה במקדמה הנוכחית');
  }),

  // ── תרחיש ג׳: זוג עם כמה מקורות — כל הכנסה אצל בעליה ──
  test('ג׳ זוג: עסק אצל הלקוח, משכורת והון אצל בת הזוג — כל אחד בחישוב שלו', () => {
    const d = draft({ lines: [biz({ actualToCutoff: 180_000, turnoverToCutoff: 200_000, turnoverForecast: 70_000 }),
      { id: 's2', person: 'spouse', source: 'salary', label: 'משכורת מיכל', actualToCutoff: 112_500, withheldToCutoff: 12_000, withheldForecast: 4_000, office: { method: 'runRate' }, chosen: 'office' },
      { id: 'k2', person: 'spouse', source: 'capital', label: 'ריבית מיכל', actualToCutoff: 10_000, withheldToCutoff: 2_500, office: { method: 'none' }, chosen: 'office' }] });
    const o = computeEstimate(d, { client: married, taxYear: 2026 });
    const c = o.persons.find(p => p.person === 'client')!, s = o.persons.find(p => p.person === 'spouse')!;
    equal(c.salary, 0); equal(c.capital, 0);
    equal(s.salary, 150_000); equal(s.capital, 10_000); equal(s.businessBooks, 0);
    near(c.incomeTax, refIt({ business: 240_000, points: 2.25 }), 2, 'מס הלקוח');
    near(s.incomeTax, refIt({ salary: 150_000, capital: 10_000, points: 2.75 }), 2, 'מס בת הזוג');
    equal(o.household.withheldAnnual, 12_000 + 4_000 + 2_500);
    assert(!o.advances.some(a => a.person === 'spouse'), 'לבת הזוג אין עסק — אין לה מקדמה');
    equal(o.partial.length, 0);
  }),
  test('ג׳ זוג בלי פרטי בן/בת הזוג בכרטיס: לא נרשם אצל הלקוח, מסומן «לא חושב» והסיכום «חלקי»', () => {
    const d = draft({ lines: [biz(), { id: 's2', person: 'spouse', source: 'salary', label: 'משכורת', actualToCutoff: 90_000, office: { method: 'runRate' }, chosen: 'office' }] });
    const o = computeEstimate(d, Y);
    const c = o.persons.find(p => p.person === 'client')!, s = o.persons.find(p => p.person === 'spouse')!;
    equal(c.salary, 0);
    assert(!!s.notComputed, JSON.stringify(s));
    assert(o.partial.some(x => x.code === 'spouse_card_missing') && o.household.partial, JSON.stringify(o.partial));
    assert(o.blockers.some(b => b.code === 'unsupported_part'), 'חלקי חוסם אישור');
    assert(o.household.explain[0].includes('חלקי'), o.household.explain[0]);
  }),
  test('ג׳ שכירות בפטור אצל שני בני הזוג — לא נתמך: חלק חסר, לא מספר', () => {
    const c = client({ familyStatus: 'married', spouse, rentalTaxTrack: 'exempt' } as Partial<Client>);
    const r = (person: Person, id: string): IncomeLine => ({ id, person, source: 'rent', label: 'שכירות', actualToCutoff: 30_000, office: { method: 'runRate' }, chosen: 'office' });
    const o = computeEstimate(draft({ lines: [biz(), r('client', 'r1'), r('spouse', 'r2')] }), { client: c, taxYear: 2026 });
    assert(o.partial.some(x => x.code === 'rent_exempt_couple'), JSON.stringify(o.partial));
  }),

  // ── תרחיש ד׳: חד־פעמי ──
  test('ד׳ חד־פעמי: בתוך הבפועל לא מוכפל בקצב; צפוי נוסף פעם אחת; המס לפי השנתי המתוקן', () => {
    const d = draft({ oneOffs: [{ id: 'o1', person: 'client', lineId: 'b1', label: 'מכירת ציוד', amount: 45_000, timing: 'inActual' },
      { id: 'o2', person: 'client', lineId: 'b1', label: 'מענק', amount: 10_000, timing: 'expected' }] });
    equal(forecastFor(d.lines[0], d), 75_000);
    equal(annualFor(d.lines[0], d), 355_000);
    near(computeEstimate(d, Y).persons[0].incomeTax, refIt({ business: 355_000, points: 2.25 }), 2, 'מס');
  }),

  // ── תרחיש ה׳: ניכוי במקור + תשלום אחרי החתך ──
  test('ה׳ ניכוי מלקוחות ותשלום אחרי החתך: מקוזזים פעם אחת, לפי התקופה', () => {
    const periods = Array.from({ length: 9 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, state: 'reported' as const, turnover: 33_333, paid: 1_500 }));
    const d = draft({ lines: [biz({ withheldToCutoff: 6_000, withheldForecast: 2_000 })], it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods },
      payments: [
        { id: 'p1', authority: 'it', person: 'client', paidOn: '2026-10-15', period: '2026-09', amount: 1_500 },  // כבר ב-134
        { id: 'p2', authority: 'it', person: 'client', paidOn: '2026-10-15', period: '2026-10', amount: 1_700 },  // אחרי החתך
      ] });
    const o = computeEstimate(d, Y), it = adv(o, 'it');
    const tax = refIt({ business: 360_000, points: 2.25 });
    near(val(it.annualDue), tax - 8_000, 2, 'מס העסק פחות ניכוי מלקוחות');
    equal(it.paidPast, 13_500);
    equal(it.paidFuture, 1_700);
    equal(it.schedule.map(s => s.period).join(','), '2026-11,2026-12');
    equal(it.futureAtRecommended, Math.round((it.recommended! / 100) * 100_000 * (2 / 3)));
    assert(o.limits.some(l => l.includes('נספרו פעם אחת')), JSON.stringify(o.limits));
    near(o.household.balanceAtCurrent, tax - 8_000 - 13_500 - 1_700 - 0.05 * 100_000 * (2 / 3), 2, 'יתרה');
  }),

  // ── תרחיש ו׳: יתרת חובה ויתרת זכות ──
  test('ו׳ יתרת זכות: לא «החזר מיידי»; הקטנת ב״ל — אזהרת גמלאות; יתרת חובה — חוב חיובי', () => {
    const debit = computeEstimate(draft(), Y);
    assert(debit.household.balanceAtCurrent > 0 && debit.nextAction.includes('המקדמות המומלצות'), debit.nextAction);
    const o = computeEstimate(draft({ it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 30, frequency: 1, periods: [{ period: '2026-09', state: 'reported', paid: 90_000 }] },
      ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 20_000, paidToCutoff: 180_000 } }), Y);
    assert(o.household.balanceAtCurrent < 0, String(o.household.balanceAtCurrent));
    assert(o.limits.some(l => l.includes('אינה החזר מיידי')) && o.limits.some(l => l.includes('גמלאות')), JSON.stringify(o.limits));
  }),

  // ── השלמה לתקופות שעברו: רק מרשומה מאושרת, מהתקופות בפועל ──
  test('השלמה במס הכנסה: שיעור חדש × מחזור מדווח בכל תקופה פחות מה שחויב — לא «הפרש × מחזור עד החתך»', () => {
    const periods = [7, 8, 9].map((m, i) => ({ period: `2026-0${m}`, state: 'reported' as const, turnover: [30_000, 35_000, 35_000][i], charged: [1_500, 1_750, 1_750][i] }));
    const base = { via: 'manual' as const, readOn: '2026-10-10', method: 'turnoverRate' as const, ratePct: 5, frequency: 1 as const, periods };
    const cu = { id: 'cu1', authority: 'it' as const, person: 'client' as const, effectiveFrom: '2026-07', method: 'rateOnReportedTurnover' as const, newValue: 16.3, justification: 'פקיד השומה עדכן מיולי', approvedAt: '2026-10-11' };
    const o = computeEstimate(draft({ it: base, catchUps: [cu] }), Y), it = adv(o, 'it');
    equal(val(it.catchUp), 4_890 + 5_705 + 5_705 - 5_000);
    equal(it.catchUpLines!.length, 3);
    equal(o.household.catchUpApproved, 11_300);
    equal(o.household.balanceAtRecommended, o.household.annualLiability - o.household.futureAtRecommended - 11_300);
    // בלי אישור — לא מחושב; תקופה חסרה — לא מחושב
    assert(!isNum(adv(computeEstimate(draft({ it: base, catchUps: [{ ...cu, approvedAt: undefined }] }), Y), 'it').catchUp), 'בלי אישור');
    const miss = adv(computeEstimate(draft({ it: { ...base, periods: periods.slice(1) }, catchUps: [cu] }), Y), 'it').catchUp;
    assert(!isNum(miss) && miss.why.includes('07'), JSON.stringify(miss));
  }),
  test('השלמה בב״ל: מקדמה חדשה פחות מה ששולם בכל חודש; חודש חסר — לא מחושב; סכום ידני — עם ביסוס', () => {
    const cu = { id: 'cu2', authority: 'ni' as const, person: 'client' as const, effectiveFrom: '2026-04', method: 'monthlyDifference' as const, newValue: 4_325, justification: 'עדכון הכנסה בב״ל מאפריל', approvedAt: '2026-10-11' };
    const periods = [4, 5, 6, 7, 8, 9].map(m => ({ period: `2026-0${m}`, paid: 3_000 }));
    const ok = adv(computeEstimate(draft({ ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, periods }, catchUps: [cu] }), Y), 'ni');
    equal(val(ok.catchUp), 6 * 1_325);
    const miss = adv(computeEstimate(draft({ ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, paidToCutoff: 27_000 }, catchUps: [cu] }), Y), 'ni');
    assert(!isNum(miss.catchUp) && miss.catchUp.why.includes('חסרים'), JSON.stringify(miss.catchUp));
    const man = adv(computeEstimate(draft({ catchUps: [{ ...cu, method: 'manualAmount', amount: 5_000 }] }), Y), 'ni');
    assert(isNum(man.catchUp) && man.catchUp.value === 5_000 && man.catchUp.basis === 'officeDecision', JSON.stringify(man.catchUp));
  }),
  // ‼ 16.10.2026 (R10): סכום קבוע = 10 תשלומים שווים, 15.2 עד 15.11 (it.advances.methods; מדריך 2025 פרק ח ס׳ 1ב) — לא 12/6 תקופות
  test('מקדמה בסכום קבוע: המומלץ = המס שנובע מהעסק ÷ 10 תשלומים (פברואר עד נובמבר); הלוח — רק מועדים שקיימים', () => {
    const o = computeEstimate(draft({ it: { via: 'manual', readOn: '2026-10-10', method: 'fixed', fixedPerPeriod: 4_000, frequency: 2, periods: [] } }), Y);
    const it = adv(o, 'it');
    equal(it.unit, '₪ לתקופה');
    equal(it.recommended, Math.ceil(refIt({ business: 360_000, points: 2.25 }) / 10 / 10) * 10); // עשירית מהמס שנובע מהעסק, מעוגלת כלפי מעלה ל-10 ₪
    equal(it.schedule.map(s => s.period).join(','), '2026-10,2026-11'); // אחרי החתך (ספטמבר): אוקטובר ונובמבר; אין תשלום בדצמבר ובינואר
    equal((o.cashflow ?? []).filter(c => c.authority === 'it' && c.kind === 'advance').map(c => c.date).join(','), '2026-10-15,2026-11-15');
    assert(it.explain.some(e => e.includes('10 תשלומים')), it.explain.join(' | '));
  }),
  test('ריבית, הצמדה וקנס — רכיבים נפרדים, לא מחושבים בלי בסיס', () => {
    const o = computeEstimate(draft(), Y);
    for (const a of o.advances) for (const x of [a.interestLinkage, a.fine]) assert(!isNum(x) && x.why.length > 10, JSON.stringify(x));
  }),

  // ── תרחיש ז׳: שינוי תחזית אחרי אישור ⇒ תוצאה אחרת (גרסה חדשה בשרת; 231) ──
  test('ז׳ שינוי תחזית משנה את התוצאה; אותו קלט ⇒ אותה תוצאה', () => {
    const a = computeEstimate(draft(), Y), b = computeEstimate(draft({ lines: [biz({ office: { method: 'manual', amount: 150_000 } })] }), Y);
    assert(b.persons[0].incomeTax > a.persons[0].incomeTax, 'תחזית גבוהה ⇒ מס גבוה');
    near(b.persons[0].incomeTax, refIt({ business: 420_000, points: 2.25 }), 2, 'מס עם התחזית החדשה');
    equal(JSON.stringify(computeEstimate(draft(), Y)), JSON.stringify(a));
  }),

  // ── תרחיש ח׳: חסר או כלל לא מוכרע — לא 0 ──
  test('ח׳ חסר ≠ אפס: שורה בלי בפועל, תחזית שלא נבחרה, קריאת 134 שלא נרשמה — חוסמים', () => {
    const o = computeEstimate(draft({ lines: [biz({ actualToCutoff: undefined })] }), Y);
    assert(o.blockers.some(b => b.code === 'missing_actual') && o.nextAction.startsWith('להשלים'), o.nextAction);
    assert(computeEstimate(draft({ lines: [biz({ chosen: undefined })] }), Y).blockers.some(b => b.code === 'forecast_not_chosen'), 'תחזית');
    const nr = computeEstimate(draft({ it: { via: 'manual', method: 'unknown', frequency: 1, periods: [] } }), Y);
    assert(nr.blockers.some(b => b.code === 'it_not_read') && nr.blockers.some(b => b.code === 'it_method_unknown'), JSON.stringify(nr.blockers));
    assert(adv(nr, 'it').recommended == null, 'אין מקדמה מומלצת בלי שיטה');
  }),
  test('ח׳ 2026: ליבת המס ממקור ראשי בלי הכרעת משרד; 2027 — חוסם; ב״ל בשנה בלי שיעורים — לא מחושב', () => {
    const o = computeEstimate(draft(), Y);
    assert(!o.blockers.some(b => b.code === 'rule_not_verified'), JSON.stringify(o.blockers));
    assert(o.usedRules.filter(u => u.ruleId.startsWith('core.')).every(u => u.basis === 'primary'), JSON.stringify(o.usedRules));
    const y27 = computeEstimate(draft(), { client: client(), taxYear: 2027 });
    assert(y27.blockers.some(b => b.code === 'rule_not_verified' || b.code === 'no_tax_data'), JSON.stringify(y27.blockers));
    const y25 = computeEstimate(draft(), { client: client(), taxYear: 2025 });
    const ni25 = adv(y25, 'ni').annualDue;
    // 25.10.2026: שיעורי ב״ל 2025 נוספו מחוזר 1498 — החישוב קיים גם ל־2025
    assert(isNum(ni25), JSON.stringify(ni25));
  }),
  test('תיאום כפול ויישור פתוח — חוסמים; תיאום נפרד מהספרים', () => {
    const o = computeEstimate(draft({
      adjustments: [{ id: 'a1', person: 'client', lineId: 'b1', bookCategory: 'רכב', amount: 8_000, reason: 'שימוש פרטי' }, { id: 'a2', person: 'client', lineId: 'b1', bookCategory: 'רכב', amount: 2_000, reason: 'שוב' }],
      reconciliations: [{ id: 'r1', lineId: 'b1', what: 'turnover', books: 300_000, vat: 310_000 }],
    }), Y);
    assert(o.blockers.some(b => b.code === 'duplicate_adjustment') && o.blockers.some(b => b.code === 'reconciliation_open'), JSON.stringify(o.blockers));
    const p = computeEstimate(draft({ adjustments: [{ id: 'a1', person: 'client', lineId: 'b1', bookCategory: 'רכב', amount: 8_000, reason: 'שימוש פרטי' }] }), Y).persons[0];
    equal(p.businessBooks, 360_000); equal(p.businessTaxable, 368_000);
  }),
  test('ב״ל: שינוי קטן מ-10% — אין עילה לתיקון', () => {
    const rec = adv(computeEstimate(draft(), Y), 'ni').recommended!;
    equal(adv(computeEstimate(draft({ ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: Math.round(rec * 1.05), paidToCutoff: 0 } }), Y), 'ni').belowChangeThreshold, true);
  }),
  test('קרן השתלמות: השלמה עד הניכוי המרבי — עם חיסכון משוער; פנסיה מגיל 50: מחושב עם מגבלה; משכורת מעל 291,000 לא מבוטחת בחלקה — חוסם', () => {
    const s = computeEstimate(draft({ savings: [{ person: 'client', studyFundToCutoff: 3_000 }] }), Y).savings[0];
    assert(isNum(s.studyFundMaxDeduction) && !!s.studyFundTopUp && s.studyFundTopUp.extraDeposit > 0 && s.studyFundTopUp.taxSaving > 0, JSON.stringify(s));
    const old = { client: client({ birthDate: '1970-03-01' }), taxYear: 2026 };
    const o = computeEstimate(draft({ savings: [{ person: 'client', pensionToCutoff: 20_000 }] }), old);
    assert(!o.blockers.some(b => b.code === 'pension_age50') && o.limits.some(x => x.includes('מגיל 50')), JSON.stringify(o.blockers.map(b => b.code)));
    const sal = { id: 's1', person: 'client' as const, source: 'salary' as const, label: 'משכורת', actualToCutoff: 45_000, office: { method: 'runRate' as const }, chosen: 'office' as const };
    // 14.10.2026: גיל 50 עם משכורת מבוטחת — מחושב; חוסם רק משכורת מעל 291,000 עם חלק לא מבוטח
    const o2 = computeEstimate(draft({ lines: [...draft().lines, sal], savings: [{ person: 'client', pensionToCutoff: 20_000, insuredSalary: 60_000, employeeDeposits: 0 }] }), old);
    assert(!o2.blockers.some(b => b.code === 'pension_age50'), JSON.stringify(o2.blockers.map(b => b.code)));
    const big = { ...sal, actualToCutoff: 250_000 };
    const o3 = computeEstimate(draft({ lines: [...draft().lines, big], savings: [{ person: 'client', pensionToCutoff: 20_000, insuredSalary: 200_000, employeeDeposits: 0 }] }), old);
    assert(o3.blockers.some(b => b.code === 'pension_age50'), JSON.stringify(o3.blockers.map(b => b.code)));
  }),

  // ── עסק זעיר (87ב עד 87ז; 2026: תקרה 122,833, 30%) — docs/tax-foundation/micro/micro-business-research-2026-10-11.md §6 ──
  test('זעיר בתקרה: הכנסה = מחזור × 70%; הוצאות בפועל לא נכנסות; אין 47א — מול חישוב ידני', () => {
    // ביד: 75,000 + 25,000 = 100,000 ⇒ 70,000. מס: 7,000 − 6,534 = 466.
    const o = computeEstimate(draft({ lines: [microLine({ actualToCutoff: 60_000 })], it: noAdv, niOverrides: [niOk] }), Y);
    const m = o.micro[0];
    equal(o.blockers.length, 0);
    equal(m.status, 'within'); equal(m.mode, 'regular'); equal(m.taxable, 70_000); equal(m.deduction, 30_000);
    equal(o.persons[0].businessTaxable, 70_000);
    near(o.persons[0].incomeTax, refTax(70_000, 2.25), 1, 'מס');
    near(val(o.persons[0].niSelfEmployed), 70_000 * (0.0447 + 0.0323), 1, 'ב״ל לפי ההשלמה המאושרת (70%)');
    assert(isNum(o.persons[0].niSelfEmployed) && o.persons[0].niSelfEmployed.basis === 'officeDecision', 'מסומן «לפי רשומה מאושרת»');
    assert(!o.blockers.some(b => b.code === 'missing_actual'), 'רווח הספרים לא נדרש במסלול הזעיר');
  }),
  test('זעיר: תקרה בדיוק (122,833) — זכאי; ניכוי 36,849.90', () => {
    const m = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 122_833 })], it: noAdv }), Y).micro[0];
    equal(m.mode, 'regular'); equal(m.deduction, 36_849.9);
  }),
  test('זעיר — תחזית חריגה: עד החתך בתקרה, השנה צפויה לחרוג; רשום מ-1.1 ⇒ 87ד(ג) והנמוך מהחלופות; הצעד הבא מתריע', () => {
    // ביד: 95,000 + 45,000 = 140,000. מוגבל: 140,000 − 36,849.90 = 103,150.10. ספרים: 80,000 + 80,000/9×3 = 106,666.67 ⇒ מוגבל.
    const o = computeEstimate(draft({ lines: [microLine({ turnoverToCutoff: 95_000, turnoverForecast: 45_000, actualToCutoff: 80_000, micro: { registeredAtYearStart: true } })], it: noAdv }), Y);
    const m = o.micro[0];
    equal(m.status, 'forecastExceed'); equal(m.mode, 'exceeded87dc'); equal(m.chosen, 'normativeCapped');
    near(m.taxable!, 103_150.1, 0.01, 'הכנסה'); near(m.alternatives!.books!, 106_666.67, 0.01, 'ספרים');
    near(o.persons[0].incomeTax, refTax(103_150.1, 2.25), 1, 'מס');
    assert(o.nextAction.startsWith('עסק זעיר — צפויה חריגה'), o.nextAction);
    assert(o.limits.some(l => l.includes('צפויה לחרוג')) && o.limits.some(l => l.includes('דוח שנתי מלא')), JSON.stringify(o.limits));
  }),
  test('זעיר — חריגה בפועל, הוצאות נמוכות: ניכוי מוגבל בלבד — לא בתוספת הוצאות בפועל על היתרה', () => {
    const o = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 150_000, actualToCutoff: 130_000, micro: { registeredAtYearStart: true } })], it: noAdv }), Y);
    const m = o.micro[0];
    equal(m.status, 'actualExceed'); equal(m.chosen, 'normativeCapped');
    near(m.taxable!, 113_150.1, 0.01, 'מחזור פחות 36,849.90 — בלי עוד 20,000 הוצאות');
  }),
  test('זעיר — חריגה בפועל, הוצאות גבוהות: הספרים עדיפים (100,000), עם 47א; בחירת המשרד גוברת', () => {
    const d = draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 150_000, actualToCutoff: 100_000, micro: { registeredAtYearStart: true } })], it: noAdv });
    const o = computeEstimate(d, Y);
    equal(o.micro[0].chosen, 'books'); equal(o.micro[0].taxable, 100_000);
    near(o.persons[0].incomeTax, refIt({ business: 100_000, points: 2.25 }), 2, 'מס לפי הספרים עם 47א');
    const forced = computeEstimate({ ...d, lines: [{ ...d.lines[0], micro: { registeredAtYearStart: true, choice: 'normativeCapped' } }] }, Y);
    near(forced.micro[0].taxable!, 113_150.1, 0.01, 'בחירה מפורשת');
  }),
  test('זעיר — חריגה, נרשם באמצע השנה: אין 87ד(ג); הספרים; «פתוח» גלוי. בלי רווח בספרים — חוסם', () => {
    const o = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 150_000, actualToCutoff: 110_000, micro: { registeredAtYearStart: false } })], it: noAdv }), Y);
    equal(o.micro[0].mode, 'exceededNoRelief'); equal(o.micro[0].taxable, 110_000);
    assert(o.limits.some(l => l.includes('(פתוח)')), JSON.stringify(o.limits));
    const nb = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 150_000, micro: { registeredAtYearStart: false } })], it: noAdv }), Y);
    assert(nb.blockers.some(b => b.code === 'micro_books_needed'), JSON.stringify(nb.blockers));
  }),
  test('זעיר — צינון: ניכה ב-2024, ב-2025 לא ניכה עם הכנסה מעסק ⇒ ב-2026 אין 30% (ספרים)', () => {
    const history = [{ year: 2024, deducted: true, hadBusinessIncome: true }, { year: 2025, deducted: false, hadBusinessIncome: true }];
    const o = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 100_000, actualToCutoff: 90_000, micro: { history } })], it: noAdv }), Y);
    equal(o.micro[0].mode, 'blockedCooling'); equal(o.micro[0].taxable, 90_000);
    const free = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 100_000, micro: { history: [{ year: 2024, deducted: true, hadBusinessIncome: true }, { year: 2025, deducted: false, hadBusinessIncome: false }] } })], it: noAdv }), Y);
    equal(free.micro[0].mode, 'regular'); // בלי הכנסה מעסק בשנת הוויתור — אין צינון
  }),
  test('זעיר — שינוי מסלול: סוג תיק 44 בלי מסלול לשנה חוסם; אותו עסק בספרים ובזעיר — תוצאות שונות, בלי כפל', () => {
    const c44 = { client: client({ incomeTaxFileType: '44' } as Partial<Client>), taxYear: 2026 };
    const und = computeEstimate(draft({ cutoffMonth: 12, lines: [biz({ actualToCutoff: 90_000, turnoverToCutoff: 100_000 })], it: noAdv }), c44);
    assert(und.blockers.some(b => b.code === 'micro_track_unknown'), JSON.stringify(und.blockers));
    const books = computeEstimate(draft({ cutoffMonth: 12, lines: [biz({ actualToCutoff: 90_000, turnoverToCutoff: 100_000, track: 'books' })], it: noAdv }), c44);
    const mic = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ actualToCutoff: 90_000, turnoverToCutoff: 100_000 })], it: noAdv }), c44);
    equal(books.persons[0].businessTaxable, 90_000); equal(mic.persons[0].businessTaxable, 70_000);
    near(books.persons[0].incomeTax, refIt({ business: 90_000, points: 2.25 }), 2, 'ספרים: עם 47א');
    near(mic.persons[0].incomeTax, refTax(70_000, 2.25), 1, 'זעיר: בלי 47א');
  }),
  test('זעיר: המעמד במע״מ אינו קלט — עוסק מורשה ופטור מקבלים אותה תוצאה', () => {
    const a = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 90_000 })], it: noAdv }), { client: client({ dealerType: 'licensed' } as Partial<Client>), taxYear: 2026 });
    const b = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 90_000 })], it: noAdv }), { client: client({ dealerType: 'exempt' } as Partial<Client>), taxYear: 2026 });
    equal(JSON.stringify(a.micro), JSON.stringify(b.micro)); equal(a.persons[0].incomeTax, b.persons[0].incomeTax);
  }),
  // מסלול הדיווח — ביד: מחזור 120,000 ⇒ 84,000. בלי הטבות: 8,400 − 6,534 = 1,866.
  //   מקוצר: זיכוי 35% × min(5,000, 5% × 84,000 = 4,200) = 1,470 ⇒ 396. מלא: ניכוי פנסיה 5,000 + קרן 3,000 ⇒ 76,000 ⇒ 1,066.
  test('זעיר — מסלול דיווח לא נבחר: לא «דוח מלא» בשקט; בלי הטבות ההפקדות, שתי החלופות מוצגות, האישור חסום', () => {
    const sav = [{ person: 'client' as const, pensionToCutoff: 5_000, studyFundToCutoff: 3_000 }];
    const o = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 120_000 })], it: noAdv, savings: sav }), Y);
    near(o.persons[0].incomeTax, 1_866, 1, 'בלי הטבות');
    const r = o.micro[0].reporting!;
    near(r.short!, 396, 1, 'מקוצר'); near(r.full!, 1_066, 1, 'מלא'); near(r.withoutDeposits!, 1_866, 1, 'בלי');
    assert(o.blockers.some(b => b.code === 'micro_reporting_unknown'), JSON.stringify(o.blockers));
    assert(!o.savings[0].studyFundTopUp, 'לא מציעים השלמת קרן כשהמסלול לא נבחר');
    const s = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 120_000, micro: { reporting: 'short' } })], it: noAdv, savings: sav, niOverrides: [niOk] }), Y);
    near(s.persons[0].incomeTax, 396, 1, 'נבחר מקוצר'); equal(s.blockers.length, 0); assert(!s.savings[0].studyFundTopUp, 'במקוצר אין ניכוי קרן');
    const f = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 120_000, micro: { reporting: 'full' } })], it: noAdv, savings: sav, niOverrides: [niOk] }), Y);
    near(f.persons[0].incomeTax, 1_066, 1, 'נבחר מלא'); equal(f.blockers.length, 0);
  }),
  test('זעיר — בלי הפקדות מסלול הדיווח לא משנה את המס ולא חוסם; מקוצר בשנת חריגה ומקוצר עם משכורת ופנסיה — חוסמים', () => {
    const o = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 120_000 })], it: noAdv }), Y);
    assert(!o.blockers.some(b => b.code === 'micro_reporting_unknown'), JSON.stringify(o.blockers));
    const ex = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 150_000, actualToCutoff: 110_000, micro: { registeredAtYearStart: true, reporting: 'short' } })], it: noAdv }), Y);
    assert(ex.blockers.some(b => b.code === 'micro_short_not_allowed'), JSON.stringify(ex.blockers));
    const sal = computeEstimate(draft({ cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 100_000, micro: { reporting: 'short' } }), sal0()], it: noAdv, savings: [{ person: 'client', pensionToCutoff: 3_000 }] }), Y);
    assert(sal.blockers.some(b => b.code === 'micro_short_pension_other'), JSON.stringify(sal.blockers));
  }),
  test('זעיר: אין מקדמה אוטומטית — לא חוסם; מקדמה מרצון מוצעת בהסבר', () => {
    const o = computeEstimate(draft({ lines: [microLine()], it: { via: 'manual', method: 'unknown', frequency: 1, periods: [] } }), Y);
    assert(!o.blockers.some(b => b.code === 'it_method_unknown' || b.code === 'it_not_read'), JSON.stringify(o.blockers));
    assert(o.advances.find(a => a.authority === 'it')!.explain.some(e => e.includes('מקדמה מרצון')), 'הסבר');
  }),

  // ── כלל פתוח אינו הופך בשקט לתוצאה מאושרת ──
  test('ב״ל לעסק זעיר: בלי השלמה מאושרת — «לא מחושב» וחוסם; השלמה בלי אישור לא נחשבת; סכום ידני מאושר נכנס', () => {
    const d = (x: Partial<EstimateDraft> = {}) => draft({ lines: [microLine()], it: noAdv, ...x });
    const none = computeEstimate(d(), Y);
    assert(!isNum(none.persons[0].niSelfEmployed) && none.blockers.some(b => b.code === 'micro_ni_unverified'), JSON.stringify(none.blockers));
    const ni = adv(none, 'ni');
    assert(!isNum(ni.annualDue) && ni.recommended == null, 'אין מקדמת ב״ל מומלצת בלי בסיס');
    assert(none.nextAction.startsWith('להשלים'), none.nextAction);
    const pending = computeEstimate(d({ niOverrides: [{ ...niOk, approvedAt: undefined }] }), Y);
    assert(pending.blockers.some(b => b.code === 'micro_ni_unverified'), 'השלמה בלי אישור — עדיין חוסם');
    const noWhy = computeEstimate(d({ niOverrides: [{ ...niOk, justification: '  ' }] }), Y);
    assert(noWhy.blockers.some(b => b.code === 'micro_ni_unverified'), 'השלמה בלי ביסוס — עדיין חוסם');
    const man = computeEstimate(d({ niOverrides: [{ ...niOk, method: 'manualAmount', amount: 6_000 }] }), Y);
    assert(isNum(man.persons[0].niSelfEmployed) && man.persons[0].niSelfEmployed.value === 6_000 && !man.blockers.length, JSON.stringify(man.blockers));
  }),
  test('כל כלל פתוח במסלול הזעיר מגיע לחוסם — ולא למספר מאושר', () => {
    const cases: [string, Partial<EstimateDraft>][] = [
      ['micro_ni_unverified', { lines: [microLine()] }],
      ['micro_reporting_unknown', { lines: [microLine()], niOverrides: [niOk], savings: [{ person: 'client', pensionToCutoff: 2_000 }] }],
      ['micro_books_needed', { cutoffMonth: 12, lines: [microLine({ turnoverToCutoff: 150_000, micro: { registeredAtYearStart: false } })] }],
      ['micro_track_unknown', { lines: [biz()] }],
    ];
    for (const [code, x] of cases) {
      const o = computeEstimate(draft({ it: noAdv, ...x }), code === 'micro_track_unknown' ? { client: client({ incomeTaxFileType: '44' } as Partial<Client>), taxYear: 2026 } : Y);
      assert(o.blockers.some(b => b.code === code), `${code}: ${JSON.stringify(o.blockers.map(b => b.code))}`);
    }
  }),
  test('חסרים נתוני הכנסה: אין חבות, יתרה או מקדמה מומלצת כמספר — «חסר», לא 0 ולא «מאוזן»', () => {
    const o = computeEstimate(draft({ lines: [biz({ actualToCutoff: undefined, chosen: undefined })] }), Y);
    equal(o.household.incomplete, true);
    for (const a of o.advances) assert(a.recommended == null && !isNum(a.annualDue) && !isNum(a.balanceAtCurrent), JSON.stringify(a));
    assert(o.nextAction.startsWith('להשלים'), o.nextAction);
    equal(computeEstimate(draft(), Y).household.incomplete, false);
  }),
];
