-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user_id uuid
CREATE OR REPLACE FUNCTION public.ensure_prev_accountant_removed_label(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id text;
begin
  select id into v_id from public.document_labels
   where user_id = p_user_id and name = 'הוסר מרשימת הרו״ח הקודם' limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.document_labels (user_id, name)
  values (p_user_id, 'הוסר מרשימת הרו״ח הקודם') on conflict do nothing;
  select id into v_id from public.document_labels
   where user_id = p_user_id and name = 'הוסר מרשימת הרו״ח הקודם' limit 1;
  return v_id;
end;
$function$

