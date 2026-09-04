-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_error text
CREATE OR REPLACE FUNCTION public.release_auto_execution(p_step_id text, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.onboarding_steps
     set payload = (payload - 'autoExecutedAt')
                   || case when p_error is null then '{}'::jsonb
                           else jsonb_build_object('autoError', left(p_error, 300)) end
   where id = p_step_id;
end;
$function$

