// ─── מיקום מדויק — העורך, מרכוז אופטי, מרווח מקו, חתימה על הקו ──────────────
// הרצה: node scripts/run-unit-tests.mjs placement
// הבדיקה מול הרינדור האמיתי (דיו מול קווים מודפסים) — scripts/test-smart-form-6101.mjs.

import { test, assert, equal, type TestCase } from '../../../testkit/tinyTest';
import { lineOffset } from '../../../utils/pdfAnnotations';
import { layoutFields } from '../layout';
import { textAnnotation, signatureAnnotation, SIGNATURE_LINE_GAP } from '../exportPdf';
import { SIGNATURE_PAD_PX } from '../signatureImage';
import { BTL6101_TEMPLATE, CHECK_SQUARES, WRITING_LINES } from '../btl6101/template';
import type { DrawOp, FieldDef, MeasureText } from '../types';

const T = BTL6101_TEMPLATE;
const PAGE = { width: 612, height: 792 };
const near = (a: number, b: number, msg: string, eps = 1e-6) => assert(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);

/**
 * מדידה סינתטית עם «דיו»: חצי em לתו; «1» — הדיו מוסט ימינה (כמו בגופן
 * האמיתי); g/ק/פסיק — זנב של 0.2em מתחת לקו הבסיס.
 */
const inkMeasure: MeasureText = Object.assign(
  (t: string, s: number) => t.length * s * 0.5,
  {
    ink: (t: string, s: number) => {
      const advance = t.length * s * 0.5;
      if (t === '1') return { minX: 0.25 * s, maxX: 0.45 * s, minY: 0, maxY: 0.71 * s, advance };
      const minY = /[gpqyקךןףץ,]/.test(t) ? -0.2 * s : 0;
      return { minX: 0.05 * s, maxX: advance - 0.05 * s, minY, maxY: 0.71 * s, advance };
    },
  },
);
const plainMeasure: MeasureText = (t: string, s: number) => t.length * s * 0.5;

const field = (over: Partial<FieldDef>): FieldDef => ({
  id: 'f', dataKey: 'x', label: 'שדה', page: 1, box: { x: 100, y: 100, w: 120, h: 11 }, kind: 'text',
  fontSize: 10, minFontSize: 7, source: '', formatRule: '', applies: 'always', required: 'optional',
  provenance: 'card', clientConfirmation: false, overflow: 'shrink', ...over,
} as FieldDef);

const lay = (f: FieldDef, value: string, measure: MeasureText = inkMeasure) =>
  layoutFields({ template: { ...T, fields: [f] }, valueOf: () => value, isActive: () => true, measure }).ops
    .filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text');

/** PNG מינימלי — רק כותרת IHDR (רוחב/גובה). מספיק לחישוב המיקום. */
function fakePng(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

/** המלבן של סימון במרחב ה-PDF (נק', ציר y למעלה). */
const pdfRect = (a: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => {
  const w = a.widthPct * PAGE.width, h = a.heightPct * PAGE.height;
  const x = a.xPct * PAGE.width, top = a.yPct * PAGE.height;
  return { x, y: PAGE.height - top - h, w, h };
};

export const TESTS: TestCase[] = [
  // ── העורך: יישור שורה ──
  test('עורך: יישור מפורש — ימין/מרכז/שמאל, וטקסט רחב מהתיבה לא נדחף החוצה', () => {
    equal(lineOffset('center', 'abc', 100, 40), 30);
    equal(lineOffset('right', 'abc', 100, 40), 60);
    equal(lineOffset('left', 'שלום', 100, 40), 0);
    equal(lineOffset('right', 'abc', 100, 140), 0);
  }),
  test('עורך: בלי יישור — עברית לימין, לטינית לשמאל (ההתנהגות הקודמת)', () => {
    equal(lineOffset(undefined, 'שלום', 100, 40), 60);
    equal(lineOffset(undefined, 'abc', 100, 40), 0);
  }),
  test('עורך: סימון טקסט של טופס חכם — קו הבסיס והקצה נשמרים בהמרה לאחוזים', () => {
    const a = textAnnotation(PAGE, 'p1', 'abc', 300, 400, 10, 'right', 50, plainMeasure);
    const r = pdfRect(a);
    near(r.x + r.w, 300, 'הקצה הימני בעוגן');
    // העורך מצייר את קו הבסיס ב-top + 0.82·גודל
    near(PAGE.height - (a.yPct * PAGE.height + 0.82 * a.fontPct! * PAGE.height), 400, 'קו הבסיס');
    near(a.fontPct! * PAGE.height, 10, 'גודל הגופן');
    equal(a.align, 'right');
  }),

  // ── מרכוז אופטי ──
  test('ספרות: מרכז הדיו על מרכז התא — «1» מוסט, «0» לא', () => {
    const f = field({ kind: 'digits', box: { x: 0, y: 100, w: 30, h: 10 }, cells: [0, 10, 20, 30], align: 'center' });
    deepXs(lay(f, '111'), [4, 14, 24], '«1»');
    deepXs(lay(f, '000'), [5, 15, 25], '«0»');
  }),
  test('ספרות: בלי מדידת דיו — מרכז התא (לא נופל)', () => {
    const f = field({ kind: 'digits', box: { x: 0, y: 100, w: 30, h: 10 }, cells: [0, 10, 20, 30], align: 'center' });
    deepXs(lay(f, '111', plainMeasure), [5, 15, 25], 'ללא דיו');
  }),
  test('טקסט ממורכז בשורה אחת — מרכוז אופטי; טקסט לימין — צמוד לריפוד בלי הזזה', () => {
    const c = lay(field({ align: 'center' }), '1');
    near(c[0].x, 160 - 1, 'ממורכז');
    const r = lay(field({ align: 'right' }), '1');
    near(r[0].x, 220 - 1, 'לימין (ריפוד 1 בשדה נמוך)');
  }),

  // ── מרווח מקו הכתיבה ──
  test('קו כתיבה: זנב תחתון מורם בדיוק עד 0.4 נק\' מעל הקו; בלי זנב — נשאר במרכז', () => {
    const f = field({ line: 100.5 });                      // תיבה 100–111, מרכז קו בסיס 101.95
    near(lay(f, 'abc')[0].y, 101.95, 'בלי זנב');
    near(lay(f, 'ggg')[0].y, 102.9, 'עם זנב: 100.5 + 0.4 + 2');
  }),
  test('קו כתיבה: ההרמה לא מוציאה את ראש האותיות מהשדה', () => {
    const f = field({ line: 100.5, box: { x: 100, y: 100, w: 120, h: 9.5 } });
    near(lay(f, 'ggg')[0].y, 102.4, 'חסום בראש השדה: 109.5 − 7.1');
  }),
  test('קו כתיבה: שדה בלי קו — לא זז', () => {
    near(lay(field({}), 'ggg')[0].y, 101.95, 'ללא קו');
  }),

  // ── חתימה ──
  test('חתימה: הדיו (בלי השוליים השקופים) ממורכז לרוחב ונח 0.5 נק\' מעל הקו', () => {
    const pad = SIGNATURE_PAD_PX;
    const box = { x: 100, y: 200, w: 120, h: 30 };
    const a = signatureAnnotation(PAGE, 'p1', box, fakePng(100 + 2 * pad, 30 + 2 * pad), 201);
    const r = pdfRect(a);
    const scale = r.w / (100 + 2 * pad);
    near(scale, Math.min(120 / 100, (230 - 201 - SIGNATURE_LINE_GAP) / 30), 'קנה מידה', 1e-9);
    near(r.y + pad * scale, 201 + SIGNATURE_LINE_GAP, 'תחתית הדיו על הקו', 1e-6);
    near(r.x + pad * scale + 50 * scale, 160, 'מרכז הדיו במרכז התיבה', 1e-6);
    near(r.y + r.h - pad * scale, 230, 'ראש הדיו בראש התיבה', 1e-6);
    near(r.w / r.h, (100 + 2 * pad) / (30 + 2 * pad), 'פרופורציות', 1e-9);
  }),
  test('חתימה רחבה: ממלאת את הרוחב ועדיין נחה על הקו', () => {
    const pad = SIGNATURE_PAD_PX;
    const a = signatureAnnotation(PAGE, 'p1', { x: 100, y: 200, w: 120, h: 30 }, fakePng(200 + 2 * pad, 10 + 2 * pad), 201);
    const r = pdfRect(a);
    const scale = r.w / (200 + 2 * pad);
    near(200 * scale, 120, 'רוחב הדיו = רוחב התיבה', 1e-6);
    near(r.y + pad * scale, 201.5, 'על הקו', 1e-6);
  }),
  test('חתימה בלי קו מודפס: נחה על תחתית התיבה', () => {
    const pad = SIGNATURE_PAD_PX;
    const a = signatureAnnotation(PAGE, 'p1', { x: 100, y: 200, w: 120, h: 30 }, fakePng(100 + 2 * pad, 30 + 2 * pad));
    const r = pdfRect(a);
    near(r.y + pad * (r.w / (100 + 2 * pad)), 200, 'תחתית התיבה', 1e-6);
  }),

  // ── הגיאומטריה שנמדדה (מיפוי 2) ──
  test('מיפוי 2: כל ריבוע נמדד שייך לתיבת סימון קיימת, וה-✗ מצויר בו', () => {
    equal(T.mappingVersion, 2);
    for (const [id, sq] of Object.entries(CHECK_SQUARES)) {
      const f = T.fields.find(x => x.id === id);
      assert(!!f, `ריבוע ${id} בלי שדה — שגיאת כתיב נבלעת בשקט`);
      equal(f!.kind, 'checkbox', id);
      equal(JSON.stringify(f!.box), JSON.stringify(sq), `${id}: התיבה = הריבוע`);
      assert(Math.abs(sq.w - sq.h) < 0.5, `${id}: לא ריבוע`);
    }
  }),
  test('מיפוי 2: כל קו כתיבה שייך לשדה קיים ויושב בתחתית השדה', () => {
    for (const [id, line] of Object.entries(WRITING_LINES)) {
      const f = T.fields.find(x => x.id === id);
      assert(!!f, `קו ${id} בלי שדה`);
      equal(f!.line, line, id);
      assert(line >= f!.box.y - 3 && line <= f!.box.y + f!.box.h / 2, `${id}: הקו ${line} רחוק מתחתית השדה ${f!.box.y}`);
    }
  }),
];

function deepXs(ops: Extract<DrawOp, { kind: 'text' }>[], xs: number[], msg: string) {
  equal(ops.length, xs.length, `${msg}: מספר ספרות`);
  ops.forEach((o, i) => near(o.x, xs[i], `${msg} · תא ${i}`));
}
