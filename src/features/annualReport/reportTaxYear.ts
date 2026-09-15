// ─── שנת המס של הדוח/השאלון — מקום אחד ───────────────────────────────────────
// ‼ (168) עד עכשיו: השרת חישב `now()-1` בשלוש פונקציות, המשרד פתח דוח שנתי
// על 2025 קבוע, ו-CURRENT_TAX_YEAR ב-data/taxData היא בכלל "השנה העדכנית
// ביותר שיש לה טבלאות מס" (2026) — מושג אחר. בינואר שלוש התשובות מתפצלות:
// הלקוח ממלא שאלון על שנה אחת, המשרד פותח דוח על אחרת.
//
// הכלל: הגדרת המשרד `settings.taxYear` אם קיימת, ואם לא — השנה הקלנדרית
// הקודמת. ‼ חייב להישאר זהה ל-public.current_tax_year(uuid) בשרת (מיגרציה
// 168). אין עדיין מסך שמגדיר את ההגדרה; זה רק הבית שלה.

export function reportTaxYear(settings?: Record<string, unknown> | null, now: Date = new Date()): number {
  const raw = settings?.taxYear;
  const fromSetting = typeof raw === 'number' ? raw
    : typeof raw === 'string' && /^\d{4}$/.test(raw) ? Number(raw) : undefined;
  return fromSetting ?? now.getFullYear() - 1;
}
