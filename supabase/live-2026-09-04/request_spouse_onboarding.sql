-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_spouse_email text
CREATE OR REPLACE FUNCTION public.request_spouse_onboarding(p_token text, p_spouse_email text DEFAULT NULL::text)
 RETURNS TABLE(spouse_token text, spouse_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.representation_requests;
  v_tok text;
begin
  select * into v_req from public.representation_requests
    where onboarding_token = p_token limit 1;
  if not found then
    return;
  end if;
  if v_req.onboarding_status = 'submitted'
     and coalesce(v_req.identification->>'spouseFillRequestedAt', '') = '' then
    return;
  end if;

  v_tok := coalesce(
    nullif(v_req.spouse_onboarding_token, ''),
    replace(gen_random_uuid()::text, '-', ''));

  update public.representation_requests
    set spouse_onboarding_token = v_tok,
        identification = coalesce(identification, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'spouseFillRequestedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'spouseEmail', nullif(trim(coalesce(p_spouse_email, '')), '')
        )),
        updated_at = now()
    where id = v_req.id;

  return query select v_tok, coalesce(
    nullif(trim(coalesce(v_req.identification->>'spouseFirstName','') || ' ' ||
                coalesce(v_req.identification->>'spouseLastName','')), ''),
    nullif(trim(coalesce(v_req.identification->>'spouseName','')), ''),
    '');
end;
$function$

