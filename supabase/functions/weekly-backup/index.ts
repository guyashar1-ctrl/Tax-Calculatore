// Edge Function: weekly-backup  (מופעל מ-pg_cron פעם בשבוע)
// אוסף את כל טבלאות המידע ל-JSON אחד, שומר בדלי הפרטי "backups",
// ושולח אותו כקובץ מצורף למייל. מגן מאובדן נתונים בתוכנית החינמית (אין PITR).
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

const BACKUP_TO = "office@yasharcpa.co.il";
const BACKUP_FROM = "office@yasharcpa.co.il";

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
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

    // מזהה בעלים לצורך שורת הלוג (email_messages.user_id NOT NULL) — הבעלים הראשי.
    let ownerId: string | null = null;
    {
      const { data: prof } = await admin.from("profiles").select("id,email").limit(50);
      const owner = (prof ?? []).find((p) => String(p.email).toLowerCase() === "guyashar1@gmail.com") ?? (prof ?? [])[0];
      ownerId = owner?.id ?? null;
    }

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

    // ── שליחת המייל עם הקובץ המצורף ──
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
      <h2 style="margin:0 0 8px;">גיבוי שבועי — ${dateStr}</h2>
      <p style="color:#555;">מצורף קובץ גיבוי מלא של כל נתוני המערכת (${sizeKb}KB). שמור אותו במקום בטוח.</p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;">${summaryLines}</pre>
      <p style="color:#888;font-size:12px;">עותק נוסף נשמר אוטומטית בדלי הפרטי "backups". גיבוי זה אינו כולל את הקבצים עצמם (מסמכים/PDF).</p>
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `גיבוי מערכת <${BACKUP_FROM}>`,
        to: [BACKUP_TO],
        subject: `גיבוי שבועי — ${dateStr}`,
        html,
        attachments: [{ filename, content: utf8ToBase64(payload) }],
      }),
    });
    const respBody = await r.json().catch(() => ({}));

    const logBase = { user_id: ownerId, to_email: BACKUP_TO, subject: `גיבוי שבועי — ${dateStr}`, kind: "weekly_backup", meta: { filename, sizeKb, counts } };
    if (!r.ok) {
      if (ownerId) await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(respBody).slice(0, 500) });
      return json({ ok: false, error: "resend_failed", detail: respBody, filename, sizeKb, uploadError: up.error?.message ?? null }, 502);
    }
    if (ownerId) await admin.from("email_messages").insert({ ...logBase, status: "sent", resend_id: respBody.id });
    return json({ ok: true, filename, sizeKb, counts, resendId: respBody.id, uploadError: up.error?.message ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
