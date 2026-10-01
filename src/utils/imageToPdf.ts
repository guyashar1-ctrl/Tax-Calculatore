// ─── המרת תצלום ל-PDF — בדפדפן ─────────────────────────────────────────
// לקוחות שולחים צילום של מסמך; רשות המסים מבקשת PDF. ההמרה עצמה היא הליבה
// המשותפת (supabase/functions/_shared/imageToPdfCore.ts) — אותו קוד שרץ בשרת.
// כאן רק מה שרק דפדפן יכול: לפענח פורמטים שאין להם מפענח בליבה.
//
// ‼ 01.10.2026 · מה נתמך, ואיך:
//   JPG, PDF .............. ישירות בליבה, בלי אובדן (גם בשרת).
//   PNG ................... בליבה, בלי אובדן; שקוף ⇒ משוטח (לבן, או אפור כשהתוכן בהיר).
//   WebP, AVIF, GIF, BMP .. פענוח של הדפדפן ⇒ פיקסלים ⇒ PDF בלי אובדן נוסף.
//   TIFF .................. רק בדפדפן שמפענח אותו (ספארי); אחרת הסבר ובקשה ל-PDF/JPG.
//   HEIC/HEIF (אייפון) ..... פענוח של הדפדפן כשיש (ספארי); אחרת המפענח libheif,
//                            שנטען רק כשמגיע קובץ כזה (אישור גיא, 01.10.2026).
//   SVG / לא מזוהה ......... לא נתמך — הסבר ובקשה לצילום או PDF.
// ‼ כיוון: createImageBitmap עם imageOrientation:'from-image' מיישם את EXIF;
// libheif מיישם את irot/imir של HEIC. כך התמונה נכנסת לליבה כבר עומדת.
// ‼ מגבלת גודל (שע״ם: 30MB): קודם בלי אובדן; חרג ⇒ JPEG באיכות גבוהה ברזולוציה
// מלאה; עדיין חרג ⇒ הקטנה ל-300dpi. כל שלב מסומן ומוצג במשרד — לא בשקט.

import { PDFDocument, degrees, drawImage } from 'pdf-lib';
import UPNG from '@pdf-lib/upng';
import type { LibHeif, HeifImage } from 'libheif-js/libheif-wasm/libheif-bundle.mjs';
import {
  imageToPdfBytesWith, documentPartsToPdfWith, buildDocumentPdfWith, sniffFormat, flattenRgba, pngHasAlpha,
  ImageConversionError, FORMAT_NAME, FORMAT_MIME, MAX_DECODE_PIXELS,
  type PdfLib, type DocumentPdfResult, type PartInfo, type PdfPart, type RawImage, type DetectedFormat,
} from '../../supabase/functions/_shared/imageToPdfCore.ts';

export {
  sniffImageType, sniffFormat, looksConvertible, readJpegOrientation, placeForOrientation, swapsAxes,
  ImageConversionError, pdfFileNameFor, isPdfBytes, needsBrowserDecoder, pdfVersionIdFor,
  FORMAT_NAME, SHAAM_UPLOAD_MAX_BYTES,
  type SupportedImageType, type DetectedFormat, type DocumentPdfResult, type PartInfo,
} from '../../supabase/functions/_shared/imageToPdfCore.ts';

const LIB: PdfLib = { PDFDocument, degrees, UPNG, drawImageOp: drawImage } as unknown as PdfLib;

/**
 * בונה PDF בן עמוד אחד מתצלום. זורק ImageConversionError עם נוסח עברי
 * מוכן להצגה — לקורא אין מה לתרגם.
 */
export function imageToPdfBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return imageToPdfBytesWith(LIB, bytes);
}

/** כמה קבצים של אותו מסמך ⇒ PDF אחד (JPG/PNG/PDF בלבד). ראה buildDocumentPdf לכל הפורמטים. */
export function documentPartsToPdf(parts: Uint8Array[]): Promise<{ bytes: Uint8Array; pageCount: number }> {
  return documentPartsToPdfWith(LIB, parts);
}

// ─── פענוח בדפדפן ⇒ פיקסלים ────────────────────────────────────────────

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tooManyPixels(w: number, h: number) {
  return new ImageConversionError(`התמונה גדולה מדי לעיבוד (${Math.round(w * h / 1e6)} מגה-פיקסל).`,
    'too_many_pixels', 'לצלם או לסרוק מחדש ברזולוציה רגילה.');
}

/** RGBA של קנבס ⇒ תמונה גולמית משוטחת (ראה flattenRgba בליבה). */
function rawFromImageData(data: Uint8ClampedArray, w: number, h: number) {
  return flattenRgba(data, w, h);
}

/** פענוח בדפדפן עצמו. null ⇒ הדפדפן לא מכיר את הסוג. */
async function decodeNative(bytes: Uint8Array, fmt: DetectedFormat): Promise<{ raw: RawImage; tone: 'white' | 'grey' } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: FORMAT_MIME[fmt] }), { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    if (bmp.width * bmp.height > MAX_DECODE_PIXELS) throw tooManyPixels(bmp.width, bmp.height);
    const c = makeCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d') as Ctx2D | null;
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    return rawFromImageData(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
  } finally {
    bmp.close?.();
  }
}

let heifModule: Promise<LibHeif> | null = null;
/** המפענח נטען רק כשמגיע HEIC — ~2MB שלא נכנסים לטעינת האתר. */
function loadHeif() {
  heifModule ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(m => m.default());
  return heifModule;
}

async function decodeHeic(bytes: Uint8Array): Promise<{ raw: RawImage; tone: 'white' | 'grey' }> {
  let libheif: LibHeif;
  try {
    libheif = await loadHeif();
  } catch {
    heifModule = null;
    throw new ImageConversionError('לא הצלחנו לטעון את מפענח ה-HEIC (בעיית רשת?).', 'needs_decoder', 'לנסות שוב בעוד רגע.');
  }
  const decoder = new libheif.HeifDecoder();
  let images: HeifImage[];
  try {
    images = decoder.decode(bytes);
  } catch {
    images = [];
  }
  if (!images?.length) {
    throw new ImageConversionError('קובץ ה-HEIC פגום, ולכן לא הומר.', 'corrupt', 'להעלות שוב את הקובץ, או לשלוח את הצילום כ-JPG.');
  }
  try {
    // ‼ התמונה הראשית — לפי הסימון בקובץ, לא לפי המקום ברשימה. בקובץ HEIC עם כמה
    // תמונות (רצף, תמונות נלוות) השאר אינן עמודים נוספים של המסמך.
    const image = images.find(im => typeof im.is_primary === 'function' && im.is_primary()) ?? images[0];
    const w = image.get_width(), h = image.get_height();
    if (!w || !h) throw new ImageConversionError('לא הצלחנו לקרוא את מידות התמונה.', 'corrupt', 'להעלות שוב את הקובץ.');
    if (w * h > MAX_DECODE_PIXELS) throw tooManyPixels(w, h);
    const target = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    const ok = await new Promise<boolean>(resolve => image.display(target, out => resolve(!!out)));
    if (!ok) throw new ImageConversionError('קובץ ה-HEIC פגום, ולכן לא הומר.', 'corrupt', 'להעלות שוב את הקובץ, או לשלוח את הצילום כ-JPG.');
    return rawFromImageData(target.data, w, h);
  } finally {
    for (const im of images) im.free?.();
  }
}

export interface PreparedPart { part: PdfPart; info: Partial<PartInfo> }

/**
 * חלק אחד ⇒ משהו שהליבה מטמיעה. JPG/PDF וכן PNG אטום — כמו שהם; כל השאר
 * מפוענח כאן לפיקסלים (משוטחים); הסוג המקורי נשמר ב-info.from.
 */
export async function prepareForPdf(bytes: Uint8Array): Promise<PreparedPart> {
  if (!bytes?.length) throw new ImageConversionError('הקובץ ריק.', 'empty', 'להעלות שוב את הקובץ המקורי.');
  const fmt = sniffFormat(bytes);
  if (fmt === 'jpeg' || fmt === 'pdf' || (fmt === 'png' && !pngHasAlpha(bytes))) return { part: bytes, info: {} };
  if (fmt === 'svg' || fmt === 'unknown') {
    throw new ImageConversionError(
      fmt === 'svg' ? 'קובץ SVG הוא שרטוט ולא צילום, ואי אפשר להגיש אותו כמסמך.' : 'הקובץ אינו תמונה או PDF שאפשר להמיר.',
      'unsupported', 'להעלות צילום (JPG, PNG, HEIC, WebP) או קובץ PDF.');
  }
  // ‼ PNG שקוף מפוענח כאן ולא בליבה: הפענוח של הדפדפן מהיר בהרבה.
  let decoded = await decodeNative(bytes, fmt);
  if (!decoded && fmt === 'heic') decoded = await decodeHeic(bytes);
  if (!decoded && fmt === 'png') return { part: bytes, info: {} };   // הליבה תטפל (UPNG)
  if (!decoded) {
    throw new ImageConversionError(
      fmt === 'tiff' ? 'קובץ TIFF — הדפדפן הזה לא פותח אותו.' : `קובץ ${FORMAT_NAME[fmt]} — לא הצלחנו לפתוח אותו; ייתכן שהוא פגום.`,
      fmt === 'tiff' ? 'unsupported' : 'corrupt',
      fmt === 'tiff' ? 'לשמור מהסורק כ-PDF או כ-JPG, או לפתוח את הדף בספארי.' : 'להעלות שוב את הקובץ, או לשלוח אותו כ-JPG.');
  }
  return {
    part: decoded.raw,
    info: { ...(fmt !== 'png' ? { from: fmt } : {}), ...(decoded.tone !== 'white' || pngHasAlpha(bytes) ? { flattened: decoded.tone } : {}) },
  };
}

// ─── מגבלת גודל: JPEG באיכות גבוהה, ואז 300dpi — מסומן ───────────────────

/** 300dpi על A4 — הצד הארוך. מעל זה הקטנה אינה פוגעת בקריאות של מסמך. */
const READABLE_LONG_SIDE = 3508;

async function canvasToJpeg(c: HTMLCanvasElement | OffscreenCanvas, q: number): Promise<Uint8Array> {
  const blob = 'convertToBlob' in c
    ? await (c as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: q })
    : await new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', q));
  return new Uint8Array(await blob.arrayBuffer());
}

/** חלק ⇒ קנבס (מיושר ואטום). null ⇒ PDF, שאין מה לדחוס בו. */
async function partToCanvas(part: PdfPart): Promise<HTMLCanvasElement | OffscreenCanvas | null> {
  // בלי קנבס (סביבת בדיקות/שרת) אין סולם — השגיאה 'too_large' עולה כמו שהיא.
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
  if (!(part instanceof Uint8Array)) {
    const c = makeCanvas(part.width, part.height);
    const ctx = c.getContext('2d') as Ctx2D;
    const img = ctx.createImageData(part.width, part.height);
    for (let i = 0, o = 0; o < part.rgb.length; i += 4, o += 3) {
      img.data[i] = part.rgb[o]; img.data[i + 1] = part.rgb[o + 1]; img.data[i + 2] = part.rgb[o + 2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  const fmt = sniffFormat(part);
  if (fmt !== 'jpeg' && fmt !== 'png') return null;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(new Blob([part as BlobPart], { type: FORMAT_MIME[fmt] }), { imageOrientation: 'from-image' }); }
  catch { return null; }
  const c = makeCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bmp.width, bmp.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return c;
}

function downscaled(c: HTMLCanvasElement | OffscreenCanvas): HTMLCanvasElement | OffscreenCanvas | null {
  const long = Math.max(c.width, c.height);
  if (long <= READABLE_LONG_SIDE) return null;
  const k = READABLE_LONG_SIDE / long;
  const d = makeCanvas(Math.round(c.width * k), Math.round(c.height * k));
  const ctx = d.getContext('2d') as Ctx2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c as CanvasImageSource, 0, 0, d.width, d.height);
  return d;
}

/**
 * כמה קבצים של אותו מסמך (בכל פורמט נתמך) ⇒ PDF אחד, לפי הסדר.
 * @param opts.maxBytes מגבלת היעד (שע״ם: 30MB).
 * @param opts.allowSizeFallback כשחרג — JPEG באיכות גבוהה, ואז 300dpi (מסומן). בלי ⇒ שגיאה.
 */
export async function buildDocumentPdf(
  parts: Uint8Array[], opts: { maxBytes?: number; allowSizeFallback?: boolean; allowReadableDownscale?: boolean } = {},
): Promise<DocumentPdfResult> {
  const allowFallback = opts.allowSizeFallback ?? opts.allowReadableDownscale ?? false;
  const prepared: PreparedPart[] = [];
  for (let i = 0; i < parts.length; i++) {
    try { prepared.push(await prepareForPdf(parts[i])); }
    catch (e) { if (e instanceof ImageConversionError) e.partIndex = i; throw e; }
  }
  const build = () => buildDocumentPdfWith(LIB, prepared.map(p => p.part), { maxBytes: opts.maxBytes, partInfo: prepared.map(p => p.info) });
  try {
    return await build();
  } catch (e) {
    if (!(e instanceof ImageConversionError) || e.code !== 'too_large' || !allowFallback) throw e;
  }
  // שלב 1 · JPEG באיכות 95% ברזולוציה מלאה — רק לחלקים שנשמרו בלי דחיסה (פיקסלים/PNG).
  let changed = false;
  for (const p of prepared) {
    if (p.part instanceof Uint8Array && sniffFormat(p.part) !== 'png') continue;
    const c = await partToCanvas(p.part);
    if (!c) continue;
    p.part = await canvasToJpeg(c, 0.95);
    p.info = { ...p.info, recompressed: true };
    changed = true;
  }
  if (changed) {
    try { return await build(); }
    catch (e) { if (!(e instanceof ImageConversionError) || e.code !== 'too_large') throw e; }
  }
  // שלב 2 · הקטנה ל-300dpi (גם ל-JPEG מקוריים ענקיים).
  changed = false;
  for (const p of prepared) {
    const c = await partToCanvas(p.part);
    const d = c && downscaled(c);
    if (!d) continue;
    p.part = await canvasToJpeg(d, 0.92);
    p.info = { ...p.info, downscaled: true };
    changed = true;
  }
  return build();   // עדיין חורג ⇒ 'too_large' עולה כמו שהוא
}
