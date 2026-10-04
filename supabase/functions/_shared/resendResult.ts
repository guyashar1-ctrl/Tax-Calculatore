// ═══════════════════════════════════════════════════════════════════════════
//  מה תשובת ספק הדואר אומרת על המייל — נשלח, לא נשלח, או שאי אפשר לדעת.
// ═══════════════════════════════════════════════════════════════════════════
//  טהור (בלי Deno ובלי DOM) — נבדק בבדיקות יחידה מ-src ונצרך מפונקציות השרת.
//
//  ‼ ההבחנה קובעת מה מותר אחר כך:
//    sent    — רושמים «נשלח» ומסמנים את הבקשות כנמסרו.
//    failed  — הספק דחה ולא יצר מייל ⇒ מותר לנסות שוב, עם מפתח חדש אצלו.
//    unknown — ייתכן שהמייל יצא ⇒ אסור לשלוח «חדש» על אותן בקשות לבד.
//              ניסיון חוזר רק באותו מפתח (הספק מזהה כפילות 24 שעות), או
//              בהכרעה מפורשת של הרו"ח.
//  Resend: אותו Idempotency-Key + אותו גוף ⇒ מחזיר את המזהה המקורי בלי לשלוח.
//  409 concurrent_idempotent_requests — בקשה אחרת עם המפתח עדיין בתנועה.
//  409 invalid_idempotent_request — המפתח כבר שימש עם גוף אחר ⇒ משהו כבר יצא.
// ═══════════════════════════════════════════════════════════════════════════

export type SendOutcome =
  | { outcome: 'sent'; id: string }
  | { outcome: 'failed'; reason: string }
  | { outcome: 'unknown'; reason: string };

export function classifyResendResponse(status: number | null, body: unknown, thrown?: unknown): SendOutcome {
  if (thrown !== undefined && thrown !== null) {
    return { outcome: 'unknown', reason: 'network: ' + String((thrown as Error)?.message ?? thrown).slice(0, 200) };
  }
  const b = (body ?? {}) as { id?: unknown; name?: unknown; message?: unknown };
  const detail = [b.name, b.message].filter(Boolean).map(String).join(': ').slice(0, 300) || `http ${status}`;
  if (status !== null && status >= 200 && status < 300) {
    return typeof b.id === 'string' && b.id
      ? { outcome: 'sent', id: b.id }
      : { outcome: 'unknown', reason: 'ok_without_id' };
  }
  if (status === 409) return { outcome: 'unknown', reason: detail };
  if (status === null || status >= 500) return { outcome: 'unknown', reason: detail };
  // 429 ודחיות אחרות: הבקשה נדחתה לפני שנוצר מייל.
  return { outcome: 'failed', reason: detail };
}

// ─── שולחים שאינם «הודעה ללקוח» (מייל שלב, ייצוג, הצעה, שחרור, התראה למשרד…) ───
//  ‼ כלל אחד לכולם: תשובה שלא מכריעה (רשת, 5xx, 409, 2xx בלי מזהה) ⇒ שורה ביומן
//  בסטטוס 'unknown' ו-{error:'unknown_outcome'} ב-502. רק דחייה ודאית היא 'failed'.
//  תביעה שנלקחה לפני השליחה (מייל אוטומטי, תזכורת) **אינה משוחררת** על unknown —
//  שחרור היה מזמין את ההרצה הבאה לשלוח שוב, ואולי פעמיים.

export const UNKNOWN_OUTCOME = 'unknown_outcome' as const;

/**
 * המשפט שהשרת מצרף ל-unknown_outcome. ‼ בעברית ובלי קוד: מסכים שמציגים את
 * detail.message (edgeFunctionError, errorTextFromBody) מראים אותו כמו שהוא,
 * ומסכים שמכירים את הקוד מחליפים אותו במשפט מדויק יותר.
 */
export const UNKNOWN_OUTCOME_TEXT =
  'לא ידוע אם המייל יצא — ספק הדואר לא החזיר תשובה ברורה. לפני ששולחים שוב, כדאי לברר עם הנמען אם קיבל אותו.';

export interface ResendCall {
  /** null — לא התקבלה תשובה בכלל (החיבור נפל). */
  status: number | null;
  body: Record<string, unknown>;
  result: SendOutcome;
}

/**
 * קריאה אחת לספק הדואר, מסווגת. ‼ לעולם לא זורקת: חיבור שנפל, תשובה שלא נקראה
 * או גוף שאינו JSON הם «לא ידוע» — לא חריגה שמסתירה את התוצאה ומפילה את כל ההרצה.
 * הפונקציה מקבלת את הקריאה עצמה (fetch) כדי שאפשר יהיה לבדוק אותה בלי רשת.
 */
export async function postResend(
  doFetch: () => Promise<{ status: number; json(): Promise<unknown> }>,
): Promise<ResendCall> {
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await doFetch();
  } catch (e) {
    return { status: null, body: {}, result: classifyResendResponse(null, null, e ?? new Error('fetch failed')) };
  }
  let raw: unknown = {};
  try { raw = await res.json(); } catch { raw = {}; }
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return { status: res.status, body, result: classifyResendResponse(res.status, body) };
}

/**
 * גוף התשובה כשלא ידוע אם המייל יצא (HTTP 502).
 * retrySafe — השליחה נשאה Idempotency-Key קבוע לאותה עבודה, ולכן שליחה חוזרת
 * מאותו מקום (בתוך יממה) לא תצא פעמיים: הספק מחזיר את המייל המקורי.
 * ‼ הסיבה הגולמית של הספק (באנגלית) רק ב-detail.reason — לעולם לא ב-message.
 */
export function unknownOutcomeReply(reason: string, retrySafe = false): {
  ok: false; error: typeof UNKNOWN_OUTCOME; retrySafe: boolean; detail: { message: string; reason: string };
} {
  return { ok: false, error: UNKNOWN_OUTCOME, retrySafe, detail: { message: UNKNOWN_OUTCOME_TEXT, reason: reason.slice(0, 300) } };
}

/** האם תשובת פונקציית מייל אומרת «לא ידוע אם יצא» (גם בגוף, גם במשפט שהגיע במקומו). */
export function isUnknownOutcome(v: unknown): boolean {
  if (v === UNKNOWN_OUTCOME || v === UNKNOWN_OUTCOME_TEXT) return true;
  if (!v || typeof v !== 'object') return false;
  const o = v as { error?: unknown; detail?: unknown };
  return o.error === UNKNOWN_OUTCOME || o.detail === UNKNOWN_OUTCOME || o.detail === UNKNOWN_OUTCOME_TEXT
    || (!!o.detail && typeof o.detail === 'object' && (o.detail as { message?: unknown }).message === UNKNOWN_OUTCOME_TEXT);
}

/**
 * ‼ מסלול הבדיקה: «שליחה» שלא יוצאת לרשת. מותר רק כשכל השלושה מתקיימים —
 * משתנה סביבה בפונקציה, כותרת מפורשת מהבודק, ושהפרויקט אינו הייצור.
 * הדפדפן לעולם לא שולח את הכותרת, ולכן במסך תמיד יוצאת שליחה אמיתית.
 */
export function testTransportAllowed(envTransport: string | undefined, header: string | null, supabaseUrl: string,
  prodRef: string): boolean {
  return envTransport === 'log' && header === 'log' && !!supabaseUrl && !supabaseUrl.includes(prodRef);
}

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const PROD_PROJECT_REF = 'uoweoqtuiettozagwgdw';

/**
 * לאן נשלח מייל. ‼ בסביבה שאינה הייצור אפשר להפנות לספק מדומה שקולט את ההודעות
 * (fake-email-provider ב-staging — RESEND_API_URL), כדי לבדוק את כל המסלול האמיתי
 * (תפיסה, מפתח אידמפוטנטיות, ניסיון חוזר, יומן) בלי שאף מייל יוצא. בייצור תמיד Resend,
 * גם אם המשתנה הוגדר בטעות.
 */
export function resendEmailsUrl(override: string | undefined, supabaseUrl: string): string {
  if (override && supabaseUrl && !supabaseUrl.includes(PROD_PROJECT_REF)) return override;
  return RESEND_EMAILS_URL;
}
