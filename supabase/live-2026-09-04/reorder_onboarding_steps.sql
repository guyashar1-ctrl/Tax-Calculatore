-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_ids text[]
CREATE OR REPLACE FUNCTION public.reorder_onboarding_steps(p_client_id text, p_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c     public.clients%rowtype;
  v_uid uuid := auth.uid();
  v_n   int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps s
     set sort_order = t.ord * 10
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) t
   where s.id = t.id and s.client_id = c.id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$function$

