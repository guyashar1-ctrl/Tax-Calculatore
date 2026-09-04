-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_snapshot jsonb, p_step_type text, p_fallback boolean
CREATE OR REPLACE FUNCTION public.journey_default_required(p_snapshot jsonb, p_step_type text, p_fallback boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    (public.journey_default_entry(p_snapshot, p_step_type)->>'requiredForClose')::boolean,
    p_fallback);
$function$

