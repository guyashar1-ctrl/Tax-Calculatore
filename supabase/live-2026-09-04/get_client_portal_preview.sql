-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_mode text
CREATE OR REPLACE FUNCTION public.get_client_portal_preview(p_client_id text, p_mode text DEFAULT 'preview'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.clients%rowtype;
  v_uid uuid := auth.uid();
begin
  if p_mode not in ('live', 'preview') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return public.build_client_portal(c.id, p_mode);
end;
$function$

