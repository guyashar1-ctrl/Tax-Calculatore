-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.notify_quotation_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(old.status, '') <> 'approved' and new.status = 'approved' then
    insert into public.accountant_notifications (user_id, kind, quotation_id, client_id, payload)
    values (new.user_id, 'quotation_approved', new.id, new.client_id,
            jsonb_build_object(
              'quotationNumber', new.quotation_number,
              'signerName', new.approval_signer_name,
              'recipientName', new.snapshot->>'recipientName'));
  end if;
  return new;
end;
$function$

