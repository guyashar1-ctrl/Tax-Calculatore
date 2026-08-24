// ─── סימונים על עמוד PDF ───────────────────────────────────────────────
// מודל אחד לכל מה שמוסיפים על עמוד: טקסט, הדגשה, צורות, ציור חופשי,
// ✓/✗ ותמונה. הצריבה עצמה נעשית ב-pdf-lib, ובסוף בניית המסמך — כך שכל
// עוד לא לחצו "צור", שום דבר לא נגע בקובץ המקור.
//
// מה הובא מפרויקט הייחוס: רשימת הסוגים, חישוב ה-Y ההפוך (מסך יורד ↔ PDF
// עולה), מטמון התמונות, מודגש בציור-כפול (אין וריאנט Bold מוטבע), משפחת
// גופן ללטינית (sans/serif/mono) עם העברית תמיד ב-Noto. מה שהוחלף:
// עיצוב הטקסט העברי — פרויקט הייחוס נשען על bidi-js, וכאן כבר קיים
// pdfHebrew.ts שנשחק על הצעות מחיר ומכתבים אמיתיים.
//
// ‼ הקואורדינטות באחוזים מהעמוד *כפי שהוא מוצג*, כמו SignatureField:
// כך סימון שנוצר בזום כלשהו יושב באותו מקום בדיוק בקובץ.
//
// ‼ עיקרון ה-WYSIWYG: כל גודל כאן נגזר מהעמוד — גודל טקסט מאחוז גובה
// העמוד, עובי קו מאחוז רוחב העמוד המוצג. השכבה שעל המסך משתמשת באותם
// אחוזים בדיוק (מומרים לפיקסלים של התצוגה), ולכן מה שרואים הוא מה שנצרב.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, PdfFonts } from './pdfHebrew';

export type AnnotationKind =
  | 'text' | 'highlight' | 'whiteout' | 'rectangle' | 'circle' | 'line'
  | 'draw' | 'check' | 'cross' | 'image';

export type LatinFamily = 'sans' | 'serif' | 'mono';

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
  /** צבע הקו/המסגרת, ובטקסט — צבע האותיות. */
  color: string;
  /**
   * ‼ מילוי ומסגרת הם שתי תכונות עצמאיות, ולכל אחת שקיפות משלה. עד כה
   * המילוי נצרב תמיד ב-0.35 קבוע, וכל הצורות היו חייבות מסגרת: אי אפשר
   * היה ליצור לא ריבוע לבן אטום להסתרה ולא הדגשה בעוצמה אחרת.
   * null/undefined ב-fillColor = אין מילוי כלל.
   */
  fillColor?: string | null;
  fillOpacity?: number;
  strokeOpacity?: number;
  /** אין מסגרת — הצורה היא המילוי בלבד. */
  noStroke?: boolean;
  text?: string;
  /** גודל הטקסט באחוז מגובה העמוד המוצג — לא תלוי זום. */
  fontPct?: number;
  /** משפחת הגופן ללטינית וספרות. העברית תמיד ב-Noto Hebrew. */
  fontFamily?: LatinFamily;
  bold?: boolean;
  /** נקודות ציור חופשי, יחסית לתיבה (0..1). */
  points?: { x: number; y: number }[];
  /** עובי קו באחוז מרוחב העמוד המוצג. */
  thicknessPct?: number;
  /**
   * ‼ קו: שתי נקודות הקצה הן הסמכות, והתיבה נגזרת מהן. קודם הקו היה
   * האלכסון של תיבה + דגל כיוון, ולכן אי אפשר היה לגרור קצה אחד בלי
   * להזיז את השני, ולא היו קווים אופקיים או אנכיים באמת (תיבה בגובה 0
   * נדחקה למינימום). flipLine נשאר לקריאת סימונים ישנים.
   */
  x1Pct?: number;
  y1Pct?: number;
  x2Pct?: number;
  y2Pct?: number;
  flipLine?: boolean;
  imageData?: string;
}

export const ANNOTATION_LABELS: Record<AnnotationKind, string> = {
  text: 'טקסט',
  highlight: 'הדגשה',
  whiteout: 'הסתרה',
  rectangle: 'מלבן',
  circle: 'עיגול',
  line: 'קו',
  draw: 'ציור',
  check: 'סימון ✓',
  cross: 'סימון ✗',
  image: 'תמונה',
};

export const DEFAULT_FONT_PCT = 0.024;
export const DEFAULT_THICKNESS_PCT = 0.004;
export const THICKNESS_STEPS: number[] = [0.002, 0.004, 0.008];
export const FONT_PCT_MIN = 0.012;
export const FONT_PCT_MAX = 0.09;
export const HIGHLIGHT_OPACITY = 0.35;
export const WHITEOUT_COLOR = '#ffffff';

// ─── יכולות לפי סוג ────────────────────────────────────────────────────
// ‼ מקור אמת אחד: גם הסרגל המוצג למשתמש וגם הצריבה נגזרים מכאן, ולכן
// אי אפשר להציג פקד לתכונה שלא תיצרב, או לצרוב תכונה שאין דרך לשנות.

export interface KindCaps {
  fill: boolean;
  stroke: boolean;
  /** למילוי יש שקיפות שאפשר לשנות (מלבן, עיגול, הדגשה, רקע טקסט). */
  fillOpacity: boolean;
  text: boolean;
  /** התיבה משתנה ב-8 ידיות (קו מקבל שתי נקודות קצה במקום). */
  boxResize: boolean;
}

const CAPS: Record<AnnotationKind, KindCaps> = {
  text: { fill: true, stroke: false, fillOpacity: true, text: true, boxResize: true },
  highlight: { fill: true, stroke: false, fillOpacity: true, text: false, boxResize: true },
  whiteout: { fill: true, stroke: false, fillOpacity: true, text: false, boxResize: true },
  rectangle: { fill: true, stroke: true, fillOpacity: true, text: false, boxResize: true },
  circle: { fill: true, stroke: true, fillOpacity: true, text: false, boxResize: true },
  line: { fill: false, stroke: true, fillOpacity: false, text: false, boxResize: false },
  draw: { fill: false, stroke: true, fillOpacity: false, text: false, boxResize: true },
  check: { fill: false, stroke: true, fillOpacity: false, text: false, boxResize: true },
  cross: { fill: false, stroke: true, fillOpacity: false, text: false, boxResize: true },
  image: { fill: false, stroke: false, fillOpacity: false, text: false, boxResize: true },
};

export function capsOf(kind: AnnotationKind): KindCaps {
  return CAPS[kind];
}

/** ברירות המחדל של הכלי — מה שנוצר בלחיצה אחת, בלי לעבור דרך הגדרות. */
export function presetFor(kind: AnnotationKind, color: string): Partial<Annotation> {
  switch (kind) {
    // הדגשה = מילוי שקוף בלי מסגרת. אין סיבה לעבור דרך "מלבן ואז לבחור".
    case 'highlight':
      return { fillColor: color, fillOpacity: HIGHLIGHT_OPACITY, noStroke: true };
    // ‼ הסתרה = לבן אטום בלי מסגרת. זו הסתרה ויזואלית בלבד: הטקסט שמתחת
    // נשאר בקובץ וניתן לחילוץ. אינה מחיקה מאובטחת.
    case 'whiteout':
      return { fillColor: WHITEOUT_COLOR, fillOpacity: 1, noStroke: true };
    case 'rectangle':
    case 'circle':
      return { fillColor: null, fillOpacity: 1, noStroke: false };
    case 'text':
      return { fillColor: null, fillOpacity: 1 };
    default:
      return {};
  }
}

/** שקיפות המילוי בפועל — ברירת מחדל לפי הסוג. */
export function fillOpacityOf(a: Annotation): number {
  const v = a.fillOpacity;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  return a.kind === 'highlight' ? HIGHLIGHT_OPACITY : 1;
}

export function strokeOpacityOf(a: Annotation): number {
  const v = a.strokeOpacity;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  return 1;
}

export function fillColorOf(a: Annotation): string | null {
  if (!capsOf(a.kind).fill) return null;
  if (a.fillColor === null) return null;
  if (a.fillColor) return a.fillColor;
  // הדגשה/הסתרה ישנות שנוצרו לפני שהמילוי היה שדה נפרד
  if (a.kind === 'highlight') return a.color;
  if (a.kind === 'whiteout') return WHITEOUT_COLOR;
  return null;
}

export function strokeVisible(a: Annotation): boolean {
  return capsOf(a.kind).stroke && !a.noStroke;
}

// ─── קו: שתי נקודות קצה ────────────────────────────────────────────────

export interface LineEnds { x1: number; y1: number; x2: number; y2: number }

/** נקודות הקצה של קו — מהשדות החדשים, ואם אין מהתיבה הישנה + flipLine. */
export function lineEnds(a: Annotation): LineEnds {
  if (typeof a.x1Pct === 'number' && typeof a.y1Pct === 'number'
    && typeof a.x2Pct === 'number' && typeof a.y2Pct === 'number') {
    return { x1: a.x1Pct, y1: a.y1Pct, x2: a.x2Pct, y2: a.y2Pct };
  }
  return a.flipLine
    ? { x1: a.xPct, y1: a.yPct + a.heightPct, x2: a.xPct + a.widthPct, y2: a.yPct }
    : { x1: a.xPct, y1: a.yPct, x2: a.xPct + a.widthPct, y2: a.yPct + a.heightPct };
}

/** התיבה החוסמת של קו — נשמרת מסונכרנת כדי שכל שאר המודל ימשיך לעבוד. */
export function lineBox(e: LineEnds): Pick<Annotation, 'xPct' | 'yPct' | 'widthPct' | 'heightPct'> {
  return {
    xPct: Math.min(e.x1, e.x2),
    yPct: Math.min(e.y1, e.y2),
    widthPct: Math.abs(e.x2 - e.x1),
    heightPct: Math.abs(e.y2 - e.y1),
  };
}

/** קו עם נקודות קצה חדשות — התיבה נגזרת, ואין צורך לזכור לעדכן אותה. */
export function withLineEnds(e: LineEnds): Partial<Annotation> {
  return {
    x1Pct: e.x1, y1Pct: e.y1, x2Pct: e.x2, y2Pct: e.y2,
    flipLine: undefined,
    ...lineBox(e),
  };
}

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
 */
export function uprightRotation(rotation: number): number {
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

// ─── גופנים: בחירה בטוחה לפי תו ────────────────────────────────────────

/** צמד הגופנים בפועל + עתודה למקרה שהלטיני הנבחר לא מכיל תו. */
export interface SafeFonts extends PdfFonts { fallback?: PDFFont }

const encodeCache = new WeakMap<PDFFont, Map<string, boolean>>();
/**
 * ‼ Times/Courier של התקן מקודדים WinAnsi בלבד — ₪, גרשיים מסולסלים
 * וכדומה מפילים אותם עם חריגה. תו שהגופן הנבחר לא מכיל נופל ל-Noto,
 * שמכיל את כולם. בלי זה 'שלום 1,250 ₪' בגופן Times הפיל את כל היצירה.
 */
function canEncode(font: PDFFont, text: string): boolean {
  let m = encodeCache.get(font);
  if (!m) { m = new Map(); encodeCache.set(font, m); }
  for (const ch of text) {
    let ok = m.get(ch);
    if (ok === undefined) {
      try { font.widthOfTextAtSize(ch, 10); ok = true; } catch { ok = false; }
      m.set(ch, ok);
    }
    if (!ok) return false;
  }
  return true;
}

function segFontSafe(seg: { rtl: boolean; text: string }, fonts: SafeFonts): PDFFont {
  if (seg.rtl) return fonts.hebrew;
  if (fonts.fallback && !canEncode(fonts.latin, seg.text)) return fonts.fallback;
  return fonts.latin;
}

function measureSafe(segs: ReturnType<typeof layoutMixed>, size: number, fonts: SafeFonts): number {
  return segs.reduce((w, seg) => {
    const f = segFontSafe(seg, fonts);
    try { return w + f.widthOfTextAtSize(seg.text, size); } catch { return w; }
  }, 0);
}

// ─── טקסט: גלישת שורות ─────────────────────────────────────────────────

/**
 * גלישה רכה של שורה לוגית לרוחב התיבה — נמדדת בגופני ה-PDF עצמם, ולכן
 * זו הסמכות; השכבה שעל המסך משתמשת באותם קובצי גופן (עוד TTF, אותם
 * מטריקות) ולכן נשברת באותם מקומות.
 * ‼ בלי הגלישה הזו, טקסט ארוך פשוט זלג מעבר לתיבה בקובץ הסופי בזמן
 * שעל המסך הוא נראה עטוף — הפער המדויק שהמשתמש קרא לו "לא עובד".
 */
export function wrapLogicalLine(
  line: string, boxWidth: number, size: number, fonts: SafeFonts,
): string[] {
  if (!line) return [''];
  const fits = (s: string) => measureSafe(layoutMixed(s), size, fonts) <= boxWidth;
  if (fits(line)) return [line];

  const tokens = line.split(/(\s+)/);
  const out: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    if (!tok) continue;
    const cand = cur + tok;
    if (cur && tok.trim() && !fits(cand.replace(/\s+$/, ''))) {
      out.push(cur.replace(/\s+$/, ''));
      cur = tok.replace(/^\s+/, '');
    } else {
      cur = cand;
    }
  }
  if (cur.replace(/\s+$/, '')) out.push(cur.replace(/\s+$/, ''));
  return out.length ? out : [line];
}

/**
 * מצייר שורה מעורבת בזווית. drawMixedVisual של pdfHebrew אינו יודע
 * לסובב, ולכן ההתקדמות בין המקטעים מחושבת כאן לאורך הציר המסובב.
 * ‼ מודגש = ציור כפול בהיסט זעיר לאורך השורה (הטריק מפרויקט הייחוס:
 * אין וריאנט Bold מוטבע, וההיסט מדמה אותו בלי גופן שני).
 */
function drawMixedRotated(
  page: PDFPage, text: string, x: number, y: number, size: number,
  fonts: SafeFonts, color: ReturnType<typeof rgb>, rotation: number, bold: boolean,
) {
  const segs = layoutMixed(text);
  const rad = (rotation * Math.PI) / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  const passes = bold ? [0, size * 0.03] : [0];
  for (const off of passes) {
    let advance = off;
    for (const seg of segs) {
      const font = segFontSafe(seg, fonts);
      // ‼ תו שאין לו גליף גם ב-Noto (אמוג'י נדיר) מדולג — מסמך שלם לא
      // נופל בגלל תו אחד.
      try {
        page.drawText(seg.text, {
          x: x + ux * advance,
          y: y + uy * advance,
          size, font, color,
          rotate: degrees(rotation),
        });
        advance += font.widthOfTextAtSize(seg.text, size);
      } catch { /* מדלגים על המקטע */ }
    }
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
  /** גופנים לטיניים חלופיים — מוטבעים רק אם סימון כלשהו ביקש אותם. */
  serif?: PDFFont;
  mono?: PDFFont;
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

/** צמד הגופנים לפי משפחה: הלטיני מתחלף, העברי תמיד Noto Hebrew. */
async function fontsFor(ctx: BurnContext, family?: LatinFamily): Promise<SafeFonts> {
  if (family === 'serif') {
    ctx.serif ??= await ctx.doc.embedFont(StandardFonts.TimesRoman);
    return { latin: ctx.serif, hebrew: ctx.fonts.hebrew, fallback: ctx.fonts.latin };
  }
  if (family === 'mono') {
    ctx.mono ??= await ctx.doc.embedFont(StandardFonts.Courier);
    return { latin: ctx.mono, hebrew: ctx.fonts.hebrew, fallback: ctx.fonts.latin };
  }
  return ctx.fonts;
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
    // ‼ העובי יחסי לרוחב המוצג (dW) ולא לרוחב הפיזי: כך קו שנראה בעובי
    // מסוים על עמוד מסובב נצרב באותו עובי בדיוק.
    const thickness = Math.max(0.5, (ann.thicknessPct ?? DEFAULT_THICKNESS_PCT) * dW);

    // ‼ מילוי ומסגרת נגזרים בנפרד ומצוירים בשקיפויות נפרדות. אין כאן
    // "אטימות של האובייקט": מלבן שקוף עם מסגרת שחורה מלאה הוא צירוף
    // תקין, וכך גם ריבוע לבן אטום בלי מסגרת כלל.
    const fillHex = fillColorOf(ann);
    const fillPaint = fillHex
      ? { color: hexToRgb(fillHex), opacity: fillOpacityOf(ann) }
      : {};
    const strokePaint = strokeVisible(ann)
      ? { borderColor: color, borderWidth: thickness, borderOpacity: strokeOpacityOf(ann) }
      : { borderWidth: 0 };

    switch (ann.kind) {
      case 'highlight':
      case 'whiteout':
      case 'rectangle':
        page.drawRectangle({ ...r, ...fillPaint, ...strokePaint, rotate: degrees(0) });
        break;

      case 'circle':
        page.drawEllipse({
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          xScale: Math.max(0.5, r.width / 2),
          yScale: Math.max(0.5, r.height / 2),
          ...fillPaint,
          ...strokePaint,
        });
        break;

      case 'line': {
        const e = lineEnds(ann);
        const a = displayPointToPage(box, e.x1, e.y1);
        const b = displayPointToPage(box, e.x2, e.y2);
        page.drawLine({ start: a, end: b, color, thickness, opacity: strokeOpacityOf(ann) });
        break;
      }

      case 'draw': {
        const pts = ann.points ?? [];
        if (pts.length < 2) break;
        const opacity = strokeOpacityOf(ann);
        for (let i = 1; i < pts.length; i++) {
          const a = displayPointToPage(box, ann.xPct + pts[i - 1].x * ann.widthPct, ann.yPct + pts[i - 1].y * ann.heightPct);
          const b = displayPointToPage(box, ann.xPct + pts[i].x * ann.widthPct, ann.yPct + pts[i].y * ann.heightPct);
          page.drawLine({ start: a, end: b, color, thickness, opacity, lineCap: 1 as never });
        }
        break;
      }

      case 'check':
      case 'cross': {
        const p = (fx: number, fy: number) =>
          displayPointToPage(box, ann.xPct + fx * ann.widthPct, ann.yPct + fy * ann.heightPct);
        const w = Math.max(1.2, Math.min(r.width, r.height) * 0.14);
        const o = strokeOpacityOf(ann);
        if (ann.kind === 'check') {
          page.drawLine({ start: p(0.12, 0.52), end: p(0.42, 0.84), color, thickness: w, opacity: o });
          page.drawLine({ start: p(0.42, 0.84), end: p(0.88, 0.16), color, thickness: w, opacity: o });
        } else {
          page.drawLine({ start: p(0.14, 0.14), end: p(0.86, 0.86), color, thickness: w, opacity: o });
          page.drawLine({ start: p(0.86, 0.14), end: p(0.14, 0.86), color, thickness: w, opacity: o });
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
        // ‼ הרקע נצרב לפני האותיות ובגבולות התיבה עצמה — כך "טקסט שחור על
        // רקע צהוב 40%" הוא צירוף אחד ולא שני סימונים שצריך ליישר ביד.
        if (fillHex) page.drawRectangle({ ...r, ...fillPaint, borderWidth: 0 });
        const size = Math.max(4, (ann.fontPct ?? DEFAULT_FONT_PCT) * dH);
        const fonts = await fontsFor(ctx, ann.fontFamily);
        const boxWDisplay = ann.widthPct * dW;
        const lineHeight = size * 1.32;

        // גלישה: כל שורה לוגית נשברת לרוחב התיבה, במטריקות של הגופנים עצמם
        const lines: string[] = [];
        for (const logical of raw.split('\n')) {
          lines.push(...wrapLogicalLine(logical, boxWDisplay, size, fonts));
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          const segs = layoutMixed(line);
          const tw = measureSafe(segs, size, fonts);
          // שורה עברית נצמדת לימין התיבה, לטינית לשמאלה — בדיוק כמו השכבה
          const rtl = /[֐-׿]/.test(line);
          const offsetX = rtl ? Math.max(0, boxWDisplay - tw) : 0;
          const topPct = ann.yPct + (i * lineHeight) / dH;
          const baselinePct = topPct + (size * 0.82) / dH;
          const anchor = displayPointToPage(box, ann.xPct + offsetX / dW, baselinePct);
          drawMixedRotated(page, line, anchor.x, anchor.y, size, fonts, color, upright, !!ann.bold);
        }
        break;
      }
    }
  }
}
