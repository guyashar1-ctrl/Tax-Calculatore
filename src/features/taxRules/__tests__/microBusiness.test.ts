// ─── בדיקות: עסק זעיר — microBusiness() (11.10.2026) ────────────────────────
// ‼ מה נעול כאן (מקרי הבדיקה בסעיף 6 של docs/tax-foundation/micro/micro-business-research-2026-10-11.md):
//   · ניכוי רגיל = 30% מהמחזור, «עד» התקרה כולל.
//   · חריגה (87ד(ג)) רק למי שהיה רשום בתחילת השנה, ועד 30% מהתקרה — לא מהמחזור.
//   · נרשם באמצע השנה או לא ידוע — אין ניכוי מוגבל, והתוצאה אומרת שזה לא הוכרע.
//   · צינון לפי החוק (87ה(ב)): ניכה ב-X, ב-X+1 הכנסה מעסק בלי ניכוי ⇒ שתי השנים שאחרי X+1.
//   · המעמד במע״מ אינו קלט — הוספה שלו לא משנה דבר.
//   · כל שינוי בכלל micro.* מסמן את כל הרכיבים שנשענים עליו (ruleUsage).

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { microBusiness } from '../calc';
import { ruleUsage } from '../impact';
import { OPEN_ITEMS } from '../openItems';
import { AVAILABLE } from '../../taxKnowledge/availability';

const v = (input: Parameters<typeof microBusiness>[0]) => {
  const r = microBusiness(input);
  assert(r.ok && !!r.value, `אין תוצאה: ${JSON.stringify(r.problems)}`);
  return r.value!;
};

export const TESTS: TestCase[] = [
  test('#1 2026, רשום 1.1, מחזור 100,000 ⇒ ניכוי 30,000 (ההוצאות בפועל אינן קלט)', () => {
    const r = v({ year: 2026, turnover: 100_000, registeredAtYearStart: true });
    equal(r.mode, 'regular');
    equal(r.eligibleByTurnover, true);
    equal(r.deduction, 30_000);
    equal(100_000 - r.deduction, 70_000);
  }),

  test('#2 2026, מחזור בדיוק 122,833 ⇒ זכאי (עד, כולל); ניכוי 36,849.90 בלי עיגול', () => {
    const r = v({ year: 2026, turnover: 122_833 });
    equal(r.ceiling, 122_833);
    equal(r.eligibleByTurnover, true);
    equal(r.mode, 'regular');
    equal(r.deduction, 36_849.9);
  }),

  test('תקרות לפי שנה: 2024 ו-2025 120,000; 2026 122,833 — לא ערך 2025 לשנת 2026', () => {
    equal(v({ year: 2024, turnover: 1 }).ceiling, 120_000);
    equal(v({ year: 2025, turnover: 1 }).ceiling, 120_000);
    equal(v({ year: 2026, turnover: 1 }).ceiling, 122_833);
  }),

  test('#5 2026, רשום 1.1, מחזור 150,000 ⇒ 87ד(ג): ניכוי עד 36,849.90 — לא 45,000; נתיב ההגשה פתוח', () => {
    const r = v({ year: 2026, turnover: 150_000, registeredAtYearStart: true });
    equal(r.mode, 'exceeded87dc');
    equal(r.eligibleByTurnover, false);
    equal(r.deduction, 36_849.9);
    equal(r.deductionCap, 36_849.9);
    assert(r.normativeExpenses === 45_000 && r.deduction < r.normativeExpenses, 'התקרה היא על הניכוי, לא 30% מהמחזור');
    assert(r.open.length > 0, 'הדיווח המקוון של 87ד(ג) מסומן כלא ידוע');
    // #5/#6: שתי חלופות נפרדות — הכנסה 113,150.10 בניכוי המוגבל; לא מוסיפים עליו הוצאות בפועל.
    equal(Math.round((150_000 - r.deduction) * 100) / 100, 113_150.1);
  }),

  test('#16 2025, רשום 1.1, מחזור 130,000 ⇒ ניכוי מרבי 36,000 (לא 15,000 בפועל ולא 39,000)', () => {
    const r = v({ year: 2025, turnover: 130_000, registeredAtYearStart: true });
    equal(r.mode, 'exceeded87dc');
    equal(r.deduction, 36_000);
    equal(r.deductionCap, 36_000);
  }),

  test('#11 נרשם באמצע השנה וחרג ⇒ בלי ניכוי מוגבל, עם הערה «לא הוכרע»; לא ידוע ⇒ גם בלי, עם הערה אחרת', () => {
    const mid = v({ year: 2026, turnover: 130_000, registeredAtYearStart: false });
    equal(mid.mode, 'exceededNoRelief');
    equal(mid.deduction, 0);
    equal(mid.deductionCap, undefined);
    assert(mid.open.some(o => o.includes('אחרי תחילת השנה')), mid.open.join(' | '));
    const unknown = v({ year: 2026, turnover: 130_000 });
    equal(unknown.mode, 'exceededNoRelief');
    equal(unknown.deduction, 0);
    assert(unknown.open.some(o => o.includes('לא ידוע')), unknown.open.join(' | '));
  }),

  test('#7 צינון אחרי חריגה: ניכה ב-2024, ב-2025 87ד(ג) («לא ניכה») ⇒ 2026 חסומה', () => {
    const r = v({ year: 2026, turnover: 90_000, registeredAtYearStart: true, history: [
      { year: 2024, deducted: true, hadBusinessIncome: true },
      { year: 2025, deducted: false, hadBusinessIncome: true },
    ] });
    equal(r.mode, 'blockedCooling');
    equal(r.deduction, 0);
    equal(JSON.stringify(r.coolingBlockedBy), JSON.stringify({ deductedIn: 2024, notDeductedIn: 2025 }));
  }),

  test('#8 צינון חל גם בשנת חריגה: ניכה ב-2024, ויתר ב-2025 ⇒ 2026 חסומה גם כשהמחזור מעל התקרה', () => {
    const r = v({ year: 2026, turnover: 150_000, registeredAtYearStart: true, history: [
      { year: 2024, deducted: true, hadBusinessIncome: true },
      { year: 2025, deducted: false, hadBusinessIncome: true },
    ] });
    equal(r.mode, 'blockedCooling');
    equal(r.deduction, 0);
  }),

  test('#9 בלי הכנסה מעסק בשנה שאחרי הניכוי ⇒ אין צינון', () => {
    const r = v({ year: 2026, turnover: 90_000, history: [
      { year: 2024, deducted: true, hadBusinessIncome: true },
      { year: 2025, deducted: false, hadBusinessIncome: false },
    ] });
    equal(r.mode, 'regular');
    equal(r.deduction, 27_000);
  }),

  test('#10 שנה ראשונה: חריגה בלי שנה קודמת עם ניכוי ⇒ אין צינון בשנה שאחריה', () => {
    const r = v({ year: 2026, turnover: 90_000, history: [{ year: 2025, deducted: false, hadBusinessIncome: true }] });
    equal(r.mode, 'regular');
    const twoDeducted = v({ year: 2026, turnover: 90_000, history: [
      { year: 2024, deducted: true, hadBusinessIncome: true },
      { year: 2025, deducted: true, hadBusinessIncome: true },
    ] });
    equal(twoDeducted.mode, 'regular', 'ניכה בשתי השנים — אין שנת אי־ניכוי, אין צינון');
  }),

  test('#17 המעמד במע״מ אינו קלט: הוספה שלו לא משנה את התוצאה', () => {
    const base = { year: 2026, turnover: 90_000, registeredAtYearStart: true };
    const withVat = { ...base, vatStatus: 'licensed', dealerType: 'exempt' };
    equal(JSON.stringify(v(withVat)), JSON.stringify(v(base)));
    // @ts-expect-error — אין שדה מע״מ בקלט; אם יתווסף, tsc ייכשל כאן ויחייב החלטה מפורשת.
    microBusiness({ year: 2026, turnover: 90_000, vatStatus: 'licensed' });
  }),

  test('שנה בלי ערכים במרשם (2023, לפני המסלול) ⇒ אין תוצאה, לא ערך של שנה אחרת', () => {
    const r = microBusiness({ year: 2023, turnover: 50_000 });
    equal(r.ok, false);
  }),

  test('השפעה: כלל micro.* מסמן דף, שיעור, מנוע, תיק המס, שאלונים, מפת 1301 וב״ל', () => {
    for (const id of ['micro.turnoverCeiling', 'micro.normativeRate', 'micro.exceededCap', 'micro.coolingYears']) {
      const u = ruleUsage(id);
      assert(u.topics.some(t => t.id === 'microBusiness'), `${id}: הנושא`);
      assert(u.calcs.some(c => c.id === 'microBusiness'), `${id}: החישוב`);
      const kinds = new Set(u.consumers.map(c => c.kind));
      // ‼ מנוע ההערכה ושנות המס — רק כשהם שוחררו (availability.ts); בשחרור הידע הם לא ברשימה.
      const want = ['knowledge', 'lesson', 'form1301', 'ni', ...(AVAILABLE.taxEstimate ? ['engine'] : []), ...(AVAILABLE.taxYear ? ['taxFile', 'questionnaire'] : [])];
      for (const k of want) assert(kinds.has(k as never), `${id}: חסר ${k}`);
      equal(u.consumers.length, want.length, `${id}: אין רכיב של יכולת שלא שוחררה`);
      equal(u.consumers.some(c => c.path === 'src/features/taxEstimate/engine.ts'), AVAILABLE.taxEstimate, `${id}: מנוע ההערכה`);
    }
    equal(ruleUsage('sf.se.ceiling').consumers.length, 0, 'כלל של נושא אחר לא מסמן את רכיבי העסק הזעיר');
  }),

  test('פריטים פתוחים של עסק זעיר: כל השאלות שהמחקר השאיר פתוחות רשומות', () => {
    const ids = new Set(OPEN_ITEMS.filter(i => i.topicId === 'microBusiness').map(i => i.id));
    for (const id of ['micro.midYearOpening', 'micro.midYearRegistration', 'micro.exceededOnlinePath', 'micro.coordinationDeadline', 'micro.exclusionsBasis', 'micro.reg3a5', 'micro.niGuidance', 'micro.form1301Codes']) {
      assert(ids.has(id), `חסר ${id}`);
    }
  }),
];
