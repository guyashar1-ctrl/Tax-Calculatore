-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.onboarding_dependency_met(p_step_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.onboarding_steps%rowtype;
  v_unmet int;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return false; end if;

  select count(*) into v_unmet
    from (
      select d.depends_on_step_id as dep_id
        from public.onboarding_step_dependencies d
       where d.step_id = p_step_id
      union
      select s.depends_on_step_id where s.depends_on_step_id is not null
    ) parents
    join public.onboarding_steps dep on dep.id = parents.dep_id
   where not (
     dep.status in ('completed','verified')
     or (dep.status = 'skipped'
         and coalesce(dep.payload->>'skipReason','')
             in ('already_connected','transferred_rep','not_applicable_history','not_applicable'))
   );

  return v_unmet = 0;
end;
$function$

