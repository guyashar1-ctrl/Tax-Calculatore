// ─── כל קובץ CSS סגור: אין «{» שלא נסגר ואין «}» מיותר ─────────────────────────
// ‼ 19.10.2026: מיזוג השמיט «}» אחרי ‎@media (max-width: 480px)‎ ב-taxYear.css. בבנייה כל קבצי
// ה-CSS מתחברים לקובץ אחד, ולכן כל מה שבא אחריו (משטח הבקשות, תפריטי «⋯», הפס של סביבת
// ההדגמה) הפך ל«רק בטלפון» — באתר דף הבקשות נראה שבור, ובשרת הפיתוח הכול נראה תקין.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';

const SRC = join(process.cwd(), 'src');

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** עומק הסוגריים בסוף הקובץ, והשורה של כל «{» שלא נסגר — בלי הערות ומחרוזות. */
export function braceBalance(css: string): { depth: number; extraClose: number; unclosedLines: number[] } {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  const open: number[] = [];
  let line = 1, extraClose = 0;
  for (const ch of clean) {
    if (ch === '\n') line++;
    else if (ch === '{') open.push(line);
    else if (ch === '}') { if (open.length) open.pop(); else extraClose++; }
  }
  return { depth: open.length, extraClose, unclosedLines: open };
}

export const TESTS: TestCase[] = [
  test('braceBalance: מזהה «{» שלא נסגר, «}» מיותר, ומתעלם מהערות ומחרוזות', () => {
    assert(braceBalance('@media (x) {\n  .a { b: c; }\n').unclosedLines[0] === 1, 'הבלוק שנפתח בשורה 1 לא נסגר');
    assert(braceBalance('.a { b: c; } }').extraClose === 1, '«}» מיותר');
    const ok = braceBalance('/* { */ .a { content: "}"; } .b::after { content: \'{\'; }');
    assert(ok.depth === 0 && ok.extraClose === 0, 'הערות ומחרוזות אינן סוגריים');
  }),
  test('כל קובצי ה-CSS ב-src מאוזנים', () => {
    const bad = cssFiles(SRC).map(f => ({ f: relative(process.cwd(), f), b: braceBalance(readFileSync(f, 'utf8')) }))
      .filter(x => x.b.depth || x.b.extraClose)
      .map(x => `${x.f}: ${x.b.depth ? `לא נסגר (שורות ${x.b.unclosedLines.join(', ')})` : ''}${x.b.extraClose ? ` ${x.b.extraClose} «}» מיותרים` : ''}`);
    assert(bad.length === 0, bad.join(' · '));
  }),
];
