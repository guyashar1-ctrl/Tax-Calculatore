// ─── הטבעת חתימות/חותמות/טקסט על PDF שהועלה ──────────────────────────────
// מקבל PDF כלשהו + הגדרות שדות (SignatureField, במיקום יחסי) + הערכים שמולאו
// ב"חדר החתימה" (SignatureValue), ומצייר כל ערך במיקום המדויק על העמוד.
//
// המרת קואורדינטות: SignatureField יחסי לעמוד *כפי שהוא מוצג* (top-left, אחרי
// סיבוב, על ה-CropBox) — ולכן המיפוי עובר ב-displayRectToPage/visibleBox של
// עורך ה-PDF, אותה טרנספורמציה בדיוק. עמוד רגיל (בלי סיבוב, CropBox=MediaBox)
// ⇒ בדיוק y = pageHeight - yTop - boxHeight כמו קודם.

import { PDFDocument, PDFFont, PDFImage, PDFPage, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SignatureField, SignatureValue } from '../types';
import { embedPdfFonts, layoutMixed, measureMixed, PdfFonts, type TextSegment } from './pdfHebrew';
import { displayPointToPage, displayRectToPage, uprightRotation, visibleBox, type PageBox, type PlacedRect } from './pdfAnnotations';

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isJpg: boolean } | null {
  const [meta, base64] = dataUrl.split(',');
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, isJpg: /jpe?g/i.test(meta) };
}

/**
 * תמונה זקופה בעיני הצופה, ממורכזת ומוקטנת לתוך מלבן במרחב העמוד.
 * ‼ בעמוד מסובב R (עם כיוון השעון בתצוגה) מציירים בסיבוב R נגד כיוון השעון,
 * והעוגן הוא הפינה ש-pdf-lib מסובב סביבה.
 */
export function drawUprightImage(page: PDFPage, img: PDFImage | { width: number; height: number }, r: PlacedRect, rotation: number) {
  const rot = uprightRotation(rotation);
  const quarter = rot === 90 || rot === 270;
  const availW = quarter ? r.height : r.width;   // רוחב בעיני הצופה
  const availH = quarter ? r.width : r.height;
  const scale = Math.min(availW / img.width, availH / img.height);
  const w = img.width * scale, h = img.height * scale;
  let x: number, y: number;
  switch (rot) {
    case 90: x = r.x + (r.width + h) / 2; y = r.y + (r.height - w) / 2; break;
    case 180: x = r.x + (r.width + w) / 2; y = r.y + (r.height + h) / 2; break;
    case 270: x = r.x + (r.width - h) / 2; y = r.y + (r.height + w) / 2; break;
    default: x = r.x + (r.width - w) / 2; y = r.y + (r.height - h) / 2;
  }
  page.drawImage(img as PDFImage, { x, y, width: w, height: h, rotate: degrees(rot) });
}

/** שורת טקסט מעורבת מנקודת התחלה בתצוגה, לאורך ציר הקריאה של הצופה. */
function drawMixedAt(page: PDFPage, box: PageBox, segs: TextSegment[], dx: number, dy: number, dW: number, dH: number, size: number, fonts: PdfFonts) {
  const rot = uprightRotation(box.rotation);
  const rad = (rot * Math.PI) / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  const start = displayPointToPage(box, dx / dW, dy / dH);
  let advance = 0;
  for (const seg of segs) {
    const font: PDFFont = seg.rtl ? fonts.hebrew : fonts.latin;
    page.drawText(seg.text, { x: start.x + ux * advance, y: start.y + uy * advance, size, font, color: rgb(0, 0, 0), rotate: degrees(rot) });
    advance += font.widthOfTextAtSize(seg.text, size);
  }
}

/**
 * מטביע את כל הערכים שמולאו על עותק של ה-PDF, ומחזיר bytes סופיים.
 * שדות ללא ערך (val === undefined) פשוט מדולגים.
 */
export async function burnSignaturesIntoPdf(
  pdfBytes: ArrayBuffer,
  fields: SignatureField[],
  values: Record<string, SignatureValue>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  doc.registerFontkit(fontkit);
  const fonts: PdfFonts = await embedPdfFonts(doc);
  const pages = doc.getPages();

  for (const field of fields) {
    const val = values[field.id];
    const isStatic = field.kind === 'label' || field.kind === 'check' || field.kind === 'cross';
    if (!val && !isStatic) continue;
    const page = pages[field.pageIndex];
    if (!page) continue;

    // ‼ מידות התצוגה (אחרי סיבוב, על ה-CropBox) — כך החותם ראה את התיבה.
    const box = visibleBox(page);
    const quarter = uprightRotation(box.rotation) % 180 !== 0;
    const dW = quarter ? box.height : box.width;
    const dH = quarter ? box.width : box.height;
    const bx = field.xPct * dW, by = field.yPct * dH;
    const boxW = field.widthPct * dW, boxH = field.heightPct * dH;
    const pt = (x: number, y: number) => displayPointToPage(box, x / dW, y / dH);

    // ── תוכן קבוע שהרו"ח הניח בעת ההפקה — נצרב תמיד, ללא ערך מחותם ──
    // (קואורדינטות תצוגה, y למטה ⇒ מרחב העמוד נקודה-נקודה)
    if (field.kind === 'check' || field.kind === 'cross') {
      const cx = bx + boxW / 2;
      const cy = by + boxH / 2;
      const s = Math.min(boxW, boxH) * 0.5;
      const line = (x1: number, y1: number, x2: number, y2: number) =>
        page.drawLine({ start: pt(x1, y1), end: pt(x2, y2), thickness: Math.max(1.1, s * 0.18), color: rgb(0, 0, 0) });
      if (field.kind === 'check') {
        line(cx - s, cy, cx - s * 0.25, cy + s * 0.7);
        line(cx - s * 0.25, cy + s * 0.7, cx + s, cy - s * 0.7);
      } else {
        line(cx - s, cy + s * 0.8, cx + s, cy - s * 0.8);
        line(cx - s, cy - s * 0.8, cx + s, cy + s * 0.8);
      }
      continue;
    }
    const drawCentered = (raw: string, maxSize: number) => {
      const segs = layoutMixed(raw);
      let size = Math.min(boxH * 0.72, maxSize);
      let tw = measureMixed(segs, size, fonts);
      if (tw > boxW && tw > 0) { size = size * (boxW / tw); tw = measureMixed(segs, size, fonts); }
      // קו הבסיס בתצוגה — אותו מיקום כמו קודם: תחתית, חצי הריווח, 0.15 גופן
      const baseline = by + boxH - ((boxH - size) / 2 + size * 0.15);
      drawMixedAt(page, box, segs, bx + (boxW - tw) / 2, baseline, dW, dH, size, fonts);
    };
    if (field.kind === 'label') {
      const raw = field.staticText || '';
      if (!raw) continue;
      drawCentered(raw, 12);
      continue;
    }
    if (!val) continue;

    if ((field.kind === 'signature' || field.kind === 'stamp') && val.imageDataUrl) {
      const parsed = dataUrlToBytes(val.imageDataUrl);
      if (!parsed) continue;
      const img = parsed.isJpg ? await doc.embedJpg(parsed.bytes) : await doc.embedPng(parsed.bytes);
      // התאמה לתוך התיבה תוך שמירת יחס גובה-רוחב, ממורכז, זקוף בעיני הצופה
      drawUprightImage(page, img, displayRectToPage(box, field.xPct, field.yPct, field.widthPct, field.heightPct), box.rotation);
    } else if (field.kind === 'text' && val.text) {
      drawCentered(val.text, 14);
    }
  }

  return doc.save();
}
