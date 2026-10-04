import { createClient } from '@supabase/supabase-js';
import { effectiveSupabaseUrl, isProductionUrl, requestUrlOf, shouldIsolateFromProduction } from './demoIsolation';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!configuredUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

/**
 * ‼ מסך הדגמה/בדיקה בשרת פיתוח לעולם לא מדבר עם הייצור — איך שלא הופעל השרת
 * (ראה demoIsolation.ts). מחושב פעם אחת, לפני שנוצר החיבור.
 */
export const DEMO_ISOLATED_FROM_PRODUCTION = shouldIsolateFromProduction(
  import.meta.env.DEV,
  typeof window !== 'undefined' ? window.location.search : '',
  String(configuredUrl),
);

/** כתובת המסד שהאפליקציה משתמשת בה בפועל — לקישורים שנבנים ביד (פונקציות שרת). */
export const SUPABASE_URL = effectiveSupabaseUrl(DEMO_ISOLATED_FROM_PRODUCTION, String(configuredUrl));

if (DEMO_ISOLATED_FROM_PRODUCTION && typeof window !== 'undefined') {
  // שכבה שנייה: גם fetch שנבנה ביד, או כתובת ייצור ששמורה בנתוני הדמו, לא יוצא מהדפדפן.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (isProductionUrl(requestUrlOf(input))) {
      return Promise.reject(new TypeError('נחסם: מסך הדגמה לא פונה לייצור'));
    }
    return realFetch(input, init);
  };
  console.warn('[בידוד] מסך הדגמה/בדיקה — הייצור חסום בדף הזה');
}

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // ‼ supabase-js שומר את fetch ברגע היצירה — מעבירים עטיפה שקוראת לגרסה הנוכחית.
  global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => (typeof window !== 'undefined' ? window.fetch(input, init) : fetch(input, init)) },
});

// חשיפה ב-window רק במצב פיתוח — מאפשר אבחון ישיר מהקונסול:
//   await window.__sb.from('documents').select('*')
//   await window.__sb.auth.getUser()
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__sb = supabase;
}
