/**
 * ‼ בידוד מסכי ההדגמה והבדיקה מהייצור — בשרת פיתוח בלבד.
 *
 * מסכי ההדגמה (‎?office-app‎, ‎?demo‎, ‎?flows-demo‎, ‎?portal=demo‎) וכל מסכי הבדיקה
 * (‎?test-…‎) נועדו לרוץ על מסד מדומה או על סביבת הבדיקות. אבל ההגדרות של שרת
 * הפיתוח נקבעות לפי איך שהופעל: שרת שהופעל בלי מצב ההדגמה טוען את ‎.env.local‎ —
 * כתובת הייצור והתחברות אוטומטית — וכך מסך הדגמה בדפדפן חדש התחבר לייצור בעצמו
 * (נמצא ב-03.10: שרת על 5196 שהופעל ידנית בלי ‎--mode‎).
 *
 * לכן הבידוד לא תלוי בהגדרת השרת: במסך הדגמה/בדיקה שכתובת המסד שלו היא הייצור,
 * הכתובת מוחלפת בכתובת שלא מובילה לשום מקום, כל בקשה לייצור נחסמת בדפדפן,
 * ואין התחברות אוטומטית. סביבת הבדיקות (staging) לא נחסמת — מסכי הבדיקה שם
 * צריכים אותה. בבנייה לייצור (DEV=false) אין לכל זה השפעה.
 */

/** מזהה פרויקט הייצור. אסור לכל מסך הדגמה או בדיקה. */
export const PROD_PROJECT_REF = 'uoweoqtuiettozagwgdw';

/** כתובת שלא מובילה לשום מקום — הבקשות נכשלות מיד, בלי לצאת מהמחשב. */
export const ISOLATED_SUPABASE_URL = 'http://127.0.0.1:9';

const DEMO_PARAMS = ['office-app', 'demo', 'flows-demo'];

/** האם הכתובת היא מסך הדגמה או בדיקה (ולא האפליקציה עצמה או דף אמיתי של לקוח). */
export function isDemoRoute(search: string): boolean {
  const p = new URLSearchParams(search.split('#')[0]);
  for (const key of p.keys()) {
    if (key.startsWith('test-')) return true;
  }
  if (DEMO_PARAMS.some(k => p.has(k))) return true;
  return p.get('portal') === 'demo';
}

/** האם כתובת שייכת לפרויקט הייצור. */
export function isProductionUrl(url: string): boolean {
  return url.includes(PROD_PROJECT_REF);
}

/**
 * ההכרעה לדף הנוכחי: מסך הדגמה/בדיקה בשרת פיתוח, שהמסד שהוגדר לו הוא הייצור.
 * dev בלבד — בבנייה לייצור תמיד false.
 */
export function shouldIsolateFromProduction(isDev: boolean, search: string, configuredUrl: string): boolean {
  return isDev && isDemoRoute(search) && isProductionUrl(configuredUrl);
}

/** הכתובת שהאפליקציה באמת משתמשת בה. */
export function effectiveSupabaseUrl(isolate: boolean, configuredUrl: string): string {
  return isolate ? ISOLATED_SUPABASE_URL : configuredUrl;
}

/** כתובת הבקשה (מחרוזת, URL או Request) כטקסט — כדי לבדוק אם היא לייצור. */
export function requestUrlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const u = (input as { url?: unknown; href?: unknown }).url ?? (input as { href?: unknown }).href;
    if (typeof u === 'string') return u;
  }
  return String(input ?? '');
}
