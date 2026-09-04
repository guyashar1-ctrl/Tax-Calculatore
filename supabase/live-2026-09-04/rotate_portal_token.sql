-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.rotate_portal_token(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.clients
     set portal_token = v_token,
         portal_token_expires_at = null,
         portal_token_last_used_at = null
   where id = p_client_id and user_id = v_uid;
  return v_token;
end;
$function$

