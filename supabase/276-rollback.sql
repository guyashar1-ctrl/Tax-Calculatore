-- 276-rollback · מחזיר את הטריגר ואת ענף השאלון בדף למצב שלפני 276.
-- ‼ לא מחזיר את שני השאלונים שהוסרו (ליאת, אמיר) — זו הכרעה של גיא, לא תיקון טכני.
drop trigger if exists onboarding_steps_intake_published_waits on public.onboarding_steps;
drop function if exists public.tg_intake_published_waits_for_client();

do $rb$
declare
  v_def text := pg_get_functiondef('public._portal_step_items'::regproc);
  v_new constant text := $a$elsif s.status in ('pending', 'in_progress', 'waiting_client')
            and (c.intake_token is not null or s.published_at is null) then  -- 276 · טיוטה מוצגת בצפייה, בלי קישור$a$;
  v_old constant text := $a$elsif s.status = 'waiting_client' and c.intake_token is not null then$a$;
begin
  if position(v_new in v_def) = 0 then
    raise notice '276-rollback: not applied';
    return;
  end if;
  execute replace(v_def, v_new, v_old);
end
$rb$;
