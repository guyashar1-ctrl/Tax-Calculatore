// ─── מודל העמודים המשותף ל-PDF ─────────────────────────────────────────
// כל פעולה על עמודים במערכת עוברת דרך "תוכנית" אחת: רשימה מסודרת של
// עמודים, כל אחד מצביע על מסמך מקור, על עמוד בתוכו, ועל סיבוב שנוסף לו.
// מיזוג, סידור מחדש, סיבוב והסרה הם כולם עריכות של אותה תוכנית — ולכן
// הם לא צריכים מנוע נפרד לכל אחד. הפלט נבנה פעם אחת, בסוף, מהתוכנית.
//
// ‼ המקור לעולם אינו נכתב. buildPdfFromPlan קורא את הבייטים של המקורות
// ומרכיב מסמך *חדש*; שום פעולה כאן לא נוגעת במסמך שממנו הועתק העמוד.

import { PDFDocument, degrees } from 'pdf-lib';

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

  for (let i = 0; i < plan.length; i++) {
    const { sourceId, slot } = slots[i];
    const page = copies.get(sourceId)![slot];
    // ‼ מוסיפים על הסיבוב שכבר יש לעמוד ולא דורסים אותו: דף שנסרק הפוך
    // מגיע עם 180 משלו, וסיבוב של רבע מהמשתמש אמור להצטרף אליו.
    const base = page.getRotation().angle;
    const total = (((base + plan[i].rotation) % 360) + 360) % 360;
    page.setRotation(degrees(total));
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

/** שם ברירת מחדל לפלט, נגזר משם המקור הראשון. */
export function defaultOutputName(firstSourceName: string, merged: boolean): string {
  const base = (firstSourceName || 'מסמך').replace(/\.pdf$/i, '').trim() || 'מסמך';
  return merged ? `${base} - מאוחד` : `${base} - מאורגן`;
}
