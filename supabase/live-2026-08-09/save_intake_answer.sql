-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_session_id uuid, p_question_id text, p_answer jsonb, p_model jsonb, p_current_question_id text, p_done boolean
CREATE OR REPLACE FUNCTION public.save_intake_answer(p_token text, p_session_id uuid, p_question_id text, p_answer jsonb, p_model jsonb, p_current_question_id text, p_done boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

