// בונה את מפת כיסוי האיסוף מהקטלוג (esbuild כמו בדיקות היחידה) וכותב ל-docs/tax-foundation/collection-coverage-matrix.md
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-matrix-'));
try {
  const out = join(tmp, 'm.mjs');
  await build({ entryPoints: ['scripts/collection-coverage-matrix.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, loader: { '.json': 'json' }, logLevel: 'error' });
  const md = execFileSync(process.execPath, [out], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync('docs/tax-foundation/collection-coverage-matrix.md', md);
  console.log(`נכתב: docs/tax-foundation/collection-coverage-matrix.md (${md.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| פריט')).length} שורות)`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
