-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.assign_quotation_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.quotation_number is null or new.quotation_number = '' then
    new.quotation_number := public.next_quotation_number(new.user_id);
  end if;
  return new;
end;
$function$

