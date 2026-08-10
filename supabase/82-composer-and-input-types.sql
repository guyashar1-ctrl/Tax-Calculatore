-- 82 — הקומפוזר ודרישות v2: סוגי קלט מלאים, חובה/רשות, בעלים, ועריכה
--
-- שחרור משולב 6+7 של מרכז התיק (אישור גיא 2026-08-10):
-- 1. דרישה בבקשה יכולה להיות: confirm / text / email / phone / number / date /
--    select (עם options) / file / files (עם maxFiles) — ולכל אחת דגל required.
--    ‼ אלה שדות בתוך בקשה אחת, לא משימות נפרדות.
-- 2. השלמה נקבעת לפי דרישות **חובה** בלבד: רשות לעולם לא חוסמת, ותלויות
--    נפתחות ברגע שכל החובה הושלמו (הכרעת Correction 3).
-- 3. create_onboarding_request מקבלת p_owner (client/me/external) + p_stage_id.
--    משימת "אני" מותרת בלי דרישות; משימת גורם חיצוני נושאת payload.externalParty.
--    ‼ מוכנות פרטי הקשר של הגורם היא דרישת-מערכת שנגזרת בזמן אמת — לא תלות
--    שאפשר להסיר (הכרעת Correction 1). היא איננה מיוצגת כקשת תלות.
-- 4. update_onboarding_request — עריכת בקשה קיימת: טיוטה נערכת במקום; בקשה
--    שפורסמה נערכת אל draft_payload והלקוח רואה את הישן עד "עדכן את דף הלקוח".
-- 5. ball מקבל ערך 'external' — "אצל גורם חיצוני" שאינו הרו"ח הקודם.
--
-- ההגדרות שנדרסו שמורות ב-supabase/live-2026-08-09/ (+מיגרציות 77/81 בריפו).

-- ── 1. ball: ערך חדש 'external' ──────────────────────────────────────────────

alter table public.onboarding_steps drop constraint if exists onboarding_steps_ball_check;
alter table public.onboarding_steps add constraint onboarding_steps_ball_check
  check (ball in ('me','client','authority','prev_accountant','system','external'));

-- ── 2. אימות מבנה הדרישות ────────────────────────────────────────────────────

create or replace function public.validate_requirements(p_reqs jsonb)
returns text
language plpgsql
immutable
as $function$
declare x jsonb;
begin
  if p_reqs is null or jsonb_typeof(p_reqs) <> 'array' or jsonb_array_length(p_reqs) = 0 then
    return 'no_requirements';
  end if;
  for x in select * from jsonb_array_elements(p_reqs) loop
    if coalesce(x->>'kind','') not in
       ('confirm','text','email','phone','number','date','select','file','files') then
      return 'bad_requirement_kind';
    end if;
    if nullif(trim(coalesce(x->>'label','')), '') is null then
      return 'missing_requirement_label';
    end if;
    if x->>'kind' = 'select'
       and coalesce(jsonb_array_length(x->'options'), 0) < 2 then
      return 'select_needs_options';
    end if;
  end loop;
  return null;
end;
$function$;

revoke all on function public.validate_requirements(jsonb) from public, anon;

-- ── 3. create_onboarding_request — בעלים + שלב-על ────────────────────────────
-- ‼ DROP לפני יצירה בחתימה רחבה יותר — אחרת נוצר overload כפול (לקח ממיגרציה 68).

drop function if exists public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean);

create function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null,
  p_depends_on text default null,
  p_published boolean default true,
  p_required_for_close boolean default true,
  p_owner text default null,
  p_stage_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_eng  text;
  v_id   text;
  v_ball text;
  v_next int;
  v_dep  public.onboarding_steps%rowtype;
  v_status text := 'pending';
  v_err  text;
  v_ext_kind text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- רשימה סגורה. שלב הייצוג לא נוצר ידנית — הוא מסונכרן מבקשת הייצוג.
  if p_step_type not in ('client_documents','prev_accountant_details','custom_request',
                         'paperless_invite','paperless_connection','retainer_authorization',
                         'release_letter','materials_received','file_opening',
                         'intake_questionnaire','kyc_identification','internal_setup') then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;

  if p_owner is not null and p_owner not in ('client','me','external') then
    return jsonb_build_object('ok', false, 'error', 'bad_owner');
  end if;

  if p_owner = 'external' then
    v_ext_kind := coalesce(p_payload->'externalParty'->>'kind', '');
    if v_ext_kind not in ('prev_accountant','other') then
      return jsonb_build_object('ok', false, 'error', 'missing_external_party');
    end if;
  end if;

  -- דרישות: לבקשת-לקוח חופשית הן חובה ומאומתות; משימת אני/גורם — רשות,
  -- אבל אם סופקו הן חייבות להיות תקינות.
  if p_step_type = 'custom_request' then
    if coalesce(p_owner, 'client') = 'client' then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    elsif p_payload ? 'requirements'
          and coalesce(jsonb_array_length(p_payload->'requirements'), 0) > 0 then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    end if;
  end if;

  if p_stage_id is not null then
    if not exists (select 1 from public.journey_stages js
                    where js.id = p_stage_id and js.client_id = c.id) then
      return jsonb_build_object('ok', false, 'error', 'stage_not_found');
    end if;
  end if;

  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  end if;

  v_ball := case
    when p_owner = 'me' then 'me'
    when p_owner = 'client' then 'client'
    when p_owner = 'external' then
      case when v_ext_kind = 'prev_accountant' then 'prev_accountant' else 'external' end
    when p_step_type in ('client_documents','prev_accountant_details','custom_request')
      then 'client'
    else 'me'
  end;

  if p_depends_on is not null then
    select * into v_dep from public.onboarding_steps where id = p_depends_on and client_id = c.id;
    if v_dep.id is null then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;
    -- תלות שכבר הושלמה אינה נועלת — אחרת השלב נולד נעול לנצח.
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
     depends_on_step_id, due_date, sort_order, payload, required_for_close,
     published_at, stage_id)
  values
    (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
     v_status, v_ball, p_depends_on, p_due_date, v_next,
     coalesce(p_payload, '{}'::jsonb)
       || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end,
     coalesce(p_required_for_close, true),
     case when p_published then now() else null end,
     p_stage_id)
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה' else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'owner', coalesce(p_owner, 'client'),
                       'requiredForClose', coalesce(p_required_for_close, true)));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status);
end;
$function$;

revoke all on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) from public, anon;
grant execute on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) to authenticated;

-- ── 4. update_onboarding_request — עריכה מודעת-טיוטה ─────────────────────────

create or replace function public.update_onboarding_request(
  p_step_id text,
  p_payload jsonb,
  p_due_date date default null,
  p_apply_due boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- עריכת תוכן קיימת רק לבקשות שנבנות בקומפוזר; הכרטיסים הייעודיים מנוהלים במסכיהם.
  if s.step_type not in ('custom_request','client_documents') then
    return jsonb_build_object('ok', false, 'error', 'not_editable');
  end if;

  -- ניקוי מפתחות מוגנים — עורך התוכן לא נוגע בהם (אותה רשימה כמו שמירת תבנית).
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
    -- טיוטה: נערכת במקום. merge_step_draft שומר על מצב פריטים אם כבר קיים.
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, v_content),
           due_date = case when p_apply_due then p_due_date else due_date end
     where id = s.id;
  else
    -- פורסמה: העריכה ממתינה ב-draft_payload; הלקוח רואה את הישן עד הפרסום.
    update public.onboarding_steps
       set draft_payload = v_content,
           due_date = case when p_apply_due then p_due_date else due_date end
     where id = s.id;
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when s.published_at is null then 'הבקשה נערכה (טיוטה)' else 'הבקשה נערכה — ממתין לפרסום' end,
    jsonb_build_object('pendingEdit', s.published_at is not null));

  return jsonb_build_object('ok', true, 'pendingEdit', s.published_at is not null);
end;
$function$;

revoke all on function public.update_onboarding_request(text, jsonb, date, boolean) from public, anon;
grant execute on function public.update_onboarding_request(text, jsonb, date, boolean) to authenticated;

-- ── 5. portal_submit_step — סוגי קלט מלאים + השלמה לפי חובה בלבד ─────────────

CREATE OR REPLACE FUNCTION public.portal_submit_step(p_token text, p_step_id text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  s      public.onboarding_steps%rowtype;
  v_name  text;
  v_email text;
  v_phone text;
  v_key   text;
  v_val   text;
  v_kind  text;
  v_req   jsonb;
  v_reqs  jsonb;
  v_open  int;
  v_label text;
  v_client_name text;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  -- בקשה שהרו"ח עוד לא פתח ללקוח אינה קיימת מבחינתו, גם אם ניחש מזהה.
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  -- רשימה סגורה ומפורשת. כל סוג אחר נסגר רק ביד של הרו"ח.
  if s.step_type not in ('prev_accountant_details', 'custom_request') then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;

  v_client_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');

  -- ── בקשה חופשית: אישור, תשובה מוקלדת, או בחירה ─────────────────────────────
  if s.step_type = 'custom_request' then
    v_key := nullif(trim(coalesce(p_data->>'key','')), '');
    if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
    v_val := nullif(trim(coalesce(p_data->>'value','')), '');

    v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
    select x into v_req from jsonb_array_elements(v_reqs) x where x->>'key' = v_key limit 1;
    if v_req is null then return jsonb_build_object('ok', false, 'error', 'requirement_not_found'); end if;

    v_kind := coalesce(v_req->>'kind', '');
    -- קבצים נסגרים רק דרך פונקציית ההעלאה — לא כאן.
    if v_kind in ('file','files') then
      return jsonb_build_object('ok', false, 'error', 'file_via_upload');
    end if;
    if v_kind not in ('confirm','text','email','phone','number','date','select') then
      return jsonb_build_object('ok', false, 'error', 'requirement_not_found');
    end if;

    -- אימות לפי סוג. confirm אינו צריך ערך; כל השאר כן.
    if v_kind <> 'confirm' and v_val is null then
      return jsonb_build_object('ok', false, 'error', 'missing_value');
    end if;
    if v_kind = 'email' and v_val !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('ok', false, 'error', 'bad_email');
    end if;
    if v_kind = 'phone' and length(regexp_replace(v_val, '\D', '', 'g')) not between 7 and 15 then
      return jsonb_build_object('ok', false, 'error', 'bad_phone');
    end if;
    if v_kind = 'number' and v_val !~ '^-?\d+(\.\d+)?$' then
      return jsonb_build_object('ok', false, 'error', 'bad_number');
    end if;
    if v_kind = 'date' then
      begin
        perform v_val::date;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'bad_date');
      end;
    end if;
    if v_kind = 'select' and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_req->'options','[]'::jsonb)) o
       where o = v_val) then
      return jsonb_build_object('ok', false, 'error', 'bad_choice');
    end if;

    select jsonb_agg(
             case when x->>'key' = v_key
                  then x || jsonb_build_object('done', true)
                         || case when v_val is not null then jsonb_build_object('value', v_val) else '{}'::jsonb end
                         || jsonb_build_object('doneAt', to_jsonb(now()))
                  else x end order by ord)
      into v_reqs
      from jsonb_array_elements(v_reqs) with ordinality t(x, ord);

    -- ‼ ההשלמה נקבעת לפי דרישות חובה בלבד. רשות פתוחה לעולם לא חוסמת,
    -- ותלויות נפתחות ברגע שכל החובה הושלמו (הכרעת גיא, 6+7).
    select count(*) into v_open from jsonb_array_elements(v_reqs) x
      where not coalesce((x->>'done')::boolean, false)
        and coalesce((x->>'required')::boolean, true);

    select x->>'label' into v_label from jsonb_array_elements(v_reqs) x where x->>'key' = v_key;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('requirements', v_reqs),
           status  = case when v_open = 0 then 'completed' else 'waiting_client' end,
           ball    = case when v_open = 0 then 'me' else 'client' end,
           completion_method = case when v_open = 0 then 'system' else completion_method end,
           completed_at = case when v_open = 0 then now() else completed_at end,
           needs_attention = case when v_open = 0 then false else needs_attention end
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
      case when v_open = 0 then 'status_changed' else 'note' end, 'client',
      case when v_open = 0 then 'הלקוח השלים את הבקשה'
           else 'הלקוח השלים: ' || coalesce(v_label, v_key) end,
      jsonb_build_object('key', v_key, 'remaining', v_open));

    if v_open = 0 then
      perform public.unlock_dependent_steps(s.id);
      -- ההתראה נרשמת רק כשהבקשה כולה נסגרה. פריט בודד מתוך חמישה אינו אירוע.
      perform public.queue_accountant_notification(
        s.user_id, 'client_request_completed', c.id, s.id, null, null,
        jsonb_build_object(
          'clientName', v_client_name,
          'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד'),
          'lastItem', coalesce(v_label, v_key)));
    end if;

    return jsonb_build_object('ok', true, 'remaining', v_open, 'completed', v_open = 0);
  end if;

  -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
  v_name  := nullif(trim(coalesce(p_data->>'name','')), '');
  v_email := nullif(trim(coalesce(p_data->>'email','')), '');
  v_phone := nullif(trim(coalesce(p_data->>'phone','')), '');
  if v_name is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'missing_details');
  end if;

  update public.clients
     set prev_accountant_name  = coalesce(prev_accountant_name, v_name),
         prev_accountant_email = coalesce(prev_accountant_email, v_email),
         prev_accountant_phone = coalesce(prev_accountant_phone, v_phone),
         has_previous_accountant = true,
         updated_at = now()
   where id = c.id;

  update public.onboarding_steps
     set status = 'completed', ball = 'me', completion_method = 'system',
         completed_at = now(), needs_attention = false,
         payload = payload || jsonb_build_object(
           'submittedByClient', true,
           'submitted', jsonb_strip_nulls(jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone)))
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    'הלקוח מסר את פרטי הרו״ח הקודם', jsonb_build_object('to', 'completed'));

  perform public.unlock_dependent_steps(s.id);

  perform public.queue_accountant_notification(
    s.user_id, 'client_request_completed', c.id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
      'lastItem', coalesce(v_name, v_email)));

  return jsonb_build_object('ok', true);
end;
$function$;

-- ── 6. build_client_portal — דרישות מלאות + ספירה לפי חובה (ניתוח עם שומרים) ──

do $mig$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'build_client_portal';

  -- 6א. הספירה בבקשה חופשית — חובה בלבד
  if strpos(def, $s$select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;$s$) = 0 then
    raise exception 'מיגרציה 82: ספירת הדרישות לא נמצאה';
  end if;
  def := replace(def,
    $s$select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;$s$,
    $s$select count(*) filter (where coalesce((x->>'done')::boolean, false)
                               and coalesce((x->>'required')::boolean, true)),
             count(*) filter (where coalesce((x->>'required')::boolean, true))
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;$s$);

  -- 6ב. העלאה אפשרית גם לדרישת 'files'
  if strpos(def, $s$'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' = 'file'),$s$) = 0 then
    raise exception 'מיגרציה 82: תנאי ההעלאה לא נמצא';
  end if;
  def := replace(def,
    $s$'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' = 'file'),$s$,
    $s$'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' in ('file','files')),$s$);

  -- 6ג. פלט הדרישות: required / options / maxFiles / fileCount
  if strpos(def, $s$'requirements', (select jsonb_agg(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'value', x->>'value') order by ord)$s$) = 0 then
    raise exception 'מיגרציה 82: פלט הדרישות לא נמצא';
  end if;
  def := replace(def,
    $s$'requirements', (select jsonb_agg(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'value', x->>'value') order by ord)$s$,
    $s$'requirements', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'required', coalesce((x->>'required')::boolean, true),
                              'options', x->'options',
                              'maxFiles', x->'maxFiles',
                              'fileCount', coalesce(jsonb_array_length(x->'documentIds'),
                                             case when nullif(x->>'documentId','') is not null then 1 else 0 end),
                              'value', x->>'value')) order by ord)$s$);

  execute def;
end $mig$;
