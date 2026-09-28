// ─── ייצוא טופס חכם ל-PDF — הקובץ הרשמי + הערכים, באותן קואורדינטות ─────────
// ‼ התצוגה המקדימה מציגה את הבייטים שהפונקציה הזו מחזירה (pdfjs), ולכן אין
// שתי טרנספורמציות שיכולות לסטות. הטקסט העברי/המעורב נכתב במנוע של עורך
// ה-PDF הקיים (utils/pdfHebrew.ts) — אותם פונטים מוטמעים ואותו סידור bidi.
//
// ‼ לפני ציור: טביעת ה-SHA-256 של הקובץ חייבת להיות זו שהמיפוי נמדד עליה,
// והעמודים חייבים להיות בגודל, בראשית ובסיבוב שנמדדו. קובץ אחר ⇒ שגיאה, לא
// «בערך במקום».

import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed, drawMixedVisual, type PdfFonts } from '../../utils/pdfHebrew';
import type { DrawOp, FieldDef, LayoutResult, MeasureText, SmartFormTemplate } from './types';
import { fitText, centeredBaseline } from './layout';
import { sha256Hex } from './hash';

export class TemplateMismatchError extends Error {
  constructor(public readonly code: 'hash' | 'geometry', message: string) { super(message); }
}

export function makeMeasure(fonts: PdfFonts): MeasureText {
  return (text, size) => measureMixed(layoutMixed(text), size, fonts);
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

const INK = rgb(0.03, 0.03, 0.08);

function drawTextOp(page: PDFPage, op: Extract<DrawOp, { kind: 'text' }>, fonts: PdfFonts) {
  const segs = layoutMixed(op.text);
  const w = measureMixed(segs, op.size, fonts);
  const x0 = op.align === 'right' ? op.x - w : op.align === 'left' ? op.x : op.x - w / 2;
  drawMixedVisual(page, segs, x0, op.y, op.size, fonts);
}

function drawCheck(page: PDFPage, box: { x: number; y: number; w: number; h: number }) {
  const inset = Math.min(box.w, box.h) * 0.14;
  const t = Math.max(0.8, Math.min(box.w, box.h) * 0.14);
  const x1 = box.x + inset, x2 = box.x + box.w - inset;
  const y1 = box.y + inset, y2 = box.y + box.h - inset;
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: INK });
  page.drawLine({ start: { x: x1, y: y2 }, end: { x: x2, y: y1 }, thickness: t, color: INK });
}

async function drawSignature(doc: PDFDocument, page: PDFPage, box: { x: number; y: number; w: number; h: number }, png: Uint8Array) {
  const img = await doc.embedPng(png);
  const scale = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * scale, h = img.height * scale;
  page.drawImage(img, { x: box.x + (box.w - w) / 2, y: box.y, width: w, height: h });
}

function drawAppendix(doc: PDFDocument, op: Extract<DrawOp, { kind: 'appendix' }>, t: SmartFormTemplate, fonts: PdfFonts, measure: MeasureText) {
  const page = doc.addPage([t.pageSize.width, t.pageSize.height]);
  const right = 556;
  const put = (text: string, x: number, y: number, size: number, align: 'right' | 'left' | 'center') =>
    drawTextOp(page, { kind: 'text', page: 0, fieldId: 'appendix', text, x, y, size, align, width: 0 }, fonts);

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
      page.drawRectangle({ x: c.x, y, width: c.w, height: rowH, borderColor: rgb(0.55, 0.55, 0.55), borderWidth: 0.6,
        color: header ? rgb(0.9, 0.9, 0.9) : undefined });
      const text = (cells[i] ?? '').trim();
      if (!text) return;
      const def = { box: { x: c.x, y, w: c.w, h: rowH }, fontSize: header ? 9 : 9.5, minFontSize: 6, overflow: 'shrink_wrap2' } as FieldDef;
      const fit = fitText(text, def, measure);
      const align = i === 2 || i === 4 || header ? (header ? 'center' : 'right') : 'center';
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
}

/**
 * הייצוא. ‼ קורא ל-assertTemplate — אין ציור על קובץ שלא מופה.
 */
export async function exportSmartForm(
  templateBytes: Uint8Array, t: SmartFormTemplate, layout: LayoutResult, opts: ExportOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  await assertTemplate(templateBytes, t, doc);
  doc.registerFontkit(fontkit);
  const fonts = await embedPdfFonts(doc);
  const measure = makeMeasure(fonts);
  const pages = doc.getPages();

  for (const op of layout.ops) {
    if (op.kind === 'appendix') continue;
    const page = pages[op.page - 1];
    if (!page) continue;
    if (op.kind === 'text') drawTextOp(page, op, fonts);
    else if (op.kind === 'check') drawCheck(page, op.box);
    else if (op.kind === 'signature') {
      const png = opts.signatures?.[op.signer];
      if (png) await drawSignature(doc, page, op.box, png);
    }
  }
  for (const op of layout.ops) if (op.kind === 'appendix') drawAppendix(doc, op, t, fonts, measure);

  if (opts.draftMark) {
    for (const p of doc.getPages()) {
      drawTextOp(p, { kind: 'text', page: 0, fieldId: 'draft', text: opts.draftMark, x: 306, y: 22, size: 8, align: 'center', width: 0 }, fonts);
    }
  }
  if (opts.debugBoxes) {
    for (const f of opts.debugBoxes) {
      const p = pages[f.page - 1];
      p?.drawRectangle({ x: f.box.x, y: f.box.y, width: f.box.w, height: f.box.h, borderColor: rgb(0.85, 0.1, 0.1), borderWidth: 0.4, opacity: 0, borderOpacity: 0.9 });
      if (f.cells) for (const cx of f.cells) p?.drawLine({ start: { x: cx, y: f.box.y - 1.5 }, end: { x: cx, y: f.box.y + 1.5 }, thickness: 0.5, color: rgb(0.1, 0.4, 0.9) });
    }
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
