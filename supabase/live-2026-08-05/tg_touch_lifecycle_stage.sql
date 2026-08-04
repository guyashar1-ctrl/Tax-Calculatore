-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.tg_touch_lifecycle_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_table_name = 'quotations' then
    perform public.refresh_lifecycle_stage_for(new.client_id);
    if tg_op = 'UPDATE' and old.client_id is distinct from new.client_id then
      perform public.refresh_lifecycle_stage_for(old.client_id);
    end if;
    if new.lead_id is not null then
      perform public.refresh_lifecycle_stage_for(l.converted_client_id)
        from public.leads l
        where l.id = new.lead_id and l.converted_client_id is not null;
    end if;
  elsif tg_table_name = 'engagements' then
    perform public.refresh_lifecycle_stage_for(new.client_id);
  end if;
  return null;
end;
$function$

