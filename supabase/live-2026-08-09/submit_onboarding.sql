-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_id_number text, p_birth_date text, p_secondary_type text, p_secondary_value text
CREATE OR REPLACE FUNCTION public.submit_onboarding(p_token text, p_id_number text, p_birth_date text, p_secondary_type text, p_secondary_value text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req public.representation_requests;
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;

  update public.representation_requests
    set identification = jsonb_build_object(
          'idNumber', p_id_number,
          'birthDate', p_birth_date,
          'secondaryType', p_secondary_type,
          'secondaryValue', p_secondary_value
        ),
        onboarding_status = 'submitted',
        onboarding_submitted_at = now(),
        status = 'awaiting_accountant'
    where id = v_req.id;

  if v_req.linked_client_id is not null then
    update public.clients
      set id_number = coalesce(nullif(p_id_number, ''), id_number),
          birth_date = coalesce(nullif(p_birth_date, '')::date, birth_date),
          representation_status = 'awaiting_accountant'
      where id = v_req.linked_client_id;
  end if;

  return true;
end;
$function$

