-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.notify_onboarding_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(old.onboarding_status, '') <> 'submitted'
     and new.onboarding_status = 'submitted' then
    insert into public.accountant_notifications (user_id, kind, request_id, client_id, payload)
    values (new.user_id, 'onboarding_submitted', new.id, new.linked_client_id,
            jsonb_build_object('clientName', new.client_name));
  end if;
  return new;
end;
$function$

