-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_snapshot jsonb, p_step_type text
CREATE OR REPLACE FUNCTION public.journey_default_order(p_snapshot jsonb, p_step_type text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    (public.journey_default_entry(p_snapshot, p_step_type)->>'sortIndex')::integer,
    0);
$function$

