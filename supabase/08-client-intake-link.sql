-- ─── 08: שליחת שאלון יזומה מכרטיס הלקוח ─────────────────────────────────────
-- (א) clients.intake_token — טוקן קבוע ללקוח לקישור שאלון ישיר (?intake=TOKEN),
--     בנפרד מטוקן הייצוג. נוצר ע"י פונקציית המייל בשליחה הראשונה.
-- (ב) resolve_intake_token — פענוח טוקן משני המקורות: בקשת ייצוג או כרטיס לקוח.
-- (ג) get_intake/start_intake/save_intake_answer מקבלים כל אחד משני הטוקנים.
--     get_intake מחזיר גם מיתוג משרד — לדף העצמאי שאין לו get_onboarding.

alter table public.clients add column if not exists intake_token text;
create unique index if not exists clients_intake_token_idx
  on public.clients (intake_token) where intake_token is not null;

-- טוקן → (משתמש, לקוח, שם). עדיפות לבקשת ייצוג (הזרימה הקיימת), אחרת כרטיס.
create or replace function public.resolve_intake_token(p_token text)
returns table(user_id uuid, client_id text, client_name text, identified boolean)
language sql
security definer
set search_path to 'public'
as $$
  select r.user_id, r.linked_client_id, r.client_name,
         (r.onboarding_status = 'submitted') as identified
  from public.representation_requests r
  where r.onboarding_token = p_token and r.linked_client_id is not null
  union all
  select c.user_id, c.id,
         trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
         true
  from public.clients c
  where c.intake_token = p_token
  limit 1;
$$;

drop function if exists public.get_intake(text);
create or replace function public.get_intake(p_token text)
returns table(
  session_id uuid, tax_year int, model jsonb, current_question_id text,
  session_status text, client_name text, identified boolean,
  firm_name text, branding jsonb
)
language sql
security definer
set search_path to 'public'
as $$
  select s.id, s.tax_year, s.model, s.current_question_id, s.status,
         t.client_name, t.identified,
         p.firm_name, p.branding
  from public.resolve_intake_token(p_token) t
  left join public.profiles p on p.id = t.user_id
  left join public.annual_report_sessions s
    on s.client_id = t.client_id
   and s.user_id = t.user_id
   and s.tax_year = (extract(year from now())::int - 1)
  limit 1;
$$;

create or replace function public.start_intake(p_token text)
returns table(session_id uuid, tax_year int, model jsonb, current_question_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  s public.annual_report_sessions%rowtype;
  v_year int := extract(year from now())::int - 1;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then
    raise exception 'invalid token';
  end if;

  select * into s from public.annual_report_sessions ars
    where ars.client_id = t.client_id and ars.tax_year = v_year limit 1;

  if s.id is null then
    insert into public.annual_report_sessions (user_id, client_id, tax_year, status, model, current_question_id)
    values (
      t.user_id, t.client_id, v_year, 'in_progress',
      jsonb_build_object('taxYear', v_year, 'meta', jsonb_build_object('flow', 'onboarding')),
      'year_map'
    )
    returning * into s;
  end if;

  return query select s.id, s.tax_year, s.model, s.current_question_id;
end;
$$;

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

  return true;
end;
$$;

-- פתיחה מחדש של שאלון שהושלם — כשהרו"ח שולח קישור עדכון והלקוח רוצה לשנות.
-- התשובות הקיימות נשארות (save_intake_answer מעדכן אותן במקום); רק המצב מתאפס לשער.
create or replace function public.reopen_intake(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  v_year int := extract(year from now())::int - 1;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return false; end if;

  update public.annual_report_sessions
    set status = 'in_progress',
        current_question_id = 'year_map',
        completed_at = null
    where client_id = t.client_id and user_id = t.user_id and tax_year = v_year;

  return found;
end;
$$;

grant execute on function public.reopen_intake(text) to anon, authenticated;
grant execute on function public.resolve_intake_token(text) to anon, authenticated;
grant execute on function public.get_intake(text) to anon, authenticated;
grant execute on function public.start_intake(text) to anon, authenticated;
grant execute on function public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean) to anon, authenticated;
