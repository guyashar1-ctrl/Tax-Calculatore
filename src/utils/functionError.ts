/**
 * הודעת שגיאה קריאה מקריאה ל-Edge Function.
 *
 * ‼ למה זה קיים: `supabase.functions.invoke` מחזיר שגיאה שה-message שלה הוא
 * תמיד "Edge Function returned a non-2xx status code" — משפט שלא אומר דבר.
 * הסיבה האמיתית יושבת בגוף התשובה, תחת `error.context`, ונזרקה עד היום.
 * התוצאה: הרו"ח ראה "השליחה נכשלה" בלי לדעת אם חסר מפתח, אם הכתובת שגויה,
 * או אם השירות נפל — ולא היה לו מה לעשות עם זה.
 *
 * התגלה בבדיקת מובייל: שליחת הצעה נכשלה, והמסך אמר רק "non-2xx status code",
 * בזמן שביומן המסד היה כתוב במפורש "API key is invalid".
 */
export async function edgeFunctionError(error: unknown, fallback = 'שגיאה לא ידועה'): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;

  // ה-context הוא Response — קריאה שלו מגלה את הסיבה שהפונקציה החזירה.
  if (ctx && typeof (ctx as Response).text === 'function') {
    try {
      const raw = await (ctx as Response).clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const detail = parsed.detail as Record<string, unknown> | undefined;
          const pick = detail?.message ?? parsed.message ?? parsed.error ?? detail?.name;
          if (typeof pick === 'string' && pick.trim()) return pick.trim();
        } catch {
          // לא JSON — הטקסט הגולמי עדיין עדיף על המשפט הגנרי.
        }
        return raw.slice(0, 300);
      }
    } catch {
      // לא ניתן לקרוא את הגוף — נופלים להודעה הרגילה.
    }
  }

  const msg = (error as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}
