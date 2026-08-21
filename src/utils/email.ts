// ─── כתובת מייל — מודל בדיקה אחד לכל המערכת ─────────────────────────────────
// ‼ עד כה אותו ביטוי בדיוק שוכפל בשמונה מסכים, ולצדו שדות שכלל לא הוגדרו
// כשדות מייל. הבדיקה כאן היא אותה בדיקה, במקום אחד — ואותה בדיקה שרצה
// בפונקציות השרת (send-apply-link-email, submit-application), כדי שמה
// שהמסך מאשר לא ייפול בשליחה.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** אורך מרבי לפי RFC 5321 — הגבול שהשרת אוכף ממילא. */
export const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return v.length > 0 && v.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(v);
}

/** מה שנשלח לשרת: בלי רווחים בקצוות. אותיות גדולות נשמרות — יש שרתי דואר שמבחינים. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim();
}
