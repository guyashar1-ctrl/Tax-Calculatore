import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Module-level flag so dev auto-login fires once across all useAuth callers.
let devAutoLoginAttempted = false;

export const DEV_AUTO_LOGIN_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTO_LOGIN === 'true';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  return { session, user, loading, displayName, avatarUrl, signInWithGoogle, signInWithDevUser, signOut };
}
