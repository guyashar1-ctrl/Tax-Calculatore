// Edge Function: send-process-open-email
// המייל ללקוח על מצב התהליך — והנושא שלו נגזר מה**אירוע**, לא ממסגרת קבועה.
//
// ‼ זה המייל היחיד שאינו תלוי בשלב אחד. כל שאר המיילים (הזמנה לפייפרלס,
// שאלון, הרשאה, תזכורת) מדברים על בקשה בודדת ולכן חיים ב-send-step-email.
// כאן הנושא הוא התהליך כולו, ולכן הקלט הוא הלקוח ולא השלב.
//
// ‼ שם הפונקציה נשאר process-open לתאימות (הדפדפן קורא לה בשם הזה, ויומן
// הדואר מלא ברשומות שלה). מה שהשתנה הוא מה שהיא בונה: הכותרת, הנוסח,
// ה-CTA וסוג הרישום נגזרים מהאירוע — מסמכים חדשים, בקשה שממתינה, או עדכון
// סטטוס בלבד.
//
// ‼ רשימת הבקשות שבמייל נלקחת מ-get_client_portal — אותה פונקציה שמייצרת את
// הדף האישי. מייל שמפרט רשימה משלו היה מבטיח ללקוח דבר אחד ומראה לו אחר,
// בדיוק ביום שהרו"ח מוסיף או מסיר בקשה.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי מה-JWT של הרו"ח, כמו
// send-step-email. הנמען נקבע מהכרטיס בלבד — כתובת שמגיעה בגוף הבקשה
// מתעלמים ממנה.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, emailFont, esc } from "../_shared/designSystem.ts";
import { defaultTemplate, renderTemplate, type StepEmailTemplate } from "../_shared/stepTemplates.ts";

/**
 * ‼ המייל נגזר מה**אירוע**, לא ממסגרת אחת לכולם. עד כה כל שליחה יצאה כ-
 * "ברוכים הבאים · מה ממתין לכם", גם בשליחה החמישית וגם כשלא ממתין ללקוח
 * דבר — והפונקציה אפילו סירבה לשלוח כשלא היו בקשות פתוחות. לקוח יכול להיות
 * באמצע קליטה, בלי שום פעולה שנדרשת ממנו, ובאותו רגע לקבל שני מסמכים
 * חדשים; אז המסמכים הם הכותרת, וסטטוס הקליטה הוא הקשר משני.
 */
type EmailEvent = "process_open" | "documents_sent" | "status_update";

interface PortalRes { key?: string; label?: string; done?: boolean }
interface PortalItem {
  bucket?: string; label?: string; sub?: string; kind?: string;
  resources?: PortalRes[];
}

/** מסמך שהמשרד שלח — אותו כלל בדיוק שהדף האישי מפעיל. */
const isSentDoc = (i: PortalItem) => Array.isArray(i.resources) && i.resources.length > 0;

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
      .from("clients").select("id,user_id,first_name,last_name,email,portal_token,lifecycle_stage")
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
    // ── מה האירוע ────────────────────────────────────────────────────────
    // ‼ אותה היררכיה בדיוק כמו בדף האישי: מה שנדרש מהלקוח · מה חדש לו · מה
    // אצלנו. מסמך שנשלח אינו "מה צריך ממך", ולכן הוא יוצא מ-actions.
    const actions = items.filter(i => i.bucket === "action" && !isSentDoc(i));
    const newDocs = items
      .filter(i => isSentDoc(i) && i.bucket !== "future")
      .flatMap(i => (i.resources || []).filter(r => !r.done))
      .map(r => String(r.label || "").trim())
      .filter(Boolean);
    const officeItems = items.filter(i => i.bucket === "office" && i.kind !== "message");
    /**
     * ‼ לקוח שסיים להיקלט אינו "בתהליך קליטה", ואין לו מה לקרוא על כך.
     *
     * ‼ המקור הוא `clients.lifecycle_stage` (lead/quoted/onboarding/active),
     * שמתוחזק בטריגרים — ולא `journeyStage` של הדף. נבדק: journeyStage הוא
     * "כמה מהדף הושלם", ומסמך שטרם נפתח נספר בו — כלומר לקוח פעיל לגמרי
     * חוזר כ-'setup' בדיוק בגלל המסמך שבשבילו נשלח המייל. אות שמושפע
     * מהאירוע שהוא אמור לתאר אינו אות.
     */
    const stillOnboarding = String(client.lifecycle_stage || "") !== "active";

    const event: EmailEvent = actions.length > 0 ? "process_open"
      : newDocs.length > 0 ? "documents_sent"
      : "status_update";

    // ‼ מסרבים לשלוח רק כשבאמת אין על מה להודיע. קודם נחסמה כל שליחה שבה לא
    // ממתינה ללקוח בקשה — כלומר בדיוק המקרה של "שלחנו לך מסמכים ואין ממך
    // שום צורך בפעולה", שהוא המקרה הנפוץ ביותר.
    if (event === "status_update" && officeItems.length === 0) {
      return json({
        error: "nothing_to_say",
        detail: { message: "אין בקשות שממתינות ללקוח, אין מסמכים חדשים ואין עבודה בטיפולנו - אין על מה להודיע." },
      }, 400);
    }

    const line = (i: PortalItem) =>
      "· " + String(i.label || "").trim() + (i.sub ? ` - ${String(i.sub).trim()}` : "");
    const requestList = actions.map(line).join("\n");
    const statusList = officeItems.map(line).join("\n");
    const documentList = newDocs.map(n => "· " + n).join("\n");
    const documentsPhrase = newDocs.length === 1
      ? "מסמך חדש"
      : `${newDocs.length} מסמכים חדשים`;

    // ‼ "ברוכים הבאים" רק כשזו באמת הפעם הראשונה. שליחה חוזרת שפותחת ב"שמחים
    // להתחיל לעבוד יחד" קוראת כמו מייל אוטומטי שלא יודע עם מי הוא מדבר.
    const { count: priorCount } = await admin
      .from("email_messages").select("id", { count: "exact", head: true })
      .eq("client_id", client.id)
      .in("kind", ["process_open", "documents_sent", "status_update"]);
    const isFirst = (priorCount ?? 0) === 0;

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

    const base = defaultTemplate(event);
    const saved = (settings?.commTemplates || {})[event] || {};
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
      statusList,
      documentList,
      documentsPhrase,
      welcomeLine: isFirst ? "שמחים להתחיל לעבוד יחד.\n" : "",
    });

    const heading = event === "documents_sent"
      ? (clientFirst ? `${clientFirst}, שלחנו לך ${documentsPhrase}` : `שלחנו לך ${documentsPhrase}`)
      : event === "status_update"
      ? "עדכון על התהליך" + (clientFirst ? ", " + clientFirst : "")
      : isFirst
      ? "ברוכים הבאים" + (clientFirst ? ", " + clientFirst : "")
      : (clientFirst ? `${clientFirst}, יש דברים שממתינים לך` : "יש דברים שממתינים לך");

    /**
     * ‼ סטטוס הקליטה **מתחת ל-CTA**, לא בגוף המייל. כשהאירוע הוא מסמכים,
     * הקליטה היא הקשר משני — ופסקה מעל הכפתור הייתה דוחפת את הפעולה
     * הראשית מטה ומתחרה בכותרת. הבלוק נבנה בשרת ואינו חלק מהתבנית הניתנת
     * לעריכה, כדי שיישאר נכון לכל לקוח.
     *
     * ‼ שני תנאים, ושניהם נדרשים:
     *   · הלקוח עדיין בקליטה — ללקוח פעיל אין "תהליך קליטה" לדבר עליו.
     *   · יש עבודה אמיתית בטיפולנו — אחרת הבלוק הוא כותרת ומשפט אחד שלא
     *     אומר כלום, ומוסיף רעש למייל שכולו מסירת מסמכים.
     */
    const statusBlock = event === "documents_sent" && stillOnboarding && officeItems.length > 0
      ? `<tr><td dir="rtl" align="right" style="text-align:right;padding:18px 40px 4px;">`
        + `<div style="border-top:1px solid ${brand.border};padding-top:14px;">`
        + `<div style="font-family:${emailFont(brand)};font-size:12.5px;font-weight:700;color:${brand.muted};letter-spacing:.02em;">תהליך הקליטה שלך</div>`
        + `<div style="font-family:${emailFont(brand)};font-size:13.5px;color:${brand.muted};line-height:1.7;padding-top:5px;">`
        + esc(officeItems.map(i => String(i.sub || i.label || "").trim()).filter(Boolean).join("\n"))
            .replace(/\n/g, "<br />")
        + "<br />כרגע אין צורך בפעולה מצידך."
        + `</div></div></td></tr>`
      : "";

    const html = buildBrandedEmail(brand, {
      heading,
      bodyHtml: esc(rendered.body).replace(/\n/g, "<br />"),
      afterCtaHtml: statusBlock,
      // ‼ CTA ספציפי לאירוע. "לדף האישי שלך" על מייל שכולו מסמכים אינו אומר
      // ללקוח מה הוא ימצא שם.
      ctaLabel: event === "documents_sent" ? "לצפייה במסמכים בדף האישי" : "לדף האישי שלך",
      ctaHref: portalUrl,
      ctaArrow: true,
      showLinkFallback: true,
      // ‼ שורת "N פעולות ממתינות" רק כשבאמת ממתינות. על מייל מסמכים היא
      // הייתה הופכת מסירה למטלה.
      footerTagline: event === "process_open"
        ? (actions.length === 1 ? "פעולה אחת ממתינה" : `${actions.length} פעולות ממתינות`)
        : undefined,
    });

    const from = `${brand.firmName} <${fromAddress}>`;

    if (preview) {
      return json({
        ok: true, preview: true,
        subject: rendered.subject, subjectText: merged.subject, bodyText: merged.body,
        to: toEmail, from, html,
        event, openRequests: actions.length, newDocuments: newDocs.length,
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
      subject: rendered.subject, kind: event, html,
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
      .eq("client_id", client.id).eq("kind", event);
    const idempotencyKey = `client:${client.id}:${event}:${(count ?? 0) + 1}`;

    const { error: logErr } = await admin.from("email_messages")
      .insert({ ...logBase, resend_id: body.id, status: "sent", idempotency_key: idempotencyKey });
    if (logErr && logErr.code === "23505") return json({ ok: true, alreadySent: true });

    let logged = !logErr;
    if (logErr) {
      const { error: minErr } = await admin.from("email_messages").insert({
        user_id: userId, client_id: client.id, to_email: toEmail,
        subject: rendered.subject, kind: event, status: "sent", resend_id: body.id,
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
      meta: { kind: event, to: toEmail, resend_id: body.id, openRequests: actions.length, newDocuments: newDocs.length, logged },
    });

    return json({ ok: true, id: body.id, logged });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
