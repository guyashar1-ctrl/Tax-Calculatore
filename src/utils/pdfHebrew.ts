// ─── ציור טקסט עברי/מעורב על PDF ─────────────────────────────────────────
// NotoSans-Regular לא מכיל עברית (יוצא ריבועים!) — העברית חיה ב-NotoSansHebrew.
// כאן: טעינת שני הפונטים, סידור ויזואלי נכון (bidi) לטקסט מעורב עברית+ספרות,
// וציור שמפצל כל תו לפונט שמכיל אותו.

import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';

const LATIN_FONT_URL = '/fonts/NotoSans-Regular.ttf';
const HEBREW_FONT_URL = '/fonts/NotoSansHebrew-Regular.ttf';

let cachedLatin: ArrayBuffer | null = null;
let cachedHebrew: ArrayBuffer | null = null;

async function loadFont(url: string, cache: ArrayBuffer | null): Promise<ArrayBuffer> {
  if (cache) return cache;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`טעינת פונט נכשלה: ${url} (${res.status})`);
  return res.arrayBuffer();
}

export interface PdfFonts { latin: PDFFont; hebrew: PDFFont; }

/** מטמיע את שני הפונטים במסמך (לקרוא פעם אחת לכל PDF) */
export async function embedPdfFonts(doc: PDFDocument): Promise<PdfFonts> {
  cachedLatin = await loadFont(LATIN_FONT_URL, cachedLatin);
  cachedHebrew = await loadFont(HEBREW_FONT_URL, cachedHebrew);
  const [latin, hebrew] = await Promise.all([doc.embedFont(cachedLatin), doc.embedFont(cachedHebrew)]);
  return { latin, hebrew };
}

export const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const isHebChar = (ch: string) => /[֐-׿]/.test(ch);

/**
 * סידור ויזואלי לציור LTR של טקסט שבסיסו עברית: הופכים את סדר הרצפים (runs),
 * בתוך רצף עברי הופכים את התווים, ורצפי ספרות/לטינית נשארים כמו שהם —
 * כך "תיק 123 פעיל" נקרא נכון וגם המספרים לא מתהפכים.
 */
export function bidiVisualRTL(text: string): string {
  if (!hasHebrew(text)) return text;
  const cls = (ch: string) => isHebChar(ch) ? 'R' : /[A-Za-z0-9]/.test(ch) ? 'L' : 'N';
  const runs: { rtl: boolean; text: string }[] = [];
  let cur: { rtl: boolean; text: string } | null = null;
  let neutrals = '';
  for (const ch of [...text]) {
    const c = cls(ch);
    if (c === 'N') { neutrals += ch; continue; }
    const rtl = c === 'R';
    if (cur && cur.rtl === rtl) {
      cur.text += neutrals + ch;
    } else {
      if (cur) { cur.text += neutrals; runs.push(cur); }
      else if (neutrals) runs.push({ rtl: true, text: neutrals });
      cur = { rtl, text: ch };
    }
    neutrals = '';
  }
  if (cur) { cur.text += neutrals; runs.push(cur); }
  else if (neutrals) runs.push({ rtl: true, text: neutrals });
  return runs.reverse().map(r => r.rtl ? [...r.text].reverse().join('') : r.text).join('');
}

/** פיצול מחרוזת ויזואלית למקטעים לפי הפונט שמכיל את התווים */
function segmentsByFont(visual: string, fonts: PdfFonts): { font: PDFFont; text: string }[] {
  const segs: { font: PDFFont; text: string }[] = [];
  for (const ch of [...visual]) {
    const font = isHebChar(ch) ? fonts.hebrew : fonts.latin;
    const last = segs[segs.length - 1];
    if (last && last.font === font) last.text += ch;
    else segs.push({ font, text: ch });
  }
  return segs;
}

/** רוחב טקסט ויזואלי בגודל נתון (סכום המקטעים בשני הפונטים) */
export function measureMixed(visual: string, size: number, fonts: PdfFonts): number {
  return segmentsByFont(visual, fonts).reduce((w, s) => w + s.font.widthOfTextAtSize(s.text, size), 0);
}

/** ציור מחרוזת ויזואלית משמאל x — כל מקטע בפונט הנכון */
export function drawMixedVisual(page: PDFPage, visual: string, x: number, y: number, size: number, fonts: PdfFonts) {
  let cx = x;
  for (const seg of segmentsByFont(visual, fonts)) {
    page.drawText(seg.text, { x: cx, y, size, font: seg.font, color: rgb(0, 0, 0) });
    cx += seg.font.widthOfTextAtSize(seg.text, size);
  }
}
