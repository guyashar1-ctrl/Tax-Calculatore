// ─── סימונים על עמוד PDF ───────────────────────────────────────────────
// מודל אחד לכל מה שמוסיפים על עמוד: טקסט, הדגשה, צורות, ציור חופשי,
// ✓/✗ ותמונה. הצריבה עצמה נעשית ב-pdf-lib, ובסוף בניית המסמך — כך שכל
// עוד לא לחצו "צור", שום דבר לא נגע בקובץ המקור.
//
// מה הובא מפרויקט הייחוס: רשימת הסוגים, חישוב ה-Y ההפוך (מסך יורד ↔ PDF
// עולה), מטמון התמונות כדי שאותה תמונה לא תוטבע פעמיים, וההפרדה בין
// מסגרת למילוי. מה שהוחלף: עיצוב הטקסט העברי. פרויקט הייחוס נשען על
// bidi-js, ואילו כאן כבר קיים pdfHebrew.ts שנשחק על הצעות מחיר ומכתבים
// אמיתיים ויודע גם מייל, אתר, טלפון ואחוזים — אין סיבה להביא מנוע שני.
//
// ‼ הקואורדינטות באחוזים ולא בנקודות, כמו SignatureField: כך סימון שנוצר
// בתצוגה מוקטנת יושב באותו מקום בדיוק גם על הדף המלא.

import { PDFDocument, PDFFont, PDFImage, PDFPage, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed, PdfFonts } from './pdfHebrew';

export type AnnotationKind =
  | 'text' | 'highlight' | 'rectangle' | 'circle' | 'line'
  | 'draw' | 'check' | 'cross' | 'image';

export interface Annotation {
  id: string;
  /** מזהה העמוד בתוכנית שאליו הסימון שייך — הוא נוסע איתו בסידור מחדש. */
  pageId: string;
  kind: AnnotationKind;
  /** אחוזים מהעמוד *כפי שהוא מוצג*, מהפינה השמאלית-עליונה. */
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  color: string;
  fillColor?: string | null;
  text?: string;
  /** גודל הטקסט באחוז מגובה העמוד — כדי שלא ישתנה עם הזום. */
  fontPct?: number;
  /** נקודות ציור חופשי, יחסית לתיבה (0..1). */
  points?: { x: number; y: number }[];
  /** עובי קו באחוז מרוחב העמוד. */
  thicknessPct?: number;
  imageData?: string;
}

export const ANNOTATION_LABELS: Record<AnnotationKind, string> = {
  text: 'טקסט',
  highlight: 'הדגשה',
  rectangle: 'מלבן',
  circle: 'עיגול',
  line: 'קו',
  draw: 'ציור',
  check: 'סימון ✓',
  cross: 'סימון ✗',
  image: 'תמונה',
};

// ─── צבע ───────────────────────────────────────────────────────────────

export function hexToRgb(hex: string) {
  const h = (hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return rgb(0, 0, 0);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ─── מיפוי מהתצוגה אל מרחב העמוד ───────────────────────────────────────

export interface PageBox {
  /** מידות העמוד *הלא מסובב*, בנקודות. */
  width: number;
  height: number;
  /** סיבוב העמוד כפי שהצופה מיישם אותו, במעלות עם כיוון השעון. */
  rotation: number;
}

export interface PlacedRect { x: number; y: number; width: number; height: number }

/**
 * ממיר מלבן שהמשתמש צייר על התצוגה למלבן במרחב העמוד של pdf-lib.
 *
 * ‼ שתי המרות בבת אחת, וזה המקום היחיד שבו הן קורות:
 * 1. ציר ה-Y מתהפך — במסך הוא יורד מלמעלה, ב-PDF הוא עולה מלמטה.
 * 2. אם לעמוד יש סיבוב, מה שהמשתמש ראה אינו מערכת הצירים של העמוד.
 *    ב-90° ו-270° גם רוחב וגובה מתחלפים.
 * הנוסחאות נגזרו ממיפוי ארבע הפינות ואומתו מול רינדור של PDF שנוצר.
 */
export function displayRectToPage(
  box: PageBox, xPct: number, yPct: number, wPct: number, hPct: number,
): PlacedRect {
  const rot = ((Math.round(box.rotation / 90) * 90) % 360 + 360) % 360;
  const quarter = rot === 90 || rot === 270;
  // מידות התצוגה
  const dW = quarter ? box.height : box.width;
  const dH = quarter ? box.width : box.height;
  const dx = xPct * dW, dy = yPct * dH, dw = wPct * dW, dh = hPct * dH;
  const W = box.width, H = box.height;

  switch (rot) {
    case 90: return { x: dy, y: dx, width: dh, height: dw };
    case 180: return { x: W - dx - dw, y: dy, width: dw, height: dh };
    case 270: return { x: W - dy - dh, y: H - dx - dw, width: dh, height: dw };
    default: return { x: dx, y: H - dy - dh, width: dw, height: dh };
  }
}

/** נקודה בודדת מהתצוגה אל מרחב העמוד (לציור חופשי ולקווים). */
export function displayPointToPage(box: PageBox, xPct: number, yPct: number): { x: number; y: number } {
  const r = displayRectToPage(box, xPct, yPct, 0, 0);
  return { x: r.x, y: r.y };
}

/**
 * כמה צריך לסובב תוכן שנצרב, כדי שייראה זקוף אחרי שהצופה מסובב את העמוד.
 * pdf-lib מסובב נגד כיוון השעון, והצופה מסובב עם כיוון השעון — ולכן
 * הזווית זהה בערכה.
 */
export function uprightRotation(rotation: number): number {
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

// ─── ציור טקסט (עברית/מעורב) ───────────────────────────────────────────

/**
 * מצייר שורה מעורבת בזווית. ‼ drawMixedVisual של pdfHebrew אינו יודע
 * לסובב, ולכן ההתקדמות בין המקטעים מחושבת כאן לאורך הציר המסובב.
 */
function drawMixedRotated(
  page: PDFPage, text: string, x: number, y: number, size: number,
  fonts: PdfFonts, color: ReturnType<typeof rgb>, rotation: number,
) {
  const segs = layoutMixed(text);
  const rad = (rotation * Math.PI) / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  let advance = 0;
  for (const seg of segs) {
    const font: PDFFont = seg.rtl ? fonts.hebrew : fonts.latin;
    page.drawText(seg.text, {
      x: x + ux * advance,
      y: y + uy * advance,
      size, font, color,
      rotate: degrees(rotation),
    });
    advance += font.widthOfTextAtSize(seg.text, size);
  }
}

// ─── הצריבה ────────────────────────────────────────────────────────────

export class AnnotationError extends Error {}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isJpg: boolean } | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, isJpg: /jpe?g/i.test(meta) };
  } catch {
    return null;
  }
}

export interface BurnContext {
  doc: PDFDocument;
  fonts: PdfFonts;
  /** ‼ אותה תמונה שהונחה כמה פעמים מוטבעת פעם אחת — אחרת הקובץ מתנפח. */
  imageCache: Map<string, PDFImage>;
}

export async function createBurnContext(doc: PDFDocument): Promise<BurnContext> {
  // ‼ חובה לפני הטמעת גופן TTF. בלי זה pdf-lib זורק, וכל צריבת טקסט
  // נופלת — בדיוק כמו ב-signaturePdf שרושם אותו מאותה סיבה.
  doc.registerFontkit(fontkit);
  const fonts = await embedPdfFonts(doc);
  return { doc, fonts, imageCache: new Map() };
}

/** מצייר את כל הסימונים של עמוד אחד. */
export async function drawAnnotations(
  page: PDFPage, annotations: Annotation[], ctx: BurnContext, box: PageBox,
): Promise<void> {
  const upright = uprightRotation(box.rotation);
  const quarter = upright === 90 || upright === 270;
  const dW = quarter ? box.height : box.width;
  const dH = quarter ? box.width : box.height;

  for (const ann of annotations) {
    const color = hexToRgb(ann.color);
    const r = displayRectToPage(box, ann.xPct, ann.yPct, ann.widthPct, ann.heightPct);
    const thickness = Math.max(0.6, (ann.thicknessPct ?? 0.004) * box.width);

    switch (ann.kind) {
      case 'highlight':
        page.drawRectangle({ ...r, color, opacity: 0.35, rotate: degrees(0) });
        break;

      case 'rectangle':
        page.drawRectangle({
          ...r,
          borderColor: color,
          borderWidth: thickness,
          ...(ann.fillColor ? { color: hexToRgb(ann.fillColor) } : {}),
        });
        break;

      case 'circle':
        page.drawEllipse({
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          xScale: Math.max(0.5, r.width / 2),
          yScale: Math.max(0.5, r.height / 2),
          borderColor: color,
          borderWidth: thickness,
          ...(ann.fillColor ? { color: hexToRgb(ann.fillColor) } : {}),
        });
        break;

      case 'line': {
        // קו נשמר כאלכסון התיבה: מהפינה העליונה-שמאלית לתחתונה-ימנית בתצוגה
        const a = displayPointToPage(box, ann.xPct, ann.yPct);
        const b = displayPointToPage(box, ann.xPct + ann.widthPct, ann.yPct + ann.heightPct);
        page.drawLine({ start: a, end: b, color, thickness });
        break;
      }

      case 'draw': {
        const pts = ann.points ?? [];
        if (pts.length < 2) break;
        for (let i = 1; i < pts.length; i++) {
          const a = displayPointToPage(box, ann.xPct + pts[i - 1].x * ann.widthPct, ann.yPct + pts[i - 1].y * ann.heightPct);
          const b = displayPointToPage(box, ann.xPct + pts[i].x * ann.widthPct, ann.yPct + pts[i].y * ann.heightPct);
          page.drawLine({ start: a, end: b, color, thickness });
        }
        break;
      }

      case 'check':
      case 'cross': {
        // הצורה נבנית מנקודות בתצוגה, ולכן היא נראית נכון גם על עמוד מסובב
        const p = (fx: number, fy: number) =>
          displayPointToPage(box, ann.xPct + fx * ann.widthPct, ann.yPct + fy * ann.heightPct);
        const w = Math.max(1.2, Math.min(r.width, r.height) * 0.14);
        if (ann.kind === 'check') {
          page.drawLine({ start: p(0.12, 0.52), end: p(0.42, 0.84), color, thickness: w });
          page.drawLine({ start: p(0.42, 0.84), end: p(0.88, 0.16), color, thickness: w });
        } else {
          page.drawLine({ start: p(0.14, 0.14), end: p(0.86, 0.86), color, thickness: w });
          page.drawLine({ start: p(0.86, 0.14), end: p(0.14, 0.86), color, thickness: w });
        }
        break;
      }

      case 'image': {
        if (!ann.imageData) break;
        let img = ctx.imageCache.get(ann.imageData);
        if (!img) {
          const parsed = dataUrlToBytes(ann.imageData);
          if (!parsed) break;
          try {
            img = parsed.isJpg ? await ctx.doc.embedJpg(parsed.bytes) : await ctx.doc.embedPng(parsed.bytes);
          } catch {
            throw new AnnotationError('לא הצלחנו להטמיע את התמונה שהוספת.');
          }
          ctx.imageCache.set(ann.imageData, img);
        }
        // ‼ שמירת יחס גובה-רוחב בתוך התיבה, כדי שתמונה לא תימתח
        const scale = Math.min(r.width / img.width, r.height / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        page.drawImage(img, {
          x: r.x + (r.width - dw) / 2,
          y: r.y + (r.height - dh) / 2,
          width: dw,
          height: dh,
          rotate: degrees(upright),
        });
        break;
      }

      case 'text': {
        const raw = (ann.text ?? '').replace(/\r/g, '');
        if (!raw.trim()) break;
        const size = Math.max(4, (ann.fontPct ?? 0.025) * dH);
        const lines = raw.split('\n');
        const lineHeight = size * 1.32;
        // התיבה בתצוגה — הטקסט מתחיל בראשה ויורד
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          const segs = layoutMixed(line);
          const tw = measureMixed(segs, size, ctx.fonts);
          const boxWDisplay = ann.widthPct * dW;
          // שורה עברית נצמדת לימין התיבה, לטינית לשמאלה — כמו בפרויקט הייחוס
          const rtl = /[֐-׿]/.test(line);
          const offsetX = rtl ? Math.max(0, boxWDisplay - tw) : 0;
          const topPct = ann.yPct + (i * lineHeight) / dH;
          const baselinePct = topPct + (size * 0.82) / dH;
          const anchor = displayPointToPage(box, ann.xPct + offsetX / dW, baselinePct);
          drawMixedRotated(page, line, anchor.x, anchor.y, size, ctx.fonts, color, upright);
        }
        break;
      }
    }
  }
}
