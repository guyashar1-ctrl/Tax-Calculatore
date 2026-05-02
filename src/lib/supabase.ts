import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// חשיפה ב-window רק במצב פיתוח — מאפשר אבחון ישיר מהקונסול:
//   await window.__sb.from('documents').select('*')
//   await window.__sb.auth.getUser()
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__sb = supabase;
}
