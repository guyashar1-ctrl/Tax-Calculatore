// Edge Function: weekly-backup  (מופעל מ-pg_cron פעם בשבוע)
// אוסף את כל טבלאות המידע ל-JSON אחד ושומר אותו בדלי הפרטי "backups".
// מגן מאובדן נתונים בתוכנית החינמית (אין PITR).
//
// ‼ המייל הוא דיווח מצב בלבד — שם הקובץ וספירת שורות. עד 2026-08 הוא נשא את
// כל בסיס הנתונים כקובץ מצורף לא מוצפן: תיבת דואר אחת שנפרצת, או כתובת אחת
// שהוקלדה לא נכון, היו חושפות את כל תיקי הלקוחות. הגיבוי עצמו יושב בדלי הפרטי,
// והמייל רק מודיע שהוא נוצר.
//
// אימות: x-cron-secret (מה-cron) או Authorization: Bearer <service_role> (ידני).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// כל טבלאות המידע שנכללות בגיבוי.
const TABLES = [
  "clients", "tasks", "leads", "quotations", "quotation_templates",
  "quotation_counters", "service_catalog", "representation_requests", "cases",
  "documents", "document_task_links", "employees", "profiles",
  "annual_report_sessions", "annual_report_answers", "annual_report_model_snapshots",
  "email_messages", "authorized_users",
];

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
    const { data: profileRows } = await admin
      .from("profiles").select("id,email,communication").limit(50);
    const recipients = (profileRows ?? []).filter((p) => p.email && String(p.email).trim());

    // ── איסוף כל הטבלאות (עם עימוד — ברירת המחדל מוגבלת ל-1000 שורות) ──
    const dump: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      const rows: unknown[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await admin.from(t).select("*").range(from, from + page - 1);
        if (error) { counts[t] = -1; break; }
        rows.push(...(data ?? []));
        if (!data || data.length < page) break;
      }
      dump[t] = rows;
      if (counts[t] !== -1) counts[t] = rows.length;
    }

    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);
    const payload = JSON.stringify({ generatedAt: nowIso, counts, tables: dump }, null, 0);
    const filename = `backup-${dateStr}.json`;
    const sizeKb = Math.round(payload.length / 1024);

    // ── שמירה בדלי הפרטי ──
    const up = await admin.storage.from("backups").upload(filename, new Blob([payload], { type: "application/json" }), { upsert: true, contentType: "application/json" });

    const summaryLines = TABLES.map((t) => `${t}: ${counts[t]}`).join("\n");

    if (dryRun) {
      return json({ ok: true, dryRun: true, filename, sizeKb, counts, uploadError: up.error?.message ?? null });
    }

    // ── דיווח מצב במייל — בלי נתונים, בלי קובץ מצורף ──
    const uploadFailed = !!up.error;
    const subject = `${uploadFailed ? "גיבוי שבועי נכשל" : "גיבוי שבועי הושלם"} — ${dateStr}`;
    const statusLine = uploadFailed
      ? `<p style="color:#B42318;font-weight:700;">הגיבוי לא נשמר. שגיאה: ${up.error?.message ?? "לא ידועה"}</p>`
      : `<p style="color:#067647;font-weight:700;">הגיבוי נשמר בדלי הפרטי "backups".</p>`;
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
      <h2 style="margin:0 0 8px;">גיבוי שבועי — ${dateStr}</h2>
      ${statusLine}
      <p style="color:#555;">שם הקובץ: <strong dir="ltr">${filename}</strong> (${sizeKb}KB)</p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;">${summaryLines}</pre>
      <p style="color:#888;font-size:12px;">המייל הזה הוא דיווח בלבד — הנתונים עצמם אינם נשלחים במייל. הגיבוי אינו כולל את הקבצים עצמם (מסמכים/PDF).</p>
    </div>`;

    // כל בעל פרופיל מקבל את הדיווח שלו, מהכתובת השולחת של המשרד שלו.
    const results: { to: string; ok: boolean }[] = [];
    for (const p of recipients) {
      const toEmail = String(p.email).trim();
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
        results.push({ to: toEmail, ok: false });
      } else {
        await admin.from("email_messages").insert({ ...logBase, status: "sent", resend_id: respBody.id });
        results.push({ to: toEmail, ok: true });
      }
    }

    return json({ ok: !uploadFailed, filename, sizeKb, counts, notified: results, uploadError: up.error?.message ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
