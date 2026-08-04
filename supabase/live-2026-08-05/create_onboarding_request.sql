-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_step_type text, p_payload jsonb, p_due_date date, p_depends_on text, p_published boolean
CREATE OR REPLACE FUNCTION public.create_onboarding_request(p_client_id text, p_step_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_due_date date DEFAULT NULL::date, p_depends_on text DEFAULT NULL::text, p_published boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_eng  text;
  v_id   text;
  v_ball text;
  v_next int;
  v_dep  public.onboarding_steps%rowtype;
  v_status text := 'pending';
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- רשימה סגורה. שלב הייצוג לא נוצר ידנית — הוא מסונכרן מבקשת הייצוג.
  if p_step_type not in ('client_documents','prev_accountant_details','custom_request',
                         'paperless_invite','paperless_connection','retainer_authorization',
                         'release_letter','materials_received','file_opening',
                         'intake_questionnaire','kyc_identification','internal_setup') then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;

  -- בקשה חופשית בלי דרישות אינה בקשה — אין ללקוח מה לעשות בה.
  if p_step_type = 'custom_request'
     and coalesce(jsonb_array_length(p_payload->'requirements'), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_requirements');
  end if;

  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  end if;

  v_ball := case when p_step_type in ('client_documents','prev_accountant_details','custom_request')
                 then 'client' else 'me' end;

  if p_depends_on is not null then
    select * into v_dep from public.onboarding_steps where id = p_depends_on and client_id = c.id;
    if v_dep.id is null then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;
    -- תלות שכבר הושלמה אינה נועלת — אחרת השלב נולד נעול לנצח.
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
     depends_on_step_id, due_date, sort_order, payload)
  values
    (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
     v_status, v_ball, p_depends_on, p_due_date, v_next,
     coalesce(p_payload, '{}'::jsonb)
       || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end)
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה' else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status);
end;
$function$

