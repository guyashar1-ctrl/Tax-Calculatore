// ─── שכבת הטקסט של הדפסת מסוף שע״ם → רשת תווים חזותית (16.10.2026) ───────────────────────────
// ‼ ההדפסה («Microsoft: Print To PDF» של מסוף ה-Xenapp) היא רשת קבועה: כל תו ברוחב קבוע (6pt בקובץ שנבדק),
//   כל שורה בגובה קבוע. לכן משחזרים את המסך כפי שנראה — תו בעמודה — ולא קוראים את הטקסט כרצף:
//   חילוץ רציף של עברית מימין לשמאל מפרק את סדר המילים והכותרות (נצפה בקובץ הצהרת ההון).
// ‼ pdfjs מחזיר כל קטע בסדר לוגי ומסמן rtl. כדי להחזיר אותו למקומו על המסך הופכים את סדר התווים, משאירים
//   רצפים של ספרות/אותיות לטיניות בכיוונם, ומחליפים סוגריים (שיקוף). אותה פעולה מחזירה קטע חזותי ללוגי.
// ‼ טהור — בלי React ובלי רשת. תוכן הקובץ הוא נתון לא מהימן: רק מסדרים תווים, לא מפרשים הוראות.

export interface PdfTextItem {
  /** קצה שמאלי בנקודות PDF. */
  x: number;
  /** קו הבסיס בנקודות PDF (גדל כלפי מעלה). */
  y: number;
  width: number;
  str: string;
  dir?: 'ltr' | 'rtl' | 'ttb';
}

export interface Grid {
  /** שורות חזותיות, מלמעלה למטה; כל תו בעמודה שלו. */
  lines: string[];
  /** רוחב תו שזוהה (נקודות). */
  pitch: number;
  /** הקובץ אינו רשת קבועה — אי אפשר לקרוא עמודות בביטחון. */
  irregular: boolean;
}

const LTR_RUN = /[0-9A-Za-z@]+(?:[./:,\-][0-9A-Za-z@]+)*/y;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

/** היפוך דו-כיווני פשוט: סדר האסימונים מתהפך, רצף ספרות/לטינית נשאר כמות שהוא, סוגריים משתקפים. הפעולה הופכית לעצמה. */
export function flipRtl(s: string): string {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    LTR_RUN.lastIndex = i;
    const m = LTR_RUN.exec(s);
    if (m && m.index === i) { tokens.push(m[0]); i += m[0].length; continue; }
    const ch = s[i];
    tokens.push(MIRROR[ch] ?? ch);
    i++;
  }
  return tokens.reverse().join('');
}

const HEBREW = /[֐-׿]/;
export const hasHebrew = (s: string) => HEBREW.test(s);

/** קטע חזותי (כפי שעל המסך) → טקסט לוגי לקריאה. קטע בלי עברית נשאר כמות שהוא. */
export const toLogical = (visual: string) => (hasHebrew(visual) ? flipRtl(visual) : visual);

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** קטעי הטקסט של עמוד אחד → רשת חזותית. */
export function itemsToGrid(items: PdfTextItem[]): Grid {
  const real = items.filter(it => it.str && it.str.trim() && it.dir !== 'ttb' && Number.isFinite(it.x) && Number.isFinite(it.y));
  if (!real.length) return { lines: [], pitch: 0, irregular: false };
  // רוחב תו: חציון של רוחב/אורך בקטעים של 3 תווים ומעלה
  const ratios = real.filter(it => it.str.length >= 3 && it.width > 0).map(it => it.width / it.str.length);
  const pitch = median(ratios) || 6;
  const off = ratios.filter(r => Math.abs(r - pitch) > pitch * 0.12).length;
  const irregular = ratios.length > 0 && off / ratios.length > 0.1;
  // שורות: לפי קו הבסיס, עם סבילות של שליש גובה שורה
  const ys = [...new Set(real.map(it => Math.round(it.y)))].sort((a, b) => b - a);
  const gaps = ys.slice(1).map((y, k) => ys[k] - y).filter(g => g > 1);
  const lineH = median(gaps) || pitch * 2;
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of [...real].sort((a, b) => b.y - a.y)) {
    const row = rows.find(r => Math.abs(r.y - it.y) <= lineH / 3);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  // שורות ריקות בין שורות (למשל שורת טבלה ריקה שלא הודפסה) — נשמרות כדי שמספר השורה יישאר נאמן למסך
  const lines: string[] = [];
  let prevY: number | undefined;
  for (const r of rows) {
    if (prevY !== undefined) {
      const skipped = Math.round((prevY - r.y) / lineH) - 1;
      for (let k = 0; k < skipped && k < 60; k++) lines.push('');
    }
    prevY = r.y;
    const cells: string[] = [];
    for (const it of r.items) {
      const visual = it.dir === 'rtl' ? flipRtl(it.str) : it.str;
      const col0 = Math.round(it.x / pitch);
      for (let k = 0; k < visual.length; k++) {
        const c = col0 + k;
        if (c < 0 || c > 400) continue;
        if (visual[k] !== ' ' || cells[c] === undefined) cells[c] = visual[k];
      }
    }
    let s = '';
    for (let c = 0; c < cells.length; c++) s += cells[c] ?? ' ';
    lines.push(s.replace(/\s+$/, ''));
  }
  return { lines, pitch, irregular };
}
