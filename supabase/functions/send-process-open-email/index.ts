// Edge Function: send-process-open-email
// המייל ללקוח על הדף האישי — «מה חדש» (new), «תזכורת» (reminder), או הקישור
// לדף כשאין חדש (update). שם הפונקציה נשאר לתאימות (הדפדפן ויומן הדואר).
//
// ‼ 214 — מה השתנה:
//   · השרת תופס את ההודעה לפני השליחה (claim_client_notice): לחיצה כפולה, שתי
//     לשוניות, אירוע חוזר — מייל אחד. בלי תפיסה לא שולחים כלום.
//   · «חדש» מפרט רק את מה שחדש ללקוח, ורק אחרי תשובת הצלחה מהספק הבקשות
//     מסומנות «נמסרו» — כל אחת בגרסה שנכללה במייל. מה שממתין מקודם מופיע
//     בבלוק נפרד, בלי סימון.
//   · תזכורת היא הודעה נפרדת, על מה שכבר נמסר ועדיין פתוח. לא מסמנת «חדש».
//   · גוף הבקשה לספק מוקפא לפני השליחה, ונשלח עם Idempotency-Key. תשובה
//     שאי אפשר לדעת ממנה אם המייל יצא (רשת, 5xx, 409) ⇒ «לא ידוע»: הבקשות לא
//     משתחררות לבד, וניסיון חוזר שולח את אותו גוף באותו מפתח.
//
// ‼ רשימת הפריטים נלקחת מאותו מקור שמזין את המגש (_client_notice_items), והשמות
// והשורה המשנית — מהדף האישי עצמו (build_client_portal, בלי לגעת בחותמת
// השימוש בקישור). מייל שמפרט רשימה משלו היה מבטיח ללקוח דבר אחד ומראה לו אחר.
//
// אבטחה: verify_jwt=false בשער. שני מסלולים:
//   (א) JWT של הרו"ח — הלקוח שלו בלבד.
//   (ב) כותרת x-client-notice-secret (מהדופק בשרת) — רק עם noticeId שכבר בתור.
// הנמען נקבע בשרת מהכרטיס בלבד.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, emailFont, esc } from "../_shared/designSystem.ts";
import {
  firstPageEmailKind, noticeWording, renderTemplate, templateUses, withIntroLine, type StepEmailTemplate,
} from "../_shared/stepTemplates.ts";
import { classifyResendResponse, testTransportAllowed, resendEmailsUrl } from "../_shared/resendResult.ts";
import { completeWithOneRetry, previewGuard, previewGuardText } from "../_shared/noticeOutcome.ts";

// ‼ ספק הדואר — Resend בייצור; ב-staging אפשר ספק מדומה שקולט (resendEmailsUrl).
const RESEND_EMAILS = resendEmailsUrl(Deno.env.get("RESEND_API_URL"), Deno.env.get("SUPABASE_URL") ?? "");

const PROD_REF = "uoweoqtuiettozagwgdw";

type NoticeKind = "new" | "reminder" | "update";
type EmailEvent = "process_open" | "documents_sent" | "status_update" | "portal_reminder";

interface PortalRes { key?: string; label?: string; done?: boolean }
interface PortalItem {
  bucket?: string; key?: string; label?: string; sub?: string; kind?: string;
  resources?: PortalRes[];
}
interface NoticeItem { stepId: string; stepType: string; title?: string; isDocument?: boolean; portalKey?: string }

/**
 * מסמך שהמשרד שלח — אותו כלל שהדף האישי מפעיל. ‼ «צילום תעודה לרשות המסים»
 * (208) נושא resources של הלקוח, אבל הוא פעולה שממתינה — לא מסמך שנשלח.
 */
const isSentDoc = (i: PortalItem) =>
  Array.isArray(i.resources) && i.resources.length > 0 && i.kind !== "identity_confirm";

/**
 * הבלוק «תהליך הקליטה שלך» במייל המסמכים: מה בטיפולנו. ‼ «כרגע אין צורך בפעולה
 * מצידך» רק כשאין בדף שום דבר שממתין ללקוח — אחרת המייל סותר את עצמו, ליד
 * «ועוד דברים שממתינים לכם בדף». '' — אין מה להראות.
 * ‼ טהורה ובלי תלויות: הבדיקה (src/features/flows/__tests__) שולפת אותה מהקובץ ומריצה.
 */
function onboardingStatusText(officeLines: string[], pendingActions: number): string {
  const lines = officeLines.map(s => s.trim()).filter(Boolean);
  if (pendingActions > 0) return lines.join("\n");
  return lines.length ? [...lines, "כרגע אין צורך בפעולה מצידכם."].join("\n") : "";
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
    const input = await req.json().catch(() => ({}));
    const { preview, overrides, idempotencyKey, expectedFingerprint, retry } = input as Record<string, any>;
    let clientId: string | undefined = input.clientId;
    let noticeId: string | undefined = input.noticeId;
    let kind: NoticeKind = (["new", "reminder", "update"].includes(input.kind) ? input.kind : "new") as NoticeKind;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── מי מבקש ─────────────────────────────────────────────────────────────
    let userId: string | null = null;
    let origin: "manual" | "auto" = "manual";
    const internalSecret = req.headers.get("x-client-notice-secret");
    if (internalSecret) {
      const { data: okSecret } = await admin.rpc("verify_client_notice_secret", { p: internalSecret });
      if (okSecret !== true) return json({ error: "unauthorized" }, 401);
      if (!noticeId) return json({ error: "missing noticeId" }, 400);
      const { data: n } = await admin.from("client_notices")
        .select("id,user_id,client_id,kind,origin,status").eq("id", noticeId).maybeSingle();
      if (!n) return json({ error: "notice_not_found" }, 404);
      userId = n.user_id; clientId = n.client_id; kind = n.kind; origin = "auto";
    } else {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await admin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      if (!userId) return json({ error: "unauthorized" }, 401);
      const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: authorized } = await asUser.rpc("is_authorized");
      if (authorized !== true) return json({ error: "forbidden" }, 403);
    }
    if (!clientId) return json({ error: "missing clientId" }, 400);

    const { data: client } = await admin
      .from("clients").select("id,user_id,first_name,last_name,email,portal_token,lifecycle_stage")
      .eq("id", clientId).maybeSingle();
    if (!client || client.user_id !== userId) return json({ error: "not found" }, 404);

    const testTransport = testTransportAllowed(Deno.env.get("EMAIL_TRANSPORT"),
      req.headers.get("x-pivo-test-transport"), SUPABASE_URL, PROD_REF);

    /** שליחה לספק עם המפתח, ותרגום התשובה (sent / failed / unknown). */
    const deliver = async (bodyText: string, providerKey: string) => {
      if (testTransport) {
        return { outcome: "sent" as const, id: "log-" + crypto.randomUUID(), transport: "log" };
      }
      let status: number | null = null;
      let resBody: unknown = null;
      let thrown: unknown = undefined;
      try {
        const r = await fetch(RESEND_EMAILS, {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json",
                     "Idempotency-Key": providerKey },
          body: bodyText,
        });
        status = r.status;
        resBody = await r.json().catch(() => ({}));
      } catch (e) {
        thrown = e;
      }
      return { ...classifyResendResponse(status, resBody, thrown), transport: "resend" };
    };

    /** אחרי תשובת הספק: השלמה (רק עם האסימון של התפיסה) או כשל. */
    const finish = async (nid: string, claimToken: string, eventKind: EmailEvent,
      res: Awaited<ReturnType<typeof deliver>>, isRetry = false) => {
      if (res.outcome === "sent") {
        // ‼ ניסיון רישום שני באותו אסימון (אידמפוטנטי) — ראה completeWithOneRetry.
        const done = await completeWithOneRetry(() => admin.rpc("complete_client_notice", {
          p_notice_id: nid, p_claim_token: claimToken, p_resend_id: res.id,
          p_transport: res.transport, p_event_kind: eventKind,
        }));
        if (!done.logged) {
          // ‼ המייל יצא — כשל רישום אינו כשל שליחה, אבל המסך חייב לדעת.
          console.error("[send-process-open-email] complete failed twice",
            done.last.error?.message ?? JSON.stringify(done.last.data));
          return json({ ok: true, id: res.id, noticeId: nid, logged: false, transport: res.transport });
        }
        return json({ ok: true, id: res.id, noticeId: nid, logged: true, transport: res.transport });
      }
      // ‼ ניסיון חוזר על «לא ידוע»: דחייה של הניסיון הזה לא אומרת כלום על הראשון,
      // ולכן ההודעה נשארת «לא ידוע». רק «לא נשלח» של הרו"ח משחרר את הבקשות.
      const definite = res.outcome === "failed" && !isRetry;
      await admin.rpc("fail_client_notice", {
        p_notice_id: nid, p_claim_token: claimToken, p_error: res.reason, p_definite: definite,
      });
      return json({
        error: definite ? "resend_failed" : "unknown_outcome",
        noticeId: nid, detail: { message: res.reason },
      }, 502);
    };

    // ── «שלח שוב» על הודעה שלא ידוע אם יצאה — אותו גוף, אותו מפתח ─────────
    if (retry && noticeId && origin === "manual") {
      const { data: rc, error: rcErr } = await admin.rpc("reclaim_unknown_client_notice",
        { p_user_id: userId, p_notice_id: noticeId });
      if (rcErr) return json({ error: "server_not_updated", detail: { message: rcErr.message } }, 503);
      const r = rc as any;
      if (r?.alreadySent) return json({ ok: true, alreadySent: true, noticeId });
      if (!r?.ok) {
        // ‼ in_flight עם noticeId = «המייל הזה עצמו בתנועה» (המסך: «נשלח מחלון אחר»).
        // reclaim מחזיר in_flight גם כשמייל **אחר** ללקוח בתנועה — אז בלי noticeId,
        // והמסך אומר שהמייל הזה לא נשלח.
        let same = true;
        if (r?.error === "in_flight") {
          const { data: cur } = await admin.from("client_notices").select("status").eq("id", noticeId).maybeSingle();
          same = cur?.status === "claimed" || cur?.status === "sending";
        }
        return json({ error: r?.error ?? "retry_refused", ...(same ? { noticeId } : {}) }, 409);
      }
      const res = await deliver(String(r.requestText ?? JSON.stringify(r.requestBody)), r.providerKey);
      const ev: EmailEvent = (r.eventKind as EmailEvent)
        ?? (r.kind === "reminder" ? "portal_reminder" : r.kind === "update" ? "status_update" : "process_open");
      return await finish(noticeId, r.claimToken, ev, res, true);
    }

    // ── הדף האישי: שמות ושורות משנה, ומה עוד ממתין ─────────────────────────
    let portalToken = String(client.portal_token || "").trim();
    if (!portalToken && !preview) {
      portalToken = crypto.randomUUID().replace(/-/g, "");
      const { error: tokErr } = await admin.from("clients")
        .update({ portal_token: portalToken }).eq("id", client.id);
      if (tokErr) return json({ error: "token_save_failed" }, 500);
    }
    const portalUrl = `${APP_URL}/?portal=${portalToken || "…"}`;
    const { data: portal } = await admin.rpc("build_client_portal", { p_client_id: client.id, p_mode: "live" });
    const portalItems: PortalItem[] = Array.isArray((portal as { items?: PortalItem[] })?.items)
      ? (portal as { items: PortalItem[] }).items : [];
    const byKey = new Map(portalItems.filter(i => i.key).map(i => [String(i.key), i]));
    const actions = portalItems.filter(i => i.bucket === "action" && !isSentDoc(i));
    const officeItems = portalItems.filter(i => i.bucket === "office" && i.kind !== "message");

    // ── תפיסה (או תצוגה מקדימה, שאינה כותבת) ──────────────────────────────
    let items: NoticeItem[] = [];
    let claim: any = null;
    let isFirst = false;
    // ‼ קליטה פתוחה — רק אז «ברוכים הבאים» (firstPageEmailKind). מסד שעוד לא מחזיר את השדה ⇒
    // כמו קודם (המייל הראשון בנוסח הקליטה).
    let openIntake = false;
    let previewFingerprint: string | undefined;
    if (preview) {
      const { data: pv, error: pvErr } = await admin.rpc("client_notice_preview", { p_client_id: client.id, p_kind: kind });
      if (pvErr) return json({ error: "server_not_updated", detail: { message: pvErr.message } }, 503);
      items = ((pv as any)?.items ?? []) as NoticeItem[];
      // ‼ אותו כלל כמו התפיסה: בלי פריטים אין מייל — לא מציגים מייל עם רשימה ריקה.
      const empty = previewGuard(kind, items);
      if (empty) return json({ ok: false, error: empty, detail: { message: previewGuardText(kind) } }, 400);
      isFirst = !!(pv as any)?.isFirst;
      openIntake = typeof (pv as any)?.openIntake === "boolean" ? (pv as any).openIntake : isFirst;
      previewFingerprint = (pv as any)?.fingerprint;
    } else {
      const { data: c, error: cErr } = await admin.rpc("claim_client_notice", {
        p_user_id: userId, p_client_id: client.id, p_kind: kind,
        p_idempotency_key: idempotencyKey ?? null, p_expected_fingerprint: expectedFingerprint ?? null,
        p_origin: origin, p_notice_id: origin === "auto" ? noticeId : null,
      });
      // ‼ בלי תפיסה בשרת לא שולחים — גם לא «כמו פעם».
      if (cErr) return json({ error: "server_not_updated", detail: { message: cErr.message } }, 503);
      claim = c;
      if (claim?.alreadySent) return json({ ok: true, alreadySent: true, noticeId: claim.noticeId });
      if (!claim?.ok) {
        const err = String(claim?.error ?? "claim_failed");
        const status = err === "nothing_to_announce" || err === "no_email" ? 400 : 409;
        return json({ error: err === "no_email" ? "no client email" : err, noticeId: claim?.noticeId,
                      items: claim?.items, fingerprint: claim?.fingerprint }, origin === "auto" ? 200 : status);
      }
      items = (claim.items ?? []) as NoticeItem[];
      isFirst = !!claim.isFirst;
      openIntake = typeof claim.openIntake === "boolean" ? claim.openIntake : isFirst;
    }

    // ── מה נכתב במייל ───────────────────────────────────────────────────────
    const line = (title: string, sub?: string) => "· " + title.trim() + (sub ? ` - ${String(sub).trim()}` : "");
    const itemLine = (it: NoticeItem) => {
      const p = it.portalKey ? byKey.get(it.portalKey) : undefined;
      return line(String(p?.label || it.title || ""), p?.sub);
    };
    const listedKeys = new Set(items.map(i => i.portalKey).filter(Boolean) as string[]);
    const otherActions = actions.filter(a => !a.key || !listedKeys.has(String(a.key)));

    let event: EmailEvent;
    let requestList = "";
    let documentList = "";
    let documentsCount = 0;
    let docLines: string[] = [];
    if (kind === "reminder") {
      // ‼ רק מה שנתפס לתזכורת הזו — מגבלת הפעמים, «רק בדף» ועצירה נשמרות.
      event = "portal_reminder";
      requestList = items.map(itemLine).join("\n");
    } else if (kind === "update") {
      event = "status_update";
      // ‼ 214: «הקישור לדף» לא ממציא «אין מה לעשות» כשיש — ולא שולח ריק.
      if (actions.length === 0 && officeItems.length === 0) {
        return json({ error: "nothing_to_say", detail: { message: "אין בקשות שממתינות ללקוח ואין עבודה בטיפולנו - אין על מה להודיע." } }, 400);
      }
      // יש מה שממתין ⇒ נוסח status_update_actions, והרשימה בגוף המייל.
      requestList = actions.map(a => line(String(a.label || ""), a.sub)).join("\n");
    } else {
      const docs = items.filter(i => i.isDocument);
      const reqs = items.filter(i => !i.isDocument);
      event = reqs.length === 0 && docs.length > 0 ? "documents_sent" : "process_open";
      requestList = reqs.map(itemLine).join("\n");
      // ספירה לפי קבצים שעוד לא נפתחו (כמו קודם), לא לפי בקשות.
      for (const d of docs) {
        const res = d.portalKey ? (byKey.get(d.portalKey)?.resources ?? []) : [];
        const open = res.filter(r => !r.done).map(r => String(r.label || "").trim()).filter(Boolean);
        docLines.push(...(open.length ? open : [String(d.title || "")]));
      }
      documentList = docLines.map(n => "· " + n).join("\n");
      documentsCount = docLines.length;
    }
    const statusList = officeItems.map(i => line(String(i.label || ""), i.sub)).join("\n");
    const stillOnboarding = String(client.lifecycle_stage || "") !== "active";

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

    // ‼ איזה נוסח שמור חל, הכותרת, שורת הפתיחה והכפתור — noticeWording (stepTemplates), אותה
    // פונקציה ש«איך ייראה» במסך קורא. «ברוכים הבאים» רק בקליטה פתוחה; לקוח ותיק שזה מייל הדף
    // הראשון שלו — נוסח ההמשך ושורה שמציגה את הדף (firstPageEmailKind).
    const statusWithActions = event === "status_update" && actions.length > 0;
    const clientFirst = String(client.first_name || "").trim();
    const clientFull = [client.first_name, client.last_name].filter(Boolean).join(" ").trim();
    const wording = noticeWording({
      event, first: firstPageEmailKind(isFirst, openIntake), clientFirst, documentsCount, hasActions: statusWithActions,
    });
    const base = wording.base;
    const saved = (settings?.commTemplates || {})[wording.templateKey] || {};
    const merged: StepEmailTemplate = {
      subject: String(overrides?.subject ?? saved.subject ?? base.subject).trim() || base.subject,
      body: String(overrides?.body ?? saved.body ?? base.body),
    };

    const filled = renderTemplate(merged, {
      clientName: clientFull || clientFirst,
      firmName: brand.firmName,
      requestList, statusList, documentList, documentsPhrase: wording.documentsPhrase,
      welcomeLine: wording.welcomeLine,
    });
    // לקוח ותיק, מייל הדף הראשון — שורה שמציגה את הדף, גם בנוסח של המשרד (withIntroLine).
    const rendered = { ...filled, body: withIntroLine(filled.body, merged.body, wording) };

    const heading = wording.heading;

    // ‼ «חדש»: מה שממתין מקודם — בבלוק נפרד מתחת לנוסח, כדי שהלקוח לא יחשוב
    // שהוא נשכח, ובלי להציג אותו כחדש. הבלוק נבנה בשרת ואינו בתבנית שנערכת.
    const block = (title: string, text: string) =>
      `<tr><td dir="rtl" align="right" style="text-align:right;padding:18px 40px 4px;">`
      + `<div style="border-top:1px solid ${brand.border};padding-top:14px;">`
      + `<div style="font-family:${emailFont(brand)};font-size:12.5px;font-weight:700;color:${brand.muted};letter-spacing:.02em;">${esc(title)}</div>`
      + `<div style="font-family:${emailFont(brand)};font-size:13.5px;color:${brand.muted};line-height:1.7;padding-top:5px;">`
      + esc(text).replace(/\n/g, "<br />") + `</div></div></td></tr>`;
    let afterCta = "";
    // מסמכים חדשים במייל שיש בו גם בקשות — התבנית של «בקשות» לא מפרטת אותם.
    if (event === "process_open" && docLines.length > 0) {
      afterCta += block(docLines.length === 1 ? "ושלחנו לכם מסמך חדש" : `ושלחנו לכם ${docLines.length} מסמכים חדשים`,
        docLines.map(n => "· " + n).join("\n"));
    }
    // «הקישור לדף» כשיש מה שממתין מפרט אותו ב-{{requestList}}. נוסח שהמשרד כתב
    // בלי השדה — מקבל את הרשימה בבלוק, כדי שלא תיעלם מהמייל.
    if (statusWithActions && !templateUses(merged.body, "requestList")) {
      afterCta += block("ממתין לכם בדף", requestList);
    }
    if (statusWithActions && officeItems.length > 0 && !templateUses(merged.body, "statusList")) {
      afterCta += block("ומה בטיפולנו", statusList);
    }
    if ((event === "process_open" || event === "documents_sent") && otherActions.length > 0) {
      afterCta += block("ועוד דברים שממתינים לכם בדף", otherActions.map(a => line(String(a.label || ""), a.sub)).join("\n"));
    }
    if (event === "documents_sent" && stillOnboarding && officeItems.length > 0) {
      // ‼ «אין צורך בפעולה» רק כשאין בדף שום דבר שממתין ללקוח (onboardingStatusText).
      const text = onboardingStatusText(officeItems.map(i => String(i.sub || i.label || "")), actions.length);
      if (text) afterCta += block("תהליך הקליטה שלכם", text);
    }

    const waiting = kind === "new" ? items.filter(i => !i.isDocument).length + otherActions.length
      : kind === "reminder" ? items.length : actions.length;
    const html = buildBrandedEmail(brand, {
      heading,
      bodyHtml: esc(rendered.body).replace(/\n/g, "<br />"),
      afterCtaHtml: afterCta,
      ctaLabel: wording.ctaLabel,
      ctaHref: portalUrl,
      ctaArrow: true,
      showLinkFallback: true,
      footerTagline: event === "process_open" || event === "portal_reminder" || event === "status_update"
        ? (waiting === 1 ? "פעולה אחת ממתינה" : waiting > 1 ? `${waiting} פעולות ממתינות` : undefined)
        : undefined,
    });

    const toEmail = String(client.email || "").trim();
    const from = `${brand.firmName} <${fromAddress}>`;

    if (preview) {
      return json({
        ok: true, preview: true, kind,
        // ‼ subjectText/bodyText — הנוסח עם השדות ({{requestList}}…), לא הטקסט הממולא: חלון השליחה
        // מציג אותם כשמות בעברית ([רשימת הבקשות]) ומחזיר קוד (templateToLabels/FromLabels), כך
        // שהרשימות נבנות בשרת ברגע השליחה — גם אחרי items_changed — ולא נשלחת רשימה ישנה מהטיוטה.
        subject: rendered.subject, subjectText: merged.subject, bodyText: merged.body,
        to: toEmail, from, html, event,
        items: items.map(i => ({ stepId: i.stepId, title: i.title })),
        // ‼ הדפדפן מחזיר אותו בשליחה: אם בינתיים נוסף/ירד משהו — items_changed.
        fingerprint: previewFingerprint,
        openRequests: items.filter(i => !i.isDocument).length, newDocuments: documentsCount,
        otherWaiting: otherActions.length,
      });
    }

    // ── הקפאה ושליחה ────────────────────────────────────────────────────────
    const resendPayload: Record<string, unknown> = { from, to: [String(claim.toEmail || toEmail)], subject: rendered.subject, html };
    if (replyTo) resendPayload.reply_to = replyTo;
    // ‼ המחרוזת המדויקת נשמרת ונשלחת — ניסיון חוזר שולח אותה תו בתו (jsonb מסדר מפתחות מחדש).
    const bodyText = JSON.stringify(resendPayload);
    const { data: marked, error: markErr } = await admin.rpc("mark_client_notice_sending", {
      p_notice_id: claim.noticeId, p_claim_token: claim.claimToken,
      p_subject: rendered.subject, p_request_body: resendPayload, p_request_text: bodyText, p_event_kind: event,
      // ‼ איזה נוסח יצא — complete_client_notice כותב אותו ליומן (meta.templateKey) לעמוד «מיילים».
      p_template_key: wording.templateKey,
    });
    if (markErr || (marked as any)?.ok === false) {
      // ‼ איבדנו את התפיסה (חכירה שפקעה ונלקחה) — לא שולחים.
      return json({ error: "lost_claim", noticeId: claim.noticeId }, 409);
    }
    const res = await deliver(bodyText, String((marked as any)?.providerKey || claim.providerKey));
    return await finish(claim.noticeId, claim.claimToken, event, res);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
