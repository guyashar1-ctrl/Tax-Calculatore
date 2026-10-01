// ─── document-pdf — PDF מוכן ברקע לכל צילום מזהה של בקשה (211) ─────────────
// נקרא מהמסד (טריגר על שיוך/החלפת צילום, ו-cron כל 5 דקות) עם סוד, או מהמשרד
// עם ההתחברות שלו. בונה את מה שממתין, באותה ליבה בדיוק כמו Chrome והעובד
// (_shared/imageToPdfCore.ts).
// ‼ השרת בונה רק את המקרה הפשוט: JPG/PNG/PDF שנשמרים כמו שהם (בלי אובדן) ועומדים
// במגבלת שע״ם — המקור הוא גם קובץ ההגשה. כל השאר עובר לעובד האוטומציה במחשב
// המשרד ('needs_worker'): HEIC/WebP/AVIF/GIF/BMP, קבצים עם כמה פריימים, PNG ענק
// (פענוח כבד מדי לשרת), ומה שחורג מ-30MB (דחיסה דורשת Chrome).
// קובץ פגום / פורמט לא נתמך ⇒ 'failed' עם הסבר. תקלה זמנית ⇒ ניסיון נוסף.
// ‼ לא נוגע באישור הלקוח ולא בהגשה — רק מכין קובץ ומסמן שהוא מוכן.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, degrees, drawImage } from "https://esm.sh/pdf-lib@1.17.1";
import UPNG from "https://esm.sh/@pdf-lib/upng@1.0.1";
import {
  buildDocumentPdfWith, ImageConversionError, SHAAM_UPLOAD_MAX_BYTES, sniffFormat, needsBrowserDecoder,
  animatedFrameCount, pngSize, FORMAT_NAME, type PdfLib,
} from "../_shared/imageToPdfCore.ts";

const PDF_LIB = { PDFDocument, degrees, UPNG, drawImageOp: drawImage } as unknown as PdfLib;
const DOC_BUCKET = "client-documents";
const SLOT_LABEL: Record<string, string> = { idOrLicense: "תעודה מזהה", passport: "דרכון" };
/** PNG מעל זה — פענוח וקידוד מחדש כבדים מדי למגבלת המעבד של השרת; העובד ממיר. */
const SERVER_PNG_MAX_PIXELS = 12_000_000;

interface ClaimedBuild {
  id: string; userId: string; clientId: string; fingerprint: string;
  paths: { original: string; submission: string };
  person: string; slot: string; docKind: string | null; personName: string;
  documents: { id: string; storagePath: string; fileName: string; fileType: string }[];
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-document-pdf-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

class ToWorker extends Error {}

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
      const fail = async (status: "needs_worker" | "failed" | "retry", code: string, message: string, next: string) => {
        await admin.rpc("fail_document_pdf_build", {
          p_id: b.id, p_fingerprint: b.fingerprint, p_code: code, p_message: message, p_next: next, p_status: status, p_by: "server",
        });
        results.push({ id: b.id, status, detail: message });
      };
      const which = (i: number | undefined) => typeof i === "number" && b.documents.length > 1
        ? ` (קובץ ${i + 1} מתוך ${b.documents.length}: ${b.documents[i]?.fileName ?? ""})` : "";
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
        // ── מה השרת לא בונה ──
        for (let i = 0; i < parts.length; i++) {
          const f = sniffFormat(parts[i]);
          if (f === "tiff" || f === "svg" || f === "unknown") {
            throw Object.assign(new ImageConversionError(
              f === "tiff" ? "קובץ TIFF אינו נתמך להמרה." : f === "svg" ? "קובץ SVG הוא שרטוט ולא צילום, ואי אפשר להגיש אותו כמסמך."
                : "הקובץ אינו תמונה או PDF שאפשר להמיר.",
              "unsupported", f === "tiff" ? "לשמור מהסורק כ-PDF או כ-JPG ולהעלות שוב." : "להעלות צילום (JPG, PNG, HEIC, WebP) או קובץ PDF."),
              { partIndex: i });
          }
          if (needsBrowserDecoder(f) || animatedFrameCount(parts[i], f) > 1) throw new ToWorker(`${FORMAT_NAME[f]}`);
          if (f === "png") {
            const dim = pngSize(parts[i]);
            if (dim && dim.w * dim.h > SERVER_PNG_MAX_PIXELS) throw new ToWorker("PNG גדול");
          }
        }
        const pdf = await buildDocumentPdfWith(PDF_LIB, parts);
        // ‼ חורג מ-30MB ⇒ צריך גרסת הגשה נפרדת (דחיסה) — רק ב-Chrome, אצל העובד.
        if (pdf.bytes.byteLength > SHAAM_UPLOAD_MAX_BYTES) throw new ToWorker("too_large");
        const { error: upErr } = await admin.storage.from(DOC_BUCKET)
          .upload(b.paths.original, pdf.bytes, { contentType: "application/pdf", upsert: true });
        if (upErr) throw new Error(`upload_failed: ${upErr.message}`);
        const who = b.personName ? ` - ${b.personName}` : "";
        const { data: done, error: doneErr } = await admin.rpc("complete_document_pdf_build", {
          p_id: b.id, p_fingerprint: b.fingerprint, p_built_by: "server",
          p_result: {
            original: {
              path: b.paths.original, fileName: `${SLOT_LABEL[b.slot] ?? "מסמך"}${who} (PDF).pdf`,
              bytes: pdf.bytes.byteLength, pages: pdf.pageCount, lossless: pdf.lossless, notes: pdf.notes,
              parts: pdf.parts.map((p) => ({ format: p.format, pages: p.pages, width: p.width, height: p.height })),
            },
            submission: null,
          },
        });
        if (doneErr) throw new Error(doneErr.message);
        if (!done?.ok) {
          // stale ⇒ המקור התחלף באמצע; הקובץ שנשמר בנתיב של הטביעה הישנה אינו בשימוש — מוחקים.
          await admin.storage.from(DOC_BUCKET).remove([b.paths.original]);
          results.push({ id: b.id, status: String(done?.error ?? "not_completed") });
          continue;
        }
        const old = (done.oldPaths ?? []) as string[];
        if (old.length) await admin.storage.from(DOC_BUCKET).remove(old);
        results.push({ id: b.id, status: "ready" });
      } catch (e) {
        if (e instanceof ToWorker) {
          await fail("needs_worker", "needs_worker", "", "");
        } else if (e instanceof ImageConversionError) {
          if (e.code === "needs_decoder" || e.code === "too_large") await fail("needs_worker", e.code, "", "");
          else await fail("failed", e.code, e.message + which(e.partIndex), e.next);
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
