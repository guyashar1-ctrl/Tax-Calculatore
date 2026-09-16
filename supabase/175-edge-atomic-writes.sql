-- ═══════════════════════════════════════════════════════════════════════════
--  175 — כתיבות אטומיות מפונקציות Edge ומהדוח השנתי
-- ═══════════════════════════════════════════════════════════════════════════
--  ארבע משפחות של "קרא → שנה בזיכרון → כתוב" שחיו בדפדפן או בפונקציית Edge,
--  וכל אחת מהן מאבדת עדכון כששני אנשים (או שתי לשוניות) כותבים באותה שנייה:
--
--   ① חדר החתימה (PF12/PF20): שני חותמים בשני מכשירים. כל אחד קרא את מערך
--      החותמים, סימן את עצמו, וכתב את המערך כולו — מי שכתב שני דרס את הראשון,
--      ו-allSigned חושב ממערך ישן. בנוסף הפונקציה כתבה גם ל-clients בקריאה
--      נפרדת, בזמן שהטריגר rep_requests_sync_client כבר גוזר את זה מהבקשה.
--   ② צילום תעודה בקליטה (PF12): אותו דפוס על identity_docs.
--   ③ שאלון המשרד (B6): עד 200 כתיבות רופפות לתשובות ואז כתיבת המודל — כשל
--      באמצע משאיר תשובות בלי מודל, והמסך חזר לסשן של רגע הטעינה.
--   ④ "התחל מחדש" (H6/B5): המודל רוקן אבל התשובות נשארו — שער הכיסוי הראה
--      100% על מודל ריק. ההיסטוריה נשמרת בסשן ישן שמסומן superseded_by.
--
--  ‼ כל פונקציה כאן היא גבול הצלחה/כישלון אחד: for update, הכל בטרנזקציה
--  אחת, וחריגה במקום ok:false כשמדובר בקלט פסול (כדי שהטרנזקציה תתגלגל).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① חדר החתימה — מיזוג בשרת, לא בפונקציית ה-Edge ──────────────────────────
--  p_patch:
--    { "sign": true, "values": {...} }  — החותם חתם: מסמן אותו signed, ממזג את
--                                         ערכי החתימה, וכשכולם חתמו → awaiting_stamp.
--    { "signer": {...} }                 — עדכון שדות של חותם (למשל מייל בן/בת
--                                         הזוג ב-invite_spouse) בלי לגעת בסטטוס.
--  allSigned מחושב מהשורה **אחרי** העדכון, תחת נעילה — לא ממערך שהגיע מבחוץ.
--  ‼ אין כתיבה ל-clients: הטריגר rep_requests_sync_client (apply_client_representation)
--  גוזר את representation_status ממצב הבקשה, ושומר ש"פעיל" הוא סופי.
create or replace function public.signing_session_apply(p_request_id text, p_signer_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r          public.representation_requests%rowtype;
  v_signers  jsonb;
  v_me       jsonb;
  v_sign     boolean := coalesce((p_patch->>'sign')::boolean, false);
  v_all      boolean;
  v_status   text;
begin
  if p_request_id is null or p_signer_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;

  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'pending_signature' then return jsonb_build_object('ok', false, 'error', 'wrong_status'); end if;

  v_signers := coalesce(r.signers, '[]'::jsonb);
  select e into v_me from jsonb_array_elements(v_signers) e where e->>'id' = p_signer_id limit 1;
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_sign and v_me->>'signStatus' = 'signed' then
    return jsonb_build_object('ok', false, 'error', 'already_signed');
  end if;

  select jsonb_agg(
           case when e->>'id' = p_signer_id
                then e
                     || coalesce(p_patch->'signer', '{}'::jsonb)
                     || case when v_sign
                             then jsonb_build_object('signStatus', 'signed',
                                    -- אותו פורמט כמו new Date().toISOString() בדפדפן
                                    'signedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                             else '{}'::jsonb end
                else e end
           order by ord)
    into v_signers
    from jsonb_array_elements(v_signers) with ordinality as t(e, ord);

  v_all := not exists (
    select 1 from jsonb_array_elements(v_signers) e
     where coalesce(e->>'signStatus', '') <> 'signed');
  v_status := case when v_sign and v_all then 'awaiting_stamp' else r.status end;

  update public.representation_requests
     set signers = v_signers,
         signature_values = case when p_patch ? 'values'
                                 then coalesce(signature_values, '{}'::jsonb) || coalesce(p_patch->'values', '{}'::jsonb)
                                 else signature_values end,
         status = v_status,
         updated_at = now()
   where id = r.id;

  return jsonb_build_object('ok', true, 'allSigned', v_all, 'status', v_status, 'signers', v_signers);
end;
$function$;

revoke execute on function public.signing_session_apply(text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.signing_session_apply(text, text, jsonb) to service_role;

-- ── ② צילום תעודה — הוספה למערך במשפט אחד ───────────────────────────────────
create or replace function public.onboarding_identity_doc_append(p_request_id text, p_person text, p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_docs jsonb;
begin
  if p_person not in ('client', 'spouse') or p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;

  update public.representation_requests
     set identity_docs = jsonb_set(
           coalesce(identity_docs, '{}'::jsonb),
           array[p_person],
           coalesce(identity_docs->p_person, '[]'::jsonb) || jsonb_build_array(p_entry),
           true)
   where id = p_request_id
   returning identity_docs into v_docs;

  if v_docs is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_docs->p_person));
end;
$function$;

revoke execute on function public.onboarding_identity_doc_append(text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.onboarding_identity_doc_append(text, text, jsonb) to service_role;

-- ── ③+④ הדוח השנתי — סכימה ──────────────────────────────────────────────────
--  answered_by (B8): מי ענה — הלקוח מהקישור הציבורי או המשרד מהמסך.
alter table public.annual_report_answers
  add column if not exists answered_by text
  check (answered_by in ('client', 'office'));

--  superseded_by על הסשן: "התחל מחדש" לא מוחק — הוא פותח סשן חדש ומצביע
--  מהישן אליו. ‼ ה-FK נדחה לסוף הטרנזקציה כדי שאפשר יהיה לסמן את הישן לפני
--  שהחדש נכנס (הייחודיות החלקית למטה מרשה רק סשן חי אחד לכל לקוח+שנה).
alter table public.annual_report_sessions
  add column if not exists superseded_by uuid
  references public.annual_report_sessions(id) on delete set null
  deferrable initially deferred;

alter table public.annual_report_sessions
  drop constraint if exists annual_report_sessions_client_id_tax_year_key;
create unique index if not exists ars_live_client_year_uq
  on public.annual_report_sessions (client_id, tax_year)
  where superseded_by is null;

-- ── ③ שאלון המשרד — כל התשובות והמודל בטרנזקציה אחת ─────────────────────────
--  p_answers: אובייקט { question_id: answer_value }. מזהה ריק או תשובה null
--  מפילים את הקריאה כולה — לא נכתבת אף תשובה ולא המודל.
--  p_done: true = השאלון הסתיים (review), false = ממשיכים (in_progress),
--  null = תשובה ומודל בלבד — הסטטוס והשאלה הנוכחית לא נוגעים (שער הכיסוי).
--  מחזירה את שורת הסשן הטרייה (to_jsonb), כדי שהמסך יאמץ אותה במקום עותק ישן.
create or replace function public.save_intake_answers(
  p_session_id uuid, p_answers jsonb, p_model jsonb, p_current_question_id text, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  s     public.annual_report_sessions%rowtype;
  kv    record;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  if p_model is null or jsonb_typeof(p_model) <> 'object' then raise exception 'bad_model'; end if;

  select * into s from public.annual_report_sessions where id = p_session_id for update;
  if s.id is null or s.user_id <> v_uid then raise exception 'session_not_found'; end if;
  if s.superseded_by is not null then raise exception 'session_superseded'; end if;

  for kv in select key, value from jsonb_each(p_answers) loop
    if coalesce(trim(kv.key), '') = '' then raise exception 'bad_question_id'; end if;
    if kv.value is null or jsonb_typeof(kv.value) = 'null' then
      raise exception 'bad_answer: %', kv.key;
    end if;

    select a.id into v_existing from public.annual_report_answers a
      where a.session_id = s.id and a.question_id = kv.key and a.superseded_by is null
      limit 1;
    if v_existing is not null then
      update public.annual_report_answers
         set answer_value = kv.value, answered_at = now(), answered_by = 'office'
       where id = v_existing;
    else
      insert into public.annual_report_answers (session_id, question_id, answer_value, answered_by)
      values (s.id, kv.key, kv.value, 'office');
    end if;
  end loop;

  update public.annual_report_sessions
     set model = p_model,
         current_question_id = case when p_done is null then current_question_id else p_current_question_id end,
         status = case when p_done is null then status when p_done then 'review' else 'in_progress' end,
         completed_at = case when p_done is null then completed_at
                             when p_done then coalesce(completed_at, now()) else null end
   where id = s.id
   returning * into s;

  return to_jsonb(s);
end;
$function$;

revoke execute on function public.save_intake_answers(uuid, jsonb, jsonb, text, boolean) from public, anon;
grant  execute on function public.save_intake_answers(uuid, jsonb, jsonb, text, boolean) to authenticated, service_role;

-- ── ④ "התחל מחדש" — סשן חדש, הישן נשמר כהיסטוריה ────────────────────────────
--  הסדר מכוון: קודם הישן מקבל superseded_by (בלי לגעת בסטטוס — הטריגר של
--  שלב השאלון לא מופעל), ואז החדש נכנס ומפעיל את הטריגר פעם אחת, כסשן חי.
create or replace function public.restart_intake_session(
  p_session_id uuid, p_root_question_id text default 'year_map', p_model jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  old_s public.annual_report_sessions%rowtype;
  new_s public.annual_report_sessions%rowtype;
  v_new_id uuid := gen_random_uuid();
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;

  select * into old_s from public.annual_report_sessions where id = p_session_id for update;
  if old_s.id is null or old_s.user_id <> v_uid then raise exception 'session_not_found'; end if;
  if old_s.superseded_by is not null then raise exception 'session_superseded'; end if;

  update public.annual_report_sessions set superseded_by = v_new_id where id = old_s.id;

  insert into public.annual_report_sessions (id, user_id, client_id, tax_year, status, model, current_question_id)
  values (v_new_id, old_s.user_id, old_s.client_id, old_s.tax_year, 'in_progress',
          coalesce(p_model, jsonb_build_object('taxYear', old_s.tax_year)),
          coalesce(nullif(p_root_question_id, ''), 'year_map'))
  returning * into new_s;

  return to_jsonb(new_s);
end;
$function$;

revoke execute on function public.restart_intake_session(uuid, text, jsonb) from public, anon;
grant  execute on function public.restart_intake_session(uuid, text, jsonb) to authenticated, service_role;

-- ── ④ הקוראים לפי לקוח+שנה רואים רק את הסשן החי ─────────────────────────────
--  הגוף זהה ל-168 (ול-47 עבור save_intake_answer); התוספת היחידה:
--  superseded_by is null. ב-save_intake_answer נוסף גם answered_by='client'.
create or replace function public.get_intake(p_token text)
returns table(session_id uuid, tax_year integer, model jsonb, current_question_id text,
              session_status text, client_name text, identified boolean, firm_name text, branding jsonb)
language sql
security definer
set search_path to 'public'
as $function$
  select s.id, s.tax_year, s.model, s.current_question_id, s.status,
         t.client_name, t.identified,
         p.firm_name, p.branding
  from public.resolve_intake_token(p_token) t
  left join public.profiles p on p.id = t.user_id
  left join public.annual_report_sessions s
    on s.client_id = t.client_id
   and s.user_id = t.user_id
   and s.tax_year = public.current_tax_year(t.user_id)
   and s.superseded_by is null
  limit 1;
$function$;

create or replace function public.start_intake(p_token text)
returns table(session_id uuid, tax_year integer, model jsonb, current_question_id text)
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create or replace function public.reopen_intake(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
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
     or s.user_id is distinct from t.user_id
     or s.superseded_by is not null then
    return false;
  end if;

  select a.id into existing_id from public.annual_report_answers a
    where a.session_id = p_session_id and a.question_id = p_question_id
      and a.superseded_by is null
    limit 1;
  if existing_id is not null then
    update public.annual_report_answers
      set answer_value = p_answer, answered_at = now(), answered_by = 'client'
      where id = existing_id;
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

-- ‼ ארבע פונקציות הדף הציבורי — הטוקן הוא ההרשאה; כולן ברשימת v_anon_ok של השומר.
revoke execute on function public.get_intake(text)         from public;
revoke execute on function public.start_intake(text)       from public;
revoke execute on function public.reopen_intake(text)      from public;
revoke execute on function public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean) from public;
grant  execute on function public.get_intake(text)         to anon, authenticated, service_role;
grant  execute on function public.start_intake(text)       to anon, authenticated, service_role;
grant  execute on function public.reopen_intake(text)      to anon, authenticated, service_role;
grant  execute on function public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean) to anon, authenticated, service_role;

--  שלב השאלון נגזר מהסשן החי בלבד (168 — הגוף זהה, נוסף superseded_by is null).
create or replace function public.sync_intake_step_from_sessions(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s      public.onboarding_steps%rowtype;
  v_year int;
  v_sess text;
begin
  select * into s from public.onboarding_steps
    where client_id = p_client_id and step_type = 'intake_questionnaire'
      and status not in ('cancelled', 'skipped', 'verified')
    order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', true, 'noop', true); end if;

  v_year := public.current_tax_year(s.user_id);
  select ars.status into v_sess from public.annual_report_sessions ars
    where ars.client_id = p_client_id and ars.tax_year = v_year
      and ars.superseded_by is null;

  if v_sess in ('review', 'mapping_done') then
    if s.status = 'completed' then return jsonb_build_object('ok', true, 'noop', true); end if;
    update public.onboarding_steps
      set status = 'completed', completion_method = 'auto', ball = 'me',
          completed_at = coalesce(completed_at, now()), needs_attention = false, updated_at = now()
      where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח מילא את שאלון פתיחת התיק', jsonb_build_object('from', s.status, 'to', 'completed'));
    perform public.unlock_dependent_steps(s.id);
    return jsonb_build_object('ok', true, 'stepId', s.id, 'to', 'completed');
  end if;

  if s.status = 'completed' then
    if coalesce(s.completion_method, '') <> 'auto' then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
    update public.onboarding_steps
      set status = case when v_sess = 'in_progress' or s.published_at is not null
                        then 'waiting_client' else 'pending' end,
          ball = case when v_sess = 'in_progress' or s.published_at is not null
                      then 'client' else 'me' end,
          -- ברירת המחדל של העמודה (not null); "auto" נכתב רק כשהסשן סוגר.
          completion_method = 'manual', completed_at = null, updated_at = now()
      where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      case when v_sess = 'in_progress' then 'הלקוח פתח מחדש את השאלון'
           else 'שאלון השנה הוסר - הבקשה חזרה להמתין' end,
      jsonb_build_object('from', 'completed', 'session', v_sess));
    return jsonb_build_object('ok', true, 'stepId', s.id, 'to', 'reopened');
  end if;

  if v_sess = 'in_progress' and s.status = 'pending' then
    update public.onboarding_steps
      set status = 'waiting_client', ball = 'client', updated_at = now()
      where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח התחיל למלא את השאלון', jsonb_build_object('from', 'pending', 'to', 'waiting_client'));
    return jsonb_build_object('ok', true, 'stepId', s.id, 'to', 'waiting_client');
  end if;

  return jsonb_build_object('ok', true, 'noop', true);
end;
$function$;

revoke execute on function public.sync_intake_step_from_sessions(text) from public, anon, authenticated;
grant  execute on function public.sync_intake_step_from_sessions(text) to service_role;

-- ── שומר הקבועים ────────────────────────────────────────────────────────────
select public.assert_domain_function_invariants();
