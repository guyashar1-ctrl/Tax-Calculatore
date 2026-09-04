-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_engagement_id text, p_force boolean, p_reason text
CREATE OR REPLACE FUNCTION public.close_onboarding(p_engagement_id text, p_force boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e     public.engagements%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if v_uid is null or e.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  return public.close_onboarding_if_ready(p_engagement_id, 'accountant', p_force, p_reason);
end;
$function$

