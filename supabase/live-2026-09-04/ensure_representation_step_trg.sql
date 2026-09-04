-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.ensure_representation_step_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.linked_client_id is not null then
    perform public.ensure_representation_step(new.linked_client_id);
  end if;
  return new;
end;
$function$

