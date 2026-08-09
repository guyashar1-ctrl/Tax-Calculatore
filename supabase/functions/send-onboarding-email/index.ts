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

// sign_with_ni אינו נשלח מבחוץ — הוא נגזר מ-sign כשקיימת אסמכתת ביטוח לאומי.
type Stage = "onboard" | "sign" | "active" | "intake" | "ni_approve" | "sign_with_ni";

// אישור ייפוי כוח בביטוח לאומי נעשה מול הביטוח הלאומי עצמו, לא אצלנו — ולכן
// הקישור חיצוני והמייל מפרט את שתי הדרכים שהב"ל מאפשר.
// הקישור מוביל ישירות למסך האישור. מדף הבית של הב"ל הלקוח צריך לחפש את
// השירות בעצמו, וזו הנקודה שבה הוא נוטש.
const NI_SITE = "https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx";
const NI_SITE_LABEL = "מסך אישור ייפוי כוח למייצג";
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
  // כשיש גם ייצוג בב"ל, שתי הפעולות נשלחות במייל אחד. שני מיילים נפרדים באותו
  // רגע גורמים ללקוח לטפל באחד ולהתעלם מהשני, והייצוג נתקע על חצי.
  sign_with_ni: {
    subject: "שתי פעולות אחרונות — חתימה ואישור בביטוח הלאומי",
    heading: "כמעט סיימנו",
    body: "כדי שנוכל לייצג אתכם בפועל, נשארו שתי פעולות קצרות. שתיהן יחד לוקחות כשתי דקות.",
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
    const { requestId: rawRequestId, stage: rawStage, signerId, clientId, email, quotationToken, preview, force,
            internalSecret, quotationId: rawQuotationId } = await req.json();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── מסלול (ב): אישור הצעת מחיר. הטוקן הציבורי מזהה הצעה מאושרת אחת ──
    let userId: string | null = null;
    let requestId: string | undefined = rawRequestId;
    let stage: Stage = (rawStage === "sign" || rawStage === "active" || rawStage === "intake" || rawStage === "ni_approve") ? rawStage : "onboard";
    let quotationId: string | null = null;
    // ההצעה שעליה נתבעת השליחה. במסלול הציבורי היא הטוקן עצמו, ובמסלול ה-JWT
    // היא נמצאת דרך בקשת הייצוג — כדי ששני המסלולים יתחרו על אותה תביעה.
    let claimQuotationId: string | null = null;
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
      const { data: userData } = await admin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      if (!userId) return json({ error: "unauthorized" }, 401);
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
      if (!reqRow.client_email) return json({ error: "no client email" }, 400);
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
        body: "ההצעה אושרה ונחתמה — תודה! נשאר רק לאמת כמה פרטי זיהוי כדי שנוכל להתחיל לייצג אתכם מול רשויות המס. פחות מדקה, מאובטח. הדף האישי שלכם מרכז את כל התהליך, ואפשר לחזור אליו בכל שלב.",
      };
    }

    if (stage === "ni_approve") {
      if (!niData.referenceNumber) return json({ error: "missing_reference_number" }, 400);
      ctaHref = NI_SITE;
      ctaLabel = copy.cta;
      extraHtml = niBlock(niData);
    } else if (stage === "sign" && !niData.referenceNumber) {
      // ‼ שער: אם התבקש ייצוג בב"ל אך אין אסמכתא, מייל החתימה ייצא בלי חלק
      // הב"ל — והלקוח יקבל אחריו מייל שני. עדיף להיכשל מאשר לפצל את התהליך.
      const { data: cli } = await admin
        .from("clients").select("authority_representations")
        .eq("id", reqRow.linked_client_id).maybeSingle();
      if (cli?.authority_representations?.nationalInsurance) {
        return json({
          error: "ni_reference_missing",
          detail: { message: "התבקש ייצוג בביטוח לאומי — יש להזין את מספר האסמכתא לפני השליחה, כדי שהלקוח יקבל מייל אחד." },
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
            נדרשות ממכם 2 פעולות — שתיהן חובה
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
      footerTagline: stage === "ni_approve" ? "אישור מול הביטוח הלאומי · כדקה" : "מאובטח · פחות מדקה",
    });

    // תצוגה מקדימה — אותו HTML בדיוק, רק בלי Resend ובלי רישום ביומן. המסלול
    // הציבורי (טוקן הצעה) לא מקבל אותה: אין סיבה שהלקוח ישלוף ממנה תוכן.
    // ‼ גם המסלול הפנימי אינו מקבל תצוגה מקדימה: הוא נקרא מהמסד כדי לשלוח,
    //   ובקשה שמחזירה HTML במקום לשלוח הייתה משאירה את הלקוח בלי מייל.
    if (preview && !quotationToken && !internalSecret) {
      return json({ ok: true, preview: true, subject: copy.subject, to: toEmail, from: `${brand.firmName} <${fromAddress}>`, html });
    }

    // ── תביעת השליחה ─────────────────────────────────────────────────────────
    // ‼ מייל קישור הייצוג יוצא משני מקומות שאינם יודעים זה על זה: הדפדפן של
    // הלקוח מיד אחרי אישור ההצעה, ורשת הביטחון בכניסת הרו"ח. הסימון "נשלח"
    // נעשה כאן, בעדכון אחד ולפני הקריאה ל-Resend: שורה אחת שהתעדכנה = אנחנו
    // ששולחים, אפס שורות = מישהו הקדים אותנו והמייל כבר בדרך.
    // שליחה יזומה (force) עוקפת את התביעה — הרו"ח ביקש במפורש לשלוח שוב.
    let claimed = false;
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
    // שליחה יזומה מקבלת מספר רץ, כי היא אמורה להיות שורה נוספת ולא כפילות.
    let idempotencyKey: string | undefined;
    if (stage === "onboard" && logRequestId) {
      if (force) {
        const { count } = await admin
          .from("email_messages")
          .select("id", { count: "exact", head: true })
          .eq("request_id", logRequestId)
          .eq("kind", "onboard");
        idempotencyKey = `onboard:${logRequestId}:r${(count ?? 0) + 1}`;
      } else {
        idempotencyKey = `onboard:${logRequestId}`;
      }
    }

    const payload: Record<string, unknown> = { from: `${brand.firmName} <${fromAddress}>`, to: [toEmail], subject: copy.subject, html };
    if (replyTo) payload.reply_to = replyTo;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await r.json();

    // ה-HTML נשמר יחד עם הרשומה: מפתח ה-API של Resend מוגבל לשליחה, ולכן אין
    // דרך לשלוף בדיעבד מה הלקוח קיבל אם לא נשמור עותק כאן.
    const logBase = { user_id: userId, client_id: logClientId, request_id: logRequestId, to_email: toEmail, subject: copy.subject, kind: stage, html };
    if (!r.ok) {
      // ‼ שורת הכישלון נרשמת בלי המפתח הייחודי: אחרת הניסיון החוזר המוצלח היה
      // מתנגש בה, נחשב ל"כבר נשלח" — והמייל לא היה יוצא לעולם.
      await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      // כשל בשליחה נרשם על ההצעה — אחרת הרו"ח מגלה אותו מהלקוח. התביעה
      // משוחררת, כי רק כישלון אמיתי ראוי לניסיון חוזר.
      if (claimQuotationId) {
        await admin.from("quotations")
          .update({
            ...(claimed ? { representation_sent_at: null } : {}),
            representation_error: JSON.stringify(body).slice(0, 300),
          })
          .eq("id", claimQuotationId);
      }
      return json({ error: "resend_failed", detail: body }, 502);
    }
    const { error: logErr } = await admin.from("email_messages")
      .insert({ ...logBase, resend_id: body.id, status: "sent", ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
    // התנגשות במפתח = השורה כבר קיימת, כלומר השליחה הזו כבר תועדה. לא שגיאה.
    if (logErr && logErr.code === "23505") return json({ ok: true, alreadySent: true });

    // ‼ כל כשל רישום אחר: המייל כבר יצא ואי אפשר להחזיר אותו, ולכן זו אינה
    // שגיאת שליחה — אבל מייל בלי שורה ביומן הוא מייל שאיש לא יודע שנשלח.
    // ניסיון שני מצומצם (בלי ה-html, החשוד המרכזי), ואז דיווח מפורש.
    let logged = !logErr;
    if (logErr) {
      const { error: minErr } = await admin.from("email_messages").insert({
        user_id: userId, client_id: logClientId, request_id: logRequestId,
        to_email: toEmail, subject: copy.subject, kind: logBase.kind,
        status: "sent", resend_id: body.id,
        error: `log_failed: ${logErr.code ?? ""} ${String(logErr.message ?? "").slice(0, 200)}`,
      });
      logged = !minErr;
      console.error("[send-onboarding-email] email_messages insert failed",
        logErr.code, logErr.message, minErr ? `retry failed: ${minErr.code}` : "retry ok");
    }

    if (claimQuotationId && !claimed) {
      await admin.from("quotations")
        .update({ representation_sent_at: new Date().toISOString(), representation_error: null })
        .eq("id", claimQuotationId);
    }
    return json({ ok: true, id: body.id, logged });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
