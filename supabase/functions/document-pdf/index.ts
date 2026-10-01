// ─── document-pdf — PDF מוכן ברקע לכל צילום מזהה של בקשה (210) ─────────────
// נקרא מהמסד (טריגר על שיוך/החלפת צילום, ו-cron כל 5 דקות) עם סוד, או מהמשרד
// («נסה שוב») עם ההתחברות שלו. בונה את מה שממתין, באותה ליבה בדיוק כמו הדפדפן
// והעובד (_shared/imageToPdfCore.ts).
// ‼ השרת ממיר JPG/PNG/PDF. HEIC/WebP וכד' ⇒ 'needs_browser' (הדפדפן של המשרד
// משלים אוטומטית). קובץ פגום ⇒ 'failed' עם הסבר. תקלה זמנית ⇒ ניסיון נוסף.
// ‼ לא נוגע באישור הלקוח ולא בהגשה — רק מכין קובץ ומסמן שהוא מוכן.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, degrees, drawImage } from "https://esm.sh/pdf-lib@1.17.1";
import UPNG from "https://esm.sh/@pdf-lib/upng@1.0.1";
import {
  buildDocumentPdfWith, ImageConversionError, SHAAM_UPLOAD_MAX_BYTES, type PdfLib,
} from "../_shared/imageToPdfCore.ts";

const PDF_LIB = { PDFDocument, degrees, UPNG, drawImageOp: drawImage } as unknown as PdfLib;
const DOC_BUCKET = "client-documents";
const SLOT_LABEL: Record<string, string> = { idOrLicense: "תעודה מזהה", passport: "דרכון" };

interface ClaimedBuild {
  id: string; userId: string; clientId: string; fingerprint: string;
  person: string; slot: string; docKind: string | null; personName: string;
  documents: { id: string; storagePath: string; fileName: string; fileType: string }[];
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-document-pdf-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const requestId = String(body?.requestId ?? "").trim();
    if (!requestId) return json({ ok: false, error: "bad_request" }, 400);

    // ── הרשאה: סוד מהמסד, או המשרד שהבקשה שלו ──
    const secret = req.headers.get("x-document-pdf-secret");
    let allowed = false;
    if (secret) {
      const { data } = await admin.rpc("verify_document_pdf_secret", { p: secret });
      allowed = data === true;
    } else {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null };
      const uid = u?.user?.id;
      if (uid) {
        const { data: rr } = await admin.from("representation_requests").select("user_id").eq("id", requestId).maybeSingle();
        allowed = rr?.user_id === uid;
      }
    }
    if (!allowed) return json({ ok: false, error: "forbidden" }, 403);

    await admin.rpc("sync_document_pdf_builds", { p_request_id: requestId });
    const { data: claimed, error: claimErr } = await admin.rpc("claim_document_pdf_builds", { p_request_id: requestId });
    if (claimErr) return json({ ok: false, error: claimErr.message }, 500);
    const builds = (claimed ?? []) as ClaimedBuild[];

    const results: { id: string; status: string; detail?: string }[] = [];
    for (const b of builds) {
      const fail = async (status: "needs_browser" | "failed" | "retry", code: string, message: string, next: string) => {
        await admin.rpc("fail_document_pdf_build", {
          p_id: b.id, p_fingerprint: b.fingerprint, p_code: code, p_message: message, p_next: next, p_status: status,
        });
        results.push({ id: b.id, status, detail: message });
      };
      try {
        const parts: Uint8Array[] = [];
        for (const d of b.documents) {
          const { data: file, error } = await admin.storage.from(DOC_BUCKET).download(d.storagePath);
          if (error || !file) throw new Error(`download_failed: ${error?.message ?? ""}`);
          parts.push(new Uint8Array(await file.arrayBuffer()));
        }
        if (parts.length !== b.documents.length || parts.length === 0) {
          await fail("failed", "missing_source", "אחד הקבצים לא נמצא באחסון.", "להעלות את הצילום מחדש.");
          continue;
        }
        const pdf = await buildDocumentPdfWith(PDF_LIB, parts, { maxBytes: SHAAM_UPLOAD_MAX_BYTES });
        const path = `${b.userId}/${b.clientId}/${b.id}`;
        const { error: upErr } = await admin.storage.from(DOC_BUCKET)
          .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw new Error(`upload_failed: ${upErr.message}`);
        const who = b.personName ? ` - ${b.personName}` : "";
        const { data: done, error: doneErr } = await admin.rpc("complete_document_pdf_build", {
          p_id: b.id, p_fingerprint: b.fingerprint, p_storage_path: path,
          p_file_name: `${SLOT_LABEL[b.slot] ?? "מסמך"}${who} (PDF).pdf`,
          p_bytes: pdf.bytes.byteLength, p_pages: pdf.pageCount, p_lossless: pdf.lossless,
          p_notes: pdf.notes, p_built_by: "server",
        });
        if (doneErr) throw new Error(doneErr.message);
        results.push({ id: b.id, status: done?.ok ? "ready" : String(done?.error ?? "not_completed") });
      } catch (e) {
        if (e instanceof ImageConversionError) {
          // מה שהדפדפן כן יודע: פענוח (HEIC/WebP…) וסולם גודל גלוי. כל השאר — כשל אמיתי.
          if (e.code === "needs_decoder" || e.code === "too_large") {
            await fail("needs_browser", e.code, e.message, "ההמרה תושלם אוטומטית כשדף הבקשה ייפתח במשרד.");
          } else {
            const which = typeof e.partIndex === "number" && b.documents.length > 1
              ? ` (קובץ ${e.partIndex + 1} מתוך ${b.documents.length}: ${b.documents[e.partIndex]?.fileName ?? ""})` : "";
            await fail("failed", e.code, e.message + which, e.next);
          }
        } else {
          await fail("retry", "transient", "תקלה זמנית בהכנת ה-PDF.", "ניסיון נוסף יתבצע אוטומטית.");
        }
      }
    }
    return json({ ok: true, results });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
