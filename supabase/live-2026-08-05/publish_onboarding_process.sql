-- נמשך חי 2026-08-05 מ-uoweoqtuiettozagwgdw (pg_get_functiondef). נולד במיגרציה 52.
CREATE OR REPLACE FUNCTION public.publish_onboarding_process(p_engagement_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e     public.engagements%rowtype;
  v_uid uuid := auth.uid();
  v_open int;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if v_uid is null or e.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if e.process_published_at is not null then
    return jsonb_build_object('ok', true, 'alreadyPublished', true, 'publishedAt', e.process_published_at);
  end if;

  update public.engagements set process_published_at = now(), updated_at = now() where id = e.id;

  select count(*) into v_open from public.onboarding_steps
    where engagement_id = e.id and status not in ('completed','verified','skipped','cancelled');

  perform public.log_onboarding_event(e.user_id, null, e.id, 'status_changed', 'accountant',
    'התהליך נפתח ללקוח', jsonb_build_object('openSteps', v_open));

  return jsonb_build_object('ok', true, 'publishedAt', now(), 'openSteps', v_open);
end;
$function$
