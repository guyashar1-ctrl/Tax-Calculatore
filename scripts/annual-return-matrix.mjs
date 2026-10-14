// מריץ את scripts/annual-return-matrix.ts (esbuild, כמו בדיקות היחידה) ומדפיס את מטריצת הכיסוי ב-Markdown.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = mkdtempSync(join(tmpdir(), 'ar-matrix-'));
try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({ entryPoints: ['scripts/annual-return-matrix.ts'], bundle: true, outfile, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning',
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'matrix', DEV: false, PROD: false, MODE: 'test' }) } });
  await import(pathToFileURL(outfile).href);
} finally { rmSync(tmp, { recursive: true, force: true }); }
