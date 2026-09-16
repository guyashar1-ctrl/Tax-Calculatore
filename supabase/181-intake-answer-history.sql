-- ═══════════════════════════════════════════════════════════════════════════
--  181 — היסטוריית תשובות בשאלון השנתי (שארית הנדסית H7)
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא: annual_report_answers.superseded_by קיימת (174) אבל אף פונקציה
--  לא כותבת אליה — רק קוראת אותה (where superseded_by is null) כדי למצוא
--  את התשובה החיה. שינוי דעה על שאלה עוד לפני הגשה כתב UPDATE במקום, ומחק
--  את הערך הקודם בלי עקבות. ‼ 174 כבר בנתה בדיוק את התבנית הזו לרמת הסשן
--  (restart_intake_session); כאן היא משלימה את אותה תבנית לרמת התשובה
--  הבודדת — היסטוריה מלאה, כמו שסופר-סדד-ביי כבר עושה בכל מקום אחר בקוד.
--  ‼ מה לא כאן: מקור התשובה (answered_by: client/office) כבר קיים ונכתב
--  נכון (174/B8) — זה לא היה חסר.
--
--  ‼ superseded_by (עצמי) חייב להיות נדחה לסוף הטרנזקציה — בדיוק כמו
--  annual_report_sessions.superseded_by (174): מסמנים את הישנה קודם (כדי
--  לפנות את המפתח הייחודי ara_active_uq), ורק אז מכניסים את החדשה. בלי
--  דחייה, ה-FK על superseded_by נופל כי השורה החדשה עוד לא קיימת.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.annual_report_answers
  drop constraint if exists annual_report_answers_superseded_by_fkey,
  add constraint annual_report_answers_superseded_by_fkey
    foreign key (superseded_by) references public.annual_report_answers(id)
    deferrable initially deferred;

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
    -- 181: שינוי ערך אמיתי משאיר את התשובה הקודמת כהיסטוריה (superseded_by),
    -- ולא דורס אותה. אותו ערך בדיוק (למשל שמירה כפולה) מתעדכן במקום —
    -- לא כל הקלדה היא "שינוי דעה" שראוי לתעד. ‼ ara_active_uq (session_id,
    -- question_id) WHERE superseded_by is null מרשה שורה חיה אחת בלבד —
    -- לכן מסמנים את הישנה superseded לפני שמכניסים את החדשה, לא אחרי.
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

revoke execute on function public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean) from public;
grant  execute on function public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean) to anon, authenticated, service_role;

create or replace function public.save_intake_answers(p_session_id uuid, p_answers jsonb, p_model jsonb, p_current_question_id text, p_done boolean)
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
  v_new_id uuid;
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
      -- 181: אותה תבנית היסטוריה כמו save_intake_answer — הישנה superseded
      -- לפני ההכנסה, כדי לא להתנגש ב-ara_active_uq.
      if (select answer_value from public.annual_report_answers where id = v_existing) is distinct from kv.value then
        v_new_id := gen_random_uuid();
        update public.annual_report_answers set superseded_by = v_new_id where id = v_existing;
        insert into public.annual_report_answers (id, session_id, question_id, answer_value, answered_by)
        values (v_new_id, s.id, kv.key, kv.value, 'office');
      else
        update public.annual_report_answers
           set answered_at = now(), answered_by = 'office'
         where id = v_existing;
      end if;
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

select public.assert_domain_function_invariants();
