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

// רצפים לטיניים שאסור לפרק לתווים ניטרליים: כתובות מייל, אתרים, ומספרים
// מחוברים במקף — "2026-003" (מספר הצעה) ו-"050-1234567" (טלפון). בלי זה המקף
// נחשב ניטרלי, שני חלקי המספר מתחלפים, והמסמך מציג מספר הצעה הפוך.
const ATOMIC_LTR = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/[^\s]+|www\.[^\s]+|\d+(?:-\d+)+/g;

export interface TextSegment { rtl: boolean; text: string; }

/**
 * פירוק טקסט למקטעים בסדר ויזואלי (לציור משמאל לימין):
 * fontkit כבר הופך בעצמו רצף עברי בתוך drawText — לכן רצף עברי נשאר בסדר
 * הלוגי שלו, ואנחנו הופכים רק את סדר הרצפים.
 *
 * שני לקחים מהשטח (הצעת מחיר 2026-002 שיצאה מלאה ריבועים):
 * 1. סימני פיסוק (פסיק, פלוס, סוגריים, נקודה-אמצעית) שהודבקו לרצף העברי צוירו
 *    בפונט העברי — שאינו מכיל אותם. לכן פיסוק ורווחים הם עכשיו מקטעים עצמאיים
 *    שמצוירים בפונט הלטיני (שמכיל את כולם), והם משתתפים בהיפוך כך שהמיקום נשמר.
 * 2. שני מספרים שהודבקו דרך פיסוק ("2027: 162") הפכו לרצף לטיני אחד והתערבבו.
 *    עכשיו רק סיומות מספר (אחוז, נקודה, פסיק-אלפים, נקודתיים) נצמדות לספרות.
 */
export function layoutMixed(text: string): TextSegment[] {
  if (!hasHebrew(text)) return [{ rtl: false, text }];
  type Cls = 'R' | 'L' | 'N';
  const cls = (ch: string): Cls => isHebChar(ch) ? 'R' : /[A-Za-z0-9@]/.test(ch) ? 'L' : 'N';
  const NUM_TRAIL = /[%,.:]/;   // 30% · 1,800 · 3.5 · 12:30 — נשארים מקשה אחת
  const runs: { cls: Cls; text: string; atomic?: boolean }[] = [];

  const pushChar = (ch: string) => {
    const c = cls(ch);
    const prev = runs[runs.length - 1];
    if (c === 'N' && NUM_TRAIL.test(ch) && prev?.cls === 'L' && !prev.atomic && /[0-9]$/.test(prev.text)) {
      prev.text += ch;
      return;
    }
    if (prev && prev.cls === c && !prev.atomic) prev.text += ch;
    else runs.push({ cls: c, text: ch });
  };

  // כתובת מייל / אתר היא יחידה אחת ואסור לפרק אותה: "guy@yasharcpa.co.il"
  // מכיל נקודות שהן תווים ניטרליים, ופירוקן הפך את הכתובת ל"il.co.guy@..."
  // בכל שורה שהיה בה גם טקסט עברי (למשל כתובת המשרד לצד המייל).
  let last = 0;
  for (const m of text.matchAll(ATOMIC_LTR)) {
    for (const ch of text.slice(last, m.index)) pushChar(ch);
    runs.push({ cls: 'L', text: m[0], atomic: true });
    last = (m.index ?? 0) + m[0].length;
  }
  for (const ch of text.slice(last)) pushChar(ch);

  return runs.reverse().map(r => {
    if (r.cls === 'R') {
      return { rtl: true, text: r.text.replace(/"/g, '״').replace(/'/g, '׳') };
    }
    if (r.cls === 'N') {
      // מקטע ניטרלי מתהפך תו-תו יחד עם היפוך הרצפים — כדי ש"." שאחרי ")"
      // יישאר בקצה השמאלי של המשפט ולא באמצעו
      return { rtl: false, text: [...r.text].reverse().join('') };
    }
    return { rtl: false, text: r.text };
  });
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
