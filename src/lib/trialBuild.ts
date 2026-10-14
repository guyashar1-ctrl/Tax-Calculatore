/**
 * ‼ גרסת ניסיון לקריאה (11.10.2026, החלטת גיא): בנייה נפרדת על המסד המדומה,
 * שמתפרסמת כדף פרטי כדי ללמוד את ידע המס מהמחשב ומהטלפון בזמן שהפיתוח ממשיך.
 *
 * נבנית רק כך: ‎VITE_TRIAL=true vite build --mode development‎ (ראה
 * scripts/build-trial.mjs). במצב development נטען ‎.env.development.local‎ — כתובת
 * מסד שלא מובילה לשום מקום — ופועלות אותן הגנות של ‎?office-app‎ בשרת הפיתוח.
 *
 * מעבר לזה, הגרסה הזאת לא יוצאת מהדפדפן בכלל: כל fetch שאינו לקבצים של הדף
 * עצמו נדחה, ו-WebSocket חסום. כך אין דרך — גם לא בטעות בנתוני הדמו — לפנות
 * למסד, לשלוח מייל, להפעיל אוטומציה או לגשת לרשות.
 *
 * ‼ המודול הזה מיובא ראשון ב-main.tsx: ‎?office-app‎ חייב להיות בכתובת לפני
 * שהמסד המדומה קורא אותה. בבנייה רגילה (וגם בשרת הפיתוח) הוא לא עושה דבר.
 */
export const TRIAL_BUILD = import.meta.env.DEV && import.meta.env.VITE_TRIAL === 'true';

/** האם בקשה נשארת בתוך הדף (הקבצים של הגרסה עצמה). */
export function isOwnAsset(raw: string, here: string): boolean {
  try {
    const u = new URL(raw, here);
    if (u.protocol === 'data:' || u.protocol === 'blob:') return true;
    const h = new URL(here);
    return u.origin === h.origin && u.origin !== 'null';
  } catch {
    return false;
  }
}

if (TRIAL_BUILD && typeof window !== 'undefined') {
  try {
    if (!new URLSearchParams(window.location.search).has('office-app')) {
      window.history.replaceState(null, '', `?office-app${window.location.hash || '#/reference'}`);
    }
  } catch { /* דף בארגז חול שלא מאפשר לשנות כתובת — FAKE_ACTIVE נשען גם על TRIAL_BUILD */ }

  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!isOwnAsset(raw, window.location.href)) {
      return Promise.reject(new TypeError('גרסת ניסיון: אין פניות מחוץ לדף'));
    }
    return realFetch(input, init);
  };
  const Blocked = function () { throw new Error('גרסת ניסיון: אין חיבורים חיים'); } as unknown as typeof WebSocket;
  window.WebSocket = Blocked;
}
