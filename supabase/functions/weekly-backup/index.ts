// Edge Function: weekly-backup  (מופעל מ-pg_cron פעם בשבוע)
// אוסף את טבלאות המידע ל-JSON ושומר אותו בדלי הפרטי "backups".
// מגן מאובדן נתונים בתוכנית החינמית (אין PITR).
//
// ‼ קובץ לכל פרופיל, לא קובץ אחד לכולם (174): הנתונים מתוחמים ל-user_id
// (ראה scope.ts), שם האובייקט מתחיל במזהה המשתמש, וכל משרד מקבל דיווח רק
// על הגיבוי שלו — עם הספירות שלו בלבד.
//
// ‼ המייל הוא דיווח מצב בלבד — שם הקובץ וספירת שורות. עד 2026-08 הוא נשא את
// כל בסיס הנתונים כקובץ מצורף לא מוצפן: תיבת דואר אחת שנפרצת, או כתובת אחת
// שהוקלדה לא נכון, היו חושפות את כל תיקי הלקוחות. הגיבוי עצמו יושב בדלי הפרטי,
// והמייל רק מודיע שהוא נוצר.
//
// אימות: x-cron-secret (מה-cron) או Authorization: Bearer <service_role> (ידני).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isNotificationEnabled } from "../_shared/accountantNotifications.ts";
import { TABLES, TABLE_SCOPES, backupObjectName, chunk } from "./scope.ts";

const PAGE = 1000;

/** כל שורות הטבלה עבור פרופיל אחד, עם עימוד (ברירת המחדל מוגבלת ל-1000). */
// deno-lint-ignore no-explicit-any
async function fetchScoped(admin: any, table: string, profile: { id: string; email: string | null }, sessionIds: string[]): Promise<unknown[] | null> {
  const scope = TABLE_SCOPES[table];
  const filters: Array<(q: any) => any> = [];
  if (scope.kind === "user_id") filters.push((q) => q.eq("user_id", profile.id));
  else if (scope.kind === "profile_id") filters.push((q) => q.eq("id", profile.id));
  else if (scope.kind === "own_email") {
    if (!profile.email) return [];
    filters.push((q) => q.eq("email", profile.email));
  } else if (scope.kind === "session") {
    if (!sessionIds.length) return [];
    for (const ids of chunk(sessionIds)) filters.push((q) => q.in("session_id", ids));
  }

  const rows: unknown[] = [];
  for (const apply of filters) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await apply(admin.from(table).select("*")).range(from, from + PAGE - 1);
      if (error) return null;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── אימות ──
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("x-cron-secret") || "";
    let authorized = authHeader === `Bearer ${SERVICE_KEY}`;
    if (!authorized && cronSecret) {
      const { data: ok } = await admin.rpc("verify_quotation_cron_secret", { p: cronSecret });
      authorized = ok === true;
    }
    if (!authorized) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    // הנמענים הם בעלי הפרופילים במערכת — לא כתובת קשיחה בקוד. משרד שמחליף
    // כתובת מעדכן אותה במקום אחד, והדיווח ממשיך להגיע.
    // ‼ מי שכיבה את "דוח הגיבוי השבועי" במסך "המשרד" אינו מקבל את המייל.
    // הגיבוי עצמו נוצר ונשמר בכל מקרה — הכיבוי נוגע לדיווח בלבד.
    const { data: profileRows } = await admin
      .from("profiles").select("id,email,communication,settings").limit(50);
    const profiles = (profileRows ?? []) as Array<{ id: string; email: string | null; communication: unknown; settings: unknown }>;

    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);
    const results: Array<{ userId: string; filename: string; sizeKb: number; counts: Record<string, number>; uploadError: string | null; notified: { to: string; ok: boolean } | null }> = [];
    let anyUploadFailed = false;

    for (const p of profiles) {
      // ── איסוף הטבלאות של הפרופיל הזה בלבד ──
      const { data: sessRows } = await admin.from("annual_report_sessions").select("id").eq("user_id", p.id);
      const sessionIds = (sessRows ?? []).map((s: { id: string }) => s.id);
      const dump: Record<string, unknown[]> = {};
      const counts: Record<string, number> = {};
      for (const t of TABLES) {
        const rows = await fetchScoped(admin, t, p, sessionIds);
        dump[t] = rows ?? [];
        counts[t] = rows ? rows.length : -1;
      }

      const payload = JSON.stringify({ generatedAt: nowIso, userId: p.id, counts, tables: dump }, null, 0);
      const filename = backupObjectName(p.id, dateStr);
      const sizeKb = Math.round(payload.length / 1024);

      // ── שמירה בדלי הפרטי, בתיקיית המשתמש ──
      const up = await admin.storage.from("backups").upload(filename, new Blob([payload], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      const uploadFailed = !!up.error;
      anyUploadFailed ||= uploadFailed;
      const entry = { userId: p.id, filename, sizeKb, counts, uploadError: up.error?.message ?? null, notified: null as { to: string; ok: boolean } | null };
      results.push(entry);

      // ‼ מי שכיבה את "דוח הגיבוי השבועי" במסך "המשרד" אינו מקבל את המייל.
      // הגיבוי עצמו נוצר ונשמר בכל מקרה — הכיבוי נוגע לדיווח בלבד.
      const toEmail = p.email ? String(p.email).trim() : "";
      if (dryRun || !toEmail || !isNotificationEnabled(p.settings, "weekly_backup")) continue;

      // ── דיווח מצב במייל — בלי נתונים, בלי קובץ מצורף, ורק על הגיבוי של המשרד הזה ──
      const summaryLines = TABLES.map((t) => `${t}: ${counts[t]}`).join("\n");
      const subject = `${uploadFailed ? "גיבוי שבועי נכשל" : "גיבוי שבועי הושלם"} - ${dateStr}`;
      const statusLine = uploadFailed
        ? `<p style="color:#B42318;font-weight:700;">הגיבוי לא נשמר. שגיאה: ${up.error?.message ?? "לא ידועה"}</p>`
        : `<p style="color:#067647;font-weight:700;">הגיבוי נשמר בדלי הפרטי "backups".</p>`;
      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
      <h2 style="margin:0 0 8px;">גיבוי שבועי - ${dateStr}</h2>
      ${statusLine}
      <p style="color:#555;">שם הקובץ: <strong dir="ltr">${filename}</strong> (${sizeKb}KB)</p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;">${summaryLines}</pre>
      <p style="color:#888;font-size:12px;">המייל הזה הוא דיווח בלבד - הנתונים עצמם אינם נשלחים במייל. הגיבוי אינו כולל את הקבצים עצמם (מסמכים/PDF).</p>
    </div>`;

      // הדיווח נשלח מהכתובת השולחת של המשרד עצמו.
      const comm = (p.communication || {}) as Record<string, unknown>;
      const fromAddress = (typeof comm.senderEmail === "string" && comm.senderEmail.trim()) || "onboarding@resend.dev";
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `גיבוי מערכת <${fromAddress}>`, to: [toEmail], subject, html }),
      });
      const respBody = await r.json().catch(() => ({}));
      const logBase = { user_id: p.id, to_email: toEmail, subject, kind: "weekly_backup", html, meta: { filename, sizeKb, counts } };
      if (!r.ok) {
        await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(respBody).slice(0, 500) });
        entry.notified = { to: toEmail, ok: false };
      } else {
        await admin.from("email_messages").insert({ ...logBase, status: "sent", resend_id: respBody.id });
        entry.notified = { to: toEmail, ok: true };
      }
    }

    return json({ ok: !anyUploadFailed, dryRun, date: dateStr, backups: results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
