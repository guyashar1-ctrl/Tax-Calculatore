-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_payload jsonb, p_due_date date, p_apply_due boolean
CREATE OR REPLACE FUNCTION public.update_onboarding_request(p_step_id text, p_payload jsonb, p_due_date date DEFAULT NULL::date, p_apply_due boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
  v_err text;
  v_content jsonb;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status in ('completed','verified','cancelled','skipped') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;
  if s.step_type not in ('custom_request','client_documents') then
    return jsonb_build_object('ok', false, 'error', 'not_editable');
  end if;

  v_content := coalesce(p_payload, '{}'::jsonb)
    - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject' - 'releaseSentAt'
    - 'objectionDueDate' - 'submitted' - 'submittedByClient'
    - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
    - 'authUrl' - 'providerRef';

  if s.step_type = 'custom_request' and s.ball = 'client' then
    v_err := public.validate_requirements(v_content->'requirements');
    if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  elsif v_content ? 'requirements'
        and coalesce(jsonb_array_length(v_content->'requirements'), 0) > 0 then
    v_err := public.validate_requirements(v_content->'requirements');
    if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  end if;

  if s.published_at is null then
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, v_content),
           due_date = case when p_apply_due then p_due_date else due_date end
     where id = s.id;
  else
    update public.onboarding_steps
       set draft_payload = v_content,
           due_date = case when p_apply_due then p_due_date else due_date end
     where id = s.id;
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when s.published_at is null then 'הבקשה נערכה (טיוטה)' else 'הבקשה נערכה - ממתין לפרסום' end,
    jsonb_build_object('pendingEdit', s.published_at is not null));

  return jsonb_build_object('ok', true, 'pendingEdit', s.published_at is not null);
end;
$function$

