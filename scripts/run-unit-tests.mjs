#!/usr/bin/env node
// ─── מריץ בדיקות היחידה ─────────────────────────────────────────────────────
// ‼ בלי תלות חדשה: esbuild כבר מותקן (vite נשען עליו), ולכן הבדיקות נכתבות
// ב-TypeScript רגיל תחת src/ (ו-`tsc` בודק אותן), מאוגדות כאן לקובץ אחד,
// ורצות ב-Node. הקריטריון: יציאה 0 = הכול עבר.
//
// שימוש:  node scripts/run-unit-tests.mjs [pattern]

import { readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/** נתיב מוחלט כ-string ל-import: esbuild אינו פותר file:// URLs. */
const esc = (p) => JSON.stringify(p.split('\\').join('/'));

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, 'src');

function findTests(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findTests(p));
    else if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

const pattern = process.argv[2];
const files = findTests(SRC)
  .filter(f => !pattern || f.includes(pattern))
  .sort();

if (files.length === 0) {
  console.error('לא נמצאו קבצי בדיקה.');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'pivo-tests-'));
try {
  const entry = join(tmp, 'entry.ts');
  const imports = files.map((f, i) => `import { TESTS as T${i} } from ${esc(f)};`).join('\n');
  const suites = files.map((f, i) => `  { file: ${JSON.stringify(relative(ROOT, f).replace(/\\/g, '/'))}, tests: T${i} },`).join('\n');
  writeFileSync(entry, `
${imports}
import { runSuiteAsync } from ${esc(join(SRC, 'testkit/tinyTest.ts'))};

const suites = [
${suites}
];

let failed = 0, passed = 0;
for (const s of suites) {
  console.log('\\n── ' + s.file);
  for (const r of await runSuiteAsync(s.tests)) {
    if (r.error) { failed++; console.log('  ✗ ' + r.name + '\\n      ' + r.error); }
    else { passed++; console.log('  ✓ ' + r.name); }
  }
}
console.log('\\n' + passed + ' עברו, ' + failed + ' נכשלו');
if (failed > 0) process.exit(1);
`, 'utf8');

  const outfile = join(tmp, 'bundle.mjs');
  await build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
    // ‼ הבדיקות טהורות ואינן נוגעות ב-DOM, אבל מודולים משותפים עלולים לייבא
    // קבצי סגנון/נכסים — esbuild מדלג עליהם במקום ליפול.
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
    // ‼ מודולים משותפים (למשל מתאמי האוטומציה) מייבאים בעקיפין את לקוח
    // Supabase, שנבנה בטעינה מ-import.meta.env. ערכי דמה — הבדיקות טהורות
    // ואינן פונות לרשת.
    define: {
      'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'unit-test', DEV: false, PROD: false, MODE: 'test' }),
    },
  });

  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
