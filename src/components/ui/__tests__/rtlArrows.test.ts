// ─── בדיקות: חצים בטקסט עברי (21.10.2026) ────────────────────────────────────
// ‼ מה נעול כאן:
//   · קוד באנגלית ליד חץ ומספר/אנגלית («IDOM ← 4») — הדפדפן הופך את הסדר, וקורא
//     בעברית רואה קודם את ה-4. שרשרת כזאת נכתבת רק דרך ArrowChain / ArrowText
//     (components/ui/ArrowPath.tsx), שמבודדים כל שלב.
//   · → בין פריטים — אסור. בעברית קוראים מימין לשמאל, ו-→ מצביע אחורה. החץ הוא ←.
//     → מותר רק בתחילת טקסט — «→ חזרה», «→ הקודם»; ולהפך, כפתור אחורה לא מקבל «← חזרה».
//   · הסריקה עוברת על כל מחרוזת וטקסט JSX שהמשתמש רואה (לא על הערות), ב-src
//     ובפונקציות השרת (המיילים) — כך גם טקסט חדש שייכתב ייתפס. מסכי בדיקה פנימיים
//     (קבצים שמתחילים ב-__) לא נסרקים.

import { createElement } from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
// ‼ כמו ב-portalModes.test.ts: גרסת node דורשת `stream`, שאגד הבדיקות אינו טוען.
// @ts-expect-error TS7016 — אין הצהרת טיפוסים ל-react-dom/server.browser
import { renderToStaticMarkup } from 'react-dom/server.browser';
import type * as TS from 'typescript';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { ArrowChain, ArrowText } from '../ArrowPath';

const ROOT = process.cwd();
// ‼ נטען בזמן הריצה מהפרויקט (לא מאוגד לתוך הבדיקות) — אותו מהדר שבודק את הקוד.
const ts = createRequire(join(ROOT, 'package.json'))('typescript') as typeof TS;

const TARGETS = ['src', 'supabase/functions'];
const HEB = /[א-ת]/;
/** אנגלית, בלי עברית בדרך, ← ואז אנגלית או ספרה — הרצף שהדפדפן הופך. */
const FLIPS = /[A-Za-z][^א-ת←→]*←\s*[A-Za-z0-9]/;

function sourceFiles(path: string): string[] {
  const abs = join(ROOT, path);
  if (!statSync(abs).isDirectory()) return [abs];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (name === '__tests__' || name === '__dev' || name === 'node_modules' || name.startsWith('__')) continue;
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(relative(ROOT, p)));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** טקסט עברי גלוי שיש בו חץ. `lead` — האם → בתחילתו נחשב «→ חזרה» (לא בהמשך של תבנית). */
function arrowTexts(fileName: string, source: string): { text: string; line: number; lead: boolean }[] {
  if (!/[←→]/.test(source)) return [];
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number; lead: boolean }[] = [];
  const visit = (n: TS.Node) => {
    const lead = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isJsxText(n);
    if ((lead || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && HEB.test(n.text) && /[←→]/.test(n.text)) {
      out.push({ text: n.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, lead });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const backwardArrow = (t: { text: string; lead: boolean }) =>
  (t.lead ? t.text.trimStart().replace(/^→/, '') : t.text).includes('→');
/** «← חזרה» — חץ קדימה על כפתור אחורה. */
const BACK_FORWARD = /←\s*(חזרה|הקודם|לחזור|שאלה קודמת)/;

export const TESTS: TestCase[] = [
  test('הסורק: מה נתפס ומה מותר', () => {
    const src = [
      '// IDOM ← 4 בהערה',
      'const a = "דוחות: IDOM ← 4";',
      'const b = "גביית מס → 134 מקדמות";',
      'const c = <button>→ חזרה</button>;',
      'const d = <button>הבא ←</button>;',
      'const e = `פטור ${x} → חייב`;',
      'const f = "IDOM ← אפשרות 4 ← סוג רשימה 1";',
      'const g = "«המשרד» ← «חיבורים»";',
      'const h = <button>← חזרה ללקוחות</button>;',
    ].join('\n');
    const texts = arrowTexts('probe.tsx', src);
    equal(texts.filter(t => FLIPS.test(t.text)).map(t => t.line).join(','), '2', 'רק «IDOM ← 4» מתהפך');
    equal(texts.filter(backwardArrow).map(t => t.line).join(','), '3,6', '→ באמצע (גם בהמשך תבנית); «→ חזרה» מותר');
    equal(texts.filter(t => BACK_FORWARD.test(t.text)).map(t => t.line).join(','), '9', '«← חזרה» — החץ הפוך');
  }),

  test('אין חץ שמתהפך ואין → בין פריטים — בכל טקסט עברי גלוי', () => {
    const files = TARGETS.flatMap(sourceFiles);
    assert(files.length > 200, `נמצאו רק ${files.length} קבצים — הנתיבים זזו?`);
    const flips: string[] = [], back: string[] = [], backBtn: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      for (const t of arrowTexts(f, readFileSync(f, 'utf8'))) {
        const at = `${rel}:${t.line} «${t.text.trim().slice(0, 70)}»`;
        if (FLIPS.test(t.text)) flips.push(at);
        if (backwardArrow(t)) back.push(at);
        if (BACK_FORWARD.test(t.text)) backBtn.push(at);
      }
    }
    assert(backBtn.length === 0, `«← חזרה» — כפתור אחורה מקבל →, כמו «→ חזרה»:\n        ${backBtn.join('\n        ')}`);
    assert(flips.length === 0, `אנגלית ליד חץ ומספר — הסדר מתהפך. כותבים <ArrowChain steps={['IDOM', 'אפשרות 4']} /> או «IDOM ← אפשרות 4»:\n        ${flips.join('\n        ')}`);
    assert(back.length === 0, `→ בין פריטים מצביע אחורה בעברית — החץ הוא ← (→ רק בתחילת «→ חזרה»):\n        ${back.join('\n        ')}`);
  }),

  test('ArrowChain: כל שלב מבודד, חץ אחד בין שלבים, ולא אחרי האחרון', () => {
    const html = renderToStaticMarkup(createElement(ArrowChain, { steps: ['IDOM', 'אפשרות 4', 'סוג רשימה 1'] }));
    equal((html.match(/<bdi>/g) ?? []).length, 3);
    equal((html.match(/←/g) ?? []).length, 2);
    assert(html.indexOf('<bdi>IDOM</bdi>') < html.indexOf('<bdi>אפשרות 4</bdi>'), 'הסדר במקור = סדר הקריאה');
    assert(/aria-hidden="true">←/.test(html), 'קורא מסך לא מקריא «חץ שמאלה»');
  }),

  test('ArrowText: נתיב עם ← נעשה שרשרת; בלי חץ — הטקסט כמו שהוא', () => {
    const chain = renderToStaticMarkup(createElement(ArrowText, { text: 'גביית מס הכנסה ← 134 מקדמות ← מידע לתיק' }));
    equal((chain.match(/<bdi>/g) ?? []).length, 3);
    equal(renderToStaticMarkup(createElement(ArrowText, { text: 'רשימת עיסוקים' })), 'רשימת עיסוקים');
  }),
];
