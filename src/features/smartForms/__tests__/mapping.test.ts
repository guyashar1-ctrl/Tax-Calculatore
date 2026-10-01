// ─── גרסאות המיפוי והגיאומטריה המודפסת ──────────────────────────────────────
// הרצה: node scripts/run-unit-tests.mjs mapping
// ההחלה/ההפרש של גרסה (210) והזיהוי של ריבוע/קו/משבצות — על רסטר סינתטי (בלי PDF).

import { test, assert, equal, deepEqual, type TestCase } from '../../../testkit/tinyTest';
import { BTL6101_TEMPLATE } from '../btl6101/template';
import { applyMapping, diffFromBase, type MappingFields } from '../mappingCore';
import { detectSquare, detectLine, detectCells, findSquareNear, snapCellsNear, type Lum } from '../printedGeometry';

const T = BTL6101_TEMPLATE;
const withLine = T.fields.find(f => f.line != null)!;
const withCells = T.fields.find(f => f.cells && f.cells.length > 2)!;
const plain = T.fields.find(f => f.line == null && !f.cells)!;

// ── רסטר סינתטי: עמוד 100×100 נק' בסקאלה 6, לבן, ומלבנים שחורים בנקודות PDF ──
const PAGE = 100, SCALE = 6;
function blank(): Lum {
  return { w: PAGE * SCALE, h: PAGE * SCALE, scale: SCALE, pageH: PAGE, d: new Uint8Array(PAGE * SCALE * PAGE * SCALE).fill(255) };
}
function fill(l: Lum, x0: number, y0: number, x1: number, y1: number) {
  for (let r = Math.round((PAGE - y1) * SCALE); r < Math.round((PAGE - y0) * SCALE); r++)
    for (let c = Math.round(x0 * SCALE); c < Math.round(x1 * SCALE); c++) l.d[r * l.w + c] = 0;
}
/** ריבוע סימון: מסגרת בעובי 0.5 נק' סביב פנים 20.5–27.5. */
function withSquare(l = blank()) {
  fill(l, 20, 20, 28, 20.5); fill(l, 20, 27.5, 28, 28);
  fill(l, 20, 20, 20.5, 28); fill(l, 27.5, 20, 28, 28);
  return l;
}
const SQUARE = { x: 20.5, y: 20.5, w: 7, h: 7 };

export const TESTS: TestCase[] = [
  // ── החלה והפרש ──
  test('גרסה בלי תיקונים = הבסיס, עם מספר הגרסה החדש', () => {
    const t = applyMapping(T, { version: 3, fields: {} });
    equal(t.mappingVersion, 3);
    deepEqual(t.fields, T.fields);
    deepEqual(diffFromBase(T, t), {});
  }),

  test('תיקון מלבן/קו/משבצות חל רק על השדה שלו', () => {
    const m: MappingFields = {
      [plain.id]: { box: { ...plain.box, x: plain.box.x + 1.5 } },
      [withLine.id]: { line: null },
      [withCells.id]: { cells: withCells.cells!.map(c => c + 0.25) },
    };
    const t = applyMapping(T, { version: 4, fields: m });
    const by = new Map(t.fields.map(f => [f.id, f]));
    equal(by.get(plain.id)!.box.x, plain.box.x + 1.5);
    equal(by.get(withLine.id)!.line, undefined, 'line: null מוחק את הקו');
    deepEqual(by.get(withCells.id)!.cells, withCells.cells!.map(c => c + 0.25));
    const others = t.fields.filter(f => !(f.id in m));
    deepEqual(others, T.fields.filter(f => !(f.id in m)), 'שאר השדות לא זזו');
    // הבסיס עצמו לא השתנה
    equal(T.fields.find(f => f.id === plain.id)!.box.x, plain.box.x);
  }),

  test('הפרש מהבסיס מחזיר בדיוק את מה ששונה (הלוך-חזור)', () => {
    const m: MappingFields = {
      [plain.id]: { box: { x: plain.box.x + 0.12, y: plain.box.y, w: plain.box.w, h: plain.box.h } },
      [withLine.id]: { line: withLine.line! - 0.5 },
    };
    const d = diffFromBase(T, applyMapping(T, { version: 3, fields: m }));
    deepEqual(Object.keys(d).sort(), Object.keys(m).sort());
    for (const k of Object.keys(m)) deepEqual(d[k], m[k], k);
  }),

  test('הפרש מעגל לשתי ספרות — רעש ציפה לא נשמר כשינוי', () => {
    const t = applyMapping(T, { version: 3, fields: { [plain.id]: { box: { ...plain.box, x: plain.box.x + 0.001 } } } });
    deepEqual(diffFromBase(T, t), {});
  }),

  // ── הגיאומטריה המודפסת ──
  test('ריבוע מודפס: הפנים בין קווי המסגרת', () => {
    deepEqual(detectSquare(withSquare(), { x: 21, y: 21, w: 6, h: 6 }), SQUARE);
    equal(detectSquare(blank(), { x: 21, y: 21, w: 6, h: 6 }), null, 'דף ריק — אין ריבוע');
  }),

  test('הצמדה אחרי גרירה: הריבוע הקרוב נמצא גם 8 נק\' מהמקום', () => {
    deepEqual(findSquareNear(withSquare(), { x: 26.5, y: 25.5, w: 7, h: 7 }), SQUARE);
    equal(findSquareNear(blank(), { x: 26.5, y: 25.5, w: 7, h: 7 }), null);
  }),

  test('הצמדה לא מחליפה ריבוע בקו ארוך שעובר ליד', () => {
    const l = blank();
    fill(l, 10, 40, 90, 40.5);
    equal(findSquareNear(l, { x: 30, y: 38, w: 7, h: 7 }), null);
  }),

  test('קו כתיבה: הקצה העליון של הקו הקרוב לתחתית השדה', () => {
    const l = blank();
    fill(l, 10, 50, 90, 50.5);
    equal(detectLine(l, { x: 20, y: 51, w: 40, h: 6 }), 50.5);
    equal(detectLine(l, { x: 20, y: 60, w: 40, h: 6 }), null, 'מחוץ לטווח');
    equal(detectLine(l, { x: 20, y: 60, w: 40, h: 6 }, undefined, 10), 50.5, 'טווח מורחב אחרי גרירה');
  }),

  test('משבצות ספרות: זיהוי, והצמדה אחרי היסט של 6 נק\'', () => {
    const l = blank();
    for (const x of [40, 45, 50]) fill(l, x, 60, x + 0.5, 66);
    const box = { x: 38, y: 60, w: 15, h: 6 };
    const want = [40.25, 45.25, 50.25];
    deepEqual(detectCells(l, box, want), want);
    deepEqual(snapCellsNear(l, { ...box, x: box.x + 6 }, want.map(c => c + 6)), want);
    equal(detectCells(l, box, [40.25, 45.25, 58]), null, 'גבול שאין לו קו — לא ממציאים');
  }),

  test('בסיס המיפוי: לכל שדה עם משבצות יש גבולות עולים', () => {
    for (const f of T.fields) if (f.cells) assert(f.cells.every((c, i) => i === 0 || c > f.cells![i - 1]), f.id);
  }),
];
