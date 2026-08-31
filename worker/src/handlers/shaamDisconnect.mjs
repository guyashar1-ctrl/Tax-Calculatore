// shaamDisconnect.mjs — "התנתקות" מהכותרת. סוגר את חלון Chrome הייעודי.
//
// ‼ מזוהה אך ורק לפי נתיב הפרופיל הייעודי (shaam-chrome-profile), ולכן
// לעולם לא ייסגר Chrome הרגיל של הרו"ח עם הלשוניות שלו.
//
// ‼ מגבלה ידועה: סגירת החלון מסיימת את הסשן מקומית. יציאה מסודרת בצד השרת
// (לחיצה על "יציאה" בפורטל) תתווסף רק אחרי שנראה את הפקד האמיתי — לא על
// סמך ניחוש של מבנה התפריט.
import { closeDedicatedChrome } from '../browserSession.mjs';

export const actionType = 'shaam.disconnect';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  ctx.log('סוגר את חלון Chrome הייעודי של שע״ם');
  const closed = closeDedicatedChrome();
  return { result: { connected: false, system: 'shaam', closed } };
}
