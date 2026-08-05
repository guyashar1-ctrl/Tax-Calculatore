// Edge Function: notify-accountant
// מרוקנת את תור ההתראות של הרו"ח (accountant_notifications) ושולחת מייל על
// כל אירוע שקרה אצל הלקוח או אצל הרו"ח הקודם.
//
// ‼ שער יחיד. כל מייל שיוצא *אל* המשרד עובר כאן, ולכן כאן — ורק כאן — נבדקות
// ההגדרות של גיא (profiles.settings.accountantNotifications). התראה שכבויה
// מסומנת suppressed_at ולא נשלפת שוב; היא נשארת בטבלה כתיעוד שהאירוע קרה.
//
// שני מסלולי הפעלה, שניהם רק *מפעילים* ולא מקבלים מידע:
//   (א) JWT של הרו"ח — רשת הביטחון. בכל כניסה למערכת מרוקנים מה שלא יצא.
//   (ב) token ציבורי (הצעה / השלמת פרטים / חתימה / דף אישי / דף שחרור) —
//       הדפדפן של הלקוח מפעיל שליחה מיד עם האירוע, בלי להתחבר. הטוקן מזהה
//       רו"ח אחד בדיוק, ולכן אי אפשר להפעיל שליחה של מישהו אחר. התשובה היא
//       מונה בלבד.
//
// למה תור ולא שליחה מהטריגר: שליחת מייל מתוך הטריגר הייתה קושרת את החתימה
// של הלקוח לזמינות שרת המייל — תקלה ברסנד הייתה מפילה את הפעולה עצמה.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי בשני המסלולים.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveBrand, buildBrandedEmail, esc } from "../_shared/designSystem.ts";
import { isNotificationEnabled } from "../_shared/accountantNotifications.ts";

const MAX_ATTEMPTS = 3;
const BATCH = 20;

const AUTHORITY_LABELS: Record<string, string> = {
  incomeTax: 'מס הכנסה',
  withholding: 'ניכויים',
  vat: 'מע"מ',
  nationalInsurance: 'ביטוח לאומי',
};

const FAMILY_LABELS: Record<string, string> = {
  single: "רווק/ה", married: "נשוי/אה", divorced: "גרוש/ה",
  widowed: "אלמן/ה", singleParent: "הורה יחיד/ה",
};

function fmtILS(n: number): string {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

/** שורת פרט בגוף המייל — תווית קטנה וערך מודגש */
function row(brand: any, label: string, value: string): string {
  return `<tr>
    <td dir="rtl" align="right" style="text-align:right;padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:${brand.muted};white-space:nowrap;">${esc(label)}</td>
    <td dir="rtl" align="right" style="text-align:right;padding:5px 0 5px 14px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:${brand.ink};">${esc(value)}</td>
  </tr>`;
}

function card(brand: any, rows: string): string {
  return `<tr><td dir="rtl" align="right" style="text-align:right;padding:6px 40px 0;">
    <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid ${brand.border};border-radius:${brand.radius}px;background:${brand.pageBg};">
      <tr><td dir="rtl" align="right" style="text-align:right;padding:14px 16px;">
        <table dir="rtl" role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
    </table>
  </td></tr>`;
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
    const { token } = await req.json().catch(() => ({}));
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── מי הרו"ח שעבורו מרוקנים את התור ──
    let userId: string | null = null;
    if (token) {
      const { data } = await admin.rpc("user_id_for_public_token", { p_token: String(token) });
      userId = (data as string) ?? null;
    } else {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await admin.auth.getUser(jwt);
      userId = userData?.user?.id ?? null;
    }
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: pending } = await admin
      .from("accountant_notifications")
      .select("*")
      .eq("user_id", userId)
      .is("sent_at", null)
      .is("suppressed_at", null)
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (!pending || pending.length === 0) return json({ ok: true, sent: 0 });

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const toEmail = String(profile?.email || "").trim();
    if (!toEmail) return json({ error: "no_accountant_email" }, 400);

    const brand = resolveBrand({
      firmName: profile?.firm_name,
      branding: profile?.branding || {},
      email: profile?.email,
      phone: profile?.phone,
      emailSignature: profile?.communication?.emailSignature,
    });
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";

    let sent = 0;
    let suppressed = 0;
    for (const n of pending) {
      // ── השער: מה שגיא כיבה במסך "המשרד" לא יוצא ────────────────────────────
      // נבדק לפני התפיסה כדי שלא ננפח attempts על משהו שלא ננסה לשלוח.
      if (!isNotificationEnabled(profile?.settings, String(n.kind))) {
        await admin.from("accountant_notifications")
          .update({ suppressed_at: new Date().toISOString() }).eq("id", n.id);
        suppressed++;
        continue;
      }

      // תפיסה אטומית: מעלים attempts לפני השליחה. שתי הפעלות במקביל (הלקוח
      // לוחץ, והרו"ח נכנס באותו רגע) לא ישלחו את אותה התראה פעמיים.
      const { data: claimed } = await admin
        .from("accountant_notifications")
        .update({ attempts: (n.attempts ?? 0) + 1 })
        .eq("id", n.id)
        .eq("attempts", n.attempts ?? 0)
        .is("sent_at", null)
        .select()
        .maybeSingle();
      if (!claimed) continue;

      const built = await buildEmail(admin, brand, APP_URL, n);
      if (!built) {
        await admin.from("accountant_notifications")
          .update({ error: "לא נמצאו הנתונים שההתראה מתייחסת אליהם" }).eq("id", n.id);
        continue;
      }

      const payload: Record<string, unknown> = {
        from: `${brand.firmName} <${fromAddress}>`,
        to: [toEmail],
        subject: built.subject,
        html: built.html,
      };
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();

      const logBase = {
        user_id: userId, client_id: n.client_id, request_id: n.request_id,
        to_email: toEmail, subject: built.subject, kind: `notify_${n.kind}`, html: built.html,
      };
      if (!r.ok) {
        await admin.from("accountant_notifications")
          .update({ error: JSON.stringify(body).slice(0, 300) }).eq("id", n.id);
        await admin.from("email_messages")
          .insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
        continue;
      }
      await admin.from("accountant_notifications")
        .update({ sent_at: new Date().toISOString(), error: null }).eq("id", n.id);
      await admin.from("email_messages").insert({ ...logBase, resend_id: body.id, status: "sent" });
      sent++;
    }

    return json({ ok: true, sent, suppressed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/** בונה נושא וגוף לפי סוג האירוע. הנתונים נשלפים חיים, לא מה-payload הקפוא. */
async function buildEmail(
  admin: ReturnType<typeof createClient>,
  brand: any,
  appUrl: string,
  n: Record<string, any>,
): Promise<{ subject: string; html: string } | null> {
  const kind = String(n.kind);
  const p = n.payload || {};

  if (kind === "quotation_approved") {
    const { data: q } = await admin.from("quotations").select("*").eq("id", n.quotation_id).maybeSingle();
    if (!q) return null;
    const name = String(p.signerName || p.recipientName || q.snapshot?.recipientName || "הלקוח").trim();
    const areas = q.representation?.areas || {};
    const areaLabels = Object.keys(areas).map(k => AUTHORITY_LABELS[k] || k).join(", ");

    // הסכומים נגזרים מהעתק ההצעה כפי שנחתם, לא מהשדות החיים
    const items: any[] = q.snapshot?.items ?? q.items ?? [];
    const vatRate = Number(q.snapshot?.vatRate ?? q.vatRate ?? 18);
    const sum = (cat: string) => items
      .filter(i => i.category === cat)
      .reduce((acc, i) => {
        const gross = Number(i.clientPrice || 0) * Number(i.quantity || 1);
        const net = gross * (1 - Number(i.discountPercent || 0) / 100);
        return acc + net * (i.vatFlag ? 1 + vatRate / 100 : 1);
      }, 0);
    const money = [
      sum("monthly") >= 1 ? `${fmtILS(sum("monthly"))} לחודש` : "",
      sum("annual") >= 1 ? `${fmtILS(sum("annual"))} לשנה` : "",
      sum("one_time") >= 1 ? `${fmtILS(sum("one_time"))} חד־פעמי` : "",
    ].filter(Boolean).join(" · ");

    const rows = [
      row(brand, "לקוח", name),
      row(brand, "הצעה", String(q.quotation_number)),
      money ? row(brand, "סכומים", money + " (כולל מע״מ)") : "",
      areaLabels ? row(brand, "ייצוג", areaLabels) : row(brand, "ייצוג", "לא נכלל בהצעה"),
    ].join("");

    return {
      subject: `✅ ${name} חתם על הצעה ${q.quotation_number}`,
      html: buildBrandedEmail(brand, {
        heading: "ההצעה נחתמה",
        bodyHtml: esc(`${name} אישר וחתם על הצעת המחיר. ההצעה החתומה נשמרה כהסכם התקשרות.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לפתוח את ההצעה",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת ההצעות",
      }),
    };
  }

  if (kind === "onboarding_submitted") {
    const { data: r } = await admin.from("representation_requests").select("*").eq("id", n.request_id).maybeSingle();
    if (!r) return null;
    const ident = r.identification || {};
    const name = String(r.client_name || p.clientName || "הלקוח").trim();
    const areaLabels = (r.authorities || []).map((k: string) => AUTHORITY_LABELS[k] || k).join(", ");
    const rows = [
      row(brand, "לקוח", name),
      ident.idNumber ? row(brand, "ת.ז.", String(ident.idNumber)) : "",
      ident.familyStatus ? row(brand, "מצב משפחתי", FAMILY_LABELS[ident.familyStatus] || String(ident.familyStatus)) : "",
      ident.spouseName ? row(brand, "בן/בת זוג", String(ident.spouseName)) : "",
      areaLabels ? row(brand, "רשויות", areaLabels) : "",
    ].join("");

    return {
      subject: `📋 ${name} מילא את פרטי הייצוג`,
      html: buildBrandedEmail(brand, {
        heading: "פרטי הייצוג הושלמו",
        bodyHtml: esc(`${name} שלח את פרטי הזיהוי. הכדור עבר אליך — להכין את ייפוי הכוח ולשלוח לחתימה.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לכרטיס הלקוח",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת הייצוג",
      }),
    };
  }

  if (kind === "poa_signed") {
    const { data: r } = await admin.from("representation_requests").select("*").eq("id", n.request_id).maybeSingle();
    if (!r) return null;
    const name = String(r.client_name || p.clientName || "הלקוח").trim();
    const signed = Number(p.signedCount || 0);
    const total = Number(p.totalSigners || 0);
    const partial = total > 1 && signed < total;
    const rows = [
      row(brand, "לקוח", name),
      row(brand, "חתמו", String(p.signedNames || "")),
      total > 1 ? row(brand, "התקדמות", `${signed} מתוך ${total} חותמים`) : "",
    ].join("");

    return {
      subject: partial
        ? `✍️ ${name} — נחתם ייפוי כוח (${signed}/${total})`
        : `✍️ ${name} חתם על ייפוי הכוח`,
      html: buildBrandedEmail(brand, {
        heading: partial ? "ייפוי הכוח נחתם חלקית" : "ייפוי הכוח נחתם",
        bodyHtml: esc(partial
          ? `${p.signedNames} חתם/ו. עדיין ממתינים לחתימת שאר החותמים — הייצוג ייכנס לתוקף רק כששניהם יחתמו.`
          : `החתימה הושלמה. אפשר להמשיך להזנת הייצוג ברשויות.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לכרטיס הלקוח",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת הייצוג",
      }),
    };
  }

  // ── האירועים שמקורם בשלב קליטה ────────────────────────────────────────────
  // כולם נשענים על step_id. שלב שנמחק מוחק את ההתראה איתו (FK cascade), ולכן
  // הבדיקה כאן היא רשת ביטחון בלבד.
  const name = String(p.clientName || "הלקוח").trim();

  if (kind === "client_document_uploaded" || kind === "prev_accountant_document_uploaded") {
    const byPrev = kind === "prev_accountant_document_uploaded";
    const who = byPrev ? String(p.prevAccountantName || "רואה החשבון הקודם").trim() : name;
    const item = String(p.itemLabel || "מסמך").trim();
    const remaining = Number(p.remaining ?? 0);
    const rows = [
      row(brand, "לקוח", name),
      byPrev ? row(brand, "העלה", who) : "",
      row(brand, "הפריט", item),
      p.fileName ? row(brand, "קובץ", String(p.fileName)) : "",
      row(brand, "נותרו", remaining === 0 ? "הכול הגיע" : `${remaining} פריטים`),
    ].join("");

    return {
      subject: `📎 ${name} — התקבל ${item}`,
      html: buildBrandedEmail(brand, {
        heading: byPrev ? "הרו״ח הקודם העלה חומר" : "הלקוח העלה מסמך",
        bodyHtml: esc(remaining === 0
          ? `${who} העלה את "${item}", וזה היה הפריט האחרון — הרשימה הושלמה והכדור חזר אליך.`
          : `${who} העלה את "${item}". ממתינים לעוד ${remaining} פריטים.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לכרטיס הלקוח",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת הקליטה",
      }),
    };
  }

  if (kind === "client_request_completed") {
    const { data: s } = await admin.from("onboarding_steps").select("*").eq("id", n.step_id).maybeSingle();
    if (!s) return null;
    const title = String(p.requestTitle || "בקשה מהמשרד").trim();
    // מציגים את מה שהלקוח באמת מסר, ולא רק שהוא סיים — כדי שלא צריך להיכנס
    // למערכת רק כדי לראות מה נכתב.
    const answers: string[] = [];
    for (const r of (s.payload?.requirements ?? []) as Record<string, unknown>[]) {
      if (r?.value) answers.push(row(brand, String(r.label || ""), String(r.value)));
    }
    const rows = [
      row(brand, "לקוח", name),
      row(brand, "הבקשה", title),
      ...answers,
    ].join("");

    return {
      subject: `✔️ ${name} השלים: ${title}`,
      html: buildBrandedEmail(brand, {
        heading: "הבקשה הושלמה",
        bodyHtml: esc(`${name} השלים את כל מה שהתבקש ב"${title}". הכדור חזר אליך.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לדף המסע",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת הקליטה",
      }),
    };
  }

  if (kind === "release_letter_signed") {
    const signer = String(p.signerName || p.prevAccountantName || "").trim();
    const rows = [
      row(brand, "לקוח", name),
      signer ? row(brand, "חתם", signer) : "",
    ].join("");

    return {
      subject: `📝 ${name} — מכתב השחרור נחתם`,
      html: buildBrandedEmail(brand, {
        heading: "הרו״ח הקודם חתם על מכתב השחרור",
        bodyHtml: esc(signer
          ? `${signer} חתם על מכתב השחרור של ${name}. השלבים שהיו תלויים בו נפתחו.`
          : `מכתב השחרור של ${name} נחתם. השלבים שהיו תלויים בו נפתחו.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לדף המסע",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת הקליטה",
      }),
    };
  }

  if (kind === "onboarding_closed") {
    const forced = Boolean(p.forced);
    const reason = String(p.reason || "").trim();
    const rows = [
      row(brand, "לקוח", name),
      row(brand, "סגירה", forced ? "נסגר עם פריטים פתוחים" : "כל הפריטים הושלמו"),
      forced && reason ? row(brand, "סיבה", reason) : "",
    ].join("");

    return {
      subject: `🏁 ${name} — הקליטה הושלמה`,
      html: buildBrandedEmail(brand, {
        heading: "תהליך הקליטה הושלם",
        bodyHtml: esc(`${name} עבר מקליטה לטיפול שוטף.`),
        extraHtml: card(brand, rows),
        ctaLabel: "לכרטיס הלקוח",
        ctaHref: `${appUrl}/`,
        ctaArrow: true,
        footerTagline: "התראה אוטומטית ממערכת הקליטה",
      }),
    };
  }

  return null;
}
