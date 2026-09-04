-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_change_id text
CREATE OR REPLACE FUNCTION public.accept_tax_fact_change(p_change_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
  v_patch jsonb;
  v_old_patch jsonb;
  k text;
  v_current jsonb;
  v_ok boolean;
  v_stale text[] := '{}';
  v_client jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select * into r from public.tax_fact_changes
   where id = p_change_id and user_id = v_uid and status = 'pending'
   for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  perform 1 from public.clients where id = r.client_id and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;

  v_patch     := r.new_value -> 'patch';
  v_old_patch := r.old_value -> 'patch';

  if v_old_patch is not null then
    for k in select jsonb_object_keys(v_old_patch) loop
      select f.out_current, f.out_ok into v_current, v_ok
        from public._tax_fact_field_op(r.client_id, k, false, null, null) f;
      if v_ok and coalesce(v_current, 'null'::jsonb)
                  is distinct from coalesce(v_old_patch -> k, 'null'::jsonb) then
        v_stale := array_append(v_stale, k);
      end if;
    end loop;
  end if;

  if array_length(v_stale, 1) > 0 then
    return jsonb_build_object('ok', false, 'error', 'stale_conflict', 'staleFields', to_jsonb(v_stale));
  end if;

  if v_patch is not null then
    for k in select jsonb_object_keys(v_patch) loop
      select f.out_ok into v_ok
        from public._tax_fact_field_op(r.client_id, k, true, v_patch -> k, r.source) f;
      if not v_ok then
        raise exception 'unknown_field_key: %', k;
      end if;
    end loop;
  end if;

  update public.tax_fact_changes
     set status = 'accepted', decided_by = v_uid, decided_at = now()
   where id = p_change_id;

  select * into r from public.tax_fact_changes where id = p_change_id;
  select to_jsonb(c) into v_client from public.clients c where c.id = r.client_id;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r), 'client', v_client);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$

