// ─── בדיקות: הכנסה ⇄ בסיס ⇄ מקדמה בביטוח לאומי לעצמאי ──────────────────────
// ‼ מקרה הרגרסיה הוא מקרה אמת (23.09.2026): בפורטל «דמי ביטוח: 2026 / 7-9
// בסיס: עצמאי 47,583 … סכום: 2062», וברשימת ההכנסות — הצהרה ל-2025 על
// 16,500 ₪ לחודש. הבדיקות מריצות את השרשרת עצמה, לא משוות למספר קשיח
// שהוזן מראש לפונקציה.

import { test, assert, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  niForward, niReverse, niComponents, niSelfEmployedYear, niCrossCheck,
  normalizeNiPeriod, niDisplayRound, niAdvancementFactor,
} from '../niContribution';

const near = (a: number, b: number, eps: number, what: string) =>
  assert(Math.abs(a - b) <= eps, `${what}: expected ≈${b}, got ${a}`);

const cfg2026 = () => {
  const c = niSelfEmployedYear(2026);
  assert(c, 'פרמטרי 2026 חייבים להיות זמינים');
  return c;
};

export const TESTS: TestCase[] = [
  test('רגרסיה: 47,583 לרבעון 7–9/2026 ⇒ ≈16,500 לחודש, דרך כל החוליות', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
    assert(r.ok, 'השחזור חייב להצליח');
    near(r.monthlyBasis, 15_861, 1e-9, 'b = 47,583 / 3');
    near(r.components.nationalInsurance, 1_390.9955, 1e-3, 'N(b)');
    near(r.components.health, 670.5755, 1e-3, 'בריאות');
    near(r.advancedIncome, 16_584.31766, 1e-3, 'y = b + 0.52·N(b)');
    equal(r.advancementFactor, 1.0051, 'k');
    near(r.originalMonthlyIncome, 16_500.17, 0.01, 'I = y / 1.0051');
    equal(niDisplayRound(r.originalMonthlyIncome), 16_500, 'מוצג כ-16,500');
    equal(r.advanceDisplayed, 2_062, 'המקדמה שהבסיס מייצר = המקדמה בפורטל');
  }),

  test('רגרסיה קדימה: 16,500 ⇒ 16,584.15 ⇒ 15,860.84 ⇒ 47,583 ⇒ 2,062', () => {
    const f = niForward({ originalMonthlyIncome: 16_500, insuranceYear: 2026, sourceIncomeYear: 2025, months: 3 });
    assert(f.ok, 'החישוב קדימה חייב להצליח');
    near(f.advancedIncome, 16_584.15, 1e-6, 'y');
    near(f.monthlyBasis, 15_860.84, 0.01, 'b');
    near(f.periodBasis, 47_582.53, 0.01, 'B לפני עיגול');
    equal(f.periodBasisDisplayed, 47_583, 'B מוצג');
    near(f.advanceMonthly, 2_061.54, 0.01, 'מקדמה לפני עיגול');
    equal(f.advanceDisplayed, 2_062, 'מקדמה מוצגת');
    equal(f.capped, false, 'לא בתקרה');
  }),

  test('קדימה ואחורה מתיישבים: B מוצג ⇒ I ⇒ אותו B מוצג', () => {
    for (const I of [3_000, 7_000, 9_500, 16_500, 32_000]) {
      const f = niForward({ originalMonthlyIncome: I, insuranceYear: 2026, sourceIncomeYear: 2025, months: 3 });
      assert(f.ok, 'קדימה');
      const r = niReverse({ periodBasis: f.periodBasisDisplayed, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
      assert(r.ok, 'אחורה');
      const [lo, hi] = r.originalMonthlyIncomeRange;
      assert(lo <= I + 1e-6 && I <= hi + 1e-6, `${I} חייב להיות בתוך טווח העיגול [${lo}, ${hi}]`);
      const back = niForward({ originalMonthlyIncome: r.originalMonthlyIncome, insuranceYear: 2026, sourceIncomeYear: 2025, months: 3 });
      assert(back.ok, 'קדימה שוב');
      equal(back.periodBasisDisplayed, f.periodBasisDisplayed, `הלוך-חזור ל-${I}`);
    }
  }),

  test('מדרגה מופחתת בלבד: b מתחת ל-7,703 ⇒ 4.47% + 3.23%, בלי החלק העליון', () => {
    const c = niComponents(5_000, cfg2026());
    near(c.nationalInsurance, 5_000 * 0.0447, 1e-9, 'לאומי');
    near(c.health, 5_000 * 0.0323, 1e-9, 'בריאות');
    const r = niReverse({ periodBasis: 15_000, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
    assert(r.ok, 'שחזור');
    near(r.advancedIncome, 5_000 * (1 + 0.52 * 0.0447), 1e-6, 'y במקטע התחתון');
  }),

  test('חציית המדרגה: הרכיב העליון מחושב רק על מה שמעל 7,703', () => {
    const c = niComponents(7_703 + 1_000, cfg2026());
    near(c.nationalInsurance, 0.0447 * 7_703 + 0.1283 * 1_000, 1e-9, 'לאומי');
    near(c.health, 0.0323 * 7_703 + 0.0517 * 1_000, 1e-9, 'בריאות');
    // רציפות במדרגה עצמה — אין קפיצה
    const at = niComponents(7_703, cfg2026());
    near(at.total, 7_703 * (0.0447 + 0.0323), 1e-9, 'בדיוק במדרגה');
  }),

  test('ה-52% מנוכים מהלאומי בלבד — לא מהבריאות', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
    assert(r.ok, 'שחזור');
    const withHealth = r.monthlyBasis + 0.52 * r.components.total;
    assert(Math.abs(r.advancedIncome - withHealth) > 300, 'אם הבריאות הייתה נכללת, y היה גבוה בכ-350 ₪');
    near(r.advancedIncome, r.monthlyBasis + 0.52 * r.components.nationalInsurance, 1e-9, 'y');
  }),

  test('שנת מקור חסרה ⇒ «אין מספיק מידע», לא מספר', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026 });
    equal(r.ok, false, 'לא מחשב');
    equal(r.confidence, 'insufficient', 'רמת ביטחון');
    if (!r.ok) equal(r.reason, 'missing_source_year', 'סיבה');
  }),

  test('שנת מקור מונחת רק כשמבקשים — ואז זו הערכה ולא ודאות', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, assumeSourceYear: true, additionalDeduction: 0 });
    assert(r.ok, 'מחשב');
    equal(r.confidence, 'estimate', 'הערכה');
    assert(r.assumptions.includes('source_year_assumed'), 'ההנחה רשומה');
    equal(r.sourceIncomeYear, 2025, 'השנה הקודמת');
  }),

  test('מקדם קידום לא מאומת ⇒ «אין מספיק מידע» (לא k=1)', () => {
    equal(niAdvancementFactor(2026, 2024), null, 'אין מקדם 2024→2026');
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2024 });
    equal(r.ok, false, 'לא מחשב');
    if (!r.ok) equal(r.reason, 'unsupported_advancement', 'סיבה');
    const f = niForward({ originalMonthlyIncome: 16_500, insuranceYear: 2026, sourceIncomeYear: 2026, months: 3 });
    equal(f.ok, false, 'גם קדימה — גם לא «אותה שנה ⇒ 1»');
  }),

  test('שנת ביטוח בלי פרמטרים ⇒ לא מניחים את 2026', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2030, sourceIncomeYear: 2029 });
    equal(r.ok, false, 'לא מחשב');
    if (!r.ok) equal(r.reason, 'unsupported_year', 'סיבה');
  }),

  test('ניכוי נוסף: ידוע ⇒ «שלם»; לא נמסר ⇒ «הערכה»', () => {
    const known = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025, additionalDeduction: 0 });
    assert(known.ok, 'מחשב');
    equal(known.confidence, 'complete', 'כל הקלטים ידועים');
    const unknown = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
    assert(unknown.ok, 'מחשב');
    equal(unknown.confidence, 'estimate', 'D חסר');
    const withD = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025, additionalDeduction: 1_000 });
    assert(withD.ok, 'מחשב');
    near(withD.originalMonthlyIncome - known.originalMonthlyIncome, 1_000 / 1.0051, 1e-6, 'D מוסיף D/k');
  }),

  test('כמה מעמדות ⇒ הערכה, גם כשכל השאר ידוע', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025, additionalDeduction: 0, statusesCount: 2 });
    assert(r.ok, 'מחשב');
    equal(r.confidence, 'estimate', 'לא שלם');
    assert(r.assumptions.includes('multiple_statuses'), 'הסיבה רשומה');
  }),

  test('בסיס בתקרה ⇒ ההכנסה היא חסם תחתון, מסומן', () => {
    const max = cfg2026().maxBasisMonthly;
    const r = niReverse({ periodBasis: max * 3, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025, additionalDeduction: 0 });
    assert(r.ok, 'מחשב');
    assert(r.assumptions.includes('at_max_basis'), 'מסומן');
    equal(r.confidence, 'estimate', 'לא שלם');
    const f = niForward({ originalMonthlyIncome: 200_000, insuranceYear: 2026, sourceIncomeYear: 2025, months: 3 });
    assert(f.ok && f.capped, 'קדימה נחתך בתקרה');
  }),

  test('עיגול: הבסיס המוצג מעוגל ⇒ טווח הכנסות, והטווח צר', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
    assert(r.ok, 'מחשב');
    const [lo, hi] = r.originalMonthlyIncomeRange;
    assert(lo < r.originalMonthlyIncome && r.originalMonthlyIncome < hi, 'הנקודה בתוך הטווח');
    assert(hi - lo < 0.5, `טווח צר (${hi - lo})`);
    assert(lo <= 16_500 && 16_500 <= hi, '16,500 בתוך הטווח');
    const exact = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025, basisIsRounded: false });
    assert(exact.ok, 'מחשב');
    equal(exact.originalMonthlyIncomeRange[0], exact.originalMonthlyIncomeRange[1], 'בלי עיגול — נקודה');
  }),

  test('נרמול תקופה: «7-9», «9-7», «7–9» ⇒ שלושה חודשים; חודש יחיד ⇒ אחד', () => {
    for (const t of ['7-9', '9-7', '7–9', ' 9 - 7 ']) {
      const p = normalizeNiPeriod(t);
      assert(p, t);
      equal(p.months, 3, t);
      equal(p.fromMonth, 7, t);
      equal(p.toMonth, 9, t);
    }
    equal(normalizeNiPeriod('6')?.months, 1, 'חודש יחיד');
    equal(normalizeNiPeriod(''), null, 'ריק');
    equal(normalizeNiPeriod('13-15'), null, 'לא חודשים');
  }),

  test('בדיקת עקביות מול ערך ישיר: 16,500 תואם, 17,000 לא', () => {
    const r = niReverse({ periodBasis: 47_583, months: 3, insuranceYear: 2026, sourceIncomeYear: 2025 });
    assert(r.ok, 'מחשב');
    equal(niCrossCheck(r, 16_500), true, '16,500');
    equal(niCrossCheck(r, 17_000), false, '17,000');
  }),
];
