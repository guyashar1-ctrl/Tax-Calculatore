-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.onboarding_dependency_met(p_step_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.onboarding_steps%rowtype;
  d public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return false; end if;
  if s.depends_on_step_id is null then return true; end if;
  select * into d from public.onboarding_steps where id = s.depends_on_step_id;
  if d.id is null then return true; end if;
  if d.status in ('completed','verified') then return true; end if;
  if d.status = 'skipped' then
    return coalesce(d.payload->>'skipReason', '')
           in ('already_connected','transferred_rep','not_applicable_history','not_applicable');
  end if;
  return false;
end;
$function$

