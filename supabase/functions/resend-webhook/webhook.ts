// הלוגיקה הטהורה של resend-webhook — בלי Deno, בלי supabase-js — כדי שאפשר
// יהיה להריץ אותה כפי שהיא גם ב-node (scripts/staging-test-edge-atomic.mjs).
// index.ts רק מחבר אותה לבקשה ולמסד.

/** חלון הסובלנות של Svix/Resend לחותמת הזמן: חמש דקות לכל כיוון. */
export const TIMESTAMP_TOLERANCE_SEC = 5 * 60;

/**
 * ‼ חתימה תקפה לבדה אינה מספיקה: בקשה חתומה שנלכדה אפשר לשדר שוב אחרי שעה
 * ולסמן מייל כ"נמסר" או "הוקפץ" מחדש. החתימה מכסה גם את svix-timestamp, ולכן
 * דחיית חותמת ישנה סוגרת את השידור החוזר בלי מצב נוסף בצד שלנו.
 */
export function isFreshTimestamp(
  ts: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec: number = TIMESTAMP_TOLERANCE_SEC,
): boolean {
  if (!/^\d{1,12}$/.test(ts)) return false;
  return Math.abs(nowSec - Number(ts)) <= toleranceSec;
}

export async function verifySvix(secret: string, id: string, ts: string, sig: string, payload: string): Promise<boolean> {
  try {
    const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const data = new TextEncoder().encode(`${id}.${ts}.${payload}`);
    const mac = await crypto.subtle.sign("HMAC", key, data);
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    const provided = sig.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
    return provided.includes(expected);
  } catch (_e) {
    return false;
  }
}

/** עדכון אחד לשורת email_messages: מה לכתוב, ובאילו תנאים (מעבר ל-resend_id). */
export interface EmailPatch {
  set: Record<string, unknown>;
  where: Array<["eq" | "in" | "is", string, unknown]>;
}

/**
 * מה כל אירוע של Resend עושה לשורה. הסדר בין העדכונים משמעותי: קודם חותמת
 * הזמן (פעם אחת), ואחר כך הסטטוס — ורק אם הוא עדיין "מוקדם" יותר מהאירוע.
 */
export function patchesForEvent(type: string, now: string, evt: { data?: Record<string, unknown> } | null | undefined): EmailPatch[] {
  switch (type) {
    case "email.delivered":
      return [
        { set: { status: "delivered", delivered_at: now, updated_at: now }, where: [["in", "status", ["sent", "delivery_delayed"]]] },
        { set: { delivered_at: now, updated_at: now }, where: [["is", "delivered_at", null]] },
      ];
    case "email.delivery_delayed":
      return [{ set: { status: "delivery_delayed", updated_at: now }, where: [["eq", "status", "sent"]] }];
    case "email.bounced":
      return [{ set: { status: "bounced", error: "bounced", updated_at: now }, where: [] }];
    case "email.complained":
      return [{ set: { status: "complained", updated_at: now }, where: [] }];
    case "email.failed": {
      // ‼ עד 174 האירוע לא טופל: מייל ש-Resend לא הצליח לשלוח נשאר אצלנו
      // "נשלח" לנצח. הסיבה נשמרת כדי שהרו"ח יראה למה.
      const failed = (evt?.data?.failed ?? null) as { reason?: unknown } | null;
      const reason = typeof failed?.reason === "string" && failed.reason.trim()
        ? failed.reason.trim()
        : "resend: email.failed";
      return [{ set: { status: "failed", error: reason.slice(0, 500), updated_at: now }, where: [] }];
    }
    case "email.opened":
      return [
        { set: { opened_at: now, updated_at: now }, where: [["is", "opened_at", null]] },
        { set: { status: "opened", updated_at: now }, where: [["in", "status", ["sent", "delivered", "delivery_delayed"]]] },
      ];
    case "email.clicked":
      return [
        { set: { clicked_at: now, updated_at: now }, where: [["is", "clicked_at", null]] },
        { set: { status: "clicked", updated_at: now }, where: [["in", "status", ["sent", "delivered", "opened", "delivery_delayed"]]] },
      ];
    default:
      return [];
  }
}
