-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.mint_portal_token(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  select portal_token into v_token from public.clients
    where id = p_client_id and user_id = v_uid;
  if v_token is not null then return v_token; end if;
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.clients set portal_token = v_token
    where id = p_client_id and portal_token is null;
  select portal_token into v_token from public.clients where id = p_client_id;
  return v_token;
end;
$function$

