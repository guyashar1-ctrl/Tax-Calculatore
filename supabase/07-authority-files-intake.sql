-- ─── 07: תיקי רשויות בכרטיס + שאלון קליטה דרך קישור הייצוג ───────────────────
-- (א) clients.tax_files — רשומה לכל תיק רשות: רשות, מספר תיק, על שם מי, סטטוס ייצוג.
-- (ב) RPCs ציבוריים (טוקן הייצוג = אישור הגישה, באותה תבנית של get_onboarding):
--     get_intake / start_intake / save_intake_answer — מריצים את שאלון הקליטה
--     מהקישור הציבורי בלי התחברות, וכותבים לתיק השנה של הלקוח.

alter table public.clients add column if not exists tax_files jsonb;

-- מצב הקליטה עבור טוקן: פרטי הבקשה + תיק השאלון אם קיים
create or replace function public.get_intake(p_token text)
returns table(session_id uuid, tax_year int, model jsonb, current_question_id text, session_status text, client_name text, identified boolean)
language sql
security definer
set search_path to 'public'
as $$
  select s.id, s.tax_year, s.model, s.current_question_id, s.status,
         r.client_name,
         (r.onboarding_status = 'submitted') as identified
  from public.representation_requests r
  left join public.annual_report_sessions s
    on s.client_id = r.linked_client_id
   and s.user_id = r.user_id
   and s.tax_year = (extract(year from now())::int - 1)
  where r.onboarding_token = p_token
  limit 1;
$$;

-- פתיחת (או המשך) תיק שאלון קליטה לשנת המס האחרונה
create or replace function public.start_intake(p_token text)
returns table(session_id uuid, tax_year int, model jsonb, current_question_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.representation_requests%rowtype;
  s public.annual_report_sessions%rowtype;
  v_year int := extract(year from now())::int - 1;
begin
  select * into r from public.representation_requests req
    where req.onboarding_token = p_token limit 1;
  if r.id is null or r.linked_client_id is null then
    raise exception 'invalid token';
  end if;

  select * into s from public.annual_report_sessions ars
    where ars.client_id = r.linked_client_id and ars.tax_year = v_year limit 1;

  if s.id is null then
    insert into public.annual_report_sessions (user_id, client_id, tax_year, status, model, current_question_id)
    values (
      r.user_id, r.linked_client_id, v_year, 'in_progress',
      jsonb_build_object('taxYear', v_year, 'meta', jsonb_build_object('flow', 'onboarding')),
      'year_map'
    )
    returning * into s;
  end if;

  return query select s.id, s.tax_year, s.model, s.current_question_id;
end;
$$;

-- שמירת תשובה + מצב השאלון (המנוע רץ בדפדפן; כאן רק אימות טוקן ושמירה)
create or replace function public.save_intake_answer(
  p_token text,
  p_session_id uuid,
  p_question_id text,
  p_answer jsonb,
  p_model jsonb,
  p_current_question_id text,
  p_done boolean
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.representation_requests%rowtype;
  s public.annual_report_sessions%rowtype;
  existing_id uuid;
begin
  select * into r from public.representation_requests req
    where req.onboarding_token = p_token limit 1;
  if r.id is null then return false; end if;

  select * into s from public.annual_report_sessions ars
    where ars.id = p_session_id limit 1;
  if s.id is null
     or s.client_id is distinct from r.linked_client_id
     or s.user_id is distinct from r.user_id then
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

  return true;
end;
$$;

grant execute on function public.get_intake(text) to anon, authenticated;
grant execute on function public.start_intake(text) to anon, authenticated;
grant execute on function public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean) to anon, authenticated;
