-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.trg_sync_paperless_tax_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.dealer_type, '') in ('licensed','company')
     or coalesce(new.vat_status, '') = 'authorizedDealer' then
    if tg_op = 'INSERT'
       or coalesce(old.dealer_type, '') is distinct from coalesce(new.dealer_type, '')
       or coalesce(old.vat_status, '') is distinct from coalesce(new.vat_status, '') then
      perform public.sync_paperless_tax_authority_step(new.id);
    end if;
  end if;
  return new;
end;
$function$

