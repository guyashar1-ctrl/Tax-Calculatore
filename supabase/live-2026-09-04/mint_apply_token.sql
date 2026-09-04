-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_rotate boolean
CREATE OR REPLACE FUNCTION public.mint_apply_token(p_rotate boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then return null; end if;
  if not p_rotate then
    select apply_token into v_token from public.profiles where id = v_uid;
    if v_token is not null then return v_token; end if;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.profiles set apply_token = v_token where id = v_uid;
  return v_token;
end; $function$

