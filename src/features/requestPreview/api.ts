// ─── «צפייה» — הקריאה היחידה לשרת ──────────────────────────────────────────────
// ‼ preview_request_sample היא STABLE: Postgres אוסר בה כל כתיבה. כאן אין שום כתיבה אחרת, ואין ניסיון חוזר אוטומטי.

import { supabase } from '../../lib/supabase';
import { skipReasonText } from '../flows/api';
import type { PreviewData, PreviewLoad, PreviewRequest, PreviewSpec } from './types';

export const LOAD_FAILED_TEXT = 'לא הצלחתי לטעון את התצוגה';

const ERROR_TEXT: Record<string, string> = {
  forbidden: 'אין הרשאה לצפות — צריך להתחבר מחדש',
  bad_request: LOAD_FAILED_TEXT,
  bad_variant: LOAD_FAILED_TEXT,
  // ‼ הדגמה (?office-app): בקשה שלא נלכדה — אומרים את זה, לא מציירים בקשה מומצאת.
  no_fixture: 'אין דוגמה בהדגמה',
};

/** מפתח יציב לבקשה — למטמון בתוך המגירה ולמסך ההדגמה (נלכד מ-staging). */
export function requestKey(req: PreviewRequest): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)]))
    : v;
  return JSON.stringify(sort(req));
}

export async function loadRequestPreview(req: PreviewRequest): Promise<PreviewLoad> {
  const { data, error } = await supabase.rpc('preview_request_sample', { p_request: req });
  if (error) { console.warn('[requestPreview]', error.message); return { ok: false, error: 'request_failed', message: LOAD_FAILED_TEXT }; }
  const row = data as (PreviewData & { ok?: boolean; error?: string }) | null;
  if (!row?.ok) {
    const code = row?.error ?? 'request_failed';
    return { ok: false, error: code, message: ERROR_TEXT[code] ?? LOAD_FAILED_TEXT };
  }
  return { ok: true, data: row };
}

/** למה בקשה לא תיווצר כמו שהיא — המשפט שבמקום הכרטיס. null = אפשר להציג. */
export function specProblemText(spec: PreviewSpec): string | null {
  if (spec.ok) return spec.internal ? 'משימה של המשרד — לא מופיעה ללקוח' : null;
  return spec.reason ? skipReasonText(spec.reason) : LOAD_FAILED_TEXT;
}
