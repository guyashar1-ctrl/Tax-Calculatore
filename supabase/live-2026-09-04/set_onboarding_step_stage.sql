-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_stage_id text
CREATE OR REPLACE FUNCTION public.set_onboarding_step_stage(p_step_id text, p_stage_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s  public.onboarding_steps%rowtype;
  st public.journey_stages%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_stage_id is not null then
    select * into st from public.journey_stages where id = p_stage_id;
    if st.id is null or st.client_id <> s.client_id then
      return jsonb_build_object('ok', false, 'error', 'stage_not_found');
    end if;
  end if;

  update public.onboarding_steps set stage_id = p_stage_id where id = s.id;
  return jsonb_build_object('ok', true);
end;
$function$

