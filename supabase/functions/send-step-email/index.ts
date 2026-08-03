// Edge Function: send-step-email
// מייל אחד לכל שלב קליטה. kind קובע את התוכן:
//   paperless_invite – הזמנה לפתיחת חשבון בפייפרלס
//   retainer_request – הרשאה לתשלום החודשי (רק אחרי שהפייפרלס חובר)
//   step_reminder    – תזכורת נייטרלית על שלב שממתין
//
// העיצוב נגזר ממערכת העיצוב המשותפת (_shared/designSystem.ts) והנוסח מ-
// _shared/stepTemplates.ts. אין כאן טבלת תבניות משלנו ואין צבעים קשיחים.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי מה-JWT של הרו"ח. אין מסלול
// ציבורי — בשונה מ-send-onboarding-email, אף לקוח לא מפעיל את הפונקציה הזו.
//
// ‼ הנמען נקבע כאן מהכרטיס של הלקוח בלבד. כתובת שמגיעה בגוף הבקשה מתעלמים
// ממנה: דפדפן שנפרץ, או באג בצד הלקוח, לא יכולים להסיט מייל של לקוח לכתובת
// אחרת.
//
// ‼ הרשאת תשלום נעולה = אין מייל, גם לא תצוגה מקדימה. התלות "חיבור פייפרלס
// לפני הרשאת תשלום" נאכפת ב-advance_onboarding_step, והשער הזה מונע דלת
// אחורית שבה המייל יוצא לפני שהשלב בכלל נפתח.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";
import {
  defaultTemplate,
  renderTemplate,
  STEP_EMAIL_KINDS,
  type StepEmailKind,
  type StepEmailTemplate,
} from "../_shared/stepTemplates.ts";

/** איזה מייל מותר לאיזה שלב. תזכורת מותרת לכל שלב. */
const KIND_FOR_STEP: Record<string, StepEmailKind[]> = {
  paperless_invite: ["paperless_invite", "step_reminder"],
  retainer_authorization: ["retainer_request", "step_reminder"],
};

const HEADING: Record<StepEmailKind, string> = {
  paperless_invite: "ברוכים הבאים",
  retainer_request: "הרשאה לתשלום החודשי",
  step_reminder: "תזכורת קצרה",
};

const CTA_LABEL: Record<StepEmailKind, string> = {
  paperless_invite: "לפתיחת החשבון בפייפרלס",
  retainer_request: "לאישור ההרשאה",
  step_reminder: "",
};

const FOOTER_TAGLINE: Record<StepEmailKind, string> = {
  paperless_invite: "פתיחת החשבון · כדקה",
  retainer_request: "מאובטח · פחות מדקה",
  step_reminder: "",
};

/** סכום בשקלים בפורמט שהלקוח קורא, בלי תלות בספריות. */
function formatAmount(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n) || n <= 0) return "";
  const whole = Math.round(n);
  return "₪" + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 'YYYY-MM' → 'ספטמבר 2026'. חודש החיוב חייב להיקרא כחודש, לא כקוד. */
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
function formatMonth(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${m[1]}` : s;
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
    const { stepId, kind: rawKind, preview, overrides } = await req.json();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── הרשאה: רק רו"ח מחובר ──────────────────────────────────────────────
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "unauthorized" }, 401);

    if (!stepId) return json({ error: "missing stepId" }, 400);
    const kind = String(rawKind || "") as StepEmailKind;
    if (!STEP_EMAIL_KINDS.includes(kind)) return json({ error: "bad_kind" }, 400);

    const { data: step } = await admin.from("onboarding_steps").select("*").eq("id", stepId).maybeSingle();
    if (!step || step.user_id !== userId) return json({ error: "not found" }, 404);

    const allowed = KIND_FOR_STEP[step.step_type] ?? ["step_reminder"];
    if (!allowed.includes(kind)) {
      return json({
        error: "kind_not_allowed",
        detail: { message: "סוג המייל אינו מתאים לשלב הזה." },
      }, 400);
    }

    // ‼ השער של התלות הקשיחה. אין כאן שום דרך לעקוף אותו — גם preview חסום.
    if (kind === "retainer_request" && step.status === "locked") {
      return json({
        error: "step_locked",
        detail: { message: "הרשאת התשלום נעולה עד לאישור חיבור הלקוח לפייפרלס." },
      }, 400);
    }

    // ── הנמען — מהכרטיס של הלקוח, לא מהבקשה ───────────────────────────────
    const { data: client } = await admin
      .from("clients").select("id,user_id,first_name,last_name,email")
      .eq("id", step.client_id).maybeSingle();
    if (!client || client.user_id !== userId) return json({ error: "not found" }, 404);
    const toEmail = String(client.email || "").trim();
    if (!toEmail) return json({ error: "no client email" }, 400);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const brand = resolveBrand({
      firmName: profile?.firm_name,
      branding: profile?.branding || {},
      email: profile?.email,
      phone: profile?.phone,
      emailSignature: profile?.communication?.emailSignature,
    });
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;

    const settings = (profile?.settings || {}) as Record<string, any>;
    const inviteUrl = String(settings?.paperless?.inviteUrl || "").trim();
    const payload = (step.payload || {}) as Record<string, unknown>;
    const authUrl = String(payload.authUrl || "").trim();

    if (kind === "paperless_invite" && !inviteUrl) {
      return json({
        error: "no_invite_url",
        detail: { message: "לא הוגדר קישור הזמנה לפייפרלס בהגדרות המשרד." },
      }, 400);
    }
    if (kind === "retainer_request" && !authUrl) {
      return json({
        error: "no_auth_url",
        detail: { message: "יש להזין את קישור ההרשאה מפייפרלס לפני השליחה." },
      }, 400);
    }

    // ── הנוסח: ברירת מחדל ⊕ הגדרות המשרד ⊕ עריכה לשליחה הזו ───────────────
    const base = defaultTemplate(kind);
    const saved = (settings?.commTemplates || {})[kind] || {};
    const merged: StepEmailTemplate = {
      subject: String(overrides?.subject ?? saved.subject ?? base.subject).trim() || base.subject,
      body: String(overrides?.body ?? saved.body ?? base.body),
    };

    const clientFirst = String(client.first_name || "").trim();
    const clientFull = [client.first_name, client.last_name].filter(Boolean).join(" ").trim();
    const rendered = renderTemplate(merged, {
      clientName: clientFull || clientFirst,
      firmName: brand.firmName,
      paperlessInviteUrl: inviteUrl,
      amount: formatAmount(payload.amount),
      billingStartMonth: formatMonth(payload.billingStartMonth),
      authUrl,
    });

    const ctaHref = kind === "paperless_invite" ? inviteUrl : kind === "retainer_request" ? authUrl : "";
    const ctaLabel = ctaHref ? CTA_LABEL[kind] : "";
    const html = buildBrandedEmail(brand, {
      heading: HEADING[kind] + (clientFirst ? ", " + clientFirst : ""),
      bodyHtml: esc(rendered.body).replace(/\n/g, "<br />"),
      ctaLabel: ctaLabel || undefined,
      ctaHref: ctaLabel ? ctaHref : undefined,
      ctaArrow: true,
      showLinkFallback: !!ctaLabel,
      footerTagline: FOOTER_TAGLINE[kind] || undefined,
    });

    const from = `${brand.firmName} <${fromAddress}>`;

    // תצוגה מקדימה — אותו HTML בדיוק, בלי שליחה ובלי רישום ביומן.
    // subject/bodyText מוחזרים כנוסח הגולמי (עם ה-{{שדות}}), כי זה מה שנפתח
    // לעריכה: מי שעורך ומוחק בטעות את {{amount}} צריך לראות אותו קודם.
    if (preview) {
      return json({
        ok: true,
        preview: true,
        subject: rendered.subject,
        subjectText: merged.subject,
        bodyText: merged.body,
        to: toEmail,
        from,
        html,
      });
    }

    const resendPayload: Record<string, unknown> = { from, to: [toEmail], subject: rendered.subject, html };
    if (replyTo) resendPayload.reply_to = replyTo;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(resendPayload),
    });
    const body = await r.json();

    const logBase = {
      user_id: userId,
      client_id: client.id,
      step_id: step.id,
      to_email: toEmail,
      subject: rendered.subject,
      kind,
      html,
    };

    if (!r.ok) {
      // ‼ שורת הכישלון נרשמת בלי מפתח ייחודי: אחרת הניסיון החוזר המוצלח היה
      // מתנגש בה ונחשב ל"כבר נשלח" — והמייל לא היה יוצא לעולם.
      await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      return json({ error: "resend_failed", detail: body }, 502);
    }

    // מפתח ייחודי לשורת היומן — שכבת ההגנה מפני רישום כפול. שליחה נוספת של
    // אותו סוג לאותו שלב היא תזכורת לגיטימית, ולכן מקבלת מספר רץ ולא נחסמת.
    const { count } = await admin
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("step_id", step.id)
      .eq("kind", kind);
    const idempotencyKey = `step:${step.id}:${kind}:${(count ?? 0) + 1}`;

    const { error: logErr } = await admin.from("email_messages")
      .insert({ ...logBase, resend_id: body.id, status: "sent", idempotency_key: idempotencyKey });
    if (logErr && logErr.code === "23505") return json({ ok: true, alreadySent: true });

    // ── קידום השלב ────────────────────────────────────────────────────────
    // ‼ advance_onboarding_step בודק את auth.uid(), שהוא null תחת מפתח השירות,
    // ולכן הקריאה אליו מכאן הייתה נכשלת. במקומה נעשות כאן בדיוק שתי הכתיבות
    // שהיא הייתה עושה: הסטטוס והרישום ביומן האירועים.
    if (kind !== "step_reminder") {
      // תזכורת אינה מזיזה את הכדור — היא נשלחת גם על שלב שממתין לרו"ח עצמו.
      await admin.from("onboarding_steps")
        .update({ status: "waiting_client", ball: "client", updated_at: new Date().toISOString() })
        .eq("id", step.id);
    }
    await admin.from("onboarding_events").insert({
      user_id: userId,
      step_id: step.id,
      engagement_id: step.engagement_id,
      type: "email_sent",
      actor: "accountant",
      note: `נשלח מייל: ${rendered.subject}`,
      meta: { kind, to: toEmail, resend_id: body.id },
    });

    return json({ ok: true, id: body.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
