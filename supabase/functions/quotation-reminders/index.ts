// Edge Function: quotation-reminders  (מופעל מ-pg_cron פעם ביום)
// כלל: תזכורת אחת, יום עסקים אחד לפני פקיעה, רק ל-sent/viewed שלא אושרו/בוטלו/פגו.
// מניעת כפילות מוחלטת: תפיסה אטומית של auto_reminder_sent_at לפני השליחה.
// כישלון: משחררים את התפיסה + מתעדים שגיאה (לא מסמנים שנשלח) → מוצג לרו"ח.
// אימות: x-cron-secret (מה-cron) או Authorization: Bearer <service_role> (הרצה ידנית).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ימי עסקים בישראל: ראשון–חמישי. שישי(5)/שבת(6) = סוף שבוע. חגים לא מטופלים.
function businessDaysUntil(target: Date, now: Date): number {
  if (target.getTime() <= now.getTime()) return 0;
  const d = new Date(now);
  let count = 0;
  while (d.getTime() < target.getTime()) {
    d.setDate(d.getDate() + 1);
    if (d.getTime() > target.getTime()) break;
    const day = d.getDay();
    if (day !== 5 && day !== 6) count++;
  }
  return count;
}

const THEME_INK: Record<string, string> = { monochrome: "#1A1A1A", navy: "#0E1F3A", emerald: "#0B3B36" };
const THEME_ACCENT: Record<string, string> = { monochrome: "#4F46E5", navy: "#C9A75A", emerald: "#10B981" };

function reminderHtml(o: { firmName: string; ink: string; accent: string; logoUrl: string; firstName: string; link: string; expiry: string; signature: string }) {
  const f = "Arial,Helvetica,sans-serif";
  const header = o.logoUrl
    ? `<img src="${o.logoUrl}" alt="${o.firmName}" style="max-height:40px;max-width:180px;border:0;" />`
    : `<div style="font-size:17px;font-weight:bold;color:${o.ink};">${o.firmName}</div>`;
  const sig = o.signature ? o.signature.replace(/\n/g, "<br/>") : `בברכה,<br/>${o.firmName}`;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:0;background:#F1F0EC;font-family:${f};">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="background:#F1F0EC;"><tr><td align="center" style="padding:28px 16px;">`
    + `<table role="presentation" width="480" cellpadding="0" cellspacing="0" dir="rtl" style="width:480px;max-width:480px;background:#fff;border:1px solid #ECEBE6;border-radius:16px;overflow:hidden;">`
    + `<tr><td style="height:4px;background:${o.accent};font-size:0;">&nbsp;</td></tr>`
    + `<tr><td style="padding:30px 32px;direction:rtl;text-align:right;">`
    + header
    + `<div style="font-size:20px;font-weight:bold;color:#111;margin:22px 0 12px;">תזכורת קטנה${o.firstName ? ", " + o.firstName : ""}</div>`
    + `<div style="font-size:15px;line-height:1.75;color:#575752;margin-bottom:22px;">הצעת המחיר שהכנו עבורך עדיין ממתינה לאישורך. ההצעה בתוקף עד ${o.expiry}. נשמח לצרף אתכם.</div>`
    + `<table role="presentation" width="100%"><tr><td align="center" style="border-radius:10px;background:${o.ink};">`
    + `<a href="${o.link}" style="display:block;padding:15px 20px;font-size:15px;font-weight:bold;color:#fff;text-decoration:none;border-radius:10px;">צפייה ואישור ההצעה&nbsp;&nbsp;←</a>`
    + `</td></tr></table>`
    + `<div dir="ltr" style="text-align:center;font-size:11px;color:#A6A5A0;word-break:break-all;margin:14px 0 22px;">${o.link}</div>`
    + `<div style="border-top:1px solid #F0EFEB;padding-top:16px;font-size:13px;line-height:1.7;color:#6B6B68;">${sig}</div>`
    + `</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── אימות: cron secret או service-role bearer ──
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("x-cron-secret") || "";
    let authorized = authHeader === `Bearer ${SERVICE_KEY}`;
    if (!authorized && cronSecret) {
      const { data: ok } = await admin.rpc("verify_quotation_cron_secret", { p: cronSecret });
      authorized = ok === true;
    }
    if (!authorized) return json({ error: "unauthorized" }, 401);

    const bodyJson = await req.json().catch(() => ({}));
    const dryRun = bodyJson?.dryRun === true;
    // שולחים כשנשאר יום עסקים אחד (או פחות) עד הפקיעה
    const bizDaysBefore = Number(bodyJson?.bizDaysBefore ?? 1);
    const now = new Date();
    const nowIso = now.toISOString();
    // סינון גס לפי חלון קלנדרי רחב (מכסה סופ"ש), ואז סינון מדויק לפי ימי עסקים
    const horizonIso = new Date(now.getTime() + 6 * 86400000).toISOString();

    const { data: rawCandidates, error: qErr } = await admin
      .from("quotations")
      .select("*")
      .in("status", ["sent", "viewed"])
      .not("expires_at", "is", null)
      .is("auto_reminder_sent_at", null)
      .lte("expires_at", horizonIso)
      .gt("expires_at", nowIso);
    if (qErr) return json({ error: "query_failed", detail: qErr.message }, 500);

    // רק הצעות שנותר להן ≤ bizDaysBefore ימי עסקים עד הפקיעה
    const candidates = (rawCandidates ?? []).filter(
      (q) => businessDaysUntil(new Date(q.expires_at), now) <= bizDaysBefore,
    );

    const profileCache = new Map<string, any>();
    async function getProfile(uid: string) {
      if (!profileCache.has(uid)) {
        const { data } = await admin.from("profiles").select("*").eq("id", uid).single();
        profileCache.set(uid, data || {});
      }
      return profileCache.get(uid);
    }

    let sent = 0, failed = 0, skipped = 0;
    const results: any[] = [];

    for (const q of candidates ?? []) {
      // תפיסה אטומית — מונע כפילות מוחלטת גם בהרצות חופפות
      const { data: claimed } = await admin
        .from("quotations")
        .update({ auto_reminder_sent_at: nowIso })
        .eq("id", q.id)
        .is("auto_reminder_sent_at", null)
        .select()
        .maybeSingle();
      if (!claimed) { skipped++; continue; }

      // נמען
      let toEmail = "";
      let firstName = "";
      if (q.client_id) {
        const { data: c } = await admin.from("clients").select("email,first_name").eq("id", q.client_id).single();
        toEmail = (c?.email || "").trim(); firstName = (c?.first_name || "").trim();
      } else if (q.lead_id) {
        const { data: l } = await admin.from("leads").select("email,full_name").eq("id", q.lead_id).single();
        toEmail = (l?.email || "").trim(); firstName = String(l?.full_name || "").trim().split(/\s+/)[0] || "";
      }

      const fail = async (msg: string) => {
        // שחרור התפיסה + תיעוד שגיאה — לא מסמנים שנשלח (כלל 6)
        await admin.from("quotations").update({ auto_reminder_sent_at: null, auto_reminder_error: msg.slice(0, 300), auto_reminder_error_at: nowIso }).eq("id", q.id);
        await admin.from("email_messages").insert({ user_id: q.user_id, client_id: q.client_id || null, to_email: toEmail || null, subject: "תזכורת — הצעת מחיר", kind: "quotation_reminder", status: "failed", error: msg.slice(0, 500), meta: { quotationId: q.id, quotationNumber: q.quotation_number, auto: true } });
        failed++; results.push({ id: q.id, status: "failed", error: msg });
      };

      if (!toEmail) { await fail("no recipient email"); continue; }

      const profile = await getProfile(q.user_id);
      const firmName = (profile?.firm_name || "המשרד").trim();
      const branding = profile?.branding || {};
      const comm = profile?.communication || {};
      const ink = THEME_INK[branding.theme] || "#1A1A1A";
      const accent = (branding.accentColor && String(branding.accentColor).trim()) || THEME_ACCENT[branding.theme] || "#4F46E5";
      const logoUrl = (branding.logoUrl && String(branding.logoUrl).trim()) || "";
      const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
      const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;
      const link = `${APP_URL}/?quote=${q.public_token}`;
      const expiry = new Date(q.expires_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
      const subject = `תזכורת — הצעת המחיר שלך בתוקף עד ${expiry}`;
      const html = reminderHtml({ firmName, ink, accent, logoUrl, firstName, link, expiry, signature: comm.emailSignature || "" });

      if (dryRun) {
        await admin.from("quotations").update({ auto_reminder_error: null, auto_reminder_error_at: null, events: [...(q.events || []), { type: "reminder_sent", at: nowIso, to: toEmail, auto: true, dryRun: true }] }).eq("id", q.id);
        await admin.from("email_messages").insert({ user_id: q.user_id, client_id: q.client_id || null, to_email: toEmail, subject, kind: "quotation_reminder", status: "sent", meta: { quotationId: q.id, quotationNumber: q.quotation_number, auto: true, dryRun: true } });
        sent++; results.push({ id: q.id, status: "sent", to: toEmail, dryRun: true });
        continue;
      }

      const payload: Record<string, unknown> = { from: `${firmName} <${fromAddress}>`, to: [toEmail], subject, html };
      if (replyTo) payload.reply_to = replyTo;
      let r: Response;
      try {
        r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } catch (e) { await fail(`fetch_failed: ${e}`); continue; }
      const respBody = await r.json().catch(() => ({}));
      if (!r.ok) { await fail(JSON.stringify(respBody)); continue; }

      // הצלחה — תיעוד to+timestamp בהיסטוריה (כלל 5), ניקוי שגיאה קודמת
      await admin.from("quotations").update({ auto_reminder_error: null, auto_reminder_error_at: null, events: [...(q.events || []), { type: "reminder_sent", at: nowIso, to: toEmail, auto: true }] }).eq("id", q.id);
      await admin.from("email_messages").insert({ user_id: q.user_id, client_id: q.client_id || null, to_email: toEmail, subject, kind: "quotation_reminder", status: "sent", resend_id: respBody.id, meta: { quotationId: q.id, quotationNumber: q.quotation_number, auto: true } });
      sent++; results.push({ id: q.id, status: "sent", to: toEmail });
    }

    return json({ ok: true, processed: (candidates ?? []).length, sent, failed, skipped, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
