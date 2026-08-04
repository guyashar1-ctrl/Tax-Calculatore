// Edge Function: send-release-email
// שולח מכתב שחרור לרו"ח הקודם. הנמען הוא כתובת מפורשת (הרו"ח הקודם), לא הלקוח.
// verify_jwt=false בשער + אימות פנימי; שולח רק בהקשר לקוח של המשתמש.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_SUBJECT_CHARS = 300;
const MAX_HTML_BYTES = 200 * 1024;

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { clientId, to, subject, html, ccClient } = await req.json();
    if (!clientId || !to || !subject || !html) return json({ error: "missing clientId/to/subject/html" }, 400);

    // ‼ הנמען כאן חופשי בכוונה (הרו"ח הקודם), ולכן התקרות הן מה שמונע מהפונקציה
    // להפוך למשגר תוכן חופשי לכל כתובת.
    if (String(subject).length > MAX_SUBJECT_CHARS) {
      return json({ error: "subject_too_long", detail: { message: `נושא המייל ארוך מ-${MAX_SUBJECT_CHARS} תווים.` } }, 400);
    }
    if (new TextEncoder().encode(String(html)).length > MAX_HTML_BYTES) {
      return json({ error: "html_too_large", detail: { message: `גוף המייל גדול מ-${MAX_HTML_BYTES / 1024}KB.` } }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: client } = await admin.from("clients").select("id,user_id,email").eq("id", clientId).single();
    if (!client || client.user_id !== user.id) return json({ error: "not found" }, 404);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    const firmName = (profile?.firm_name || "המשרד").trim();
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;

    // ‼ כתובת העותק נלקחת מהכרטיס בשרת ולא מהבקשה. הנמען הראשי חייב להיות
    // חופשי (הרו"ח הקודם אינו במסד), אבל עותק לכתובת שרירותית היה הופך את
    // הפונקציה למשגר לכל מקום — ולכן הלקוח שולח דגל, לא כתובת.
    const ccAddress = ccClient && client.email && String(client.email).trim()
      ? String(client.email).trim() : null;

    const payload: Record<string, unknown> = { from: `${firmName} <${fromAddress}>`, to: [to], subject, html };
    if (ccAddress) payload.cc = [ccAddress];
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();

    // עותק הגוף נשמר יחד עם הרשומה, כמו בשאר המיילים. מכתב שחרור הוא המסמך
    // שמעביר את התיק — בלי עותק אין דרך להוכיח בדיעבד מה בדיוק נשלח.
    const logBase = { user_id: user.id, client_id: clientId, to_email: to, subject, kind: "release", html, meta: { from: `${firmName} <${fromAddress}>`, cc: ccAddress } };
    if (!r.ok) {
      await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      return json({ error: "resend_failed", detail: body }, 502);
    }
    await admin.from("email_messages").insert({ ...logBase, resend_id: body.id, status: "sent" });
    return json({ ok: true, id: body.id, from: `${firmName} <${fromAddress}>`, cc: ccAddress });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
