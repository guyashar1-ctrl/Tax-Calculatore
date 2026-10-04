// Edge Function: send-charge-payment-request-email
// שולח דרישת תשלום ללקוח עבור "חיוב נוסף" (מסך הלקוחות V3.3, ראה
// docs/prototypes/customers-v3-production-reference.html).
//
// ‼ אין אינטגרציית סליקה במערכת — הפונקציה הזו רק שולחת מייל ורושמת שהבקשה
// יצאה. היא לעולם לא מסמנת "שולם"; זה דורש מנגנון אישור אמיתי שעדיין לא קיים.
//
// אבטחה: verify_jwt=false בשער; מזוהה מה-JWT של הרו"ח בלבד (כמו notify-accountant
// ו-send-apply-link-email). "תפיסת" החיוב (pending→requested) קורית באמצעות
// UPDATE מותנה בסטטוס הנוכחי (WHERE status='pending'), לפני שליחת המייל —
// כך שני קליקים כפולים/ניסיון חוזר לא יכולים לשלוח שני מיילים: השני מקבל
// 0 שורות ומוחזר לו already_requested בלי לשלוח שוב. אם הספק דחה את המייל בוודאות,
// הסטטוס מוחזר ל-pending כדי לא "לשקר" שהבקשה יצאה. ‼ לא ידוע אם יצא (רשת, 5xx) —
// הסטטוס נשאר requested, כדי שלא תצא דרישה שנייה; היומן מסמן «לא ידוע אם יצא».
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resendEmailsUrl, postResend, unknownOutcomeReply } from "../_shared/resendResult.ts";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";

// ‼ ספק הדואר — Resend בייצור; ב-staging אפשר ספק מדומה שקולט (resendEmailsUrl).
const RESEND_EMAILS = resendEmailsUrl(Deno.env.get("RESEND_API_URL"), Deno.env.get("SUPABASE_URL") ?? "");

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  // ‼ (170) התפיסה (pending→requested) נלקחת לפני השליחה. כל יציאה בלי מייל
  // שיצא — כולל חריגה שנזרקה בדרך — חייבת להחזיר אותה, אחרת החיוב מוצג
  // "נשלח" על מייל שלא יצא ואי אפשר לשלוח אותו שוב.
  let releaseOnThrow: (() => Promise<void>) | null = null;
  try {
    const { chargeId } = await req.json().catch(() => ({}));
    if (typeof chargeId !== "string" || !chargeId.trim()) return json({ error: "missing_charge_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "unauthorized" }, 401);

    // תפיסה אטומית — לפני כל דבר אחר, כדי שלא ייווצר מרוץ בין קריאה כפולה.
    const { data: claimed } = await admin
      .from("additional_charges")
      .update({ status: "requested", requested_at: new Date().toISOString() })
      .eq("id", chargeId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (!claimed) {
      const { data: existing } = await admin
        .from("additional_charges").select("id, status").eq("id", chargeId).eq("user_id", userId).maybeSingle();
      if (!existing) return json({ error: "not_found" }, 404);
      return json({ error: "already_requested" }, 409);
    }
    const releaseClaim = async () => {
      releaseOnThrow = null;
      await admin.from("additional_charges")
        .update({ status: "pending", requested_at: null }).eq("id", chargeId).eq("user_id", userId);
    };
    releaseOnThrow = releaseClaim;

    const { data: client } = await admin
      .from("clients").select("id, first_name, last_name, email, user_id").eq("id", claimed.client_id).maybeSingle();
    const toEmail = String(client?.email || "").trim();
    if (!client || client.user_id !== userId || !toEmail) {
      // מחזירים את הסטטוס — לא שלחנו כלום, אז אסור שהחיוב ייראה "נשלח".
      await releaseClaim();
      return json({ error: client ? "missing_client_email" : "client_not_found" }, 400);
    }

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
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

    const clientName = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "לקוח יקר";
    const amountFmt = "₪" + Number(claimed.amount).toLocaleString("he-IL");
    // dd.mm.yyyy — כמו utils/dateFormat.ts (mode 'form') בצד הלקוח; שום מסך/מייל לא בונה תאריך בעצמו.
    const dueDateFmt = claimed.due_date
      ? (() => { const [y, m, d] = String(claimed.due_date).split("-"); return `${d}.${m}.${y}`; })()
      : null;
    const subject = `דרישת תשלום - ${claimed.description}`;
    const dueLine = dueDateFmt ? ` התשלום נדרש עד ${dueDateFmt}.` : "";
    const html = buildBrandedEmail(brand, {
      heading: "דרישת תשלום",
      bodyHtml: esc(`שלום ${clientName}, בנוסף לטיפול השוטף מבקשים תשלום עבור "${claimed.description}", בסך ${amountFmt}.${dueLine} ניתן ליצור קשר עם המשרד לתיאום התשלום.`),
      footerTagline: "דרישת תשלום - חיוב נוסף",
    });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const payload: Record<string, unknown> = {
      from: `${brand.firmName} <${fromAddress}>`,
      to: [toEmail],
      subject,
      html,
    };
    if (replyTo) payload.reply_to = replyTo;

    const call = await postResend(() => fetch(RESEND_EMAILS, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const body = call.body;

    if (call.result.outcome === "unknown") {
      // ‼ לא ידוע אם דרישת התשלום יצאה (רשת שנפלה, 5xx, 2xx בלי מזהה). התפיסה
      // **נשארת** (requested): החזרה ל-pending הייתה מציעה «שלח דרישת תשלום» שוב — ואם
      // הקודמת הגיעה, הלקוח מקבל שתיים. השורה ביומן אומרת לברר עם הלקוח.
      releaseOnThrow = null;
      const reason = call.result.reason;
      const { error: logErr } = await admin.from("email_messages").insert({
        user_id: userId, client_id: claimed.client_id, to_email: toEmail, subject,
        kind: "charge_payment_request", meta: { chargeId }, html,
        status: "unknown", error: reason.slice(0, 500),
      });
      if (logErr) console.error("[send-charge-payment-request-email] unknown journal insert failed", logErr.code, logErr.message);
      return json({ ...unknownOutcomeReply(reason), requestedAt: claimed.requested_at }, 502);
    }
    if (call.result.outcome === "failed") {
      // השליחה עצמה נכשלה — מחזירים ל-pending כדי לא לשקר שהבקשה יצאה.
      await releaseClaim();
      await admin.from("email_messages").insert({
        user_id: userId, client_id: claimed.client_id, to_email: toEmail, subject,
        kind: "charge_payment_request", meta: { chargeId }, html,
        status: "failed", error: JSON.stringify(body).slice(0, 500),
      });
      return json({ error: "resend_failed", detail: body }, 502);
    }
    // המייל יצא — התפיסה היא עכשיו הסימון הנכון. הרישום דרך נקודת הרישום האחת.
    releaseOnThrow = null;
    const { error: recErr } = await admin.rpc("record_email_sent", {
      p_user_id: userId, p_kind: "charge_payment_request", p_to_email: toEmail, p_subject: subject,
      p_resend_id: String(body.id), p_html: html, p_client_id: claimed.client_id, p_meta: { chargeId },
    });
    if (recErr) console.error("[send-charge-payment-request-email] record_email_sent failed", recErr.code, recErr.message);
    return json({ ok: true, requestedAt: claimed.requested_at, logged: !recErr });
  } catch (e) {
    if (releaseOnThrow) await (releaseOnThrow as () => Promise<void>)();
    return json({ error: String(e) }, 500);
  }
});
