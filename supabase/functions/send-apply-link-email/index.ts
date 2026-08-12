// Edge Function: send-apply-link-email
// שולח את קישור המילוי הציבורי הקבוע (?apply=TOKEN) ישירות למייל של נמען,
// ביוזמת הרו"ח מתוך "+ אדם חדש → שליחת קישור למילוי פרטים".
//
// ‼ אימייל הנמען הוא כתובת משלוח בלבד, לא זיהוי אדם — לעולם לא יוצר ליד.
// הליד נוצר רק כשהנמען עצמו שולח את הטופס הציבורי (submit-application),
// ולכן שליחת אותו קישור לכמה כתובות/כמה פעמים אינה יוצרת כפילות: אין כאן
// שום כתיבה לטבלת leads בכלל.
//
// אבטחה: verify_jwt=false בשער; מזוהה מה-JWT של הרו"ח בלבד (כמו notify-accountant
// במסלול הפנימי) — אין מסלול ציבורי לפונקציה הזו. הטוקן מאומת מול הפרופיל של
// אותו רו"ח, כדי שאי אפשר יהיה לשלוח בשם משרד אחר.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";

function isValidEmail(v: string): boolean {
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { token, recipientEmail } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !token.trim()) return json({ error: "missing_token" }, 400);
    const toEmail = typeof recipientEmail === "string" ? recipientEmail.trim() : "";
    if (!toEmail || !isValidEmail(toEmail)) return json({ error: "invalid_email" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ‼ הרו"ח בלבד: הטוקן ב-JWT, לא בגוף הבקשה — כדי שאי אפשר יהיה לבקש
    // שליחה בשם משרד אחר גם אם מנחשים את הטוקן הציבורי שלו.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile || profile.apply_token !== token.trim()) return json({ error: "forbidden" }, 403);

    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const link = `${APP_URL}/?apply=${token.trim()}`;

    const brand = resolveBrand({
      firmName: profile.firm_name,
      branding: profile.branding || {},
      email: profile.email,
      phone: profile.phone,
      emailSignature: profile.communication?.emailSignature,
    });
    const comm = profile.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile.email || undefined;

    const subject = "כמה פרטים כדי שנתחיל";
    const html = buildBrandedEmail(brand, {
      heading: "כמה פרטים כדי שנתחיל",
      bodyHtml: esc("היי, כדי שנוכל להתחיל לטפל בבקשה שלך, נשמח שתמלא/י כמה פרטים בקישור הבא. לוקח פחות מדקה."),
      ctaLabel: "למילוי הפרטים",
      ctaHref: link,
      ctaArrow: true,
      showLinkFallback: true,
      footerTagline: "מאובטח · פחות מדקה",
    });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const payload: Record<string, unknown> = {
      from: `${brand.firmName} <${fromAddress}>`,
      to: [toEmail],
      subject,
      html,
    };
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();

    const logBase = { user_id: userId, to_email: toEmail, subject, kind: "apply_link", html };
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
