-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.discard_case_changes(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  v_order  int := 0;
  v_cancel int := 0;
  v_draft  int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps
     set pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_order = row_count;

  update public.onboarding_steps
     set pending_cancel = false
   where client_id = c.id and pending_cancel = true;
  get diagnostics v_cancel = row_count;

  update public.onboarding_steps
     set draft_payload = null
   where client_id = c.id and draft_payload is not null and published_at is not null;
  get diagnostics v_draft = row_count;

  if v_order + v_cancel + v_draft > 0 then
    perform public.log_onboarding_event(c.user_id, null, null, 'note', 'accountant',
      'שינויים שלא פורסמו בוטלו',
      jsonb_build_object('orderReverted', v_order, 'cancelReverted', v_cancel, 'editsReverted', v_draft));
  end if;

  return jsonb_build_object('ok', true,
    'orderReverted', v_order, 'cancelReverted', v_cancel, 'editsReverted', v_draft);
end;
$function$

