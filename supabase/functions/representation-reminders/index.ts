// Edge Function: representation-reminders  (מיועד ל-pg_cron, יומי — כמו quotation-reminders)
// יכולת חדשה (186), כבויה כברירת מחדל לכל משרד: profiles.settings.representation.reminders.<audience>.
//
// שלושה מעקבים עצמאיים, כל אחד עם מרחב מצב משלו ותנאי-עצירה משלו:
//   sign     – חתימה על ייפוי הכוח לא הושלמה (representation_requests.status = 'pending_signature')
//   niClient / niSpouse – אישור בביטוח הלאומי טרם התקבל, לכל אדם בנפרד
//              (execution.nationalInsurance[.Spouse].instructionsSentAt קיים, confirmedAt חסר)
//   portal   – "זירוז אישור הייצוג באזור האישי" טרם דווח (onboarding_steps.step_type='rep_client_approval',
//              payload.clientDeclaredAt חסר)
//
// כלל אחיד: תזכורת יוצאת רק אם (1) המתג של המשרד דלוק, (2) הספירה מתחת ל-maxReminders,
// (3) חלפו לפחות afterDays מאז התזכורת האחרונה (או מאז האירוע המקורי אם עוד לא נשלחה תזכורת).
// מונה+תאריך נשמרים בתוך ה-jsonb הקיים של השורה עצמה (execution.reminders.* / payload.reminder)
// — אין טבלה חדשה. ברגע שהפעולה הרלוונטית הושלמה, השורה כבר לא עונה על תנאי השאילתה
// ולכן התזכורות נעצרות מעצמן, בלי צורך "לבטל" דבר.
//
// הנוסח קבוע (system copy) ואינו ניתן להתאמה מהמשרד — רק הקצב (מופעל/כבוי, אחרי כמה
// ימים, עד כמה פעמים) הוא הגדרה. זה תואם למה שאושר באב-הטיפוס: אין כפתור "ערוך" על
// תזכורת. ראה docs/prototypes/representation-settings.html.
//
// אבטחה: כמו quotation-reminders — x-cron-secret (מה-cron, מאומת מול
// representation_reminder_cron_secret ב-Vault, migration 189) או
// Authorization: Bearer <service_role> (הרצה ידנית).
//
// ‼ בטיחות מול חפיפת הרצות: קריאה→שליחה→כתיבה (כפי שהיה כאן קודם) משאיר חלון
// שבו שתי הרצות חופפות יכולות לקרוא את אותו מונה ולשלוח שתיהן. התביעה
// (claim_representation_reminder / claim_representation_portal_reminder,
// מיגרציה 186) היא compare-and-swap אטומי בשרת: "עדכן את המונה רק אם הוא
// עדיין השווה למה שקראתי" — 0 שורות עודכנו = מישהו כבר תבע, מדלגים בלי
// לשלוח. נכשלה השליחה בפועל (Resend) ⇒ משחררים את התביעה (release_*) כדי
// שההרצה הבאה תוכל לנסות שוב, בלי לאבד את ההזדמנות היחידה לתזכורת הזאת.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";
import { RepReminderAudience, resolveRepReminderConfig } from "../_shared/repTemplates.ts";

type ClaimAudience = "sign" | "niClient" | "niSpouse";

const NI_SITE = "https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx";
const NI_PHONE = "02-5393740";

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Infinity;
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── אימות: cron secret או service-role bearer — זהה ל-quotation-reminders ──
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("x-cron-secret") || "";
    let authorized = authHeader === `Bearer ${SERVICE_KEY}`;
    if (!authorized && cronSecret) {
      const { data: ok } = await admin.rpc("verify_representation_reminder_cron_secret", { p: cronSecret });
      authorized = ok === true;
    }
    if (!authorized) return json({ error: "unauthorized" }, 401);

    const bodyJson = await req.json().catch(() => ({}));
    const dryRun = bodyJson?.dryRun === true;
    const now = new Date();

    const profileCache = new Map<string, any>();
    async function getProfile(uid: string) {
      if (!profileCache.has(uid)) {
        const { data } = await admin.from("profiles").select("*").eq("id", uid).single();
        profileCache.set(uid, data || {});
      }
      return profileCache.get(uid);
    }
    function reminderCfg(profile: any, audience: RepReminderAudience) {
      return resolveRepReminderConfig(audience, profile?.settings?.representation?.reminders?.[audience]);
    }

    async function logMessage(row: {
      user_id: string; client_id?: string | null; request_id?: string | null; step_id?: string | null;
      to_email: string; subject: string; kind: string; status: "sent" | "failed"; resend_id?: string; error?: string;
      meta?: Record<string, unknown>; idempotencyKey?: string;
    }) {
      // ‼ שכבת הגנה שנייה, כמו send-onboarding-email: email_messages_idempotency_key_idx
      // הוא unique index חלקי על (user_id, idempotency_key). התביעה האטומית היא ההגנה
      // העיקרית מול שליחה כפולה; זה מבטיח שגם רישום היומן עצמו לא יוכפל תחת אותו מפתח.
      await admin.from("email_messages").insert({
        user_id: row.user_id, client_id: row.client_id ?? null, request_id: row.request_id ?? null, step_id: row.step_id ?? null,
        to_email: row.to_email, subject: row.subject, kind: row.kind, status: row.status,
        resend_id: row.resend_id ?? null, error: row.error ?? null, meta: row.meta ?? {},
        ...(row.idempotencyKey ? { idempotency_key: row.idempotencyKey } : {}),
      });
    }

    /** תביעה אטומית על representation_requests.execution.reminders.<audience>. */
    async function claimReminder(requestId: string, audience: ClaimAudience, expectedCount: number): Promise<boolean> {
      const { data, error } = await admin.rpc("claim_representation_reminder", {
        p_request_id: requestId, p_audience: audience, p_expected_count: expectedCount,
      });
      if (error) { console.error("claim_representation_reminder failed", error); return false; }
      return data === true;
    }
    async function releaseReminder(requestId: string, audience: ClaimAudience, claimedCount: number, prevLastSentAt: string | null) {
      const { error } = await admin.rpc("release_representation_reminder_claim", {
        p_request_id: requestId, p_audience: audience, p_claimed_count: claimedCount, p_prev_last_sent_at: prevLastSentAt,
      });
      if (error) console.error("release_representation_reminder_claim failed", error);
    }
    /** תביעה אטומית מקבילה על onboarding_steps.payload.reminder (הכרטיס בדף האישי). */
    async function claimPortalReminder(stepId: string, expectedCount: number): Promise<boolean> {
      const { data, error } = await admin.rpc("claim_representation_portal_reminder", {
        p_step_id: stepId, p_expected_count: expectedCount,
      });
      if (error) { console.error("claim_representation_portal_reminder failed", error); return false; }
      return data === true;
    }
    async function releasePortalReminder(stepId: string, claimedCount: number, prevLastSentAt: string | null) {
      const { error } = await admin.rpc("release_representation_portal_reminder_claim", {
        p_step_id: stepId, p_claimed_count: claimedCount, p_prev_last_sent_at: prevLastSentAt,
      });
      if (error) console.error("release_representation_portal_reminder_claim failed", error);
    }

    async function sendMail(profile: any, toEmail: string, subject: string, html: string) {
      const comm = profile?.communication || {};
      const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
      const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;
      const brand = resolveBrand({
        firmName: profile?.firm_name, branding: profile?.branding || {},
        email: profile?.email, phone: profile?.phone, emailSignature: comm.emailSignature,
      });
      const payload: Record<string, unknown> = { from: `${brand.firmName} <${fromAddress}>`, to: [toEmail], subject, html };
      if (replyTo) payload.reply_to = replyTo;
      if (dryRun) return { ok: true, id: "dry-run" };
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const respBody = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: JSON.stringify(respBody) };
      return { ok: true, id: respBody.id };
    }

    const results: Record<string, unknown[]> = { sign: [], niClient: [], niSpouse: [], portal: [] };
    let sent = 0, failed = 0, skippedDisabled = 0, skippedNotDue = 0, skippedCapped = 0, skippedRaced = 0;

    // ── 1) חתימה על ייפוי הכוח ──────────────────────────────────────────────
    {
      const { data: rows, error } = await admin.from("representation_requests").select("*").eq("status", "pending_signature");
      if (error) return json({ error: "query_failed_sign", detail: error.message }, 500);
      for (const req of rows ?? []) {
        const profile = await getProfile(req.user_id);
        const cfg = reminderCfg(profile, "sign");
        if (!cfg.enabled) { skippedDisabled++; continue; }
        const rem = (req.execution?.reminders?.sign) || {};
        const count = Number(rem.count || 0);
        if (count >= cfg.maxReminders) { skippedCapped++; continue; }
        const since = rem.lastSentAt || req.execution?.signatureEmailSentAt || req.updated_at;
        if (daysSince(since, now) < cfg.afterDays) { skippedNotDue++; continue; }
        const toEmail = String(req.client_email || "").trim();
        if (!toEmail) continue;

        // ‼ התביעה קודמת לשליחה — לא אחריה. זה מה שסוגר את חלון החפיפה.
        const claimed = await claimReminder(req.id, "sign", count);
        if (!claimed) { skippedRaced++; results.sign.push({ id: req.id, status: "raced" }); continue; }
        const occurrence = count + 1;

        const brand = resolveBrand({ firmName: profile?.firm_name, branding: profile?.branding || {}, email: profile?.email, phone: profile?.phone, emailSignature: profile?.communication?.emailSignature });
        const link = `${APP_URL}/?onboard=${req.onboarding_token}`;
        const subject = "תזכורת - נשאר רק לחתום על ייפוי הכוח";
        const html = buildBrandedEmail(brand, {
          heading: "תזכורת קטנה",
          bodyHtml: esc("ייפוי הכוח לייצוג מול רשויות המס עדיין ממתין לחתימתכם. הקישור הקבוע שקיבלתם מוביל ישירות לחתימה - לוקח דקה."),
          ctaLabel: "לחתימה על הטופס", ctaHref: link, ctaArrow: true, showLinkFallback: true,
        });

        const send = await sendMail(profile, toEmail, subject, html);
        if (send.ok) {
          await logMessage({
            user_id: req.user_id, client_id: req.linked_client_id, request_id: req.id, to_email: toEmail, subject,
            kind: "representation_reminder_sign", status: "sent", resend_id: send.id, meta: { reminderCount: occurrence },
            idempotencyKey: `representation_reminder_sign:${req.id}:r${occurrence}`,
          });
          sent++; results.sign.push({ id: req.id, status: "sent", to: toEmail });
        } else {
          // ‼ השליחה בפועל נכשלה — משחררים את התביעה כדי שההרצה הבאה תוכל
          // לנסות שוב, במקום לאבד את התזכורת הזאת לצמיתות.
          await releaseReminder(req.id, "sign", occurrence, rem.lastSentAt ?? null);
          await logMessage({ user_id: req.user_id, client_id: req.linked_client_id, request_id: req.id, to_email: toEmail, subject, kind: "representation_reminder_sign", status: "failed", error: send.error, meta: { reminderCount: count } });
          failed++; results.sign.push({ id: req.id, status: "failed", error: send.error });
        }
      }
    }

    // ── 2) ביטוח לאומי — לקוח ובן/בת זוג, כל אחד בנפרד ──────────────────────
    for (const role of ["client", "spouse"] as const) {
      const execKey = role === "spouse" ? "nationalInsuranceSpouse" : "nationalInsurance";
      const audience: RepReminderAudience = role === "spouse" ? "niSpouse" : "niClient";
      const { data: rows, error } = await admin.from("representation_requests").select("*")
        .not("execution", "is", null);
      if (error) return json({ error: "query_failed_ni", detail: error.message }, 500);
      for (const req of rows ?? []) {
        const track = req.execution?.[execKey];
        if (!track?.instructionsSentAt || track?.confirmedAt) continue;
        const profile = await getProfile(req.user_id);
        const cfg = reminderCfg(profile, audience);
        if (!cfg.enabled) { skippedDisabled++; continue; }
        const rem = (req.execution?.reminders?.[audience]) || {};
        const count = Number(rem.count || 0);
        if (count >= cfg.maxReminders) { skippedCapped++; continue; }
        const since = rem.lastSentAt || track.instructionsSentAt;
        if (daysSince(since, now) < cfg.afterDays) { skippedNotDue++; continue; }
        if (!req.linked_client_id) continue;
        const { data: client } = await admin.from("clients")
          .select("id,email,spouse_email,first_name,spouse_first_name,spouse_name").eq("id", req.linked_client_id).maybeSingle();
        if (!client) continue;
        // ‼ הנמען נגזר מהכרטיס, לעולם לא מ-request.client_email — כלל §9.
        // audience ('niClient'/'niSpouse') ו-role ('client'/'spouse') נגזרים
        // מאותו לולאה-אב ואינם יכולים להתפצל — אין נתיב שבו נמען של אדם אחד
        // מקבל תוכן/תביעה של האודיינס של האדם השני.
        const toEmail = String((role === "spouse" ? client.spouse_email : client.email) || "").trim();
        if (!toEmail) continue;

        const claimed = await claimReminder(req.id, audience, count);
        if (!claimed) { skippedRaced++; results[audience].push({ id: req.id, status: "raced" }); continue; }
        const occurrence = count + 1;

        const profileBrand = resolveBrand({ firmName: profile?.firm_name, branding: profile?.branding || {}, email: profile?.email, phone: profile?.phone, emailSignature: profile?.communication?.emailSignature });
        const deadlineLine = track.deadline
          ? `<br>יש לאשר עד ${esc(new Date(track.deadline).toLocaleDateString("he-IL"))}.` : "";
        const subject = "תזכורת - אישור ייפוי הכוח בביטוח הלאומי עדיין ממתין";
        const html = buildBrandedEmail(profileBrand, {
          heading: "תזכורת קטנה",
          bodyHtml: esc(`אישור ייפוי הכוח מול הביטוח הלאומי עדיין לא התקבל. מספר האסמכתא: ${String(track.referenceNumber || "")}.`) + deadlineLine
            + `<br><br>אפשר לאשר באתר הביטוח הלאומי, או בטלפון ${esc(NI_PHONE)}.`,
          ctaLabel: "לאישור באתר הביטוח הלאומי", ctaHref: NI_SITE, ctaArrow: true, showLinkFallback: true,
        });

        const send = await sendMail(profile, toEmail, subject, html);
        if (send.ok) {
          await logMessage({
            user_id: req.user_id, client_id: req.linked_client_id, request_id: req.id, to_email: toEmail, subject,
            kind: `representation_reminder_${audience}`, status: "sent", resend_id: send.id, meta: { reminderCount: occurrence, role },
            idempotencyKey: `representation_reminder_${audience}:${req.id}:r${occurrence}`,
          });
          sent++; results[audience].push({ id: req.id, status: "sent", to: toEmail });
        } else {
          await releaseReminder(req.id, audience, occurrence, rem.lastSentAt ?? null);
          await logMessage({ user_id: req.user_id, client_id: req.linked_client_id, request_id: req.id, to_email: toEmail, subject, kind: `representation_reminder_${audience}`, status: "failed", error: send.error, meta: { reminderCount: count, role } });
          failed++; results[audience].push({ id: req.id, status: "failed", error: send.error });
        }
      }
    }

    // ── 3) הכרטיס "זירוז אישור הייצוג באזור האישי" ──────────────────────────
    {
      const { data: steps, error } = await admin.from("onboarding_steps").select("*")
        .eq("step_type", "rep_client_approval")
        .not("status", "in", '("completed","verified","skipped","cancelled")');
      if (error) return json({ error: "query_failed_portal", detail: error.message }, 500);
      for (const s of steps ?? []) {
        if (s.payload?.clientDeclaredAt) continue; // כבר דיווח — אין למה להזכיר
        const profile = await getProfile(s.user_id);
        const cfg = reminderCfg(profile, "portal");
        if (!cfg.enabled) { skippedDisabled++; continue; }
        const rem = s.payload?.reminder || {};
        const count = Number(rem.count || 0);
        if (count >= cfg.maxReminders) { skippedCapped++; continue; }
        const since = rem.lastSentAt || s.published_at || s.created_at;
        if (daysSince(since, now) < cfg.afterDays) { skippedNotDue++; continue; }
        if (!s.client_id) continue;
        const { data: client } = await admin.from("clients").select("id,email,portal_token").eq("id", s.client_id).maybeSingle();
        const toEmail = String(client?.email || "").trim();
        if (!toEmail || !client?.portal_token) continue;

        const claimed = await claimPortalReminder(s.id, count);
        if (!claimed) { skippedRaced++; results.portal.push({ id: s.id, status: "raced" }); continue; }
        const occurrence = count + 1;

        const profileBrand = resolveBrand({ firmName: profile?.firm_name, branding: profile?.branding || {}, email: profile?.email, phone: profile?.phone, emailSignature: profile?.communication?.emailSignature });
        const link = `${APP_URL}/?portal=${client.portal_token}`;
        const subject = "תזכורת - יש לכם פעולה זמינה בדף האישי";
        const html = buildBrandedEmail(profileBrand, {
          heading: "תזכורת קטנה",
          bodyHtml: esc("יש לכם פעולה אופציונלית ממתינה בדף האישי שלכם, שיכולה לקצר את ההמתנה לאישור הרשויות. אפשר גם לדלג עליה - הייצוג ייכנס לתוקף בכל מקרה."),
          ctaLabel: "לדף האישי", ctaHref: link, ctaArrow: true, showLinkFallback: true,
        });

        const send = await sendMail(profile, toEmail, subject, html);
        if (send.ok) {
          await logMessage({
            user_id: s.user_id, client_id: s.client_id, step_id: s.id, to_email: toEmail, subject,
            kind: "representation_reminder_portal", status: "sent", resend_id: send.id, meta: { reminderCount: occurrence },
            idempotencyKey: `representation_reminder_portal:${s.id}:r${occurrence}`,
          });
          sent++; results.portal.push({ id: s.id, status: "sent", to: toEmail });
        } else {
          await releasePortalReminder(s.id, occurrence, rem.lastSentAt ?? null);
          await logMessage({ user_id: s.user_id, client_id: s.client_id, step_id: s.id, to_email: toEmail, subject, kind: "representation_reminder_portal", status: "failed", error: send.error, meta: { reminderCount: count } });
          failed++; results.portal.push({ id: s.id, status: "failed", error: send.error });
        }
      }
    }

    return json({ ok: true, sent, failed, skippedDisabled, skippedNotDue, skippedCapped, skippedRaced, dryRun, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
