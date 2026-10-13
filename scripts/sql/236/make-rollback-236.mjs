// בונה את scripts/sql/236/rollback-236.sql מתוך 230 ו-236 — כדי שההחזרה תשחזר בדיוק את מה ש-230 השאיר
// (אילוץ, אינדקס, _tax_year_items) ותהפוך את ההזרקות של 236 (בסדר הפוך).
//   node scripts/sql/236/make-rollback-236.mjs
// ‼ מוחק את בקשות הקליטה ואת התשובות שלהן. בייצור — רק לפני שלקוחות ענו; אחרי זה רק להסתיר (ראו מסמך השחרור).
// נבדק בבידוד: scripts/sql/236/test-236-rollback.pglite.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const s230 = readFileSync(WT + 'supabase/230-wealth-declaration-collection.sql', 'utf8').replace(/\r\n/g, '\n');
const s236 = readFileSync(WT + 'supabase/236-tax-file-intake.sql', 'utf8').replace(/\r\n/g, '\n');

const between = (src, startMark, endMark, from = 0) => {
  const a = src.indexOf(startMark, from); if (a < 0) throw new Error(`לא נמצא: ${startMark.slice(0, 60)}`);
  const b = src.indexOf(endMark, a + startMark.length); if (b < 0) throw new Error(`לא נמצא סוף: ${endMark.slice(0, 60)}`);
  return src.slice(a, b + endMark.length);
};
const constraint230 = between(s230, 'alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;', ']));');
const index230 = between(s230, 'create unique index onboarding_steps_person_type_idx', ';');
const items230 = between(s230, 'create or replace function public._tax_year_items()', '$$;');

const tail = s236.slice(s236.indexOf('do $p236$'));
const re = /pg_get_functiondef\('([^']+)'::regprocedure\)|v_a := (E'(?:[^']|'')*');\n\s*v_n := (E'(?:[^']|'')*');/g;
const pairs = [];
let fn = '';
for (const m of tail.matchAll(re)) { if (m[1]) fn = m[1]; else pairs.push([m[2], m[3], fn]); }
if (pairs.length !== 8) throw new Error(`ציפיתי ל-8 זוגות הזרקה, נמצאו ${pairs.length}`);
pairs.reverse();

const out = `-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-236 (קליטה והשלמת תיק המס) — נוצר ב-scripts/sql/236/make-rollback-236.mjs (לא לערוך ביד)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ מוחק את בקשות הקליטה, השאלות, התשובות והראיות שלהן (הקבצים עצמם נשארים בתיקיית המסמכים של הלקוח).
--   בייצור — רק לפני שלקוחות ענו; אחרי זה: להסתיר במסך (ראו מסמך השחרור), לא למחוק.
-- ‼ מחזיר את האילוץ, האינדקס ו-_tax_year_items של 230, ואת שש הפונקציות שהוזרקו (בסדר הפוך).
-- ‼ שאלון ישן שהמשרד החליף בקליטה נשאר מבוטל (זו החלטת המשרד); התשובות שלו לא נמחקות.
-- ‼ כרטיסי לקוחות לא משתנים: מה שנכנס לכרטיס מקליטה נכנס דרך tax_fact_changes, עם היסטוריה — ונשאר.

begin;

delete from public.tax_evidence where ask_id in (select id from public.tax_info_asks where item_key like 'intake.%');
delete from public.tax_year_facts where item_key like 'intake.%';
delete from public.tax_info_asks where item_key like 'intake.%';
delete from public.onboarding_steps where step_type = 'info_collection'
  and payload->>'parentStepId' in (select id from public.onboarding_steps where step_type = 'tax_file_intake');
delete from public.onboarding_steps where step_type = 'tax_file_intake';

drop function if exists public.ensure_tax_file_intake(text);
drop function if exists public.replace_legacy_intake(text);
drop function if exists public.intake_replaced_state(text);
drop function if exists public._legacy_intake_replaced(text);
drop index if exists public.onboarding_steps_tax_file_intake_open_idx;

${constraint230}

drop index if exists public.onboarding_steps_person_type_idx;
${index230}

${items230}

do $r236$
declare
  v_def text;
  v_a text; v_n text;
begin
${pairs.map(([a, n, f]) => `  if to_regprocedure('${f}') is not null then
    v_def := pg_get_functiondef('${f}'::regprocedure);
    v_a := ${a};
    v_n := ${n};
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;`).join('\n')}
end
$r236$;

commit;
`;
writeFileSync(WT + 'scripts/sql/236/rollback-236.sql', out);
console.log(`rollback-236.sql: ${pairs.length} החזרות הזרקה`);
