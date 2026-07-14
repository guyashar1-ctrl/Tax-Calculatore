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

export interface TextSegment { rtl: boolean; text: string; }

/**
 * פירוק טקסט למקטעים בסדר ויזואלי (לציור משמאל לימין):
 * fontkit כבר הופך בעצמו רצף עברי בתוך drawText — לכן רצף עברי נשאר בסדר
 * הלוגי שלו (ההיפוך הידני גרם להיפוך כפול!). אנחנו הופכים רק את סדר הרצפים,
 * כדי שבטקסט מעורב ("תיק 123 רו״ח") המילים והמספרים ינחתו במקום הנכון.
 * גרש/גרשיים ASCII מוחלפים בתווים העבריים (״ ׳) שקיימים בפונט העברי.
 */
export function layoutMixed(text: string): TextSegment[] {
  const cls = (ch: string) => isHebChar(ch) ? 'R' : /[A-Za-z0-9]/.test(ch) ? 'L' : 'N';
  if (!hasHebrew(text)) return [{ rtl: false, text }];
  const runs: TextSegment[] = [];
  let cur: TextSegment | null = null;
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
  return runs.reverse().map(r => r.rtl
    ? { ...r, text: r.text.replace(/"/g, '״').replace(/'/g, '׳') }
    : r);
}

const segFont = (seg: TextSegment, fonts: PdfFonts): PDFFont => seg.rtl ? fonts.hebrew : fonts.latin;

/** רוחב כולל של מקטעים בגודל נתון */
export function measureMixed(segments: TextSegment[], size: number, fonts: PdfFonts): number {
  return segments.reduce((w, s) => w + segFont(s, fonts).widthOfTextAtSize(s.text, size), 0);
}

/** ציור המקטעים משמאל x — רצף עברי בפונט העברי (fontkit מסדר את כיוונו) */
export function drawMixedVisual(page: PDFPage, segments: TextSegment[], x: number, y: number, size: number, fonts: PdfFonts) {
  let cx = x;
  for (const seg of segments) {
    const font = segFont(seg, fonts);
    page.drawText(seg.text, { x: cx, y, size, font, color: rgb(0, 0, 0) });
    cx += font.widthOfTextAtSize(seg.text, size);
  }
}
