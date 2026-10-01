// ─── גרסאות המיפוי — החלק הטהור (בלי שרת): החלה על הבסיס והפרש ממנו ─────────────
// ראה mapping.ts. כאן בלבד כדי שבדיקות היחידה לא ימשכו את לקוח ה-supabase.

import type { FieldDef, PdfRect, SmartFormTemplate } from './types';

export interface FieldGeometry {
  box?: PdfRect;
  /** הקצה העליון של קו הכתיבה; null = אין קו. */
  line?: number | null;
  cells?: number[];
  baseline?: number | null;
}
export type MappingFields = Record<string, FieldGeometry>;
export interface MappingVersion { version: number; fields: MappingFields }

const r2 = (n: number) => Math.round(n * 100) / 100;
const sameRect = (a: PdfRect, b: PdfRect) => r2(a.x) === r2(b.x) && r2(a.y) === r2(b.y) && r2(a.w) === r2(b.w) && r2(a.h) === r2(b.h);

/** הבסיס + תיקוני הגרסה ⇒ התבנית שמציירים איתה. */
export function applyMapping(base: SmartFormTemplate, m: MappingVersion): SmartFormTemplate {
  const fields = base.fields.map(f => {
    const g = m.fields[f.id];
    if (!g) return f;
    const out: FieldDef = { ...f };
    if (g.box) out.box = { ...g.box };
    if ('line' in g) { if (g.line == null) delete out.line; else out.line = g.line; }
    if ('baseline' in g) { if (g.baseline == null) delete out.baseline; else out.baseline = g.baseline; }
    if (g.cells) out.cells = [...g.cells];
    return out;
  });
  return { ...base, mappingVersion: m.version, fields };
}

/** מה שונה מהבסיס — זה מה שנשמר בגרסה (ולא העתק של כל המיפוי). */
export function diffFromBase(base: SmartFormTemplate, edited: SmartFormTemplate): MappingFields {
  const out: MappingFields = {};
  const byId = new Map(base.fields.map(f => [f.id, f]));
  for (const f of edited.fields) {
    const b = byId.get(f.id);
    if (!b) continue;
    const g: FieldGeometry = {};
    if (!sameRect(b.box, f.box)) g.box = { x: r2(f.box.x), y: r2(f.box.y), w: r2(f.box.w), h: r2(f.box.h) };
    if ((b.line ?? null) !== (f.line ?? null)) g.line = f.line == null ? null : r2(f.line);
    if ((b.baseline ?? null) !== (f.baseline ?? null)) g.baseline = f.baseline == null ? null : r2(f.baseline);
    if (f.cells && (!b.cells || b.cells.length !== f.cells.length || b.cells.some((c, i) => r2(c) !== r2(f.cells![i])))) g.cells = f.cells.map(r2);
    if (Object.keys(g).length) out[f.id] = g;
  }
  return out;
}
