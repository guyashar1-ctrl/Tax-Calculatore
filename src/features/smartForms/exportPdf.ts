// ─── ייצוא טופס חכם ל-PDF — דרך מנוע הסימונים של עורך ה-PDF ────────────────
// ‼ אין כאן מנוע ציור משלו: הפריסה (layout.ts) מחליטה *מה* ו*איפה*, וכל פעולה
// מומרת לסימון של עורך ה-PDF (utils/pdfAnnotations.ts — טקסט, ✗, תמונה, מלבן,
// קו) ונצרבת ב-drawAnnotations, אותה פונקציה שצורבת סימונים שהמשרד מוסיף ביד.
// כך יש מנוע אחד: אותם פונטים, אותו bidi, אותה המרת צירים, ואותו יישור.
// ‼ ההמרה מדויקת: הקו הבסיסי, גודל הגופן והיישור נגזרים מהנוסחה של העורך
// (baseline = ראש התיבה + 0.82 × גודל), לא «בערך».
// ‼ התצוגה המקדימה מציגה את הבייטים שהפונקציה מחזירה (pdfjs) — אין שתי
// טרנספורמציות שיכולות לסטות.
//
// ‼ לפני ציור: טביעת ה-SHA-256 של הקובץ חייבת להיות זו שהמיפוי נמדד עליה,
// והעמודים חייבים להיות בגודל, בראשית ובסיבוב שנמדדו. קובץ אחר ⇒ שגיאה.

import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed, type PdfFonts } from '../../utils/pdfHebrew';
import { createBurnContext, drawAnnotations, visibleBox, type Annotation, type TextAlign } from '../../utils/pdfAnnotations';
import type { DrawOp, FieldDef, LayoutResult, MeasureText, PdfRect, SmartFormTemplate } from './types';
import { fitText, centeredBaseline } from './layout';
import { sha256Hex } from './hash';
import { SIGNATURE_PAD_PX } from './signatureImage';

export class TemplateMismatchError extends Error {
  constructor(public readonly code: 'hash' | 'geometry', message: string) { super(message); }
}

interface FontkitGlyph { bbox: { minX: number; minY: number; maxX: number; maxY: number }; advanceWidth: number }
interface FontkitFont { unitsPerEm: number; glyphForCodePoint(cp: number): FontkitGlyph }

/** הגופן של fontkit שמאחורי גופן מוטמע ב-pdf-lib (לגבולות הדיו של כל גליף). */
function fontkitOf(f: PdfFonts['latin']): FontkitFont | null {
  const font = (f as unknown as { embedder?: { font?: FontkitFont } }).embedder?.font;
  return font && typeof font.glyphForCodePoint === 'function' ? font : null;
}

export function makeMeasure(fonts: PdfFonts): MeasureText {
  const measure = ((text: string, size: number) => measureMixed(layoutMixed(text), size, fonts)) as MeasureText;
  const latin = fontkitOf(fonts.latin), hebrew = fontkitOf(fonts.hebrew);
  if (latin && hebrew) {
    // ‼ גבולות הדיו מהגליפים עצמם, באותו סדר חזותי ובאותם גופנים שהצריבה משתמשת בהם.
    measure.ink = (text, size) => {
      let x = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const seg of layoutMixed(text)) {
        const fk = seg.rtl ? hebrew : latin;
        const k = size / fk.unitsPerEm;
        for (const ch of seg.text) {
          const g = fk.glyphForCodePoint(ch.codePointAt(0) ?? 32);
          const b = g.bbox;
          if (b.maxX > b.minX) {
            minX = Math.min(minX, x + b.minX * k); maxX = Math.max(maxX, x + b.maxX * k);
            minY = Math.min(minY, b.minY * k); maxY = Math.max(maxY, b.maxY * k);
          }
          x += g.advanceWidth * k;
        }
      }
      return Number.isFinite(minX) ? { minX, maxX, minY, maxY, advance: x } : { minX: 0, maxX: 0, minY: 0, maxY: 0, advance: x };
    };
  }
  return measure;
}

/** מדידה לפני ייצוא (לפריסה בזמן עריכה): אותם פונטים, מסמך זמני. */
export async function createMeasure(): Promise<MeasureText> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  return makeMeasure(await embedPdfFonts(doc));
}

/** בודק שהקובץ הוא בדיוק הקובץ שהמיפוי נמדד עליו. */
export async function assertTemplate(bytes: Uint8Array, t: SmartFormTemplate, doc?: PDFDocument): Promise<void> {
  const hash = await sha256Hex(bytes);
  if (hash !== t.sha256) {
    throw new TemplateMismatchError('hash', `קובץ הטופס שונה מהקובץ שמופה (${t.formNumber} ${t.version}). המיפוי אינו חל עליו.`);
  }
  if (doc) {
    if (doc.getPageCount() !== t.pageCount) throw new TemplateMismatchError('geometry', 'מספר העמודים שונה מהמיפוי');
    for (const p of doc.getPages()) {
      const mb = p.getMediaBox();
      const cb = p.getCropBox();
      if (mb.x !== 0 || mb.y !== 0 || mb.width !== t.pageSize.width || mb.height !== t.pageSize.height
        || cb.x !== mb.x || cb.y !== mb.y || cb.width !== mb.width || cb.height !== mb.height
        || p.getRotation().angle % 360 !== 0) {
        throw new TemplateMismatchError('geometry', 'תיבת העמוד/הסיבוב שונים מהמיפוי');
      }
    }
  }
}

export interface ExportOptions {
  /** חתימות לפי תפקיד — PNG אחרי חיתוך לדיו (ראה signatureImage.ts). */
  signatures?: Partial<Record<'client' | 'spouse', Uint8Array>>;
  /** סימון טיוטה בשוליים התחתונים (לא בשטח הטופס). */
  draftMark?: string;
  /** מטא-נתונים לקובץ. */
  meta?: { title: string; subject?: string; keywords?: string[]; date?: Date };
  /** מסגרות ניפוי: מציירת את כל מלבני המלאי (לבדיקת מיפוי בלבד). */
  debugBoxes?: FieldDef[];
}

/** הדיו של הטופס — כמעט שחור, מעט כחלחל (כמו עט). */
export const SMART_FORM_INK = '#080814';
const GRID = '#8c8c8c';
const HEADER_FILL = '#e6e6e6';
const DEBUG = '#d91a1a';
const DEBUG_TICK = '#1a66e6';

// ─── המרה: פעולת פריסה ⇒ סימון של העורך ───────────────────────────────────

interface Page { width: number; height: number }

let seq = 0;
const nextId = (p: string) => `${p}-${(++seq).toString(36)}`;

/**
 * טקסט בשורה אחת, מעוגן לנקודה (x, קו בסיס y). ‼ רוחב התיבה ≥ רוחב הטקסט —
 * העורך לא ישבור את השורה — והיישור של העורך ממקם אותה בדיוק ביחס לעוגן.
 */
export function textAnnotation(
  page: Page, pageId: string, text: string, x: number, baselineY: number, size: number,
  align: TextAlign, width: number, measure: MeasureText, color = SMART_FORM_INK,
): Annotation {
  const boxW = Math.max(width || 0, measure(text, size)) + 0.5;
  const left = align === 'right' ? x - boxW : align === 'left' ? x : x - boxW / 2;
  const top = page.height - baselineY - size * 0.82;
  return {
    id: nextId('sf-t'), pageId, kind: 'text', text, color, align,
    xPct: left / page.width, yPct: top / page.height,
    widthPct: boxW / page.width, heightPct: (size * 1.32) / page.height,
    fontPct: size / page.height, fontFamily: 'sans', fillColor: null,
  };
}

/** ✗ בתוך ריבוע הסימון המודפס — הצורה והעובי של כלי ה-✗ בעורך. */
export function checkAnnotation(page: Page, pageId: string, box: PdfRect): Annotation {
  return {
    id: nextId('sf-x'), pageId, kind: 'cross', color: SMART_FORM_INK,
    xPct: box.x / page.width, yPct: (page.height - box.y - box.h) / page.height,
    widthPct: box.w / page.width, heightPct: box.h / page.height,
  };
}

/** מידות PNG מתוך כותרת ה-IHDR (בלי לפענח את התמונה). */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function toDataUrl(png: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

/** מרווח בין תחתית הדיו של החתימה לקו החתימה המודפס (נק'). */
export const SIGNATURE_LINE_GAP = 0.5;

/**
 * חתימה: **הדיו** (לא התמונה) ממורכז לרוחב ונח על קו החתימה, בפרופורציות
 * מקוריות. השוליים השקופים (SIGNATURE_PAD_PX מכל צד) מחוץ לחשבון — בלעדיהם
 * החתימה ריחפה 1.9 נק' מעל הקו (נמדד). ‼ התיבה של הסימון היא בדיוק המלבן
 * המותאם, ולכן ההתאמה של העורך (יחס + מרכוז) לא מזיזה דבר.
 */
export function signatureAnnotation(page: Page, pageId: string, box: PdfRect, png: Uint8Array, line?: number): Annotation {
  const img = pngSize(png);
  const pad = SIGNATURE_PAD_PX;
  const inkW = Math.max(1, img.width - pad * 2), inkH = Math.max(1, img.height - pad * 2);
  const floor = line != null ? line + SIGNATURE_LINE_GAP : box.y;
  const room = box.y + box.h - floor;
  const scale = Math.min(box.w / inkW, room / inkH);
  const w = img.width * scale, h = img.height * scale;
  const x = box.x + (box.w - inkW * scale) / 2 - pad * scale;
  const y = floor - pad * scale;
  return {
    id: nextId('sf-s'), pageId, kind: 'image', color: SMART_FORM_INK, imageData: toDataUrl(png),
    xPct: x / page.width, yPct: (page.height - y - h) / page.height,
    widthPct: w / page.width, heightPct: h / page.height,
  };
}

function rectAnnotation(page: Page, pageId: string, r: PdfRect, stroke: string, strokeWidth: number, fill: string | null): Annotation {
  return {
    id: nextId('sf-r'), pageId, kind: 'rectangle', color: stroke, fillColor: fill, fillOpacity: 1,
    thicknessPct: strokeWidth / page.width,
    xPct: r.x / page.width, yPct: (page.height - r.y - r.h) / page.height,
    widthPct: r.w / page.width, heightPct: r.h / page.height,
  };
}

function lineAnnotation(page: Page, pageId: string, x1: number, y1: number, x2: number, y2: number, color: string, width: number): Annotation {
  const a = { x1Pct: x1 / page.width, y1Pct: (page.height - y1) / page.height, x2Pct: x2 / page.width, y2Pct: (page.height - y2) / page.height };
  return {
    id: nextId('sf-l'), pageId, kind: 'line', color, thicknessPct: width / page.width, ...a,
    xPct: Math.min(a.x1Pct, a.x2Pct), yPct: Math.min(a.y1Pct, a.y2Pct),
    widthPct: Math.abs(a.x2Pct - a.x1Pct), heightPct: Math.abs(a.y2Pct - a.y1Pct),
  };
}

/** נספח לטבלת העיסוקים — עמוד חדש, בסימונים של העורך. */
function appendixAnnotations(op: Extract<DrawOp, { kind: 'appendix' }>, t: SmartFormTemplate, measure: MeasureText): Annotation[] {
  const page = t.pageSize;
  const pid = `p${op.page}`;
  const out: Annotation[] = [];
  const put = (text: string, x: number, y: number, size: number, align: TextAlign) =>
    out.push(textAnnotation(page, pid, text, x, y, size, align, 0, measure));
  const right = 556;
  put(op.title, right, 750, 12, 'right');
  put(`מס' ת.ז: ${op.idNumber}`, right, 728, 10.5, 'right');
  if (op.name) put(`שם המבוטח: ${op.name}`, right, 712, 10.5, 'right');
  put(`נספח לטופס ${t.formNumber} (${t.version}) · עמוד ${op.page}`, 306, 30, 8.5, 'center');

  // עמודות כמו בטבלה בטופס (מימין לשמאל)
  const cols = [
    { x: 470.3, w: 86.8 }, { x: 388.3, w: 79.8 }, { x: 313.8, w: 72.3 }, { x: 191.3, w: 120.0 }, { x: 48.0, w: 140.8 },
  ];
  const rowH = 22;
  let top = 690;
  const drawRow = (cells: string[], header: boolean) => {
    const y = top - rowH;
    cols.forEach((c, i) => {
      out.push(rectAnnotation(page, pid, { x: c.x, y, w: c.w, h: rowH }, GRID, 0.6, header ? HEADER_FILL : null));
      const text = (cells[i] ?? '').trim();
      if (!text) return;
      const def = { box: { x: c.x, y, w: c.w, h: rowH }, fontSize: header ? 9 : 9.5, minFontSize: 6, overflow: 'shrink_wrap2' } as FieldDef;
      const fit = fitText(text, def, measure);
      const align: TextAlign = header ? 'center' : i === 2 || i === 4 ? 'right' : 'center';
      const x = align === 'right' ? c.x + c.w - 2.5 : c.x + c.w / 2;
      if (fit.lines.length === 1) {
        put(fit.lines[0], x, centeredBaseline(def.box, fit.size), fit.size, align);
      } else {
        const lh = fit.size * 1.12;
        const b1 = y + rowH / 2 + (lh - fit.size * 0.71) / 2;
        fit.lines.forEach((l, li) => put(l, x, b1 - li * lh, fit.size, align));
      }
    });
    top = y;
  };
  drawRow(op.header, true);
  for (const r of op.rows) drawRow(r, false);
  put('הנספח מצורף לטופס ומהווה חלק ממנו; ההצהרה והחתימה בעמוד 3 חלות גם עליו.', right, top - 22, 9, 'right');
  return out;
}

/**
 * כל הפריסה כסימונים של עורך ה-PDF, לפי עמוד (1..N, כולל נספח). ‼ זה הייצוג
 * היחיד של «מה נכתב על הטופס» — גם הייצוא וגם כל פתיחה בעורך נשענים עליו.
 */
export function smartFormAnnotations(
  layout: LayoutResult, t: SmartFormTemplate, measure: MeasureText, opts: Pick<ExportOptions, 'signatures' | 'draftMark' | 'debugBoxes'> = {},
): Map<number, Annotation[]> {
  const byPage = new Map<number, Annotation[]>();
  const add = (n: number, a: Annotation | Annotation[]) => {
    const list = byPage.get(n) ?? [];
    list.push(...(Array.isArray(a) ? a : [a]));
    byPage.set(n, list);
  };
  const page = t.pageSize;
  for (const op of layout.ops) {
    const pid = `p${op.page}`;
    if (op.kind === 'text') add(op.page, textAnnotation(page, pid, op.text, op.x, op.y, op.size, op.align, op.width, measure));
    else if (op.kind === 'check') add(op.page, checkAnnotation(page, pid, op.box));
    else if (op.kind === 'signature') {
      const png = opts.signatures?.[op.signer];
      if (png) add(op.page, signatureAnnotation(page, pid, op.box, png, op.line));
    } else if (op.kind === 'appendix') add(op.page, appendixAnnotations(op, t, measure));
  }
  if (opts.draftMark) {
    for (let n = 1; n <= layout.pageCount; n++) {
      add(n, textAnnotation(page, `p${n}`, opts.draftMark, 306, 22, 8, 'center', 0, measure));
    }
  }
  for (const f of opts.debugBoxes ?? []) {
    add(f.page, rectAnnotation(page, `p${f.page}`, f.box, DEBUG, 0.5, null));
    for (const cx of f.cells ?? []) add(f.page, lineAnnotation(page, `p${f.page}`, cx, f.box.y - 1.5, cx, f.box.y + 1.5, DEBUG_TICK, 0.5));
  }
  return byPage;
}

/**
 * הייצוא. ‼ קורא ל-assertTemplate — אין ציור על קובץ שלא מופה. הצריבה עצמה —
 * drawAnnotations של העורך, עמוד אחרי עמוד.
 */
export async function exportSmartForm(
  templateBytes: Uint8Array, t: SmartFormTemplate, layout: LayoutResult, opts: ExportOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  await assertTemplate(templateBytes, t, doc);
  const ctx = await createBurnContext(doc);
  const measure = makeMeasure(ctx.fonts);
  const byPage = smartFormAnnotations(layout, t, measure, opts);

  const pageCount = Math.max(t.pageCount, ...byPage.keys());
  while (doc.getPageCount() < pageCount) doc.addPage([t.pageSize.width, t.pageSize.height]);
  const pages = doc.getPages();
  for (const [n, anns] of byPage) {
    const p = pages[n - 1];
    if (p) await drawAnnotations(p, anns, ctx, visibleBox(p));
  }

  if (opts.meta) {
    doc.setTitle(opts.meta.title);
    if (opts.meta.subject) doc.setSubject(opts.meta.subject);
    if (opts.meta.keywords) doc.setKeywords(opts.meta.keywords);
  }
  // ‼ תאריך קבוע מהגרסה (לא «עכשיו»): אותם ערכים ⇒ אותם בייטים, כך שאפשר
  // לשחזר את הקובץ החתום ולאמת את הטביעה שלו.
  const stamp = opts.meta?.date ?? new Date(Date.UTC(2026, 0, 1));
  doc.setProducer('PIVO');
  doc.setCreator('PIVO');
  doc.setModificationDate(stamp);
  doc.setCreationDate(stamp);
  return doc.save({ useObjectStreams: false });
}
