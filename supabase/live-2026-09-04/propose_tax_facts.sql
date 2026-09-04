-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_source text, p_source_ref text, p_items jsonb
CREATE OR REPLACE FUNCTION public.propose_tax_facts(p_client_id text, p_source text, p_source_ref text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  it jsonb;
  v_count int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_source not in ('questionnaire', 'institution_alignment', 'import', 'automation') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if coalesce(it->>'field_key', '') = '' then continue; end if;

    insert into public.tax_fact_changes
      (user_id, client_id, field_key, label, old_value, new_value, source, source_ref, note)
    values
      (v_uid, p_client_id, it->>'field_key', coalesce(it->>'label', it->>'field_key'),
       it->'old_value', it->'new_value', p_source, p_source_ref, it->>'note')
    on conflict (client_id, field_key) where status = 'pending'
    do update set
      new_value  = excluded.new_value,
      old_value  = excluded.old_value,
      label      = excluded.label,
      source     = excluded.source,
      source_ref = excluded.source_ref,
      note       = excluded.note,
      created_at = now();

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'proposed', v_count);
end;
$function$

