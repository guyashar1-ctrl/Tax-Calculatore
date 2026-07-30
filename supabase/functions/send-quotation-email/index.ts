// Edge Function: send-quotation-email
// שולח את מייל ההצעה ללקוח, או מייל בדיקה לרו"ח עצמו.
// ה-HTML מגיע מוכן מהצד-לקוח — אותו מחולל בדיוק שמייצר את התצוגה המקדימה,
// כדי שהמייל שנשלח יהיה זהה למה שהוצג (דרישת ה-PRD).
// אבטחה: verify_jwt=false בשער + אימות פנימי; שולח רק על הצעות של המשתמש.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { quotationId, isTest, html, subject } = await req.json();
    if (!quotationId || !html || !subject) return json({ error: "missing quotationId/html/subject" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: q } = await admin.from("quotations").select("*").eq("id", quotationId).single();
    if (!q || q.user_id !== user.id) return json({ error: "not found" }, 404);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    const firmName = (profile?.firm_name || "המשרד").trim();
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;

    // נמען: בדיקה → הרו"ח עצמו; אחרת → מייל הליד/הלקוח של ההצעה.
    let toEmail = "";
    if (isTest) {
      toEmail = (profile?.email && String(profile.email).trim()) || replyTo || user.email || "";
    } else if (q.client_id) {
      const { data: c } = await admin.from("clients").select("email").eq("id", q.client_id).single();
      toEmail = (c?.email || "").trim();
    } else if (q.lead_id) {
      const { data: l } = await admin.from("leads").select("email").eq("id", q.lead_id).single();
      toEmail = (l?.email || "").trim();
    }
    if (!toEmail) return json({ error: "no recipient email" }, 400);

    const finalSubject = isTest ? `[בדיקה] ${subject}` : subject;
    const payload: Record<string, unknown> = {
      from: `${firmName} <${fromAddress}>`,
      to: [toEmail],
      subject: finalSubject,
      html,
    };
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();

    // ‼ עותק ה-HTML נשמר יחד עם הרשומה, כמו בשאר המיילים. בלעדיו אי אפשר
    // לדעת בדיעבד מה הלקוח קיבל בפועל — מפתח ה-API של Resend מוגבל לשליחה.
    // (עד 2026-07-30 מייל ההצעה היה היחיד בלי עותק, ובדיקה של תקלת תצוגה
    // בטלפון נאלצה להסתמך על הסקה במקום על המייל עצמו.)
    const logBase = {
      user_id: user.id,
      client_id: q.client_id || null,
      to_email: toEmail,
      subject: finalSubject,
      kind: isTest ? "quotation_test" : "quotation",
      meta: { quotationId, quotationNumber: q.quotation_number, isTest: !!isTest },
      html,
    };
    if (!r.ok) {
      await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      return json({ error: "resend_failed", detail: body }, 502);
    }
    await admin.from("email_messages").insert({ ...logBase, resend_id: body.id, status: "sent" });
    return json({ ok: true, id: body.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
