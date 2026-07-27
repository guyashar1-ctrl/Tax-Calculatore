// Edge Function: send-onboarding-email
// שולח מיילים ללקוח בשלבי הייצוג. stage קובע את התוכן:
//   onboard – אימות זהות · sign – חתימה על ייפוי הכוח · active – הייצוג אושר
//   intake – שאלון עדכון יזום מכרטיס הלקוח
//   ni_approve – אישור ייפוי הכוח בביטוח לאומי (אסמכתא + מועד אחרון + שתי הדרכים)
//
// כל העיצוב נגזר ממערכת העיצוב המשותפת (_shared/designSystem.ts) — בדיוק אותו
// קובץ שהאתר צורך. אין כאן טבלת תבניות, אין צבעים קשיחים ואין מעטפת HTML משלנו:
// שינוי תבנית/צבע/פונט בסטודיו מתעדכן כאן אוטומטית.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי מה-JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";

type Stage = "onboard" | "sign" | "active" | "intake" | "ni_approve";

// אישור ייפוי כוח בביטוח לאומי נעשה מול הביטוח הלאומי עצמו, לא אצלנו — ולכן
// הקישור חיצוני והמייל מפרט את שתי הדרכים שהב"ל מאפשר.
const NI_SITE = "https://www.btl.gov.il";
const NI_PHONE = "02-5393740";

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
  ni_approve: {
    subject: "פעולה נדרשת — אישור ייפוי הכוח בביטוח הלאומי",
    heading: "נשאר צעד אחד בביטוח הלאומי",
    body: "הזנו עבורכם את ייפוי הכוח באתר הביטוח הלאומי. הביטוח הלאומי דורש שאתם תאשרו אותו בעצמכם — עד שלא תאשרו, הייצוג בביטוח הלאומי אינו בתוקף. אפשר לאשר באחת משתי הדרכים שלמטה, לוקח כדקה.",
    cta: "לאישור באתר הביטוח הלאומי",
  },
};

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const { requestId, stage: rawStage, signerId, clientId, email } = await req.json();
    const stage: Stage = (rawStage === "sign" || rawStage === "active" || rawStage === "intake" || rawStage === "ni_approve") ? rawStage : "onboard";
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
    // ★ אותו פענוח בדיוק של האתר — מהקובץ המשותף
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

    // ── ביטוח לאומי: האסמכתא, המועד האחרון ושתי דרכי האישור ──
    let extraHtml: string | undefined;
    let ctaHref = link;
    if (stage === "ni_approve") {
      const ni = (reqRow?.execution || {}).nationalInsurance || {};
      if (!ni.referenceNumber) return json({ error: "missing_reference_number" }, 400);
      ctaHref = NI_SITE;
      const f = "Arial, sans-serif";
      const deadlineRow = ni.deadline
        ? `<div style="font-family:${f};font-size:13px;color:${brand.muted};padding-top:6px;">המועד האחרון לאישור: <strong style="color:${brand.ink};">${esc(new Date(ni.deadline).toLocaleDateString("he-IL"))}</strong></div>`
        : "";
      extraHtml = `<tr><td style="padding:6px 40px 0;">
        <div style="border:1px solid ${brand.border};border-radius:${brand.radius}px;padding:16px 18px;background:${brand.pageBg};">
          <div style="font-family:${f};font-size:12px;color:${brand.muted};">מספר האסמכתא שלכם</div>
          <div dir="ltr" style="font-family:${f};font-size:26px;font-weight:700;letter-spacing:.04em;color:${brand.ink};padding-top:2px;text-align:right;">${esc(String(ni.referenceNumber))}</div>
          ${deadlineRow}
        </div>
        <div style="font-family:${f};font-size:14px;font-weight:700;color:${brand.ink};padding:18px 0 6px;">אפשרות 1 — באתר הביטוח הלאומי</div>
        <div style="font-family:${f};font-size:13.5px;color:${brand.muted};line-height:1.8;">
          נכנסים ל-${esc(NI_SITE)} ← בפעולות מקישים "אישור ייפוי כח למייצג" ← מקלידים את מספר תעודת הזהות ואת מספר האסמכתא שלמעלה ← מזדהים בכרטיס אשראי או בסיסמה לטלפון הנייד ← מאשרים במסך. הייצוג נכנס לתוקף מיד.
        </div>
        <div style="font-family:${f};font-size:14px;font-weight:700;color:${brand.ink};padding:18px 0 6px;">אפשרות 2 — בטלפון</div>
        <div style="font-family:${f};font-size:13.5px;color:${brand.muted};line-height:1.8;">
          מתקשרים ל-<strong dir="ltr" style="color:${brand.ink};">${esc(NI_PHONE)}</strong> (מענה קולי) ומאשרים באמצעות מספר האסמכתא ובאמצעות קוד בן 6 ספרות שהביטוח הלאומי ישלח אליכם בדואר או במייל. מתאים למי שאין לו כרטיס אשראי או מייל מאומת בביטוח הלאומי.
        </div>
      </td></tr>`;
    }

    // ★ אותה מעטפת מייל בדיוק של האתר — מהקובץ המשותף
    const html = buildBrandedEmail(brand, {
      heading: copy.heading + (clientFirst ? ", " + clientFirst : ""),
      bodyHtml: esc(copy.body),
      extraHtml,
      ctaLabel: copy.cta || undefined,
      ctaHref: copy.cta ? ctaHref : undefined,
      ctaArrow: true,
      showLinkFallback: !!copy.cta,
      footerTagline: stage === "ni_approve" ? "אישור מול הביטוח הלאומי · כדקה" : "מאובטח · פחות מדקה",
    });

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
