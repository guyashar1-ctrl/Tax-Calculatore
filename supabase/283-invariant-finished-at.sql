-- 283 · הבדיקה היומית (282): «המשך תקוע» נמדד ממועד סיום הקודמת (finished_at), לא מ-updated_at
-- (22.10.2026). ‼ updated_at מתעדכן בכל שינוי (טריגר set_updated_at), ולכן משימה שנגעו בה אחרי
-- שהסתיימה הייתה נראית «טרייה» — והבדיקה לא הייתה מוצאת «המשך» שבאמת נתקע. נמצא בבדיקת staging.
do $$
declare v_def text := pg_get_functiondef('public.pivo_invariant_violations()'::regprocedure);
begin
  if position('coalesce(j.finished_at, j.updated_at) < now()' in v_def) > 0 then return; end if;
  if position('and j.updated_at < now() - interval ''10 minutes''' in v_def) = 0 then
    raise exception '283: anchor not found';
  end if;
  execute replace(v_def, 'and j.updated_at < now() - interval ''10 minutes''',
                         'and coalesce(j.finished_at, j.updated_at) < now() - interval ''10 minutes''');
end;
$$;
