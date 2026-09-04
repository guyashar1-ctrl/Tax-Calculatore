-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.client_intake_state(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eng   text;
  v_stage text;
begin
  v_eng := public.open_intake_engagement_id(p_client_id);
  if v_eng is not null then
    return jsonb_build_object('state', 'open', 'engagementId', v_eng);
  end if;
  v_stage := public.derive_lifecycle_stage(p_client_id);
  if v_stage in ('lead', 'quoted') then
    return jsonb_build_object('state', 'pending', 'engagementId', null);
  end if;
  return jsonb_build_object('state', 'none', 'engagementId', null);
end;
$function$

