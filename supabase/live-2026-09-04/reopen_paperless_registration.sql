-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text
CREATE OR REPLACE FUNCTION public.reopen_paperless_registration(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s         public.onboarding_steps%rowtype;
  v_uid     uuid := auth.uid();
  v_relocked int := 0;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if s.step_type <> 'paperless_invite' then
    return jsonb_build_object('ok', false, 'error', 'wrong_step_type');
  end if;
  if s.status not in ('completed', 'verified', 'skipped') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.onboarding_steps
     set status = 'waiting_client', ball = 'client',
         completed_at = null, completed_by = null, verified_at = null,
         completion_method = 'manual', needs_attention = false,
         payload = (payload - 'submittedByClient' - 'clientConfirmedAt' - 'skipReason')
                   || jsonb_build_object('reopenedAt', to_jsonb(now()))
   where id = s.id;

  update public.onboarding_steps d
     set status = 'locked'
   where d.client_id = s.client_id
     and d.id <> s.id
     and d.status in ('pending', 'waiting_client', 'in_progress')
     and d.completed_at is null
     and (d.depends_on_step_id = s.id
          or exists (select 1 from public.onboarding_step_dependencies x
                      where x.step_id = d.id and x.depends_on_step_id = s.id));
  get diagnostics v_relocked = row_count;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
    'אישור ההרשמה בוטל - השלב הוחזר ללקוח',
    jsonb_build_object('from', s.status, 'to', 'waiting_client', 'relocked', v_relocked));

  return jsonb_build_object('ok', true, 'relocked', v_relocked);
end;
$function$

