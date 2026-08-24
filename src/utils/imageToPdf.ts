// ─── המרת תצלום ל-PDF ──────────────────────────────────────────────────
// לקוחות שולחים צילום של מסמך; רשות המסים מבקשת PDF. ההמרה רצה בדפדפן עם
// pdf-lib — אותה ספרייה שכבר מייצרת כאן ייפוי כוח, הצעות מחיר ומכתבי
// שחרור — והתוצאה נשמרת דרך saveDoc הרגיל. אין צינור אחסון שני.
//
// ‼ אין קידוד מחדש של התמונה: embedJpg מטמיע את זרם ה-JPEG המקורי
// (DCTDecode) ו-embedPng מטמיע את הראסטר בלי אובדן. סריקה שהגיעה קריאה
// יוצאת קריאה באותה מידה — זה כל הרעיון של ההמרה הזו.

import { PDFDocument, degrees } from 'pdf-lib';

export type SupportedImageType = 'image/jpeg' | 'image/png';

/** A4 בנקודות. הרשות מקבלת דפים בגודל תקני, ולא דף בגודל התצלום. */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
/** שוליים צרים: מסמך סרוק צריך לנצל את הדף, לא להצטמצם למרכזו. */
const MARGIN = 24;

// ─── זיהוי סוג ─────────────────────────────────────────────────────────

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * סוג הקובץ לפי התוכן עצמו ולא לפי הסיומת או ה-MIME השמור.
 * ‼ זו הבדיקה הקובעת לפני ההמרה: סיומת היא טקסט שהמשתמש שולט בו, ואילו
 * הבייטים הגיעו מהאחסון אחרי שה-RLS כבר אישר את הגישה אליהם.
 */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && PNG_MAGIC.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

/**
 * האם כדאי להציע המרה על המסמך הזה. זו שאלת תצוגה בלבד — ההכרעה האמיתית
 * נופלת על התוכן ב-sniffImageType. ה-MIME השמור קודם, ורק כשהוא חסר או
 * גנרי נופלים לסיומת (קבצים ישנים נשמרו כ-application/octet-stream).
 */
export function looksConvertible(fileType?: string | null, fileName?: string | null): boolean {
  const mime = (fileType || '').trim().toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') return true;
  if (mime && mime !== 'application/octet-stream') return false;
  return /\.(jpe?g|png)$/i.test(fileName || '');
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

// ─── ההמרה ─────────────────────────────────────────────────────────────

export class ImageConversionError extends Error {}

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

/**
 * בונה PDF בן עמוד אחד מתצלום. זורק ImageConversionError עם נוסח עברי
 * מוכן להצגה — לקורא אין מה לתרגם.
 */
export async function imageToPdfBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const kind = sniffImageType(bytes);
  if (!kind) {
    throw new ImageConversionError('הקובץ אינו תצלום JPG או PNG, ולכן אי אפשר להמיר אותו.');
  }

  if (isTruncated(bytes, kind)) {
    throw new ImageConversionError('התצלום נראה חתוך או פגום, ולכן לא הומר. נסה להעלות אותו מחדש.');
  }

  const pdf = await PDFDocument.create();
  let image;
  try {
    image = kind === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch {
    throw new ImageConversionError('לא הצלחנו לקרוא את התצלום - ייתכן שהקובץ פגום.');
  }

  const orientation = kind === 'image/jpeg' ? readJpegOrientation(bytes) : 1;
  const natW = swapsAxes(orientation) ? image.height : image.width;
  const natH = swapsAxes(orientation) ? image.width : image.height;
  if (!natW || !natH) {
    throw new ImageConversionError('לא הצלחנו לקרוא את מידות התצלום.');
  }

  // דף לרוחב לתצלום רחב, לאורך לתצלום גבוה — כדי שהתמונה תמלא את הדף
  // במקום להצטמצם לרצועה עם שוליים ענקיים משני צדדיה.
  const landscape = natW > natH;
  const pageW = landscape ? A4_LONG : A4_SHORT;
  const pageH = landscape ? A4_SHORT : A4_LONG;
  const boxW = pageW - MARGIN * 2;
  const boxH = pageH - MARGIN * 2;

  const scale = Math.min(boxW / natW, boxH / natH);
  const dw = natW * scale;
  const dh = natH * scale;
  const bx = (pageW - dw) / 2;
  const by = (pageH - dh) / 2;

  const page = pdf.addPage([pageW, pageH]);
  const place = placeForOrientation(orientation, bx, by, dw, dh);
  page.drawImage(image, {
    x: place.x, y: place.y,
    width: place.width, height: place.height,
    rotate: degrees(place.rotate),
  });

  return pdf.save();
}

// ─── שם הקובץ ──────────────────────────────────────────────────────────

/** 'תלוש שכר 1.jpg' → 'תלוש שכר 1.pdf'. קובץ בלי סיומת פשוט מקבל אחת. */
export function pdfFileNameFor(originalFileName: string): string {
  const clean = (originalFileName || '').trim() || 'מסמך';
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return `${base}.pdf`;
}
