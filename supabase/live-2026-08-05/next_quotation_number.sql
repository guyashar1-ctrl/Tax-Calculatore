-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user uuid
CREATE OR REPLACE FUNCTION public.next_quotation_number(p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_year    int := extract(year from now())::int;
  v_counter int;
begin
  insert into public.quotation_counters (user_id, year, counter)
  values (p_user, v_year, 1)
  on conflict (user_id, year)
  do update set counter = public.quotation_counters.counter + 1
  returning counter into v_counter;

  return v_year::text || '-' || lpad(v_counter::text, 3, '0');
end;
$function$

