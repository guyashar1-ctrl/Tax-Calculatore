// ─── פריסת ערכים על טופס חכם — טהור, בלי PDF ובלי DOM ──────────────────────
// מקבל את מלאי השדות וערך לכל שדה, ומחזיר פעולות ציור במרחב העמוד. אותה
// פונקציה משרתת את הייצוא ואת הבדיקות; התצוגה המקדימה מציגה את ה-PDF שיצא
// ממנה. ‼ טקסט שלא נכנס לעולם אינו נחתך בשקט: הוא מוקטן עד המינימום, עובר
// לשתי שורות כשהתא מאפשר, ואחרת נרשמת בעיה שחוסמת נעילה לחתימה.

import type { DrawOp, FieldDef, LayoutIssue, MeasureText, PdfRect, SmartFormTemplate } from './types';

/** גובה אות גדולה ביחס לגודל הגופן (Noto Sans / Noto Sans Hebrew ≈ 0.71). */
const CAP = 0.71;
const LINE_GAP = 1.12;
const STEP = 0.25;

export type FieldValue = string | boolean | undefined | null;

export interface LayoutInput {
  template: SmartFormTemplate;
  /** הערך לכל שדה (לפי FieldDef). undefined/'' ⇒ לא מצויר. */
  valueOf: (field: FieldDef) => FieldValue;
  /** האם השדה רלוונטי בהגשה הזו (גילוי הדרגתי). לא רלוונטי ⇒ לא מצויר כלל. */
  isActive: (field: FieldDef) => boolean;
  measure: MeasureText;
}

const padFor = (f: Pick<FieldDef, 'box'>) => (f.box.h >= 14 ? 2.5 : 1);

/** קו בסיס שממרכז אות גדולה אנכית בתוך המלבן. */
export function centeredBaseline(box: PdfRect, size: number): number {
  return box.y + (box.h - size * CAP) / 2;
}

function anchorX(box: PdfRect, pad: number, align: 'right' | 'left' | 'center'): number {
  return align === 'right' ? box.x + box.w - pad : align === 'left' ? box.x + pad : box.x + box.w / 2;
}

/** פיצול לשתי שורות מאוזנות לפי מילים (בסדר לוגי — השורה הראשונה למעלה). */
export function splitTwoLines(text: string, measure: MeasureText, size: number): [string, string] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    // כתובת מייל נשברת רק לפני ה-@ — לעולם לא באמצע מילה.
    const at = text.lastIndexOf('@');
    return at > 0 ? [text.slice(0, at), text.slice(at)] : null;
  }
  let best: [string, string] | null = null;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(measure(a, size), measure(b, size));
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  return best;
}

export interface TextFit { lines: string[]; size: number; fits: boolean; }

/**
 * ההתאמה עצמה — חשופה לבדיקות. הגודל הגדול ביותר בשורה אחת; כשהשדה מאפשר
 * שתי שורות והן נותנות גופן גדול בפועל (≥ נקודה אחת) — שתי שורות. מתחת
 * למינימום — לא נכנס (בעיה חוסמת), לעולם לא חיתוך.
 */
export function fitText(text: string, f: Pick<FieldDef, 'box' | 'fontSize' | 'minFontSize' | 'overflow'>, measure: MeasureText): TextFit {
  const pad = padFor(f as FieldDef);
  const maxW = f.box.w - pad * 2;
  let s1: number | undefined;
  for (let s = f.fontSize; s >= f.minFontSize - 1e-9; s -= STEP) {
    if (measure(text, s) <= maxW) { s1 = s; break; }
  }
  if (s1 === f.fontSize) return { lines: [text], size: round(s1), fits: true };
  let two: { lines: [string, string]; size: number } | undefined;
  if (f.overflow === 'shrink_wrap2') {
    for (let s = f.fontSize; s >= f.minFontSize - 1e-9; s -= STEP) {
      if (2 * s * LINE_GAP > f.box.h - 1) continue;
      const t = splitTwoLines(text, measure, s);
      if (t && measure(t[0], s) <= maxW && measure(t[1], s) <= maxW) { two = { lines: t, size: s }; break; }
    }
  }
  if (two && (s1 === undefined || two.size >= s1 + 1)) return { lines: two.lines, size: round(two.size), fits: true };
  if (s1 !== undefined) return { lines: [text], size: round(s1), fits: true };
  return { lines: [text], size: f.minFontSize, fits: false };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function layoutFields({ template, valueOf, isActive, measure }: LayoutInput): { ops: DrawOp[]; issues: LayoutIssue[] } {
  const ops: DrawOp[] = [];
  const issues: LayoutIssue[] = [];

  for (const f of template.fields) {
    if (!isActive(f)) continue;
    const v = valueOf(f);

    if (f.kind === 'checkbox') {
      if (v === true) ops.push({ kind: 'check', page: f.page, fieldId: f.id, box: f.box });
      continue;
    }
    if (f.kind === 'signature') {
      if (f.signer) ops.push({ kind: 'signature', page: f.page, fieldId: f.id, signer: f.signer, box: f.box });
      continue;
    }
    if (typeof v !== 'string') continue;
    const text = v.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    if (f.kind === 'digits') {
      layoutDigits(f, text, ops, issues);
      continue;
    }

    const fit = fitText(text, f, measure);
    if (!fit.fits) {
      issues.push({ fieldId: f.id, code: 'overflow', message: `«${f.label}»: הטקסט ארוך מדי לשדה גם בגודל ${f.minFontSize} — יש לקצר` });
    }
    const pad = padFor(f);
    const align = f.align ?? 'right';
    const x = anchorX(f.box, pad, align);
    if (fit.lines.length === 1) {
      const y = f.baseline ?? centeredBaseline(f.box, fit.size);
      ops.push({ kind: 'text', page: f.page, fieldId: f.id, text: fit.lines[0], x, y, size: fit.size, align, width: f.box.w - pad * 2 });
    } else {
      const lh = fit.size * LINE_GAP;
      const block = lh + fit.size * CAP;
      const top = f.box.y + (f.box.h + block) / 2 - fit.size * CAP;
      fit.lines.forEach((line, i) => ops.push({
        kind: 'text', page: f.page, fieldId: f.id, text: line, x, y: round(top - i * lh), size: fit.size, align, width: f.box.w - pad * 2,
      }));
    }
  }
  return { ops, issues };
}

/**
 * ספרה אחת לכל תיבה. קבוצות מופרדות ב-«|» בערך («03|1234567»); קבוצה שקיבלה
 * פחות ספרות מתיבותיה מיושרת לימין (צמודה לקבוצה הבאה). ערך ארוך מהתיבות —
 * שגיאה, לא חיתוך.
 */
function layoutDigits(f: FieldDef, text: string, ops: DrawOp[], issues: LayoutIssue[]) {
  const cells = f.cells ?? [];
  const n = cells.length - 1;
  if (n <= 0) return;
  const groups = f.groups ?? [n];
  const parts = groups.length > 1 ? text.split('|') : [text.replace(/\|/g, '')];
  if (parts.length !== groups.length) {
    issues.push({ fieldId: f.id, code: 'bad_length', message: `«${f.label}»: מבנה לא תקין` });
    return;
  }
  let start = 0;
  groups.forEach((size, gi) => {
    const part = parts[gi].replace(/\s/g, '');
    if (!/^\d*$/.test(part)) {
      issues.push({ fieldId: f.id, code: 'bad_chars', message: `«${f.label}»: ספרות בלבד` });
    } else if (part.length > size) {
      issues.push({ fieldId: f.id, code: 'bad_length', message: `«${f.label}»: ${part.length} ספרות, בטופס יש ${size} תיבות` });
    } else {
      const offset = size - part.length;
      [...part].forEach((d, i) => {
        const c = start + offset + i;
        const x = round((cells[c] + cells[c + 1]) / 2);
        const y = f.baseline ?? centeredBaseline(f.box, f.fontSize);
        ops.push({ kind: 'text', page: f.page, fieldId: f.id, text: d, x, y, size: f.fontSize, align: 'center', width: cells[c + 1] - cells[c] });
      });
    }
    start += size;
  });
}
