// Edge Function: signing-session
// עמוד החתימה הציבורי (ללא התחברות). כל חותם מזוהה בטוקן אישי (signToken).
//   action=get           → פרטי הסשן: שם החותם, אזורי החתימה, קישור חתום ל-PDF, ערכים קיימים.
//   action=submit        → קבלת חתימות החותם, עדכון סטטוס; כשכולם חתמו → awaiting_stamp.
//   action=handoff       → "חותמים יחד": הנישום שכבר חתם מקבל את סשן החתימה של
//                          בן/בת הזוג להמשך באותו מכשיר. זו ההקלה המבוקרת היחידה
//                          בבידוד החותמים — רק מסשן חתימה של הנישום, רק אחרי
//                          שחתם, ורק כל עוד חתימת בן/בת הזוג ממתינה. הדף האישי
//                          (portal) לעולם לא חושף את הטוקן של בן/בת הזוג.
//   action=invite_spouse → "לשלוח בנפרד": הנישום מזין כאן את המייל של בן/בת
//                          הזוג — רק ברגע הזה המייל נאסף — ונשלח קישור אישי.
// אבטחה: verify_jwt=false בשער; הזיהוי הוא הטוקן האקראי (32 hex) עצמו, כמו onboarding.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { action, token, values, email } = await req.json();
    if (!token || typeof token !== "string") return json({ error: "missing token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // איתור הבקשה לפי טוקן החותם (בתוך מערך ה-signers)
    const { data: reqRow, error: findErr } = await admin
      .from("representation_requests")
      .select("*")
      .contains("signers", JSON.stringify([{ signToken: token }]))
      .maybeSingle();
    if (findErr) return json({ error: findErr.message }, 500);
    if (!reqRow) return json({ error: "not_found" }, 404);

    const signers: any[] = Array.isArray(reqRow.signers) ? reqRow.signers : [];
    const me = signers.find((s) => s?.signToken === token);
    if (!me) return json({ error: "not_found" }, 404);

    // ── מסמכי הבקשה ──────────────────────────────────────────────────────────
    // בקשה של משק בית עשויה להוליד כמה טופסי 2279: מע"מ וניכויים מוגשים בנפרד
    // לכל אדם. ‼ אין רשימה ⇒ מסמך יחיד מהשדות הישנים — בקשה שנוצרה לפני
    // המהלך ממשיכה לעבוד בלי מיגרציה. אותו כלל בדיוק כמו ב-repDocuments.ts.
    const setup = reqRow.signature_setup;
    const docList: any[] = Array.isArray(reqRow.signature_documents) && reqRow.signature_documents.length
      ? reqRow.signature_documents
      : (setup?.pdfDocId && Array.isArray(setup?.fields)
          ? [{ key: "incomeTax", title: "ייפוי כוח", pdfDocId: setup.pdfDocId, pdfFileName: setup.pdfFileName, fields: setup.fields }]
          : []);
    if (!docList.length) return json({ error: "no_setup" }, 409);
    const allFields: any[] = docList.flatMap((d) => Array.isArray(d.fields) ? d.fields : []);

    // מצב בן/בת הזוג, לבחירת "יחד או בנפרד" של הנישום. מוצג רק לנישום עצמו.
    const pendingSpouseOf = (list: any[]) =>
      list.find((s) => s?.role === "spouse" && s?.signStatus === "pending" && s?.signToken) || null;
    const spouseInfo = (list: any[]) => {
      const sp = me.role === "client" && reqRow.status === "pending_signature" ? pendingSpouseOf(list) : null;
      return sp
        ? { spousePending: true, spouseName: String(sp.name || ""), spouseHasEmail: !!sp.email }
        : { spousePending: false };
    };

    if (action === "get") {
      // קישור חתום לכל מסמך (שעה). ‼ כשמסמך אחד חסר במאגר — כל החתימה נעצרת,
      // כי חתימה על חלק מהטפסים משאירה בקשה שאי אפשר להגיש.
      const withUrls: any[] = [];
      for (const d of docList) {
        const { data: doc } = await admin
          .from("documents")
          .select("storage_path, file_name")
          .eq("id", d.pdfDocId)
          .eq("user_id", reqRow.user_id)
          .maybeSingle();
        if (!doc?.storage_path) return json({ error: "pdf_missing" }, 404);
        const { data: su, error: urlErr } = await admin.storage
          .from("client-documents")
          .createSignedUrl(doc.storage_path, 3600);
        if (urlErr || !su?.signedUrl) return json({ error: "url_failed" }, 500);
        withUrls.push({
          key: d.key, title: d.title || "ייפוי כוח",
          fields: Array.isArray(d.fields) ? d.fields : [],
          pdfUrl: su.signedUrl,
          pdfFileName: d.pdfFileName || doc.file_name,
        });
      }
      const signed = { signedUrl: withUrls[0].pdfUrl };

      const { data: profile } = await admin.from("profiles").select("firm_name, branding").eq("id", reqRow.user_id).maybeSingle();

      // ‼ חיווי "נפתח" לא מגיע מ-Resend (מעקב פתיחות אינו פעיל, וגם כשהוא פעיל
      // הוא תלוי בטעינת תמונות). הכניסה לדף החתימה היא ההוכחה החזקה יותר —
      // הלקוח לא רק ראה את המייל, הוא לחץ והגיע. מסמנים אותה כאן.
      if (me.email) {
        const seenAt = new Date().toISOString();
        const mine = (patch: Record<string, unknown>) => admin.from("email_messages")
          .update({ ...patch, updated_at: seenAt })
          .eq("request_id", reqRow.id).eq("kind", "sign").eq("to_email", me.email);
        try {
          await mine({ opened_at: seenAt }).is("opened_at", null);
          await mine({ clicked_at: seenAt }).is("clicked_at", null);
          await mine({ status: "clicked" }).in("status", ["sent", "delivered", "delivery_delayed", "opened"]);
        } catch (_e) {
          // חיווי בלבד — לעולם לא לחסום את החתימה בגללו
        }
      }

      // ‼ תחושת ה"סיימתי" נולדת כאן, לא במייל: הלקוח חותם, המסך מודה לו,
      //   והוא סוגר את החלון — גם כשאישור ייפוי הכוח בב"ל עוד ממתין לו.
      //   לכן מסך הסיום מקבל את האסמכתא שלו. בב"ל לכל מבוטח תיק נפרד, ולכן
      //   בן/בת הזוג מקבל/ת את האסמכתא שלו/ה ולא של הנישום.
      const niKey = me.role === "spouse" ? "nationalInsuranceSpouse" : "nationalInsurance";
      const niRow = (reqRow.execution || {})[niKey] || {};
      const ni = niRow.referenceNumber && !niRow.confirmedAt
        ? { referenceNumber: String(niRow.referenceNumber), deadline: niRow.deadline || null }
        : null;

      return json({
        ok: true,
        ni,
        ...spouseInfo(signers),
        signerId: me.id,
        signerRole: me.role,
        signerName: me.name,
        alreadySigned: me.signStatus === "signed",
        requestStatus: reqRow.status,
        clientName: reqRow.client_name,
        firmName: profile?.firm_name || "",
        branding: profile?.branding || {},
        // ‼ נשמרים גם השדות הישנים (מסמך ראשון) — לשונית שעוד רצה עם קוד
        // ישן ממשיכה לחתום על הטופס הראשון במקום ליפול.
        fields: withUrls[0].fields,
        documents: withUrls,
        signersPublic: signers.map((s) => ({ id: s.id, name: s.name, signStatus: s.signStatus })),
        values: reqRow.signature_values || {},
        pdfUrl: signed.signedUrl,
        pdfFileName: withUrls[0].pdfFileName,
      });
    }

    if (action === "submit") {
      if (reqRow.status !== "pending_signature") return json({ error: "wrong_status" }, 409);
      if (me.signStatus === "signed") return json({ error: "already_signed" }, 409);
      if (!values || typeof values !== "object") return json({ error: "missing values" }, 400);

      // מותר לחותם למלא רק את השדות שלו, **בכל המסמכים**.
      // ‼ זו נקודת הכשל המרכזית של המעבר לריבוי טפסים: signStatus הוא ברמת
      // הבקשה, ולכן אישור על סמך מסמך אחד היה מסמן את החותם כגמור ומקדם את
      // הבקשה ל"ממתין לחותמת" בזמן שנותרו טפסים לא-חתומים.
      const myFields = allFields.filter((f: any) => f.signerId === me.id);
      const cleaned: Record<string, any> = {};
      for (const f of myFields) {
        const v = (values as any)[f.id];
        if (!v) return json({ error: "incomplete", fieldId: f.id }, 400);
        const imageDataUrl = typeof v.imageDataUrl === "string" && v.imageDataUrl.startsWith("data:image/") ? v.imageDataUrl : undefined;
        const text = typeof v.text === "string" ? v.text.slice(0, 300) : undefined;
        if (!imageDataUrl && !text) return json({ error: "incomplete", fieldId: f.id }, 400);
        cleaned[f.id] = { fieldId: f.id, imageDataUrl, text, signedAt: new Date().toISOString() };
      }

      const now = new Date().toISOString();
      const newSigners = signers.map((s) => s.signToken === token ? { ...s, signStatus: "signed", signedAt: now } : s);
      const allSigned = newSigners.every((s) => s.signStatus === "signed");
      const newValues = { ...(reqRow.signature_values || {}), ...cleaned };

      const upd: Record<string, unknown> = {
        signers: newSigners,
        signature_values: newValues,
        updated_at: now,
      };
      if (allSigned) upd.status = "awaiting_stamp";

      const { error: upErr } = await admin.from("representation_requests").update(upd).eq("id", reqRow.id);
      if (upErr) return json({ error: upErr.message }, 500);

      if (allSigned && reqRow.linked_client_id) {
        await admin.from("clients").update({ representation_status: "awaiting_stamp", updated_at: now }).eq("id", reqRow.linked_client_id);
      }
      // לנישום שחתם וממתינים לבן/בת הזוג — מסך הסיום מציג את בחירת "יחד או בנפרד"
      const spAfter = me.role === "client" && !allSigned ? pendingSpouseOf(newSigners) : null;
      return json({
        ok: true, allSigned,
        ...(spAfter ? { spousePending: true, spouseName: String(spAfter.name || ""), spouseHasEmail: !!spAfter.email } : { spousePending: false }),
      });
    }

    // "חותמים יחד" — מסירת סשן החתימה של בן/בת הזוג לאותו מכשיר.
    // השער: רק טוקן של הנישום, רק אחרי שחתם בעצמו, רק כשחתימת בן/בת הזוג ממתינה.
    if (action === "handoff") {
      if (me.role !== "client") return json({ error: "not_allowed" }, 403);
      if (reqRow.status !== "pending_signature") return json({ error: "wrong_status" }, 409);
      if (me.signStatus !== "signed") return json({ error: "sign_first" }, 409);
      const sp = pendingSpouseOf(signers);
      if (!sp) return json({ error: "no_pending_spouse" }, 409);
      return json({ ok: true, spouseToken: sp.signToken, spouseName: String(sp.name || "") });
    }

    // "לשלוח לבן/בת הזוג בנפרד" — הנישום מזין את המייל רק עכשיו, והקישור האישי
    // נשלח דרך אותו מסלול מייל קיים של בקשות חתימה (send-onboarding-email).
    if (action === "invite_spouse") {
      if (me.role !== "client") return json({ error: "not_allowed" }, 403);
      if (reqRow.status !== "pending_signature") return json({ error: "wrong_status" }, 409);
      if (me.signStatus !== "signed") return json({ error: "sign_first" }, 409);
      const sp = pendingSpouseOf(signers);
      if (!sp) return json({ error: "no_pending_spouse" }, 409);
      const cleanEmail = typeof email === "string" ? email.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return json({ error: "bad_email" }, 400);

      const now = new Date().toISOString();
      const newSigners = signers.map((s) =>
        s.signToken === sp.signToken
          ? { ...s, email: cleanEmail, inviteSentAt: now, emailSource: "client" }
          : s);
      const { error: upErr } = await admin.from("representation_requests")
        .update({ signers: newSigners, updated_at: now }).eq("id", reqRow.id);
      if (upErr) return json({ error: upErr.message }, 500);

      const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-onboarding-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ requestId: reqRow.id, stage: "sign", signerId: sp.id }),
      });
      const sendBody = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok || !sendBody?.ok) {
        // המייל נכשל אבל הכתובת כבר נשמרה — הרו"ח יכול לשלוח שוב ממרכז הביצוע.
        return json({ error: "send_failed", detail: sendBody?.detail?.message || sendBody?.error || "" }, 502);
      }
      return json({ ok: true, sentTo: cleanEmail });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
