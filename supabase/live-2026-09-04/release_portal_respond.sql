-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_note text, p_name text
CREATE OR REPLACE FUNCTION public.release_portal_respond(p_token text, p_note text, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  v_note text;
  v_name text;
  v_prev text;
  v_client_name text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is null then return jsonb_build_object('ok', false, 'error', 'missing_note'); end if;
  v_note := left(v_note, 4000);
  v_name := left(nullif(trim(coalesce(p_name, '')), ''), 200);

  v_prev := nullif(s.payload->>'prevAccountantResponseNote', '');
  if v_prev is not null then
    v_note := v_prev || E'\n\n- - -\n' || v_note;
  end if;

  update public.onboarding_steps
     set payload = (payload || jsonb_strip_nulls(jsonb_build_object(
                     'prevAccountantResponseNote', v_note,
                     'prevAccountantRespondedAt', to_jsonb(now()),
                     'prevAccountantResponderName', v_name)))
                   - 'responseHandledAt',
         ball = 'me',
         needs_attention = true
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
    coalesce('הרו״ח הקודם השיב - ' || v_name, 'הרו״ח הקודם השיב'),
    jsonb_build_object('actor', 'prev_accountant', 'note', v_note));

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client_name from public.clients where id = s.client_id;

  perform public.queue_accountant_notification(
    s.user_id, 'release_letter_objection', s.client_id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'responderName', v_name,
      'note', left(v_note, 800),
      'prevAccountantName', s.payload->>'prevAccountantName'));

  return jsonb_build_object('ok', true);
end;
$function$

