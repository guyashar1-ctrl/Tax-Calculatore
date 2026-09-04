-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.reopen_institution_alignment(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  s public.onboarding_steps%rowtype;
  v_history jsonb;
  v_snapshot jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.step_type not in ('institution_alignment_btl','institution_alignment_vat','institution_alignment_income') then
    return jsonb_build_object('ok', false, 'error', 'not_an_institution_step');
  end if;

  v_snapshot := jsonb_build_object(
    'checkedAt', s.payload->'checkedAt',
    'collected', coalesce(s.payload->'collected', '{}'::jsonb),
    'exceptions', coalesce(s.payload->'exceptions', '{}'::jsonb)
  );
  v_history := coalesce(s.payload->'history', '[]'::jsonb) || jsonb_build_array(v_snapshot);

  return public.advance_onboarding_step(p_step_id, 'reopen', jsonb_build_object('history', v_history));
end;
$function$

