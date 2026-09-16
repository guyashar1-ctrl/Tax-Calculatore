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
//
// preview:true — בונה בדיוק את אותו מייל ומחזיר אותו בלי לשלוח ובלי לתעד. כך
// מה שרואים לפני השליחה הוא המייל עצמו ולא שחזור שלו בצד הדפדפן, שהיה נפרד
// מהקוד הזה ומתיישן בלי שאיש ישים לב.
//
// שני מסלולי הרשאה:
//   (א) JWT של הרו"ח — כל שליחה יזומה מתוך המערכת.
//   (ב) quotationToken — הלקוח בעצמו אישר הצעת מחיר, ואין אף אחד מחובר. הטוקן
//       הציבורי של ההצעה הוא ההרשאה: הוא מזהה הצעה אחת שכבר במצב approved,
//       וממנה נגזרים הרו"ח והבקשה. בלי המסלול הזה הלקוח היה מחכה לקישור עד
//       שהרו"ח ייכנס למערכת — וזו כל הנקודה של האוטומציה.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, emailButton, esc } from "../_shared/designSystem.ts";
// 186: נוסח ברירת המחדל של מיילי הייצוג עבר ל-_shared/repTemplates.ts — אותו
// טקסט בדיוק, רק שגם מסך "ניהול המשרד → ייצוג" קורא ממנו. resolveRepMailTemplate
// ממזג override של המשרד (profile.settings.representation.templates) מעליו.
import { RepMailKind, resolveRepMailTemplate } from "../_shared/repTemplates.ts";

// sign_with_ni אינו נשלח מבחוץ — הוא נגזר מ-sign כשקיימת אסמכתת ביטוח לאומי.
type Stage = "onboard" | "sign" | "active" | "intake" | "ni_approve" | "sign_with_ni" | "prerequisites";

// 165: תוויות השדות — זהות למרשם requirements_for_step ב-SQL. רק לתצוגה במייל.
const PREREQ_FIELD_LABELS: Record<string, string> = {
  spouseFirstName: "שם פרטי", spouseLastName: "שם משפחה",
  spouseIdNumber: "תעודת זהות", spouseBirthYear: "שנת לידה",
  firstName: "שם פרטי", lastName: "שם משפחה", idNumber: "תעודת זהות", birthDate: "תאריך לידה",
};

// אישור ייפוי כוח בביטוח לאומי נעשה מול הביטוח הלאומי עצמו, לא אצלנו — ולכן
// הקישור חיצוני והמייל מפרט את שתי הדרכים שהב"ל מאפשר.
// הקישור מוביל ישירות למסך האישור. מדף הבית של הב"ל הלקוח צריך לחפש את
// השירות בעצמו, וזו הנקודה שבה הוא נוטש.
const NI_SITE = "https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx";
const NI_SITE_LABEL = "מסך אישור ייפוי כוח למייצג";
const NI_PHONE = "02-5393740";

// 186: onboard/sign/ni_approve/prerequisites/active נטענים כעת מ-_shared/repTemplates.ts
// (אותו טקסט, רק שגם מסך ההגדרות קורא ממנו) ומעורבבים בהמשך עם override של
// המשרד. intake ו-sign_with_ni אינם חלק ממסך "ניהול המשרד → ייצוג" ונשארים כאן.
// ‼ sign_with_ni בכוונה **לא** כאן: זו הודעה משולבת עם נוסח ייחודי משלה
// ("שתי פעולות אחרונות") שאינו נגזר מ-rep_sign — מיזוג override של rep_sign
// לתוכה היה מוחק את ניסוח השילוב. היא נשארת system-fixed, כפי שהייתה.
const REP_STAGE_TEMPLATE_KEY: Partial<Record<Stage, RepMailKind>> = {
  onboard: "rep_onboard", sign: "rep_sign",
  ni_approve: "rep_ni_approve", prerequisites: "rep_prerequisites", active: "rep_active",
};

const COPY: Record<Stage, { subject: string; heading: string; body: string; cta: string }> = {
  intake: {
    subject: "שאלון קצר - כדי שהתיק שלכם יישאר מעודכן",
    heading: "נשמח לעדכון קצר",
    body: "כדי שנוכל להמשיך לטפל בענייני המס שלכם בצורה מדויקת, נשמח שתענו על שאלון קצר. השאלון מתאים את עצמו אליכם - עונים רק על מה שרלוונטי, ואפשר לסמן \"לא בטוח\" בכל שאלה.",
    cta: "למילוי השאלון",
  },
  onboard: resolveRepMailTemplate("rep_onboard"),
  sign: resolveRepMailTemplate("rep_sign"),
  // כשיש גם ייצוג בב"ל, שתי הפעולות נשלחות במייל אחד. שני מיילים נפרדים באותו
  // רגע גורמים ללקוח לטפל באחד ולהתעלם מהשני, והייצוג נתקע על חצי. הטקסט הזה
  // ייחודי לשילוב הזה ואינו ניתן להתאמה בנפרד — עורכים את "מייל החתימה" (rep_sign).
  sign_with_ni: {
    subject: "שתי פעולות אחרונות - חתימה ואישור בביטוח הלאומי",
    heading: "כמעט סיימנו",
    body: "כדי שנוכל לייצג אתכם בפועל, נשארו שתי פעולות קצרות. שתיהן יחד לוקחות כשתי דקות.",
    cta: "לחתימה על הטופס",
  },
  active: resolveRepMailTemplate("rep_active"),
  ni_approve: resolveRepMailTemplate("rep_ni_approve"),
  // 165: קישור מוגבל-שדות להשלמת פרטים — לפני שאפשר בכלל להזין ברשות.
  prerequisites: resolveRepMailTemplate("rep_prerequisites"),
};

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  // ‼ 170: מוצהרים מחוץ ל-try כדי שגם חריגה לא צפויה תשחרר את התביעה.
  let claimQuotationId: string | null = null;
  let claimed = false;
  let adminForRelease: ReturnType<typeof createClient> | null = null;
  try {
    const { requestId: rawRequestId, stage: rawStage, signerId, clientId, email, quotationToken, preview, force: rawForce,
            internalSecret, quotationId: rawQuotationId, niRole: rawNiRole, stepId,
            recipientRole: rawRecipientRole } = await req.json();
    // ‼ (N1) force — "שלח שוב למרות שכבר נשלח" — הוא פקודה של הרו"ח. במסלול
    // הציבורי (טוקן הצעה, בלי אף אחד מחובר) הוא היה מכובד גם כן, וכל מי
    // שמחזיק קישור להצעה יכול היה להציף את תיבת הלקוח במיילים בלולאה.
    // מכובד רק במסלולים המזוהים (JWT של הרו"ח / סוד פנימי / מפתח השרת).
    const force = rawForce === true && !quotationToken;
    // ‼ 157: הוראות אישור ב"ל עצמאיות — נכתב מודע לכך שהנמען נפתר כאן,
    // בשרת, מהכרטיס — לעולם לא מהגוף. niRole קובע רק *איזה* מסלול/כתובת;
    // אינו הכתובת עצמה.
    const niRole: "client" | "spouse" | undefined =
      (rawNiRole === "client" || rawNiRole === "spouse") ? rawNiRole : undefined;
    // ‼ (recipient≠subject) niRole נשאר "מי הנושא" — קובע איזה שלב/מסלול. הנמען
    // עשוי להיות אדם אחר (בעל הכרטיס ממלא במקום בן/בת הזוג) — recipientRole
    // הוא ורק הוא שקובע כתובת/שם לברכה. תקף רק ל-stage='prerequisites'; אצל
    // ni_approve הנמען הוא תמיד הנושא עצמו, בלי שינוי מהתנהגות היום.
    const recipientRole: "client" | "spouse" | undefined =
      (rawRecipientRole === "client" || rawRecipientRole === "spouse") ? rawRecipientRole : undefined;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    adminForRelease = admin;

    // ── מסלול (ב): אישור הצעת מחיר. הטוקן הציבורי מזהה הצעה מאושרת אחת ──
    let userId: string | null = null;
    let requestId: string | undefined = rawRequestId;
    let stage: Stage = (rawStage === "sign" || rawStage === "active" || rawStage === "intake"
      || rawStage === "ni_approve" || rawStage === "prerequisites") ? rawStage : "onboard";
    let quotationId: string | null = null;
    // ההצעה שעליה נתבעת השליחה. במסלול הציבורי היא הטוקן עצמו, ובמסלול ה-JWT
    // היא נמצאת דרך בקשת הייצוג — כדי ששני המסלולים יתחרו על אותה תביעה.
    // ── מסלול (ג): המסד עצמו, מיד עם אישור ההצעה ────────────────────────────
    // ‼ ההבדל ממסלול (ב) אינו טכני אלא מהותי: כאן אין דפדפן בכלל. הבקשה
    // נשלחת מתוך `approve_quotation` דרך pg_net, אחרי שהטרנזקציה נסגרה, ולכן
    // המייל יוצא גם אם הלקוח סגר את הכרטיסייה מיד ואפילו אם הרו"ח לא נכנס
    // למערכת שבוע. ההרשאה היא סוד פנימי מה-Vault — לא טוקן של לקוח, כדי
    // שמזהה ציבורי לא יישב בתור של pg_net.
    if (internalSecret) {
      const { data: okSecret } = await admin.rpc("verify_internal_send_secret", { p: String(internalSecret) });
      if (okSecret !== true) return json({ error: "bad_internal_secret" }, 403);
      if (!rawQuotationId) return json({ error: "missing quotationId" }, 400);
      const { data: quote } = await admin
        .from("quotations")
        .select("id,user_id,status,representation_request_id")
        .eq("id", String(rawQuotationId))
        .maybeSingle();
      if (!quote || quote.status !== "approved") return json({ error: "quotation_not_approved" }, 403);
      if (!quote.representation_request_id) return json({ error: "no_representation" }, 400);
      userId = quote.user_id;
      requestId = quote.representation_request_id;
      quotationId = quote.id;
      claimQuotationId = quote.id;
      stage = "onboard";   // המסלול הזה שולח את קישור הייצוג ולא שום דבר אחר
    } else if (quotationToken) {
      const { data: quote } = await admin
        .from("quotations")
        .select("id,user_id,status,representation_request_id")
        .eq("public_token", String(quotationToken))
        .maybeSingle();
      if (!quote || quote.status !== "approved") return json({ error: "quotation_not_approved" }, 403);
      if (!quote.representation_request_id) return json({ error: "no_representation" }, 400);
      userId = quote.user_id;
      requestId = quote.representation_request_id;
      quotationId = quote.id;
      claimQuotationId = quote.id;
      stage = "onboard";   // המסלול הציבורי שולח את קישור הייצוג ולא שום דבר אחר
    } else {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      // קריאה פנימית שרת-לשרת — signing-session שולח את קישור החתימה לבן/בת
      // הזוג כשהנישום בוחר "לשלוח בנפרד". הצגת מפתח ה-service role היא הוכחת
      // הפנימיות (המפתח לא קיים מחוץ לשרת). מוגבל במפורש למייל חתימה בלבד;
      // בעל המשרד נגזר מהבקשה עצמה כי אין כאן משתמש מחובר.
      if (token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
        if (stage !== "sign" || !requestId) return json({ error: "internal_calls_send_sign_only" }, 403);
        const { data: owner } = await admin.from("representation_requests").select("user_id").eq("id", requestId).single();
        userId = owner?.user_id ?? null;
        if (!userId) return json({ error: "not found" }, 404);
      } else {
      const { data: userData } = await admin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      if (!userId) return json({ error: "unauthorized" }, 401);
      }
      if (stage === "onboard" && requestId) {
        const { data: linked } = await admin
          .from("quotations")
          .select("id,representation_sent_at")
          .eq("representation_request_id", requestId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        // ללקוח קיים אפשר שיהיו כמה הצעות על אותה בקשת ייצוג. התביעה נעשית על
        // הראשונה שטרם נשלחה — אם כולן נשלחו, אין מה לשלוח שוב.
        const target = (linked ?? []).find((q) => !q.representation_sent_at) ?? (linked ?? [])[0];
        claimQuotationId = target?.id ?? null;
      }
    }
    if (stage === "intake" ? !clientId : !requestId) return json({ error: "missing requestId" }, 400);

    let link = "";
    let toEmail = "";
    let clientFirst = "";
    let logClientId: string | null = null;
    let logRequestId: string | null = null;
    let reqRow: any = null;
    if (stage === "intake") {
      const { data: clientRow } = await admin.from("clients").select("id,user_id,first_name,last_name,email,intake_token").eq("id", clientId).single();
      if (!clientRow || clientRow.user_id !== userId) return json({ error: "not found" }, 404);
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
      if (!reqRow || reqRow.user_id !== userId) return json({ error: "not found" }, 404);
      // ‼ 157/165: כשה-ni_approve/prerequisites האלה הם פר-אדם, הנמען נגזר
      // מהכרטיס (למטה) ולא מ-reqRow.client_email — אין לדרוש אותו כאן.
      const skipClientEmailCheck = (stage === "ni_approve" || stage === "prerequisites") && !!niRole;
      if (!skipClientEmailCheck && !reqRow.client_email) return json({ error: "no client email" }, 400);
      logClientId = reqRow.linked_client_id;
      logRequestId = reqRow.id;
    }

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
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
    // ‼ בב"ל לכל מבוטח תיק ואסמכתא נפרדים. כשגם בן/בת הזוג מיוצג, המייל של כל
    //   אחד חייב לשאת את האסמכתא שלו — אסמכתא של השני פשוט לא תאשר לו כלום.
    let niKey: "nationalInsurance" | "nationalInsuranceSpouse" = "nationalInsurance";
    if (stage === "sign" && signerId) {
      const signers: any[] = Array.isArray(reqRow.signers) ? reqRow.signers : [];
      const signer = signers.find((s) => s?.id === signerId);
      if (!signer?.email || !signer?.signToken) return json({ error: "signer not found" }, 400);
      link = `${APP_URL}/?sign=${signer.signToken}`;
      toEmail = signer.email;
      clientFirst = String(signer.name || "").trim().split(/\s+/)[0] || clientFirst;
      if (signer.role === "spouse") niKey = "nationalInsuranceSpouse";
    }

    // ‼ 157: הוראות אישור ב"ל עצמאיות — הבקשה כבר קיימת (execution.nationalInsurance[Spouse]
    // כבר מאותחל דרך request_authority_representation), ואין כאן מייל חתימה שיישא
    // אותן. הנמען נפתר כאן, בשרת, מהכרטיס — spouse_email/email — לעולם לא מהגוף.
    // ‼ "נשלח" נחתם רק כאן, אחרי 200 מ-Resend — לא מהדפדפן, כי אין כאן מסך
    // ביניים ששומר execution בעצמו (כמו ש-handleSendAll עושה למייל החתימה).
    let stampStandaloneAfterSend = false;
    let logStepId: string | null = null;
    // 165: הקישור הפעיל של השלב — נדרש רק ל-stage='prerequisites' (הכתובת
    // של הטופס), נשלף בשרת, לעולם לא מהגוף.
    let activeLink: { id: string; token: string; field_keys: string[] } | null = null;
    // ‼ (recipient≠subject) שם מלא של הנושא — לבלוק ההבהרה במייל כשהנמען אינו
    // הנושא עצמו ("הפרטים המבוקשים הם של X" למרות שהמייל מגיע ל-Y).
    let subjectFullName = "";
    if ((stage === "ni_approve" || stage === "prerequisites") && niRole) {
      niKey = niRole === "spouse" ? "nationalInsuranceSpouse" : "nationalInsurance";
      // recipientRole תקף רק לשלב prerequisites (165) — ni_approve תמיד פונה
      // לנושא עצמו, בדיוק כמו לפני התוספת הזו.
      const effectiveRecipientRole: "client" | "spouse" =
        (stage === "prerequisites" && recipientRole) ? recipientRole : niRole;
      const { data: ownerClient } = await admin.from("clients")
        .select("id,user_id,email,first_name,last_name,spouse_email,spouse_first_name,spouse_last_name,spouse_name")
        .eq("id", reqRow.linked_client_id).maybeSingle();
      if (!ownerClient || ownerClient.user_id !== userId) return json({ error: "not found" }, 404);
      const recipientEmail = effectiveRecipientRole === "spouse"
        ? String(ownerClient.spouse_email || "").trim()
        : String(ownerClient.email || "").trim();
      if (!recipientEmail) return json({ error: "no_recipient_email" }, 400);
      toEmail = recipientEmail;
      clientFirst = effectiveRecipientRole === "spouse"
        ? (String(ownerClient.spouse_first_name || "").trim()
           || String(ownerClient.spouse_name || "").trim().split(/\s+/)[0] || "")
        : (String(ownerClient.first_name || "").trim() || clientFirst);
      subjectFullName = niRole === "spouse"
        ? (`${String(ownerClient.spouse_first_name || "").trim()} ${String(ownerClient.spouse_last_name || "").trim()}`.trim()
           || String(ownerClient.spouse_name || "").trim() || "בן/בת הזוג")
        : (`${String(ownerClient.first_name || "").trim()} ${String(ownerClient.last_name || "").trim()}`.trim() || clientFirst);
      stampStandaloneAfterSend = stage === "ni_approve";

      // ‼ stepId מאומת נגד הבקשה הזאת ונגד הנושא הזה — כדי שמייל לא ייצא
      // ל-stepId ששייך לאדם/רשות אחרים, גם אם מישהו יזייף אותו בגוף הבקשה.
      if (stepId) {
        const { data: step } = await admin.from("onboarding_steps")
          .select("id,client_id,step_type,payload").eq("id", String(stepId)).maybeSingle();
        if (!step || step.client_id !== reqRow.linked_client_id || step.step_type !== "authority_representation"
            || step.payload?.subjectRole !== niRole || step.payload?.authority !== "national_insurance") {
          return json({ error: "step_mismatch" }, 400);
        }
        logStepId = step.id;
      } else {
        // ‼ בלי stepId מהדפדפן — הקישור לפריט העבודה נפתר כאן, בשרת: המייל
        // שייך לבקשה הפתוחה של אותו אדם באותה רשות (docs/PRODUCT-REQUESTS-
        // WORKFLOW-FOUNDATION — "תקשורת שייכת לפריט העבודה שגרם לה"). נתפס
        // ב-staging 15.09: שליחה מהדיאלוג נרשמה עם step_id ריק.
        const { data: open } = await admin.from("onboarding_steps")
          .select("id")
          .eq("client_id", reqRow.linked_client_id)
          .eq("step_type", "authority_representation")
          .eq("payload->>authority", "national_insurance")
          .eq("payload->>subjectRole", niRole)
          .not("status", "in", '("completed","verified","skipped","cancelled")')
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        logStepId = open?.id ?? null;
      }

      if (stage === "prerequisites") {
        if (!logStepId) return json({ error: "step_not_found" }, 400);
        const { data: link } = await admin.from("request_participant_links")
          .select("id,token,field_keys")
          .eq("step_id", logStepId).is("submitted_at", null).is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!link) return json({ error: "no_active_link" }, 400);
        activeLink = link as { id: string; token: string; field_keys: string[] };
      }
    }

    const f = "Arial, sans-serif";

    /**
     * כרטיס פעולה ממוספר. שתי הפעולות חייבות להיראות שוות במשקל — בגרסה קודמת
     * החתימה קיבלה כפתור גדול והביטוח הלאומי נראה כהערת שוליים, ולקוח שפספס
     * אותה השאיר את הייצוג בב"ל ללא תוקף בלי לדעת.
     */
    const actionCard = (n: number, title: string, lead: string, inner: string, tone: string) => `
      <tr><td dir="rtl" align="right" style="text-align:right;padding:10px 28px 0;">
        <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:2px solid ${tone};border-radius:${brand.radius + 4}px;background:#ffffff;">
          <tr><td dir="rtl" align="right" style="text-align:right;padding:20px 22px 22px;">
            <table dir="rtl" role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:38px;height:38px;background:${tone};border-radius:50%;text-align:center;vertical-align:middle;
                         font-family:${f};font-size:19px;font-weight:700;color:#ffffff;">${n}</td>
              <td style="padding-right:12px;font-family:${f};font-size:21px;font-weight:700;color:${brand.ink};">${esc(title)}</td>
            </tr></table>
            <div style="font-family:${f};text-align:right;font-size:14.5px;color:${brand.muted};line-height:1.75;padding:14px 0 4px;">${lead}</div>
            ${inner}
          </td></tr>
        </table>
      </td></tr>`;

    /** תוכן כרטיס הביטוח הלאומי: האסמכתא בגדול, המועד, ושתי דרכי האישור. */
    const niCardInner = (ni: any): string => {
      const deadlineRow = ni.deadline
        ? `<div style="font-family:${f};text-align:center;font-size:14px;color:#8A4B00;background:#FFF4E0;border-radius:8px;padding:8px 10px;margin-top:12px;">
             ⏳ יש לאשר עד <strong style="color:#7A3E00;">${esc(new Date(ni.deadline).toLocaleDateString("he-IL"))}</strong>
           </div>`
        : "";
      const option = (num: string, title: string, body: string) => `
        <div style="font-family:${f};text-align:right;font-size:15px;font-weight:700;color:${brand.ink};padding:18px 0 5px;">
          <span style="color:${brand.accent};">${num}</span> ${esc(title)}
        </div>
        <div style="font-family:${f};text-align:right;font-size:14px;color:${brand.muted};line-height:1.85;">${body}</div>`;
      return `
        <div style="border:1px solid ${brand.border};border-radius:${brand.radius}px;padding:18px;background:${brand.pageBg};margin-top:6px;">
          <div style="font-family:${f};text-align:center;font-size:13px;color:${brand.muted};">מספר האסמכתא שלכם</div>
          <div dir="ltr" style="font-family:${f};text-align:center;font-size:40px;font-weight:700;letter-spacing:.06em;color:${brand.accent};padding-top:4px;">${esc(String(ni.referenceNumber))}</div>
          ${deadlineRow}
        </div>
        ${option("א.", "באתר הביטוח הלאומי", `נכנסים ל<a href="${esc(NI_SITE)}" style="color:${brand.accent};font-weight:700;">${esc(NI_SITE_LABEL)}</a> ← מקלידים את מספר תעודת הזהות ואת מספר האסמכתא שלמעלה ← מזדהים בכרטיס אשראי על שמכם, או בטלפון/מייל המעודכנים בביטוח הלאומי ← מאשרים במסך. <strong style="color:${brand.ink};">הייצוג נכנס לתוקף מיד.</strong>`)}
        ${option("ב.", "בטלפון", `מתקשרים ל-<strong dir="ltr" style="color:${brand.ink};font-size:16px;">${esc(NI_PHONE)}</strong> (מענה קולי) ומאשרים באמצעות מספר האסמכתא ובאמצעות קוד בן 6 ספרות שהביטוח הלאומי ישלח אליכם בדואר או במייל. מתאים למי שאין לו כרטיס אשראי או מייל מאומת בביטוח הלאומי.`)}`;
    };

    /** הבלוק העצמאי — כשההוראות נשלחות לבדן ולא יחד עם החתימה. */
    const niBlock = (ni: any): string =>
      `<tr><td dir="rtl" align="right" style="text-align:right;padding:6px 40px 0;">${niCardInner(ni)}</td></tr>`;

    const niData = (reqRow?.execution || {})[niKey] || {};
    let extraHtml: string | undefined;
    let ctaHref = link;
    let ctaLabel: string | undefined;
    let copy = COPY[stage];
    // 186: נוסח המשרד (profiles.settings.representation.templates.<key>) דורס
    // רק את השלבים הבסיסיים המנוהלים ב"ניהול המשרד → ייצוג" — לא intake
    // ולא sign_with_ni (system-fixed, ראה REP_STAGE_TEMPLATE_KEY למעלה).
    // ‼ גם לא כש-quotationId עומד לשכתב את copy למטה (וריאציית "נשאר צעד קטן
    // אחד"): בלי ה-!quotationId הזה, cta היה נשאר מהתאמת המשרד בעוד
    // subject/heading/body נדרסים על ידי הנרטיב הקבוע — ערבוב בין שני מקורות
    // באותה הודעה. במקום זה כל השדות שם נשארים system-fixed, עקבי.
    const repTplKey = REP_STAGE_TEMPLATE_KEY[stage];
    if (repTplKey && !quotationId) {
      const repOverride = (profile?.settings as { representation?: { templates?: Record<string, unknown> } } | undefined)
        ?.representation?.templates?.[repTplKey] as { subject?: string; heading?: string; body?: string; cta?: string } | undefined;
      if (repOverride) copy = resolveRepMailTemplate(repTplKey, repOverride);
    }

    // ‼ הקישור האחיד (הכרעת גיא): מייל קישור-הייצוג מוביל לדף האישי של הלקוח,
    // שמציג את הפעולה הנוכחית — וגם את כל השאר. נשארים ישירים בכוונה:
    //
    // חתימות (טוקן אישי לכל חותם — לבן/בת הזוג אין דף), אישור ב"ל (אתר חיצוני
    // עם אסמכתא), ושאלון שנשלח ללקוח ותיק בלי קליטה (אין לו מה לראות בדף).
    //
    // ‼ חריג נוסף (הכרעת גיא, 2026-08-09): בקשת ייצוג שנפתחה לבדה — בלי הצעה
    // ובלי התקשרות — מובילה ישר לטופס. בדף האישי אין במקרה הזה שום דבר מלבד
    // אותה פעולה עצמה, ודף ביניים עם פעולה אחת הוא קליק מיותר. הטוקן עדיין
    // נוצר, כדי שהדף יהיה מוכן ברגע שייפתח תהליך.
    if (stage === "onboard" && logClientId) {
      const { data: pc } = await admin.from("clients")
        .select("portal_token").eq("id", logClientId).maybeSingle();
      let portalToken = String(pc?.portal_token || "").trim();
      if (!portalToken) {
        portalToken = crypto.randomUUID().replace(/-/g, "");
        const { error: portalErr } = await admin.from("clients")
          .update({ portal_token: portalToken }).eq("id", logClientId);
        if (portalErr) portalToken = "";
      }
      const { count: engCount } = await admin.from("engagements")
        .select("id", { count: "exact", head: true }).eq("client_id", logClientId);
      // המסלול של אישור ההצעה שומר על הדף האישי גם לפני שנפתחה התקשרות —
      // הנוסח שלו מפנה אליו במפורש, והלקוח יקבל שם עוד פעולות בהמשך.
      const portalWorthIt = (engCount ?? 0) > 0 || !!quotationId;
      if (portalToken && portalWorthIt) ctaHref = `${APP_URL}/?portal=${portalToken}`;
    }

    // ‼ המייל הזה כבר לא נשלח ברגע החתימה — שם המסך ממשיך מעצמו, והקישור
    // הקבוע כבר בידי הלקוח מהמייל של ההצעה. הוא יוצא רק כתזכורת ללקוח שחתם
    // ונעצר באמצע, ולכן הטון הוא "נשאר צעד קטן" ולא "תודה על האישור" — הלקוח
    // אישר אתמול, ומייל שמודה לו עכשיו נשמע כאילו לא שמנו לב.
    if (quotationId) {
      copy = {
        ...copy,
        subject: "נשאר צעד קטן אחד",
        heading: "הכול מחכה לך בדף האישי",
        body: "ההצעה אושרה ונחתמה - תודה! נשאר רק לאמת כמה פרטי זיהוי כדי שנוכל להתחיל לייצג אתכם מול רשויות המס. הדף האישי שלכם מרכז את כל התהליך, ואפשר לחזור אליו בכל שלב.",
      };
    }

    if (stage === "ni_approve") {
      if (!niData.referenceNumber) return json({ error: "missing_reference_number" }, 400);
      ctaHref = NI_SITE;
      ctaLabel = copy.cta;
      extraHtml = niBlock(niData);
    } else if (stage === "prerequisites") {
      // 165: הקישור המוגבל-שדות שנוצר ברגע ש"מלא פרטים עכשיו"/"שלח ל-X" נלחץ —
      // לא מייל-קישור-כללי, אלא טופס יחיד עם רק מה שבאמת חסר.
      // ‼ (recipient≠subject) הנמען עשוי להיות בעל הכרטיס וממלא במקום בן/בת
      // הזוג — הבלוק חייב לומר בפירוש של מי הפרטים, אחרת "מה חסר לנו" נקרא
      // כאילו זה על הנמען עצמו.
      const missingLabels = (activeLink!.field_keys || [])
        .map((k) => PREREQ_FIELD_LABELS[k] || k).join(", ");
      const isOtherSubject = niRole === "spouse"
        ? String(recipientRole ?? niRole) !== "spouse"
        : String(recipientRole ?? niRole) !== "client";
      ctaHref = `${APP_URL}/?participant=${activeLink!.token}`;
      ctaLabel = copy.cta;
      extraHtml = `
        <tr><td dir="rtl" align="right" style="text-align:right;padding:6px 40px 0;">
          <div style="border:1px solid ${brand.border};border-radius:${brand.radius}px;padding:16px;background:${brand.pageBg};">
            ${isOtherSubject ? `<div style="font-family:${f};text-align:right;font-size:14px;color:${brand.ink};padding-bottom:8px;">הפרטים למטה הם של <strong>${esc(subjectFullName)}</strong>.</div>` : ""}
            <div style="font-family:${f};text-align:right;font-size:13px;color:${brand.muted};">מה חסר לנו</div>
            <div style="font-family:${f};text-align:right;font-size:16px;font-weight:700;color:${brand.ink};padding-top:4px;">${esc(missingLabels)}</div>
          </div>
        </td></tr>`;
    } else if (stage === "sign" && !niData.referenceNumber) {
      // ‼ שער: אם התבקש ייצוג בב"ל אך אין אסמכתא, מייל החתימה ייצא בלי חלק
      // הב"ל — והלקוח יקבל אחריו מייל שני. עדיף להיכשל מאשר לפצל את התהליך.
      const { data: cli } = await admin
        .from("clients").select("authority_representations")
        .eq("id", reqRow.linked_client_id).maybeSingle();
      if (cli?.authority_representations?.nationalInsurance) {
        return json({
          error: "ni_reference_missing",
          detail: { message: "התבקש ייצוג בביטוח לאומי - יש להזין את מספר האסמכתא לפני השליחה, כדי שהלקוח יקבל מייל אחד." },
        }, 400);
      }
      ctaLabel = copy.cta;
    } else if (stage === "sign") {
      // ★ שתי פעולות במייל אחד. הן נבנות ככרטיסים ממוספרים ולא ככפתור אחד עם
      //   נספח, כדי שלא ניתן יהיה לפספס את השנייה. לכן אין כאן CTA סטנדרטי.
      copy = COPY.sign_with_ni;
      const banner = `
        <tr><td dir="rtl" align="right" style="text-align:right;padding:4px 28px 0;">
          <div style="font-family:${f};text-align:center;background:${brand.accent};color:#ffffff;
                      border-radius:${brand.radius}px;padding:12px 16px;font-size:16px;font-weight:700;">
            נדרשות ממכם 2 פעולות - שתיהן חובה
          </div>
        </td></tr>`;
      const signCard = actionCard(
        1,
        "חתימה על ייפוי הכוח",
        "לייצוג מול מס הכנסה. החתימה דיגיטלית ולוקחת פחות מדקה, גם מהטלפון.",
        `<div style="padding-top:10px;">${emailButton(brand, "לחתימה על הטופס", link, true)}</div>
         <div dir="ltr" style="text-align:center;padding-top:8px;font-family:${f};font-size:11.5px;color:${brand.muted};word-break:break-all;">${esc(link)}</div>`,
        brand.accent,
      );
      const niCard = actionCard(
        2,
        "אישור בביטוח הלאומי",
        "הזנו עבורכם את ייפוי הכוח, אבל הביטוח הלאומי דורש שאתם תאשרו אותו בעצמכם. <strong style=\"color:" + brand.ink + ";\">בלי האישור הזה הייצוג בביטוח הלאומי אינו בתוקף.</strong>",
        niCardInner(niData),
        "#C2410C",
      );
      extraHtml = banner + signCard + niCard;
    } else {
      ctaLabel = copy.cta;
    }

    // ★ אותה מעטפת מייל בדיוק של האתר — מהקובץ המשותף
    const html = buildBrandedEmail(brand, {
      heading: copy.heading + (clientFirst ? ", " + clientFirst : ""),
      bodyHtml: esc(copy.body),
      extraHtml,
      ctaLabel: ctaLabel || undefined,
      ctaHref: ctaLabel ? ctaHref : undefined,
      ctaArrow: true,
      showLinkFallback: !!ctaLabel,
      footerTagline: stage === "ni_approve" ? "אישור מול הביטוח הלאומי · כדקה" : undefined,
    });

    // תצוגה מקדימה — אותו HTML בדיוק, רק בלי Resend ובלי רישום ביומן. המסלול
    // הציבורי (טוקן הצעה) לא מקבל אותה: אין סיבה שהלקוח ישלוף ממנה תוכן.
    // ‼ גם המסלול הפנימי אינו מקבל תצוגה מקדימה: הוא נקרא מהמסד כדי לשלוח,
    //   ובקשה שמחזירה HTML במקום לשלוח הייתה משאירה את הלקוח בלי מייל.
    if (preview && !quotationToken && !internalSecret) {
      return json({ ok: true, preview: true, subject: copy.subject, to: toEmail, from: `${brand.firmName} <${fromAddress}>`, html });
    }

    // ‼ 157: שער כפילות להוראות עצמאיות — נבדק מול execution, לא מול היומן:
    // זה בדיוק מה שקובע את מצב הבקשה (sync_authority_representation_steps),
    // ולכן זה גם המקור הנכון ביותר ל"כבר נשלח". force עוקף במפורש.
    if (stampStandaloneAfterSend && !force) {
      const alreadySentAt = (reqRow?.execution || {})[niKey]?.instructionsSentAt;
      if (alreadySentAt) return json({ ok: true, alreadySent: true });
    }

    // ── תביעת השליחה ─────────────────────────────────────────────────────────
    // ‼ מייל קישור הייצוג יוצא משני מקומות שאינם יודעים זה על זה: הדפדפן של
    // הלקוח מיד אחרי אישור ההצעה, ורשת הביטחון בכניסת הרו"ח. הסימון "נשלח"
    // נעשה כאן, בעדכון אחד ולפני הקריאה ל-Resend: שורה אחת שהתעדכנה = אנחנו
    // ששולחים, אפס שורות = מישהו הקדים אותנו והמייל כבר בדרך.
    // שליחה יזומה (force) עוקפת את התביעה — הרו"ח ביקש במפורש לשלוח שוב.
    if (stage === "onboard" && claimQuotationId && !force) {
      const { data: claimRows } = await admin
        .from("quotations")
        .update({ representation_sent_at: new Date().toISOString(), representation_error: null })
        .eq("id", claimQuotationId)
        .is("representation_sent_at", null)
        .select("id");
      if (!claimRows || claimRows.length === 0) return json({ ok: true, alreadySent: true });
      claimed = true;
    }

    // מפתח ייחודי לשורת היומן — שכבת ההגנה השנייה מפני רישום כפול (מיגרציה 29).
    // ‼ 170: שליחה יזומה (force) אינה מקבלת מפתח כלל — היא אמורה להיות שורה
    // נוספת. ה-COUNT+1 שהיה כאן נמנה מחוץ לטרנזקציה ולכן יכול היה להתנגש.
    let idempotencyKey: string | null = null;
    if (!force) {
      if (stage === "onboard" && logRequestId) idempotencyKey = `onboard:${logRequestId}`;
      else if (stampStandaloneAfterSend && logRequestId) idempotencyKey = `ni_approve:${logRequestId}:${niRole}`;
      else if (stage === "prerequisites" && activeLink) {
        // ‼ מפתח לפי הקישור, לא לפי השלב: כל קישור חדש (create_participant_link,
        // מבטל את הקודם) הוא אירוע תקשורת חדש לגיטימי — לא כפילות של הקודם.
        idempotencyKey = `prerequisites:${activeLink.id}`;
      }
    }

    const payload: Record<string, unknown> = { from: `${brand.firmName} <${fromAddress}>`, to: [toEmail], subject: copy.subject, html };
    if (replyTo) payload.reply_to = replyTo;
    // ‼ 170: תביעה שנלקחה לפני השליחה משוחררת בכל כשל — גם כשהרשת נופלת
    // (fetch שזורק), לא רק כש-Resend עונה בשגיאה. אחרת המסך אומר "נשלח" לנצח.
    const releaseClaim = async (why: string) => {
      if (!claimQuotationId) return;
      await admin.from("quotations").update({
        ...(claimed ? { representation_sent_at: null } : {}),
        representation_error: why.slice(0, 300),
      }).eq("id", claimQuotationId);
    };
    let r: Response;
    let body: { id?: string; [k: string]: unknown };
    try {
      r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      body = await r.json().catch(() => ({}));
    } catch (e) {
      await releaseClaim(String(e));
      return json({ error: "resend_unreachable", detail: { message: String(e).slice(0, 300) } }, 502);
    }
    if (!r.ok) {
      // ‼ שורת הכישלון נרשמת בלי המפתח הייחודי: אחרת הניסיון החוזר המוצלח היה
      // מתנגש בה, נחשב ל"כבר נשלח" — והמייל לא היה יוצא לעולם.
      await admin.from("email_messages").insert({
        user_id: userId, client_id: logClientId, request_id: logRequestId, to_email: toEmail,
        subject: copy.subject, kind: stage, html, status: "failed", error: JSON.stringify(body).slice(0, 500),
        ...(logStepId ? { step_id: logStepId } : {}),
        ...(stampStandaloneAfterSend ? { meta: { niRole } } : {}),
      });
      await releaseClaim(JSON.stringify(body));
      return json({ error: "resend_failed", detail: body }, 502);
    }

    // ‼ 170: שורת היומן, החותמת על ההצעה (representation_sent_at) והחותמת
    // על מסלול הייצוג (execution.<track>.instructionsSentAt) נכתבות יחד,
    // בטרנזקציה אחת, ורק אחרי 200 אמיתי מ-Resend. p_quotation_id משתמש
    // ב-coalesce ולכן התביעה שנלקחה לפני השליחה אינה נדרסת; ה-track נכתב רק
    // כש-instructionsSentAt עדיין ריק (שליחה חוזרת לא דורסת את הראשונה).
    const recordArgs = {
      p_user_id: userId, p_kind: stage, p_to_email: toEmail, p_subject: copy.subject,
      p_resend_id: String(body.id), p_html: html as string | null,
      p_client_id: logClientId, p_request_id: logRequestId, p_step_id: logStepId ?? null,
      p_meta: stampStandaloneAfterSend ? { niRole } : null,
      p_idempotency_key: idempotencyKey,
      p_quotation_id: claimQuotationId,
      p_request_track: stampStandaloneAfterSend ? niKey : null,
      p_request_track_patch: stampStandaloneAfterSend
        ? { instructionsSentAt: new Date().toISOString(), instructionsSentWith: "standalone" } : null,
    };
    let { data: rec, error: recErr } = await admin.rpc("record_email_sent", recordArgs);
    // המייל כבר יצא — כשל רישום אינו כשל שליחה, אבל מייל בלי שורה הוא מייל
    // שאיש לא יודע שנשלח. ניסיון שני בלי ה-html, ואז דיווח מפורש.
    if (recErr) {
      console.error("[send-onboarding-email] record_email_sent failed", recErr.code, recErr.message);
      ({ data: rec, error: recErr } = await admin.rpc("record_email_sent", { ...recordArgs, p_html: null }));
      if (recErr) console.error("[send-onboarding-email] record_email_sent retry failed", recErr.code, recErr.message);
    }
    const logged = !recErr;
    if ((rec as { alreadyRecorded?: boolean } | null)?.alreadyRecorded) {
      return json({ ok: true, alreadySent: true });
    }
    // ‼ 157: execution.<track>.instructionsSentAt נכתבת כבר בתוך record_email_sent
    // (170, p_request_track/p_request_track_patch למעלה) — בטרנזקציה אחת עם
    // שורת היומן, ורק אם עדיין ריקה. אין כאן כתיבה שנייה שיכולה להתחרות בה.
    // טריגר sync_authority_representation_steps (157) קורא את השינוי הזה
    // ומזיז את הבקשה ל"ממתינים לאישור" מיד אחריו.

    // 165: "נשלח" נכתב על הקישור עצמו רק אחרי 200 אמיתית, ורק אם עדיין ריק.
    // הסנכרון הבא (נגרם מהקריאה הבאה לשלב, או ידני) קורא את זה ומעדכן את
    // payload.prerequisites.link.sentAt על הכרטיס.
    if (activeLink) {
      await admin.from("request_participant_links")
        .update({ sent_at: new Date().toISOString(), sent_to: toEmail })
        .eq("id", activeLink.id).is("sent_at", null);
      if (logClientId) await admin.rpc("sync_authority_representation_steps", { p_client_id: logClientId });
    }
    return json({ ok: true, id: body.id, logged });
  } catch (e) {
    if (claimed && claimQuotationId && adminForRelease) {
      await adminForRelease.from("quotations")
        .update({ representation_sent_at: null, representation_error: String(e).slice(0, 300) })
        .eq("id", claimQuotationId);
    }
    return json({ error: String(e) }, 500);
  }
});
