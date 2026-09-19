// ─── מעקב פתיחת קישור הקליטה — מאיפה הוא קיים ──────────────────────────────
// «הקישור נפתח» נרשם רק מאז מיגרציה 191 (touch_onboarding). בקשה שנשלחה לפני
// כן ואין עליה חותמת אינה «טרם נפתחה» — פשוט אין מידע. המשרד חייב לראות את
// ההבדל: «טרם נפתח» אומר לשלוח שוב; «אין מידע» אומר שהתשובה לא קיימת.
//
// ‼ הגבול הוא רגע ההחלה על הפרודקשן, כפי שנרשם ב-supabase_migrations
//   (גרסה 20260919072602 = 2026-09-19 07:26:02 UTC). הדפדפן אינו קורא את
//   טבלת המיגרציות, ולכן הערך כתוב כאן פעם אחת, עם המקור.
// ‼ טהור: בלי ייבוא — node מריץ עליו בדיקה בלי בנייה.

export const LINK_OPEN_TRACKING_SINCE = '2026-09-19T07:26:02Z';

/** האם לבקשה שנוצרה ב-createdAt יש בכלל מעקב פתיחה. חסר ⇒ מניחים שכן. */
export function linkOpenTracked(createdAt: string | undefined | null): boolean {
  if (!createdAt) return true;
  const t = Date.parse(createdAt);
  return Number.isNaN(t) || t >= Date.parse(LINK_OPEN_TRACKING_SINCE);
}

export const LINK_NOT_OPENED_LINE = 'הקישור טרם נפתח';
export const LINK_OPEN_UNKNOWN_LINE = 'אין מידע על פתיחת הקישור — הבקשה נשלחה לפני שהחל המעקב';

/** השורה כשאין חותמת פתיחה ואין טיוטה — לפי מתי הבקשה נוצרה. */
export function noOpenInfoLine(createdAt: string | undefined | null): string {
  return linkOpenTracked(createdAt) ? LINK_NOT_OPENED_LINE : LINK_OPEN_UNKNOWN_LINE;
}
