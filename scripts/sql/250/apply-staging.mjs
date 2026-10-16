// מחיל את 250 מהקובץ עצמו ומאמת: טבלאות + RLS, כל הפונקציות זהות לקובץ, הרשאות (anon חסום, פנימיות — גם לא למחובר), דלי פרטי.
//   node scripts/sql/250/apply-staging.mjs [--verify-only] [--rollback]
// ‼ staging בלבד (scripts/staging-lib.mjs עוצר כל כתיבה לייצור). ייצור — רק בשחרור מאושר, בכלי השחרור.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStaging as sql } from '../../staging-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = readFileSync(join(here, '../../../supabase/250-shaam-filing-obligations.sql'), 'utf8').replace(/\r\n/g, '\n');
if (process.argv.includes('--rollback')) {
  await sql(readFileSync(join(here, 'rollback-250.sql'), 'utf8').replace(/\r\n/g, '\n'));
  console.log('rollback הוחל');
  process.exit(0);
}
if (!process.argv.includes('--verify-only')) { await sql(file); console.log('הוחל ב-staging'); }

const fns = [...file.matchAll(/create or replace function public\.([a-z0-9_]+)\(/g)].map(m => m[1]);
const rows = await sql(`select p.proname, p.prosrc, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any(array[${fns.map(f => `'${f}'`).join(',')}])`);
const INTERNAL_NO_AUTH = ['_shaam_match', '_shaam_plan', '_shaam_plan_names', '_shaam_after_change'];
let bad = 0;
for (const f of fns) {
  const r = rows.find(x => x.proname === f);
  if (!r) { console.log(`  ✗ ${f} חסרה`); bad++; continue; }
  const at = file.indexOf(`function public.${f}(`); const s = file.indexOf('$$', at) + 2; const e = file.indexOf('$$', s);
  const same = r.prosrc.trim() === file.slice(s, e).trim();
  const permsOk = !r.anon && (INTERNAL_NO_AUTH.includes(f) ? !r.auth : true);
  console.log(`  ${same && permsOk ? '✓' : '✗'} ${f} · גוף ${same ? 'זהה לקובץ' : 'שונה!'} · anon ${r.anon ? 'כן!' : 'לא'} · authenticated ${r.auth ? 'כן' : 'לא'}`);
  if (!same || !permsOk) bad++;
}
const [t] = await sql(`select
  (select relrowsecurity from pg_class where oid = 'public.shaam_filing_obligations'::regclass) rls1,
  (select relrowsecurity from pg_class where oid = 'public.shaam_filing_sources'::regclass) rls2,
  has_table_privilege('anon', 'public.shaam_filing_obligations', 'select') anon_sel,
  has_table_privilege('authenticated', 'public.shaam_filing_obligations', 'insert') auth_ins,
  (select public from storage.buckets where id = 'office-imports') bucket_public,
  (select count(*)::int from pg_policies where schemaname = 'storage' and policyname like 'office_imports_%') bucket_policies`);
const tOk = t.rls1 && t.rls2 && !t.anon_sel && !t.auth_ins && t.bucket_public === false && t.bucket_policies === 2;
console.log(`  ${tOk ? '✓' : '✗'} טבלאות: RLS ${t.rls1 && t.rls2 ? 'פעיל' : 'כבוי!'} · anon ${t.anon_sel ? 'קורא!' : 'חסום'} · כתיבה ישירה ${t.auth_ins ? 'פתוחה!' : 'חסומה'} · דלי office-imports ${t.bucket_public === false ? 'פרטי' : String(t.bucket_public)} (${t.bucket_policies} מדיניות)`);
if (!tOk) bad++;
console.log(bad ? `${bad} בעיות` : `כל ${fns.length} הפונקציות זהות לקובץ; הרשאות תקינות`);
process.exit(bad ? 1 : 0);
