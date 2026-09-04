-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.sync_step_dependency_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.depends_on_step_id is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (new.id, new.depends_on_step_id, new.user_id)
      on conflict do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.depends_on_step_id is distinct from new.depends_on_step_id then
    if old.depends_on_step_id is not null then
      delete from public.onboarding_step_dependencies
       where step_id = new.id and depends_on_step_id = old.depends_on_step_id;
    end if;
    if new.depends_on_step_id is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (new.id, new.depends_on_step_id, new.user_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$function$

