-- ═══════════════════════════════════════════════════════════════════════════
--  47 · שאלון פתיחת תיק כשלב קליטה
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ השאלון היה קיים כבר (קישור ?intake= + מנוע השאלות של הדוח השנתי), אבל
--  הוא חי מחוץ למסלול: הרו"ח היה צריך לזכור לשלוח אותו, ולזכור לבדוק אם מולא.
--  עכשיו הוא שלב — נוצר לכל לקוח חדש, מופיע במפה, ונסגר מעצמו כשהלקוח מסיים.
--
--  ‼ track='internal' ולא 'tools': העיתוי הוא החלטה של הרו"ח. לקוח שמקבל
--  שאלון באותו יום שבו חתם על ההצעה מרגיש שנפל עליו טופס. השליחה ידנית תמיד.
--
--  ‼ scope='person': השאלון ממפה אדם, לא עסקה. התקשרות שנייה לא תבקש אותו שוב.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation','file_opening','representation_upgrade','release_letter',
    'materials_received','paperless_invite','paperless_connection','data_import',
    'data_verification','retainer_authorization','internal_setup','kyc_identification',
    'first_month_review','intake_questionnaire']));

create or replace function public.add_intake_questionnaire_step(p_engagement_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_id text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select id into v_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'intake_questionnaire'
      and status <> 'cancelled' limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball)
  values (e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$;

grant execute on function public.add_intake_questionnaire_step(text) to authenticated;

-- ‼ סגירה אוטומטית: הרו"ח לא צריך לשאול "האם הוא כבר מילא" ולא לסמן ידנית
-- מה שהמערכת יודעת ברגע שזה קורה.
create or replace function public.close_intake_step_for_client(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare s public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps
    where client_id = p_client_id and step_type = 'intake_questionnaire'
      and status not in ('completed','verified','skipped','cancelled') limit 1;
  if s.id is null then return jsonb_build_object('ok', true, 'noop', true); end if;

  update public.onboarding_steps
    set status = 'completed', completion_method = 'auto', ball = 'me',
        completed_at = coalesce(completed_at, now()), needs_attention = false, updated_at = now()
    where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    'הלקוח מילא את שאלון פתיחת התיק', jsonb_build_object('from', s.status, 'to', 'completed'));
  perform public.unlock_dependent_steps(s.id);

  return jsonb_build_object('ok', true, 'stepId', s.id);
end;
$function$;

grant execute on function public.close_intake_step_for_client(text) to authenticated, anon;

-- ‼ save_intake_answer: תוספת אחת בלבד — קריאה לסגירה כשהשאלון מסתיים.
-- שאר הפונקציה זהה לנוסח שרץ לפני השינוי (נשלף מ-pg_get_functiondef).
create or replace function public.save_intake_answer(p_token text, p_session_id uuid, p_question_id text, p_answer jsonb, p_model jsonb, p_current_question_id text, p_done boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  s public.annual_report_sessions%rowtype;
  existing_id uuid;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return false; end if;

  select * into s from public.annual_report_sessions ars
    where ars.id = p_session_id limit 1;
  if s.id is null
     or s.client_id is distinct from t.client_id
     or s.user_id is distinct from t.user_id then
    return false;
  end if;

  select a.id into existing_id from public.annual_report_answers a
    where a.session_id = p_session_id and a.question_id = p_question_id
      and a.superseded_by is null
    limit 1;
  if existing_id is not null then
    update public.annual_report_answers
      set answer_value = p_answer, answered_at = now()
      where id = existing_id;
  else
    insert into public.annual_report_answers (session_id, question_id, answer_value)
    values (p_session_id, p_question_id, p_answer);
  end if;

  update public.annual_report_sessions
    set model = p_model,
        current_question_id = p_current_question_id,
        status = case when p_done then 'review' else 'in_progress' end,
        completed_at = case when p_done then now() else null end
    where id = p_session_id;

  if p_done then
    perform public.close_intake_step_for_client(t.client_id);
  end if;

  return true;
end;
$function$;

-- ‼ create_engagement_for_quotation: תוספת אחת — יצירת שלב השאלון אחרי
-- הרכבת המסלול. הוא אינו חלק מ-generate_onboarding_steps כדי שהמרכיב יישאר
-- נגזרת טהורה של ההצעה; השאלון הוא נספח לאדם, לא למה שנמכר.
create or replace function public.create_engagement_for_quotation(p_quotation_id text, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q         public.quotations%rowtype;
  v_items   jsonb;
  v_monthly numeric;
  v_start   text;
  v_eng_id  text;
  v_existing text;
  v_steps   jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'quotation_not_found'); end if;
  if q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if q.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;

  if not p_dry_run then perform public.copy_lead_facts_to_client(q.id); end if;

  select id into v_existing from public.engagements where quotation_id = q.id;
  if v_existing is not null then
    v_steps := public.generate_onboarding_steps(v_existing, p_dry_run);
    if not p_dry_run then perform public.add_intake_questionnaire_step(v_existing); end if;
    return jsonb_build_object('ok', true, 'engagementId', v_existing, 'existed', true, 'steps', v_steps);
  end if;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  select
    sum( (coalesce((it->>'clientPrice')::numeric, 0))
       * (coalesce((it->>'quantity')::numeric, 1))
       * (1 - coalesce((it->>'discountPercent')::numeric, 0) / 100.0) ),
    min(nullif(it->>'billingStartMonth', ''))
  into v_monthly, v_start
  from jsonb_array_elements(v_items) it
  where coalesce(it->>'category','') = 'monthly';

  if p_dry_run then
    return jsonb_build_object('ok', true, 'dryRun', true, 'wouldCreate', true,
      'clientId', q.client_id, 'monthlyTotal', v_monthly, 'billingStartMonth', v_start);
  end if;

  insert into public.engagements (user_id, client_id, quotation_id, status,
                                  monthly_total, billing_start_month, approved_at)
  values (q.user_id, q.client_id, q.id, 'onboarding',
          v_monthly, v_start, coalesce(q.approved_at, now()))
  on conflict (quotation_id) do nothing
  returning id into v_eng_id;

  if v_eng_id is null then
    select id into v_eng_id from public.engagements where quotation_id = q.id;
    v_steps := public.generate_onboarding_steps(v_eng_id, false);
    perform public.add_intake_questionnaire_step(v_eng_id);
    return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', true, 'steps', v_steps);
  end if;

  perform public.log_onboarding_event(q.user_id, null, v_eng_id, 'created', 'system',
    'ההתקשרות נפתחה מאישור הצעה ' || coalesce(q.quotation_number, q.id),
    jsonb_build_object('quotationId', q.id));

  v_steps := public.generate_onboarding_steps(v_eng_id, false);
  perform public.add_intake_questionnaire_step(v_eng_id);

  return jsonb_build_object('ok', true, 'engagementId', v_eng_id, 'existed', false, 'steps', v_steps);
end;
$function$;
