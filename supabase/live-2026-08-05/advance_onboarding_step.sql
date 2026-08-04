-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_action text, p_payload jsonb
CREATE OR REPLACE FUNCTION public.advance_onboarding_step(p_step_id text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s          public.onboarding_steps%rowtype;
  v_new      text;
  v_ball     text;
  v_note     text;
  v_reason   text;
  v_uid      uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_note   := nullif(trim(coalesce(p_payload->>'note', '')), '');
  v_ball   := s.ball;

  if s.status = 'locked' and p_action not in ('cancel','note','block','set_due') then
    if not public.onboarding_dependency_met(s.id) then
      return jsonb_build_object('ok', false, 'error', 'locked',
        'message', case when s.step_type = 'retainer_authorization'
                        then 'הרשאת התשלום נוצרת בתוך חשבון הפייפרלס של הלקוח — יש לאשר קודם את החיבור לפייפרלס.'
                        else 'השלב נעול עד להשלמת השלב שהוא תלוי בו.' end);
    end if;
  end if;

  case p_action
    when 'start'        then v_new := 'in_progress';
    when 'wait_client'  then v_new := 'waiting_client'; v_ball := 'client';
    when 'complete'     then v_new := 'completed';
    when 'verify'       then v_new := 'verified';
    when 'skip'         then v_new := 'skipped';
    when 'block'        then v_new := 'blocked';
    when 'fail'         then v_new := 'failed';
    when 'reopen'       then v_new := 'pending';
    when 'cancel'       then v_new := 'cancelled';
    when 'record_link'  then v_new := case when s.status in ('locked','pending') then 'in_progress' else s.status end;
    when 'email_sent'   then v_new := 'waiting_client'; v_ball := 'client';
    when 'set_due'      then v_new := s.status;
    when 'note'         then v_new := s.status;
    else return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  if p_action = 'skip' and s.step_type in ('paperless_invite','paperless_connection') then
    if coalesce(v_reason, '') not in ('already_connected','transferred_rep','not_applicable') then
      if exists (select 1 from public.onboarding_steps r
                 where r.client_id = s.client_id and r.step_type = 'retainer_authorization'
                   and r.status not in ('completed','verified','cancelled','skipped')
                   and coalesce(r.payload->>'method','') <> 'manual_arrangement') then
        return jsonb_build_object('ok', false, 'error', 'paperless_required',
          'message', 'קיימת הרשאת תשלום שממתינה — אי אפשר לדלג על הפייפרלס אלא אם הלקוח כבר מחובר.');
      end if;
    end if;
  end if;

  update public.onboarding_steps
    set status  = v_new,
        ball    = coalesce(nullif(p_payload->>'ball',''), v_ball),
        payload = payload || coalesce(p_payload - 'note' - 'ball', '{}'::jsonb)
                  || case when v_reason is not null then jsonb_build_object('skipReason', v_reason) else '{}'::jsonb end,
        due_date = coalesce((nullif(p_payload->>'dueDate',''))::date, due_date),
        needs_attention = case when v_new in ('completed','verified','skipped','cancelled') then false else needs_attention end,
        completion_method = coalesce(nullif(p_payload->>'completionMethod',''), completion_method),
        completed_by = case when v_new in ('completed','verified') then v_uid else completed_by end,
        completed_at = case when v_new = 'completed' and completed_at is null then now() else completed_at end,
        verified_at  = case when v_new = 'verified'  and verified_at  is null then now() else verified_at end
    where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
    case when v_new = s.status then 'note' else 'status_changed' end,
    'accountant', coalesce(v_note, v_reason),
    jsonb_build_object('from', s.status, 'to', v_new, 'action', p_action));

  if v_new in ('completed','verified','skipped') then
    perform public.unlock_dependent_steps(s.id);
  end if;

  if s.engagement_id is not null then
    update public.engagements e
      set status = 'active', activated_at = coalesce(activated_at, now())
      where e.id = s.engagement_id and e.status = 'onboarding'
        and not exists (
          select 1 from public.onboarding_steps x
          where x.engagement_id = e.id
            and x.status not in ('completed','verified','skipped','cancelled')
            and x.step_type not in ('representation_upgrade','first_month_review'));
  end if;

  return jsonb_build_object('ok', true, 'stepId', s.id, 'from', s.status, 'to', v_new);
end;
$function$

