-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_id_number text, p_birth_date text, p_secondary_type text, p_secondary_value text
CREATE OR REPLACE FUNCTION public.submit_spouse_onboarding(p_token text, p_id_number text, p_birth_date text, p_secondary_type text, p_secondary_value text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.representation_requests;
begin
  select * into v_req from public.representation_requests
    where spouse_onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;
  if coalesce(v_req.identification->>'spouseFillSubmittedAt', '') <> '' then
    return true;
  end if;

  update public.representation_requests
    set identification = coalesce(identification, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'spouseIdNumber',       nullif(trim(coalesce(p_id_number, '')), ''),
          'spouseBirthDate',      nullif(trim(coalesce(p_birth_date, '')), ''),
          'spouseSecondaryType',  nullif(trim(coalesce(p_secondary_type, '')), ''),
          'spouseSecondaryValue', nullif(trim(coalesce(p_secondary_value, '')), ''),
          'spouseFillSubmittedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )),
        updated_at = now()
    where id = v_req.id;

  if v_req.linked_client_id is not null then
    update public.clients
      set spouse_id_number  = coalesce(nullif(trim(coalesce(p_id_number, '')), ''), spouse_id_number),
          spouse_birth_year = coalesce(
            (substring(coalesce(p_birth_date, '') from '^\d{4}'))::integer, spouse_birth_year),
          updated_at = now()
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$

