// ─── מודל העמודים המשותף ל-PDF ─────────────────────────────────────────
// כל פעולה על עמודים במערכת עוברת דרך "תוכנית" אחת: רשימה מסודרת של
// עמודים, כל אחד מצביע על מסמך מקור, על עמוד בתוכו, ועל סיבוב שנוסף לו.
// מיזוג, סידור מחדש, סיבוב והסרה הם כולם עריכות של אותה תוכנית — ולכן
// הם לא צריכים מנוע נפרד לכל אחד. הפלט נבנה פעם אחת, בסוף, מהתוכנית.
//
// ‼ המקור לעולם אינו נכתב. buildPdfFromPlan קורא את הבייטים של המקורות
// ומרכיב מסמך *חדש*; שום פעולה כאן לא נוגעת במסמך שממנו הועתק העמוד.

import { PDFDocument, degrees } from 'pdf-lib';
import { createBurnContext, drawAnnotations, type Annotation } from './pdfAnnotations';
import { applyCropToPage, type CropPct, type PdfRect } from './pdfCrop';

export type Quarter = 0 | 90 | 180 | 270;

/** עמוד יחיד בתוכנית הפלט. */
export interface PlanPage {
  /** מפתח יציב לגרירה ולרינדור — אינו משתנה כשהעמוד זז. */
  id: string;
  /** מזהה מסמך המקור. */
  sourceId: string;
  /** מספר העמוד בתוך המקור, מ-0. */
  sourceIndex: number;
  /** סיבוב *שנוסף* על הסיבוב שכבר קיים בעמוד המקור. */
  rotation: Quarter;
  /** חיתוך אזור התצוגה, באחוזים מהעמוד כפי שהוא מוצג. לא הרסני. */
  crop?: CropPct | null;
}

export interface PlanSource {
  docId: string;
  /** שם לתצוגה — לזיהוי מאיזה קובץ הגיע העמוד. */
  label: string;
  pageCount: number;
}

export class PdfPlanError extends Error {}

// ─── זיהוי ותקינות ─────────────────────────────────────────────────────

/**
 * האם הבייטים הם באמת PDF. ‼ נבדק על התוכן ולא על הסיומת או ה-MIME
 * השמור: שם קובץ הוא טקסט שהמשתמש שולט בו, והבייטים הגיעו מהאחסון אחרי
 * שה-RLS כבר אישר את הגישה אליהם.
 */
export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  // חלק מהקבצים נושאים כמה בתי זבל לפני הכותרת — התקן מתיר זאת
  const head = bytes.subarray(0, Math.min(bytes.length, 1024));
  for (let i = 0; i + 4 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44
      && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
  }
  return false;
}

/** האם המסמך הזה הוא PDF, לפי ה-MIME השמור ובנפילה לפי הסיומת. */
export function looksLikePdf(fileType?: string | null, fileName?: string | null): boolean {
  const mime = (fileType || '').trim().toLowerCase();
  if (mime === 'application/pdf') return true;
  if (mime && mime !== 'application/octet-stream') return false;
  return /\.pdf$/i.test(fileName || '');
}

// ─── בניית התוכנית ועריכתה ─────────────────────────────────────────────

export function buildInitialPlan(sources: PlanSource[]): PlanPage[] {
  const plan: PlanPage[] = [];
  for (const s of sources) {
    for (let i = 0; i < s.pageCount; i++) {
      plan.push({ id: `${s.docId}:${i}`, sourceId: s.docId, sourceIndex: i, rotation: 0 });
    }
  }
  return plan;
}

/**
 * מזיז עמוד למקום אחר ברשימה.
 * ‼ הסמנטיקה היא "העמוד נוחת במשבצת הזו": מסירים ואז משחילים במקום היעד.
 * זו הצורה היחידה שאינה תלויה בכיוון הפריסה על המסך — ולכן היא גם נכונה
 * ב-RTL, שבו "שמאלה" ו"אחרי" הם לא אותו דבר.
 */
export function movePage(plan: PlanPage[], id: string, toIndex: number): PlanPage[] {
  const from = plan.findIndex(p => p.id === id);
  if (from < 0) return plan;
  const target = Math.max(0, Math.min(plan.length - 1, toIndex));
  if (from === target) return plan;
  const next = plan.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

export function rotatePage(plan: PlanPage[], id: string, deltaQuarters = 1): PlanPage[] {
  return plan.map(p => {
    if (p.id !== id) return p;
    const next = (((p.rotation + deltaQuarters * 90) % 360) + 360) % 360;
    return { ...p, rotation: next as Quarter };
  });
}

export function removePage(plan: PlanPage[], id: string): PlanPage[] {
  return plan.filter(p => p.id !== id);
}

/** מסירה כמה עמודים בבת אחת — לפעולת "הסר את הנבחרים". */
export function removePages(plan: PlanPage[], ids: Iterable<string>): PlanPage[] {
  const drop = new Set(ids);
  return plan.filter(p => !drop.has(p.id));
}

/** קובע/מבטל חיתוך על עמוד. null מחזיר את העמוד לגודלו המלא. */
export function setPageCrop(plan: PlanPage[], id: string, crop: CropPct | null): PlanPage[] {
  return plan.map(p => (p.id === id ? { ...p, crop } : p));
}

/**
 * מוסיפה עמודים של מסמך נוסף לתוך התוכנית.
 * ‼ המזהים נושאים סיומת ריצה: אותו קובץ שנוסף פעמיים יוצר עמודים
 * נפרדים, ובלי הסיומת שני עותקים היו חולקים מפתח וגרירה הייתה מזיזה
 * את שניהם.
 */
export function insertPages(
  plan: PlanPage[], source: PlanSource, atIndex: number, stamp: string,
): PlanPage[] {
  const added: PlanPage[] = [];
  for (let i = 0; i < source.pageCount; i++) {
    added.push({ id: `${source.docId}:${i}:${stamp}`, sourceId: source.docId, sourceIndex: i, rotation: 0 });
  }
  const at = Math.max(0, Math.min(plan.length, atIndex));
  return [...plan.slice(0, at), ...added, ...plan.slice(at)];
}

/** תוכנית חדשה שמכילה רק את העמודים שנבחרו, בסדר שבו הם מופיעים. */
export function extractPlan(plan: PlanPage[], ids: Iterable<string>): PlanPage[] {
  const keep = new Set(ids);
  return plan.filter(p => keep.has(p.id));
}

/**
 * מפצלת את התוכנית לקבוצות רצופות בגודל קבוע — "כל N עמודים לקובץ".
 * מפרויקט הייחוס: אחד משלושת מצבי הפיצול שם.
 */
export function splitPlanEvery(plan: PlanPage[], size: number): PlanPage[][] {
  const n = Math.max(1, Math.floor(size));
  const out: PlanPage[][] = [];
  for (let i = 0; i < plan.length; i += n) out.push(plan.slice(i, i + n));
  return out;
}

/**
 * מפרשת טווחי עמודים בכתיב אנושי — "1-5, 8, 11-12" — למספרי עמודים
 * מבוססי-1. מתעלמת מרווחים, מקבלת גם פסיק וגם נקודה-פסיק, ומדלגת על
 * מה שמחוץ לטווח במקום ליפול.
 */
export function parsePageRanges(input: string, total: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const chunk of (input || '').split(/[,;]/)) {
    const part = chunk.trim();
    if (!part) continue;
    const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(part);
    if (!m) continue;
    const from = parseInt(m[1], 10);
    const to = m[2] ? parseInt(m[2], 10) : from;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      if (i >= 1 && i <= total && !seen.has(i)) { seen.add(i); out.push(i); }
    }
  }
  return out;
}

// ─── בניית הפלט ────────────────────────────────────────────────────────

/**
 * מרכיב PDF חדש מהתוכנית.
 *
 * ‼ העתקה אחת לכל מסמך מקור (copyPages עם כל האינדקסים בבת אחת) ולא
 * העתקה לכל עמוד: כל קריאה ל-copyPages משכפלת את גרף המשאבים שהעמוד
 * נשען עליו — גופנים, תמונות — וקריאה לכל עמוד בנפרד מנפחת קובץ בן
 * עשרות עמודים פי כמה. הסדר נשמר דרך מפת החריצים, לא דרך סדר ההעתקה.
 */
export async function buildPdfFromPlan(
  plan: PlanPage[],
  sourceBytes: Map<string, Uint8Array>,
  annotations: Annotation[] = [],
): Promise<Uint8Array> {
  if (plan.length === 0) {
    throw new PdfPlanError('לא נשארו עמודים במסמך. הוסף עמוד אחד לפחות.');
  }

  const out = await PDFDocument.create();

  // טעינת כל מקור פעם אחת
  const loaded = new Map<string, PDFDocument>();
  for (const sourceId of new Set(plan.map(p => p.sourceId))) {
    const bytes = sourceBytes.get(sourceId);
    if (!bytes || bytes.byteLength === 0) {
      throw new PdfPlanError('אחד הקבצים אינו זמין באחסון, ולכן המסמך לא נוצר.');
    }
    if (!isPdfBytes(bytes)) {
      throw new PdfPlanError('אחד הקבצים אינו PDF תקין, ולכן המסמך לא נוצר.');
    }
    try {
      loaded.set(sourceId, await PDFDocument.load(bytes, { ignoreEncryption: false }));
    } catch {
      throw new PdfPlanError('אחד הקבצים פגום או מוגן בסיסמה, ולכן המסמך לא נוצר.');
    }
  }

  // מיפוי: לכל פריט בתוכנית — לאיזה מקור הוא שייך ואיזה עותק שלו לקחת
  const wanted = new Map<string, number[]>();
  const slots: { sourceId: string; slot: number }[] = [];
  for (const item of plan) {
    const src = loaded.get(item.sourceId)!;
    if (item.sourceIndex < 0 || item.sourceIndex >= src.getPageCount()) {
      throw new PdfPlanError('אחד העמודים כבר אינו קיים בקובץ המקור.');
    }
    const list = wanted.get(item.sourceId) ?? [];
    slots.push({ sourceId: item.sourceId, slot: list.length });
    list.push(item.sourceIndex);
    wanted.set(item.sourceId, list);
  }

  const copies = new Map<string, Awaited<ReturnType<PDFDocument['copyPages']>>>();
  for (const [sourceId, indices] of wanted) {
    copies.set(sourceId, await out.copyPages(loaded.get(sourceId)!, indices));
  }

  // ‼ הקשר לצריבה נוצר פעם אחת לכל המסמך: הטמעת הגופנים העבריים יקרה,
  // ואין טעם לחזור עליה לכל עמוד. נוצר רק אם באמת יש מה לצייר.
  const byPage = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const list = byPage.get(a.pageId) ?? [];
    list.push(a);
    byPage.set(a.pageId, list);
  }
  const ctx = byPage.size > 0 ? await createBurnContext(out) : null;

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const { sourceId, slot } = slots[i];
    const page = copies.get(sourceId)![slot];
    // ‼ מוסיפים על הסיבוב שכבר יש לעמוד ולא דורסים אותו: דף שנסרק הפוך
    // מגיע עם 180 משלו, וסיבוב של רבע מהמשתמש אמור להצטרף אליו.
    const base = page.getRotation().angle;
    const total = (((base + item.rotation) % 360) + 360) % 360;
    page.setRotation(degrees(total));

    // ‼ הסדר קובע: קודם מציירים על העמוד המלא, ורק אז מצמצמים את אזור
    // התצוגה. חיתוך שנעשה קודם היה גורם לסימונים ליפול מחוץ למה שרואים.
    const mb = page.getMediaBox();
    const box = { width: mb.width, height: mb.height, rotation: total };
    const anns = byPage.get(item.id);
    if (anns && anns.length > 0 && ctx) {
      await drawAnnotations(page, anns, ctx, box);
    }
    if (item.crop) {
      const quarter = total === 90 || total === 270;
      const dW = quarter ? mb.height : mb.width;
      const dH = quarter ? mb.width : mb.height;
      const rect = cropPctToRect(box, item.crop, dW, dH);
      applyCropToPage(page, rect);
    }
    out.addPage(page);
  }

  const bytes = await out.save();

  // ‼ אימות לפני שמירה: מסמך שנבנה חלקית לא יגיע לאחסון בכלל. עדיף
  // להיכשל כאן מאשר להשאיר ברשימה קובץ שלא ייפתח אצל הרשות.
  const check = await PDFDocument.load(bytes);
  if (check.getPageCount() !== plan.length) {
    throw new PdfPlanError('המסמך שנוצר אינו תואם את סדר העמודים שנבחר. לא נשמר דבר.');
  }
  return bytes;
}

/**
 * ממיר חיתוך שנבחר על התצוגה למלבן במרחב העמוד. אותה המרה בדיוק כמו
 * לסימונים — ציר Y הפוך, וב-90°/270° גם החלפת רוחב וגובה.
 */
function cropPctToRect(
  box: { width: number; height: number; rotation: number },
  crop: CropPct, dW: number, dH: number,
): PdfRect {
  const rot = ((Math.round(box.rotation / 90) * 90) % 360 + 360) % 360;
  const dx = crop.xPct * dW, dy = crop.yPct * dH;
  const dw = crop.widthPct * dW, dh = crop.heightPct * dH;
  const W = box.width, H = box.height;
  switch (rot) {
    case 90: return { x: dy, y: dx, width: dh, height: dw };
    case 180: return { x: W - dx - dw, y: dy, width: dw, height: dh };
    case 270: return { x: W - dy - dh, y: H - dx - dw, width: dh, height: dw };
    default: return { x: dx, y: H - dy - dh, width: dw, height: dh };
  }
}

/** שם ברירת מחדל לפלט, נגזר משם המקור הראשון. */
export function defaultOutputName(firstSourceName: string, merged: boolean): string {
  const base = (firstSourceName || 'מסמך').replace(/\.pdf$/i, '').trim() || 'מסמך';
  return merged ? `${base} - מאוחד` : `${base} - מאורגן`;
}
