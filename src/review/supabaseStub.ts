// ─── בדל Supabase · בנייה לסקירה ויזואלית בלבד ───────────────────────────────
// ‼ הקובץ הזה מחליף את src/lib/supabase.ts בבנייה של סביבת הסקירה (ראה
// vite.review.config.ts → resolve.alias). המשמעות המעשית:
//
//   • הקובץ האמיתי אינו נכנס לחבילה, ולכן VITE_SUPABASE_URL ו-
//     VITE_SUPABASE_ANON_KEY אינם נקראים ואינם מוטמעים בקוד. גם אם משתני
//     הסביבה של הפרודקשן קיימים במכונת הבנייה — הם לא מגיעים לפלט.
//   • אין לקוח Supabase, אין מפתחות, ואין כתובת שאפשר לפנות אליה.
//   • כל קריאה שבכל זאת תגיע לכאן נכשלת מיידית ובקול, בלי בקשת רשת.
//
// הקובץ חי רק בענף הסקירה ואינו מיועד למיזוג ל-master.

import { reviewCloseReadiness, reviewApplyClose } from './closeReadiness';

const BLOCKED = 'סביבת סקירה מבודדת — אין חיבור למסד. הקריאה נחסמה.';

function blocked(path: string): never {
  // eslint-disable-next-line no-console
  console.warn(`[review] נחסמה גישה ל-${path}. ${BLOCKED}`);
  throw new Error(`${BLOCKED} (${path})`);
}

/** תשובה ריקה בצורת התשובה של supabase-js — לקריאות שלא כדאי שיזרקו. */
const emptyResult = { data: [], error: null, count: 0, status: 200, statusText: 'OK' };

const queryBuilder: Record<string, unknown> = {};
for (const method of [
  'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is',
  'not', 'or', 'filter', 'order', 'limit', 'range', 'match', 'contains',
]) {
  queryBuilder[method] = () => queryBuilder;
}
// שרשרת הקריאות ניתנת ל-await ומחזירה ריק — בלי רשת ובלי חריגה.
queryBuilder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(emptyResult).then(resolve);
queryBuilder.single = () => Promise.resolve({ data: null, error: null });
queryBuilder.maybeSingle = () => Promise.resolve({ data: null, error: null });

export const supabase = {
  from: () => queryBuilder,

  // אין משתמש ואין הפעלה — מסכי הסקירה מקבלים את הנתונים בפרופס.
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithOtp: async () => blocked('auth.signInWithOtp'),
    signInWithPassword: async () => blocked('auth.signInWithPassword'),
    signOut: async () => ({ error: null }),
  },

  // ‼ שלוש אלה הן הדרכים היחידות שבהן המוצר מוציא מייל או כותב החוצה.
  // בסביבת הסקירה כולן חסומות בקוד, ולא רק חסרות הרשאה.
  functions: { invoke: async () => blocked('functions.invoke') },

  /* ‼ קריאה אחת בלבד נענית מקומית: close_onboarding. בלעדיה אי אפשר לבדוק
     בסקירה את הדרישה המרכזית — שסגירה חוסמת כשנותרה עבודה, ומעבירה לשוטף
     כשלא. אין כאן שרת ואין כתיבה.

     ‼‼ הגרסה הראשונה כאן החזירה ok תמיד, ולכן לקוח נסגר עם שישה שלבים
     פתוחים — הליקוי שדווח. עכשיו הפונקציה מריצה את *אותם* כללים שהשרת
     מריץ (onboarding_close_readiness), דרך closeReadinessForReview, כדי
     שהמסך בסקירה ייחסם בדיוק כמו מול המסד. */
  rpc: async (name: string, args?: Record<string, unknown>) => {
    if (name === 'close_onboarding') {
      const engagementId = String(args?.p_engagement_id ?? '');
      const force = args?.p_force === true;
      const readiness = reviewCloseReadiness(engagementId);
      if (!readiness.ready && !force) {
        return { data: { ok: false, error: 'not_ready', readiness }, error: null };
      }
      reviewApplyClose(engagementId, force, String(args?.p_reason ?? '') || null);
      return { data: { ok: true, forced: force, readiness }, error: null };
    }
    return blocked(`rpc(${name})`);
  },
  storage: {
    from: () => ({
      upload: async () => blocked('storage.upload'),
      remove: async () => blocked('storage.remove'),
      download: async () => blocked('storage.download'),
      createSignedUrl: async () => blocked('storage.createSignedUrl'),
      list: async () => ({ data: [], error: null }),
    }),
  },
};
