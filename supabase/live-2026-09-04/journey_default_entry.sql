-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_snapshot jsonb, p_step_type text
CREATE OR REPLACE FUNCTION public.journey_default_entry(p_snapshot jsonb, p_step_type text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select e
    from jsonb_array_elements(coalesce(p_snapshot, '[]'::jsonb)) e
   where e->>'stepType' = p_step_type
   limit 1;
$function$

