// Edge Function: portal-open-document
// פתיחת מסמך **פרטי** של הלקוח מהדף האישי — בלי התחברות.
//
// למה זו פונקציה ולא קישור: ספריית המשרד (firm-resources) ציבורית, ולכן בקשה
// שנושאת קובץ משם מקבלת URL ישר מ-build_client_portal. תיק הלקוח
// (client-documents) פרטי ומוגן ב-RLS, ואת זה אסור לשנות — אז במקום לחשוף את
// הקובץ, הדף מבקש אותו כאן, והפונקציה חותמת קישור לחמש דקות רק אחרי שווידאה
// שהקובץ הזה באמת נשלח ללקוח הזה.
//
// ‼ הטוקן לעולם אינו מזהה משתמש — הוא נפתר לשורת הלקוח, וממנה ל-user_id, בדיוק
//   כמו portal-upload-document ו-signing-session. verify_jwt=false בשער.
//
// ‼ הגבול: הטוקן אינו מפתח לתיק. גם עם טוקן תקין נפתח **רק** מסמך שמופיע
//   ברשימת clientResources של אותה בקשה, ורק אם הבקשה פורסמה ושייכת לאותו
//   לקוח. מסמך אחר של אותו לקוח — שלא שלחנו לו — נדחה כאן.
//
// ‼ הפתיחה אינה נרשמת כאן: הדף רושם אותה ב-portal_submit_step בלחיצה, בדיוק
//   כמו קובץ מספריית המשרד. ערוץ רישום אחד לשני המקורות — ולא שניים שיכולים
//   להיפרד זה מזה.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SIGNED_URL_SECONDS = 300;

/** דף שגיאה קטן בעברית: הלקוח מגיע לכאן בניווט מלא, ו-JSON גולמי אינו תשובה. */
function errorPage(message: string, status: number): Response {
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>המסמך אינו זמין</title></head>
<body style="font-family:system-ui,'Segoe UI',Arial,sans-serif;background:#f7f7f5;margin:0;
padding:40px 16px;display:flex;justify-content:center">
<div style="max-width:420px;background:#fff;border:1px solid #e6e4df;border-radius:10px;padding:26px 28px;text-align:center">
<div style="font-size:17px;font-weight:600;color:#2b2b2b;margin-bottom:6px">המסמך אינו זמין</div>
<div style="font-size:13.5px;line-height:1.7;color:#6b6b6b">${message}</div>
</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") || "").trim();
    const stepId = (url.searchParams.get("stepId") || "").trim();
    const docId = (url.searchParams.get("docId") || "").trim();

    if (!token || !stepId || !docId) {
      return errorPage("הקישור חלקי. אפשר לחזור לדף האישי ולנסות משם שוב.", 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── הטוקן נפתר ללקוח ─────────────────────────────────────────────────────
    const { data: cli } = await admin
      .from("clients").select("id").eq("portal_token", token).maybeSingle();
    if (!cli) return errorPage("הקישור אינו תקין או שאינו פעיל עוד.", 403);
    const clientId = cli.id as string;

    // ── הבקשה חייבת להיות של אותו לקוח, ופתוחה לו ────────────────────────────
    const { data: step } = await admin
      .from("onboarding_steps")
      .select("id, client_id, step_type, status, published_at, payload")
      .eq("id", stepId).eq("client_id", clientId).maybeSingle();
    if (!step) return errorPage("הבקשה לא נמצאה.", 404);
    if (step.step_type !== "custom_request") return errorPage("הבקשה לא נמצאה.", 404);
    if (step.status === "cancelled") return errorPage("הבקשה כבר אינה פעילה.", 409);
    // מקור האמת הוא העמודה (מיגרציה 77); המראה ב-payload נבדקת ליתר ביטחון.
    if (step.published_at == null || String(step.payload?.published ?? "true") === "false") {
      return errorPage("הבקשה הזאת עדיין לא נפתחה.", 403);
    }

    // ── ‼ השער האמיתי: המסמך חייב להופיע ברשימה של הבקשה הזאת ────────────────
    const payload = (step.payload || {}) as Record<string, unknown>;
    const resources = Array.isArray(payload.clientResources)
      ? (payload.clientResources as Record<string, unknown>[])
      : [];
    const listed = resources.some(
      (r) => r?.source === "client" && String(r?.documentId ?? "") === docId,
    );
    if (!listed) return errorPage("המסמך הזה לא נשלח אליך.", 403);

    // ── והמסמך חייב להיות של אותו לקוח, גם אם מישהו ערך את הבקשה ─────────────
    const { data: doc } = await admin
      .from("documents").select("storage_path, file_name, client_id")
      .eq("id", docId).eq("client_id", clientId).maybeSingle();
    if (!doc?.storage_path) return errorPage("הקובץ לא נמצא.", 404);

    const { data: signed, error: signErr } = await admin.storage
      .from("client-documents")
      .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      console.error("[portal-open-document] sign failed", signErr?.message);
      return errorPage("לא הצלחנו לפתוח את הקובץ כרגע. אפשר לנסות שוב בעוד רגע.", 500);
    }

    // ‼ 302 ולא גוף הקובץ: הדפדפן מוריד ישירות מה-Storage, בלי שהפונקציה
    // תעביר דרכה קבצים גדולים. no-store כדי שהקישור החתום לא יישאר במטמון.
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: signed.signedUrl, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[portal-open-document]", String(e));
    return errorPage("אירעה תקלה. אפשר לנסות שוב בעוד רגע.", 500);
  }
});
