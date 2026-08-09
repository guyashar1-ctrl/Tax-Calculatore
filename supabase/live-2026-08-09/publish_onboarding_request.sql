-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.publish_onboarding_request(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if coalesce(s.payload->>'published','true') <> 'false' then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.onboarding_steps
     set payload = payload - 'published'
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
    'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));

  return jsonb_build_object('ok', true);
end;
$function$

