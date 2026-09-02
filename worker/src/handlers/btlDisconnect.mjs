// btlDisconnect.mjs — «התנתקות» מהכותרת. סוגר את חלון Chrome הייעודי של ב״ל.
//
// ‼ מזוהה אך ורק לפי נתיב הפרופיל (btl-chrome-profile), ולכן לעולם לא ייסגר
// Chrome הרגיל של הרו"ח ולא חלון שע״ם.
//
// ‼ מגבלה ידועה, זהה לזו של שע״ם: הסגירה מסיימת את הסשן מקומית. יציאה
// מסודרת בצד השרת תתווסף רק אחרי שנראה את פקד «יציאה» האמיתי במסך — לא על
// סמך ניחוש של מבנה התפריט.
import { closeDedicatedBtlChrome } from '../btlSession.mjs';

export const actionType = 'btl.disconnect';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  ctx.log('סוגר את חלון Chrome הייעודי של ביטוח לאומי');
  const closed = closeDedicatedBtlChrome();
  return { result: { connected: false, system: 'btl', closed } };
}
