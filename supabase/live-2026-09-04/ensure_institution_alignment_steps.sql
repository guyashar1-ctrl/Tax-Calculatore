-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_engagement_id text, p_include_opening_call boolean
CREATE OR REPLACE FUNCTION public.ensure_institution_alignment_steps(p_client_id text, p_engagement_id text DEFAULT NULL::text, p_include_opening_call boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_stage_id text;
  v_btl_id text;
  v_vat_id text;
  v_income_id text;
  v_call_id text;
  v_created int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select id into v_stage_id from public.journey_stages
   where client_id = p_client_id and title = 'יישור קו מול הרשויות' limit 1;
  if v_stage_id is null then
    insert into public.journey_stages (user_id, client_id, engagement_id, title, sort_order)
    values (v_uid, p_client_id, p_engagement_id, 'יישור קו מול הרשויות', 5)
    returning id into v_stage_id;
  end if;

  select id into v_btl_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_btl' and status <> 'cancelled' limit 1;
  if v_btl_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_uid, p_engagement_id, p_client_id, 'institution_alignment_btl', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'btl'))
    returning id into v_btl_id;
    v_created := v_created + 1;
  end if;

  select id into v_vat_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_vat' and status <> 'cancelled' limit 1;
  if v_vat_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_uid, p_engagement_id, p_client_id, 'institution_alignment_vat', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'vat'))
    returning id into v_vat_id;
    v_created := v_created + 1;
  end if;

  select id into v_income_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_income' and status <> 'cancelled' limit 1;
  if v_income_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_uid, p_engagement_id, p_client_id, 'institution_alignment_income', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'income'))
    returning id into v_income_id;
    v_created := v_created + 1;
  end if;

  if p_include_opening_call then
    select id into v_call_id from public.onboarding_steps
     where client_id = p_client_id and step_type = 'opening_call' and status <> 'cancelled' limit 1;
    if v_call_id is null then
      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball, required_for_close, payload)
      values
        (v_uid, p_engagement_id, p_client_id, 'opening_call', 'review', 'person', 'locked', 'me',
         false, jsonb_build_object('clarifications', '[]'::jsonb))
      returning id into v_call_id;
      v_created := v_created + 1;
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_call_id, v_btl_id, v_uid), (v_call_id, v_vat_id, v_uid), (v_call_id, v_income_id, v_uid)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'created', v_created, 'stageId', v_stage_id,
    'btlStepId', v_btl_id, 'vatStepId', v_vat_id, 'incomeStepId', v_income_id, 'openingCallStepId', v_call_id
  );
end;
$function$

