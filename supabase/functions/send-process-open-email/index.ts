// Edge Function: send-process-open-email
// המייל שפותח את התהליך — "פתחנו לך דף אישי, הנה מה שנשאר".
//
// ‼ זה המייל היחיד שאינו תלוי בשלב אחד. כל שאר המיילים (הזמנה לפייפרלס,
// שאלון, הרשאה, תזכורת) מדברים על בקשה בודדת ולכן חיים ב-send-step-email.
// כאן הנושא הוא התהליך כולו, ולכן הקלט הוא הלקוח ולא השלב.
//
// ‼ רשימת הבקשות שבמייל נלקחת מ-get_client_portal — אותה פונקציה שמייצרת את
// הדף האישי. מייל שמפרט רשימה משלו היה מבטיח ללקוח דבר אחד ומראה לו אחר,
// בדיוק ביום שהרו"ח מוסיף או מסיר בקשה.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי מה-JWT של הרו"ח, כמו
// send-step-email. הנמען נקבע מהכרטיס בלבד — כתובת שמגיעה בגוף הבקשה
// מתעלמים ממנה.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";
import { defaultTemplate, renderTemplate, type StepEmailTemplate } from "../_shared/stepTemplates.ts";

const KIND = "process_open";

interface PortalItem { bucket?: string; label?: string; sub?: string }

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
    const { clientId, preview, overrides } = await req.json();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "unauthorized" }, 401);
    if (!clientId) return json({ error: "missing clientId" }, 400);

    const { data: client } = await admin
      .from("clients").select("id,user_id,first_name,last_name,email,portal_token")
      .eq("id", clientId).maybeSingle();
    if (!client || client.user_id !== userId) return json({ error: "not found" }, 404);
    const toEmail = String(client.email || "").trim();
    if (!toEmail) return json({ error: "no client email" }, 400);

    // הטוקן מונפק כאן אם חסר, בדיוק כמו ב-send-step-email — כך הקישור שנשלח
    // הוא אותו קישור קבוע, ולא קישור נוסף שהלקוח יצטרך לבחור ביניהם.
    let portalToken = String(client.portal_token || "").trim();
    if (!portalToken) {
      portalToken = crypto.randomUUID().replace(/-/g, "");
      const { error: tokErr } = await admin.from("clients")
        .update({ portal_token: portalToken }).eq("id", client.id);
      if (tokErr) return json({ error: "token_save_failed" }, 500);
    }
    const portalUrl = `${APP_URL}/?portal=${portalToken}`;

    // ── מה ממתין ללקוח — מהדף עצמו ────────────────────────────────────────
    const { data: portal } = await admin.rpc("get_client_portal", { p_token: portalToken });
    const items: PortalItem[] = Array.isArray((portal as { items?: PortalItem[] })?.items)
      ? (portal as { items: PortalItem[] }).items
      : [];
    const actions = items.filter(i => i.bucket === "action");
    if (actions.length === 0) {
      return json({
        error: "no_open_requests",
        detail: { message: "אין כרגע בקשות שממתינות ללקוח - אין על מה להודיע." },
      }, 400);
    }
    const requestList = actions
      .map(i => "· " + String(i.label || "").trim() + (i.sub ? ` - ${String(i.sub).trim()}` : ""))
      .join("\n");

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

    const base = defaultTemplate(KIND);
    const saved = (settings?.commTemplates || {})[KIND] || {};
    const merged: StepEmailTemplate = {
      subject: String(overrides?.subject ?? saved.subject ?? base.subject).trim() || base.subject,
      body: String(overrides?.body ?? saved.body ?? base.body),
    };

    const clientFirst = String(client.first_name || "").trim();
    const clientFull = [client.first_name, client.last_name].filter(Boolean).join(" ").trim();
    const rendered = renderTemplate(merged, {
      clientName: clientFull || clientFirst,
      firmName: brand.firmName,
      requestList,
    });

    const html = buildBrandedEmail(brand, {
      heading: "ברוכים הבאים" + (clientFirst ? ", " + clientFirst : ""),
      bodyHtml: esc(rendered.body).replace(/\n/g, "<br />"),
      ctaLabel: "לדף האישי שלך",
      ctaHref: portalUrl,
      ctaArrow: true,
      showLinkFallback: true,
      footerTagline: actions.length === 1 ? "פעולה אחת ממתינה" : `${actions.length} פעולות ממתינות`,
    });

    const from = `${brand.firmName} <${fromAddress}>`;

    if (preview) {
      return json({
        ok: true, preview: true,
        subject: rendered.subject, subjectText: merged.subject, bodyText: merged.body,
        to: toEmail, from, html, openRequests: actions.length,
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
      user_id: userId, client_id: client.id, to_email: toEmail,
      subject: rendered.subject, kind: KIND, html,
    };

    if (!r.ok) {
      await admin.from("email_messages")
        .insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      return json({ error: "resend_failed", detail: body }, 502);
    }

    // שליחה חוזרת היא תזכורת לגיטימית ("שלחתי, הוא לא נכנס") ולכן מקבלת מספר
    // רץ ולא נחסמת — אותו כלל כמו במיילי השלבים.
    const { count } = await admin
      .from("email_messages").select("id", { count: "exact", head: true })
      .eq("client_id", client.id).eq("kind", KIND);
    const idempotencyKey = `client:${client.id}:${KIND}:${(count ?? 0) + 1}`;

    const { error: logErr } = await admin.from("email_messages")
      .insert({ ...logBase, resend_id: body.id, status: "sent", idempotency_key: idempotencyKey });
    if (logErr && logErr.code === "23505") return json({ ok: true, alreadySent: true });

    let logged = !logErr;
    if (logErr) {
      const { error: minErr } = await admin.from("email_messages").insert({
        user_id: userId, client_id: client.id, to_email: toEmail,
        subject: rendered.subject, kind: KIND, status: "sent", resend_id: body.id,
        error: `log_failed: ${logErr.code ?? ""} ${String(logErr.message ?? "").slice(0, 200)}`,
      });
      logged = !minErr;
      console.error("[send-process-open-email] email_messages insert failed",
        logErr.code, logErr.message, minErr ? `retry failed: ${minErr.code}` : "retry ok");
    }

    const { data: eng } = await admin.from("engagements")
      .select("id").eq("client_id", client.id).limit(1).maybeSingle();
    await admin.from("onboarding_events").insert({
      user_id: userId,
      engagement_id: eng?.id ?? null,
      type: "email_sent",
      actor: "accountant",
      note: `הדף האישי נשלח ללקוח: ${rendered.subject}`
        + (logged ? "" : " (לא נרשם ביומן הדואר - ראה לוג השרת)"),
      meta: { kind: KIND, to: toEmail, resend_id: body.id, openRequests: actions.length, logged },
    });

    return json({ ok: true, id: body.id, logged });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
