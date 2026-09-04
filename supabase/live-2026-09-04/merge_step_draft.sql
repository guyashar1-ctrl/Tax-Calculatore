-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_live jsonb, p_draft jsonb
CREATE OR REPLACE FUNCTION public.merge_step_draft(p_live jsonb, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_out  jsonb;
  v_list jsonb;
begin
  if p_draft is null then return p_live; end if;

  v_out := coalesce(p_live, '{}'::jsonb) || (p_draft - 'checklist' - 'requirements');

  if p_draft ? 'checklist' then
    select coalesce(jsonb_agg(
             d.x || coalesce((
               select jsonb_strip_nulls(jsonb_build_object(
                        'done',       l.x->'done',
                        'documentId', l.x->'documentId',
                        'doneAt',     l.x->'doneAt'))
                 from jsonb_array_elements(coalesce(p_live->'checklist', '[]'::jsonb)) l(x)
                where l.x->>'key' = d.x->>'key'
                limit 1), '{}'::jsonb)
             order by d.ord), '[]'::jsonb)
      into v_list
      from jsonb_array_elements(p_draft->'checklist') with ordinality d(x, ord);
    v_out := v_out || jsonb_build_object('checklist', v_list);
  end if;

  if p_draft ? 'requirements' then
    select coalesce(jsonb_agg(
             d.x || coalesce((
               select jsonb_strip_nulls(jsonb_build_object(
                        'done',       l.x->'done',
                        'value',      l.x->'value',
                        'documentId', l.x->'documentId',
                        'doneAt',     l.x->'doneAt'))
                 from jsonb_array_elements(coalesce(p_live->'requirements', '[]'::jsonb)) l(x)
                where l.x->>'key' = d.x->>'key'
                limit 1), '{}'::jsonb)
             order by d.ord), '[]'::jsonb)
      into v_list
      from jsonb_array_elements(p_draft->'requirements') with ordinality d(x, ord);
    v_out := v_out || jsonb_build_object('requirements', v_list);
  end if;

  return v_out;
end;
$function$

