// ─── הגיאומטריה המודפסת של הטופס — ריבועי סימון, קווי כתיבה ותאי ספרות ───────
// פונקציות טהורות על רינדור של הטופס הריק (בהירות לכל פיקסל). משמשות להצמדה בזמן
// עריכת המיפוי ולבדיקת היישור לפני פרסום. אותו אלגוריתם שמדד את מיפוי 2 בסקאלה 8
// (CHECK_SQUARES / WRITING_LINES) — כאן בסקאלה 6 (‎1/6 נק').

import type { PdfRect } from './types';

/** בהירות לכל פיקסל של עמוד מרונדר (0 = שחור). */
export interface Lum { w: number; h: number; scale: number; pageH: number; d: Uint8Array }

export function lumFromRgba(rgba: Uint8ClampedArray, w: number, h: number, scale: number, pageH: number): Lum {
  const d = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < d.length; i++, k += 4) d[i] = (rgba[k] * 299 + rgba[k + 1] * 587 + rgba[k + 2] * 114) / 1000;
  return { w, h, scale, pageH, d };
}

const DARK = 140;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const colOf = (l: Lum, x: number) => clamp(Math.round(x * l.scale), 0, l.w - 1);
const rowOf = (l: Lum, y: number) => clamp(Math.round((l.pageH - y) * l.scale), 0, l.h - 1);
const dark = (l: Lum, c: number, r: number) => l.d[r * l.w + c] < DARK;

function groups(idx: number[]): number[][] {
  const g: number[][] = [];
  for (const i of idx) { const last = g[g.length - 1]; if (last && i - last[last.length - 1] <= 1) last.push(i); else g.push([i]); }
  return g;
}

/**
 * ריבוע הסימון המודפס סביב box (עד margin נק' ממנו): הפנים שלו — בין קו המסגרת
 * השמאלי לימני ובין העליון לתחתון. null — אין שם ריבוע.
 */
export function detectSquare(l: Lum, box: PdfRect, margin = 3): PdfRect | null {
  const c0 = colOf(l, box.x - margin), c1 = colOf(l, box.x + box.w + margin);
  const r0 = rowOf(l, box.y + box.h + margin), r1 = rowOf(l, box.y - margin);
  if (c1 - c0 < 4 || r1 - r0 < 4) return null;
  const cols: number[] = [], rows: number[] = [];
  for (let c = c0; c < c1; c++) { let n = 0; for (let r = r0; r < r1; r++) if (dark(l, c, r)) n++; if (n / (r1 - r0) > 0.45) cols.push(c); }
  for (let r = r0; r < r1; r++) { let n = 0; for (let c = c0; c < c1; c++) if (dark(l, c, r)) n++; if (n / (c1 - c0) > 0.45) rows.push(r); }
  const cg = groups(cols), rg = groups(rows);
  if (cg.length < 2 || rg.length < 2) return null;
  const L = cg[0], R = cg[cg.length - 1], T = rg[0], B = rg[rg.length - 1];
  const x = (L[L.length - 1] + 1) / l.scale, x2 = R[0] / l.scale;
  const top = l.pageH - (T[T.length - 1] + 1) / l.scale, bottom = l.pageH - B[0] / l.scale;
  const w = x2 - x, h = top - bottom;
  if (w < 2 || h < 2 || Math.abs(w - h) > Math.max(0.75, w * 0.2)) return null;
  return { x: r2(x), y: r2(bottom), w: r2(w), h: r2(h) };
}

/**
 * קו הכתיבה המודפס הקרוב ל-near (ברירת מחדל: תחתית השדה), לרוחב השדה. מחזיר את
 * הקצה העליון של הקו (בנק'), או null.
 */
export function detectLine(l: Lum, box: PdfRect, near?: number, reach = 4): number | null {
  const target = near ?? box.y;
  const c0 = colOf(l, box.x + 1), c1 = colOf(l, box.x + box.w - 1);
  const r0 = rowOf(l, target + reach), r1 = rowOf(l, target - reach);
  if (c1 - c0 < 4) return null;
  const rows: number[] = [];
  for (let r = r0; r <= r1; r++) { let n = 0; for (let c = c0; c < c1; c++) if (dark(l, c, r)) n++; if (n / (c1 - c0) > 0.6) rows.push(r); }
  const g = groups(rows);
  if (!g.length) return null;
  const tops = g.map(x => l.pageH - x[0] / l.scale);
  tops.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  return r2(tops[0]);
}

/**
 * גבולות תאי הספרות המודפסים: לכל גבול ידוע (cells) — הקו האנכי המודפס הקרוב אליו
 * (עד reach נק'). null — אחד הגבולות לא נמצא.
 */
export function detectCells(l: Lum, box: PdfRect, cells: number[], reach = 2.5): number[] | null {
  // ‼ התאים מודפסים כקווים אנכיים בחלק התחתון של השדה — בודקים את החצי התחתון
  const r0 = rowOf(l, box.y + box.h * 0.5), r1 = rowOf(l, box.y);
  if (r1 - r0 < 3) return null;
  const cand: number[] = [];
  const c0 = colOf(l, Math.min(...cells) - reach), c1 = colOf(l, Math.max(...cells) + reach);
  for (let c = c0; c <= c1; c++) { let n = 0; for (let r = r0; r < r1; r++) if (dark(l, c, r)) n++; if (n / (r1 - r0) > 0.5) cand.push(c); }
  const centers = groups(cand).map(g => ((g[0] + g[g.length - 1] + 1) / 2) / l.scale);
  const out: number[] = [];
  for (const x of cells) {
    let best: number | null = null;
    for (const c of centers) if (Math.abs(c - x) <= reach && (best == null || Math.abs(c - x) < Math.abs(best - x))) best = c;
    if (best == null) return null;
    out.push(r2(best));
  }
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) return null;
  return out;
}

// ─── הצמדה אחרי גרירה: חיפוש ברדיוס, לא רק סביב המקום הנוכחי ───────────────────
// גרירה בעכבר מזיזה בקלות 10–20 נק' (פיקסל מסך ≈ נקודה), ולכן ההצמדה מחפשת את הריבוע /
// הקו / המשבצות הקרובים ביותר ברדיוס, ורק הבדיקה לפני פרסום משווה ברזולוציה מלאה.

/** הריבוע המודפס הקרוב ביותר למרכז box, ברדיוס radius נק', בגודל דומה. */
export function findSquareNear(l: Lum, box: PdfRect, radius = 12): PdfRect | null {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let best: PdfRect | null = null, bestScore = Infinity;
  for (let dy = -radius; dy <= radius; dy += 2) for (let dx = -radius; dx <= radius; dx += 2) {
    const sq = detectSquare(l, { ...box, x: box.x + dx, y: box.y + dy });
    if (!sq) continue;
    if (Math.abs(sq.w - box.w) > Math.max(2.5, box.w * 0.6)) continue;
    // ‼ ריבוע אמיתי מזוהה שוב סביב עצמו; «ריבוע» שהורכב ממסגרת חתוכה וקו שכן — לא
    const again = detectSquare(l, sq);
    if (!again || Math.max(Math.abs(again.x - sq.x), Math.abs(again.y - sq.y), Math.abs(again.w - sq.w), Math.abs(again.h - sq.h)) > 0.35) continue;
    const d = Math.hypot(sq.x + sq.w / 2 - cx, sq.y + sq.h / 2 - cy);
    if (d > radius + 3) continue;
    const score = d + 3 * (Math.abs(sq.w - box.w) + Math.abs(sq.h - box.h));
    if (score < bestScore) { bestScore = score; best = sq; }
  }
  return best;
}

/** תאים: ההיסט הכללי שמתאים הכי הרבה גבולות לקווים מודפסים, ואז דיוק לכל גבול. */
export function snapCellsNear(l: Lum, box: PdfRect, cells: number[], radius = 12): number[] | null {
  const r0 = rowOf(l, box.y + box.h * 0.5), r1 = rowOf(l, box.y);
  if (r1 - r0 < 3) return null;
  const c0 = colOf(l, cells[0] - radius - 2), c1 = colOf(l, cells[cells.length - 1] + radius + 2);
  const cand: number[] = [];
  for (let c = c0; c <= c1; c++) { let n = 0; for (let r = r0; r < r1; r++) if (dark(l, c, r)) n++; if (n / (r1 - r0) > 0.5) cand.push(c); }
  const centers = groups(cand).map(g => ((g[0] + g[g.length - 1] + 1) / 2) / l.scale);
  if (!centers.length) return null;
  let bestShift = 0, bestHits = -1;
  for (let s = -radius; s <= radius; s += 0.25) {
    let hits = 0;
    for (const x of cells) if (centers.some(c => Math.abs(c - (x + s)) <= 0.75)) hits++;
    if (hits > bestHits || (hits === bestHits && Math.abs(s) < Math.abs(bestShift))) { bestHits = hits; bestShift = s; }
  }
  if (bestHits < cells.length) return null;
  return detectCells(l, { ...box, x: box.x + bestShift }, cells.map(x => x + bestShift), 1.5);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
