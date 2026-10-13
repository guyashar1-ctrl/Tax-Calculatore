-- סטאבים לבדיקות בבידוד של 236 (השאלון הישן מול הקליטה). לא מיגרציה — רק לבידוד.
-- ‼ add_intake_questionnaire_step כאן מקוצרת, אבל שורת העוגן זהה לייצור (md5 d6e4f3e7… ב-12.10.2026);
--   advance_onboarding_step — רק «cancel», עם אותה בדיקת בעלות.
create or replace function public.step_removed_by_office(p_client_id text, p_step_type text, p_engagement_id text)
returns boolean language sql stable as $$
  select exists (select 1 from public.onboarding_steps s where s.client_id = p_client_id and s.step_type = p_step_type and s.status = 'cancelled');
$$;
create or replace function public.add_intake_questionnaire_step(p_engagement_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  e    record;
  v_id text;
begin
  select p_engagement_id as id, p_engagement_id as client_id into e;   -- בבידוד: מזהה ההתקשרות = הלקוח
  select s.id into v_id from public.onboarding_steps s
    where s.client_id = e.client_id and s.step_type = 'intake_questionnaire' and s.status not in ('cancelled','completed','verified','skipped') limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  if public.step_removed_by_office(e.client_id, 'intake_questionnaire', e.id) then
    return jsonb_build_object('ok', true, 'skipped', 'removed_by_office');
  end if;
  return jsonb_build_object('ok', true, 'existed', false, 'wouldCreate', true);
end;
$function$;
create or replace function public.advance_onboarding_step(p_step_id text, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if p_action <> 'cancel' then return jsonb_build_object('ok', false, 'error', 'unknown_action'); end if;
  update public.onboarding_steps set status = 'cancelled' where id = p_step_id and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── השאלון הישן עצמו (סעיף 6 ב-236): הגופים של start_intake / save_intake_answer / reopen_intake /
--    resolve_intake_token הועתקו מהייצור (12.10.2026) כפי שהם — כדי שהעוגנים יהיו אמיתיים. טבלאות ועזרים — מינימליים.
alter table public.clients add column if not exists last_name text;
alter table public.clients add column if not exists intake_token_expires_at timestamptz;
alter table public.clients add column if not exists intake_token_last_used_at timestamptz;
alter table public.representation_requests add column if not exists user_id uuid;
alter table public.representation_requests add column if not exists linked_client_id text;
alter table public.representation_requests add column if not exists client_name text;
alter table public.representation_requests add column if not exists onboarding_token text;
alter table public.representation_requests add column if not exists onboarding_status text;
alter table public.annual_report_sessions add column if not exists user_id uuid;
alter table public.annual_report_sessions add column if not exists status text default 'in_progress';
alter table public.annual_report_sessions add column if not exists model jsonb default '{}'::jsonb;
alter table public.annual_report_sessions add column if not exists current_question_id text;
alter table public.annual_report_sessions add column if not exists completed_at timestamptz;
create table if not exists public.annual_report_answers (id uuid primary key default gen_random_uuid(), session_id uuid, question_id text,
  answer_value jsonb, answered_by text, answered_at timestamptz default now(), superseded_by uuid);
create or replace function public.current_tax_year(p_user uuid) returns int language sql stable as $$ select 2026 $$;
create or replace function public.close_intake_step_for_client(p_client_id text) returns void language sql as $$ select null::void $$;

CREATE OR REPLACE FUNCTION public.resolve_intake_token(p_token text)
 RETURNS TABLE(user_id uuid, client_id text, client_name text, identified boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and (c.intake_token_expires_at is null or c.intake_token_expires_at > now())
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_intake(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t record;
  v_year int;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return false; end if;
  v_year := public.current_tax_year(t.user_id);

  update public.annual_report_sessions
    set status = 'in_progress',
        current_question_id = 'year_map',
        completed_at = null
    where client_id = t.client_id and user_id = t.user_id and tax_year = v_year
      and superseded_by is null;

  return found;
end;
$function$;

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
  v_new_id uuid;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return false; end if;

  select * into s from public.annual_report_sessions ars
    where ars.id = p_session_id limit 1;
  if s.id is null
     or s.client_id is distinct from t.client_id
     or s.user_id is distinct from t.user_id
     or s.superseded_by is not null then
    return false;
  end if;

  select a.id into existing_id from public.annual_report_answers a
    where a.session_id = p_session_id and a.question_id = p_question_id
      and a.superseded_by is null
    limit 1;
  if existing_id is not null then
    if (select answer_value from public.annual_report_answers where id = existing_id) is distinct from p_answer then
      v_new_id := gen_random_uuid();
      update public.annual_report_answers set superseded_by = v_new_id where id = existing_id;
      insert into public.annual_report_answers (id, session_id, question_id, answer_value, answered_by)
      values (v_new_id, p_session_id, p_question_id, p_answer, 'client');
    else
      update public.annual_report_answers
        set answered_at = now(), answered_by = 'client'
        where id = existing_id;
    end if;
  else
    insert into public.annual_report_answers (session_id, question_id, answer_value, answered_by)
    values (p_session_id, p_question_id, p_answer, 'client');
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

CREATE OR REPLACE FUNCTION public.start_intake(p_token text)
 RETURNS TABLE(session_id uuid, tax_year integer, model jsonb, current_question_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t record;
  s public.annual_report_sessions%rowtype;
  v_year int;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then
    raise exception 'invalid token';
  end if;
  v_year := public.current_tax_year(t.user_id);

  update public.clients set intake_token_last_used_at = now()
   where id = t.client_id and intake_token = p_token;

  select * into s from public.annual_report_sessions ars
    where ars.client_id = t.client_id and ars.tax_year = v_year
      and ars.superseded_by is null
    limit 1;

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
$function$;
