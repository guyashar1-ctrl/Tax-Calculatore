-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_signature text, p_signer_name text
CREATE OR REPLACE FUNCTION public.release_portal_sign(p_token text, p_signature text, p_signer_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  v_name text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if (s.payload->>'prevAccountantSignedAt') is not null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if nullif(trim(coalesce(p_signature,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_signature');
  end if;

  v_name := nullif(trim(coalesce(p_signer_name,'')), '');

  update public.onboarding_steps
     set payload = payload || jsonb_strip_nulls(jsonb_build_object(
                     'prevAccountantSignature', p_signature,
                     'prevAccountantSignedAt', to_jsonb(now()),
                     'prevAccountantSignerName', v_name)),
         -- חתימתו היא האישור לשחרור: השלב נסגר, ומה שתלוי בו נפתח.
         status = 'completed', ball = 'me', completion_method = 'system',
         completed_at = coalesce(completed_at, now()), needs_attention = false
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
    coalesce('רו״ח הקודם חתם על מכתב השחרור — ' || v_name, 'רו״ח הקודם חתם על מכתב השחרור'),
    jsonb_build_object('to', 'completed', 'actor', 'prev_accountant'));

  perform public.unlock_dependent_steps(s.id);

  return jsonb_build_object('ok', true);
end;
$function$

