-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_name text, p_description text
CREATE OR REPLACE FUNCTION public.save_request_template(p_step_id text, p_name text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s       public.onboarding_steps%rowtype;
  v_uid   uuid := auth.uid();
  v_office uuid;
  v_id    text;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (v_uid, v_office, 'request', trim(p_name),
          nullif(trim(coalesce(p_description,'')), ''),
          jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'key', 'e1',
            'stepType', s.step_type,
            'owner', case when s.payload ? 'externalParty' then 'external'
                          when s.ball = 'client' then 'client' else 'me' end,
            'requiredForClose', coalesce(s.required_for_close, true),
            'payload', public.template_payload_from_step(
              coalesce(s.draft_payload, s.payload))))))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id);
end;
$function$

