import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Module-level flag so dev auto-login fires once across all useAuth callers.
let devAutoLoginAttempted = false;

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** null = טרם נבדק, true/false = תוצאת בדיקת ההרשאה מול authorized_users */
  authorized: boolean | null;
  displayName: string;
  avatarUrl: string | undefined;
  signInWithGoogle: () => Promise<void>;
  signInWithDevUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * ‼ מצב ההתחברות נמדד פעם אחת לכל האפליקציה — ב-AuthProvider (main.tsx) — וכל
 * קורא של useAuth() קורא ממנו. קודם כל קריאה ל-useAuth() (עשרה מסכים ישירות,
 * ועוד כשמונה-עשרה דרך useDocumentStore) פתחה מנוי משלה ל-onAuthStateChange
 * ושלחה is_authorized() משלה — חמש עד שמונה בקשות זהות בכל מסך.
 */
export const AuthContext = createContext<AuthState | null>(null);

export const DEV_AUTO_LOGIN_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTO_LOGIN === 'true';

// DEV-only: lets a local dev session view the app without being in the authorized_users
// allowlist — for local visual QA only. Guarded by import.meta.env.DEV, so it is compiled
// out of every production/Preview build (DEV === false there); prod authorization
// (is_authorized() RPC + RLS) is never weakened.
export const DEV_BYPASS_AUTHZ =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTHZ === 'true';

/**
 * הקריאה היחידה של מצב ההתחברות. נקראת פעם אחת בלבד — מתוך AuthProvider.
 * מסכים לא קוראים לה ישירות; הם קוראים useAuth().
 */
export function useAuthState(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // null = טרם נבדק, true/false = תוצאת בדיקת ההרשאה מול authorized_users
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);

      if (!data.session && DEV_AUTO_LOGIN_ENABLED && !devAutoLoginAttempted) {
        devAutoLoginAttempted = true;
        const email = import.meta.env.VITE_DEV_USER_EMAIL as string | undefined;
        const password = import.meta.env.VITE_DEV_USER_PASSWORD as string | undefined;
        if (email && password) {
          supabase.auth.signInWithPassword({ email, password }).then(({ error }) => {
            if (error) console.error('[dev auto-login] failed:', error.message);
          });
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // בדיקת הרשאה בכל פעם שהמשתמש משתנה — מקור האמת הוא is_authorized() במסד.
  useEffect(() => {
    let cancelled = false;
    if (!session) { setAuthorized(null); return; }
    if (DEV_BYPASS_AUTHZ) { setAuthorized(true); return; }
    setAuthorized(null);
    supabase.rpc('is_authorized').then(({ data, error }) => {
      if (cancelled) return;
      // בכשל תקשורת — לא פותחים את השער. RLS ממילא יחסום, אבל עדיף מסך ברור.
      setAuthorized(error ? false : data === true);
    });
    // ‼ (PF10) ההרשאה נבדקה פעם אחת לכל סשן, ולכן משתמש שהוסר מרשימת המורשים
    // המשיך לראות את המסך עד רענון. ה-RLS כבר חסם אותו בשרת — אבל המסך המשיך
    // להיראות פתוח. בודקים שוב בחזרה ללשונית/למיקוד (אותם טריגרים כמו
    // useLivePulse), ורק מורידים: true→false. לא מאפסים ל-null, כדי שהמסך לא
    // יהבהב "בודק הרשאה" בכל חזרה ללשונית.
    let inFlight = false;
    async function recheck() {
      if (cancelled || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const { data, error } = await supabase.rpc('is_authorized');
        if (cancelled) return;
        if (error || data !== true) setAuthorized(false);
      } finally {
        inFlight = false;
      }
    }
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [session?.user?.id]);

  // ‼ ערך יציב: אובייקט חדש בכל רינדור של הספק היה מרנדר מחדש את כל הקוראים.
  return useMemo<AuthState>(() => {
    const user: User | null = session?.user ?? null;
    const displayName: string =
      (user?.user_metadata?.full_name as string | undefined) ||
      (user?.user_metadata?.name as string | undefined) ||
      user?.email ||
      '';
    const avatarUrl: string | undefined =
      (user?.user_metadata?.avatar_url as string | undefined) ||
      (user?.user_metadata?.picture as string | undefined);
    return { session, user, loading, authorized, displayName, avatarUrl, signInWithGoogle, signInWithDevUser, signOut };
  }, [session, loading, authorized]);
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

/**
 * ‼ (PF18) כניסה בסיסמה של משתמש הבדיקה — קיימת רק בפיתוח. הגוף כולו יושב
 * מאחורי import.meta.env.DEV, ולכן בבנייה לייצור vite מחליף אותו ב-false
 * ומשליך את הקוד (כולל קריאת משתני VITE_DEV_USER_*). מה שנשאר בייצור הוא
 * פונקציה שזורקת. השם נשאר כי מסך הכניסה מייבא אותו.
 */
async function signInWithDevUser() {
  if (!import.meta.env.DEV) {
    throw new Error('כניסת משתמש בדיקה זמינה רק בסביבת פיתוח');
  }
  const email = import.meta.env.VITE_DEV_USER_EMAIL as string | undefined;
  const password = import.meta.env.VITE_DEV_USER_PASSWORD as string | undefined;
  if (!email || !password) {
    throw new Error('VITE_DEV_USER_EMAIL / VITE_DEV_USER_PASSWORD חסרים ב-.env.local');
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * הממשק לא השתנה — כל מסך שקרא useAuth() ממשיך לעבוד. ההבדל: אין יותר
 * מנוי ובקשת הרשאה לכל קורא; יש אחד, ב-AuthProvider.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() נקרא מחוץ ל-AuthProvider — ראה main.tsx');
  return ctx;
}
