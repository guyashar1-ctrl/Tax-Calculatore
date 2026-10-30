-- חזרה מ-315: מסיר את filing.fatherName מ-_tax_year_items (שאלות קיימות שמצביעות עליו יידחו בשמירה — לבטל אותן קודם).
do $p$
declare v_cur jsonb := public._tax_year_items();
begin
  if not (v_cur ? 'filing.fatherName') then raise notice 'rollback-315: אין מה להחזיר'; return; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur - 'filing.fatherName')::text);
end
$p$;
