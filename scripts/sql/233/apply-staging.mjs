// מחיל את 233 (גרסאות הדוח השנתי) ו-258 (שורות מקור) מהקבצים עצמם ומאמת: הטבלה + RLS + טריגר, שתי העמודות, כל הפונקציות
// זהות לקובץ, anon חסום, מחובר מורשה לציבוריות בלבד.
//   node scripts/sql/233/apply-staging.mjs [--verify-only] [--rollback]
// ‼ staging בלבד (scripts/staging-lib.mjs עוצר כל כתיבה לייצור). ייצור — רק בשחרור מאושר, בכלי השחרור (prod-apply-migration).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStaging as sql } from '../../staging-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const f233 = read('../../../supabase/233-annual-returns.sql');
const f258 = read('../../../supabase/258-return-source-lines.sql');
if (process.argv.includes('--rollback')) {
  await sql(read('../258/rollback-258.sql')); await sql(read('rollback-233.sql'));
  console.log('rollback הוחל (258 ואז 233)');
  process.exit(0);
}
if (!process.argv.includes('--verify-only')) { await sql(f233); console.log('233 הוחלה ב-staging'); await sql(f258); console.log('258 הוחלה ב-staging'); }

const fnsOf = (file) => [...file.matchAll(/create or replace function public\.([a-z0-9_]+)\(/g)].map(m => m[1]);
const bodyOf = (file, f) => { const at = file.indexOf(`function public.${f}(`); const s = file.indexOf('$$', at) + 2; const e = file.indexOf('$$', s); return file.slice(s, e).trim(); };
const INTERNAL = ['_annual_return_immutable'];
let bad = 0;
for (const [file, fns] of [[f233, fnsOf(f233)], [f258, fnsOf(f258)]]) {
  const rows = await sql(`select p.proname, p.prosrc, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any(array[${fns.map(f => `'${f}'`).join(',')}])`);
  for (const f of fns) {
    const r = rows.find(x => x.proname === f);
    if (!r) { console.log(`  ✗ ${f} חסרה`); bad++; continue; }
    const same = r.prosrc.trim() === bodyOf(file, f);
    const permsOk = !r.anon && (INTERNAL.includes(f) ? !r.auth : r.auth) && (INTERNAL.includes(f) || r.prosecdef);
    console.log(`  ${same && permsOk ? '✓' : '✗'} ${f} · גוף ${same ? 'זהה לקובץ' : 'שונה!'} · anon ${r.anon ? 'כן!' : 'לא'} · authenticated ${r.auth ? 'כן' : 'לא'}${INTERNAL.includes(f) ? ' (פנימית)' : ''}`);
    if (!same || !permsOk) bad++;
  }
}
const [t] = await sql(`select to_regclass('public.annual_returns') is not null tbl, (select relrowsecurity from pg_class where relname = 'annual_returns') rls,
  exists(select 1 from pg_trigger where tgname = 'annual_returns_immutable') trg,
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'tax_year_facts' and column_name in ('line_key','entered_by')) cols,
  exists(select 1 from pg_indexes where indexname = 'tax_year_facts_evidence_idx') idx,
  (select count(*)::int from pg_policy where polrelid = 'public.annual_returns'::regclass) pols`);
console.log(`  ${t.tbl && t.rls && t.trg && t.pols === 1 ? '✓' : '✗'} annual_returns · טבלה ${t.tbl ? 'קיימת' : 'חסרה!'} · RLS ${t.rls ? 'פעיל' : 'כבוי!'} · טריגר נעילה ${t.trg ? 'קיים' : 'חסר!'} · מדיניות קריאה ${t.pols}`);
console.log(`  ${t.cols === 2 && t.idx ? '✓' : '✗'} tax_year_facts · עמודות line_key/entered_by ${t.cols}/2 · אינדקס לפי מסמך ${t.idx ? 'קיים' : 'חסר!'}`);
if (!(t.tbl && t.rls && t.trg && t.pols === 1 && t.cols === 2 && t.idx)) bad++;
// הגנה: כתיבה ישירה לטבלה — רק דרך הפונקציות (authenticated בלי insert/update)
const [g] = await sql(`select has_table_privilege('authenticated', 'public.annual_returns', 'insert') ins, has_table_privilege('authenticated', 'public.annual_returns', 'update') upd, has_table_privilege('authenticated', 'public.annual_returns', 'select') sel`);
console.log(`  ${!g.ins && !g.upd && g.sel ? '✓' : '✗'} annual_returns · מחובר: קריאה ${g.sel ? 'כן' : 'לא!'} · כתיבה ישירה ${g.ins || g.upd ? 'כן!' : 'לא'}`);
if (g.ins || g.upd || !g.sel) bad++;
process.exit(bad ? 1 : 0);
