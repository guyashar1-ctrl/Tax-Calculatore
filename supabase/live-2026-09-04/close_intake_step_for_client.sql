-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.close_intake_step_for_client(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps
    where client_id = p_client_id and step_type = 'intake_questionnaire'
      and status not in ('completed','verified','skipped','cancelled') limit 1;
  if s.id is null then return jsonb_build_object('ok', true, 'noop', true); end if;

  update public.onboarding_steps
    set status = 'completed', completion_method = 'auto', ball = 'me',
        completed_at = coalesce(completed_at, now()), needs_attention = false, updated_at = now()
    where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    'הלקוח מילא את שאלון פתיחת התיק', jsonb_build_object('from', s.status, 'to', 'completed'));
  perform public.unlock_dependent_steps(s.id);

  return jsonb_build_object('ok', true, 'stepId', s.id);
end;
$function$

