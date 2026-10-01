// ─── 208 · גרסת PDF של מסמך — יכולת משותפת של שכבת המסמכים ─────────────────
// כשהיעד דורש PDF (שע״ם מקבלת רק PDF), PIVO בונה אותו לבד: צילום JPG/PNG ⇒
// עמוד; שני צדי תעודה ⇒ PDF אחד, לפי הסדר שבו נרשמו. ה-PDF נשמר **לצד**
// המקור (source_document_ids), וההמרה הבאה מוצאת אותו במקום לבנות שוב.
// ‼ אותו מזהה כמו בשרת (automation-worker, get_identity_document): pdf-<sha256 של
// המקורות הממוינים> — שני המסלולים מייצרים אותה רשומה ולא שתיים.
// ‼ כשל בהמרה (HEIC/WEBP/קובץ פגום) או חריגה ממגבלת היעד — שגיאה גלויה, בלי
// קובץ חלקי.

import type { StoredDoc } from '../hooks/useDocumentStore';
import { buildDocumentPdf, isPdfBytes, ImageConversionError } from './imageToPdf';

/** שע״ם: shaam-file-upload חוסם מעל 30MB לקובץ, ומקבל PDF בלבד. */
export const SHAAM_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

export interface DocDbForPdf {
  getDoc(id: string): Promise<StoredDoc | undefined>;
  getDocsByClient(clientId: string): Promise<StoredDoc[]>;
  saveDoc(doc: StoredDoc): Promise<void>;
}

export type PdfVersionResult =
  | { ok: true; doc: StoredDoc; created: boolean; pageCount?: number }
  | { ok: false; error: string };

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pdfVersionId(sourceIds: string[]): Promise<string> {
  return `pdf-${(await sha256Hex([...sourceIds].sort().join('|'))).slice(0, 24)}`;
}

const sameSet = (a: string[] | null | undefined, b: string[]) =>
  !!a && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * PDF אחד מהמסמכים האלה (לפי הסדר). מקור יחיד שכבר PDF ⇒ הוא עצמו.
 * @param clientId הלקוח שהמסמכים שלו.
 * @param sourceIds המסמכים, בסדר העמודים (קדמי ואז אחורי).
 */
export async function ensurePdfVersion(
  db: DocDbForPdf,
  clientId: string,
  sourceIds: string[],
  opts: { fileName: string; maxBytes?: number; description?: string },
): Promise<PdfVersionResult> {
  if (!sourceIds.length) return { ok: false, error: 'אין מסמך להמיר.' };
  const maxBytes = opts.maxBytes ?? SHAAM_UPLOAD_MAX_BYTES;
  const all = await db.getDocsByClient(clientId);
  const sources = sourceIds.map(id => all.find(d => d.id === id));
  if (sources.some(s => !s)) return { ok: false, error: 'אחד המסמכים לא נמצא בתיק הלקוח.' };

  if (sources.length === 1 && /pdf/i.test(sources[0]!.fileType)) {
    return { ok: true, doc: sources[0]!, created: false };
  }
  const newest = Math.max(...sources.map(s => Date.parse(s!.uploadedAt) || 0));
  const existing = all.find(d => sameSet(d.sourceDocumentIds, sourceIds) && (Date.parse(d.uploadedAt) || 0) >= newest);
  if (existing) return { ok: true, doc: existing, created: false };

  const parts: Uint8Array[] = [];
  for (const s of sources) {
    const full = await db.getDoc(s!.id);
    if (!full || full.fileData.byteLength === 0) return { ok: false, error: `הקובץ «${s!.fileName}» אינו זמין באחסון.` };
    parts.push(new Uint8Array(full.fileData));
  }
  let pdf: { bytes: Uint8Array; pageCount: number };
  try {
    pdf = await buildDocumentPdf(parts);
  } catch (e) {
    return { ok: false, error: e instanceof ImageConversionError ? e.message : `ההמרה ל-PDF נכשלה: ${(e as Error)?.message ?? e}` };
  }
  // ‼ קריא ומתאים ליעד: PDF אמיתי, עמוד לכל חלק לפחות, ובגבול הגודל.
  if (!isPdfBytes(pdf.bytes) || pdf.pageCount < parts.length) return { ok: false, error: 'ה-PDF שנוצר אינו תקין - לא נשמר.' };
  if (pdf.bytes.byteLength > maxBytes) {
    return { ok: false, error: `ה-PDF שנוצר גדול מדי ליעד (${(pdf.bytes.byteLength / 1048576).toFixed(1)}MB, מותר עד ${Math.round(maxBytes / 1048576)}MB).` };
  }
  const fileData = new ArrayBuffer(pdf.bytes.byteLength);
  new Uint8Array(fileData).set(pdf.bytes);
  const first = sources[0]!;
  const doc: StoredDoc = {
    id: await pdfVersionId(sourceIds),
    clientId,
    fileName: opts.fileName,
    fileType: 'application/pdf',
    fileSize: fileData.byteLength,
    category: first.category,
    year: first.year,
    uploadedAt: new Date().toISOString(),
    description: opts.description ?? 'PDF שנוצר אוטומטית מהצילום',
    notes: `נוצר אוטומטית מ-${sources.map(s => s!.fileName).join(' + ')}`,
    fileData,
    folderId: first.folderId ?? null,
    labelId: first.labelId ?? null,
    sourceDocumentIds: sourceIds,
  };
  await db.saveDoc(doc);
  return { ok: true, doc, created: true, pageCount: pdf.pageCount };
}
