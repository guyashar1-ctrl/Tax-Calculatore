// ─── שכבת הטקסט של טופס 2279 שהגיע משע״ם — לבדיקת התבנית לפני סימון אוטומטי ──
// ‼ 28.09.2026 · אזורי החתימה מסומנים לפי תבנית שנמדדה על טפסים אמיתיים. לפני
// שמסמנים — קוראים את העמוד ובודקים שהעוגנים במקומם (verifyForm2279Layout).
// טופס ששע״ם שינתה לא מקבל סימון אוטומטי במקום הלא נכון.

import { loadPdf } from './pdfRender';
import type { Form2279Layout } from '../features/representation/shaamRepresentation';

export async function readForm2279Layout(bytes: ArrayBuffer | Uint8Array): Promise<Form2279Layout> {
  const { doc, numPages, pages } = await loadPdf(bytes);
  try {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i && !!i.str.trim())
      .map(i => ({ s: i.str.trim(), x: i.transform[4] / vp.width, y: 1 - i.transform[5] / vp.height }));
    return { numPages, width: pages[0]?.width ?? 0, height: pages[0]?.height ?? 0, items };
  } finally {
    void doc.destroy();
  }
}
