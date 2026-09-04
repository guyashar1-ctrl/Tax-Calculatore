-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_reqs jsonb
CREATE OR REPLACE FUNCTION public.validate_requirements(p_reqs jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare x jsonb;
begin
  if p_reqs is null or jsonb_typeof(p_reqs) <> 'array' or jsonb_array_length(p_reqs) = 0 then
    return 'no_requirements';
  end if;
  for x in select * from jsonb_array_elements(p_reqs) loop
    if coalesce(x->>'kind','') not in
       ('confirm','text','email','phone','number','date','select','file','files') then
      return 'bad_requirement_kind';
    end if;
    if nullif(trim(coalesce(x->>'label','')), '') is null then
      return 'missing_requirement_label';
    end if;
    if x->>'kind' = 'select'
       and coalesce(jsonb_array_length(x->'options'), 0) < 2 then
      return 'select_needs_options';
    end if;
  end loop;
  return null;
end;
$function$

