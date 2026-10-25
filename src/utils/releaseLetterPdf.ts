// ─── PDF של מכתב השחרור ─────────────────────────────────────────────────────
// ‼ 25.10.2026 · קובץ נפרד: pdf-lib והגופנים (כ-600KB) נטענים רק כשמפיקים את ה-PDF,
// ולא עם כל כניסה למערכת (releaseLetter.ts נטען כבר במסך הראשון).

import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed } from './pdfHebrew';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { splitHighlights } from './releaseLetter';

// PDF שמשקף את המייל שנשלח — כותרות מאת/אל/תאריך/נושא ואז גוף המכתב.
export async function generateReleaseEmailPdf(rec: {
  from: string; to: string; date: string; subject: string; bodyText: string;
  /** הקישור שנשלח ככפתור. נרשם בסוף הראיה — אחרת "מה בדיוק נשלח" חסר אותו. */
  uploadUrl?: string;
}, brand: QuotationBrand): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedPdfFonts(doc);
  const ink = hexToRgb(brand.ink);
  const accent = hexToRgb(brand.accent);
  const gray = hexToRgb(brand.muted);
  const A4 = { w: 595.28, h: 841.89 };
  const M = 50, RIGHT = A4.w - M;

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const rtl = (text: string, size: number, color: RGB, yy: number) => {
    const segs = layoutMixed(text);
    const w = measureMixed(segs, size, fonts);
    let cx = RIGHT - w;
    for (const seg of segs) { const f = seg.rtl ? fonts.hebrew : fonts.latin; page.drawText(seg.text, { x: cx, y: yy, size, font: f, color }); cx += f.widthOfTextAtSize(seg.text, size); }
  };
  /**
   * שורת גוף המכתב, עם הבלטה. ‼ הציור נעשה בשני מעברים על אותה שורה: קודם
   * מלבנים צהובים מתחת לקטעים המובלטים, ואז הטקסט מעליהם. הרוחב של כל קטע
   * נמדד בנפרד ומצטבר משמאל לימין — אותה מתמטיקה של rtl() למעלה, ולכן
   * ההבלטה יושבת בדיוק מתחת למילים שלה גם בשורה מעורבת עברית-לועזית.
   */
  const rtlMarked = (parts: { text: string; mark: boolean }[], size: number, yy: number) => {
    // הסדר הוויזואלי הוא ימין-לשמאל: הקטע הראשון בטקסט מצויר הכי ימינה.
    const measured = parts.map(p => {
      const segs = layoutMixed(p.text);
      return { ...p, segs, w: measureMixed(segs, size, fonts) };
    });
    const total = measured.reduce((s, p) => s + p.w, 0);
    let cx = RIGHT - total;
    for (const p of [...measured].reverse()) {
      if (p.mark && p.w > 0) {
        page.drawRectangle({
          x: cx - 1, y: yy - size * 0.22, width: p.w + 2, height: size * 1.16,
          color: rgb(0.99, 0.95, 0.77),
        });
      }
      cx += p.w;
    }
    cx = RIGHT - total;
    for (const p of [...measured].reverse()) {
      for (const seg of p.segs) {
        const f = seg.rtl ? fonts.hebrew : fonts.latin;
        page.drawText(seg.text, { x: cx, y: yy, size, font: f, color: ink });
        cx += f.widthOfTextAtSize(seg.text, size);
      }
    }
  };
  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([A4.w, A4.h]); y = A4.h - M; } };

  page.drawRectangle({ x: 0, y: A4.h - 5, width: A4.w, height: 5, color: accent });
  rtl(brand.firmName, 15, ink, y); y -= 30;
  rtl('העברת הטיפול בתיק - רו״ח קודם', 12, accent, y); y -= 22;

  // בלוק כותרות המייל
  for (const [label, val] of [['מאת', rec.from], ['אל', rec.to], ['תאריך', rec.date], ['נושא', rec.subject]]) {
    ensure(18);
    rtl(`${label}: ${val}`, 10.5, gray, y);
    y -= 17;
  }
  y -= 6;
  page.drawRectangle({ x: M, y, width: A4.w - M * 2, height: 0.6, color: hexToRgb(brand.border) });
  y -= 18;

  // גוף המכתב — עם ההבלטות שסומנו בו (ראה rtlMarked).
  for (const paragraph of rec.bodyText.split('\n')) {
    for (const line of wrapMarked(paragraph, 92)) {
      ensure(16);
      if (line.some(p => p.mark)) rtlMarked(line, 11, y);
      else rtl(line.map(p => p.text).join('') || ' ', 11, ink, y);
      y -= 16;
    }
  }

  if (rec.uploadUrl) {
    y -= 10;
    ensure(34);
    rtl('הכפתור במייל הוביל אל:', 10.5, gray, y); y -= 15;
    // כתובת לועזית — משמאל לימין, כמו שהיא.
    page.drawText(rec.uploadUrl, { x: M, y, size: 9, font: fonts.latin, color: gray });
  }
  return doc.save();
}

/**
 * גלישת שורות ששומרת על סימוני ההבלטה. ‼ הגלישה חייבת לעבוד על הטקסט
 * **בלי** תווי הסימון — אחרת "==" נספר ברוחב השורה, ובשורה שנשברה באמצע
 * הסימון היה נחתך לשניים ומופיע כטקסט.
 */
function wrapMarked(paragraph: string, maxChars: number): { text: string; mark: boolean }[][] {
  const words: { text: string; mark: boolean }[] = [];
  for (const part of splitHighlights(paragraph)) {
    const chunks = part.text.split(/(\s+)/).filter(s => s !== '');
    for (const c of chunks) words.push({ text: c, mark: part.mark });
  }
  if (!words.length) return [[{ text: '', mark: false }]];

  const lines: { text: string; mark: boolean }[][] = [];
  let line: { text: string; mark: boolean }[] = [];
  let len = 0;
  for (const w of words) {
    const isSpace = /^\s+$/.test(w.text);
    if (len + w.text.length > maxChars && len > 0 && !isSpace) {
      lines.push(mergeAdjacent(line));
      line = []; len = 0;
    }
    if (isSpace && len === 0) continue;   // רווח בתחילת שורה שנשברה
    line.push(w);
    len += w.text.length;
  }
  if (line.length) lines.push(mergeAdjacent(line));
  return lines.length ? lines : [[{ text: '', mark: false }]];
}

/** איחוד מילים סמוכות בעלות אותו סימון — פחות מקטעים, מדידה יציבה יותר. */
function mergeAdjacent(parts: { text: string; mark: boolean }[]): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev && prev.mark === p.mark) prev.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return rgb(0.1, 0.1, 0.1);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

