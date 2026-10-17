// ─── צילום תעודה מזהה: בניית PDF אחד מהתמונות (גיא, 12.10.2026; התיוג הגמיש — idFlex.ts, 16.10.2026) ──
// ‼ שום דבר לא נשלח ושום דרישה לא נסגרת עד «אישור ושליחה»; אז נבנה PDF אחד (גם מתמונה אחת),
//   וזה מה שנשמר בתיק. אותם כללים ללקוח (הדף האישי, טופס הייצוג) ולמשרד (כרטיס הלקוח).
// ‼ אילו תמונות, איך מתייגים אותן ובאיזה סדר הן נכנסות — idFlex.ts. כאן רק הקובץ.

export type { IdDocKind } from './idFlex';

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
/** תצוגה מקדימה בדפדפן — רק תמונות שהדפדפן יודע להציג (לא HEIC). */
export const canPreviewInBrowser = (f: File) => /^image\/(jpeg|png|webp|gif)$/i.test(f.type);

export class IdPdfError extends Error {}

/**
 * PDF אחד מהצדדים, בסדר. ‼ קובץ PDF יחיד נשאר כמו שהוא (כבר PDF); תמונה אחת — גם היא
 * הופכת ל-PDF. מעל maxBytes — הגרסה המוקטנת (buildDocumentPdfVersions), ואם גם היא גדולה מדי — שגיאה.
 */
export async function buildIdPdf(files: File[], opts: { name: string; maxBytes: number }): Promise<File> {
  if (files.length === 0) throw new IdPdfError('אין קובץ.');
  if (files.length === 1 && isPdfFile(files[0])) {
    if (files[0].size > opts.maxBytes) throw new IdPdfError('הקובץ גדול מדי - עד 10MB.');
    return files[0];
  }
  const { buildDocumentPdfVersions, ImageConversionError } = await import('../../utils/imageToPdf');
  try {
    const parts = await Promise.all(files.map(async f => new Uint8Array(await f.arrayBuffer())));
    const v = await buildDocumentPdfVersions(parts, { maxBytes: opts.maxBytes });
    const r = v.submission?.result ?? v.original;
    if (r.bytes.byteLength > opts.maxBytes) throw new IdPdfError('הקובץ גדול מדי גם אחרי הקטנה.');
    return new File([r.bytes as BlobPart], `${opts.name}.pdf`, { type: 'application/pdf' });
  } catch (e) {
    if (e instanceof IdPdfError) throw e;
    if (e instanceof ImageConversionError) throw new IdPdfError([e.message, e.next].filter(Boolean).join(' '));
    throw new IdPdfError('לא הצלחנו להכין את הקובץ. אפשר לנסות תמונה אחרת.');
  }
}
