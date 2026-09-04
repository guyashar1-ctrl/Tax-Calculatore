-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_template_id text, p_step_id text
CREATE OR REPLACE FUNCTION public.update_request_template(p_template_id text, p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.onboarding_steps%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  v_entry  jsonb;
  v_id     text;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  select * into t from public.journey_templates where id = p_template_id;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;
  if t.office_id is not null and t.office_id <> v_office then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'key', 'e1',
    'stepType', s.step_type,
    'owner', case when s.payload ? 'externalParty' then 'external'
                  when s.ball = 'client' then 'client' else 'me' end,
    'requiredForClose', coalesce(s.required_for_close, true),
    'payload', public.template_payload_from_step(coalesce(s.draft_payload, s.payload))));

  if t.office_id is null then
    -- מובנית: נשארת כפי שהיא, והמשרד מקבל עותק משלו שגובר עליה בתצוגה.
    insert into public.journey_templates (user_id, office_id, kind, name, description, entries, seed_key)
    values (v_uid, v_office, 'request', t.name, t.description, jsonb_build_array(v_entry), t.seed_key)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', true);
  end if;

  update public.journey_templates
     set entries = jsonb_build_array(v_entry), updated_at = now()
   where id = t.id;

  return jsonb_build_object('ok', true, 'templateId', t.id);
end;
$function$

