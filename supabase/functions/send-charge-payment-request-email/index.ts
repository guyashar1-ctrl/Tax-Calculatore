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
// 0 שורות ומוחזר לו already_requested בלי לשלוח שוב. אם השליחה עצמה נכשלת,
// הסטטוס מוחזר ל-pending כדי לא "לשקר" שהבקשה יצאה.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";

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

    const { data: client } = await admin
      .from("clients").select("id, first_name, last_name, email, user_id").eq("id", claimed.client_id).maybeSingle();
    const toEmail = String(client?.email || "").trim();
    if (!client || client.user_id !== userId || !toEmail) {
      // מחזירים את הסטטוס — לא שלחנו כלום, אז אסור שהחיוב ייראה "נשלח".
      await admin.from("additional_charges")
        .update({ status: "pending", requested_at: null }).eq("id", chargeId).eq("user_id", userId);
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

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();

    const logBase = {
      user_id: userId, client_id: claimed.client_id, to_email: toEmail, subject,
      kind: "charge_payment_request", meta: { chargeId }, html,
    };
    if (!r.ok) {
      // השליחה עצמה נכשלה — מחזירים ל-pending כדי לא לשקר שהבקשה יצאה.
      await admin.from("additional_charges")
        .update({ status: "pending", requested_at: null }).eq("id", chargeId).eq("user_id", userId);
      await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      return json({ error: "resend_failed", detail: body }, 502);
    }
    await admin.from("email_messages").insert({ ...logBase, resend_id: body.id, status: "sent" });
    return json({ ok: true, requestedAt: claimed.requested_at });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
