-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.refresh_lifecycle_stages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_changed int := 0;
begin
  update public.clients c
    set lifecycle_stage = d.stage
    from (select c2.id, public.derive_lifecycle_stage(c2.id) as stage from public.clients c2) d
    where d.id = c.id and d.stage is not null and c.lifecycle_stage is distinct from d.stage;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('ok', true, 'updated', v_changed);
end;
$function$

