// Edge Function: submit-application
// עמוד המילוי הציבורי (?apply=TOKEN) — קישור משרדי קבוע, לא אישי. שני מסלולים:
//   action=resolve → פרטי מיתוג מינימליים בלבד, כדי לצייר את הדף לפני שממלאים.
//   action=submit  → יוצר ליד חדש (source=self_intake, status=new). לעולם לא
//                    יוצר הצעה/ייצוג/כרטיס מלא — רק ליד שממתין לטיפול הרו"ח.
//
// אבטחה (אפיון שלב 4):
//  ‼ הטוקן מזהה את המשרד בשרת בלבד — לעולם לא מקבלים user_id/firm_id מהקורא.
//  ‼ בלי מדיניות anon insert על leads; הכתיבה כאן דרך service-role בלבד.
//  ‼ בלי RPC ציבורי חדש לקריאת מידע — פענוח הטוקן קורה כאן, מול profiles,
//    עם service-role, ולא דרך פונקציה שאנון יכול לקרוא לה ישירות.
//  ‼ תשובה גנרית תמיד — הצלחה נראית זהה בין אימייל תואם ללא-תואם, בין הגשה
//    ראשונה לכפולה. שום דבר בתשובה לא חושף אם אדם קיים כבר במערכת.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_NAME_LEN = 120;
const MAX_EMAIL_LEN = 254;
const MAX_PER_HOUR_PER_FIRM = 20;     // רשת ביטחון מול הצפה, לא מכסה עבודה אמיתית
const IDEMPOTENCY_WINDOW_HOURS = 24;  // אותו מייל, אותו משרד, תוך יממה → לא נוצר ליד שני

function isValidEmail(v: string): boolean {
  return v.length <= MAX_EMAIL_LEN && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

// ‼ מייל הוא פרט קשר, לא זיהוי אדם — שני אחים יכולים לחלוק מייל של ההורה
// לגיטימית. לכן האידמפוטנטיות (מניעת הגשה כפולה בטעות/רפליי) נבדקת לפי
// מייל+שם יחד, לא מייל בלבד. אותו נרמול כמו squash ב-utils/identity.ts —
// בלי ייבוא חוצה-ריצה, כדי שהקובץ יישאר עצמאי כמו שאר ה-Edge Functions.
function normalizeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "");
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
    const body = await req.json().catch(() => ({}));
    const { action, token } = body as Record<string, unknown>;
    if (typeof token !== "string" || !token.trim()) return json({ error: "missing_token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ‼ פענוח הטוקן — הצעד היחיד שמזהה את המשרד. הקורא הציבורי לעולם לא
    // שולח user_id, ואף שדה מהגוף לא נכנס לשאילתה הזו.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, firm_name, branding")
      .eq("apply_token", token.trim())
      .maybeSingle();
    if (!profile) return json({ error: "invalid_token" }, 404);
    const userId = profile.id as string;

    if (action === "resolve") {
      return json({ ok: true, firmName: profile.firm_name || "", branding: profile.branding || {} });
    }

    if (action === "submit") {
      const { fullName, email, hp } = body as Record<string, unknown>;

      // מלכודת דבורים: שדה שאדם אמיתי לא ממלא. תשובת "הצלחה" זהה — אסור
      // לרמז לבוט שהוא נתפס.
      if (typeof hp === "string" && hp.trim()) return json({ ok: true });

      const name = typeof fullName === "string" ? fullName.trim() : "";
      const emailRaw = typeof email === "string" ? email.trim() : "";
      if (!name || name.length > MAX_NAME_LEN) return json({ error: "invalid_name" }, 400);
      if (!emailRaw || !isValidEmail(emailRaw)) return json({ error: "invalid_email" }, 400);
      const normEmail = normalizeEmail(emailRaw);
      const normName = normalizeName(name);

      // ── רשת ביטחון מול הצפה — לפי המשרד שהטוקן פתר, לא לפי IP ───────────────
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin
        .from("leads").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("source", "self_intake").gte("created_at", hourAgo);
      if ((count ?? 0) >= MAX_PER_HOUR_PER_FIRM) return json({ ok: true }); // תשובה גנרית — לא חושפת חסימה

      // ── אידמפוטנטיות: מייל+שם יחד, אצל אותו משרד, תוך 24 שעות — לא מייל בלבד.
      // ‼ שני אחים עם מייל משותף אבל שם שונה = שתי הגשות אמיתיות, לא כפילות.
      // אין להשתמש ב-maybeSingle: יותר משורה אחת עם אותו מייל היא כבר תרחיש
      // תקין (בדיוק המקרה הזה) ולא שגיאה.
      const dayAgo = new Date(Date.now() - IDEMPOTENCY_WINDOW_HOURS * 3600_000).toISOString();
      const { data: recentByEmail } = await admin
        .from("leads").select("id, full_name")
        .eq("user_id", userId).eq("source", "self_intake")
        .ilike("email", normEmail).gte("created_at", dayAgo).limit(20);
      const isReplay = (recentByEmail ?? []).some(l => normalizeName(String(l.full_name || "")) === normName);
      if (isReplay) return json({ ok: true });

      // ── התאמה אפשרית ללקוח קיים — פרטית, לרו"ח בלבד; לעולם לא בתשובה.
      // ‼ limit(1) ולא maybeSingle: אחים עם אותו מייל יכולים להתאים לכמה
      // כרטיסים, וזו לא שגיאה — רק לא ידוע איזה מהם באמת אותו אדם.
      const { data: matchedRows } = await admin
        .from("clients").select("id, first_name, last_name")
        .eq("user_id", userId).ilike("email", normEmail)
        .order("created_at", { ascending: true }).limit(1);
      const matched = matchedRows?.[0] ?? null;

      const { data: inserted, error: insErr } = await admin.from("leads").insert({
        user_id: userId,
        full_name: name,
        email: emailRaw,
        status: "new",
        source: "self_intake",
        match_client_id: matched?.id ?? null,
        match_kind: matched ? "email" : null,
      }).select("id").maybeSingle();
      if (insErr) return json({ error: "submit_failed" }, 500);

      await admin.rpc("queue_accountant_notification", {
        p_user_id: userId,
        p_kind: "lead_self_submitted",
        p_payload: {
          leadId: inserted?.id ?? null,
          leadName: name,
          leadEmail: emailRaw,
          matchClientName: matched
            ? `${matched.first_name ?? ""} ${matched.last_name ?? ""}`.trim()
            : null,
        },
      });

      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
