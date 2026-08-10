-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_engagement_id text
CREATE OR REPLACE FUNCTION public.add_intake_questionnaire_step(p_engagement_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e public.engagements%rowtype;
  v_id text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select id into v_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'intake_questionnaire'
      and status <> 'cancelled' limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    required_for_close, payload)
  values (
    e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me',
    -- תזכורת אופציונלית בסוף הקליטה, לא תנאי לסגירתה.
    false,
    -- טיוטה: הלקוח אינו רואה אותה עד שהרו"ח פותח אותה במפורש.
    jsonb_build_object('published', false))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$

