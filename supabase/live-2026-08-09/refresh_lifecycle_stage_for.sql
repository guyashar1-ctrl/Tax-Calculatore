-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.refresh_lifecycle_stage_for(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_stage text;
begin
  if p_client_id is null then return null; end if;
  v_stage := public.derive_lifecycle_stage(p_client_id);
  if v_stage is null then return null; end if;
  update public.clients set lifecycle_stage = v_stage
    where id = p_client_id and lifecycle_stage is distinct from v_stage;
  return v_stage;
end;
$function$

