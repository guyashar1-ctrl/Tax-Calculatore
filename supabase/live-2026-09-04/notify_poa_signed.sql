-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.notify_poa_signed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_before int;
  v_after  int;
  v_names  text;
begin
  select count(*) into v_before
    from jsonb_array_elements(coalesce(old.signers, '[]'::jsonb)) s
    where s->>'signStatus' = 'signed';
  select count(*) into v_after
    from jsonb_array_elements(coalesce(new.signers, '[]'::jsonb)) s
    where s->>'signStatus' = 'signed';

  if v_after > v_before then
    select string_agg(s->>'name', ', ') into v_names
      from jsonb_array_elements(coalesce(new.signers, '[]'::jsonb)) s
      where s->>'signStatus' = 'signed';

    insert into public.accountant_notifications (user_id, kind, request_id, client_id, payload)
    values (new.user_id, 'poa_signed', new.id, new.linked_client_id,
            jsonb_build_object(
              'clientName', new.client_name,
              'signedNames', coalesce(v_names, ''),
              'signedCount', v_after,
              'totalSigners', jsonb_array_length(coalesce(new.signers, '[]'::jsonb))));
  end if;
  return new;
end;
$function$

