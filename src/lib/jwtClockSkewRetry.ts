// ─── «JWT issued at future» — ניסיון חוזר אחד, רק על השגיאה הזו (14.10.2026) ────────────────────────────
// ‼ ראיה (staging, 13.10 12:42): אסימון שהונפק ב-12:42:34 נדחה ב-12:42:35.4 עם 401 שאורך גופו 79 תווים — בדיוק
//   {"code":"PGRST303","details":null,"hint":null,"message":"JWT issued at future"}. השעון של שרת ההרשאות הקדים לרגע
//   את שרת הנתונים. זה נדיר (1 ביממה; 0 ב-15 כניסות נקיות וב-42 בדיקות מלאות), אבל בכניסה טרייה בקשה אחת חוזרת ריקה.
// ‼ הבקשה נדחתה לפני שהגיעה למסד, ולכן ניסיון חוזר בטוח גם לכתיבה. כל שגיאה אחרת — עוברת כמו שהיא.

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const CLOCK_SKEW_RETRY_MS = 1500;

/** האם זו בדיוק דחיית «הונפק בעתיד» של PostgREST. */
export async function isIssuedInFuture(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = await res.clone().json() as { code?: string; message?: string };
    return body?.code === 'PGRST303' && /issued at future/i.test(body?.message ?? '');
  } catch { return false; }
}

/** עוטף fetch: על «JWT issued at future» — המתנה קצרה וניסיון אחד נוסף. גוף שאי אפשר לשלוח פעמיים (stream) — בלי ניסיון. */
export function withClockSkewRetry(fetchImpl: FetchLike, wait: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): FetchLike {
  return async (input, init) => {
    // Request נצרך בשליחה — עותק לפני, למקרה של ניסיון שני
    const again = typeof Request !== 'undefined' && input instanceof Request ? input.clone() : input;
    const res = await fetchImpl(input, init);
    if (!(await isIssuedInFuture(res))) return res;
    if (typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream) return res;
    await wait(CLOCK_SKEW_RETRY_MS);
    return fetchImpl(again, init);
  };
}
