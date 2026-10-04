// ─── דף ההמרה של עובד האוטומציה (211) ──────────────────────────────────────
// העובד במחשב המשרד פותח את הדף הזה ב-Chrome ללא-ראש ומעביר לו משימה: כתובות
// הורדה חתומות למקורות, וכתובות העלאה חתומות לשתי הגרסאות. ההמרה כאן היא בדיוק
// הקוד של האתר (buildDocumentPdfVersions) — אין מימוש שני שיכול להיפרד.
// ‼ הקבצים לא עוברים דרך העובד: הדף מוריד ומעלה בעצמו, והעובד מקבל רק תוצאה.
// ‼ אין כאן התחברות, אין גישה למסד, ואין ממשק — רק המרה של מה שהעובד הביא.

import {
  buildDocumentPdfVersions, ImageConversionError, SHAAM_UPLOAD_MAX_BYTES, type DocumentPdfResult,
} from '../utils/imageToPdf';
import { readForm2279Layout } from '../utils/form2279Layout';
import { verifyForm2279Layout } from '../features/representation/shaamRepresentation';

export const CONVERTER_VERSION = 1;

export interface ConverterJob {
  sources: { url: string; fileName?: string }[];
  uploads: { original: string; submission: string };
  maxBytes?: number;
  originalMaxBytes?: number;
}

type PartMeta = Pick<DocumentPdfResult['parts'][number], 'format' | 'from' | 'pages' | 'width' | 'height' | 'frame' | 'sourceIndex' | 'flattened'>;

export type ConverterResult =
  | {
      ok: true; ms: number;
      original: {
        bytes: number; pages: number; lossless: boolean; notes: string[]; parts: PartMeta[];
        /** המקור עצמו נדחס (גדול מדי לשמירה בלי אובדן) — אזורים להשוואה מול הצילום. */
        review?: { mode: string; focus: unknown[]; pagesMeta: unknown[] };
      };
      submission: null | {
        bytes: number; pages: number; mode: string; needsReview: boolean; notes: string[];
        focus: unknown[]; pagesMeta: unknown[]; limit: number;
      };
    }
  | { ok: false; ms: number; code: string; message: string; next: string; partIndex?: number; transient: boolean };

class Transient extends Error {}

async function download(url: string): Promise<Uint8Array> {
  let res: Response;
  try { res = await fetch(url, { cache: 'no-store' }); }
  catch { throw new Transient('הורדת הקובץ נכשלה (רשת).'); }
  if (!res.ok) throw new Transient(`הורדת הקובץ נכשלה (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

async function upload(url: string, bytes: Uint8Array): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
      body: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    });
  } catch { throw new Transient('שמירת ה-PDF נכשלה (רשת).'); }
  if (!res.ok) throw new Transient(`שמירת ה-PDF נכשלה (${res.status}).`);
}

const partsMeta = (r: DocumentPdfResult): PartMeta[] => r.parts.map(p => ({
  format: p.format, from: p.from, pages: p.pages, width: p.width, height: p.height,
  frame: p.frame, sourceIndex: p.sourceIndex, flattened: p.flattened,
}));

export async function runConverterJob(job: ConverterJob): Promise<ConverterResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  try {
    const files: Uint8Array[] = [];
    for (const s of job.sources) files.push(await download(s.url));
    console.debug(`pdf: downloaded ${files.length} · ${ms()}ms`);
    const v = await buildDocumentPdfVersions(files, { maxBytes: job.maxBytes, originalMaxBytes: job.originalMaxBytes });
    console.debug(`pdf: built ${v.original.bytes.byteLength}${v.submission ? ` + ${v.submission.result.bytes.byteLength}` : ''} · ${ms()}ms`);
    await upload(job.uploads.original, v.original.bytes);
    if (v.submission) await upload(job.uploads.submission, v.submission.result.bytes);
    console.debug(`pdf: uploaded · ${ms()}ms`);
    return {
      ok: true, ms: ms(),
      original: {
        bytes: v.original.bytes.byteLength, pages: v.original.pageCount, lossless: v.original.lossless,
        notes: v.original.notes, parts: partsMeta(v.original),
        ...(v.originalReview ? { review: { mode: v.originalReview.mode, focus: v.originalReview.focus, pagesMeta: v.originalReview.pagesMeta } } : {}),
      },
      submission: v.submission ? {
        bytes: v.submission.result.bytes.byteLength, pages: v.submission.result.pageCount,
        mode: v.submission.mode, needsReview: v.submission.needsReview, notes: v.submission.result.notes,
        focus: v.submission.focus, pagesMeta: v.submission.pagesMeta, limit: job.maxBytes ?? SHAAM_UPLOAD_MAX_BYTES,
      } : null,
    };
  } catch (e) {
    if (e instanceof Transient) return { ok: false, ms: ms(), code: 'transient', message: e.message, next: 'ניסיון נוסף יתבצע אוטומטית.', transient: true };
    if (e instanceof ImageConversionError) {
      // מפענח שלא נטען (רשת) — זמני. כל השאר — תכונה של הקובץ.
      return { ok: false, ms: ms(), code: e.code, message: e.message, next: e.next, partIndex: e.partIndex, transient: e.code === 'needs_decoder' };
    }
    return { ok: false, ms: ms(), code: 'unexpected', message: e instanceof Error ? e.message : String(e), next: 'ניסיון נוסף יתבצע אוטומטית.', transient: true };
  }
}

/**
 * ‼ 218 · בדיקת התאמה של טופס 2279 שהגיע משע״ם — אותו קוד בדיוק כמו בדפדפן המשרד
 * (readForm2279Layout + verifyForm2279Layout). העובד מריץ אותה מיד כשהטופס מגיע, והשרת
 * מכין את מקומות החתימה רק כשהיא עברה. הקובץ מגיע מהעובד (base64), לא נשמר כאן.
 */
export async function verifyForm2279(base64: string): Promise<{ ok: boolean; problems: string[]; numPages: number }> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try {
    const layout = await readForm2279Layout(bytes);
    const v = verifyForm2279Layout(layout);
    return { ok: v.ok, problems: v.problems, numPages: layout.numPages };
  } catch {
    return { ok: false, problems: ['form_not_read'], numPages: 0 };
  }
}

declare global {
  interface Window { pivoPdfConverter?: { version: number; run: typeof runConverterJob; verifyForm2279?: typeof verifyForm2279 } }
}
window.pivoPdfConverter = { version: CONVERTER_VERSION, run: runConverterJob, verifyForm2279 };
