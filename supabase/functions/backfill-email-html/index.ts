// Edge Function: backfill-email-html
// ממלא אחורה את גוף המיילים שנשלחו לפני ש-email_messages.html נוסף.
//
// שמירת ה-HTML בשליחה פותרת רק את העתיד. את העבר אפשר לשחזר רק מ-Resend, וה-API
// שלהם דורש מפתח Full access — נפרד ממפתח השליחה שמוגבל ל-send בלבד.
// המפתח נקרא מהסוד RESEND_READ_API_KEY ואינו יוצא מהשרת.
//
// הפונקציה מטפלת רק במיילים של המשתמש שקורא לה, ומדלגת על כאלה שכבר יש להם
// עותק — כך שאפשר להריץ אותה שוב ושוב בבטחה.
//
// אבטחה: verify_jwt=false בשער + אימות פנימי מה-JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Resend מגביל קצב; שהות קצרה בין הבקשות מונעת 429 ברשימות ארוכות.
const GAP_MS = 150;
const DEFAULT_LIMIT = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const READ_KEY = Deno.env.get("RESEND_READ_API_KEY");
    if (!READ_KEY) {
      return json({ error: "missing_read_key", hint: "יש להגדיר את הסוד RESEND_READ_API_KEY" }, 400);
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    let limit = DEFAULT_LIMIT;
    let messageId: string | null = null;
    try {
      const b = await req.json();
      if (b?.limit && Number.isInteger(b.limit)) limit = Math.min(200, Math.max(1, b.limit));
      // שחזור נקודתי — לרוב רוצים מייל אחד מסוים, לא את כל ההיסטוריה
      if (typeof b?.messageId === "string" && b.messageId) messageId = b.messageId;
    } catch { /* גוף ריק — ברירת המחדל */ }

    // רק מיילים של המשתמש הזה, שיש להם מזהה ב-Resend ועדיין אין להם עותק
    let q = admin
      .from("email_messages")
      .select("id,resend_id")
      .eq("user_id", user.id)
      .is("html", null)
      .not("resend_id", "is", null);
    if (messageId) q = q.eq("id", messageId);
    const { data: rows, error: selErr } = await q
      .order("created_at", { ascending: false })
      .limit(messageId ? 1 : limit);
    if (selErr) return json({ error: "select_failed", detail: selErr.message }, 500);

    let filled = 0;
    const failures: { id: string; reason: string }[] = [];

    for (const row of rows ?? []) {
      try {
        const r = await fetch(`https://api.resend.com/emails/${row.resend_id}`, {
          headers: { Authorization: `Bearer ${READ_KEY}` },
        });
        const body = await r.json();
        if (!r.ok) {
          failures.push({ id: row.id, reason: body?.message || `HTTP ${r.status}` });
        } else if (typeof body?.html === "string" && body.html.length > 0) {
          const { error: upErr } = await admin
            .from("email_messages")
            .update({ html: body.html })
            .eq("id", row.id);
          if (upErr) failures.push({ id: row.id, reason: upErr.message });
          else filled++;
        } else {
          // Resend שומר תוכן לזמן מוגבל; ישנים מדי חוזרים בלי גוף
          failures.push({ id: row.id, reason: "no_html_in_response" });
        }
      } catch (e) {
        failures.push({ id: row.id, reason: e instanceof Error ? e.message : String(e) });
      }
      await sleep(GAP_MS);
    }

    // כמה עוד נשארו — כדי שאפשר יהיה להריץ שוב עד שמסתיים
    const { count: remaining } = await admin
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("html", null)
      .not("resend_id", "is", null);

    return json({ ok: true, scanned: rows?.length ?? 0, filled, remaining: remaining ?? 0, failures });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
