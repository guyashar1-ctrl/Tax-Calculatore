// Edge Function: send-release-email
// שולח מכתב שחרור לרו"ח הקודם. הנמען הוא כתובת מפורשת (הרו"ח הקודם), לא הלקוח.
// verify_jwt=false בשער + אימות פנימי; שולח רק בהקשר לקוח של המשתמש.
//
// ‼ (170) הסימון «נשלח» על השלב (releaseSentAt) נכתב **כאן**, יחד עם שורת
// היומן ובאותה טרנזקציה (record_email_sent) — ולא בדפדפן אחרי שגם ה-PDF נוצר
// ונשמר. עד כה כשל ביצירת ה-PDF השאיר את המכתב "טרם נשלח" אף שיצא, ושליחה
// חוזרת שלחה אותו לרו"ח הקודם פעמיים. stepId הוא אופציונלי (עדכון המשך
// לרו"ח הקודם נרשם על השלב בלי לסמן אותו כ"נשלח" — markSent=false).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_SUBJECT_CHARS = 300;
const MAX_HTML_BYTES = 200 * 1024;

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { clientId, to, subject, html, ccClient, stepId, markSent } = await req.json();
    if (!clientId || !to || !subject || !html) return json({ error: "missing clientId/to/subject/html" }, 400);

    // ‼ הנמען כאן חופשי בכוונה (הרו"ח הקודם), ולכן התקרות הן מה שמונע מהפונקציה
    // להפוך למשגר תוכן חופשי לכל כתובת.
    if (String(subject).length > MAX_SUBJECT_CHARS) {
      return json({ error: "subject_too_long", detail: { message: `נושא המייל ארוך מ-${MAX_SUBJECT_CHARS} תווים.` } }, 400);
    }
    if (new TextEncoder().encode(String(html)).length > MAX_HTML_BYTES) {
      return json({ error: "html_too_large", detail: { message: `גוף המייל גדול מ-${MAX_HTML_BYTES / 1024}KB.` } }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: client } = await admin.from("clients").select("id,user_id,email").eq("id", clientId).single();
    if (!client || client.user_id !== user.id) return json({ error: "not found" }, 404);

    // השלב שהמכתב שייך לו — של אותו לקוח, ומסוג מכתב העברה. מזהה זר נדחה
    // לפני השליחה, לא אחריה: אחרת המייל יוצא והסימון נופל.
    let releaseStepId: string | null = null;
    if (stepId) {
      const { data: step } = await admin.from("onboarding_steps")
        .select("id,client_id,step_type").eq("id", String(stepId)).maybeSingle();
      if (!step || step.client_id !== client.id || step.step_type !== "release_letter") {
        return json({ error: "step_not_found" }, 404);
      }
      releaseStepId = step.id;
    }

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    const firmName = (profile?.firm_name || "המשרד").trim();
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;

    // ‼ כתובת העותק נלקחת מהכרטיס בשרת ולא מהבקשה. הנמען הראשי חייב להיות
    // חופשי (הרו"ח הקודם אינו במסד), אבל עותק לכתובת שרירותית היה הופך את
    // הפונקציה למשגר לכל מקום — ולכן הלקוח שולח דגל, לא כתובת.
    const ccAddress = ccClient && client.email && String(client.email).trim()
      ? String(client.email).trim() : null;

    const payload: Record<string, unknown> = { from: `${firmName} <${fromAddress}>`, to: [to], subject, html };
    if (ccAddress) payload.cc = [ccAddress];
    if (replyTo) payload.reply_to = replyTo;

    let r: Response;
    try {
      r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: "resend_unreachable", detail: { message: String(e).slice(0, 300) } }, 502);
    }
    const body = await r.json().catch(() => ({}));

    // עותק הגוף נשמר יחד עם הרשומה, כמו בשאר המיילים. מכתב שחרור הוא המסמך
    // שמעביר את התיק — בלי עותק אין דרך להוכיח בדיעבד מה בדיוק נשלח.
    const meta = { from: `${firmName} <${fromAddress}>`, cc: ccAddress };
    if (!r.ok) {
      await admin.from("email_messages").insert({
        user_id: user.id, client_id: clientId, to_email: to, subject, kind: "release", html, meta,
        status: "failed", error: JSON.stringify(body).slice(0, 500),
      });
      return json({ error: "resend_failed", detail: body }, 502);
    }

    // ── הרישום + הסימון על השלב — כתיבה אחת (170) ─────────────────────────
    // releaseSentAt/releaseSentTo/releaseSubject נכתבים על השלב באותה
    // טרנזקציה עם שורת היומן. הדפדפן משלים אחר כך את המעבר המלא של השלב
    // (wait_client, תאריך יעד, רשימת החומרים) — אבל «נשלח» כבר אמת גם אם
    // הדפדפן ייסגר בדרך.
    const sentAtIso = new Date().toISOString();
    const recordArgs = {
      p_user_id: user.id,
      p_kind: "release",
      p_to_email: to,
      p_subject: subject,
      p_resend_id: String(body.id),
      p_html: html as string | null,
      p_client_id: clientId,
      p_step_id: releaseStepId,
      p_meta: meta,
      p_step_patch: releaseStepId && markSent !== false
        ? { releaseSentAt: sentAtIso, releaseSentTo: to, releaseSubject: subject }
        : null,
      p_event_actor: "accountant",
      p_event_note: releaseStepId
        ? (markSent !== false ? "מכתב העברת הטיפול נשלח לרו״ח הקודם: " : "נשלח עדכון לרו״ח הקודם: ") + subject
        : null,
      p_event_meta: { kind: "release", to, cc: ccAddress },
    };
    let { error: recErr } = await admin.rpc("record_email_sent", recordArgs);
    if (recErr) {
      // המייל כבר יצא — כשל רישום אינו כשל שליחה. ניסיון שני בלי ה-html.
      console.error("[send-release-email] record_email_sent failed", recErr.code, recErr.message);
      ({ error: recErr } = await admin.rpc("record_email_sent", { ...recordArgs, p_html: null }));
      if (recErr) console.error("[send-release-email] record_email_sent retry failed", recErr.code, recErr.message);
    }
    return json({ ok: true, id: body.id, from: `${firmName} <${fromAddress}>`, cc: ccAddress, sentAt: sentAtIso, logged: !recErr });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
