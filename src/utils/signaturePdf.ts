// ─── הטבעת חתימות/חותמות/טקסט על PDF שהועלה ──────────────────────────────
// מקבל PDF כלשהו + הגדרות שדות (SignatureField, במיקום יחסי) + הערכים שמולאו
// ב"חדר החתימה" (SignatureValue), ומצייר כל ערך במיקום המדויק על העמוד.
//
// המרת קואורדינטות: SignatureField עובד בציר top-left (yPct מלמעלה),
// ואילו pdf-lib בציר bottom-left. לכן y = pageHeight - yTop - boxHeight.

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SignatureField, SignatureValue } from '../types';
import { embedPdfFonts, bidiVisualRTL, measureMixed, drawMixedVisual, PdfFonts } from './pdfHebrew';

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isJpg: boolean } | null {
  const [meta, base64] = dataUrl.split(',');
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, isJpg: /jpe?g/i.test(meta) };
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

    const { width: pw, height: ph } = page.getSize();
    const boxX = field.xPct * pw;
    const boxW = field.widthPct * pw;
    const boxH = field.heightPct * ph;
    const boxY = ph - field.yPct * ph - boxH; // top-left → bottom-left

    // ── תוכן קבוע שהרו"ח הניח בעת ההפקה — נצרב תמיד, ללא ערך מחותם ──
    if (field.kind === 'check' || field.kind === 'cross') {
      const cx = boxX + boxW / 2;
      const cy = boxY + boxH / 2;
      const s = Math.min(boxW, boxH) * 0.5;
      const line = (x1: number, y1: number, x2: number, y2: number) =>
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: Math.max(1.1, s * 0.18), color: rgb(0, 0, 0) });
      if (field.kind === 'check') {
        line(cx - s, cy, cx - s * 0.25, cy - s * 0.7);
        line(cx - s * 0.25, cy - s * 0.7, cx + s, cy + s * 0.7);
      } else {
        line(cx - s, cy - s * 0.8, cx + s, cy + s * 0.8);
        line(cx - s, cy + s * 0.8, cx + s, cy - s * 0.8);
      }
      continue;
    }
    if (field.kind === 'label') {
      const raw = field.staticText || '';
      if (!raw) continue;
      const visual = bidiVisualRTL(raw);
      let size = Math.min(boxH * 0.72, 12);
      let tw = measureMixed(visual, size, fonts);
      if (tw > boxW && tw > 0) { size = size * (boxW / tw); tw = measureMixed(visual, size, fonts); }
      drawMixedVisual(page, visual, boxX + (boxW - tw) / 2, boxY + (boxH - size) / 2 + size * 0.15, size, fonts);
      continue;
    }
    if (!val) continue;

    if ((field.kind === 'signature' || field.kind === 'stamp') && val.imageDataUrl) {
      const parsed = dataUrlToBytes(val.imageDataUrl);
      if (!parsed) continue;
      const img = parsed.isJpg ? await doc.embedJpg(parsed.bytes) : await doc.embedPng(parsed.bytes);
      // התאמה לתוך התיבה תוך שמירת יחס גובה-רוחב, ממורכז
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      page.drawImage(img, {
        x: boxX + (boxW - dw) / 2,
        y: boxY + (boxH - dh) / 2,
        width: dw,
        height: dh,
      });
    } else if (field.kind === 'text' && val.text) {
      const visual = bidiVisualRTL(val.text);
      let size = Math.min(boxH * 0.72, 14);
      let tw = measureMixed(visual, size, fonts);
      if (tw > boxW && tw > 0) {
        size = size * (boxW / tw);
        tw = measureMixed(visual, size, fonts);
      }
      drawMixedVisual(page, visual, boxX + (boxW - tw) / 2, boxY + (boxH - size) / 2 + size * 0.15, size, fonts);
    }
  }

  return doc.save();
}
