-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_snapshot jsonb, p_step_type text, p_facts jsonb
CREATE OR REPLACE FUNCTION public.journey_default_variant(p_snapshot jsonb, p_step_type text, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_entry jsonb := public.journey_default_entry(p_snapshot, p_step_type);
  v       jsonb;
  v_fact  text;
begin
  if v_entry is null or jsonb_typeof(v_entry->'variants') <> 'array' then return null; end if;

  for v in select value from jsonb_array_elements(v_entry->'variants') loop
    v_fact := nullif(v->>'fact', '');
    if v_fact is null then return v; end if;                 -- הנופל־אחורה
    if coalesce((p_facts->>v_fact)::boolean, false) then return v; end if;
  end loop;
  return null;
end;
$function$

