// ─── תצוגת מייל ב-iframe: קישורים נפתחים בחוץ ───────────────────────────────
// ‼ הבאג: המייל מוצג ב-iframe עם sandbox="" (בלי הרשאת סקריפטים — נכון,
// זה HTML שהגיע מבחוץ). לחיצה על כפתור בגוף המייל ניווטה את ה-**iframe עצמו**
// אל האפליקציה, ושם אין הרשאת סקריפטים — אז React מעולם לא רץ והמסך נשאר לבן.
// מבחוץ זה נראה כאילו הקישור שבור, בעוד שהוא תקין לגמרי.
//
// הפתרון: base target="_blank" כדי שכל קישור יצא מהמסגרת, יחד עם
// allow-popups (ראה IFRAME_SANDBOX) כדי שהדפדפן ירשה לו להיפתח.
// ‼ allow-scripts לא נוסף: המייל נשאר בלי יכולת הרצה.

/** ההרשאות המינימליות שמאפשרות לקישור לצאת החוצה, בלי להריץ סקריפטים. */
export const EMAIL_PREVIEW_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/**
 * מוסיף <base target="_blank"> לתוך ה-HTML של המייל.
 * ‼ אם כבר קיים base — לא נוגעים, כדי לא לשבור מייל שהגדיר לעצמו התנהגות.
 */
export function withExternalLinks(html: string | null | undefined): string {
  const src = html ?? '';
  if (!src.trim()) return src;
  if (/<base\b/i.test(src)) return src;

  const tag = '<base target="_blank" rel="noopener noreferrer">';
  if (/<head\b[^>]*>/i.test(src)) {
    return src.replace(/<head\b[^>]*>/i, m => `${m}${tag}`);
  }
  if (/<html\b[^>]*>/i.test(src)) {
    return src.replace(/<html\b[^>]*>/i, m => `${m}<head>${tag}</head>`);
  }
  return `${tag}${src}`;
}
