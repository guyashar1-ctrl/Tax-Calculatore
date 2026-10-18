// Edge Function: portal-signed-form
// הקובץ החתום של טופס שהלקוח ממלא וחותם בדף האישי (821/4440) — נשמר במסמכי הלקוח
// ברגע החתימה (259, 17.10.2026). עד עכשיו הוא נבנה רק כשהמשרד פתח את הטופס.
//
// הדף בונה את ה-PDF מאותם נתונים, תבנית וחתימה שהלקוח ראה וחתם עליהם, ושולח לכאן.
// אבטחה: verify_jwt=false בשער; הזיהוי הוא טוקן הדף עצמו (כמו portal-upload-document).
// השרת מחליט לאן לשמור (portal_smart_form_signed_pdf_target) ושומר+משייך באטומיות
// (portal_smart_form_store_signed_pdf) — רק לגרסה שכבר נחתמה ועוד לא קיבלה קובץ.
// ‼ לא מוחקים קובץ מהנתיב בכשל: אותו נתיב משמש את הגיבוי של המשרד.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — טופס 821 חתום שוקל כ-0.8MB

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
    const form = await req.formData();
    const token = String(form.get("token") || "");
    const stepId = String(form.get("stepId") || "");
    const file = form.get("file");
    if (!token) return json({ ok: false, error: "missing_token" }, 400);
    if (!stepId) return json({ ok: false, error: "missing_step" }, 400);
    if (!(file instanceof File) || file.size === 0) return json({ ok: false, error: "missing_file" }, 400);
    if (file.size > MAX_BYTES) return json({ ok: false, error: "too_large" }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // ‼ רק PDF — לפי התוכן, לא לפי מה שהדפדפן הצהיר.
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return json({ ok: false, error: "not_pdf" }, 415);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: target, error: tErr } = await admin.rpc("portal_smart_form_signed_pdf_target", { p_token: token, p_step_id: stepId });
    if (tErr) return json({ ok: false, error: "lookup_failed", detail: tErr.message }, 500);
    if (!target?.ok) return json({ ok: false, error: target?.error ?? "invalid" }, 403);
    if (target.alreadyStored) return json({ ok: true, alreadyStored: true });

    const sha = await sha256Hex(bytes);
    const { error: upErr } = await admin.storage.from("client-documents")
      .upload(String(target.storagePath), bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json({ ok: false, error: "upload_failed", detail: upErr.message }, 500);

    const { data: stored, error: sErr } = await admin.rpc("portal_smart_form_store_signed_pdf", {
      p_token: token, p_step_id: stepId, p_revision: target.revision, p_pdf_sha256: sha, p_file_size: bytes.byteLength,
    });
    if (sErr) return json({ ok: false, error: "record_failed", detail: sErr.message }, 500);
    if (!stored?.ok) return json({ ok: false, error: stored?.error ?? "record_failed" }, 409);
    return json({ ok: true, documentId: stored.documentId ?? target.documentId, unchanged: !!stored.unchanged });
  } catch (e) {
    return json({ ok: false, error: "server_error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
