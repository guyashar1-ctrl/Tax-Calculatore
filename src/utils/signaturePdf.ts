// ─── הטבעת חתימות/חותמות/טקסט על PDF שהועלה ──────────────────────────────
// מקבל PDF כלשהו + הגדרות שדות (SignatureField, במיקום יחסי) + הערכים שמולאו
// ב"חדר החתימה" (SignatureValue), ומצייר כל ערך במיקום המדויק על העמוד.
//
// המרת קואורדינטות: SignatureField עובד בציר top-left (yPct מלמעלה),
// ואילו pdf-lib בציר bottom-left. לכן y = pageHeight - yTop - boxHeight.

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SignatureField, SignatureValue } from '../types';

const FONT_URL = '/fonts/NotoSans-Regular.ttf';
let cachedFont: ArrayBuffer | null = null;

async function getFontBytes(): Promise<ArrayBuffer> {
  if (!cachedFont) {
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`טעינת הפונט נכשלה: ${res.status}`);
    cachedFont = await res.arrayBuffer();
  }
  return cachedFont;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isJpg: boolean } | null {
  const [meta, base64] = dataUrl.split(',');
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, isJpg: /jpe?g/i.test(meta) };
}

// pdf-lib מצייר תמיד LTR — לטקסט עברי הופכים את סדר התווים כך שייקרא נכון.
const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const reverseForRTL = (s: string) => [...s].reverse().join('');

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
  const font = await doc.embedFont(await getFontBytes());
  const pages = doc.getPages();

  for (const field of fields) {
    const val = values[field.id];
    if (!val) continue;
    const page = pages[field.pageIndex];
    if (!page) continue;

    const { width: pw, height: ph } = page.getSize();
    const boxX = field.xPct * pw;
    const boxW = field.widthPct * pw;
    const boxH = field.heightPct * ph;
    const boxY = ph - field.yPct * ph - boxH; // top-left → bottom-left

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
      const text = hasHebrew(val.text) ? reverseForRTL(val.text) : val.text;
      let size = Math.min(boxH * 0.72, 14);
      let tw = font.widthOfTextAtSize(text, size);
      if (tw > boxW && tw > 0) {
        size = size * (boxW / tw);
        tw = font.widthOfTextAtSize(text, size);
      }
      page.drawText(text, {
        x: boxX + (boxW - tw) / 2,
        y: boxY + (boxH - size) / 2 + size * 0.15,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  return doc.save();
}
