#!/usr/bin/env node
// ─── בונה את מאגר הכללים (corpus.json) מהידע הקיים ───────────────────────────
// ‼ 21.10.2026: מקור אחד — דפי הנושאים, שכבת הלימוד, הערות התחומים, מסמכי המקור והמרשם (buildCorpus.tsx).
//   הקובץ נכתב לשני מקומות: לדפדפן (src/…/corpus/corpus.json) ולפונקציית השרת (supabase/functions/knowledge-answer/).
// שימוש:  node scripts/knowledge-corpus.mjs          ← כותב
//         node scripts/knowledge-corpus.mjs --check  ← נכשל אם הקבצים לא מעודכנים (לפני push)

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(process.cwd());
const TARGETS = [
  join(ROOT, 'src/features/taxKnowledge/corpus/corpus.json'),
  join(ROOT, 'supabase/functions/knowledge-answer/corpus.json'),
];
const check = process.argv.includes('--check');

const tmp = mkdtempSync(join(tmpdir(), 'pivo-corpus-'));
try {
  const outfile = join(tmp, 'corpus.mjs');
  await build({
    entryPoints: [join(ROOT, 'src/features/taxKnowledge/corpus/buildCorpus.tsx')],
    bundle: true, outfile, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning', jsx: 'automatic',
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'corpus', DEV: false, PROD: false, MODE: 'corpus' }) },
  });
  const { buildCorpus } = await import(pathToFileURL(outfile).href);
  const rules = buildCorpus();
  const json = JSON.stringify(rules, null, 1) + '\n';
  let stale = 0;
  for (const t of TARGETS) {
    const cur = existsSync(t) ? readFileSync(t, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur === json) continue;
    if (check) { stale++; console.error(`לא מעודכן: ${t}`); } else writeFileSync(t, json, 'utf8');
  }
  const by = rules.reduce((a, r) => ((a[`${r.kind}/${r.status}`] = (a[`${r.kind}/${r.status}`] ?? 0) + 1), a), {});
  console.log(`${rules.length} כללים`, by);
  if (stale) { console.error('הריצו: node scripts/knowledge-corpus.mjs'); process.exit(1); }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
