-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user_id uuid, p_client_id text
CREATE OR REPLACE FUNCTION public.ensure_prev_accountant_folder(p_user_id uuid, p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
begin
  select id into v_id from public.document_folders
   where client_id = p_client_id and parent_id is null and name = 'חומרים מרו״ח קודם'
   limit 1;
  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid()::text;
  insert into public.document_folders (id, user_id, client_id, parent_id, name)
  values (v_id, p_user_id, p_client_id, null, 'חומרים מרו״ח קודם')
  on conflict do nothing;

  select id into v_id from public.document_folders
   where client_id = p_client_id and parent_id is null and name = 'חומרים מרו״ח קודם'
   limit 1;
  return v_id;
end;
$function$

