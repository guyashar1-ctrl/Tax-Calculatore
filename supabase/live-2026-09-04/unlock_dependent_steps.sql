-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.unlock_dependent_steps(p_step_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.onboarding_steps%rowtype;
  n int := 0;
begin
  for r in
    select distinct st.* from public.onboarding_steps st
    where st.status = 'locked'
      and (st.depends_on_step_id = p_step_id
           or exists (select 1 from public.onboarding_step_dependencies d
                      where d.step_id = st.id and d.depends_on_step_id = p_step_id))
  loop
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח - התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      perform public.execute_automatic_step(r.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$

