// Edge Function: resend-webhook
// מקבל אירועי Resend (delivered/bounced/opened/clicked/...) ומעדכן את email_messages
// בזמן אמת לפי resend_id. מאמת חתימת Svix מול RESEND_WEBHOOK_SECRET.
//
// ‼ בלי סוד מוגדר הפונקציה דוחה הכול. עד 2026-08 היא קיבלה גם פניות לא חתומות,
// כלומר כל אחד שידע את הכתובת יכול היה לסמן מיילים כ"נמסר" או כ"הוקפץ".
// ‼ מ-174 גם חותמת זמן ישנה נדחית (חלון של חמש דקות, לפי Svix) — אחרת בקשה
// חתומה שנלכדה ניתנת לשידור חוזר. הלוגיקה עצמה ב-webhook.ts, בלי תלות ב-Deno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isFreshTimestamp, patchesForEvent, verifySvix } from "./webhook.ts";

Deno.serve(async (req: Request) => {
  const SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
  if (!SECRET) return new Response(JSON.stringify({ error: "webhook secret not configured" }), { status: 401 });
  if (req.method !== "POST") return new Response("ok");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const raw = await req.text();

  {
    const id = req.headers.get("svix-id") || "";
    const ts = req.headers.get("svix-timestamp") || "";
    const sig = req.headers.get("svix-signature") || "";
    if (!isFreshTimestamp(ts)) return new Response(JSON.stringify({ error: "stale timestamp" }), { status: 401 });
    const ok = await verifySvix(SECRET, id, ts, sig, raw);
    if (!ok) return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch (_e) { return new Response("bad json", { status: 400 }); }
  const type: string = evt?.type || "";
  const emailId: string | undefined = evt?.data?.email_id || evt?.data?.id;
  if (!emailId) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();
  const q = () => admin.from("email_messages");

  try {
    for (const p of patchesForEvent(type, now, evt)) {
      let qb = q().update(p.set).eq("resend_id", emailId);
      for (const [op, col, val] of p.where) {
        qb = op === "eq" ? qb.eq(col, val) : op === "in" ? qb.in(col, val as unknown[]) : qb.is(col, val as null);
      }
      const { error } = await qb;
      if (error) throw error;
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
