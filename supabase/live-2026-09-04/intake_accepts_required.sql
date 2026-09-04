-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.intake_accepts_required(p_client_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (public.client_intake_state(p_client_id)->>'state') in ('open', 'pending');
$function$

