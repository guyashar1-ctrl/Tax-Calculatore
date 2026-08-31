// Edge Function: onboarding-upload-id
//
// צילום תעודת הזהות בקליטת הייצוג. הלקוח מעלה מקישור הקליטה (?onboard=),
// בלי התחברות — הזיהוי הוא הטוקן האקראי עצמו, בדיוק כמו portal-upload-document
// ו-signing-session. הטוקן לעולם אינו מזהה משתמש; הוא נפתר לשורת הבקשה, וממנה
// ל-user_id ולכרטיס הלקוח.
//
// ‼ הזנת המספר אינה מספיקה — הרשויות רוצות את התעודה עצמה. איזו תעודה נדרשת
// נגזר מאמצעי הזיהוי שהאדם בחר (רישיון ⇒ רישיון, דרכון ⇒ דרכון, ת.ז. הורה ⇒
// ת.ז. או רישיון), וממי — מהיקף הייצוג שהתבקש. שני החישובים חיים בצד הלקוח
// (`identityEvidence`), וכאן נאכף רק מה שהשרת חייב לאכוף בעצמו: טוקן תקף,
// בקשה פתוחה, סוג וגודל קובץ, ותקרת קצב.
//
// ‼ הקובץ נשמר כמסמך רגיל בתיק הלקוח (category=id_card) ולא במקום חדש — כדי
// שהוא יימצא איפה שכל מסמך אחר של הלקוח נמצא.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_HOUR = 20;

// צילום תעודה — תמונות ו-PDF בלבד. גיליונות ומסמכי Office אינם תעודת זהות.
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);

const PERSON_LABEL: Record<string, string> = { client: "הנישום", spouse: "בן/בת הזוג" };
const KIND_LABEL: Record<string, string> = {
  idCard: "תעודת זהות",
  driverLicense: "רישיון נהיגה",
  passport: "דרכון",
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
    const personParam = String(form.get("person") || "client");
    const docKind = String(form.get("docKind") || "idCard");
    const file = form.get("file");

    if (!token) return json({ error: "missing_token" }, 400);
    if (!["client", "spouse"].includes(personParam)) return json({ error: "bad_person" }, 400);
    if (!KIND_LABEL[docKind]) return json({ error: "bad_kind" }, 400);
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

    // ‼ שני קישורים מגיעים לכאן: זה של הלקוח, וזה של בן/בת הזוג (149) שנפתח
    // כשהלקוח לא ידע את פרטיו/ה. הטוקן הוא גם ההרשאה וגם הזהות: מי שהגיע
    // בטוקן של בן/בת הזוג יכול להעלות **רק** את התעודה שלו/ה.
    const sel = "id, user_id, linked_client_id, onboarding_status, identity_docs, identification";
    let { data: reqRow } = await admin
      .from("representation_requests").select(sel)
      .eq("onboarding_token", token).maybeSingle();
    let viaSpouseLink = false;
    if (!reqRow) {
      const alt = await admin
        .from("representation_requests").select(sel)
        .eq("spouse_onboarding_token", token).maybeSingle();
      reqRow = alt.data;
      viaSpouseLink = !!reqRow;
    }
    if (!reqRow) return json({ error: "invalid_token" }, 403);

    const person = viaSpouseLink ? "spouse" : personParam;
    if (viaSpouseLink) {
      // ההשלמה חיה אחרי הגשת הלקוח — היא בדיוק המקרה שבו הוא הגיש בלעדיה.
      const ident = (reqRow.identification ?? {}) as Record<string, string>;
      if (ident.spouseFillSubmittedAt) return json({ error: "already_submitted" }, 409);
    } else if (reqRow.onboarding_status === "submitted") {
      // אחרי ההגשה הקישור אינו ערוץ העלאה — המשרד מעלה מהכרטיס.
      return json({ error: "already_submitted" }, 409);
    }

    const clientId = reqRow.linked_client_id as string;
    if (!clientId) return json({ error: "no_client" }, 409);

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from("documents").select("id", { count: "exact", head: true })
      .eq("client_id", clientId).gte("uploaded_at", hourAgo);
    if ((count ?? 0) >= MAX_PER_HOUR) return json({ error: "rate_limited" }, 429);

    const docId = crypto.randomUUID();
    const path = `${reqRow.user_id}/${clientId}/${docId}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from("client-documents").upload(path, bytes, { contentType: type, upsert: false });
    if (upErr) return json({ error: "storage_failed", detail: upErr.message }, 500);

    const label = `${KIND_LABEL[docKind]} - ${PERSON_LABEL[person]}`;
    const { error: docErr } = await admin.from("documents").insert({
      id: docId,
      user_id: reqRow.user_id,
      client_id: clientId,
      storage_path: path,
      file_name: file.name || `${docKind}.jpg`,
      file_type: type,
      file_size: file.size,
      category: "id_card",
      year: "general",
      uploaded_at: new Date().toISOString(),
      description: label,
      notes: "צולם על ידי הלקוח בקליטת הייצוג",
      status: "received",
    });
    if (docErr) {
      await admin.storage.from("client-documents").remove([path]);
      return json({ error: "record_failed", detail: docErr.message }, 500);
    }

    // ‼ הרישום על הבקשה הוא מה שסוגר את הדרישה. מערך ולא ערך יחיד: תעודה
    // דו-צדדית או צילום חוזר מוסיפים, ולא דורסים את מה שכבר הגיע.
    const docs = (reqRow.identity_docs ?? {}) as Record<string, unknown[]>;
    const mine = Array.isArray(docs[person]) ? [...docs[person]] : [];
    mine.push({ documentId: docId, docKind, fileName: file.name || "", at: new Date().toISOString() });
    const { error: patchErr } = await admin
      .from("representation_requests")
      .update({ identity_docs: { ...docs, [person]: mine } })
      .eq("id", reqRow.id);
    if (patchErr) return json({ error: "link_failed", detail: patchErr.message }, 500);

    return json({ ok: true, documentId: docId, person, docKind, count: mine.length });
  } catch (e) {
    return json({ error: "unexpected", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
