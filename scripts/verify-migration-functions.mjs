#!/usr/bin/env node
/**
 * verify-migration-functions.mjs — כל גוף פונקציה בקובץ מיגרציה זהה לגוף שבמסד (רווחים מנורמלים). קריאה בלבד.
 *
 *   node scripts/verify-migration-functions.mjs supabase/209-....sql [--prod] [--ignore name1,name2]
 *
 * ‼ פונקציה שמיגרציה מאוחרת יותר הגדירה מחדש תופיע כ«שונה» — זה צפוי; --ignore מסמן אותן.
 */
import { readFileSync } from 'node:fs';
import { sql as q, readProd, STAGING_REF } from './staging-lib.mjs';

const file = process.argv[2];
const PROD = process.argv.includes('--prod');
const ignore = new Set((process.argv[process.argv.indexOf('--ignore') + 1] ?? '').split(',').filter(Boolean));
if (!file) { console.error('שימוש: node scripts/verify-migration-functions.mjs <file> [--prod]'); process.exit(2); }
const src = readFileSync(file, 'utf8');
const names = [...new Set([...src.matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)].map(m => m[1]))];
const query = `select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[${names.map(n => `'${n}'`).join(',')}])`;
const rows = PROD ? await readProd(query) : await q(STAGING_REF, query);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
let mismatch = 0, skipped = 0;
for (const name of names) {
  const start = [...src.matchAll(new RegExp('create or replace function public\\.' + name + '\\(', 'g'))].pop().index;
  const tag = src.slice(start).match(/\$[a-z_]*\$/)[0];
  const a = src.indexOf(tag, start);
  const b = src.indexOf(tag, a + tag.length);
  const body = src.slice(a + tag.length, b);
  const same = rows.filter(r => r.proname === name).some(r => norm(r.prosrc) === norm(body));
  if (same) continue;
  if (ignore.has(name)) { skipped++; continue; }
  mismatch++; console.log(`✗ ${name} — ${rows.some(r => r.proname === name) ? 'שונה' : 'לא קיימת'}`);
}
console.log(`${PROD ? 'פרודקשן' : 'staging'} · ${file.split('/').pop()}: ${names.length} פונקציות · זהות ${names.length - mismatch - skipped}${skipped ? ` · הוגדרו מחדש מאוחר יותר ${skipped}` : ''} · שונות ${mismatch}`);
process.exitCode = mismatch ? 1 : 0;
