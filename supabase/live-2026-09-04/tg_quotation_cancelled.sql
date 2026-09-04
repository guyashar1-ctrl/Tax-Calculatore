-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.tg_quotation_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' then
    update public.engagements
       set status = 'cancelled', updated_at = now()
     where quotation_id = new.id and status = 'scheduled';
    delete from public.additional_charges
     where source_quotation_id = new.id and source_type = 'quotation' and status = 'pending';
  end if;
  return new;
end;
$function$

