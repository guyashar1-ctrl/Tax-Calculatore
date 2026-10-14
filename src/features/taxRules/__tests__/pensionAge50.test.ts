// פנסיה לעצמאי מגיל 50 (13.10.2026) — research/pension-age50-2026-10-13.md, סעיף 5.
// אורקלים: O1 = דוגמת המדריך (DA25 עמ׳ 61); O3 = 11,550 של מקור מקצועי (BP06); השאר — מהאלגוריתם במחקר.
// ‼ בתחולה בלבד: מסלול א׳ (לא עמית מוטב), עצמאי בלי משכורת. O4–O6 במחקר הם הפקדות מעל רף עמית מוטב — שם חל מסלול ב׳.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { selfEmployedPension } from '../calc';

const run = (Q: number, P: number, age: number, extra: Partial<Parameters<typeof selfEmployedPension>[0]> = {}) =>
  selfEmployedPension({ year: 2026, nonWorkIncome: Q, businessIncome: Q, salary: 0, insuredSalary: 0, ownDeposits: P, ageOnJan1: age, disabilityDeduction: true, ...extra });

export const TESTS: TestCase[] = [
  test('O1 מתחת לגיל 50 (דוגמת המדריך): הכנסה 100,000, הפקדה 14,500 ⇒ ניכוי 9,500, בסיס זיכוי 5,000', () => {
    const r = run(100_000, 14_500, 45); assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.deduction, 9_500); equal(r.value!.creditBase, 5_000);
  }),
  test('O1׳ מגיל 50: אותה הפקדה ⇒ ניכוי 10,500, בסיס זיכוי 4,000 (הניכוי נחשב ראשון)', () => {
    const r = run(100_000, 14_500, 51); assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.deduction, 10_500); equal(r.value!.creditBase, 4_000);
    assert(r.value!.explain.join(' ').includes('אין שינוי לעומת מי שמתחת לגיל 50'), 'ההערה על התקרות');
  }),
  test('O2 מגיל 50: הפקדה 21,500 ⇒ ניכוי 16,500 (מתחת לגיל 50: 11,000)', () => {
    equal(run(100_000, 21_500, 51).value!.deduction, 16_500);
    equal(run(100_000, 21_500, 45).value!.deduction, 11_000);
  }),
  test('O3 מגיל 50: הכנסה 70,000, הפקדה 15,050 ⇒ ניכוי 11,550 (המספר של המקור המקצועי)', () => {
    equal(run(70_000, 15_050, 50).value!.deduction, 11_550);
  }),
  test('O7 מגיל 50, הכנסה מעל התקרה: הבסיסי עד 11,508 — לא 10.5% × 164,400', () => {
    const r = run(300_000, 17_262, 55); assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.deduction, 11_508); equal(r.value!.creditBase, 5_754);
  }),
  test('עמית מוטב מגיל 50 (הפקדה מעל הרף): מסלול ב׳, בלי ההגדלה; בחירה כפויה במסלול א׳ — לא מחושבת', () => {
    const r = run(130_000, 30_000, 55); assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.track, 'B');
    const f = run(130_000, 30_000, 55, { forceTrackA: true });
    assert(!f.ok && f.problems.some(p => (p as { tag?: string }).tag === 'age50plusBeneficialTrackA'), JSON.stringify(f.problems));
  }),
  // ── 14.10.2026 · עם משכורת (research/pension-salary-ceilings §2.3). עוגן רשמי: מדריך 2025 דוגמה 3; השאר — מהאלגוריתם במחקר ──
  test('מדריך 2025 דוגמה 3 (מתחת ל-50): משכורת 60,000, מבוטחת 50,000, הכנסה אחרת 100,000, הפקדה 14,000 ⇒ ניכוי 9,500', () => {
    const r = run(100_000, 14_000, 45, { salary: 60_000, insuredSalary: 50_000 }); assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.deduction, 9_500);
  }),
  test('M2 מגיל 50, משכורת 60,000 לא מבוטחת, אחרת 80,000, הפקדה 20,000 ⇒ 17,700 (מתחת ל-50: 11,800)', () => {
    equal(run(80_000, 20_000, 52, { salary: 60_000, insuredSalary: 0 }).value!.deduction, 17_700);
    equal(run(80_000, 20_000, 45, { salary: 60_000, insuredSalary: 0 }).value!.deduction, 11_800);
  }),
  test('M3 מגיל 50, משכורת 100,000 מבוטחת 60,000, אחרת 70,000, הפקדה 12,000 ⇒ 11,780 (מתחת ל-50: 9,084)', () => {
    equal(run(70_000, 12_000, 52, { salary: 100_000, insuredSalary: 60_000, employeeDeposits: 3_600, employerDeposits: 7_500 }).value!.deduction, 11_780);
    equal(run(70_000, 12_000, 45, { salary: 100_000, insuredSalary: 60_000, employeeDeposits: 3_600, employerDeposits: 7_500 }).value!.deduction, 9_084);
  }),
  test('M4 מגיל 50, משכורת מבוטחת לגמרי 30,000, אחרת 150,000, הפקדה 18,000 ⇒ 11,508 (התקרה הקבועה; מתחת ל-50: 11,280)', () => {
    equal(run(150_000, 18_000, 52, { salary: 30_000, insuredSalary: 30_000 }).value!.deduction, 11_508);
    equal(run(150_000, 18_000, 45, { salary: 30_000, insuredSalary: 30_000 }).value!.deduction, 11_280);
  }),
  test('M1 מגיל 50, משכורת 20,000 לא מבוטחת, אחרת 180,000, הפקדה 22,000 ⇒ 16,280', () => {
    equal(run(180_000, 22_000, 52, { salary: 20_000, insuredSalary: 0 }).value!.deduction, 16_280);
  }),
  test('מגיל 50, משכורת מעל 291,000 עם חלק לא מבוטח — רק התרחיש הזה לא מחושב (המגבלה השנייה של 47(ב)(2)(ב) לא הוכרעה)', () => {
    const r = run(50_000, 8_000, 55, { salary: 330_000, insuredSalary: 260_000 });
    assert(!r.ok && r.problems.some(p => (p as { tag?: string }).tag === 'age50plusWithSalary'), JSON.stringify(r.problems));
  }),
  test('גיל לא ידוע — לא מחושב', () => {
    const r = selfEmployedPension({ year: 2026, nonWorkIncome: 100_000, businessIncome: 100_000, salary: 0, insuredSalary: 0, ownDeposits: 14_500 });
    assert(!r.ok, 'חסום');
  }),
];
