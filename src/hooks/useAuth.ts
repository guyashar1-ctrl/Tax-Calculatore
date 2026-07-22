import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Module-level flag so dev auto-login fires once across all useAuth callers.
let devAutoLoginAttempted = false;

export const DEV_AUTO_LOGIN_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTO_LOGIN === 'true';

// DEV-only: lets a local dev session view the app without being in the authorized_users
// allowlist — for local visual QA only. Guarded by import.meta.env.DEV, so it is compiled
// out of every production/Preview build (DEV === false there); prod authorization
// (is_authorized() RPC + RLS) is never weakened.
export const DEV_BYPASS_AUTHZ =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTHZ === 'true';

export function useAuth() {
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
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async function signInWithDevUser() {
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
}
