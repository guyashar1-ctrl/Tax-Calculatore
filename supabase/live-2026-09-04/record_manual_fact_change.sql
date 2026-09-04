-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_field_key text, p_label text, p_old_value jsonb, p_new_value jsonb, p_note text
CREATE OR REPLACE FUNCTION public.record_manual_fact_change(p_client_id text, p_field_key text, p_label text, p_old_value jsonb, p_new_value jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id text;
  v_patch jsonb := p_new_value -> 'patch';
  k text;
  v_ok boolean;
  v_client jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id for update;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if v_patch is not null then
    for k in select jsonb_object_keys(v_patch) loop
      select f.out_ok into v_ok
        from public._tax_fact_field_op(p_client_id, k, true, v_patch -> k, 'manual') f;
      if not v_ok then
        raise exception 'unknown_field_key: %', k;
      end if;
    end loop;
  end if;

  insert into public.tax_fact_changes
    (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
  values
    (v_uid, p_client_id, p_field_key, p_label, p_old_value, p_new_value, 'manual', 'accepted', v_uid, now(), p_note)
  returning id into v_id;

  select to_jsonb(c) into v_client from public.clients c where c.id = p_client_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'client', v_client);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$

