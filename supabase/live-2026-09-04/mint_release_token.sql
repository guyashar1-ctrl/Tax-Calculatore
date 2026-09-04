-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.mint_release_token(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
  v_tok text;
  v_mat public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.step_type <> 'release_letter' then return jsonb_build_object('ok', false, 'error', 'wrong_step_type'); end if;

  v_tok := nullif(s.payload->>'releaseToken', '');
  if v_tok is null then
    v_tok := replace(gen_random_uuid()::text, '-', '');
    update public.onboarding_steps
       set payload = payload || jsonb_build_object('releaseToken', v_tok)
     where id = s.id;
  end if;

  -- המכתב יוצא עכשיו, ולכן ההמתנה לחומרים מתחילה עכשיו. עד היום שלב החומרים
  -- נשאר נעול עד לסגירת שלב המכתב, ואז לא היה לאן להעלות.
  select * into v_mat from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
  if v_mat.id is not null and v_mat.status = 'locked' then
    update public.onboarding_steps
       set status = 'waiting_client', ball = 'prev_accountant'
     where id = v_mat.id;
    perform public.log_onboarding_event(s.user_id, v_mat.id, s.engagement_id, 'status_changed', 'system',
      'המכתב נשלח - ההמתנה לחומרים נפתחה', jsonb_build_object('from','locked','to','waiting_client'));
  end if;

  return jsonb_build_object('ok', true, 'token', v_tok);
end;
$function$

