#!/usr/bin/env node
/**
 * staging-test-flow-conditions.mjs — אותם מקרי תנאים (src/features/flows/__tests__/whenCases.ts)
 * מול flow_when_matches בשרת. ‼ «מה יקרה» במסך (TS) ומה שקורה בשרת (SQL) — אותה תשובה.
 * המיגרציות מוחלות ומתבטלות באותה בקשה.
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'pivo-when-'));
const entry = join(tmp, 'e.ts');
writeFileSync(entry, `export { WHEN_CASES } from ${JSON.stringify(resolve(ROOT, 'src/features/flows/__tests__/whenCases.ts').split('\\').join('/'))};`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: join(tmp, 'b.mjs'), logLevel: 'error' });
const { WHEN_CASES } = await import(pathToFileURL(join(tmp, 'b.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const MIG = ['supabase/214-client-notices.sql', 'supabase/215-flows.sql'].map(f => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
const TEST = `do $t$ declare out jsonb := '[]'::jsonb; begin
${WHEN_CASES.map((c, i) => `  out := out || jsonb_build_object('i', ${i}, 'r', public.flow_when_matches(${c.when === null ? 'null' : lit(c.when)}, ${lit(c.facts)}));`).join('\n')}
  raise exception 'RESULTS:%', out::text; end $t$;`;
const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: MIG + '\n' + TEST }),
});
const body = await r.text();
const m = body.match(/RESULTS:(\[.*?\])/s);
if (!m) { console.error('✋', body.slice(0, 1500)); process.exit(1); }
const res = JSON.parse(m[1].replace(/\\"/g, '"'));
let pass = 0, fail = 0;
for (const x of res) {
  const c = WHEN_CASES[x.i];
  if (x.r === c.expect) { pass++; console.log(`✓ ${c.name}`); } else { fail++; console.log(`✗ ${c.name} — שרת ${x.r}, מצופה ${c.expect}`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו · rolled back`);
process.exitCode = fail ? 1 : 0;
