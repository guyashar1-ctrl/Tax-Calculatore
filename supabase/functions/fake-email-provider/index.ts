// ═══════════════════════════════════════════════════════════════════════════
//  fake-email-provider — ספק דואר מדומה ל-staging בלבד. ‼ לא נפרס לייצור.
// ═══════════════════════════════════════════════════════════════════════════
//  מקבל בדיוק את מה ש-Resend מקבל (POST עם from/to/subject/html, Authorization,
//  Idempotency-Key) ועונה כמו Resend — אבל לא שולח: שומר ב-test_captured_emails.
//  כך כל מסלול השליחה האמיתי (תפיסה, מפתח, ניסיון חוזר, יומן) נבדק בלי מייל לאדם.
//
//  התנהגות Resend שמודמית:
//    · אותו Idempotency-Key + אותו גוף ⇒ 200 עם המזהה המקורי, בלי מייל נוסף;
//    · אותו מפתח + גוף אחר ⇒ 409 invalid_idempotent_request;
//    · שתי בקשות מקבילות עם אותו מפתח ⇒ אחת 409 concurrent_idempotent_requests.
//  כשלים מתוכננים לפי כתובת הנמען (לבדיקות):
//    · ‎fail-once‎ בכתובת — הניסיון הראשון לכל מפתח/גוף: 500; אחר כך מצליח;
//    · ‎fail-always‎ — 422 validation_error;
//    · ‎slow‎ — עונה אחרי 6 שניות (בדיקת «בתנועה»).
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PROD_PROJECT_REF } from "../_shared/resendResult.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // ‼ שער: לעולם לא בייצור, ורק מי שמחזיק את מפתח הספק של הפרויקט (פונקציות השרת שלנו).
  if (!SUPABASE_URL || SUPABASE_URL.includes(PROD_PROJECT_REF)) return json({ name: "forbidden" }, 403);
  if (req.method !== "POST") return json({ name: "method_not_allowed" }, 405);
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key || req.headers.get("Authorization") !== `Bearer ${key}`) {
    return json({ name: "validation_error", message: "API key is invalid", statusCode: 401 }, 401);
  }

  const raw = await req.text();
  let body: { from?: string; to?: string[] | string; subject?: string; html?: string } = {};
  try { body = JSON.parse(raw); } catch { return json({ name: "validation_error", message: "invalid json", statusCode: 422 }, 422); }
  const to = (Array.isArray(body.to) ? body.to : [body.to ?? ""]).map(String);
  const idem = req.headers.get("Idempotency-Key");
  const hash = await sha256(raw);
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const base = { idem_key: idem, body_hash: hash, to_emails: to, from_email: body.from ?? null,
                 subject: body.subject ?? null, html: body.html ?? null };
  const record = async (mode: string, status: number, response: unknown, deliveredId: string | null = null) =>
    admin.from("test_captured_emails").insert({ ...base, mode, status, response, delivered_id: deliveredId }).select("id").single();

  const addr = to.join(",").toLowerCase();
  if (addr.includes("slow")) await new Promise(r => setTimeout(r, 6000));
  if (addr.includes("fail-always")) {
    const resp = { name: "validation_error", message: "The to address is not allowed (fake provider)", statusCode: 422 };
    await record("rejected", 422, resp);
    return json(resp, 422);
  }

  if (idem) {
    const { data: prior } = await admin.from("test_captured_emails").select("id,body_hash")
      .eq("idem_key", idem).eq("mode", "delivered").maybeSingle();
    if (prior) {
      if (prior.body_hash === hash) {
        await record("replay", 200, { id: prior.id }, prior.id);
        return json({ id: prior.id });
      }
      const resp = { name: "invalid_idempotent_request", message: "Same idempotency key used with a different payload", statusCode: 409 };
      await record("conflict", 409, resp);
      return json(resp, 409);
    }
  }
  if (addr.includes("fail-once")) {
    const q = admin.from("test_captured_emails").select("id", { count: "exact", head: true }).eq("mode", "rejected");
    const { count } = idem ? await q.eq("idem_key", idem) : await q.eq("body_hash", hash);
    if ((count ?? 0) === 0) {
      const resp = { name: "internal_server_error", message: "Simulated provider failure (fake provider)", statusCode: 500 };
      await record("rejected", 500, resp);
      return json(resp, 500);
    }
  }

  const { data: row, error } = await record("delivered", 200, null);
  if (error) {
    // אותו מפתח נכנס עכשיו מבקשה מקבילה (האינדקס הייחודי) — כמו Resend.
    const resp = { name: "concurrent_idempotent_requests", message: "Another request with this key is in progress", statusCode: 409 };
    await record("conflict", 409, resp);
    return json(resp, 409);
  }
  return json({ id: row.id });
});
