// פנסיה לעמית עצמאי — מול הדוגמאות בפרק ד במדריך 2025 (סעיפים 53, 76) ומול חישוב ידני עצמאי.
// ‼ לא «11% ניכוי + 5.5% זיכוי» גורף: הסדר ניכוי 7% → זיכוי עד 5% → תוספת ניכוי רק מעל 12%; מסלול ב׳ לעמית מוטב.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { selfEmployedPension } from '../calc';

const base = { year: 2025, salary: 0, ageOnJan1: 40 };

export const TESTS: TestCase[] = [
  test('דוגמת המדריך (מסלול א׳): הכנסה 100,000, הפקדה 17,000 ⇒ ניכוי 11,000, זיכוי על 5,000, זיכוי נוסף על 500', () => {
    const r = selfEmployedPension({ ...base, nonWorkIncome: 100_000, businessIncome: 100_000, ownDeposits: 17_000 });
    assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.track, 'A'); equal(r.value!.deduction, 11_000); equal(r.value!.creditBase, 5_000); equal(r.value!.extraCreditBase, 500);
    equal(r.value!.credit, Math.round(0.35 * 5_500));
  }),
  test('הפקדה קטנה: 10,000 על 300,000 ⇒ כולה ניכוי (מתחת ל-7% מהתקרה), אין זיכוי', () => {
    const r = selfEmployedPension({ ...base, nonWorkIncome: 300_000, businessIncome: 300_000, ownDeposits: 10_000 });
    equal(r.value!.track, 'A'); equal(r.value!.deduction, 10_000); equal(r.value!.creditBase, 0); equal(r.value!.extraCreditBase, 0);
  }),
  test('עמית מוטב (300,000, הפקדה 40,000) ⇒ מסלול ב׳: ניכוי 22,915, זיכוי על 11,640; מסלול א׳ כחלופה: 18,084 / 8,220 / 1,164', () => {
    const r = selfEmployedPension({ ...base, nonWorkIncome: 300_000, businessIncome: 300_000, ownDeposits: 40_000 });
    assert(r.ok && r.value!.beneficial, 'עמית מוטב');
    equal(r.value!.track, 'B'); equal(r.value!.deduction, 22_915); equal(r.value!.creditBase, 11_640);
    equal(r.value!.alternative?.track, 'A'); equal(r.value!.alternative?.deduction, 18_084); equal(r.value!.alternative?.creditBase, 8_220); equal(r.value!.alternative?.extraCreditBase, 1_164);
    const a = selfEmployedPension({ ...base, nonWorkIncome: 300_000, businessIncome: 300_000, ownDeposits: 40_000, forceTrackA: true });
    equal(a.value!.track, 'A'); equal(a.value!.deduction, 18_084);
  }),
  test('שכיר-עצמאי: משכורת מבוטחת 120,000 + עסק 150,000, הפקדה 20,000 (עובד 7,200, מעביד 15,000) ⇒ מסלול ב׳: ניכוי 12,311, זיכוי על 5,820', () => {
    const r = selfEmployedPension({ year: 2025, ageOnJan1: 40, nonWorkIncome: 150_000, businessIncome: 150_000, salary: 120_000, insuredSalary: 120_000, ownDeposits: 20_000, employeeDeposits: 7_200, employerDeposits: 15_000 });
    assert(r.ok, JSON.stringify(r.problems));
    equal(r.value!.track, 'B'); equal(r.value!.deduction, 12_311); equal(r.value!.creditBase, 5_820);
  }),
  test('משכורת מקטינה את תקרת ההכנסה המזכה במסלול א׳ (משכורת מבוטחת 60,000: 164,400 − 60,000)', () => {
    const r = selfEmployedPension({ year: 2025, ageOnJan1: 40, nonWorkIncome: 200_000, businessIncome: 200_000, salary: 60_000, insuredSalary: 60_000, ownDeposits: 10_000 });
    equal(r.value!.track, 'A'); equal(r.value!.deduction, Math.round(0.07 * 104_400)); equal(r.value!.creditBase, 10_000 - Math.round(0.07 * 104_400));
  }),
  test('לא מחושב (בעיה, לא תוצאה): גיל לא ידוע, משכורת בלי הכנסה מבוטחת; מחושב (14.10.2026): גיל 50 עם משכורת, משכורת לא מבוטחת', () => {
    assert(selfEmployedPension({ ...base, ageOnJan1: 52, salary: 50_000, insuredSalary: 50_000, nonWorkIncome: 100_000, businessIncome: 100_000, ownDeposits: 10_000 }).ok, 'גיל 50 עם משכורת — מחושב');
    assert(!selfEmployedPension({ year: 2025, salary: 0, nonWorkIncome: 100_000, businessIncome: 100_000, ownDeposits: 10_000 }).ok, 'גיל לא ידוע');
    assert(!selfEmployedPension({ ...base, salary: 50_000, nonWorkIncome: 100_000, businessIncome: 100_000, ownDeposits: 10_000 }).ok, 'הכנסה מבוטחת לא ידועה');
    assert(selfEmployedPension({ ...base, salary: 50_000, insuredSalary: 30_000, nonWorkIncome: 100_000, businessIncome: 100_000, ownDeposits: 10_000 }).ok, 'משכורת לא מבוטחת במסלול א׳ — מחושב (47(ב)(2))');
  }),
  test('ניכוי אובדן כושר שולל את הזיכוי הנוסף 0.5%', () => {
    const r = selfEmployedPension({ ...base, nonWorkIncome: 100_000, businessIncome: 100_000, ownDeposits: 17_000, disabilityDeduction: true });
    equal(r.value!.extraCreditBase, 0);
  }),
];
