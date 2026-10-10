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
import { postResend, resendEmailsUrl } from "../_shared/resendResult.ts";
import { isNotificationEnabled } from "../_shared/accountantNotifications.ts";
import { EXCLUDED, TABLES, TABLE_SCOPES, backupObjectName, chunk, rowKey, type TableScope } from "./scope.ts";

// ‼ ספק הדואר — Resend בייצור; ב-staging אפשר ספק מדומה שקולט (resendEmailsUrl).
const RESEND_EMAILS = resendEmailsUrl(Deno.env.get("RESEND_API_URL"), Deno.env.get("SUPABASE_URL") ?? "");

const PAGE = 1000;

type Profile = { id: string; email: string | null; office_id: string | null };

/** כל שורות הטבלה עבור פרופיל אחד, עם עימוד (ברירת המחדל מוגבלת ל-1000).
 *  via קורא את מזהי ההורה מתוך מה שכבר נאסף (dump), ולכן ההורה מופיע קודם ב-TABLE_SCOPES. */
// deno-lint-ignore no-explicit-any
async function fetchScoped(admin: any, table: string, scope: TableScope, profile: Profile, dump: Record<string, unknown[]>): Promise<unknown[] | null> {
  if (scope.kind === "any") {
    const seen = new Map<string, unknown>();
    for (const part of scope.of) {
      const rows = await fetchScoped(admin, table, part, profile, dump);
      if (rows === null) return null;
      for (const r of rows) seen.set(rowKey(r as Record<string, unknown>), r);
    }
    return [...seen.values()];
  }
  // deno-lint-ignore no-explicit-any
  const filters: Array<(q: any) => any> = [];
  if (scope.kind === "user_id") { const col = scope.column ?? "user_id"; filters.push((q) => q.eq(col, profile.id)); }
  else if (scope.kind === "profile_id") filters.push((q) => q.eq("id", profile.id));
  else if (scope.kind === "office") {
    if (!profile.office_id) return [];
    filters.push((q) => q.eq("office_id", profile.office_id));
  } else if (scope.kind === "own_email") {
    if (!profile.email) return [];
    filters.push((q) => q.eq("email", profile.email));
  } else if (scope.kind === "via") {
    const ids = (dump[scope.parent] ?? []).map((r) => (r as { id?: unknown }).id).filter((v) => v != null);
    if (!ids.length) return [];
    const col = scope.column;
    for (const part of chunk(ids)) filters.push((q) => q.in(col, part));
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
      .from("profiles").select("id,email,office_id,communication,settings").limit(50);
    const profiles = (profileRows ?? []) as Array<Profile & { communication: unknown; settings: unknown }>;

    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);
    const results: Array<{ userId: string; filename: string; sizeKb: number; counts: Record<string, number>; unreadable: string[]; uploadError: string | null; notified: { to: string; ok: boolean; unknown?: boolean } | null }> = [];
    let anyUploadFailed = false, anyUnreadable = false;

    for (const p of profiles) {
      // ── איסוף הטבלאות של הפרופיל הזה בלבד ──
      const dump: Record<string, unknown[]> = {};
      const counts: Record<string, number> = {};
      for (const t of TABLES) {
        const rows = await fetchScoped(admin, t, TABLE_SCOPES[t], p, dump);
        dump[t] = rows ?? [];
        counts[t] = rows ? rows.length : -1;
      }

      const payload = JSON.stringify({ generatedAt: nowIso, userId: p.id, counts, excluded: EXCLUDED, tables: dump }, null, 0);
      const filename = backupObjectName(p.id, dateStr);
      const sizeKb = Math.round(payload.length / 1024);

      // ── שמירה בדלי הפרטי, בתיקיית המשתמש ──
      const up = await admin.storage.from("backups").upload(filename, new Blob([payload], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      const uploadFailed = !!up.error;
      anyUploadFailed ||= uploadFailed;
      // ‼ טבלה שלא נקראה = גיבוי חלקי, לא «הושלם»
      const unreadable = TABLES.filter((t) => counts[t] === -1);
      anyUnreadable ||= unreadable.length > 0;
      const entry = { userId: p.id, filename, sizeKb, counts, unreadable, uploadError: up.error?.message ?? null, notified: null as { to: string; ok: boolean; unknown?: boolean } | null };
      results.push(entry);

      // ‼ מי שכיבה את "דוח הגיבוי השבועי" במסך "המשרד" אינו מקבל את המייל.
      // הגיבוי עצמו נוצר ונשמר בכל מקרה — הכיבוי נוגע לדיווח בלבד.
      const toEmail = p.email ? String(p.email).trim() : "";
      if (dryRun || !toEmail || !isNotificationEnabled(p.settings, "weekly_backup")) continue;

      // ── דיווח מצב במייל — בלי נתונים, בלי קובץ מצורף, ורק על הגיבוי של המשרד הזה ──
      const summaryLines = TABLES.map((t) => `${t}: ${counts[t]}`).join("\n");
      const subject = `${uploadFailed ? "גיבוי שבועי נכשל" : unreadable.length ? "גיבוי שבועי חלקי" : "גיבוי שבועי הושלם"} - ${dateStr}`;
      const statusLine = uploadFailed
        ? `<p style="color:#B42318;font-weight:700;">הגיבוי לא נשמר. שגיאה: ${up.error?.message ?? "לא ידועה"}</p>`
        : unreadable.length
          ? `<p style="color:#B54708;font-weight:700;">הגיבוי נשמר, אבל ${unreadable.length === 1 ? "טבלה אחת לא נקראה" : `${unreadable.length} טבלאות לא נקראו`}: <span dir="ltr">${unreadable.join(", ")}</span></p>`
          : `<p style="color:#067647;font-weight:700;">הגיבוי נשמר בדלי הפרטי "backups".</p>`;
      const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
      <h2 style="margin:0 0 8px;">גיבוי שבועי - ${dateStr}</h2>
      ${statusLine}
      <p style="color:#555;">שם הקובץ: <strong dir="ltr">${filename}</strong> (${sizeKb}KB)</p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;">${summaryLines}</pre>
      <p style="color:#888;font-size:12px;">המייל הזה הוא דיווח בלבד - הנתונים עצמם אינם נשלחים במייל. הגיבוי אינו כולל את הקבצים עצמם (מסמכים/PDF), ולא את חיבור היומן ומחשב העבודה — אחרי שחזור מחברים אותם מחדש.</p>
    </div>`;

      // הדיווח נשלח מהכתובת השולחת של המשרד עצמו.
      const comm = (p.communication || {}) as Record<string, unknown>;
      const fromAddress = (typeof comm.senderEmail === "string" && comm.senderEmail.trim()) || "onboarding@resend.dev";
      // ‼ postResend לעולם לא זורק: חיבור שנפל אצל משרד אחד לא מפיל את הדיווח של השאר.
      const call = await postResend(() => fetch(RESEND_EMAILS, {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `גיבוי מערכת <${fromAddress}>`, to: [toEmail], subject, html }),
      }));
      const logBase = { user_id: p.id, to_email: toEmail, subject, kind: "weekly_backup", html, meta: { filename, sizeKb, counts } };
      if (call.result.outcome === "sent") {
        await admin.from("email_messages").insert({ ...logBase, status: "sent", resend_id: call.result.id });
        entry.notified = { to: toEmail, ok: true };
      } else if (call.result.outcome === "unknown") {
        // ‼ רשת שנפלה / 5xx / 2xx בלי מזהה — ייתכן שהדיווח יצא: «לא ידוע», לא «נכשל».
        await admin.from("email_messages").insert({ ...logBase, status: "unknown", error: call.result.reason.slice(0, 500) });
        entry.notified = { to: toEmail, ok: false, unknown: true };
      } else {
        await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(call.body).slice(0, 500) });
        entry.notified = { to: toEmail, ok: false };
      }
    }

    return json({ ok: !anyUploadFailed && !anyUnreadable, dryRun, date: dateStr, backups: results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
