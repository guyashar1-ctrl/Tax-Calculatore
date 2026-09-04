-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_engagement_id text, p_actor text, p_force boolean, p_reason text
CREATE OR REPLACE FUNCTION public.close_onboarding_if_ready(p_engagement_id text, p_actor text DEFAULT 'system'::text, p_force boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e     public.engagements%rowtype;
  v_rd  jsonb;
  v_client_name text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if e.status <> 'onboarding' then return jsonb_build_object('ok', true, 'noop', true); end if;

  v_rd := public.onboarding_close_readiness(p_engagement_id);
  if not (v_rd->>'ready')::boolean and not p_force then
    return jsonb_build_object('ok', false, 'error', 'not_ready', 'readiness', v_rd);
  end if;

  update public.engagements
     set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
   where id = e.id;

  perform public.log_onboarding_event(e.user_id, null, e.id, 'status_changed', p_actor,
    case when p_force then coalesce(nullif(trim(coalesce(p_reason,'')),''), 'נסגר למרות שנותרו פריטים פתוחים')
         when p_actor = 'system' then 'הקליטה נסגרה מעצמה - כל הפריטים הנדרשים הושלמו'
         else 'הקליטה נסגרה - הלקוח עבר לשוטף' end,
    jsonb_build_object('forced', p_force, 'auto', p_actor = 'system', 'readiness', v_rd));

  perform public.refresh_lifecycle_stage_for(e.client_id);

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client_name from public.clients where id = e.client_id;

  perform public.queue_accountant_notification(
    e.user_id, 'onboarding_closed', e.client_id, null, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'forced', p_force,
      'auto', p_actor = 'system',
      'reason', nullif(trim(coalesce(p_reason,'')), '')));

  return jsonb_build_object('ok', true, 'closed', true, 'forced', p_force,
                            'auto', p_actor = 'system', 'readiness', v_rd);
end;
$function$

