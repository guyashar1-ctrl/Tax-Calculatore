import { supabase } from './supabase';

// ─── בקשה לרוקן את תור ההתראות למשרד ────────────────────────────────────────
// נקראת מיד אחרי אירוע שהמשרד אמור לדעת עליו. אינה שולחת מייל ואינה יודעת
// מה נשלח — היא רק *מפעילה* את השרת, שהוא זה שבודק את ההגדרות של גיא
// (supabase/functions/_shared/accountantNotifications.ts) ומחליט מה יוצא.
//
// ‼ לא ממתינים לה ולא בודקים אותה. אירוע שהצליח לא ייכשל בגלל מייל, ומה
// שלא יצא כאן יצא בכניסה הבאה של הרו"ח למערכת (App.tsx).
//
// token — מדף ציבורי (הצעה / חתימה / דף אישי / דף שחרור). בלעדיו מזוהה
// הרו"ח מה-JWT שלו.
export function flushAccountantNotifications(token?: string): void {
  void supabase.functions.invoke('notify-accountant', { body: token ? { token } : {} });
}
