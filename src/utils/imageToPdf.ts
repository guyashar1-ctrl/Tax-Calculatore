// ─── המרת תצלום ל-PDF — בדפדפן ─────────────────────────────────────────
// לקוחות שולחים צילום של מסמך; רשות המסים מבקשת PDF. ההמרה רצה בדפדפן עם
// pdf-lib — אותה ספרייה שכבר מייצרת כאן ייפוי כוח, הצעות מחיר ומכתבי
// שחרור — והתוצאה נשמרת דרך saveDoc הרגיל. אין צינור אחסון שני.
//
// ‼ 204 · המימוש עצמו עבר ל-supabase/functions/_shared/imageToPdfCore.ts,
// כדי שהשרת (automation-worker) ימיר מסמך מזהה לשע״ם באותו קוד בדיוק.
// כאן רק מזריקים את pdf-lib של הדפדפן — ה-API לא השתנה.

import { PDFDocument, degrees } from 'pdf-lib';
import {
  imageToPdfBytesWith, documentPartsToPdfWith, type PdfLib,
} from '../../supabase/functions/_shared/imageToPdfCore.ts';

export {
  sniffImageType, looksConvertible, readJpegOrientation, placeForOrientation, swapsAxes,
  ImageConversionError, pdfFileNameFor, isPdfBytes,
  type SupportedImageType,
} from '../../supabase/functions/_shared/imageToPdfCore.ts';

const LIB: PdfLib = { PDFDocument, degrees } as unknown as PdfLib;

/**
 * בונה PDF בן עמוד אחד מתצלום. זורק ImageConversionError עם נוסח עברי
 * מוכן להצגה — לקורא אין מה לתרגם.
 */
export function imageToPdfBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return imageToPdfBytesWith(LIB, bytes);
}

/** כמה קבצים של אותו מסמך ⇒ PDF אחד. ראה documentPartsToPdfWith. */
export function documentPartsToPdf(parts: Uint8Array[]): Promise<{ bytes: Uint8Array; pageCount: number }> {
  return documentPartsToPdfWith(LIB, parts);
}
