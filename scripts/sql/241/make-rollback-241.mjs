// בונה את scripts/sql/241/rollback-241.sql מתוך 241 ו-236 — אותן מחרוזות בדיוק, בכיוון ההפוך.
//   node scripts/sql/241/make-rollback-241.mjs
// ‼ ההחזרה הופכת את ההזרקות על הגוף החי (לא מחליפה בגוף שמור) — כך היא נכונה גם בייצור (בלי 232) וגם ב-staging
//   (עם 232), ולא דורסת שינויים של מיגרציות אחרות. נבדק בבידוד: scripts/sql/241/test-241.pglite.mjs (סעיף 10).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const s241 = readFileSync(WT + 'supabase/241-collection-ux.sql', 'utf8').replace(/\r\n/g, '\n');
const s236 = readFileSync(WT + 'supabase/236-tax-file-intake.sql', 'utf8').replace(/\r\n/g, '\n');

const between = (src, a, b, from = 0) => {
  const i = src.indexOf(a, from); if (i < 0) throw new Error(`לא נמצא: ${a.slice(0, 60)}`);
  const j = src.indexOf(b, i + a.length); if (j < 0) throw new Error(`לא נמצא סוף: ${b.slice(0, 60)}`);
  return src.slice(i, j + b.length);
};
/** הצהרות המחרוזות של בלוק DO (בין declare ל-begin). */
const declare = (tag) => { const blk = between(s241, `do $${tag}$`, `$${tag}$;`); return blk.slice(blk.indexOf('declare\n') + 'declare\n'.length, blk.indexOf('\nbegin\n')); };
const items236 = between(s236, 'create or replace function public._tax_year_items()', '$$;');
const count = (n, msg) => `  if (length(v_def) - length(replace(v_def, ${n}, ''))) / length(${n}) <> 1 then raise exception '241↩: ${msg} — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;`;

const out = `-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-241 (סבב האיסוף) — נוצר ב-scripts/sql/241/make-rollback-241.mjs (לא לערוך ביד)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ הופך את ההזרקות על הגוף החי (בסדר הפוך), מוחק את ארבע הפונקציות החדשות ומחזיר את רשימת הפריטים של 236.
-- ‼ נתונים: שום תשובה לא נמחקת. עובדות מובנות שכבר נשמרו נשארות (המשרד רואה אותן כטקסט); שאלות מסוג רשומה שעוד
--   לא נענו — מבוטלות (הדף האישי הישן לא יודע להציג אותן); הצעות כתובת ממתינות — נדחות עם הערה (בלי 241 אין להן
--   ענף כתיבה). עמודת tax_evidence.parts נשארת (לא מזיקה; מחיקתה הייתה מוחקת עקיבות).
-- ‼ כרטיסים: מה שנכנס לכרטיס (ילדים, בנק, כתובת…) נכנס דרך tax_fact_changes, עם היסטוריה — ונשאר.

begin;

update public.tax_info_asks set state = 'cancelled'
 where state in ('draft', 'published') and prompt->'input'->>'kind' = 'record';
update public.tax_fact_changes set status = 'rejected', note = concat_ws(' · ', note, 'בוטל בהחזרת 241'), decided_at = now()
 where status = 'pending' and field_key in ('city', 'address', 'zipCode');

drop function if exists public.portal_note_tax_evidence_parts(text, uuid, jsonb);
drop function if exists public.update_tax_work(text, jsonb, text);
drop function if exists public.upsert_tax_work(text, text, int, date, jsonb);
drop function if exists public._tax_work_apply(jsonb, jsonb, text, text, text);

do $r6$
declare
${declare('p6')}
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';
  if position('241 · כתובת' in v_def) = 0 then raise notice '241↩: _tax_fact_field_op — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl);
  n1 := n1 || a1;
${count('n1', 'ענפי הכתובת')}
  execute replace(v_def, n1, a1);
end
$r6$;
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;

do $r3$
declare
${declare('p3')}
begin
  select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure) into v_def;
  if position('241 · מסמכים' in v_def) = 0 then raise notice '241↩: _portal_step_items — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  n1 := replace(n1, E'\\n', v_nl); n3 := replace(n3, E'\\n', v_nl); n3a := replace(n3a, E'\\n', v_nl);
${count('n1', 'הספירה')}
${count('n2', 'into')}
${count('n3a', 'פריט הפעולה')}
${count('n3', 'מסמכים / עזרה')}
  execute replace(replace(replace(replace(v_def, n3, a3), n3a, a3a), n2, a2), n1, a1);
end
$r3$;

do $r2$
declare
${declare('p2')}
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('241 · רשומה' in v_def) = 0 then raise notice '241↩: portal_submit_tax_info — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a2 := replace(a2, E'\\n', v_nl); n2 := replace(n2, E'\\n', v_nl); n4 := replace(n4, E'\\n', v_nl);
  n2 := n2 || a2;
${count('n1', 'סיבה')}
${count('n2', 'רשומה')}
${count('n3', 'רשימת הסוגים')}
${count('n4', 'ערך רשומה')}
${count('n5', 'client_assertion')}
  execute replace(replace(replace(replace(replace(v_def, n5, a5), n4, a4), n3, a3), n2, a2), n1, a1);
end
$r2$;

do $r1$
declare
${declare('p1')}
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('241 · רשומה' in v_def) = 0 then raise notice '241↩: add_tax_info_asks — אין מה להחזיר'; return; end if;
${count('n1', 'סוגי הקלט')}
  execute replace(v_def, n1, a1);
end
$r1$;

-- רשימת הפריטים של 236
${items236}
revoke all on function public._tax_year_items() from public, anon, authenticated;

commit;

-- לאמת: select proname from pg_proc where prosrc like '%241 ·%';  — צריך להחזיר אפס שורות
`;
writeFileSync(WT + 'scripts/sql/241/rollback-241.sql', out);
console.log('rollback-241.sql נכתב');
