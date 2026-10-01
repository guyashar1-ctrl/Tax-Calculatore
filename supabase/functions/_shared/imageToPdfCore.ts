// ─── המרת תצלום ל-PDF — הליבה המשותפת לדפדפן ול-Deno ────────────────────
// לקוחות שולחים צילום של מסמך; רשות המסים מבקשת PDF. אותו קוד רץ בדפדפן
// (src/utils/imageToPdf.ts), בשרת (document-pdf — הכנה ברקע, 210) ובעובד
// (automation-worker — ברגע השידור, 204).
// ‼ בלי שום import: pdf-lib ו-UPNG מוזרקים (`PdfLib`), כי בדפדפן הם חבילות
// npm ו-Deno מייבא אותם מכתובת. כך אין שני מימושים שיכולים להיפרד.
//
// ‼ העיקרון (01.10.2026, גיא): כל מה שרואים בתמונה נשמר ב-PDF.
//   · בלי קידוד מחדש מאבד: JPEG נכנס כמו שהוא (DCTDecode), PNG נשמר בלי אובדן.
//   · בלי חיתוך ובלי מתיחה: קנה מידה אחד לשני הצירים, והתמונה כולה בתוך הדף.
//   · בלי הקטנת רזולוציה: התמונה נשמרת ברזולוציה המקורית, והדף רק ממסגר אותה —
//     טקסט קטן נשאר חד כשמגדילים.
//   · כיוון: תג EXIF של JPEG מיושם במטריצה של הדף (בלי ראסטר מחדש).
//   · שקיפות: משוטחת על רקע לבן — ועל רקע אפור כשהתוכן עצמו בהיר, כדי שלא ייעלם.
//   · כמה חלקים (שני צדי תעודה) ⇒ PDF אחד, עמוד לכל חלק, באותו סדר.
// ‼ פורמטים שאין להם מפענח כאן (HEIC, WebP, AVIF, GIF, BMP, TIFF) — הדפדפן מפענח
// אותם ומעביר PNG (בלי אובדן נוסף). בשרת הם נכשלים בקוד 'needs_decoder', לא בשקט.

/** מה שהליבה צריכה מ-pdf-lib. מבני בכוונה — ראה ההערה בראש הקובץ. */
// deno-lint-ignore no-explicit-any
type PdfDoc = any;
export interface UpngLike {
  // deno-lint-ignore no-explicit-any
  decode(buf: ArrayBuffer): any;
  // deno-lint-ignore no-explicit-any
  toRGBA8(img: any): ArrayBuffer[];
  encode(frames: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
}
export interface PdfLib {
  PDFDocument: { create(): Promise<PdfDoc>; load(bytes: Uint8Array, opts?: Record<string, unknown>): Promise<PdfDoc> };
  // deno-lint-ignore no-explicit-any
  degrees(angle: number): any;
  /** לשקיפות ב-PNG. בלעדיו PNG שקוף נשמר עם מסכת שקיפות (התנהגות pdf-lib). */
  UPNG?: UpngLike;
  /**
   * האופרטור הציבורי drawImage של pdf-lib (operations) — להטמעת פיקסלים גולמיים
   * בדחיסה אחת בלי אובדן (RawImage). בלעדיו אין תמיכה בחלק גולמי.
   */
  // deno-lint-ignore no-explicit-any
  drawImageOp?: (name: any, o: any) => any[];
}

/**
 * תמונה שכבר פוענחה (בדפדפן: HEIC/WebP/PNG שקוף; בשרת: PNG שקוף) — RGB אטום,
 * כבר מיושר ומשוטח. נכנס ל-PDF כזרם Flate (בלי אובדן) בדחיסה אחת.
 */
export interface RawImage { kind: 'raw'; rgb: Uint8Array; width: number; height: number }
export type PdfPart = Uint8Array | RawImage;
const isRaw = (p: PdfPart): p is RawImage => !(p instanceof Uint8Array) && (p as RawImage).kind === 'raw';

export type SupportedImageType = 'image/jpeg' | 'image/png';

/** A4 בנקודות. הרשות מקבלת דפים בגודל תקני, ולא דף בגודל התצלום. */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
/** שוליים צרים: מסמך סרוק צריך לנצל את הדף, לא להצטמצם למרכזו. */
const MARGIN = 24;
/** מעל זה התמונה לא תפוענח (הגנה מקובץ שמתפוצץ בזיכרון). 100MP = צילום 12MP פי שמונה. */
export const MAX_DECODE_PIXELS = 100_000_000;

// ─── זיהוי סוג ─────────────────────────────────────────────────────────

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * סוג הקובץ לפי התוכן עצמו ולא לפי הסיומת או ה-MIME השמור.
 * ‼ זו הבדיקה הקובעת לפני ההמרה: סיומת היא טקסט שהמשתמש שולט בו, ואילו
 * הבייטים הגיעו מהאחסון אחרי שה-RLS כבר אישר את הגישה אליהם.
 * מחזיר רק את שני הסוגים שהליבה מטמיעה ישירות — ראה sniffFormat לכל השאר.
 */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | null {
  const f = sniffFormat(bytes);
  return f === 'jpeg' ? 'image/jpeg' : f === 'png' ? 'image/png' : null;
}

export type DetectedFormat =
  | 'jpeg' | 'png' | 'pdf' | 'heic' | 'avif' | 'webp' | 'gif' | 'bmp' | 'tiff' | 'svg' | 'unknown';

/** שם לתצוגה — מה שהמשתמש מכיר. */
export const FORMAT_NAME: Record<DetectedFormat, string> = {
  jpeg: 'JPG', png: 'PNG', pdf: 'PDF', heic: 'HEIC (אייפון)', avif: 'AVIF', webp: 'WebP',
  gif: 'GIF', bmp: 'BMP', tiff: 'TIFF', svg: 'SVG', unknown: 'לא מזוהה',
};

/** MIME לפי הסוג שזוהה — לפענוח בדפדפן. */
export const FORMAT_MIME: Record<DetectedFormat, string> = {
  jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', heic: 'image/heic', avif: 'image/avif',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff', svg: 'image/svg+xml',
  unknown: 'application/octet-stream',
};

const ascii = (b: Uint8Array, from: number, len: number) =>
  String.fromCharCode(...b.subarray(from, Math.min(b.length, from + len)));

/** סוג הקובץ לפי החתימה שבתחילתו. */
export function sniffFormat(bytes: Uint8Array): DetectedFormat {
  if (!bytes || bytes.length < 4) return 'unknown';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && PNG_MAGIC.every((b, i) => bytes[i] === b)) return 'png';
  if (ascii(bytes, 0, 4) === '%PDF') return 'pdf';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)) return 'tiff';
  // ISO-BMFF: [size]['ftyp'][major brand][minor][compatible brands...]
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp') {
    const size = Math.min(bytes.length, ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0 || 32);
    const brands = [ascii(bytes, 8, 4)];
    for (let o = 16; o + 4 <= size; o += 4) brands.push(ascii(bytes, o, 4));
    if (brands.some(b => b === 'avif' || b === 'avis')) return 'avif';
    if (brands.some(b => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(b))) return 'heic';
  }
  const head = ascii(bytes, 0, 256).replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return 'unknown';
}

/** פורמט תמונה שהדפדפן מפענח (ראה src/utils/imageToPdf.ts) והליבה לא. */
export function needsBrowserDecoder(f: DetectedFormat): boolean {
  return f === 'heic' || f === 'avif' || f === 'webp' || f === 'gif' || f === 'bmp' || f === 'tiff';
}

/**
 * האם כדאי להציע המרה על המסמך הזה. זו שאלת תצוגה בלבד — ההכרעה האמיתית
 * נופלת על התוכן ב-sniffFormat. ה-MIME השמור קודם, ורק כשהוא חסר או
 * גנרי נופלים לסיומת (קבצים ישנים נשמרו כ-application/octet-stream).
 */
export function looksConvertible(fileType?: string | null, fileName?: string | null): boolean {
  const mime = (fileType || '').trim().toLowerCase();
  if (/^image\/(jpeg|jpg|png|heic|heif|webp|avif|gif|bmp|tiff)$/.test(mime)) return true;
  if (mime && mime !== 'application/octet-stream') return false;
  return /\.(jpe?g|png|heic|heif|webp|avif|gif|bmp|tiff?)$/i.test(fileName || '');
}

// ─── כיוון התצלום (EXIF) ───────────────────────────────────────────────

/**
 * תג Orientation מתוך ה-EXIF של JPEG. צילום של מסמך בטלפון נשמר כמעט תמיד
 * בכיוון החיישן עם תג שאומר איך לסובב — בלי לקרוא אותו, דף שצולם לאורך
 * יוצא שוכב על הצד ב-PDF. מחזיר 1 (רגיל) כשאין EXIF או כשהוא פגום.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 2;
  while (off + 4 <= bytes.length) {
    if (view.getUint8(off) !== 0xff) return 1;
    const marker = view.getUint8(off + 1);
    // סמני ריפוד ו-standalone: אין להם שדה אורך
    if (marker === 0xff) { off += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { off += 2; continue; }
    if (marker === 0xda) return 1;   // תחילת הסריקה — משם והלאה זה כבר תמונה
    const size = view.getUint16(off + 2, false);
    if (size < 2) return 1;
    if (marker === 0xe1 && off + 10 <= bytes.length) {
      const isExif = bytes[off + 4] === 0x45 && bytes[off + 5] === 0x78
        && bytes[off + 6] === 0x69 && bytes[off + 7] === 0x66 && bytes[off + 8] === 0x00;
      if (isExif) return orientationFromTiff(view, bytes.length, off + 10);
    }
    off += 2 + size;
  }
  return 1;
}

function orientationFromTiff(view: DataView, total: number, tiff: number): number {
  if (tiff + 8 > total) return 1;
  const little = view.getUint16(tiff, false) === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return 1;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > total) return 1;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > total) return 1;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/**
 * מיקום התמונה על הדף לפי תג הכיוון.
 *
 * ‼ ההצבה נשענת על כך ש-pdf-lib בונה את המטריצה כ-
 * translate(x,y) · rotate(θ) · scale(width,height), ולכן רוחב או גובה
 * *שליליים* הם שיקוף — כך כל שמונת הכיוונים נתמכים בלי לרסטר מחדש את
 * התמונה ובלי לאבד איכות. הנוסחאות נגזרו מהמיפוי של ארבע פינות התמונה
 * ואומתו בדפדפן מול רינדור של ה-PDF שנוצר.
 * (bx,by) היא הפינה השמאלית-תחתונה של המלבן על הדף, ו-(dw,dh) מידותיו.
 */
export function placeForOrientation(
  orientation: number, bx: number, by: number, dw: number, dh: number,
): { x: number; y: number; width: number; height: number; rotate: number } {
  switch (orientation) {
    case 2: return { x: bx + dw, y: by, width: -dw, height: dh, rotate: 0 };
    case 3: return { x: bx + dw, y: by + dh, width: dw, height: dh, rotate: 180 };
    case 4: return { x: bx, y: by + dh, width: dw, height: -dh, rotate: 0 };
    case 5: return { x: bx + dw, y: by + dh, width: -dh, height: dw, rotate: 90 };
    case 6: return { x: bx, y: by + dh, width: dh, height: dw, rotate: -90 };
    case 7: return { x: bx, y: by, width: -dh, height: dw, rotate: -90 };
    case 8: return { x: bx + dw, y: by, width: dh, height: dw, rotate: 90 };
    default: return { x: bx, y: by, width: dw, height: dh, rotate: 0 };
  }
}

/** כיוונים 5–8 מחליפים בין רוחב לגובה: דף לאורך שצולם שוכב מוצג לאורך. */
export function swapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

// ─── שגיאות — כל אחת עם הסבר ועם הדרך להמשיך ───────────────────────────

export type ConversionErrorCode =
  | 'empty' | 'unsupported' | 'needs_decoder' | 'truncated' | 'corrupt'
  | 'encrypted' | 'too_many_pixels' | 'too_large';

/**
 * שגיאת המרה בנוסח עברי מוכן להצגה. `next` — מה עושים עכשיו.
 * ‼ אף שגיאה כאן אינה «הצלחה חלקית»: אין קובץ חלקי, ואין PDF שחסר בו דף.
 */
export class ImageConversionError extends Error {
  code: ConversionErrorCode;
  next: string;
  /** איזה חלק (0-based) נכשל, כשיש כמה. */
  partIndex?: number;
  constructor(message: string, code: ConversionErrorCode = 'corrupt', next = '') {
    super(message);
    this.code = code;
    this.next = next;
  }
}

const REUPLOAD = 'להעלות שוב את הקובץ המקורי, או לצלם את המסמך מחדש.';

export function unsupportedFormatError(f: DetectedFormat): ImageConversionError {
  if (needsBrowserDecoder(f)) {
    return new ImageConversionError(
      `קובץ ${FORMAT_NAME[f]} — כאן אין מפענח לסוג הזה, וההמרה תושלם בדפדפן.`, 'needs_decoder',
      'ההמרה תושלם אוטומטית כשדף הבקשה ייפתח במשרד.');
  }
  return new ImageConversionError(
    f === 'svg' ? 'קובץ SVG הוא שרטוט ולא צילום, ואי אפשר להגיש אותו כמסמך.'
      : 'הקובץ אינו תמונה או PDF שאפשר להמיר.',
    'unsupported', 'להעלות צילום (JPG, PNG, HEIC, WebP) או קובץ PDF.');
}

// ─── חלק אחד ⇒ עמוד ──────────────────────────────────────────────────

/**
 * האם הקובץ נקטע באמצע. ‼ בלי הבדיקה הזו קובץ חסר מייצר PDF שנראה תקין
 * ברשימה אבל מציג חצי תמונה — וזה מתגלה רק אחרי ההגשה לרשות. JPEG שלם
 * נגמר ב-FFD9 ו-PNG שלם נגמר במקטע IEND.
 */
function isTruncated(bytes: Uint8Array, kind: SupportedImageType): boolean {
  if (kind === 'image/jpeg') {
    for (let i = bytes.length - 2; i >= 2; i--) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return false;
    }
    return true;
  }
  for (let i = bytes.length - 8; i >= 8; i--) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x44) return false;
  }
  return true;
}

/** מידות מתוך כותרת PNG (IHDR) — בלי לפענח. */
function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 24) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16, false), h: v.getUint32(20, false) };
}

/** האם ל-PNG יש שקיפות — סוג צבע עם אלפא, או מקטע tRNS. */
export function pngHasAlpha(bytes: Uint8Array): boolean {
  const ctype = bytes[25];
  if (ctype === 4 || ctype === 6) return true;
  for (let o = 8; o + 8 <= bytes.length;) {
    const len = ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
    const type = ascii(bytes, o + 4, 4);
    if (type === 'tRNS') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    o += 12 + len;
  }
  return false;
}

/** רקע לשקיפות — לבן, ואפור כשהתוכן עצמו בהיר (למשל לוגו לבן על שקוף). */
export function backdropFor(rgba: Uint8Array): { gray: number; tone: 'white' | 'grey' } {
  let lumSum = 0, weight = 0, transparent = 0;
  const n = rgba.length / 4;
  // ‼ דגימה: עד ~400K פיקסלים מספיקים לממוצע ולא מכבידים על השרת.
  const step = Math.max(1, Math.floor(n / 400_000));
  let sampled = 0;
  for (let i = 0; i < n; i += step) {
    const o = i * 4, a = rgba[o + 3] / 255;
    sampled++;
    if (a < 0.98) transparent++;
    if (a > 0.06) {
      lumSum += a * (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
      weight += a;
    }
  }
  const meanLum = weight > 0 ? lumSum / weight : 0;
  const light = transparent / Math.max(1, sampled) > 0.02 && meanLum > 0.75;
  return light ? { gray: 112, tone: 'grey' } : { gray: 255, tone: 'white' };
}

/**
 * PNG שקוף ⇒ PNG אטום, משוטח על רקע (backdropFor), בלי אובדן.
 * ‼ מסכת שקיפות ב-PDF «עובדת», אבל צופים מציגים מתחתיה דף לבן — ותוכן לבן נעלם.
 */
function flattenPng(upng: UpngLike, bytes: Uint8Array): { raw: RawImage; tone: 'white' | 'grey' } {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const img = upng.decode(buf as ArrayBuffer);
  const frames = upng.toRGBA8(img);
  if (!frames.length) throw new ImageConversionError('לא הצלחנו לקרוא את התמונה — הקובץ פגום.', 'corrupt', REUPLOAD);
  const rgba = new Uint8Array(frames[0]);
  return flattenRgba(rgba, img.width, img.height);
}

/** RGBA ⇒ RGB אטום על הרקע של backdropFor. משותף לשרת ולדפדפן. */
export function flattenRgba(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): { raw: RawImage; tone: 'white' | 'grey' } {
  const { gray, tone } = backdropFor(rgba as Uint8Array);
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    const a = rgba[i + 3];
    if (a === 255) { rgb[o] = rgba[i]; rgb[o + 1] = rgba[i + 1]; rgb[o + 2] = rgba[i + 2]; continue; }
    const k = a / 255, bg = gray * (1 - k);
    rgb[o] = Math.round(rgba[i] * k + bg);
    rgb[o + 1] = Math.round(rgba[i + 1] * k + bg);
    rgb[o + 2] = Math.round(rgba[i + 2] * k + bg);
  }
  return { raw: { kind: 'raw', rgb, width, height }, tone };
}

export interface PartInfo {
  /** מה נכנס (אחרי פענוח בדפדפן — 'png' עם `from`). */
  format: DetectedFormat;
  /** מה היה הקובץ המקורי, כשהדפדפן פענח אותו בדרך (HEIC/WebP…). */
  from?: DetectedFormat;
  /** עמודים שהחלק הוסיף. */
  pages: number;
  width?: number;
  height?: number;
  orientation?: number;
  /** שקיפות שוטחה — על איזה רקע. */
  flattened?: 'white' | 'grey';
  /** נשמר כ-JPEG באיכות גבוהה ברזולוציה מלאה (רק בדפדפן, רק כשהגודל חרג). */
  recompressed?: boolean;
  /** הוקטן ל-300dpi (רק בדפדפן, רק כשגם JPEG ברזולוציה מלאה חרג). */
  downscaled?: boolean;
}

/** מוסיף למסמך דף אחד מתצלום JPEG/PNG. זורק ImageConversionError בנוסח עברי מוכן. */
async function addImagePage(lib: PdfLib, pdf: PdfDoc, bytes: Uint8Array): Promise<PartInfo> {
  if (!bytes.length) throw new ImageConversionError('הקובץ ריק.', 'empty', REUPLOAD);
  const fmt = sniffFormat(bytes);
  if (fmt !== 'jpeg' && fmt !== 'png') throw unsupportedFormatError(fmt);
  const kind: SupportedImageType = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';

  if (isTruncated(bytes, kind)) {
    throw new ImageConversionError('התמונה נקטעה באמצע — הקובץ לא הועלה עד הסוף.', 'truncated', REUPLOAD);
  }

  if (kind === 'image/png') {
    const dim = pngSize(bytes);
    if (dim && dim.w * dim.h > MAX_DECODE_PIXELS) {
      throw new ImageConversionError(`התמונה גדולה מדי לעיבוד (${Math.round(dim.w * dim.h / 1e6)} מגה-פיקסל).`,
        'too_many_pixels', 'לצלם או לסרוק מחדש ברזולוציה רגילה.');
    }
    // ‼ ב-Node (CJS) החבילה מגיעה עטופה ב-default; בדפדפן וב-Deno — ישירות.
    const upng = (lib.UPNG && typeof lib.UPNG.decode === 'function' ? lib.UPNG
      : (lib.UPNG as unknown as { default?: UpngLike } | undefined)?.default) ?? null;
    if (upng && lib.drawImageOp && pngHasAlpha(bytes)) {
      let f;
      try {
        f = flattenPng(upng, bytes);
      } catch (e) {
        if (e instanceof ImageConversionError) throw e;
        throw new ImageConversionError('לא הצלחנו לקרוא את התמונה — הקובץ פגום.', 'corrupt', REUPLOAD);
      }
      return { ...addRawPage(lib, pdf, f.raw), format: 'png', flattened: f.tone };
    }
  }

  let image;
  try {
    image = kind === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch {
    throw new ImageConversionError('לא הצלחנו לקרוא את התמונה — הקובץ פגום.', 'corrupt', REUPLOAD);
  }

  const orientation = kind === 'image/jpeg' ? readJpegOrientation(bytes) : 1;
  const natW = swapsAxes(orientation) ? image.height : image.width;
  const natH = swapsAxes(orientation) ? image.width : image.height;
  if (!natW || !natH) {
    throw new ImageConversionError('לא הצלחנו לקרוא את מידות התמונה.', 'corrupt', REUPLOAD);
  }

  const { pageW, pageH, dw, dh, bx, by } = fitOnA4(natW, natH);
  const page = pdf.addPage([pageW, pageH]);
  const place = placeForOrientation(orientation, bx, by, dw, dh);
  page.drawImage(image, {
    x: place.x, y: place.y,
    width: place.width, height: place.height,
    rotate: lib.degrees(place.rotate),
  });
  return { format: fmt, pages: 1, width: natW, height: natH, orientation };
}

/** הצבה על דף A4 — משותף לתמונה מוטמעת ולפיקסלים גולמיים. */
function fitOnA4(natW: number, natH: number) {
  // דף לרוחב לתצלום רחב, לאורך לתצלום גבוה — כדי שהתמונה תמלא את הדף
  // במקום להצטמצם לרצועה עם שוליים ענקיים משני צדדיה.
  const landscape = natW > natH;
  const pageW = landscape ? A4_LONG : A4_SHORT;
  const pageH = landscape ? A4_SHORT : A4_LONG;
  // ‼ קנה מידה אחד לשני הצירים — אין מתיחה ואין חיתוך.
  const scale = Math.min((pageW - MARGIN * 2) / natW, (pageH - MARGIN * 2) / natH);
  const dw = natW * scale, dh = natH * scale;
  return { pageW, pageH, dw, dh, bx: (pageW - dw) / 2, by: (pageH - dh) / 2 };
}

/** פיקסלים גולמיים (כבר מיושרים ומשוטחים) ⇒ עמוד. Flate אחד, בלי אובדן. */
function addRawPage(lib: PdfLib, pdf: PdfDoc, raw: RawImage): PartInfo {
  if (!lib.drawImageOp) throw new ImageConversionError('ההמרה אינה זמינה כאן.', 'needs_decoder', '');
  const { width: w, height: h } = raw;
  if (!w || !h || raw.rgb.length !== w * h * 3) {
    throw new ImageConversionError('לא הצלחנו לקרוא את מידות התמונה.', 'corrupt', REUPLOAD);
  }
  if (w * h > MAX_DECODE_PIXELS) {
    throw new ImageConversionError(`התמונה גדולה מדי לעיבוד (${Math.round(w * h / 1e6)} מגה-פיקסל).`,
      'too_many_pixels', 'לצלם או לסרוק מחדש ברזולוציה רגילה.');
  }
  const xObject = pdf.context.flateStream(raw.rgb, {
    Type: 'XObject', Subtype: 'Image', BitsPerComponent: 8, Width: w, Height: h, ColorSpace: 'DeviceRGB',
  });
  const ref = pdf.context.register(xObject);
  const { pageW, pageH, dw, dh, bx, by } = fitOnA4(w, h);
  const page = pdf.addPage([pageW, pageH]);
  const name = page.node.newXObject('Image', ref);
  page.pushOperators(...lib.drawImageOp(name, {
    x: bx, y: by, width: dw, height: dh, rotate: lib.degrees(0), xSkew: lib.degrees(0), ySkew: lib.degrees(0),
  }));
  return { format: 'png', pages: 1, width: w, height: h, orientation: 1 };
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** האם הבייטים הם PDF — לפי התוכן, לא לפי השם. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && PDF_MAGIC.every((b, i) => bytes[i] === b);
}

// ─── ההמרה ─────────────────────────────────────────────────────────────

export interface DocumentPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  parts: PartInfo[];
  /** אף חלק לא הוקטן ולא נדחס מחדש. */
  lossless: boolean;
  /** הערות גלויות למשרד (שקיפות שוטחה, GIF מונפש וכד'). */
  notes: string[];
}

/** שע״ם: shaam-file-upload חוסם מעל 30MB לקובץ, ומקבל PDF בלבד. */
export const SHAAM_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

/**
 * כמה קבצים של **אותו מסמך** (למשל שני צדי תעודה) ⇒ PDF אחד, לפי הסדר.
 * PDF נכנס כמו שהוא (כל העמודים); JPEG/PNG הופך לעמוד. כל פורמט אחר
 * ⇒ ImageConversionError — ולא מדלגים עליו בשקט: דף שנשמט הוא מסמך חסר
 * שמתגלה רק אצל הרשות.
 * ‼ 204 · שע״ם מקבלת בכל שורת מסמך קובץ PDF אחד בלבד.
 * @param opts.maxBytes מגבלת היעד. חריגה ⇒ 'too_large' — לא דחיסה שקטה.
 */
export async function buildDocumentPdfWith(
  lib: PdfLib, parts: PdfPart[], opts: { maxBytes?: number; partInfo?: Partial<PartInfo>[] } = {},
): Promise<DocumentPdfResult> {
  if (!parts.length) throw new ImageConversionError('אין קבצים לאחד.', 'empty', 'לבחור לפחות קובץ אחד.');
  const out = await lib.PDFDocument.create();
  const infos: PartInfo[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    try {
      if (isRaw(part)) {
        infos.push({ ...addRawPage(lib, out, part), ...(opts.partInfo?.[i] ?? {}) });
        continue;
      }
      if (isPdfBytes(part)) {
        let src;
        try { src = await lib.PDFDocument.load(part, { ignoreEncryption: false }); }
        catch (e) {
          const encrypted = /encrypt/i.test(String((e as Error)?.message ?? e));
          throw encrypted
            ? new ImageConversionError('קובץ ה-PDF מוגן בסיסמה, ולכן אי אפשר לצרף אותו.', 'encrypted',
              'לבקש קובץ בלי סיסמה, או לצלם את המסמך.')
            : new ImageConversionError('קובץ ה-PDF פגום, ולכן אי אפשר לצרף אותו.', 'corrupt', REUPLOAD);
        }
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
        infos.push({ format: 'pdf', pages: pages.length, ...(opts.partInfo?.[i] ?? {}) });
        continue;
      }
      const info = await addImagePage(lib, out, part);
      infos.push({ ...info, ...(opts.partInfo?.[i] ?? {}) });
    } catch (e) {
      if (e instanceof ImageConversionError) { e.partIndex = i; throw e; }
      throw e;
    }
  }
  const pageCount = out.getPageCount();
  const bytes: Uint8Array = await out.save();
  // ‼ קריא ומתאים ליעד: PDF אמיתי, עמוד לכל חלק לפחות.
  if (!isPdfBytes(bytes) || pageCount < parts.length) {
    throw new ImageConversionError('ה-PDF שנוצר אינו תקין, ולכן לא נשמר.', 'corrupt', REUPLOAD);
  }
  if (opts.maxBytes && bytes.byteLength > opts.maxBytes) {
    throw new ImageConversionError(
      `ה-PDF שנוצר גדול מדי ליעד (${(bytes.byteLength / 1048576).toFixed(1)}MB, מותר עד ${Math.round(opts.maxBytes / 1048576)}MB).`,
      'too_large', 'להעלות צילום ברזולוציה רגילה (לא סריקה ענקית), או קובץ PDF קטן יותר.');
  }
  const notes: string[] = [];
  if (infos.some(p => p.flattened === 'grey')) notes.push('לתמונה היה רקע שקוף ותוכן בהיר — היא הונחה על רקע אפור כדי שהתוכן ייראה.');
  if (infos.some(p => p.from === 'gif')) notes.push('מקובץ GIF נשמר רק הפריים הראשון.');
  if (infos.some(p => p.recompressed && !p.downscaled)) notes.push('כדי לעמוד במגבלת הגודל של היעד התמונה נשמרה כ-JPEG באיכות גבוהה, ברזולוציה המלאה.');
  if (infos.some(p => p.downscaled)) notes.push('כדי לעמוד במגבלת הגודל של היעד התמונה הוקטנה ל-300dpi (קריאה, אבל פחות חדה בהגדלה).');
  return { bytes, pageCount, parts: infos, lossless: !infos.some(p => p.downscaled || p.recompressed), notes };
}

/** תאימות לאחור: אותו דבר, מחזיר רק בייטים ומספר עמודים. */
export async function documentPartsToPdfWith(lib: PdfLib, parts: Uint8Array[]): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const r = await buildDocumentPdfWith(lib, parts);
  return { bytes: r.bytes, pageCount: r.pageCount };
}

/**
 * בונה PDF בן עמוד אחד מתצלום. זורק ImageConversionError עם נוסח עברי
 * מוכן להצגה — לקורא אין מה לתרגם.
 */
export async function imageToPdfBytesWith(lib: PdfLib, bytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await lib.PDFDocument.create();
  await addImagePage(lib, pdf, bytes);
  return pdf.save();
}

// ─── זהות ה-PDF הנגזר ──────────────────────────────────────────────────

/**
 * מזהה ה-PDF שנגזר מקבוצת מקורות: pdf-<24 תווי sha256 של המזהים הממוינים>.
 * ‼ זהה בדפדפן, בשרת ובמסד (_pdf_build_id, 210) — שלושתם כותבים לאותה רשומה,
 * ולכן אין קבצים כפולים גם כשכמה מסלולים בונים במקביל.
 */
export async function pdfVersionIdFor(sourceIds: string[]): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([...sourceIds].sort().join('|')));
  return `pdf-${[...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
}

// ─── שם הקובץ ──────────────────────────────────────────────────────────

/** 'תלוש שכר 1.jpg' → 'תלוש שכר 1.pdf'. קובץ בלי סיומת פשוט מקבל אחת. */
export function pdfFileNameFor(originalFileName: string): string {
  const clean = (originalFileName || '').trim() || 'מסמך';
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return `${base}.pdf`;
}
