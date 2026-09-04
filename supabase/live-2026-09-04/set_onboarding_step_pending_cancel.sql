-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_pending boolean
CREATE OR REPLACE FUNCTION public.set_onboarding_step_pending_cancel(p_step_id text, p_pending boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status in ('completed', 'verified', 'skipped', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;

  update public.onboarding_steps set pending_cancel = p_pending where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when p_pending then 'הבקשה תוסר בעדכון הבא' else 'ההסרה בוטלה' end,
    jsonb_build_object('pendingCancel', p_pending));

  return jsonb_build_object('ok', true, 'pendingCancel', p_pending);
end;
$function$

