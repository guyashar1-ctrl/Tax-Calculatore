// Edge Function: send-onboarding-email
// שולח את מייל ההזדנות ללקוח. כל הזהות (שם משרד, מיתוג, כתובת שולח, reply-to,
// חתימה) נקראת מ-Firm Profile (טבלת profiles) — אין ערכים קשיחים. מעבר לדומיין
// מותאם בעתיד = עדכון senderEmail ב-Firm Profile + אימות הדומיין אצל הספק, בלי שינוי קוד.
//
// אבטחה: verify_jwt=false בשער, ואימות פנימי — מאמת את המשתמש מה-JWT ושהבקשה שלו.
// סודות (secrets בצד-שרת): RESEND_API_KEY, APP_URL. SUPABASE_* מוזרקים אוטומטית.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const THEME_INK: Record<string, string> = { monochrome: "#1A1A1A", navy: "#0E1F3A", emerald: "#0B3B36" };

function deriveMonogram(firmName: string): string {
  if (!firmName) return "★";
  const words = firmName.replace(/משרד|רואי|חשבון/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return firmName.trim().slice(0, 2);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] || "") + (words[1][0] || "");
}

function emailHtml(o: { firmName: string; ink: string; monogram: string; clientFirst: string; link: string; signature: string }) {
  const sig = o.signature ? o.signature.replace(/\n/g, "<br/>") : ("בברכה,<br/>" + o.firmName);
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#F1F0EC;font-family:Arial,Helvetica,sans-serif;">`
    + `<div style="max-width:480px;margin:0 auto;padding:24px 16px;">`
    + `<div style="background:#fff;border:1px solid #E7E6E1;border-radius:14px;padding:30px 34px;">`
    + `<div style="margin-bottom:24px;"><span style="display:inline-block;width:28px;height:28px;line-height:26px;text-align:center;border:1.5px solid ${o.ink};border-radius:50%;color:${o.ink};font-size:12px;">${o.monogram}</span>`
    + `<span style="font-size:13px;color:${o.ink};margin-inline-start:8px;">${o.firmName}</span></div>`
    + `<div style="font-size:21px;font-weight:bold;color:#111;margin-bottom:10px;">נעים להכיר${o.clientFirst ? ", " + o.clientFirst : ""}</div>`
    + `<div style="font-size:14px;line-height:1.7;color:#5C5C58;margin-bottom:22px;">שמחים שבחרתם בנו. כדי שנתחיל לייצג אתכם מול רשויות המס, נשאר רק לאמת כמה פרטי זיהוי — פחות מדקה, מאובטח.</div>`
    + `<a href="${o.link}" style="display:block;background:${o.ink};color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:14px;font-size:15px;font-weight:bold;margin-bottom:14px;">להשלמת הפרטים ←</a>`
    + `<div style="text-align:center;font-size:11px;color:#9A9A95;margin-bottom:24px;word-break:break-all;">${o.link}</div>`
    + `<div style="border-top:1px solid #F0EFEB;padding-top:18px;font-size:12.5px;line-height:1.7;color:#6B6B68;">${sig}</div>`
    + `</div></div></body></html>`;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { requestId } = await req.json();
    if (!requestId) return json({ error: "missing requestId" }, 400);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://accountant-crm-brown.vercel.app";
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
    const monogram = (branding.monogram || deriveMonogram(firmName)).slice(0, 2);
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;
    const link = `${APP_URL}/?onboard=${reqRow.onboarding_token}`;
    const clientFirst = String(reqRow.client_name || "").trim().split(/\s+/)[0] || "";
    const payload: Record<string, unknown> = {
      from: `${firmName} <${fromAddress}>`,
      to: [reqRow.client_email],
      subject: "ברוכים הבאים — נשאר רק לאמת את הזהות",
      html: emailHtml({ firmName, ink, monogram, clientFirst, link, signature: comm.emailSignature || "" }),
    };
    if (replyTo) payload.reply_to = replyTo;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await r.json();
    if (!r.ok) return json({ error: "resend_failed", detail: body }, 502);
    return json({ ok: true, id: body.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
