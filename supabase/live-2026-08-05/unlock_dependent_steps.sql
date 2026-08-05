-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
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
  for r in select * from public.onboarding_steps
           where depends_on_step_id = p_step_id and status = 'locked'
  loop
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח — התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$

