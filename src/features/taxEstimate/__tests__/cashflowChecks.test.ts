// הערכת מס — תזרים, יישור מול הרשויות ו«מה בדקנו» (13.10.2026).
// החישובים הצפויים כתובים ביד מהמקורות (לא מהקוד): מועד מקדמת מ״ה — ה-15 בחודש שאחרי התקופה (מדריך 2025,
// פרק ח, סעיף 1); מקדמת ב״ל — ה-15 בחודש שאחרי (חוזר 1502, תקנה 2(א)(1)), בהוראת קבע ה-22; פנסיה לעצמאי 2026 —
// הכנסה מזכה 164,400, ניכוי 7% + 4% מעל 12%, זיכוי 35% על 5% + 0.5% (עד 232,800), רף עמית מוטב 26,436
// (לוח העזר 2026); קרן השתלמות 4.5% × 293,397 (לוח העזר 2026).
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { computeEstimate } from '../engine';
import { itDueDate, niDueDate, nearTerm, niPaymentGaps } from '../cashflow';
import { cardAdvances, reconciliationsNeeded } from '../prefill';
import type { EstimateDraft, IncomeLine, OptimizationCheck } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p,
} as unknown as Client);
const biz = (p: Partial<IncomeLine> = {}): IncomeLine => ({
  id: 'b1', person: 'client', source: 'business', entityRef: 'bz1', label: 'העסק', actualToCutoff: 270_000, turnoverToCutoff: 300_000,
  office: { method: 'runRate' }, chosen: 'office', turnoverForecast: 100_000, ...p,
});
const PAID0 = Array.from({ length: 9 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, state: 'reported' as const, paid: 0 }));
const draft = (p: Partial<EstimateDraft> = {}): EstimateDraft => ({
  cutoffMonth: 9, preparedOn: '2026-10-11', lines: [biz()], oneOffs: [], adjustments: [],
  it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: PAID0 },
  ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, paidToCutoff: 27_000 },
  vat: { via: 'manual', periods: [] }, payments: [], savings: [], reconciliations: [], decisions: [], ...p,
});
const Y = { client: client(), taxYear: 2026 };
const near = (got: number, want: number, tol: number, what: string) => assert(Math.abs(got - want) <= tol, `${what}: התקבל ${got}, צפוי ${Math.round(want)} (±${tol})`);
const check = (cs: OptimizationCheck[] | undefined, id: string) => { const c = (cs ?? []).find(x => x.id === id); assert(!!c, `אין בדיקה ${id}`); return c!; };

export const TESTS: TestCase[] = [
  test('מועדים: מ״ה — ה-15 בחודש שאחרי התקופה (דצמבר ⇒ ינואר הבא); ב״ל — ה-15 בחודש שאחרי (בהוראת קבע 22)', () => {
    equal(itDueDate('2026-10'), '2026-11-15');
    equal(itDueDate('2026-12'), '2027-01-15');
    equal(niDueDate('2026-10'), '2026-11-15');
    equal(niDueDate('2026-12'), '2027-01-15');
  }),

  test('תזרים: שלוש מקדמות מ״ה ושלוש של ב״ל אחרי ספטמבר, במועדים ובסכומים של המקדמות; יתרת סוף שנה בלי תאריך', () => {
    const o = computeEstimate(draft(), Y);
    const it = (o.cashflow ?? []).filter(x => x.authority === 'it' && x.kind === 'advance');
    equal(it.map(x => x.date).join(','), '2026-11-15,2026-12-15,2027-01-15');
    // מחזור צפוי 100,000 לשלושה חודשים ⇒ 33,333 לחודש; 5% היום = 1,667; ההמלצה 16.5% (מעוגלת כלפי מעלה) = 5,500
    near(it[0].current, 1_667, 1, 'מ״ה היום לחודש');
    near(it[0].recommended, 5_500, 1, 'מ״ה מומלץ לחודש');
    const ni = (o.cashflow ?? []).filter(x => x.authority === 'ni' && x.kind === 'advance');
    equal(ni.length, 3);
    equal(ni[0].date, '2026-11-15');
    equal(ni[0].current, 3_000);
    const ye = (o.cashflow ?? []).filter(x => x.kind === 'yearEnd');
    assert(ye.length === 2 && ye.every(x => !x.date && x.dateBasis === 'unknown'), 'יתרה — אין מועד מומצא');
    const nt = nearTerm(o.cashflow ?? [], '2026-10-13', 60);
    // עד 12.12: מ״ה 15.11 וב״ל 15.11 (15.12 כבר אחרי החלון) ⇒ 1,667 + 3,000 היום
    near(nt.current, 1_667 + 3_000, 2, 'השפעה מיידית במקדמות הנוכחיות');
  }),

  test('חסרים נתוני הכנסה ⇒ אין תזרים (לא לוח תשלומים מנתונים חסרים)', () => {
    const o = computeEstimate(draft({ lines: [biz({ actualToCutoff: undefined })] }), Y);
    equal((o.cashflow ?? []).length, 0);
  }),

  test('יישור: «הלקוח מסר» אינו קריאה מהרשות — חוסם; קריאה עם תאריך — «המשרד בדק»; מהאוטומציה — «נקרא מהרשות»', () => {
    const o1 = computeEstimate(draft({ it: { via: 'client', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: PAID0 } }), Y);
    const a1 = (o1.alignment ?? []).find(a => a.authority === 'it')!;
    equal(a1.state, 'clientStated');
    assert(o1.blockers.some(b => b.code === 'it_not_read' && b.text.includes('מהלקוח')), 'חוסם עם הסבר');
    const o2 = computeEstimate(draft(), Y);
    equal((o2.alignment ?? []).find(a => a.authority === 'it')!.state, 'officeEntered');
    const o3 = computeEstimate(draft({ ni: { via: 'automation', readOn: '2026-10-12', monthlyAdvance: 3_000, paidToCutoff: 27_000 } }), Y);
    equal((o3.alignment ?? []).find(a => a.authority === 'ni')!.state, 'readFromAuthority');
  }),

  test('מהכרטיס: ערך שהגיע מהשאלון — «הלקוח מסר», לא קריאה מהרשות (תוקן 13.10)', () => {
    const c = client({ pitAdvancePercent: 7, niAdvanceMonthly: 2_000, fieldMeta: {
      pitAdvancePercent: { source: 'questionnaire', syncedAt: '2026-09-01T10:00:00Z' },
      niAdvanceMonthly: { source: 'shaam', syncedAt: '2026-10-01T10:00:00Z' },
    } } as unknown as Partial<Client>);
    const r = cardAdvances(c);
    equal(r.it?.via, 'client');
    equal(r.it?.readOn, undefined);
    equal(r.ni?.via, 'automation');
    equal(r.ni?.readOn, '2026-10-01');
  }),

  test('חסר ≠ 0: 134 בלי חלק מהתקופות; ב״ל — חודש שחויב ואין תשלום, וחודש בלי נתון — חוסמים', () => {
    const o = computeEstimate(draft({ it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: PAID0.slice(0, 6) } }), Y);
    assert(o.blockers.some(b => b.code === 'it_periods_missing' && b.text.includes('7, 8, 9')), JSON.stringify(o.blockers.map(b => b.text)));
    const g = niPaymentGaps({ via: 'manual', readOn: '2026-10-10', periods: [
      ...Array.from({ length: 7 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, paid: 3_000, charged: 3_000 })),
      { period: '2026-08', charged: 3_000 },
    ] }, 9, 2026);
    equal(g.chargedUnpaid.join(','), '2026-08');
    equal(g.missing.join(','), '2026-09');
    const o2 = computeEstimate(draft({ ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, periods: [{ period: '2026-08', charged: 3_000 }] } }), Y);
    assert(o2.blockers.some(b => b.code === 'ni_paid_missing' && b.text.includes('חיוב אינו תשלום')), 'חיוב בלי תשלום');
    // «טרם הגיע המועד» אינו חסר
    const nd = PAID0.slice(0, 8).concat([{ period: '2026-09', state: 'not_due' as unknown as 'reported', paid: undefined as unknown as number }]);
    const o3 = computeEstimate(draft({ it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: nd } }), Y);
    assert(!o3.blockers.some(b => b.code === 'it_periods_missing'), 'not_due אינו חסר');
  }),

  test('«מה בדקנו» — קרן השתלמות: השלמה עד 4.5% × 293,397 = 13,203; חיסכון בשולי 35% ≈ 4,621', () => {
    const o = computeEstimate(draft(), Y);
    const c = check(o.checks, 'sf-client');
    equal(c.status, 'saving');
    near(c.saving!, 13_203 * 0.35, 3, 'חיסכון קרן השתלמות');
    assert(!!c.action?.includes('31.12.2026'), 'הפעולה עם מועד');
  }),

  test('«מה בדקנו» — פנסיה: השלמה נעצרת לפני רף עמית מוטב (26,435); חיסכון ≈ 6,329 (ניכוי 18,084 × 35%) + 2,923 (זיכוי 35% × 8,351)', () => {
    // ביד: Q = 164,400. ניכוי 7% = 11,508; בסיס לזיכוי 5% = 8,220; תוספת מעל 12% = min(26,435 − 19,728, 4%Q = 6,576) = 6,576;
    //   נשאר 131 ⇒ זיכוי נוסף 0.5% על 131. ניכוי 18,084 בשולי 35% (חייב 341,251 ⇒ 323,167) = 6,329.4; זיכוי 35% × 8,351 = 2,922.9.
    const o = computeEstimate(draft(), Y);
    const c = check(o.checks, 'pen-client');
    equal(c.status, 'saving');
    assert(!!c.action?.includes('26,435'), c.action ?? '');
    // ‼ 16.10.2026 (R11): הניכוי לפנסיה מקטין גם את ההכנסה לב״ל (345) ⇒ הלאומי יורד ב-18,084 ÷ 1.0667 × 12.83% ≈ 2,175, ולכן ניכוי 47א
    //   קטן ב-52% מזה (1,131) ⇒ במס הכנסה 1,131 × 35% ≈ 396 פחות חיסכון. החיסכון בב״ל מוצג בנפרד בפירוט.
    near(c.saving!, 6_329.4 + 2_922.9 - 0.35 * 0.52 * 0.1283 * 18_084 / (1 + 0.52 * 0.1283), 3, 'חיסכון פנסיה');
    assert(c.detail.includes('ב״ל'), c.detail);
    assert(c.detail.includes('עמית מוטב'), 'מסביר למה נעצר');
  }),

  test('«מה בדקנו» — ההערכה אחרי סוף השנה: הפקדה עכשיו לא נספרת לשנה ⇒ «לא רלוונטי», לא חיסכון', () => {
    const o = computeEstimate(draft({ preparedOn: '2027-02-01', cutoffMonth: 12, lines: [biz({ actualToCutoff: 360_000, turnoverToCutoff: 400_000, turnoverForecast: 0 })],
      it: { via: 'manual', readOn: '2027-01-20', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: Array.from({ length: 12 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, state: 'reported' as const, paid: 0 })) },
      ni: { via: 'manual', readOn: '2027-01-20', monthlyAdvance: 3_000, paidToCutoff: 36_000 } }), Y);
    equal(check(o.checks, 'sf-client').status, 'notApplicable');
    equal(check(o.checks, 'pen-client').status, 'notApplicable');
  }),

  test('«מה בדקנו» — שכיר בלי עסק: קרן ופנסיה לעצמאי «לא רלוונטי» (לא «נבדק — אין חיסכון»)', () => {
    const o = computeEstimate(draft({ lines: [{ id: 's1', person: 'client', source: 'salary', label: 'משכורת', actualToCutoff: 135_000, office: { method: 'runRate' }, chosen: 'office' }] }), Y);
    equal(check(o.checks, 'sf-client').status, 'notApplicable');
    equal(check(o.checks, 'pen-client').status, 'notApplicable');
  }),

  test('«מה בדקנו» — גיל 50 ומעלה: הפנסיה «לא נתמכת — ביד», לא מספר', () => {
    const o = computeEstimate(draft({ decisions: [{ ruleId: 'pen.trackA.age50', text: 'x' }] }), { client: client({ birthDate: '1970-01-01' }), taxYear: 2026 });
    equal(check(o.checks, 'pen-client').status, 'notSupported');
  }),

  test('יישור מחזור: רק כשהקריאה מכסה את חודש החתך — דו-חודשי עד אוגוסט מול חתך ספטמבר אינו «פער» (תוקן 13.10)', () => {
    const it = (ps: number[], t: number) => ({ via: 'manual' as const, readOn: '2026-10-10', method: 'turnoverRate' as const, ratePct: 5, frequency: 2 as const, periods: ps.map(m => ({ period: `2026-${String(m).padStart(2, '0')}`, state: 'reported' as const, turnover: t })) });
    equal(reconciliationsNeeded(draft({ it: it([2, 4, 6, 8], 30_000) }), 2026).length, 0);
    const d8 = draft({ cutoffMonth: 8, it: it([2, 4, 6, 8], 30_000) });
    equal(reconciliationsNeeded(d8, 2026).length, 1);
    const monthly = draft({ it: { ...draft().it, periods: PAID0.map(p => ({ ...p, turnover: 30_000 })) } });
    equal(reconciliationsNeeded(monthly, 2026).length, 1);
    const match = draft({ it: { ...draft().it, periods: PAID0.map(p => ({ ...p, turnover: 300_000 / 9 })) } });
    equal(reconciliationsNeeded(match, 2026).length, 0);
  }),
];
