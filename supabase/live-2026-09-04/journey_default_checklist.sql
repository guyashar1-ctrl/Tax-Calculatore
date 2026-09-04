-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_variant jsonb
CREATE OR REPLACE FUNCTION public.journey_default_checklist(p_variant jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_variant is null or jsonb_typeof(p_variant->'items') <> 'array' then null
    else (select coalesce(jsonb_agg(jsonb_build_object(
                   'key',   coalesce(nullif(it->>'key',''), 'i' || ord),
                   'label', it->>'label',
                   'done',  false) order by ord), '[]'::jsonb)
            from jsonb_array_elements(p_variant->'items') with ordinality t(it, ord))
  end;
$function$

