-- ═══════════════════════════════════════════════════════════════════════════
--  165 — תנאי-קדם לבקשה ואיסוף מידע (Request Prerequisites)
-- ═══════════════════════════════════════════════════════════════════════════
--  מקור: docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md §16,
--  docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md.
--  ‼ בקשה אינה מציעה ביצוע לפני שיש את המידע שהביצוע דורש. תנאי-קדם הוא
--  מצב נגזר בשרת (payload.prerequisites), לא בקשה נוספת. שני נתיבי השלמה —
--  המשרד וקישור-משתתף — כותבים לאותו מקום (clients.*) דרך כותב אחד.
--
--  ‼ נכתב אחרי 164 (build_client_portal פנימית; assert_domain_function_
--  invariants; event trigger p0_lock_new_functions שמסיר EXECUTE מ-PUBLIC
--  מכל פונקציה חדשה). כל RPC כאן מקבל grant מפורש לתפקיד הדרוש; שני ה-RPC
--  הציבוריים נוספים ל-v_anon_ok כחלק מהמיגרציה הזו, אחרת assert_domain_
--  function_invariants() בסוף הקובץ נכשלת ומפילה את כל הטרנזקציה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── -1 · tax_fact_changes.source מתיר 'prerequisite' ────────────────────
-- ‼ נתפס אמפירית: הרשימה הקבועה ב-tax_fact_changes_source_check לא כללה
-- ערך לכתיבה מתנאי-קדם — _apply_prerequisite_values (סעיף 3) היה נכשל בכל
-- שמירה אמיתית. מילוי-לאחור אימיילים משתמש ב-'import' הקיים (סעיפית זהה —
-- ייבוא מנתוני חתימה היסטוריים) ולא בערך חדש חד-פעמי.
alter table public.tax_fact_changes drop constraint tax_fact_changes_source_check;
alter table public.tax_fact_changes add constraint tax_fact_changes_source_check
  check (source = any (array['questionnaire','manual','institution_alignment','import','automation','prerequisite']));

-- ‼ נתפס אמפירית: onboarding_events.actor לא כלל 'participant' — get_participant_form
-- ו-participant_submit_prerequisites נכשלים בכל קריאה/הגשה אמיתית. 'participant' הוא
-- תפקיד אמת (מי שמילא דרך קישור-משתתף), לא 'client'/'accountant'/'system' הקיימים.
alter table public.onboarding_events drop constraint onboarding_events_actor_check;
alter table public.onboarding_events add constraint onboarding_events_actor_check
  check (actor = any (array['accountant','client','system','participant']));

-- ── 0 · קישורי משתתף ─────────────────────────────────────────────────────
create table public.request_participant_links (
  id                 text primary key default replace(gen_random_uuid()::text,'-',''),
  user_id            uuid not null,
  step_id            text not null references public.onboarding_steps(id) on delete cascade,
  client_id          text not null,
  participant_role   text not null check (participant_role in ('client','spouse')),
  requirement_key    text not null,
  field_keys         text[] not null,
  token              text not null unique,
  expires_at         timestamptz not null,
  sent_to            text,
  sent_at            timestamptz,
  opened_at          timestamptz,
  submitted_at       timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create unique index request_participant_links_active_idx
  on public.request_participant_links (step_id)
  where submitted_at is null and revoked_at is null;

create index request_participant_links_token_idx on public.request_participant_links (token);

alter table public.request_participant_links enable row level security;
-- ‼ אין policy ל-anon/authenticated: כל גישה עוברת דרך RPC (SECURITY DEFINER)
-- שמאמת בעלות/טוקן בגוף. RLS כאן היא רשת ביטחון נוספת בלבד (ברירת מחדל: חסום הכול).

-- ── 1 · המרשם — מה נדרש, לאיזה שלב ────────────────────────────────────────
-- ‼ פונקציה טהורה. הרחבה עתידית (מע״מ/ניכויים/שע״ם לאדם) היא הוספת ענף כאן,
-- לא ארכיטקטורה חדשה.
create or replace function public.requirements_for_step(p_step_type text, p_payload jsonb)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select case
    when p_step_type = 'authority_representation' and p_payload->>'authority' = 'national_insurance'
         and p_payload->>'subjectRole' = 'spouse' then
      jsonb_build_object('key','btl.entry','fields', jsonb_build_array(
        jsonb_build_object('key','spouseFirstName','kind','text','label','שם פרטי'),
        jsonb_build_object('key','spouseLastName','kind','text','label','שם משפחה'),
        jsonb_build_object('key','spouseIdNumber','kind','idNumber','label','תעודת זהות'),
        jsonb_build_object('key','spouseBirthYear','kind','year','label','שנת לידה')))
    when p_step_type = 'authority_representation' and p_payload->>'authority' = 'national_insurance' then
      jsonb_build_object('key','btl.entry','fields', jsonb_build_array(
        jsonb_build_object('key','firstName','kind','text','label','שם פרטי'),
        jsonb_build_object('key','lastName','kind','text','label','שם משפחה'),
        jsonb_build_object('key','idNumber','kind','idNumber','label','תעודת זהות'),
        jsonb_build_object('key','birthDate','kind','date','label','תאריך לידה')))
    else jsonb_build_object('key', null, 'fields', '[]'::jsonb)
  end;
$function$;

create or replace function public._client_field_present(c public.clients, p_key text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select case p_key
    when 'spouseFirstName' then nullif(trim(coalesce(c.spouse_first_name,'')),'') is not null
    when 'spouseLastName'  then nullif(trim(coalesce(c.spouse_last_name,'')),'') is not null
    when 'spouseIdNumber'  then nullif(trim(coalesce(c.spouse_id_number,'')),'') is not null
    when 'spouseBirthYear' then c.spouse_birth_year is not null
    when 'firstName' then nullif(trim(coalesce(c.first_name,'')),'') is not null
    when 'lastName'  then nullif(trim(coalesce(c.last_name,'')),'') is not null
    when 'idNumber'  then nullif(trim(coalesce(c.id_number,'')),'') is not null
    when 'birthDate' then c.birth_date is not null
    else true
  end;
$function$;

create or replace function public.missing_prerequisites(p_client_id text, p_step_type text, p_payload jsonb)
returns text[]
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(array_agg(f->>'key'), '{}'::text[])
  from public.clients c, jsonb_array_elements(public.requirements_for_step(p_step_type, p_payload)->'fields') f
  where c.id = p_client_id and not public._client_field_present(c, f->>'key');
$function$;

-- ── 2 · sync_authority_representation_steps — מרחיב את 157 ─────────────────
-- ‼ תנאי-קדם נגזרים בכל ריצה, בלי קשר לשינוי סטטוס. ראיה שהוזנה כבר
-- (enteredAt) גוברת — לא פותחים מחדש דרישה שנמחקה אחר כך (§16.8 ביסודות).
-- ‼ CREATE OR REPLACE מלא (לא anchored-patch): הפונקציה קצרה מספיק, ויש לי
-- את הגוף המלא והעדכני מהפרודקשן (157) — אין סיכון להשמטה שקטה.
create or replace function public.sync_authority_representation_steps(p_client_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s              record;
  v_track        text;
  v_t            jsonb;
  v_tf           jsonb;
  v_file         jsonb;
  v_new_status   text;
  v_new_ball     text;
  v_note         text;
  v_req          jsonb;
  v_missing      text[];
  v_missing_j    jsonb;
  v_prev_prereqs jsonb;
  v_new_prereqs  jsonb;
  v_link         jsonb;
  v_link_revoked int;
begin
  for s in
    select * from public.onboarding_steps
    where client_id = p_client_id and step_type = 'authority_representation'
      and status <> 'cancelled'
  loop
    v_track := case when s.payload->>'subjectRole' = 'spouse'
                     then 'nationalInsuranceSpouse' else 'nationalInsurance' end;

    select execution -> v_track into v_t from public.representation_requests
      where id = s.payload->>'representationRequestId';
    v_t := coalesce(v_t, '{}'::jsonb);

    select tax_files into v_tf from public.clients where id = p_client_id;
    select f into v_file from jsonb_array_elements(coalesce(v_tf, '[]'::jsonb)) f
      where f->>'authority' = s.payload->>'authority' and f->>'owner' = s.payload->>'subjectRole'
      limit 1;

    -- ── תנאי-קדם (165) ───────────────────────────────────────────────────
    v_prev_prereqs := s.payload->'prerequisites';
    if (v_t->>'enteredAt') is not null then
      v_missing_j := '[]'::jsonb;
    else
      v_missing := public.missing_prerequisites(p_client_id, s.step_type, s.payload);
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_missing_j from unnest(v_missing) x;
    end if;
    v_req := public.requirements_for_step(s.step_type, s.payload);

    select jsonb_build_object('id', l.id, 'sentAt', l.sent_at, 'sentTo', l.sent_to,
                               'openedAt', l.opened_at, 'expiresAt', l.expires_at)
      into v_link
      from public.request_participant_links l
      where l.step_id = s.id and l.submitted_at is null and l.revoked_at is null and l.expires_at > now()
      limit 1;

    v_new_prereqs := jsonb_build_object(
      'stage', 'entry',
      'required', coalesce((select jsonb_agg(f->>'key') from jsonb_array_elements(v_req->'fields') f), '[]'::jsonb),
      'missing', v_missing_j,
      'satisfiedAt', case when jsonb_array_length(v_missing_j) = 0
                           then coalesce(v_prev_prereqs->>'satisfiedAt', now()::text)
                           else null end,
      'link', v_link);

    -- התנאים התקיימו ויש קישור פעיל ⇒ מבטלים אותו אוטומטית (§16.6)
    if jsonb_array_length(v_missing_j) = 0 and v_link is not null then
      update public.request_participant_links
         set revoked_at = now()
       where step_id = s.id and submitted_at is null and revoked_at is null;
      get diagnostics v_link_revoked = row_count;
      if v_link_revoked > 0 then
        perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'participant_link_revoked', 'system',
          'הפרטים הושלמו — הקישור בוטל אוטומטית', jsonb_build_object('linkId', v_link->>'id', 'reason','satisfied'));
      end if;
      v_new_prereqs := v_new_prereqs - 'link';
    end if;

    if v_prev_prereqs is not null
       and coalesce(jsonb_array_length(v_prev_prereqs->'missing'), 0) > 0
       and jsonb_array_length(v_missing_j) = 0 then
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'prerequisites_satisfied', 'system',
        'הפרטים החסרים הושלמו', jsonb_build_object('stage','entry'));
    end if;

    -- ── מצב הביצוע (157, ללא שינוי) ──────────────────────────────────────
    if (v_t->>'confirmedAt') is not null or (v_file->>'repStatus') = 'active' then
      v_new_status := 'completed'; v_new_ball := s.ball; v_note := 'ייצוג פעיל';
    elsif nullif(v_t->>'deadline','') is not null and (v_t->>'deadline')::date < current_date then
      v_new_status := 'blocked'; v_new_ball := 'me'; v_note := 'האסמכתא פגה — נדרשת הזנה מחדש';
    elsif (v_t->>'instructionsSentAt') is not null then
      v_new_status := 'waiting_client'; v_new_ball := 'client'; v_note := 'הוראות האישור נשלחו';
    elsif nullif(v_t->>'referenceNumber','') is not null then
      v_new_status := 'in_progress'; v_new_ball := 'me'; v_note := 'האסמכתא התקבלה';
    elsif (v_t->>'enteredAt') is not null then
      v_new_status := 'in_progress'; v_new_ball := 'me'; v_note := 'הייצוג הוזן בביטוח לאומי';
    else
      v_new_status := 'pending'; v_new_ball := 'me'; v_note := null;
    end if;

    if v_new_status is distinct from s.status or v_new_prereqs is distinct from v_prev_prereqs then
      update public.onboarding_steps
         set status = v_new_status,
             ball = case when v_new_status = 'completed' then ball else v_new_ball end,
             payload = (case when v_new_status = 'completed'
                            then payload || jsonb_strip_nulls(jsonb_build_object(
                                   'referenceNumber', nullif(v_t->>'referenceNumber',''),
                                   'deadline', nullif(v_t->>'deadline',''),
                                   'instructionsSentAt', nullif(v_t->>'instructionsSentAt',''),
                                   'instructionsSentWith', nullif(v_t->>'instructionsSentWith',''),
                                   'confirmedAt', nullif(v_t->>'confirmedAt','')))
                            else payload end)
                        || jsonb_build_object('prerequisites', v_new_prereqs),
             completion_method = case when v_new_status = 'completed' then 'auto' else completion_method end,
             completed_at = case when v_new_status = 'completed'
                                  then coalesce(completed_at, nullif(v_t->>'confirmedAt','')::timestamptz, now())
                                  else completed_at end,
             needs_attention = case when v_new_status = 'blocked' then true
                                     when v_new_status = 'completed' then false
                                     else needs_attention end,
             updated_at = now()
       where id = s.id;

      if v_new_status is distinct from s.status then
        perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
          v_note, jsonb_build_object('from', s.status, 'to', v_new_status));
        if v_new_status = 'completed' then
          perform public.unlock_dependent_steps(s.id);
        end if;
      end if;
    end if;
  end loop;
end;
$function$;

-- ‼ סופאבייס מעניקה EXECUTE ישירות ל-authenticated בברירת המחדל (ALTER
-- DEFAULT PRIVILEGES, לא דרך PUBLIC) — ה-event trigger מ-160 מסיר רק מ-PUBLIC
-- ואינו נוגע בהרשאה הישירה. נתפס אמפירית: revoke מפורש חובה לכל פונקציה
-- פנימית, גם אחרי 160 (זיכרון: supabase-default-anon-execute.md).
revoke all on function public.sync_authority_representation_steps(text) from public, anon, authenticated;

-- ── 3 · הכותב הקנוני — משותף לשני הנתיבים ───────────────────────────────
-- ‼ פנימית בלבד (כמו _tax_fact_field_op). לא נגישה ל-authenticated/anon —
-- שני ה-RPC למטה הם המקום היחיד שקורא לה, אחרי אימות רשימת ההיתר בגוף שלהם.
create or replace function public._apply_prerequisite_values(
  p_client_id text, p_step_id text, p_values jsonb, p_actor text, p_via text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k          text;
  v_val      text;
  v_old      text;
  v_old_all  jsonb := '{}'::jsonb;
  v_new_all  jsonb := '{}'::jsonb;
  v_uid      uuid;
begin
  select user_id into v_uid from public.clients where id = p_client_id for update;
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'client_not_found'); end if;

  for k in select jsonb_object_keys(p_values) loop
    v_val := nullif(trim(coalesce(p_values ->> k, '')), '');
    case k
      when 'spouseFirstName' then
        select spouse_first_name into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set spouse_first_name = v_val, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'spouseLastName' then
        select spouse_last_name into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set spouse_last_name = v_val, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'spouseIdNumber' then
        select spouse_id_number into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set spouse_id_number = v_val, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'spouseBirthYear' then
        select spouse_birth_year::text into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set spouse_birth_year = v_val::int, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'firstName' then
        select first_name into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set first_name = v_val, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'lastName' then
        select last_name into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set last_name = v_val, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'idNumber' then
        select id_number into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set id_number = v_val, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      when 'birthDate' then
        select birth_date::text into v_old from public.clients where id = p_client_id;
        if v_val is distinct from v_old then
          update public.clients set birth_date = v_val::date, updated_at = now() where id = p_client_id;
          v_old_all := v_old_all || jsonb_build_object(k, v_old); v_new_all := v_new_all || jsonb_build_object(k, v_val);
        end if;
      else
        return jsonb_build_object('ok', false, 'reason', 'field_not_allowed', 'field', k);
    end case;
  end loop;

  if v_new_all <> '{}'::jsonb then
    insert into public.tax_fact_changes
      (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
    values
      (v_uid, p_client_id, 'requestPrerequisites', 'פרטים לבקשה',
       v_old_all, jsonb_build_object('values', v_new_all, 'stepId', p_step_id, 'via', p_via),
       'prerequisite', 'accepted', v_uid, now(), p_actor);
  end if;

  return jsonb_build_object('ok', true, 'changed', v_new_all);
end;
$function$;

revoke all on function public._apply_prerequisite_values(text,text,jsonb,text,text) from public, anon, authenticated;

-- ── 4 · «מלא פרטים עכשיו» — המשרד ────────────────────────────────────────
create or replace function public.complete_request_prerequisites(p_step_id text, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  s         public.onboarding_steps%rowtype;
  v_req     jsonb;
  v_allowed text[];
  k         text;
  v_val     text;
  v_kind    text;
  v_apply   jsonb;
  v_result  jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;

  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'step_not_found'); end if;
  if s.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;

  v_req := public.requirements_for_step(s.step_type, s.payload);
  select array_agg(f->>'key') into v_allowed from jsonb_array_elements(v_req->'fields') f;

  for k in select jsonb_object_keys(p_values) loop
    if not (k = any(coalesce(v_allowed,'{}'::text[]))) then
      return jsonb_build_object('ok', false, 'reason', 'field_not_allowed', 'field', k);
    end if;
    v_val := nullif(trim(coalesce(p_values ->> k, '')), '');
    select f->>'kind' into v_kind from jsonb_array_elements(v_req->'fields') f where f->>'key' = k;
    if v_val is null then return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k); end if;
    if v_kind = 'idNumber' and v_val !~ '^\d{9}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
    if v_kind = 'year' and (v_val !~ '^\d{4}$' or v_val::int < 1900 or v_val::int > extract(year from now())::int) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
    if v_kind = 'date' and v_val !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
  end loop;

  v_apply := public._apply_prerequisite_values(s.client_id, s.id, p_values, 'accountant', 'office');
  if not coalesce((v_apply->>'ok')::boolean, false) then return v_apply; end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'prerequisites_filled', 'accountant',
    'המשרד השלים פרטים לבקשה', jsonb_build_object('fields', v_apply->'changed', 'via', 'office'));

  perform public.sync_authority_representation_steps(s.client_id);

  select payload->'prerequisites' into v_result from public.onboarding_steps where id = s.id;
  return jsonb_build_object('ok', true, 'prerequisites', v_result);
end;
$function$;

grant execute on function public.complete_request_prerequisites(text, jsonb) to authenticated;

-- ── 5 · יצירת קישור משתתף ────────────────────────────────────────────────
create or replace function public.create_participant_link(p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  s          public.onboarding_steps%rowtype;
  v_token    text;
  v_link_id  text;
  v_role     text;
  v_revoked  int;
  v_expires  timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;

  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'step_not_found'); end if;
  if s.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if s.step_type <> 'authority_representation' then
    return jsonb_build_object('ok', false, 'reason', 'not_supported');
  end if;

  v_role := coalesce(s.payload->>'subjectRole', 'client');
  v_expires := now() + interval '14 days';

  with revoked as (
    update public.request_participant_links
       set revoked_at = now()
     where step_id = s.id and submitted_at is null and revoked_at is null
    returning id
  )
  select count(*) into v_revoked from revoked;
  if v_revoked > 0 then
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'participant_link_revoked', 'accountant',
      'קישור קודם בוטל בשליחה חוזרת', jsonb_build_object('reason','reissued'));
  end if;

  -- ‼ נתפס אמפירית: gen_random_bytes חי ב-extensions, לא ב-public — עם
  -- search_path נעול (למעלה) הוא לא נמצא. gen_random_uuid() תמיד זמין
  -- (pg_catalog) והיא הדרך שבה נוצרים כל שאר הטוקנים בקוד הזה (110 ואילך).
  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.request_participant_links
    (user_id, step_id, client_id, participant_role, requirement_key, field_keys, token, expires_at)
  values
    (s.user_id, s.id, s.client_id, v_role,
     coalesce((public.requirements_for_step(s.step_type, s.payload))->>'key', 'btl.entry'),
     coalesce((select array_agg(f->>'key') from jsonb_array_elements(public.requirements_for_step(s.step_type, s.payload)->'fields') f), '{}'::text[]),
     v_token, v_expires)
  returning id into v_link_id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'participant_link_created', 'accountant',
    'נוצר קישור להשלמת פרטים', jsonb_build_object('linkId', v_link_id, 'participantRole', v_role));

  perform public.sync_authority_representation_steps(s.client_id);

  return jsonb_build_object('ok', true, 'linkId', v_link_id, 'token', v_token, 'expiresAt', v_expires);
end;
$function$;

grant execute on function public.create_participant_link(text) to authenticated;

-- ── 6 · דף המשתתף — קריאה ────────────────────────────────────────────────
-- ‼ אנונימי במפורש. מחזיר רק: שם המשרד/הבעלים, שם המשתתף, ושדות הסט של
-- הקישור הזה עם ערכיהם הנוכחיים. שום דבר אחר על הכרטיס.
create or replace function public.get_participant_form(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l  public.request_participant_links%rowtype;
  c  public.clients%rowtype;
  s  public.onboarding_steps%rowtype;
  p  public.profiles%rowtype;
  v_req    jsonb;
  v_fields jsonb;
  v_owner_first text;
  v_participant_name text;
  v_missing text[];
begin
  select * into l from public.request_participant_links where token = p_token;
  if l.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'link_revoked'); end if;
  if l.submitted_at is not null then return jsonb_build_object('ok', true, 'alreadySubmitted', true); end if;
  if l.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'link_expired'); end if;

  select * into s from public.onboarding_steps where id = l.step_id;
  if s.id is null or s.status in ('completed','verified','cancelled') then
    return jsonb_build_object('ok', true, 'alreadySatisfied', true);
  end if;

  v_missing := public.missing_prerequisites(l.client_id, s.step_type, s.payload);
  if coalesce(array_length(v_missing, 1), 0) = 0 then
    update public.request_participant_links set revoked_at = now() where id = l.id;
    return jsonb_build_object('ok', true, 'alreadySatisfied', true);
  end if;

  select * into c from public.clients where id = l.client_id;
  select * into p from public.profiles where id = c.user_id;
  v_req := public.requirements_for_step(s.step_type, s.payload);

  if l.opened_at is null then
    update public.request_participant_links set opened_at = now() where id = l.id;
    perform public.log_onboarding_event(l.user_id, l.step_id, s.engagement_id, 'participant_link_opened', 'participant',
      null, jsonb_build_object('linkId', l.id));
  end if;

  v_owner_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_participant_name := case when l.participant_role = 'spouse'
    then coalesce(
      nullif(trim(coalesce(c.spouse_first_name,'') || ' ' || coalesce(c.spouse_last_name,'')), ''),
      nullif(trim(coalesce(c.spouse_name,'')), ''), 'בן/בת הזוג')
    else nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '') end;

  select jsonb_agg(jsonb_build_object(
           'key', f->>'key', 'kind', f->>'kind', 'label', f->>'label',
           'value', case f->>'key'
             when 'spouseFirstName' then to_jsonb(c.spouse_first_name)
             when 'spouseLastName'  then to_jsonb(c.spouse_last_name)
             when 'spouseIdNumber'  then to_jsonb(c.spouse_id_number)
             when 'spouseBirthYear' then to_jsonb(c.spouse_birth_year)
             when 'firstName' then to_jsonb(c.first_name)
             when 'lastName'  then to_jsonb(c.last_name)
             when 'idNumber'  then to_jsonb(c.id_number)
             when 'birthDate' then to_jsonb(c.birth_date)
             else null end)
           order by ord)
    into v_fields
    from jsonb_array_elements(v_req->'fields') with ordinality t(f, ord)
    where l.field_keys @> array[f->>'key'];

  return jsonb_build_object('ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'ownerFirstName', v_owner_first,
    'participantName', v_participant_name,
    'fields', coalesce(v_fields, '[]'::jsonb));
end;
$function$;

revoke all on function public.get_participant_form(text) from public, authenticated;
grant execute on function public.get_participant_form(text) to anon;

-- ── 7 · דף המשתתף — הגשה ─────────────────────────────────────────────────
create or replace function public.participant_submit_prerequisites(p_token text, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l       public.request_participant_links%rowtype;
  s       public.onboarding_steps%rowtype;
  c       public.clients%rowtype;
  v_req   jsonb;
  k       text;
  v_val   text;
  v_kind  text;
  v_apply jsonb;
  v_who   text;
begin
  select * into l from public.request_participant_links where token = p_token for update;
  if l.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'link_revoked'); end if;
  if l.submitted_at is not null then return jsonb_build_object('ok', true, 'alreadySubmitted', true); end if;
  if l.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'link_expired'); end if;

  select * into s from public.onboarding_steps where id = l.step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'step_not_found'); end if;

  v_req := public.requirements_for_step(s.step_type, s.payload);

  for k in select jsonb_object_keys(p_values) loop
    if not (l.field_keys @> array[k]) then
      return jsonb_build_object('ok', false, 'reason', 'field_not_allowed', 'field', k);
    end if;
    v_val := nullif(trim(coalesce(p_values ->> k, '')), '');
    select f->>'kind' into v_kind from jsonb_array_elements(v_req->'fields') f where f->>'key' = k;
    if v_val is null then return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k); end if;
    if v_kind = 'idNumber' and v_val !~ '^\d{9}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
    if v_kind = 'year' and (v_val !~ '^\d{4}$' or v_val::int < 1900 or v_val::int > extract(year from now())::int) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
    if v_kind = 'date' and v_val !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
  end loop;

  v_apply := public._apply_prerequisite_values(l.client_id, l.step_id, p_values, 'participant', 'link');
  if not coalesce((v_apply->>'ok')::boolean, false) then return v_apply; end if;

  update public.request_participant_links set submitted_at = now() where id = l.id;

  select * into c from public.clients where id = l.client_id;
  v_who := case when l.participant_role = 'spouse'
    then coalesce(nullif(trim(coalesce(c.spouse_first_name,'')),''), 'בן/בת הזוג')
    else coalesce(nullif(trim(coalesce(c.first_name,'')),''), 'הלקוח') end;

  perform public.log_onboarding_event(l.user_id, l.step_id, s.engagement_id, 'prerequisites_filled', 'participant',
    'הפרטים התקבלו מ' || v_who, jsonb_build_object('fields', v_apply->'changed', 'via', 'link', 'linkId', l.id));

  perform public.sync_authority_representation_steps(l.client_id);

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.participant_submit_prerequisites(text, jsonb) from public, authenticated;
grant execute on function public.participant_submit_prerequisites(text, jsonb) to anon;

-- ── 8 · שומר הקבועים — הוספת שני ה-RPC הציבוריים לרשימת ההיתר (164) ─────
create or replace function public.assert_domain_function_invariants()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_def text;
  v_leak text;
  v_msgs text[] := '{}';
  v_anon_ok text[] := array[
    'get_quotation', 'mark_quotation_viewed', 'approve_quotation',
    'start_intake', 'save_intake_answer', 'get_intake', 'reopen_intake',
    'get_client_portal', 'portal_submit_step',
    'get_onboarding', 'submit_onboarding_full', 'submit_signature',
    'request_spouse_onboarding',
    'get_spouse_onboarding', 'submit_spouse_onboarding',
    'get_release_portal', 'release_portal_set_item', 'release_portal_respond',
    'release_portal_remove_upload', 'release_portal_mark_items',
    -- 165: קישור-משתתף לתנאי-קדם — שדות מפורשים, טוקן לשלב, תפוגה
    'get_participant_form', 'participant_submit_prerequisites'
  ];
begin
  -- 163: הבעלים נגזר מהלקוח, ולא מהסשן
  v_def := pg_get_functiondef('public.ensure_institution_alignment_steps(text,text,boolean)'::regprocedure);
  if v_def not ilike '%v_uid is not null and v_owner <> v_uid%' then
    v_msgs := array_append(v_msgs, 'ensure_institution_alignment_steps: לא הגרסה של 163');
  end if;

  -- 161: אין בליעת חריגות באישור הצעה
  v_def := pg_get_functiondef('public.approve_quotation(text,text,text)'::regprocedure);
  if v_def ilike '%exception when others%' or v_def not ilike '%approval_incomplete%' then
    v_msgs := array_append(v_msgs, 'approve_quotation: לא הגרסה של 161');
  end if;

  -- 163: כתיבות המשנה של ההתקשרות נבדקות
  v_def := pg_get_functiondef('public.create_engagement_for_quotation(text,boolean)'::regprocedure);
  if v_def not ilike '%journey_incomplete%' then
    v_msgs := array_append(v_msgs, 'create_engagement_for_quotation: לא הגרסה של 163');
  end if;

  -- 162: propose מחזירה מזהים
  v_def := pg_get_functiondef('public.propose_tax_facts(text,text,text,jsonb)'::regprocedure);
  if v_def not ilike '%v_rows%' then
    v_msgs := array_append(v_msgs, 'propose_tax_facts: לא הגרסה של 162');
  end if;

  -- 160: anon רק על המשטח הציבורי
  select string_agg(p.proname, ', ') into v_leak
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not (p.proname = any(v_anon_ok));
  if v_leak is not null then
    v_msgs := array_append(v_msgs, 'פונקציות פתוחות ל-anon מחוץ לרשימה: ' || v_leak);
  end if;

  -- 164: הבונה של הדף האישי פנימי בלבד
  if has_function_privilege('authenticated', 'public.build_client_portal(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.build_client_portal(text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, 'build_client_portal פתוחה ל-anon/authenticated');
  end if;

  -- 160: השער לפונקציות חדשות קיים
  if not exists (select 1 from pg_event_trigger where evtname = 'p0_lock_new_functions' and evtenabled <> 'D') then
    v_msgs := array_append(v_msgs, 'event trigger p0_lock_new_functions חסר או מנוטרל');
  end if;

  -- 165: הכותב הקנוני של תנאי-הקדם פנימי בלבד
  if has_function_privilege('authenticated', 'public._apply_prerequisite_values(text,text,jsonb,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public._apply_prerequisite_values(text,text,jsonb,text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, '_apply_prerequisite_values פתוחה ל-anon/authenticated');
  end if;

  if array_length(v_msgs, 1) > 0 then
    raise exception 'domain function invariants violated: %', array_to_string(v_msgs, ' | ');
  end if;
  return 'ok';
end;
$function$;

revoke execute on function public.assert_domain_function_invariants() from public, anon, authenticated;
grant  execute on function public.assert_domain_function_invariants() to authenticated, service_role;

-- ‼ בדיד — נפרד מהיצירה: אם השומר עצמו נכשל, לא רוצים לגלגל אחורה את
-- ה-CREATE OR REPLACE שלו (אז הגרסה הבאה רואה שגיאה ברורה, לא "אין שינוי").
select public.assert_domain_function_invariants();

-- ── 9 · מילוי-לאחור ──────────────────────────────────────────────────────
-- (א) השלמת spouse_email חד-פעמית מנתוני חתימה היסטוריים — רק כשהכתובת
-- הקנונית ריקה ויש ערך יחיד וחד-משמעי; לעולם לא דורס, לעולם לא מנחש.
do $backfill_email_165$
declare
  r record;
  v_emails text[];
begin
  for r in
    select c.id as client_id, c.user_id
    from public.clients c
    where nullif(trim(coalesce(c.spouse_email,'')), '') is null
  loop
    select array_agg(distinct lower(x.e))
      into v_emails
      from public.representation_requests req,
           jsonb_array_elements(coalesce(req.signers,'[]'::jsonb)) sg,
           lateral (select nullif(trim(coalesce(sg->>'email','')), '') as e) x
     where req.linked_client_id = r.client_id
       and sg->>'role' = 'spouse'
       and x.e is not null;

    if coalesce(array_length(v_emails, 1), 0) = 1 then
      update public.clients set spouse_email = v_emails[1], updated_at = now() where id = r.client_id;
      insert into public.tax_fact_changes
        (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
      values
        (r.user_id, r.client_id, 'spouseEmail', 'כתובת מייל בן/בת הזוג (השלמה מהיסטוריית חתימה)',
         jsonb_build_object('spouseEmail', null),
         jsonb_build_object('spouseEmail', v_emails[1]),
         'import', 'accepted', r.user_id, now(),
         'מילוי-לאחור 165 — ערך יחיד וחד-משמעי מנתוני חתימה היסטוריים');
    end if;
  end loop;
end
$backfill_email_165$;

-- (ב) סנכרון כל שלב authority_representation פתוח — ממלא payload.prerequisites
-- בפעם הראשונה. אידמפוטנטי: אפס כתיבה בהרצה חוזרת ללא שינוי בכרטיס.
do $backfill_sync_165$
declare
  r record;
begin
  for r in
    select distinct client_id from public.onboarding_steps
    where step_type = 'authority_representation' and status <> 'cancelled'
  loop
    perform public.sync_authority_representation_steps(r.client_id);
  end loop;
end
$backfill_sync_165$;
