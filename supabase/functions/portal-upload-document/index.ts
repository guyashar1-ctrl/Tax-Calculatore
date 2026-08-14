// Edge Function: portal-upload-document
// העלאת קובץ מדף ציבורי — בלי התחברות. שני מקורות, נתיב אחד:
//   tokenKind=portal   → הלקוח מעלה מהדף האישי (?portal=), כנגד פריט ב-client_documents
//                        או כנגד דרישת kind=file בבקשה חופשית.
//   tokenKind=release  → הרו"ח הקודם מעלה מדף השחרור (?release=), כנגד פריט בצ'קליסט
//                        של materials_received.
// אבטחה: verify_jwt=false בשער; הזיהוי הוא הטוקן האקראי עצמו, כמו signing-session
// ו-onboarding. הטוקן לעולם אינו מזהה את המשתמש — הוא נפתר לשורה, וממנה ל-user_id.
//
// ‼ העלאה לא נועלת ולא מחליפה את הסימון הידני של הרו"ח: החומרים עשויים להגיע
//   גם במייל או בוואטסאפ, וגיא ממשיך לסמן פריטים בעצמו (הכרעת גיא 2026-08-05).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_PER_HOUR = 40;            // רשת ביטחון מול הצפה, לא מכסה עבודה אמיתית

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// קטגוריית המסמך נגזרת מהפריט שביקשנו, כדי שהקובץ ימצא את מקומו בתיק לבד.
const CATEGORY_BY_KEY: Record<string, string> = {
  id_card: "id_card",
  bank_confirm: "business_document",
  vat_cert: "business_document",
  last_return: "tax_assessment",
  form106: "salary_slip",
};

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
    const tokenKind = String(form.get("tokenKind") || "portal");
    const stepId = String(form.get("stepId") || "");
    const itemKey = String(form.get("itemKey") || "");
    const file = form.get("file");

    if (!token) return json({ error: "missing_token" }, 400);
    if (!stepId) return json({ error: "missing_step" }, 400);
    if (!itemKey) return json({ error: "missing_item" }, 400);
    if (!(file instanceof File)) return json({ error: "missing_file" }, 400);
    if (file.size === 0) return json({ error: "empty_file" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "too_large", maxMb: 10 }, 413);

    const type = file.type || "application/octet-stream";
    if (!ALLOWED.has(type)) return json({ error: "type_not_allowed", type }, 415);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── פתרון הטוקן לשלב ולבעליו ─────────────────────────────────────────────
    let clientId = "";
    if (tokenKind === "release") {
      const { data: rel } = await admin
        .from("onboarding_steps")
        .select("client_id")
        .eq("step_type", "release_letter")
        .eq("payload->>releaseToken", token)
        .maybeSingle();
      if (!rel) return json({ error: "invalid_token" }, 403);
      clientId = rel.client_id;
    } else {
      const { data: cli } = await admin
        .from("clients").select("id").eq("portal_token", token).maybeSingle();
      if (!cli) return json({ error: "invalid_token" }, 403);
      clientId = cli.id;
    }

    // השלב חייב להיות של אותו לקוח — הטוקן לא מקנה גישה לשום שלב אחר.
    const { data: step } = await admin
      .from("onboarding_steps").select("*").eq("id", stepId).eq("client_id", clientId).maybeSingle();
    if (!step) return json({ error: "step_not_found" }, 404);
    if (["cancelled"].includes(step.status)) return json({ error: "step_closed" }, 409);

    const allowedTypes = tokenKind === "release"
      ? ["materials_received"]
      : ["client_documents", "custom_request"];
    if (!allowedTypes.includes(step.step_type)) return json({ error: "step_not_uploadable" }, 403);
    // בקשה שהרו"ח עוד לא פתח ללקוח אינה קיימת מבחינתו.
    // מקור האמת הוא העמודה (מיגרציה 77); המראה ב-payload נבדקת ליתר ביטחון.
    if (tokenKind === "portal" &&
        (step.published_at == null || String(step.payload?.published ?? "true") === "false")) {
      return json({ error: "not_published" }, 403);
    }

    // ── רשת ביטחון מול הצפה ──────────────────────────────────────────────────
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from("documents").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("uploaded_at", hourAgo);
    if ((count ?? 0) >= MAX_PER_HOUR) return json({ error: "rate_limited" }, 429);

    // ── הפריט שכנגדו מעלים ───────────────────────────────────────────────────
    const payload = (step.payload || {}) as Record<string, unknown>;
    const listKey = step.step_type === "custom_request" ? "requirements" : "checklist";
    const list = Array.isArray(payload[listKey]) ? [...(payload[listKey] as any[])] : [];
    const idx = list.findIndex((x) => x?.key === itemKey);
    if (idx < 0) return json({ error: "item_not_found" }, 404);
    const itemKind = String(list[idx]?.kind ?? "");
    if (step.step_type === "custom_request" && itemKind !== "file" && itemKind !== "files") {
      return json({ error: "item_not_a_file" }, 400);
    }
    // 'files' מקבל כמה קבצים לאותו פריט — עד התקרה שהרו"ח קבע, אם קבע.
    const priorIds: string[] = Array.isArray(list[idx]?.documentIds) ? list[idx].documentIds : [];
    const maxFiles = Number(list[idx]?.maxFiles ?? 0);
    if (itemKind === "files" && maxFiles > 0 && priorIds.length >= maxFiles) {
      return json({ error: "max_files_reached", maxFiles }, 409);
    }
    const itemLabel = String(list[idx]?.label || itemKey);

    // ── שמירה ב-Storage ואז ברשומת המסמכים ───────────────────────────────────
    const docId = crypto.randomUUID();
    const path = `${step.user_id}/${clientId}/${docId}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from("client-documents").upload(path, bytes, { contentType: type, upsert: false });
    if (upErr) return json({ error: "storage_failed", detail: upErr.message }, 500);

    const source = tokenKind === "release" ? "רואה החשבון הקודם" : "הלקוח";
    // ‼ שנה ותווית מוגדרות מראש על הבקשה (M3 — "בקש מסמך מהלקוח") — לא מנחשים
    // אותן כאן. חסרות ⇒ נופלים ל'כללי'/'לבדיקה' בצד הלקוח (fallback שמרני).
    const { error: docErr } = await admin.from("documents").insert({
      id: docId,
      user_id: step.user_id,
      client_id: clientId,
      storage_path: path,
      file_name: file.name || `${itemKey}.pdf`,
      file_type: type,
      file_size: file.size,
      category: tokenKind === "release" ? "business_document" : (CATEGORY_BY_KEY[itemKey] || "other"),
      year: String(payload?.documentYear ?? "general"),
      label_id: payload?.documentLabelId ?? null,
      description: itemLabel,
      notes: `הועלה על ידי ${source} מהדף הציבורי`,
      status: "received",
    });
    if (docErr) {
      // לא משאירים קובץ יתום ב-Storage כשהרשומה נכשלה.
      await admin.storage.from("client-documents").remove([path]);
      return json({ error: "record_failed", detail: docErr.message }, 500);
    }
    // ‼ תמיכה מוכנה, בלי יצרן כרגע: "בקשת מסמכים" הגלובלית אינה משויכת למשימה
    // מסוימת ולכן אינה שולחת linkedTaskId. ברגע שתיווצר בקשה מתוך משימה, הקובץ
    // שיתקבל יתקשר אליה כאן — קישור, לא כפילות קובץ.
    if (payload?.linkedTaskId) {
      await admin.from("document_task_links").insert({
        user_id: step.user_id, document_id: docId, task_id: payload.linkedTaskId,
      }).select().maybeSingle();
    }

    // ── סימון הפריט ועדכון השלב ──────────────────────────────────────────────
    list[idx] = itemKind === "files"
      ? { ...list[idx], done: true, documentIds: [...priorIds, docId], doneAt: new Date().toISOString() }
      : { ...list[idx], done: true, documentId: docId, doneAt: new Date().toISOString() };
    // ‼ ההשלמה נספרת לפי דרישות חובה בלבד (בבקשה חופשית); פריט רשות פתוח
    // לעולם לא חוסם (הכרעת גיא, 6+7). צ'קליסט מסמכים — כל הפריטים חובה.
    const remaining = list.filter((x) =>
      !x?.done && (listKey === "checklist" || x?.required !== false)).length;

    const patch: Record<string, unknown> = { payload: { ...payload, [listKey]: list } };
    if (remaining === 0) {
      // הכול הגיע — הכדור חוזר לרו"ח. ההחלטה אם זה "מאומת" נשארת שלו.
      patch.status = "completed";
      patch.ball = "me";
      patch.completion_method = "system";
      patch.completed_at = new Date().toISOString();
      patch.needs_attention = false;
    } else if (step.status === "locked" || step.status === "pending") {
      patch.status = "in_progress";
    }
    await admin.from("onboarding_steps").update(patch).eq("id", stepId);

    await admin.rpc("log_onboarding_event", {
      p_user_id: step.user_id,
      p_step_id: stepId,
      p_engagement_id: step.engagement_id,
      p_type: remaining === 0 ? "status_changed" : "note",
      p_actor: tokenKind === "release" ? "system" : "client",
      p_note: `${source} העלה: ${itemLabel}`,
      p_meta: { itemKey, documentId: docId, remaining },
    });

    if (remaining === 0) {
      await admin.rpc("unlock_dependent_steps", { p_step_id: stepId });
    }

    // התראה למשרד. נרשמת תמיד; אם גיא כיבה אותה בהגדרות, notify-accountant
    // מסמן אותה כמושתקת ולא שולח. ההחלטה נמצאת במקום אחד בלבד.
    const { data: cli } = await admin
      .from("clients").select("first_name, last_name").eq("id", clientId).maybeSingle();
    await admin.rpc("queue_accountant_notification", {
      p_user_id: step.user_id,
      p_kind: tokenKind === "release" ? "prev_accountant_document_uploaded" : "client_document_uploaded",
      p_client_id: clientId,
      p_step_id: stepId,
      p_payload: {
        clientName: `${cli?.first_name ?? ""} ${cli?.last_name ?? ""}`.trim(),
        prevAccountantName: step.payload?.prevAccountantName ?? null,
        itemLabel,
        fileName: file.name || null,
        remaining,
      },
    });

    return json({ ok: true, documentId: docId, remaining, completed: remaining === 0 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
