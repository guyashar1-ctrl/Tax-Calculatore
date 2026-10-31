// ─── קריאת קובץ שהועלה בדפדפן → עמודים מפוענחים (16.10.2026) ─────────────────────────────────────────
// ‼ PDF בלבד, עם שכבת טקסט (הדפסת המסוף «Print To PDF»). צילום מסך / סריקה — לא נקלטים אוטומטית: אין כאן OCR
//   מאומת לרשת המסוף, ולכן הקובץ מסומן «לא ניתן לקריאה» ולא מנחשים.
// ‼ הקובץ נשאר בדפדפן עד «שמירה לתיקים»; אז הוא עולה לדלי הפרטי של המשרד.

import { loadPdf } from '../../../utils/pdfRender';
import { itemsToGrid, type PdfTextItem } from './grid';
import { parseScreens } from './parseShaam';
import type { ParsedFile } from './batch';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 200;

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function readShaamFile(file: File, onPage?: (done: number, total: number) => void): Promise<ParsedFile> {
  const base = { key: `${file.name}:${file.size}:${file.lastModified}`, fileName: file.name, size: file.size, pages: [] };
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    const img = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(file.name);
    return { ...base, error: img ? 'זה צילום מסך, לא PDF. צילום אינו נקלט אוטומטית — הדפיסו את המסך ל-PDF והעלו את הקובץ.' : 'הקובץ אינו PDF.' };
  }
  if (file.size > MAX_FILE_BYTES) return { ...base, error: 'הקובץ גדול מ-15MB.' };
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { return { ...base, error: 'לא ניתן לקרוא את הקובץ מהמחשב.' }; }
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return { ...base, error: 'הקובץ פגום — אינו PDF תקין.' };
  const hash = await sha256(bytes);
  try {
    const { doc, numPages } = await loadPdf(bytes);
    const pages = [];
    const n = Math.min(numPages, MAX_PAGES);
    for (let i = 1; i <= n; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of tc.items as Array<{ str?: string; transform?: number[]; width?: number; dir?: string }>) {
        if (typeof it.str !== 'string' || !it.transform) continue;
        items.push({ x: it.transform[4], y: it.transform[5], width: it.width ?? 0, str: it.str, dir: it.dir as PdfTextItem['dir'] });
      }
      pages.push(...parseScreens(itemsToGrid(items)));
      onPage?.(i, n);
    }
    void doc.destroy();
    const out: ParsedFile = { ...base, key: hash, sha256: hash, pages };
    if (numPages > MAX_PAGES) out.pages.push({ status: 'unreadable', rows: [], problems: [`נקראו ${MAX_PAGES} עמודים ראשונים מתוך ${numPages}`] });
    return out;
  } catch {
    return { ...base, key: hash, sha256: hash, error: 'הקובץ פגום או מוגן בסיסמה — לא נפתח.' };
  }
}
