// ─── חיתוך עמוד וחילוץ אזור ─────────────────────────────────────────────
// הובא מפרויקט הייחוס (cropPdf.ts) והותאם למודל התוכנית שכאן.
//
// ‼ שני הלקחים החשובים משם, ושניהם נשמרו:
// 1. חיתוך אינו מרסטר. קובעים CropBox — מלבן התצוגה של העמוד — והתוכן,
//    הטקסט והווקטורים נשארים כפי שהם. הפעולה הפיכה לחלוטין.
// 2. CropBox חייב להיות בתוך MediaBox, ו-TrimBox/BleedBox בתוכו. בלי
//    ההצמדה הזו צופים מחמירים (ו-PDF/A) מסרבים לקובץ.

import { PDFDocument, PDFPage, degrees } from 'pdf-lib';

/** מלבן במרחב המשתמש של העמוד — מקור בפינה שמאלית-תחתונה, Y עולה. */
export interface PdfRect { x: number; y: number; width: number; height: number }

/** מלבן חיתוך באחוזים מהעמוד *כפי שהוא מוצג* — כמו הסימונים. */
export interface CropPct { xPct: number; yPct: number; widthPct: number; heightPct: number }

function clampToMediaBox(page: PDFPage, rect: PdfRect): PdfRect {
  const mb = page.getMediaBox();
  const left = Math.max(mb.x, rect.x);
  const bottom = Math.max(mb.y, rect.y);
  const right = Math.min(mb.x + mb.width, rect.x + rect.width);
  const top = Math.min(mb.y + mb.height, rect.y + rect.height);
  return {
    x: left,
    y: bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, top - bottom),
  };
}

/**
 * קובע את אזור התצוגה של עמוד. התוכן והסיבוב לא נוגעים — רק מה שרואים.
 * ‼ TrimBox ו-BleedBox נקבעים יחד עם CropBox: הם חייבים להיות בתוכו.
 */
export function applyCropToPage(page: PDFPage, rect: PdfRect): void {
  const c = clampToMediaBox(page, rect);
  page.setCropBox(c.x, c.y, c.width, c.height);
  page.setBleedBox(c.x, c.y, c.width, c.height);
  page.setTrimBox(c.x, c.y, c.width, c.height);
}

/** ביטול חיתוך — החזרת אזור התצוגה לגודל העמוד המלא. */
export function resetCropOnPage(page: PDFPage): void {
  const mb = page.getMediaBox();
  page.setCropBox(mb.x, mb.y, mb.width, mb.height);
  page.setBleedBox(mb.x, mb.y, mb.width, mb.height);
  page.setTrimBox(mb.x, mb.y, mb.width, mb.height);
}

/**
 * חילוץ אזור מעמוד כמסמך חדש בן עמוד אחד.
 *
 * ‼ המימוש מפרויקט הייחוס: מטמיעים את עמוד המקור כ-XObject חתוך לתיבה,
 * ומניחים אותו על עמוד בגודל התיבה. התוצאה נשארת וקטורית — הטקסט בתוכה
 * עדיין ניתן לחיפוש ולסימון, בניגוד לצילום מסך של האזור.
 * ‼ אם למקור יש סיבוב, מתייגים את העמוד החדש באותו סיבוב — כך הצופה
 * מחליף את הצירים בעצמו והאזור נראה כפי שנבחר.
 */
export async function extractRegionAsPdf(
  sourceBytes: Uint8Array, pageIndex: number, rect: PdfRect,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(sourceBytes);
  if (pageIndex < 0 || pageIndex >= src.getPageCount()) {
    throw new Error('העמוד שנבחר אינו קיים בקובץ.');
  }
  const page = src.getPage(pageIndex);
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const c = clampToMediaBox(page, rect);

  const out = await PDFDocument.create();
  const embedded = await out.embedPage(page, {
    left: c.x, bottom: c.y, right: c.x + c.width, top: c.y + c.height,
  });
  const newPage = out.addPage([c.width, c.height]);
  if (rotation !== 0) newPage.setRotation(degrees(rotation));
  newPage.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return out.save();
}
