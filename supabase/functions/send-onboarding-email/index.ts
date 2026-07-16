// Edge Function: send-onboarding-email
// שולח מיילים ללקוח בשלבי הייצוג. stage קובע את התוכן:
//   onboard – אימות זהות · sign – חתימה על ייפוי הכוח · active – הייצוג אושר
//   intake – שאלון עדכון יזום מכרטיס הלקוח
// כל העיצוב (צבעים/פונט/כותרת/כפתור/פינות) נגזר ממערכת העיצוב המרכזית —
// profiles.branding.docDesign (אותה תבנית של הסטודיו). אין צבעים קשיחים:
// שינוי תבנית/צבע בסטודיו מתעדכן אוטומטית בכל מיילי הייצוג.
// ⚠ טבלת התבניות כאן משוכפלת מ-src/data/quotationDesignPresets.ts — לשמור מסונכרן.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי מה-JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Stage = "onboard" | "sign" | "active" | "intake";
const COPY: Record<Stage, { subject: string; heading: string; body: string; cta: string }> = {
  intake: {
    subject: "שאלון קצר — כדי שהתיק שלכם יישאר מעודכן",
    heading: "נשמח לעדכון קצר",
    body: "כדי שנוכל להמשיך לטפל בענייני המס שלכם בצורה מדויקת, נשמח שתענו על שאלון קצר. השאלון מתאים את עצמו אליכם — עונים רק על מה שרלוונטי, ואפשר לסמן \"לא בטוח\" בכל שאלה.",
    cta: "למילוי השאלון",
  },
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

// ── מערכת העיצוב (משוכפל מ-quotationDesignPresets.ts) ──
type Tokens = { ink: string; accent: string; pageBg: string; cardBg: string; border: string; muted: string; headerStyle: string; buttonStyle: string; corner: string; font: string };
const PRESETS: Record<string, Tokens> = {
  "minimal-light": { ink: "#1A1A1A", accent: "#4F46E5", pageBg: "#F4F3EF", cardBg: "#FFFFFF", border: "#EDECE7", muted: "#6B6A63", headerStyle: "minimal", buttonStyle: "solid", corner: "soft", font: "Heebo" },
  "navy-lux": { ink: "#0E1F3A", accent: "#C9A75A", pageBg: "#F4F5F8", cardBg: "#FFFFFF", border: "#E6E8EE", muted: "#5C6474", headerStyle: "band", buttonStyle: "solid", corner: "rounded", font: "Frank Ruhl Libre" },
  "emerald-fresh": { ink: "#0B3B36", accent: "#10B981", pageBg: "#F1F6F4", cardBg: "#FFFFFF", border: "#E1EBE7", muted: "#5A6B66", headerStyle: "centered", buttonStyle: "pill", corner: "soft", font: "Assistant" },
  "warm-cream": { ink: "#2A2622", accent: "#B4703A", pageBg: "#F7F3EC", cardBg: "#FFFDF9", border: "#EBE4D8", muted: "#7A7167", headerStyle: "minimal", buttonStyle: "solid", corner: "soft", font: "Frank Ruhl Libre" },
  "mono-editorial": { ink: "#111111", accent: "#111111", pageBg: "#FAFAFA", cardBg: "#FFFFFF", border: "#E5E5E5", muted: "#6B7280", headerStyle: "band", buttonStyle: "outline", corner: "sharp", font: "Secular One" },
  "soft-pastel": { ink: "#2E2A4A", accent: "#7C6FE0", pageBg: "#F6F4FB", cardBg: "#FFFFFF", border: "#EAE6F5", muted: "#6A6486", headerStyle: "centered", buttonStyle: "pill", corner: "soft", font: "Rubik" },
  "tech-blue": { ink: "#0F172A", accent: "#2563EB", pageBg: "#F1F5F9", cardBg: "#FFFFFF", border: "#E2E8F0", muted: "#64748B", headerStyle: "band", buttonStyle: "pill", corner: "rounded", font: "Assistant" },
  "black-gold": { ink: "#111111", accent: "#C6A15B", pageBg: "#F4F2EE", cardBg: "#FFFFFF", border: "#E8E4DC", muted: "#6E6A62", headerStyle: "band", buttonStyle: "solid", corner: "sharp", font: "Frank Ruhl Libre" },
  "wine-elegant": { ink: "#4A1F2B", accent: "#9B2D3F", pageBg: "#F8F3F1", cardBg: "#FFFDFC", border: "#EEE0DD", muted: "#7C6660", headerStyle: "centered", buttonStyle: "solid", corner: "soft", font: "Frank Ruhl Libre" },
  "teal-clean": { ink: "#0F3B3A", accent: "#0EA5A5", pageBg: "#F0F7F6", cardBg: "#FFFFFF", border: "#DEEDEB", muted: "#557370", headerStyle: "minimal", buttonStyle: "pill", corner: "soft", font: "Rubik" },
  "graphite": { ink: "#1F2933", accent: "#3D4B5C", pageBg: "#F5F6F7", cardBg: "#FFFFFF", border: "#E4E7EA", muted: "#66727E", headerStyle: "minimal", buttonStyle: "solid", corner: "rounded", font: "Assistant" },
  "sunset-warm": { ink: "#3A2417", accent: "#E0672E", pageBg: "#FBF4EE", cardBg: "#FFFDFB", border: "#F0E3D8", muted: "#84695A", headerStyle: "centered", buttonStyle: "pill", corner: "soft", font: "Rubik" },
  "forest-deep": { ink: "#1B2E20", accent: "#2F7D4F", pageBg: "#F1F5F0", cardBg: "#FFFFFF", border: "#E1EADD", muted: "#5C6B5D", headerStyle: "band", buttonStyle: "solid", corner: "rounded", font: "Assistant" },
};
const CORNER_RADIUS: Record<string, number> = { sharp: 4, rounded: 12, soft: 20 };
const THEME_INK: Record<string, string> = { monochrome: "#1A1A1A", navy: "#0E1F3A", emerald: "#0B3B36" };
const THEME_ACCENT: Record<string, string> = { monochrome: "#4F46E5", navy: "#C9A75A", emerald: "#10B981" };

function deriveMonogram(firmName: string): string {
  if (!firmName) return "★";
  const words = firmName.replace(/משרד|רואי|חשבון/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return firmName.trim().slice(0, 2);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] || "") + (words[1][0] || "");
}

interface Brand { firmName: string; monogram: string; logoUrl: string; font: string; ink: string; accent: string; pageBg: string; cardBg: string; border: string; muted: string; radius: number; headerStyle: string; buttonStyle: string; signature: string; phone: string; email: string; }

// אותה לוגיקה של deriveQuotationBrand בצד-לקוח: תבנית כבסיס, אחרת נופלים למותג הישן.
function resolveBrand(profile: any): Brand {
  const b = profile?.branding || {};
  const dd = b.docDesign || {};
  const themeId = b.theme || "monochrome";
  const base: Tokens = dd.preset && PRESETS[dd.preset]
    ? PRESETS[dd.preset]
    : { ...PRESETS["minimal-light"], ink: THEME_INK[themeId] || "#1A1A1A", accent: (b.accentColor && String(b.accentColor).trim()) || THEME_ACCENT[themeId] || "#4F46E5", font: b.font || "Heebo" };
  const corner = dd.corner || base.corner;
  return {
    firmName: (profile?.firm_name || "המשרד").trim(),
    monogram: (b.monogram || deriveMonogram(profile?.firm_name || "")).slice(0, 2),
    logoUrl: (b.logoUrl && String(b.logoUrl).trim()) || "",
    font: dd.font || base.font,
    ink: dd.ink || base.ink,
    accent: dd.accent || (b.accentColor && String(b.accentColor).trim()) || base.accent,
    pageBg: dd.pageBg || base.pageBg,
    cardBg: dd.cardBg || base.cardBg,
    border: dd.border || base.border,
    muted: dd.muted || base.muted,
    radius: CORNER_RADIUS[corner] ?? 20,
    headerStyle: dd.headerStyle || base.headerStyle,
    buttonStyle: dd.buttonStyle || base.buttonStyle,
    signature: (profile?.communication?.emailSignature || "").trim(),
    phone: profile?.phone || "",
    email: profile?.email || "",
  };
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function headerRow(br: Brand): string {
  const f = `'${br.font}',Arial,Helvetica,sans-serif`;
  const mark = br.logoUrl
    ? `<img src="${esc(br.logoUrl)}" alt="${esc(br.firmName)}" style="max-height:40px;max-width:180px;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr><td style="width:38px;height:38px;border:1.5px solid ${br.ink};border-radius:50%;text-align:center;vertical-align:middle;color:${br.ink};font-family:${f};font-size:15px;font-weight:600;">${esc(br.monogram)}</td><td style="padding-right:10px;color:${br.ink};font-family:${f};font-size:17px;font-weight:600;">${esc(br.firmName)}</td></tr></table>`;
  const markDark = br.logoUrl
    ? `<img src="${esc(br.logoUrl)}" alt="${esc(br.firmName)}" style="max-height:38px;max-width:180px;border:0;" />`
    : `<span style="color:#ffffff;font-family:${f};font-size:17px;font-weight:600;">${esc(br.firmName)}</span>`;
  if (br.headerStyle === "band") return `<tr><td style="background:${br.ink};padding:22px 40px;">${markDark}</td></tr>`;
  if (br.headerStyle === "centered") return `<tr><td align="center" style="padding:30px 40px 6px;border-bottom:1px solid ${br.border};">${mark}</td></tr>`;
  return `<tr><td style="padding:30px 40px 0;">${mark}</td></tr>`;
}

function buttonHtml(br: Brand, label: string, href: string): string {
  const f = `'${br.font}',Arial,Helvetica,sans-serif`;
  const rad = br.buttonStyle === "pill" ? 999 : Math.max(br.radius, 8);
  const inner = `<a href="${esc(href)}" style="display:block;padding:15px 20px;font-family:${f};font-size:16px;font-weight:700;text-decoration:none;text-align:center;border-radius:${rad}px;`;
  return br.buttonStyle === "outline"
    ? `${inner}color:${br.accent};border:2px solid ${br.accent};">${esc(label)}&nbsp;&nbsp;←</a>`
    : `${inner}color:#ffffff;background:${br.accent};">${esc(label)}&nbsp;&nbsp;←</a>`;
}

function emailShell(br: Brand, c: { heading: string; body: string; ctaLabel: string; link: string }): string {
  const f = `'${br.font}',Arial,Helvetica,sans-serif`;
  const sig = br.signature ? esc(br.signature) : "בברכה,\n" + esc(br.firmName);
  const contact = [br.phone, br.email].filter(Boolean).map(esc).join(" · ");
  const cta = c.ctaLabel && c.link
    ? `<tr><td style="padding:8px 40px 8px;">${buttonHtml(br, c.ctaLabel, c.link)}`
      + `<div dir="ltr" style="text-align:center;font-family:${f};font-size:11px;color:${br.muted};word-break:break-all;margin:12px 0 4px;">${esc(c.link)}</div></td></tr>`
    : "";
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:0;background:${br.pageBg};font-family:${f};color:${br.ink};">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${br.pageBg};padding:24px 0;"><tr><td align="center">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${br.cardBg};border:1px solid ${br.border};border-radius:${br.radius + 4}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">`
    + headerRow(br)
    + `<tr><td style="padding:${br.headerStyle === "minimal" ? "22" : "26"}px 40px 6px;"><div style="font-family:${f};font-size:24px;font-weight:700;color:${br.ink};letter-spacing:-.02em;">${esc(c.heading)}</div>`
    + `<div style="font-family:${f};font-size:15px;line-height:1.7;color:${br.muted};padding-top:10px;">${esc(c.body)}</div></td></tr>`
    + cta
    + `<tr><td style="padding:20px 40px 32px;border-top:1px solid ${br.border};"><div style="font-family:${f};font-size:13px;line-height:1.7;color:${br.muted};white-space:pre-line;">${sig}</div>`
    + (contact ? `<div style="font-family:${f};font-size:12px;color:${br.muted};padding-top:8px;">${contact}</div>` : "")
    + `</td></tr></table>`
    + `<div style="font-family:${f};font-size:11px;color:${br.muted};text-align:center;margin-top:14px;">מאובטח · פחות מדקה</div>`
    + `</td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { requestId, stage: rawStage, signerId, clientId, email } = await req.json();
    const stage: Stage = (rawStage === "sign" || rawStage === "active" || rawStage === "intake") ? rawStage : "onboard";
    if (stage === "intake" ? !clientId : !requestId) return json({ error: "missing requestId" }, 400);
    const copy = COPY[stage];
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    let link = "";
    let toEmail = "";
    let clientFirst = "";
    let logClientId: string | null = null;
    let logRequestId: string | null = null;
    let reqRow: any = null;
    if (stage === "intake") {
      const { data: clientRow } = await admin.from("clients").select("id,user_id,first_name,last_name,email,intake_token").eq("id", clientId).single();
      if (!clientRow || clientRow.user_id !== user.id) return json({ error: "not found" }, 404);
      toEmail = (email && String(email).trim()) || clientRow.email || "";
      if (!toEmail) return json({ error: "no client email" }, 400);
      let intakeToken = clientRow.intake_token;
      if (!intakeToken) {
        intakeToken = crypto.randomUUID().replace(/-/g, "");
        const { error: tokenErr } = await admin.from("clients").update({ intake_token: intakeToken }).eq("id", clientId);
        if (tokenErr) return json({ error: "token_save_failed" }, 500);
      }
      link = `${APP_URL}/?intake=${intakeToken}`;
      clientFirst = String(clientRow.first_name || "").trim();
      logClientId = clientRow.id;
    } else {
      const { data } = await admin.from("representation_requests").select("*").eq("id", requestId).single();
      reqRow = data;
      if (!reqRow || reqRow.user_id !== user.id) return json({ error: "not found" }, 404);
      if (!reqRow.client_email) return json({ error: "no client email" }, 400);
      logClientId = reqRow.linked_client_id;
      logRequestId = reqRow.id;
    }
    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    const brand = resolveBrand(profile);
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;

    if (stage !== "intake") {
      link = `${APP_URL}/?onboard=${reqRow.onboarding_token}`;
      toEmail = reqRow.client_email;
      clientFirst = String(reqRow.client_name || "").trim().split(/\s+/)[0] || "";
    }
    if (stage === "sign" && signerId) {
      const signers: any[] = Array.isArray(reqRow.signers) ? reqRow.signers : [];
      const signer = signers.find((s) => s?.id === signerId);
      if (!signer?.email || !signer?.signToken) return json({ error: "signer not found" }, 400);
      link = `${APP_URL}/?sign=${signer.signToken}`;
      toEmail = signer.email;
      clientFirst = String(signer.name || "").trim().split(/\s+/)[0] || clientFirst;
    }

    const heading = copy.heading + (clientFirst ? ", " + clientFirst : "");
    const html = emailShell(brand, { heading, body: copy.body, ctaLabel: copy.cta, link: copy.cta ? link : "" });

    const payload: Record<string, unknown> = { from: `${brand.firmName} <${fromAddress}>`, to: [toEmail], subject: copy.subject, html };
    if (replyTo) payload.reply_to = replyTo;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await r.json();

    const logBase = { user_id: user.id, client_id: logClientId, request_id: logRequestId, to_email: toEmail, subject: copy.subject, kind: stage };
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
