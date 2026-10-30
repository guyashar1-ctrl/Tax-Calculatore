-- 315 · שם האב בשאלון השנתי (30.10.2026, גיא: «כן — תעביר את שם האב לשאלון, כולל השינוי הקטן במסד (עם גיבוי ובדיקה)»)
--   _tax_year_items: פריט חדש אחד —
--     filing.fatherName — שם האב לטופס 1301 (חלק ב׳), לכל אדם; רשומה { items: [{ name }] } (records.ts › fatherName)
--   ‼ בלי הרישום השרת דוחה את השאלה (add_tax_info_asks) — ולכן המיגרציה לפני הקוד.
--   ‼ נבנה מהרשימה שבמסד (לא מהעתק): הרשימה הקיימת + החדש; פריט קיים לא משתנה. החלה חוזרת — בלי שינוי.
-- חזרה: scripts/sql/315/rollback-315.sql
do $p$
declare
  v_cur jsonb := public._tax_year_items();
  v_add jsonb := '{"filing.fatherName":"detail"}'::jsonb;
begin
  if v_cur @> v_add then raise notice '315: _tax_year_items — כבר הוחל'; return; end if;
  if exists (select 1 from jsonb_each_text(v_add) a where v_cur ? a.key and v_cur->>a.key <> a.value) then raise exception '315: פריט קיים בסוג אחר'; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur || v_add)::text);
end
$p$;

-- בדיקה:
--   select public._tax_year_items() ? 'filing.fatherName';  -- true
