// Edge Function: automation-worker — נקודת הכניסה היחידה של העובד המקומי.
//
// ‼ יסוד האוטומציה הכללי (לא ספציפי לשע״ם), ראה docs/PIVO-AUTOMATION-FOUNDATION.html
// ו-supabase/150-automation-jobs.sql לסמנטיקה המלאה. שש פעולות — claim /
// heartbeat / complete / fail / status / progress / resolve_needs_human —
// כל אחת עוטפת RPC אחד ב-security definer. progress/resolve_needs_human
// נוספו ב-168 להכנת סביבת עבודה לשע״ם (warm-up היברידי, פרק 16).
//
// ‼ 203 · מחשבי עבודה: אימות מועדף = x-worker-id + x-worker-token (אסימון אישי
// לכל מחשב, נשמר במסד רק כ-sha256). אז user_id/worker_id **נגזרים בשרת** ולא
// נלקחים מהגוף. x-worker-instance מזהה את התהליך הרץ — מופע שני של אותה זהות
// לא תופס עבודה (automation_worker_touch). op=register פודה קוד צימוד חד-פעמי.
// הסוד המשותף הישן נשאר לתאימות, רק לזהות שעדיין לא נרשמה, וניתן לכיבוי
// (AUTOMATION_LEGACY_SECRET=off).
// ‼ אימות (ישן): x-worker-secret בלבד, מאומת מול verify_automation_worker_secret
// (Vault). לא Authorization/service-role — הסוד הזה מוגבל לתפיסה/דיווח על
// automation_jobs ותו לא, ולכן פשרה עליו לא חושפת את שאר המסד. ה-service-role
// עצמו יושב רק כאן, על השרת, ולעולם לא מגיע לתהליך העובד על מחשב המשרד.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import {
  documentPartsToPdfWith, ImageConversionError, type PdfLib,
} from "../_shared/imageToPdfCore.ts";

// ‼ 194: שתי פעולות מסמך. הן הכרחיות לזרימת הייצוג בשע״ם — הטופס שמופק שם
// חייב להגיע לתיק הלקוח, והטופס החתום חייב לחזור לשם — **בלי** מסלול
// «הורד לשולחן העבודה, אתר את הקובץ, העלה ידנית». הגבול שמונע מהן להיות
// «דלת שירות למסד»: שתיהן מורשות אך ורק על הלקוח של job שהעובד **מחזיק
// עכשיו** (claimed_by = workerId, status = running) — ראה
// automation_job_document_context.
type Op =
  | "register"
  | "claim" | "heartbeat" | "complete" | "fail" | "status" | "progress" | "resolve_needs_human"
  | "put_document" | "get_document" | "get_identity_document";

interface Body {
  op: Op;
  /** register · קוד הצימוד שהמשתמש קיבל ב-PIVO. */
  code?: string;
  label?: string;
  /** register · רישום-מחדש של זהות קיימת של אותו משתמש (הגירה). */
  existingWorkerId?: string;
  userId?: string;
  workerId: string;
  jobId?: string;
  actionTypes?: string[];
  leaseSeconds?: number;
  workerVersion?: string;
  result?: Record<string, unknown>;
  artifacts?: unknown[];
  errorCode?: string;
  errorDetail?: string;
  needsHuman?: string;
  /** מצב חיבור לרשויות — דגלים בלבד, לעולם לא מידע אימות. */
  status?: Record<string, unknown>;
  /** 168: התקדמות עמידה לפי capability, ראה update_automation_job_progress. */
  expectedRevision?: number;
  progress?: Record<string, unknown>;
  /** 194 · put_document/get_document — ראה ההערה ליד Op. */
  documentId?: string;
  fileName?: string;
  /** תוכן הקובץ ב-base64. רק application/pdf נתמך בנתיב הזה. */
  contentBase64?: string;
  description?: string;
  linkedTo?: string;
  linkedLabel?: string;
  /** 204 · get_identity_document — הת.ז. מכותרת המסך בשע״ם, וסוג השורה. */
  entityId?: string;
  slotKind?: string;
}

// ‼ 204 · pdf-lib של Deno מוזרק לליבה המשותפת — אותו קוד כמו בדפדפן.
const PDF_LIB = { PDFDocument, degrees } as unknown as PdfLib;
const SLOT_KIND_LABEL: Record<string, string> = {
  idOrLicense: "צילום תעודת זהות או רישיון נהיגה",
  passport: "צילום דרכון",
};

const DOC_BUCKET = "client-documents";
/** תקרה שמרנית: טופס 2279 שנצפה הוא ~60KB, וחתום ~740KB. */
const MAX_DOC_BYTES = 20 * 1024 * 1024;

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes: number): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-worker-secret, x-worker-id, x-worker-token, x-worker-instance",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.op) return json({ ok: false, error: "bad_request" }, 400);

    // ── 203 · רישום מחשב עבודה: קוד צימוד ⇒ זהות + אסימון (מוחזר פעם אחת) ──
    if (body.op === "register") {
      if (!body.code) return json({ ok: false, error: "bad_request: code required" }, 400);
      const token = randomToken(32);
      const newId = "ws-" + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data, error } = await admin.rpc("redeem_workstation_pairing", {
        p_code: body.code,
        p_token_hash: await sha256Hex(token),
        p_new_worker_id: newId,
        p_existing_worker_id: body.existingWorkerId ?? null,
        p_label: body.label ?? null,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data?.ok) return json({ ok: false, error: data?.error ?? "register_failed" }, 400);
      return json({ ok: true, workerId: data.workerId, userId: data.userId, token });
    }

    const instance = req.headers.get("x-worker-instance") || null;
    const tokenHeader = req.headers.get("x-worker-token") || "";
    if (tokenHeader) {
      const wid = req.headers.get("x-worker-id") || "";
      const { data: auth, error: authErr } = await admin.rpc("authenticate_workstation", { p_worker_id: wid, p_token: tokenHeader });
      if (authErr || !auth?.ok) return json({ ok: false, error: "unauthorized" }, 401);
      // ‼ הזהות נכפית מהשרת — מה שהגוף אומר על userId/workerId לא משנה.
      body.workerId = auth.workerId;
      body.userId = auth.userId;
    } else {
      if ((Deno.env.get("AUTOMATION_LEGACY_SECRET") || "").toLowerCase() === "off") {
        return json({ ok: false, error: "legacy_secret_disabled" }, 401);
      }
      const secret = req.headers.get("x-worker-secret") || "";
      if (!secret) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: validSecret, error: secretErr } = await admin.rpc("verify_automation_worker_secret", { p: secret });
      if (secretErr || validSecret !== true) return json({ ok: false, error: "unauthorized" }, 401);
      if (!body.workerId) return json({ ok: false, error: "bad_request" }, 400);
      // ‼ זהות שנרשמה עם אסימון לא מתחזה דרך הסוד המשותף.
      const { data: needsToken } = await admin.rpc("workstation_requires_token", { p_worker_id: body.workerId });
      if (needsToken === true) return json({ ok: false, error: "workstation_requires_token" }, 401);
    }
    if (!body.workerId) return json({ ok: false, error: "bad_request" }, 400);

    if (body.op === "claim") {
      if (!body.userId) return json({ ok: false, error: "bad_request: userId required" }, 400);
      const { data, error } = await admin.rpc("claim_next_automation_job", {
        p_user_id: body.userId,
        p_worker_id: body.workerId,
        p_action_types: body.actionTypes ?? null,
        p_lease_seconds: body.leaseSeconds ?? 60,
        ...(instance ? { p_instance: instance } : {}),
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      // 203 · {blocked:'instance_conflict'|...} — לא משימה.
      if (data && typeof data === "object" && "blocked" in data) return json({ ok: true, job: null, blocked: data.blocked });
      return json({ ok: true, job: data ?? null });
    }

    if (body.op === "heartbeat") {
      if (!body.userId) return json({ ok: false, error: "bad_request: userId required" }, 400);
      const { data, error } = await admin.rpc("heartbeat_automation_job", {
        p_user_id: body.userId,
        p_worker_id: body.workerId,
        p_job_id: body.jobId ?? null,
        p_lease_seconds: body.leaseSeconds ?? 60,
        p_worker_version: body.workerVersion ?? null,
        ...(instance ? { p_instance: instance } : {}),
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "status") {
      if (!body.userId) return json({ ok: false, error: "bad_request: userId required" }, 400);
      const { data, error } = await admin.rpc("report_worker_status", {
        p_user_id: body.userId,
        p_worker_id: body.workerId,
        p_status: body.status ?? {},
        ...(instance ? { p_instance: instance } : {}),
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "complete") {
      if (!body.jobId) return json({ ok: false, error: "bad_request: jobId required" }, 400);
      const { data, error } = await admin.rpc("complete_automation_job", {
        p_worker_id: body.workerId,
        p_job_id: body.jobId,
        p_result: body.result ?? {},
        p_artifacts: body.artifacts ?? [],
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "progress") {
      if (!body.jobId || body.expectedRevision == null) {
        return json({ ok: false, error: "bad_request: jobId+expectedRevision required" }, 400);
      }
      const { data, error } = await admin.rpc("update_automation_job_progress", {
        p_worker_id: body.workerId,
        p_job_id: body.jobId,
        p_expected_revision: body.expectedRevision,
        p_progress: body.progress ?? {},
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "resolve_needs_human") {
      if (!body.jobId) return json({ ok: false, error: "bad_request: jobId required" }, 400);
      const { data, error } = await admin.rpc("resolve_needs_human_job", {
        p_worker_id: body.workerId,
        p_job_id: body.jobId,
        p_lease_seconds: body.leaseSeconds ?? 60,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    // ── 194 · מסמכים, בגבול ה-job שהעובד מחזיק ──────────────────────────────
    if (body.op === "put_document" || body.op === "get_document") {
      if (!body.jobId || !body.documentId) {
        return json({ ok: false, error: "bad_request: jobId+documentId required" }, 400);
      }
      const { data: ctx, error: ctxErr } = await admin.rpc("automation_job_document_context", {
        p_worker_id: body.workerId, p_job_id: body.jobId,
      });
      if (ctxErr) return json({ ok: false, error: ctxErr.message }, 500);
      // ‼ אין job מוחזק ⇒ אין הרשאה. לא «אולי בכל זאת»: זו כל ההגנה כאן.
      if (!ctx?.ok) return json({ ok: false, error: ctx?.error ?? "not_owner_or_finished" }, 403);
      const userId = ctx.user_id as string;
      const clientId = ctx.client_id as string | null;
      if (!clientId) return json({ ok: false, error: "job_has_no_client" }, 400);

      const path = `${userId}/${clientId}/${body.documentId}`;

      if (body.op === "get_document") {
        // ‼ מאמתים שהמסמך באמת שייך ללקוח של ה-job — מזהה שהומצא לא יחזיר
        // קובץ של לקוח אחר, גם אם ה-storage_path שלו נראה דומה.
        const { data: row, error: rowErr } = await admin.from("documents")
          .select("id, storage_path, file_name, file_type, client_id, user_id")
          .eq("id", body.documentId).eq("user_id", userId).eq("client_id", clientId).maybeSingle();
        if (rowErr) return json({ ok: false, error: rowErr.message }, 500);
        if (!row) return json({ ok: false, error: "document_not_found" }, 404);
        const { data: file, error: dlErr } = await admin.storage.from(DOC_BUCKET).download(row.storage_path);
        if (dlErr || !file) return json({ ok: false, error: dlErr?.message ?? "download_failed" }, 500);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > MAX_DOC_BYTES) return json({ ok: false, error: "document_too_large" }, 413);
        return json({
          ok: true, fileName: row.file_name, fileType: row.file_type,
          contentBase64: encodeBase64(bytes),
        });
      }

      if (!body.contentBase64) return json({ ok: false, error: "bad_request: contentBase64 required" }, 400);
      let bytes: Uint8Array;
      try { bytes = decodeBase64(body.contentBase64); }
      catch { return json({ ok: false, error: "bad_base64" }, 400); }
      if (bytes.length === 0) return json({ ok: false, error: "empty_document" }, 400);
      if (bytes.length > MAX_DOC_BYTES) return json({ ok: false, error: "document_too_large" }, 413);
      // ‼ PDF בלבד בנתיב הזה, ונבדק מהתוכן ולא מהשם.
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        return json({ ok: false, error: "not_a_pdf" }, 400);
      }

      const { error: upErr } = await admin.storage.from(DOC_BUCKET)
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (upErr) return json({ ok: false, error: upErr.message }, 500);

      // ‼ D4 (179): documents.label_id הוא NOT NULL. תווית ייעודית לטופסי
      // ייפוי כוח, ולא «לבדיקה» — הקובץ הזה אינו ממתין להחלטה של אדם.
      const { data: labelId, error: labelErr } = await admin.rpc("ensure_automation_document_label", {
        p_user_id: userId, p_name: "ייפוי כוח",
      });
      if (labelErr) {
        await admin.storage.from(DOC_BUCKET).remove([path]);
        return json({ ok: false, error: labelErr.message }, 500);
      }

      const { error: docErr } = await admin.from("documents").upsert({
        id: body.documentId,
        user_id: userId,
        client_id: clientId,
        storage_path: path,
        file_name: body.fileName || "ייפוי כוח.pdf",
        file_type: "application/pdf",
        file_size: bytes.length,
        category: "other",
        year: "general",
        label_id: labelId,
        description: body.description ?? "טופס ייפוי כוח - לחתימה",
        notes: "הובא אוטומטית משע״ם",
        linked_to: body.linkedTo ?? null,
        linked_label: body.linkedLabel ?? null,
        status: "received",
      }, { onConflict: "id" });
      if (docErr) {
        await admin.storage.from(DOC_BUCKET).remove([path]);
        return json({ ok: false, error: docErr.message }, 500);
      }
      return json({ ok: true, documentId: body.documentId, size: bytes.length });
    }

    // ── 204 · המסמך המזהה ששע״ם דורשת — כ-PDF אחד ────────────────────────────
    // ‼ הבחירה בשרת (automation_job_identity_document): הת.ז. שבכותרת המסך ⇒
    // אדם אחד בכרטיס ⇒ רק המסמכים הרשומים עליו, מהסוג שהשורה מקבלת. בגבול
    // המשימה שהעובד מחזיק עכשיו. אין נפילה לאדם אחר ואין «הראשון שנמצא».
    if (body.op === "get_identity_document") {
      if (!body.jobId || !body.entityId || !body.slotKind) {
        return json({ ok: false, error: "bad_request: jobId+entityId+slotKind required" }, 400);
      }
      const { data: sel, error: selErr } = await admin.rpc("automation_job_identity_document", {
        p_worker_id: body.workerId, p_job_id: body.jobId,
        p_entity_id: body.entityId, p_slot_kind: body.slotKind,
      });
      if (selErr) return json({ ok: false, error: selErr.message }, 500);
      if (!sel?.ok) {
        if (sel?.error === "not_owner_or_finished") return json({ ok: false, error: sel.error }, 403);
        // missing / needs_document_assignment / unsupported_kind — תשובה עסקית, לא תקלה.
        return json({ ok: false, error: sel?.error ?? "selection_failed", person: sel?.person ?? null, personName: sel?.personName ?? null });
      }
      const docs = (sel.documents ?? []) as { documentId: string; fileName: string; storagePath: string }[];
      const parts: Uint8Array[] = [];
      for (const d of docs) {
        const { data: file, error: dlErr } = await admin.storage.from(DOC_BUCKET).download(d.storagePath);
        if (dlErr || !file) return json({ ok: false, error: "download_failed", detail: dlErr?.message ?? "" }, 500);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > MAX_DOC_BYTES) return json({ ok: false, error: "document_too_large" }, 413);
        parts.push(bytes);
      }
      let pdf: { bytes: Uint8Array; pageCount: number };
      try {
        pdf = await documentPartsToPdfWith(PDF_LIB, parts);
      } catch (e) {
        // ‼ HEIC/WEBP/פגום — לא מורידים ולידציה כדי שיעלה משהו.
        if (e instanceof ImageConversionError) {
          return json({ ok: false, error: "not_pdf_convertible", detail: e.message, person: sel.person, personName: sel.personName });
        }
        throw e;
      }
      if (pdf.bytes.length > MAX_DOC_BYTES) return json({ ok: false, error: "document_too_large" }, 413);
      const who = String(sel.personName ?? "").trim();
      const fileName = `${SLOT_KIND_LABEL[body.slotKind] ?? "מסמך מזהה"}${who ? ` - ${who}` : ""}.pdf`;
      const sourceIds = docs.map((d) => d.documentId);
      // ‼ 208 · ה-PDF שנבנה מתמונה (או משני צדדים) נשמר בתיק **לצד** המקור, עם
      // המקורות שלו — אותו קובץ שהמשרד רואה ויכול להוריד להעלאה ידנית. מקור
      // שהוא כבר PDF יחיד — אין מה לשמור.
      let derivedDocumentId: string | null = null;
      const onlyPdf = docs.length === 1 && parts[0][0] === 0x25 && parts[0][1] === 0x50 && parts[0][2] === 0x44 && parts[0][3] === 0x46;
      if (!onlyPdf && sel.userId && sel.clientId) {
        derivedDocumentId = `pdf-${(await sha256Hex([...sourceIds].sort().join("|"))).slice(0, 24)}`;
        const path = `${sel.userId}/${sel.clientId}/${derivedDocumentId}`;
        const { error: upErr } = await admin.storage.from(DOC_BUCKET)
          .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
        if (!upErr) {
          const { data: src } = await admin.from("documents").select("label_id, category").eq("id", sourceIds[0]).maybeSingle();
          const { error: docErr } = await admin.from("documents").upsert({
            id: derivedDocumentId, user_id: sel.userId, client_id: sel.clientId, storage_path: path,
            file_name: fileName, file_type: "application/pdf", file_size: pdf.bytes.length,
            category: src?.category ?? "id_card", year: "general", label_id: src?.label_id,
            description: "PDF שנוצר אוטומטית מהצילום לרשות המסים",
            notes: `נוצר אוטומטית מ-${docs.map((d) => d.fileName).join(" + ")}`,
            source_document_ids: sourceIds, status: "received",
          }, { onConflict: "id" });
          if (docErr) derivedDocumentId = null;
        } else {
          derivedDocumentId = null;
        }
      }
      return json({
        ok: true,
        person: sel.person, personName: sel.personName ?? null, docKind: sel.docKind,
        fileName,
        pageCount: pdf.pageCount,
        sourceDocumentIds: sourceIds,
        derivedDocumentId,
        contentBase64: encodeBase64(pdf.bytes),
      });
    }

    if (body.op === "fail") {
      if (!body.jobId || !body.errorCode) return json({ ok: false, error: "bad_request: jobId+errorCode required" }, 400);
      const { data, error } = await admin.rpc("fail_automation_job", {
        p_worker_id: body.workerId,
        p_job_id: body.jobId,
        p_error_code: body.errorCode,
        p_error_detail: body.errorDetail ?? null,
        p_needs_human: body.needsHuman ?? null,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    return json({ ok: false, error: "unknown_op" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
