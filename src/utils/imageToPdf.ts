// ─── המרת תצלום ל-PDF — ב-Chrome ─────────────────────────────────────────
// לקוחות שולחים צילום של מסמך; רשות המסים מבקשת PDF. ההמרה עצמה היא הליבה
// המשותפת (supabase/functions/_shared/imageToPdfCore.ts) — אותו קוד שרץ בשרת.
// כאן רק מה שרק Chrome יודע: לפענח פורמטים שאין להם מפענח בליבה, ולדחוס.
// ‼ הקוד הזה רץ ברקע בעובד האוטומציה במחשב המשרד (pdf-converter.html בדפדפן
// ללא-ראש) — לא תלוי בדף פתוח. אותו קוד משמש גם תצוגה וצירוף ידני באתר.
//
// ‼ 01.10.2026 · פורמטים נתמכים (מוגדר, לא «כל קובץ בעולם»):
//   JPG, PDF .............. ישירות בליבה, בלי אובדן (גם בשרת).
//   PNG ................... בליבה, בלי אובדן; שקוף ⇒ משוטח (לבן, או אפור כשהתוכן בהיר).
//   HEIC/HEIF (אייפון) ..... המפענח libheif (נטען רק כשמגיע קובץ כזה). כל התמונות
//                            הראשיות בקובץ ⇒ עמוד לכל אחת (תמונות נלוות — עומק,
//                            HDR, תמונה מוקטנת — אינן תוכן ואינן נכללות).
//   WebP, AVIF, GIF, BMP .. הפענוח של Chrome ⇒ פיקסלים ⇒ PDF בלי אובדן נוסף.
//   מונפש (GIF/WebP/APNG) .. כל פריים ⇒ עמוד, עד MAX_FRAMES_PER_FILE; מעבר לזה —
//                            כשל עם הסבר. לעולם לא «הפריים הראשון» בשקט.
//   TIFF ................... לא נתמך (Chrome לא מפענח) — הסבר ובקשה ל-PDF/JPG.
//   SVG / לא מזוהה ......... לא נתמך — הסבר ובקשה לצילום או PDF.
// ‼ כיוון: createImageBitmap עם imageOrientation:'from-image' מיישם את EXIF;
// libheif מיישם את irot/imir של HEIC. כך התמונה נכנסת לליבה כבר עומדת.
//
// ‼ שתי גרסאות (buildDocumentPdfVersions, גיא 01.10.2026: «שמירה על קריאות חשובה
// יותר מעמידה אוטומטית במגבלת הגודל»):
//   · מקור — רזולוציה מלאה, בלי אובדן. רק כשגם זה גדול מדי לאחסון — JPEG 95%
//     ברזולוציה מלאה לפיקסלים שפוענחו (JPEG מקורי לא נוגע), עם הערה — ואז הוא
//     עצמו לבדיקת המשרד לפני הגשה.
//   · הגשה — רק כשהמקור חורג מ-30MB. ‼ כל גרסה כזאת היא לבדיקת המשרד (גיא, 01.10:
//     «כל גרסת הגשה שעברה דחיסה מאבדת מידע או הקטנת רזולוציה» — גם 95%):
//       1. רזולוציה מלאה, פיקסלים שפוענחו ⇒ JPEG 95% (JPEG מקורי לא נוגע).
//       2. רזולוציה מלאה, גם JPEG מקורי נדחס שוב (90%).
//       3. הקטנה ל-300dpi על A4 — קודם בלי דחיסה (Flate; למסמך טקסט קטן וחד יותר),
//          ואז JPEG 92% — לבדיקת המשרד. ‼ הקטנה אינה ערובה שטקסט קטן נשאר.
//     לכל גרסה שנדחסה — אזורי הפרטים העדינים לכל עמוד, להשוואה זה מול זה.

import { PDFDocument, degrees, drawImage } from 'pdf-lib';
import UPNG from '@pdf-lib/upng';
import type { LibHeif, HeifImage } from 'libheif-js/libheif-wasm/libheif-bundle.mjs';
import {
  imageToPdfBytesWith, documentPartsToPdfWith, buildDocumentPdfWith, sniffFormat, flattenRgba, pngHasAlpha,
  animatedFrameCount, fitOnA4, isPdfBytes,
  ImageConversionError, FORMAT_NAME, FORMAT_MIME, MAX_DECODE_PIXELS, MAX_FRAMES_PER_FILE, SHAAM_UPLOAD_MAX_BYTES,
  type PdfLib, type DocumentPdfResult, type PartInfo, type PdfPart, type RawImage, type DetectedFormat,
} from '../../supabase/functions/_shared/imageToPdfCore.ts';

export {
  sniffImageType, sniffFormat, looksConvertible, readJpegOrientation, placeForOrientation, swapsAxes,
  ImageConversionError, pdfFileNameFor, isPdfBytes, needsBrowserDecoder, pdfVersionIdFor, animatedFrameCount,
  FORMAT_NAME, SHAAM_UPLOAD_MAX_BYTES, MAX_FRAMES_PER_FILE, fitOnA4,
  type SupportedImageType, type DetectedFormat, type DocumentPdfResult, type PartInfo,
} from '../../supabase/functions/_shared/imageToPdfCore.ts';

const LIB: PdfLib = { PDFDocument, degrees, UPNG, drawImageOp: drawImage, rawEncoding: 'smallest' } as unknown as PdfLib;

/** מקום אחסון (הגבלת האחסון היא 50MB לקובץ) — מעל זה המקור נשמר כ-JPEG 95% ברזולוציה מלאה. */
export const ORIGINAL_MAX_BYTES = 45 * 1024 * 1024;

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

// ─── פענוח ⇒ פיקסלים ───────────────────────────────────────────────────

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
interface Decoded { raw: RawImage; tone: 'white' | 'grey' }

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tooManyPixels(w: number, h: number) {
  return new ImageConversionError(`התמונה גדולה מדי לעיבוד (${Math.round(w * h / 1e6)} מגה-פיקסל).`,
    'too_many_pixels', 'לצלם או לסרוק מחדש ברזולוציה רגילה.');
}

function tooManyFrames(n: number, fmt: DetectedFormat) {
  return new ImageConversionError(
    `בקובץ ${FORMAT_NAME[fmt]} יש ${n} ${fmt === 'heic' ? 'תמונות' : 'פריימים'} — יותר מ-${MAX_FRAMES_PER_FILE} עמודים ממסמך אחד, ולא ברור מה מהם המסמך.`,
    'too_many_frames', 'לשמור את העמודים הנחוצים כצילומים נפרדים (JPG) או כקובץ PDF.');
}

/** פענוח יחיד בדפדפן עצמו (עם כיוון EXIF). null ⇒ הדפדפן לא מכיר את הסוג. */
async function decodeNative(bytes: Uint8Array, fmt: DetectedFormat): Promise<Decoded | null> {
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
    return flattenRgba(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
  } finally {
    bmp.close?.();
  }
}

// deno-lint-ignore no-explicit-any
type ImageDecoderCtor = any;
const ImageDecoderClass = (): ImageDecoderCtor | null =>
  (typeof globalThis !== 'undefined' && (globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder) || null;

/**
 * כל הפריימים של קובץ מונפש (GIF/WebP/APNG/AVIF) — כל אחד כמו שהוא מוצג
 * (ImageDecoder מרכיב פריים על קודמיו). ‼ בלי ImageDecoder אין דרך לפענח פריימים:
 * שגיאה, לא «הראשון בלבד».
 */
async function decodeAllFrames(bytes: Uint8Array, fmt: DetectedFormat, expected: number): Promise<Decoded[]> {
  const ID = ImageDecoderClass();
  const type = FORMAT_MIME[fmt];
  if (!ID || (typeof ID.isTypeSupported === 'function' && !(await ID.isTypeSupported(type)))) {
    throw new ImageConversionError(`בקובץ ${FORMAT_NAME[fmt]} יש ${expected} פריימים, וכאן אין פענוח פריימים.`,
      'needs_decoder', 'ההמרה תושלם אוטומטית במחשב המשרד.');
  }
  const dec = new ID({ data: bytes, type });
  try {
    await dec.tracks.ready;
    await dec.completed.catch(() => undefined);
    const n: number = dec.tracks.selectedTrack?.frameCount ?? expected;
    if (n > MAX_FRAMES_PER_FILE) throw tooManyFrames(n, fmt);
    const out: Decoded[] = [];
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      try {
        const w = image.displayWidth, h = image.displayHeight;
        if (w * h > MAX_DECODE_PIXELS) throw tooManyPixels(w, h);
        const c = makeCanvas(w, h);
        const ctx = c.getContext('2d') as Ctx2D;
        ctx.drawImage(image as CanvasImageSource, 0, 0);
        out.push(flattenRgba(ctx.getImageData(0, 0, w, h).data, w, h));
      } finally {
        image.close?.();
      }
    }
    if (!out.length) throw new ImageConversionError(`קובץ ${FORMAT_NAME[fmt]} — לא נמצאו בו תמונות.`, 'corrupt', 'להעלות שוב את הקובץ.');
    return out;
  } catch (e) {
    if (e instanceof ImageConversionError) throw e;
    throw new ImageConversionError(`קובץ ${FORMAT_NAME[fmt]} — לא הצלחנו לפענח את הפריימים; ייתכן שהוא פגום.`, 'corrupt',
      'להעלות שוב את הקובץ, או לשלוח אותו כ-JPG.');
  } finally {
    dec.close?.();
  }
}

let heifModule: Promise<LibHeif> | null = null;
/** המפענח נטען רק כשמגיע HEIC — ~2MB שלא נכנסים לטעינת האתר. */
function loadHeif() {
  heifModule ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(m => m.default());
  return heifModule;
}

/** כל התמונות הראשיות שבקובץ HEIC — הראשית המסומנת קודם, ואז השאר לפי הסדר בקובץ. */
async function decodeHeic(bytes: Uint8Array): Promise<Decoded[]> {
  let libheif: LibHeif;
  try {
    libheif = await loadHeif();
  } catch {
    heifModule = null;
    throw new ImageConversionError('לא הצלחנו לטעון את מפענח ה-HEIC (בעיית רשת?).', 'needs_decoder', 'ניסיון נוסף יתבצע אוטומטית.');
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
    if (images.length > MAX_FRAMES_PER_FILE) throw tooManyFrames(images.length, 'heic');
    const primary = images.find(im => typeof im.is_primary === 'function' && im.is_primary()) ?? images[0];
    const ordered = [primary, ...images.filter(im => im !== primary)];
    const out: Decoded[] = [];
    for (const image of ordered) {
      const w = image.get_width(), h = image.get_height();
      if (!w || !h) throw new ImageConversionError('לא הצלחנו לקרוא את מידות התמונה.', 'corrupt', 'להעלות שוב את הקובץ.');
      if (w * h > MAX_DECODE_PIXELS) throw tooManyPixels(w, h);
      const target = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      const ok = await new Promise<boolean>(resolve => image.display(target, o => resolve(!!o)));
      if (!ok) throw new ImageConversionError('קובץ ה-HEIC פגום, ולכן לא הומר.', 'corrupt', 'להעלות שוב את הקובץ, או לשלוח את הצילום כ-JPG.');
      out.push(flattenRgba(target.data, w, h));
    }
    return out;
  } finally {
    for (const im of images) im.free?.();
  }
}

export interface PreparedPart { part: PdfPart; info: Partial<PartInfo> }

/**
 * קובץ אחד ⇒ חלק אחד או יותר (עמוד לכל תמונה/פריים). JPG/PDF וכן PNG אטום
 * בפריים אחד — כמו שהם; כל השאר מפוענח לפיקסלים (משוטחים); הסוג המקורי נשמר ב-info.from.
 */
export async function preparePartsForPdf(bytes: Uint8Array, sourceIndex = 0): Promise<PreparedPart[]> {
  if (!bytes?.length) throw new ImageConversionError('הקובץ ריק.', 'empty', 'להעלות שוב את הקובץ המקורי.');
  const fmt = sniffFormat(bytes);
  const base: Partial<PartInfo> = { sourceIndex };
  if (fmt === 'svg' || fmt === 'unknown') {
    throw new ImageConversionError(
      fmt === 'svg' ? 'קובץ SVG הוא שרטוט ולא צילום, ואי אפשר להגיש אותו כמסמך.' : 'הקובץ אינו תמונה או PDF שאפשר להמיר.',
      'unsupported', 'להעלות צילום (JPG, PNG, HEIC, WebP) או קובץ PDF.');
  }
  if (fmt === 'tiff') {
    throw new ImageConversionError('קובץ TIFF אינו נתמך להמרה.', 'unsupported', 'לשמור מהסורק כ-PDF או כ-JPG ולהעלות שוב.');
  }
  // ‼ רצף AVIF (מותג avis) — אין דרך לספור בלי פענוח; עובר בפענוח פריימים.
  const avifSequence = fmt === 'avif' && /avis/.test(String.fromCharCode(...bytes.subarray(0, 64)));
  const frames = avifSequence ? 2 : animatedFrameCount(bytes, fmt);
  if (frames > MAX_FRAMES_PER_FILE) throw tooManyFrames(frames, fmt);
  if (frames <= 1 && (fmt === 'jpeg' || fmt === 'pdf' || (fmt === 'png' && !pngHasAlpha(bytes)))) {
    return [{ part: bytes, info: base }];
  }

  // ‼ HEIC תמיד דרך libheif (גם בספארי, שמפענח בעצמו רק את התמונה הראשית).
  const decoded: Decoded[] = fmt === 'heic'
    ? await decodeHeic(bytes)
    : frames > 1
      ? await decodeAllFrames(bytes, fmt, frames)
      : await decodeNative(bytes, fmt).then(d => (d ? [d] : []));
  if (!decoded.length) {
    // PNG שקוף שהדפדפן לא פתח — הליבה תנסה (UPNG); השאר — פגום.
    if (fmt === 'png') return [{ part: bytes, info: base }];
    throw new ImageConversionError(`קובץ ${FORMAT_NAME[fmt]} — לא הצלחנו לפתוח אותו; ייתכן שהוא פגום.`, 'corrupt',
      'להעלות שוב את הקובץ, או לשלוח אותו כ-JPG.');
  }
  return decoded.map((d, i) => ({
    part: d.raw,
    info: {
      ...base,
      ...(fmt !== 'png' || decoded.length > 1 ? { from: fmt } : {}),
      ...(d.tone !== 'white' || (fmt === 'png' && pngHasAlpha(bytes)) ? { flattened: d.tone } : {}),
      ...(decoded.length > 1 ? { frame: { index: i, of: decoded.length } } : {}),
    },
  }));
}

/** תאימות: חלק אחד בלבד — לתצוגה. ראה preparePartsForPdf. */
export async function prepareForPdf(bytes: Uint8Array): Promise<PreparedPart> {
  return (await preparePartsForPdf(bytes))[0];
}

/** תמונות שהדפדפן לא מציג (HEIC) ⇒ JPEG לתצוגה, תמונה לכל עמוד. המקור לא משתנה. */
export async function decodeForDisplay(bytes: Uint8Array): Promise<Uint8Array[]> {
  const parts = await preparePartsForPdf(bytes);
  const out: Uint8Array[] = [];
  for (const p of parts) {
    if (p.part instanceof Uint8Array) { out.push(p.part); continue; }
    const c = rawToCanvas(p.part);
    out.push(await canvasToJpeg(c, 0.92));
    release(c);
  }
  return out;
}

// ─── דחיסה והקטנה — רק לגרסת ההגשה (או לאחסון כשהמקור ענק) ────────────

/** 300dpi על A4 — הצד הארוך. */
const READABLE_LONG_SIDE = 3508;

async function canvasToJpeg(c: AnyCanvas, q: number): Promise<Uint8Array> {
  const blob = 'convertToBlob' in c
    ? await (c as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: q })
    : await new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', q));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * ‼ קנבס של צילום 48MP תופס ~200MB. משחררים מיד אחרי השימוש ולא מחכים לאיסוף
 * הזבל — אחרת שני צדדים גדולים בכמה שלבים מפילים את הדף (נמצא בבדיקה: Target crashed).
 */
function release(...cs: (AnyCanvas | null | undefined)[]) {
  for (const c of cs) if (c) { try { c.width = 0; c.height = 0; } catch { /* כבר שוחרר */ } }
}

function rawToCanvas(raw: RawImage): AnyCanvas {
  const c = makeCanvas(raw.width, raw.height);
  const ctx = c.getContext('2d') as Ctx2D;
  const img = ctx.createImageData(raw.width, raw.height);
  for (let i = 0, o = 0; o < raw.rgb.length; i += 4, o += 3) {
    img.data[i] = raw.rgb[o]; img.data[i + 1] = raw.rgb[o + 1]; img.data[i + 2] = raw.rgb[o + 2]; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** חלק ⇒ קנבס (מיושר ואטום). null ⇒ PDF, שאין מה לדחוס בו. */
async function partToCanvas(part: PdfPart): Promise<AnyCanvas | null> {
  // בלי קנבס (סביבת בדיקות/שרת) אין סולם — השגיאה 'too_large' עולה כמו שהיא.
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
  if (!(part instanceof Uint8Array)) return rawToCanvas(part);
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

function downscaledTo(c: AnyCanvas, longSide: number): AnyCanvas | null {
  const long = Math.max(c.width, c.height);
  if (long <= longSide) return null;
  const k = longSide / long;
  const d = makeCanvas(Math.round(c.width * k), Math.round(c.height * k));
  const ctx = d.getContext('2d') as Ctx2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c as CanvasImageSource, 0, 0, d.width, d.height);
  return d;
}

const isJpegBytes = (p: PdfPart) => p instanceof Uint8Array && sniffFormat(p) === 'jpeg';
const isPdfPart = (p: PdfPart) => p instanceof Uint8Array && isPdfBytes(p);

/**
 * שלב בסולם: אילו חלקים נדחסים, באיזו איכות, והאם מוקטנים.
 * ‼ PDF מקורי לעולם לא נוגע. JPEG מקורי נוגע רק כש-includeJpeg.
 */
async function recompress(ps: PreparedPart[], q: number, o: { includeJpeg: boolean; longSide?: number; lossless?: boolean }): Promise<{ parts: PreparedPart[]; changed: boolean }> {
  let changed = false;
  const parts: PreparedPart[] = [];
  for (const p of ps) {
    if (isPdfPart(p.part) || (isJpegBytes(p.part) && !o.includeJpeg && !p.info.recompressed)) { parts.push(p); continue; }
    if (p.info.recompressed && !o.longSide && (p.info.quality ?? 1) <= q) { parts.push(p); continue; }
    const c = await partToCanvas(p.part);
    if (!c) { parts.push(p); continue; }
    const d = o.longSide ? downscaledTo(c, o.longSide) : null;
    // ‼ הקטנה שלא נדרשת (התמונה כבר קטנה) — אין סיבה לדחוס שוב JPEG קיים.
    if (o.longSide && !d && (isJpegBytes(p.part) || o.lossless)) { parts.push(p); continue; }
    if (o.lossless && d) {
      // הקטנה בלי דחיסה (Flate) — למסמך טקסט היא לרוב קטנה וחדה יותר מ-JPEG.
      const ctx = d.getContext('2d') as Ctx2D;
      const rgba = ctx.getImageData(0, 0, d.width, d.height).data;
      parts.push({
        part: flattenRgba(rgba, d.width, d.height).raw,
        info: { ...p.info, recompressed: false, quality: 1, downscaled: true, srcWidth: c.width, srcHeight: c.height },
      });
      release(c, d);
      changed = true;
      continue;
    }
    const srcW = c.width, srcH = c.height;
    const jpeg = await canvasToJpeg(d ?? c, q);
    release(c, d);
    parts.push({
      part: jpeg,
      info: { ...p.info, recompressed: true, quality: q, ...(d ? { downscaled: true } : {}), srcWidth: srcW, srcHeight: srcH },
    });
    changed = true;
  }
  return { parts, changed };
}

// ─── אזורי פרטים להשוואה ───────────────────────────────────────────────

export interface FocusRegion {
  /** עמוד ב-PDF (0-based). */
  page: number;
  /** מלבן על הדף, 0..1, מהפינה השמאלית-העליונה. */
  x: number; y: number; w: number; h: number;
}

/**
 * איפה בתמונה יש הכי הרבה טקסט/קווים חדים — שם טקסט קטן נפגע ראשון.
 * ‼ «קצה» = מעבר חד בניגודיות גבוהה (כתב כהה על רקע בהיר), לא כל שינוי: רעש
 * חיישן ומרקם רקע (שטיח, שולחן) מתמצעים בהקטנה ונופלים מתחת לסף — אחרת ההשוואה
 * מראה רעש במקום את הכתב (נמצא בבדיקה על צילום רועש של 48MP).
 * האזור ~420 פיקסלי מקור — מוצג 1:1 בהשוואה.
 */
function detailTiles(c: AnyCanvas, take: number): { u: number; v: number; uw: number; vh: number }[] {
  const long = Math.max(c.width, c.height);
  // ‼ הקטנה בחצאים (כל שלב ממצע 2×2) — ממצעת רעש כמו סינון איכותי, בלי הזיכרון
  // של imageSmoothingQuality=high על 48MP (שהפיל את הדף בבדיקה).
  let cur: AnyCanvas = c;
  while (Math.max(cur.width, cur.height) > 2000) {
    const half = makeCanvas(Math.max(1, Math.round(cur.width / 2)), Math.max(1, Math.round(cur.height / 2)));
    (half.getContext('2d') as Ctx2D).drawImage(cur as CanvasImageSource, 0, 0, half.width, half.height);
    if (cur !== c) release(cur);
    cur = half;
  }
  const k = Math.min(1, 1000 / Math.max(cur.width, cur.height));
  const w = Math.max(1, Math.round(cur.width * k)), h = Math.max(1, Math.round(cur.height * k));
  const s = makeCanvas(w, h);
  const ctx = s.getContext('2d') as Ctx2D;
  ctx.drawImage(cur as CanvasImageSource, 0, 0, w, h);
  if (cur !== c) release(cur);
  const d = ctx.getImageData(0, 0, w, h).data;
  release(s);
  const grid = Math.max(8, Math.round(long / 420));
  const tile = Math.max(4, Math.round(Math.max(w, h) / grid));
  const cols = Math.ceil(w / tile), rows = Math.ceil(h / tile);
  const lum = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // לכל משבצת: כמה קצוות, ואיפה מרכז הכובד שלהם — כדי שהאזור יתמרכז על הכתב.
  const measure = (edge: number) => {
    const e = new Float64Array(cols * rows), sx = new Float64Array(cols * rows), sy = new Float64Array(cols * rows);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const g = Math.abs(lum(i + 4) - lum(i - 4)) + Math.abs(lum(i + w * 4) - lum(i - w * 4));
        if (g > edge) { const t = Math.floor(y / tile) * cols + Math.floor(x / tile); e[t] += g; sx[t] += g * x; sy[t] += g * y; }
      }
    }
    return { e, sx, sy };
  };
  // צילום מטושטש בלי אף קצה חד — לפחות הכי הרבה פרטים שיש.
  let m = measure(48);
  if (!m.e.some(v => v > 0)) m = measure(0);
  const energy = m.e;
  const order = [...energy.keys()].sort((a, b) => energy[b] - energy[a]);
  const picked: number[] = [];
  for (const t of order) {
    if (picked.length >= take) break;
    const tx = t % cols, ty = Math.floor(t / cols);
    if (picked.some(p => Math.abs((p % cols) - tx) <= 1 && Math.abs(Math.floor(p / cols) - ty) <= 1)) continue;
    picked.push(t);
  }
  const tw = Math.min(tile, w), th = Math.min(tile, h);
  return picked.map(t => {
    const tx = t % cols, ty = Math.floor(t / cols);
    const cx = energy[t] > 0 ? m.sx[t] / energy[t] : tx * tile + tile / 2;
    const cy = energy[t] > 0 ? m.sy[t] / energy[t] : ty * tile + tile / 2;
    const x0 = Math.min(Math.max(0, cx - tw / 2), w - tw), y0 = Math.min(Math.max(0, cy - th / 2), h - th);
    return { u: x0 / w, v: y0 / h, uw: tw / w, vh: th / h };
  });
}

/** תמונה על דף A4 (fitOnA4) ⇒ מלבן על הדף מלמעלה-שמאל. */
function toPage(W: number, H: number, t: { u: number; v: number; uw: number; vh: number }) {
  const { pageW, pageH, dw, dh, bx, by } = fitOnA4(W, H);
  const top = pageH - by - dh;
  return { x: (bx + t.u * dw) / pageW, y: (top + t.v * dh) / pageH, w: (t.uw * dw) / pageW, h: (t.vh * dh) / pageH };
}

// ─── שתי הגרסאות ───────────────────────────────────────────────────────

export interface SubmissionVersion {
  result: DocumentPdfResult;
  /** recompressed = רזולוציה מלאה; downscaled = הוקטן. */
  mode: 'recompressed' | 'downscaled';
  /** לא עובר להגשה בלי שהמשרד ראה והחליט. */
  needsReview: boolean;
  /** לכל עמוד שהשתנה: מידות לפני/אחרי ואיכות. */
  pagesMeta: { page: number; srcW: number; srcH: number; outW: number; outH: number; quality: number; downscaled: boolean }[];
  focus: FocusRegion[];
}

export interface DocumentPdfVersions {
  original: DocumentPdfResult;
  /** null ⇒ המקור עומד במגבלה והוא עצמו קובץ ההגשה. */
  submission: SubmissionVersion | null;
  /**
   * המקור עצמו נדחס (גדול מדי לשמירה בלי אובדן) — מה השתנה ואיפה להסתכל. כשהוא גם
   * קובץ ההגשה, הוא לבדיקת המשרד כמו כל גרסה דחוסה. null ⇒ המקור בלי אובדן.
   */
  originalReview: SubmissionVersion | null;
}

const mbText = (n: number) => { const m = n / 1048576; return `${String(+m.toFixed(m >= 10 ? 1 : 2))}MB`; };

function tooLargeError(bytes: number, max: number, after: string) {
  return new ImageConversionError(
    `ה-PDF גדול מדי (${mbText(bytes)}, מותר עד ${mbText(max)}) ${after}.`,
    'too_large', 'לבקש צילום רגיל במקום סריקה ענקית, או לפצל את המסמך לכמה קבצים.');
}

/**
 * כמה קבצים של אותו מסמך ⇒ מקור (תמיד) + גרסת הגשה (רק כשצריך). ראה הכותרת.
 * ‼ כל עמוד של המקור נמצא גם בגרסת ההגשה — אותו מספר עמודים, אותו סדר.
 */
export async function buildDocumentPdfVersions(
  files: Uint8Array[], opts: { maxBytes?: number; originalMaxBytes?: number } = {},
): Promise<DocumentPdfVersions> {
  const maxBytes = opts.maxBytes ?? SHAAM_UPLOAD_MAX_BYTES;
  const originalMax = opts.originalMaxBytes ?? ORIGINAL_MAX_BYTES;
  const prepared: PreparedPart[] = [];
  for (let i = 0; i < files.length; i++) {
    try { prepared.push(...await preparePartsForPdf(files[i], i)); }
    catch (e) { if (e instanceof ImageConversionError) e.partIndex = i; throw e; }
  }
  const build = (ps: PreparedPart[]) => buildDocumentPdfWith(LIB, ps.map(p => p.part), { partInfo: ps.map(p => p.info) });
  const withIndex = async <T>(f: () => Promise<T>) => {
    try { return await f(); }
    catch (e) {
      if (e instanceof ImageConversionError && typeof e.partIndex === 'number') e.partIndex = prepared[e.partIndex]?.info.sourceIndex ?? e.partIndex;
      throw e;
    }
  };

  // ── המקור ──
  let original = await withIndex(() => build(prepared));
  let base = prepared;
  let originalReview: SubmissionVersion | null = null;
  if (original.bytes.byteLength > originalMax) {
    const alt = await recompress(prepared, 0.95, { includeJpeg: false });
    if (!alt.changed) throw tooLargeError(original.bytes.byteLength, originalMax, 'גם לשמירה');
    original = await build(alt.parts);
    if (original.bytes.byteLength > originalMax) throw tooLargeError(original.bytes.byteLength, originalMax, 'גם לשמירה');
    original.notes.push('המקור גדול מדי לשמירה בלי דחיסה — נשמר כ-JPEG 95% ברזולוציה המלאה.');
    originalReview = await describeSubmission(prepared, alt.parts, original, true);
    base = alt.parts;
  }
  if (original.bytes.byteLength <= maxBytes) return { original, submission: null, originalReview };

  // ── גרסת הגשה ──
  // ‼ כל שלב כאן מאבד מידע או רזולוציה ⇒ review בכולם. רק המקור בלי אובדן מתקדם לבד.
  const ladder: { q: number; includeJpeg: boolean; longSide?: number; lossless?: boolean; review: boolean }[] = [
    { q: 0.95, includeJpeg: false, review: true },
    { q: 0.90, includeJpeg: true, review: true },
    { q: 1, includeJpeg: true, longSide: READABLE_LONG_SIDE, lossless: true, review: true },
    { q: 0.92, includeJpeg: true, longSide: READABLE_LONG_SIDE, review: true },
  ];
  let last = original.bytes.byteLength;
  for (const step of ladder) {
    const r = await recompress(base, step.q, { includeJpeg: step.includeJpeg, longSide: step.longSide, lossless: step.lossless });
    if (!r.changed) continue;
    const result = await build(r.parts);
    last = result.bytes.byteLength;
    if (last > maxBytes) continue;
    if (result.pageCount !== original.pageCount) {
      throw new ImageConversionError('גרסת ההגשה יצאה עם מספר עמודים שונה מהמקור, ולכן לא נשמרה.', 'corrupt', 'לנסות שוב.');
    }
    return { original, submission: await describeSubmission(base, r.parts, result, step.review), originalReview };
  }
  throw tooLargeError(last, maxBytes, 'גם אחרי הקטנה ל-300dpi');
}

async function describeSubmission(before: PreparedPart[], after: PreparedPart[], result: DocumentPdfResult, review: boolean): Promise<SubmissionVersion> {
  const pagesMeta: SubmissionVersion['pagesMeta'] = [];
  const focus: FocusRegion[] = [];
  let page = 0;
  for (let i = 0; i < after.length; i++) {
    const info = result.parts[i];
    const a = after[i];
    if ((a.info.recompressed || a.info.downscaled) && a.part !== before[i].part) {
      const c = await partToCanvas(before[i].part);
      if (c) {
        pagesMeta.push({
          page, srcW: c.width, srcH: c.height, outW: info.width ?? c.width, outH: info.height ?? c.height,
          quality: a.info.quality ?? 0.95, downscaled: !!a.info.downscaled,
        });
        // ‼ עמוד ראשון שהשתנה — שני אזורים; כל עמוד נוסף — אחד. עד 4 בסך הכול.
        const take = focus.length === 0 ? 2 : 1;
        if (focus.length < 4) for (const t of detailTiles(c, take)) focus.push({ page, ...toPage(c.width, c.height, t) });
        release(c);
      }
    }
    page += info?.pages ?? 1;
  }
  const downscaled = after.some(p => p.info.downscaled);
  return { result, mode: downscaled ? 'downscaled' : 'recompressed', needsReview: review || downscaled, pagesMeta, focus };
}

/**
 * כמה קבצים של אותו מסמך (בכל פורמט נתמך) ⇒ PDF אחד, לפי הסדר, בלי אובדן.
 * חריגה מ-maxBytes ⇒ 'too_large' (בלי דחיסה שקטה). לגרסת הגשה — buildDocumentPdfVersions.
 */
export async function buildDocumentPdf(parts: Uint8Array[], opts: { maxBytes?: number } = {}): Promise<DocumentPdfResult> {
  const prepared: PreparedPart[] = [];
  for (let i = 0; i < parts.length; i++) {
    try { prepared.push(...await preparePartsForPdf(parts[i], i)); }
    catch (e) { if (e instanceof ImageConversionError) e.partIndex = i; throw e; }
  }
  return buildDocumentPdfWith(LIB, prepared.map(p => p.part), { maxBytes: opts.maxBytes, partInfo: prepared.map(p => p.info) });
}
