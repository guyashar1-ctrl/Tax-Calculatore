// אימות קריאה-בלבד של 233 + 258 בייצור מול הקבצים: גופי הפונקציות זהים, anon חסום, RLS וטריגר, עמודות, אין כתיבה ישירה.
//   node scripts/sql/233/verify-prod.mjs
// ‼ קריאה בלבד (readProd של staging-lib) — אין כאן כתיבה לייצור.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProd as sql } from '../../staging-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8').replace(/\r\n/g, '\n');
const f233 = read('../../../supabase/233-annual-returns.sql'), f258 = read('../../../supabase/258-return-source-lines.sql');
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
    console.log(`  ${same && permsOk ? '✓' : '✗'} ${f} · גוף ${same ? 'זהה לקובץ' : 'שונה!'} · anon ${r.anon ? 'כן!' : 'לא'} · authenticated ${r.auth ? 'כן' : 'לא'}`);
    if (!same || !permsOk) bad++;
  }
}
const [t] = await sql(`select to_regclass('public.annual_returns') is not null tbl, (select relrowsecurity from pg_class where relname = 'annual_returns') rls,
  exists(select 1 from pg_trigger where tgname = 'annual_returns_immutable') trg,
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'tax_year_facts' and column_name in ('line_key','entered_by')) cols,
  exists(select 1 from pg_indexes where indexname = 'tax_year_facts_evidence_idx') idx,
  (select count(*)::int from pg_policy where polrelid = 'public.annual_returns'::regclass) pols,
  has_table_privilege('authenticated', 'public.annual_returns', 'insert') ins, has_table_privilege('authenticated', 'public.annual_returns', 'update') upd, has_table_privilege('authenticated', 'public.annual_returns', 'select') sel,
  has_table_privilege('anon', 'public.annual_returns', 'select') anonsel,
  (select count(*)::int from public.annual_returns) rows_ar,
  (select array_agg(name order by version desc) from (select name, version from supabase_migrations.schema_migrations order by version desc limit 3) m) last3`);
console.log(`  ${t.tbl && t.rls && t.trg && t.pols === 1 && !t.ins && !t.upd && t.sel && !t.anonsel ? '✓' : '✗'} annual_returns · טבלה ${t.tbl ? 'קיימת' : 'חסרה!'} · RLS ${t.rls ? 'פעיל' : 'כבוי!'} · טריגר ${t.trg ? 'קיים' : 'חסר!'} · מדיניות ${t.pols} · מחובר: קריאה ${t.sel ? 'כן' : 'לא!'}, כתיבה ישירה ${t.ins || t.upd ? 'כן!' : 'לא'} · anon קריאה ${t.anonsel ? 'כן!' : 'לא'} · שורות ${t.rows_ar}`);
console.log(`  ${t.cols === 2 && t.idx ? '✓' : '✗'} tax_year_facts · עמודות ${t.cols}/2 · אינדקס ${t.idx ? 'קיים' : 'חסר!'}`);
console.log(`  · 3 המיגרציות האחרונות שנרשמו: ${(t.last3 ?? []).join(' · ')}`);
if (!(t.tbl && t.rls && t.trg && t.pols === 1 && !t.ins && !t.upd && t.sel && !t.anonsel && t.cols === 2 && t.idx)) bad++;
process.exit(bad ? 1 : 0);
