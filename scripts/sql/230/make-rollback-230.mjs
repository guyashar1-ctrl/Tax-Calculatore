// בונה את scripts/sql/230/rollback-230-staging.sql מתוך 229 ו-230 — כדי שההחזרה תשחזר בדיוק
// את מה ש-229 השאיר (אילוץ, אינדקס, _tax_year_items) ותהפוך את כל ההזרקות של 230 (בסדר הפוך).
//   node scripts/sql/230/make-rollback-230.mjs
// ‼ staging בלבד. נבדק בבידוד: scripts/sql/230/test-230-rollback.pglite.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const s229 = readFileSync(WT + 'supabase/229-tax-year-collection.sql', 'utf8').replace(/\r\n/g, '\n');
const s230 = readFileSync(WT + 'supabase/230-wealth-declaration-collection.sql', 'utf8').replace(/\r\n/g, '\n');

const between = (src, startMark, endMark, from = 0) => {
  const a = src.indexOf(startMark, from); if (a < 0) throw new Error(`לא נמצא: ${startMark.slice(0, 60)}`);
  const b = src.indexOf(endMark, a + startMark.length); if (b < 0) throw new Error(`לא נמצא סוף: ${endMark.slice(0, 60)}`);
  return src.slice(a, b + endMark.length);
};
const constraint229 = between(s229, 'alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;', ']));');
const index229 = between(s229, 'create unique index onboarding_steps_person_type_idx', ';');
const items229 = between(s229, 'create or replace function public._tax_year_items()', '$$;');

// כל בלוקי ה-DO של 230 (הזרקות), לפי הסדר: לכל זוג — הפונקציה שלו. ההחזרה בסדר הפוך.
const tail = s230.slice(s230.indexOf('do $p230$'));
const re = /pg_get_functiondef\('([^']+)'::regprocedure\)|v_a := (E'(?:[^']|'')*');\n\s*v_n := (E'(?:[^']|'')*');/g;
const pairs = [];
let fn = '';
for (const m of tail.matchAll(re)) { if (m[1]) fn = m[1]; else pairs.push([m[2], m[3], fn]); }
if (pairs.length !== 4) throw new Error(`ציפיתי ל-4 זוגות הזרקה, נמצאו ${pairs.length}`);
pairs.reverse();

const out = `-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-230 על staging בלבד — נוצר ב-scripts/sql/230/make-rollback-230.mjs (לא לערוך ביד)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ לא לייצור. מוחק הכנות להצהרת הון ואת פריטי ההון (נתוני בדיקה בלבד ב-staging), מחזיר את
--   האילוץ, האינדקס ו-_tax_year_items של 229, ומחזיר את הפונקציות שהוזרקו לגוף של 229.
-- ‼ לאמת אחרי: md5(prosrc) של add_tax_info_asks, portal_submit_tax_info ו-_tax_year_items שווה
--   למה שנמדד לפני ההחלה (stage2-execution-plan.md §13): 2bbbdca3…, 4c0a19d1…, f0f758b0….

begin;

delete from public.tax_info_asks where item_key like 'wealth.%';
delete from public.tax_year_facts where item_key like 'wealth.%';
delete from public.onboarding_steps where step_type = 'info_collection'
  and payload->>'parentStepId' in (select id from public.onboarding_steps where step_type = 'wealth_declaration');
delete from public.onboarding_steps where step_type = 'wealth_declaration';

drop function if exists public.ensure_wealth_declaration(text, date, text);
drop function if exists public.update_wealth_declaration(text, jsonb, text);
drop function if exists public._wealth_min_due(date, date);
drop trigger if exists onboarding_steps_wealth_omission_guard on public.onboarding_steps;
drop function if exists public._wealth_omission_guard();
drop index if exists public.onboarding_steps_wealth_open_idx;

${constraint229}

drop index if exists public.onboarding_steps_person_type_idx;
${index229}

${items229}

do $r230$
declare
  v_def text;
  v_a text; v_n text;
begin
${pairs.map(([a, n, f]) => `  v_def := pg_get_functiondef('${f}'::regprocedure);
  v_a := ${a};
  v_n := ${n};
  if position(v_n in v_def) > 0 then
    execute replace(v_def, v_n, v_a);
  end if;`).join('\n')}
end
$r230$;

commit;
`;
writeFileSync(WT + 'scripts/sql/230/rollback-230-staging.sql', out);
console.log(`rollback-230-staging.sql: ${pairs.length} החזרות הזרקה`);
