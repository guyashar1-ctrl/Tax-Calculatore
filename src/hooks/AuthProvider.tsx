// ─── ספק ההתחברות — מנוי אחד ובדיקת הרשאה אחת לכל האפליקציה ──────────────
// מורכב פעם אחת ב-main.tsx, מעל App. כל useAuth() בעץ קורא מכאן.
// ראה ההערה מעל AuthContext ב-useAuth.ts.

import type { ReactNode } from 'react';
import { AuthContext, useAuthState } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
