// Edge Function: quotation-reminders  (מופעל מ-pg_cron פעם ביום)
// כלל: תזכורת אחת, יום עסקים אחד לפני פקיעה, רק ל-sent/viewed שלא אושרו/בוטלו/פגו.
// מניעת כפילות מוחלטת: תפיסה אטומית של auto_reminder_sent_at לפני השליחה.
// כישלון: משחררים את התפיסה + מתעדים שגיאה (לא מסמנים שנשלח) → מוצג לרו"ח.
// אימות: x-cron-secret (מה-cron) או Authorization: Bearer <service_role> (הרצה ידנית).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// ★ מערכת העיצוב המשותפת — אותו קובץ שהאתר צורך. אין כאן צבעים/מעטפת משלנו.
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";

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
      const comm = profile?.communication || {};
      // ★ אותו פענוח + אותה מעטפת מייל של האתר — מהקובץ המשותף
      const brand = resolveBrand({
        firmName: profile?.firm_name,
        branding: profile?.branding || {},
        email: profile?.email,
        phone: profile?.phone,
        emailSignature: comm.emailSignature,
      });
      const firmName = brand.firmName;
      const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
      const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;
      const link = `${APP_URL}/?quote=${q.public_token}`;
      const expiry = new Date(q.expires_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
      const subject = `תזכורת — הצעת המחיר שלך בתוקף עד ${expiry}`;
      const html = buildBrandedEmail(brand, {
        heading: "תזכורת קטנה" + (firstName ? ", " + firstName : ""),
        bodyHtml: esc(`הצעת המחיר שהכנו עבורך עדיין ממתינה לאישורך. ההצעה בתוקף עד ${expiry}. נשמח לצרף אתכם.`),
        ctaLabel: "צפייה ואישור ההצעה",
        ctaHref: link,
        ctaArrow: true,
        showLinkFallback: true,
      });

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
