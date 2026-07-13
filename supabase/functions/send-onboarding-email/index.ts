// Edge Function: send-onboarding-email
// שולח מיילים ללקוח בשלבי תהליך הייצוג. stage קובע את התוכן:
//   onboard – אימות זהות (ברירת מחדל) · sign – חתימה על ייפוי הכוח · active – הייצוג אושר
// כל הזהות (שם משרד, מיתוג, כתובת שולח, reply-to, חתימה, לוגו) נקראת מ-Firm Profile.
//
// אבטחה: verify_jwt=false בשער, ואימות פנימי — מאמת את המשתמש מה-JWT ושהבקשה שלו.
// סודות (secrets בצד-שרת): RESEND_API_KEY, APP_URL. SUPABASE_* מוזרקים אוטומטית.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const THEME_INK: Record<string, string> = { monochrome: "#1A1A1A", navy: "#0E1F3A", emerald: "#0B3B36" };
const THEME_ACCENT: Record<string, string> = { monochrome: "#4F46E5", navy: "#C9A75A", emerald: "#10B981" };

type Stage = "onboard" | "sign" | "active";
const COPY: Record<Stage, { subject: string; heading: string; body: string; cta: string }> = {
  onboard: {
    subject: "ברוכים הבאים — נשאר רק לאמת את הזהות",
    heading: "נעים להכיר",
    body: "שמחים שבחרתם בנו. כדי שנתחיל לייצג אתכם מול רשויות המס, נשאר רק לאמת כמה פרטי זיהוי — פחות מדקה, מאובטח.",
    cta: "להשלמת הפרטים",
  },
  sign: {
    subject: "הטופס מוכן — נשאר רק לחתום",
    heading: "כמעט סיימנו",
    body: "הכנו עבורכם את טופס ייפוי הכוח לייצוג מול רשויות המס. נשאר רק לחתום — פחות מדקה, מאובטח.",
    cta: "לחתימה על הטופס",
  },
  active: {
    subject: "הייצוג אושר — נתחיל לעבוד",
    heading: "הכול מוכן",
    body: "הייצוג שלכם מול רשויות המס אושר בהצלחה. ניצור קשר בקרוב להשלמת הפרטים הראשוניים. תודה שבחרתם בנו!",
    cta: "",
  },
};

function deriveMonogram(firmName: string): string {
  if (!firmName) return "★";
  const words = firmName.replace(/משרד|רואי|חשבון/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return firmName.trim().slice(0, 2);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] || "") + (words[1][0] || "");
}

// עיצוב המייל: מבנה טבלה + כיוון RTL מוטמע בכל אלמנט (Gmail מוחק dir מתגית <html>).
// לוגו מחליף את המונוגרמה כשקיים. כפתור ה-CTA מוצג רק כשיש ctaLabel.
function emailHtml(o: { firmName: string; ink: string; accent: string; monogram: string; logoUrl: string; clientFirst: string; link: string; signature: string; heading: string; body: string; ctaLabel: string }) {
  const sig = o.signature ? o.signature.replace(/\n/g, "<br/>") : ("בברכה,<br/>" + o.firmName);
  const f = "Arial,Helvetica,sans-serif";
  const header = o.logoUrl
    ? `<img src="${o.logoUrl}" alt="${o.firmName}" style="max-height:44px;max-width:190px;display:block;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>`
      + `<td style="vertical-align:middle;"><div style="width:34px;height:34px;border-radius:50%;border:1.5px solid ${o.ink};text-align:center;line-height:31px;font-family:${f};font-size:13px;color:${o.ink};">${o.monogram}</div></td>`
      + `<td style="vertical-align:middle;padding-right:10px;font-family:${f};font-size:14px;color:${o.ink};">${o.firmName}</td>`
      + `</tr></table>`;
  const ctaBlock = o.ctaLabel
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:10px;background:${o.ink};">`
      + `<a href="${o.link}" style="display:block;padding:15px 20px;font-family:${f};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;text-align:center;border-radius:10px;">${o.ctaLabel}&nbsp;&nbsp;←</a>`
      + `</td></tr></table>`
      + `<div dir="ltr" style="text-align:center;font-family:${f};font-size:11px;color:#A6A5A0;word-break:break-all;margin:14px 0 26px;">${o.link}</div>`
    : `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>`;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:0;background:#F1F0EC;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background:#F1F0EC;">`
    + `<tr><td align="center" style="padding:28px 16px;">`
    + `<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="width:480px;max-width:480px;background:#ffffff;border:1px solid #ECEBE6;border-radius:16px;overflow:hidden;">`
    + `<tr><td style="height:4px;background:${o.accent};line-height:4px;font-size:0;">&nbsp;</td></tr>`
    + `<tr><td style="padding:30px 32px;direction:rtl;text-align:right;">`
    + header
    + `<div style="font-family:${f};font-size:22px;font-weight:bold;line-height:1.3;color:#111111;margin:22px 0 12px;">${o.heading}${o.clientFirst ? ", " + o.clientFirst : ""}</div>`
    + `<div style="font-family:${f};font-size:15px;line-height:1.75;color:#575752;margin-bottom:26px;">${o.body}</div>`
    + ctaBlock
    + `<div style="border-top:1px solid #F0EFEB;padding-top:18px;direction:rtl;text-align:right;font-family:${f};font-size:13px;line-height:1.7;color:#6B6B68;">${sig}</div>`
    + `</td></tr></table>`
    + `<div style="font-family:${f};font-size:11px;color:#B0AFA9;text-align:center;margin-top:14px;direction:rtl;">מאובטח · פחות מדקה</div>`
    + `</td></tr></table>`
    + `</body></html>`;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { requestId, stage: rawStage, signerId } = await req.json();
    if (!requestId) return json({ error: "missing requestId" }, 400);
    const stage: Stage = (rawStage === "sign" || rawStage === "active") ? rawStage : "onboard";
    const copy = COPY[stage];
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: reqRow } = await admin.from("representation_requests").select("*").eq("id", requestId).single();
    if (!reqRow || reqRow.user_id !== user.id) return json({ error: "not found" }, 404);
    if (!reqRow.client_email) return json({ error: "no client email" }, 400);
    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    const firmName = (profile?.firm_name || "המשרד").trim();
    const branding = profile?.branding || {};
    const comm = profile?.communication || {};
    const ink = THEME_INK[branding.theme] || "#1A1A1A";
    const accent = (branding.accentColor && String(branding.accentColor).trim()) || THEME_ACCENT[branding.theme] || "#4F46E5";
    const monogram = (branding.monogram || deriveMonogram(firmName)).slice(0, 2);
    const logoUrl = (branding.logoUrl && String(branding.logoUrl).trim()) || "";
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;
    // ברירת מחדל: קישור ההזדהות של הבקשה. עבור stage=sign עם signerId — קישור
    // חתימה אישי (signToken) לחותם המסוים, לכתובת המייל שלו.
    let link = `${APP_URL}/?onboard=${reqRow.onboarding_token}`;
    let toEmail = reqRow.client_email;
    let clientFirst = String(reqRow.client_name || "").trim().split(/\s+/)[0] || "";
    if (stage === "sign" && signerId) {
      const signers: any[] = Array.isArray(reqRow.signers) ? reqRow.signers : [];
      const signer = signers.find((s) => s?.id === signerId);
      if (!signer?.email || !signer?.signToken) return json({ error: "signer not found" }, 400);
      link = `${APP_URL}/?sign=${signer.signToken}`;
      toEmail = signer.email;
      clientFirst = String(signer.name || "").trim().split(/\s+/)[0] || clientFirst;
    }
    const payload: Record<string, unknown> = {
      from: `${firmName} <${fromAddress}>`,
      to: [toEmail],
      subject: copy.subject,
      html: emailHtml({ firmName, ink, accent, monogram, logoUrl, clientFirst, link, signature: comm.emailSignature || "", heading: copy.heading, body: copy.body, ctaLabel: copy.cta }),
    };
    if (replyTo) payload.reply_to = replyTo;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await r.json();

    const logBase = { user_id: user.id, client_id: reqRow.linked_client_id, request_id: reqRow.id, to_email: toEmail, subject: copy.subject, kind: stage };
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
