// ב״ל — הנוסחאות מול הדוגמאות שבאתר ב״ל (נקראו 16.10.2026). אורקל חיצוני, לא חישוב שלנו.
// ‼ דף «עובד עצמאי ובעל הכנסה שלא מעבודה»: הכותרות מעודכנות ל-2026, אבל המספרים בדוגמה מחושבים בערכי 2020
//   (שכר ממוצע 10,551; מופחת 2.87% / 3.1%; בריאות רגיל 5%; פטור 25% = 2,638). לכן הבדיקה מציבה את ערכי 2020 —
//   היא בודקת את צורת הנוסחה (345 ואז 348, השיעור המופחת «נצרך» בעסק), לא את ערכי השנה.
import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { niNonWorkIncome, niSelfEmployedBase } from '../calc';

const near = (a: number, b: number, tol: number, m: string) => assert(Math.abs(a - b) <= tol, `${m}: ${a.toFixed(1)} מול ${b}`);

export const TESTS: TestCase[] = [
  test('דף ב״ל: עצמאי 10,000 + שלא מעבודה 8,000 לחודש ⇒ 2,925 + 1,830 לרבעון (ערכי הדוגמה)', () => {
    // עצמאי: x = (30,000 + 1.8 × 10,551 × (12.83% − 2.87%) × 0.52) ÷ (1 + 0.52 × 12.83%) = 29,045
    const m3 = 10_551 * 3 * 0.6;
    const base = niSelfEmployedBase(30_000, m3, 0.0287, 0.1283);
    near(base, 29_045, 1, 'בסיס רבעוני לעצמאי');
    const seTotal = m3 * (0.0287 + 0.031) + (base - m3) * (0.1283 + 0.05);
    near(seTotal, 2_925, 3, 'עצמאי לרבעון'); // הדף: 545 + 1,290 + 589 + 503 (מעוגלים) ⇒ «2,925»
    // שלא מעבודה: 24,000 ÷ (1 + 0.07 × 0.52) = 23,157; פחות 3 × 2,638 = 15,243; × (7% + 5%) = 1,830
    const nw = niNonWorkIncome({ income: 24_000, exempt: 3 * 2_638, lowAvail: 0, maxAvail: Infinity, lowNi: 0.0692, highNi: 0.07, health: 0.05 });
    near(nw.reduced345, 23_157, 1, 'אחרי 345');
    near(nw.chargeable, 15_243, 1, 'אחרי 348');
    near(nw.ni + nw.health, 1_830, 1, 'שלא מעבודה לרבעון');
  }),
  test('ערכי 2026 על אותו מקרה: 345 ואז 348 (3,442), שיעור רגיל — 7% + 5.17%', () => {
    const nw = niNonWorkIncome({ income: 24_000, exempt: 3 * 3_442, lowAvail: 0, maxAvail: Infinity, lowNi: 0.0692, highNi: 0.07, health: 0.0517 });
    near(nw.chargeable, 24_000 / 1.0364 - 10_326, 0.5, 'חייב');
    near(nw.ni + nw.health, (24_000 / 1.0364 - 10_326) * 0.1217, 0.5, 'לרבעון');
  }),
  test('מי שאינו עובד, שכ״ד חייב 12,000 לחודש (דף ב״ל 2026): הפחתה ולא מצוק — חייב על 8,558; בלי 345 ⇒ 1,035', () => {
    // הדף: «חישוב משוער» בלי הפחתת 345 — 7,703 × 12.09% + 855 × 12.17% = 1,035
    const no345 = niNonWorkIncome({ income: 12_000, exempt: 3_442, lowAvail: 7_703, maxAvail: 51_910, lowNi: 0.0692, highNi: 0.07, health: 0.0517, share: 0 });
    near(no345.chargeable, 8_558, 0.5, 'חייב');
    near(no345.ni + no345.health, 1_035, 1, 'לחודש');
    // עם 345 (כמו בדף העצמאי) — נמוך יותר; ההפרש מוצג בהערכה כשאלה פתוחה, לא נבחר בשקט
    const with345 = niNonWorkIncome({ income: 12_000, exempt: 3_442, lowAvail: 7_703, maxAvail: 51_910, lowNi: 0.0692, highNi: 0.07, health: 0.0517 });
    assert(with345.ni + with345.health < no345.ni + no345.health, 'עם 345 — פחות');
  }),
  test('הכנסה מתחת לסכום הפטור — אין דמי ביטוח; התקרה נעצרת אחרי הכנסת העבודה', () => {
    const z = niNonWorkIncome({ income: 3_000, exempt: 3_442, lowAvail: 7_703, maxAvail: 51_910, lowNi: 0.0692, highNi: 0.07, health: 0.0517 });
    assert(z.ni === 0 && z.health === 0, 'פטור');
    const cap = niNonWorkIncome({ income: 100_000, exempt: 3_442, lowAvail: 0, maxAvail: 1_000, lowNi: 0.0692, highNi: 0.07, health: 0.0517 });
    near(cap.chargeable, 1_000, 0, 'עד התקרה');
  }),
];
