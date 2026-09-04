-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.claim_auto_execution(p_step_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.onboarding_steps
     set payload = (payload - 'autoError') || jsonb_build_object('autoExecutedAt', now())
   where id = p_step_id
     and payload->>'autoExecutedAt' is null;
  return found;
end;
$function$

