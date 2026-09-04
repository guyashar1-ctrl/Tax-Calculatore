-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.release_requests_held_until_approval(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c         public.clients%rowtype;
  v_eng     text;
  s         record;
  v_pub     int := 0;
  v_adopted int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  v_eng := public.current_engagement_id(p_client_id);

  if v_eng is not null then
    update public.onboarding_steps
       set engagement_id = v_eng
     where client_id = p_client_id
       and engagement_id is null
       and status <> 'cancelled';
    get diagnostics v_adopted = row_count;
  end if;

  for s in
    select * from public.onboarding_steps
     where client_id = p_client_id
       and status <> 'cancelled'
       and published_at is null
       and coalesce((payload->>'heldUntilApproval')::boolean, false)
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published' - 'heldUntilApproval'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, coalesce(s.engagement_id, v_eng),
      'status_changed', 'system',
      'הבקשה נפתחה ללקוח עם אישור ההצעה',
      jsonb_build_object('published', true, 'heldUntilApproval', true));
    v_pub := v_pub + 1;
  end loop;

  return jsonb_build_object('ok', true, 'published', v_pub, 'adopted', v_adopted);
end;
$function$

