// ─── בדיקות: הבלוק «תהליך הקליטה שלך» במייל המסמכים ──────────────────────────
// ‼ מה נעול כאן:
//   · «כרגע אין צורך בפעולה מצידכם» רק כשאין בדף שום דבר שממתין ללקוח — אחרת
//     המייל סותר את עצמו, ליד «ועוד דברים שממתינים לכם בדף».
//   · המשפט כתוב בקובץ הפונקציה רק בתוך onboardingStatusText — אף מקום אחר לא
//     מוסיף אותו בלי התנאי.
// ‼ הפונקציה חיה ב-send-process-open-email (Deno), שאי אפשר לייבא ב-Node (Deno.serve,
// ייבוא מ-esm.sh). הבדיקה שולפת אותה מהקובץ עם המהדר של הפרויקט ומריצה את הקוד עצמו.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';

const ROOT = process.cwd();
const ts = createRequire(join(ROOT, 'package.json'))('typescript') as typeof TS;
const FILE = join(ROOT, 'supabase/functions/send-process-open-email/index.ts');
const NO_ACTION = 'כרגע אין צורך בפעולה מצידכם';

type StatusText = (officeLines: string[], pendingActions: number) => string;

function loadHelper(): { fn: StatusText; source: string; helperText: string } {
  const source = readFileSync(FILE, 'utf8');
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let decl: TS.FunctionDeclaration | undefined;
  sf.forEachChild(n => { if (ts.isFunctionDeclaration(n) && n.name?.text === 'onboardingStatusText') decl = n; });
  if (!decl) throw new Error('onboardingStatusText לא נמצאה ב-send-process-open-email/index.ts');
  const helperText = decl.getText(sf);
  const js = ts.transpileModule(helperText, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const fn = new Function(`${js}\nreturn onboardingStatusText;`)() as StatusText;
  return { fn, source, helperText };
}

export const TESTS: TestCase[] = [
  test('אין דבר שממתין ללקוח — מה בטיפולנו, ו«כרגע אין צורך בפעולה»', () => {
    const { fn } = loadHelper();
    const t = fn(['ייפוי כוח בהכנה ', '', 'פתיחת תיק במע"מ'], 0);
    equal(t, `ייפוי כוח בהכנה\nפתיחת תיק במע"מ\n${NO_ACTION}.`);
  }),

  test('יש דברים שממתינים ללקוח — בלי «אין צורך בפעולה», רק מה בטיפולנו', () => {
    const { fn } = loadHelper();
    const t = fn(['ייפוי כוח בהכנה'], 2);
    equal(t, 'ייפוי כוח בהכנה');
    assert(!t.includes('אין צורך בפעולה'), t);
  }),

  test('אין מה להראות — בלי בלוק (גם לא משפט בודד)', () => {
    const { fn } = loadHelper();
    equal(fn(['', '  '], 0), '');
    equal(fn([], 3), '');
  }),

  test('המשפט נכתב בקובץ רק בתוך הפונקציה — והקריאה סופרת את כל מה שממתין', () => {
    const { source, helperText } = loadHelper();
    const outside = source.replace(helperText, '');
    assert(!outside.includes(NO_ACTION), 'המשפט מופיע מחוץ ל-onboardingStatusText — בלי התנאי');
    assert(/onboardingStatusText\([^;]*,\s*actions\.length\)/.test(source),
      'הקריאה צריכה לספור את כל מה שממתין ללקוח בדף (actions.length)');
  }),
];
