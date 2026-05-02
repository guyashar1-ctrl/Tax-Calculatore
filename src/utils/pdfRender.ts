// ─── עוטף לרינדור PDF דרך pdfjs-dist (גרסה 5.x) ─────────────────────────
// משמש את לשונית "מסמך לחתימה" כדי להציג עמודי PDF על canvas
// ולאפשר לסמן עליהם נקודות חתימה / טקסט.

import * as pdfjsLib from 'pdfjs-dist';
// Vite: ?url מחזיר את הנתיב ל-worker של pdfjs בזמן build
// @ts-ignore — Vite query suffix
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const CMAP_URL = '/cmaps/';
const STANDARD_FONTS_URL = '/standard_fonts/';

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

export interface PdfPageDims {
  pageIndex: number;   // 0-based
  width: number;       // נקודות PDF (1pt = 1/72 inch)
  height: number;
}

export interface LoadedPdf {
  doc: PdfDocument;
  numPages: number;
  pages: PdfPageDims[];
}

/** טעינה של PDF מ-ArrayBuffer / Uint8Array. */
export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<LoadedPdf> {
  // pdfjs מנתק (detach) את ה-buffer בעת השימוש בו, לכן המתקשר חייב להעביר עותק שאינו נחוץ לעוד שימוש.
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const doc = await pdfjsLib.getDocument({
    data: bytes,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONTS_URL,
  }).promise;

  const pages: PdfPageDims[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      pageIndex: i - 1,
      width: viewport.width,
      height: viewport.height,
    });
  }
  return { doc, numPages: doc.numPages, pages };
}

/**
 * רינדור עמוד יחיד ל-canvas.
 *
 * הערות חשובות:
 * 1) ב-pdfjs 5.x ה-API הוא `{ canvas, viewport }` — אסור להעביר גם `canvasContext` (גורם לעמוד ריק).
 * 2) pdfjs אוסר שני render-ים בו-זמנית על אותו canvas או page proxy — נשמר WeakMap לכל
 *    זוג (doc, pageIndex), ואם יש render פעיל, מבטלים אותו ומחכים לסיום הביטול לפני שמתחילים חדש.
 *    זה דרוש כדי להתמודד עם React StrictMode (effect כפול ב-dev).
 * 3) עברית: pdfjs נדחק ל-LTR ע"י שינוי canvas.style.direction.
 */

type RenderTask = ReturnType<pdfjsLib.PDFPageProxy['render']>;
const activeTasks = new WeakMap<PdfDocument, Map<number, RenderTask>>();

function getActive(doc: PdfDocument, pageIndex: number): RenderTask | undefined {
  return activeTasks.get(doc)?.get(pageIndex);
}
function setActive(doc: PdfDocument, pageIndex: number, task: RenderTask) {
  let m = activeTasks.get(doc);
  if (!m) { m = new Map(); activeTasks.set(doc, m); }
  m.set(pageIndex, task);
}
function clearActive(doc: PdfDocument, pageIndex: number, task: RenderTask) {
  const m = activeTasks.get(doc);
  if (m && m.get(pageIndex) === task) m.delete(pageIndex);
}

export async function renderPage(
  doc: PdfDocument,
  pageIndex: number,        // 0-based
  destCanvas: HTMLCanvasElement,
  scale: number = 1.5,
): Promise<{ width: number; height: number }> {
  // המתן/בטל רינדור קודם על אותו (doc, pageIndex)
  const prev = getActive(doc, pageIndex);
  if (prev) {
    try { prev.cancel(); } catch { /* בלי פאניקה */ }
    try { await prev.promise; } catch { /* RenderingCancelledException — מצופה */ }
  }

  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);

  // pdfjs שומר ב-WeakSet את כל ה-canvases שכבר ראה ב-render(). כדי להימנע מהשגיאה
  // "Cannot use the same canvas..." בעת re-render (StrictMode/HMR/החלפת PDF),
  // מרנדרים תמיד ל-canvas פנימי טרי, ואז drawImage לקנבס של התצוגה.
  const inner = document.createElement('canvas');
  inner.width = w;
  inner.height = h;

  const task = page.render({ canvas: inner, viewport });
  setActive(doc, pageIndex, task);
  try {
    await task.promise;
  } finally {
    clearActive(doc, pageIndex, task);
  }

  destCanvas.width = w;
  destCanvas.height = h;
  destCanvas.style.direction = 'ltr';
  const ctx = destCanvas.getContext('2d');
  if (ctx) ctx.drawImage(inner, 0, 0);

  return { width: w, height: h };
}
