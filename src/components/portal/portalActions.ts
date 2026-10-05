// ─── הפעולות של הדף האישי — מוזרקות, כדי שמצב «דוגמה» לא יוכל לגעת ברשת ──────
// הדף האישי (PortalView) אינו מדבר עם השרת בעצמו: כל פעולה של הלקוח עוברת דרך
// אובייקט PortalActions שהוא מקבל. שלושה מצבים:
//   · live       — הלקוח האמיתי עם טוקן (?portal=). אותן קריאות בדיוק כמו תמיד.
//   · sample     — «צפייה» בספרייה: הכול נפתח ומגיב מקומית, ושום דבר לא נשלח ולא נשמר.
//   · officeView — הרו"ח מסתכל בתיק של לקוח אמיתי: הכול נפתח לקריאה, הפקדים כבויים.
//
// ‼ livePortalActions הוא המקום היחיד כאן שפונה לשרת. samplePortalActions נכתב כך
// שבדיקת מבנה מוכיחה שהוא אינו מזכיר את לקוח המסד, fetch או פתיחת חלון —
// ראה __tests__/portalModes.test.ts.

import { supabase, SUPABASE_URL } from '../../lib/supabase';
import { flushAccountantNotifications } from '../../lib/notifyAccountant';
import {
  portalSubmitBusinessDetails,
  type PortalBusinessDetailsInput,
  type PortalBusinessDetailsResult,
} from '../../features/requests/api';

export type PortalMode = 'live' | 'sample' | 'officeView';

/** סוגי הקישורים הממודרים שהדף יכול להפנות אליהם (בדוגמה — נפתח מסך מקושר ולא ניווט). */
export type PortalLinkedKind = 'onboard' | 'sign' | 'intake' | 'quote' | 'release' | 'sign-form';

/** ‼ הניסוח היחיד: מופיע מתחת לכפתור שנלחץ, בכל כרטיס, בדיוק כך. */
export const SAMPLE_SIMULATED_TEXT = 'בתצוגה לדוגמה — כאן הלקוח היה שולח. לא נשמר ולא נשלח דבר.';

export interface PortalActionResult {
  ok?: boolean;
  error?: string;
  /** נכון רק בדוגמה: הפעולה «בוצעה» בלי לשלוח כלום, ולכן אין לרענן, לסמן הושלם או לדווח למשרד. */
  simulated?: boolean;
}

export type PortalBusinessDetailsActionResult = PortalBusinessDetailsResult & { simulated?: boolean };

/** קובץ בבקשה (מיגרציה 144) — רק מה שצריך כדי לבנות לו קישור. */
export interface PortalResourceRef { url?: string; documentId?: string }

export interface PortalActions {
  mode: PortalMode;
  submitStep(stepId: string, data: Record<string, unknown>): Promise<PortalActionResult>;
  uploadDocument(args: { stepId: string; itemKey: string; file: File; tokenKind?: 'portal' | 'release' }): Promise<PortalActionResult>;
  submitBusinessDetails(stepId: string, payload: PortalBusinessDetailsInput): Promise<PortalBusinessDetailsActionResult>;
  /** האם הקובץ באמת נפתח (170). בדוגמה — תמיד כן, בלי לבדוק כלום. */
  confirmOpened(href: string | null | undefined): Promise<boolean>;
  notifyAccountant(): void;
  openLinked(kind: PortalLinkedKind, value?: string): void;
  /** הכתובת שפותחת קובץ אחד. קובץ פרטי מתיק הלקוח נפתח רק אצל הלקוח עצמו (null בשאר המצבים). */
  resourceHref(stepId: string | undefined, r: PortalResourceRef): string | null;
}

/** טעינת הדף האמיתי לפי טוקן. null = הקישור אינו תקין. */
export async function loadClientPortal<T extends { ok?: boolean }>(token: string): Promise<T | null> {
  const { data, error } = await supabase.rpc('get_client_portal', { p_token: token });
  const row = data as T | null;
  if (error || !row?.ok) return null;
  return row;
}

/**
 * ‼ (170) «נפתח» נרשם רק אחרי שהקובץ באמת נפתח — לא במקביל ללחיצה.
 *
 * עד כה הרישום (portal_submit_step) רץ יחד עם פתיחת הלשונית, ולכן קובץ שנמחק
 * מהתיק הציג ללקוח דף שגיאה — והבקשה אצל הרו"ח נסגרה כ"נפתח". כאן הדפדפן
 * מבקש את אותה כתובת בדיוק (portal-open-document ⇒ 302 ⇒ Storage) ורושם
 * רק כשהתשובה היא 2xx. הגוף לא מורד פעם שנייה — ברגע שהכותרות הגיעו
 * הזרם מבוטל.
 *
 * ‼ רק קישורים אצלנו נבדקים: הפונקציה וה-Storage מחזירים כותרות CORS, אבל
 * מדריך באתר חיצוני (יוטיוב, אתר רשות) לא — ושם fetch נכשל גם כשהדף תקין.
 * קישור חיצוני נרשם כמו קודם, על סמך הלחיצה.
 * דף השגיאה של הפונקציה חוזר בלי כותרות CORS ולכן fetch זורק — וזו בדיוק
 * התשובה הנכונה: לא נפתח, לא נרשם, השורה נשארת פתוחה לניסיון הבא.
 */
async function confirmOpenedLive(href: string | undefined | null): Promise<boolean> {
  if (!href) return false;
  const base = String(SUPABASE_URL || '');
  if (!base || !href.startsWith(base)) return true;
  try {
    const r = await fetch(href, { method: 'GET', credentials: 'omit', cache: 'no-store' });
    try { await r.body?.cancel(); } catch { /* הגוף כבר לא מעניין */ }
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * הכתובת שפותחת קובץ אחד שנשלח ללקוח.
 *
 * ‼ קובץ מספריית המשרד נפתח ישירות — הוא ציבורי ממילא. קובץ מהתיק של הלקוח
 * עובר דרך portal-open-document, שהוא היחיד שיכול לחתום קישור אל ה-bucket
 * הפרטי, ורק אחרי שווידא שהקובץ באמת נשלח ללקוח הזה.
 */
function resourceHrefLive(token: string, stepId: string | undefined, r: PortalResourceRef): string | null {
  if (r.url) return r.url;
  if (!r.documentId || !stepId) return null;
  const q = new URLSearchParams({ token, stepId, docId: r.documentId });
  return `${SUPABASE_URL}/functions/v1/portal-open-document?${q}`;
}

/**
 * הלקוח האמיתי. כל קריאה כאן הייתה קודם בתוך הרכיבים — הועברה כמות שהיא.
 *
 * ‼ העלאה משרתת גם את הלקוח (?portal=) וגם את הרו"ח הקודם (?release=) — אותה פונקציית
 * שרת, רק tokenKind אחר. הקובץ נכנס ישירות לתיק של הלקוח אצל הרו"ח ומסמן את הפריט;
 * אין שלב ביניים של «ממתין לאישור».
 */
export function livePortalActions(token: string): PortalActions {
  return {
    mode: 'live',
    async submitStep(stepId, data) {
      const { data: res, error } = await supabase.rpc('portal_submit_step', {
        p_token: token, p_step_id: stepId, p_data: data,
      });
      const row = res as { ok?: boolean; error?: string } | null;
      return { ok: !error && !!row?.ok, error: row?.error };
    },
    async uploadDocument({ stepId, itemKey, file, tokenKind = 'portal' }) {
      const form = new FormData();
      form.append('token', token);
      form.append('tokenKind', tokenKind);
      form.append('stepId', stepId);
      form.append('itemKey', itemKey);
      form.append('file', file);
      const { data, error } = await supabase.functions.invoke('portal-upload-document', { body: form });
      const row = data as { ok?: boolean; error?: string } | null;
      return { ok: !error && !!row?.ok, error: row?.error };
    },
    submitBusinessDetails: (stepId, payload) => portalSubmitBusinessDetails(token, stepId, payload),
    confirmOpened: confirmOpenedLive,
    notifyAccountant: () => flushAccountantNotifications(token),
    // הקישורים החיים הם <a href> אמיתיים — הפונקציה הזאת קיימת רק בשביל הדוגמה.
    openLinked: () => {},
    resourceHref: (stepId, r) => resourceHrefLive(token, stepId, r),
  };
}

/**
 * «צפייה» בספרייה. כל פעולה מחזירה «בוצע בדוגמה» ולא נוגעת בשום דבר מחוץ לדפדפן.
 * ‼ הפונקציה הזאת אסורה בכל התייחסות לשרת — הבדיקה חותכת אותה לפי השם ומחפשת.
 */
export function samplePortalActions(hooks?: { onOpenLinked?: (kind: PortalLinkedKind, value?: string) => void }): PortalActions {
  const simulated = async (): Promise<PortalActionResult> => ({ ok: true, simulated: true });
  return {
    mode: 'sample',
    submitStep: simulated,
    uploadDocument: simulated,
    submitBusinessDetails: async () => ({ ok: true, simulated: true }),
    confirmOpened: async () => true,
    notifyAccountant: () => {},
    openLinked: (kind, value) => hooks?.onOpenLinked?.(kind, value),
    // קובץ מספריית המשרד נפתח; קובץ פרטי מתיק לקוח — אין לו כתובת, והדף כותב «נפתח רק אצל הלקוח».
    resourceHref: (_stepId, r) => r.url ?? null,
  };
}

const READ_ONLY_ERROR = 'read_only';

/** הרו"ח מסתכל בתיק של לקוח אמיתי: אין פעולה שיכולה להצליח, והפקדים כבויים ממילא. */
export const officeViewActions: PortalActions = {
  mode: 'officeView',
  submitStep: async () => ({ ok: false, error: READ_ONLY_ERROR }),
  uploadDocument: async () => ({ ok: false, error: READ_ONLY_ERROR }),
  submitBusinessDetails: async () => ({ ok: false, error: READ_ONLY_ERROR, message: 'תצוגה בלבד — לא ניתן לשלוח מכאן.' }),
  confirmOpened: async () => false,
  notifyAccountant: () => {},
  openLinked: () => {},
  resourceHref: (_stepId, r) => r.url ?? null,
};
