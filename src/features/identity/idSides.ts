// ─── צילום תעודה מזהה: צדדים, סדר, ובניית PDF אחד (גיא, 12.10.2026) ─────────────
// ‼ שתי דרכים לאותה תעודה: קובץ אחד שכבר מכיל את שני הצדדים, או כל צד בנפרד — גם
// בשתי פעולות עוקבות, ומכל מקור (מצלמה, גלריה, קובץ). שום דבר לא נשלח ושום דרישה
// לא נסגרת עד «אישור ושליחה»; אז נבנה PDF אחד (גם מתמונה אחת), וזה מה שנשמר בתיק.
// ‼ אותם כללים ללקוח (הדף האישי, טופס הייצוג) ולמשרד (כרטיס הלקוח).

export type IdDocKind = 'idCard' | 'driverLicense' | 'passport' | 'idOrLicense';
export type IdMode = 'sides' | 'single';
export type IdSlot = 'front' | 'back' | 'extra' | 'single';

export interface IdPart { file: File; previewUrl?: string }
export type IdParts = Partial<Record<IdSlot, IdPart>>;

/** דרכון — עמוד אחד; שאר התעודות — שני צדדים. */
export const defaultIdMode = (kind: IdDocKind): IdMode => (kind === 'passport' ? 'single' : 'sides');

export const ID_SLOT_LABELS: Record<IdSlot, string> = {
  front: 'צד קדמי',
  back: 'צד אחורי',
  extra: 'ספח / עמוד נוסף (לא חובה)',
  single: 'קובץ אחד עם שני הצדדים',
};

/** אילו משבצות מוצגות. ספח — רק לתעודת זהות. */
export function idSlotsFor(kind: IdDocKind, mode: IdMode): IdSlot[] {
  if (mode === 'single') return ['single'];
  return kind === 'idCard' || kind === 'idOrLicense' ? ['front', 'back', 'extra'] : ['front', 'back'];
}

/** אפשר לאשר רק כששני הצדדים שם (או הקובץ האחד). */
export function idReady(mode: IdMode, parts: IdParts): boolean {
  return mode === 'single' ? !!parts.single : !!parts.front && !!parts.back;
}

/** מה עוד חסר — משפט אחד ללקוח, או null. */
export function idMissingText(mode: IdMode, parts: IdParts, kind: IdDocKind): string | null {
  if (mode === 'single') return parts.single ? null : 'צריך לצרף את הקובץ';
  if (kind === 'passport') return null;
  if (!parts.front && !parts.back) return null;
  if (!parts.front) return 'נשאר להוסיף את הצד הקדמי';
  if (!parts.back) return 'נשאר להוסיף את הצד האחורי';
  return null;
}

/** הקבצים לפי סדר העמודים ב-PDF: קדמי, אחורי, ספח. */
export function idOrderedFiles(mode: IdMode, parts: IdParts): File[] {
  const order: IdSlot[] = mode === 'single' ? ['single'] : ['front', 'back', 'extra'];
  return order.map(s => parts[s]?.file).filter((f): f is File => !!f);
}

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
