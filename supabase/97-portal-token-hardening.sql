-- ─── 97: חיזוק אבטחה לטוקנים ציבוריים רחבי-לקוח ────────────────────────────
-- מקור: מזכר האבטחה של איחוד "תהליך/בקשות/דף לקוח". שני טוקנים רחבי-לקוח
-- (portal_token, intake_token) חסרו כל מנגנון ביטול או תפוגה — קישור שדלף
-- היה גישה קבועה. שני הטוקנים האחרים (quotation.public_token עם expires_at,
-- signers[].signToken עם signStatus) כבר תקינים ולא נגעתי בהם.
--
-- ‼ החלטה מכוונת: אין תפוגה כפויה כברירת מחדל. portal_token הוא נקודת הכניסה
-- הקבועה של הלקוח למשך כל הקשר — קישור שפג כל כמה חודשים הופך שימוש יומיומי
-- לתסכול. במקום זאת: (א) עמודות expires_at מוכנות לשימוש עתידי אם המשרד ירצה
-- להפעיל מדיניות, (ב) last_used_at לצפייה, (ג) רוטציה יזומה — הביטול האמיתי.
-- intake_token מקבל אותו טיפול: הוא משמש שוב ושוב ל"עדכון סטטוס מיסויי"
-- לאורך כל הקשר, לא רק בקליטה — תפוגה קצרה הייתה שוברת שימוש חוזר לגיטימי.

alter table public.clients
  add column if not exists portal_token_expires_at timestamptz,
  add column if not exists portal_token_last_used_at timestamptz,
  add column if not exists intake_token_expires_at timestamptz,
  add column if not exists intake_token_last_used_at timestamptz;

-- ── 1. רוטציה יזומה של קישור הלקוח — הביטול האמיתי ──────────────────────────
-- הקישור הישן מפסיק לעבוד באותו רגע (ההשוואה היא שוויון מדויק על העמודה).
create or replace function public.rotate_portal_token(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.clients
     set portal_token = v_token,
         portal_token_expires_at = null,
         portal_token_last_used_at = null
   where id = p_client_id and user_id = v_uid;
  return v_token;
end;
$function$;

revoke all on function public.rotate_portal_token(text) from public, anon;
grant execute on function public.rotate_portal_token(text) to authenticated;

-- ── 2. get_client_portal — בדיקת תפוגה (כברירת מחדל תמיד null) + מגע שימוש ──
create or replace function public.get_client_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.clients%rowtype;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if c.portal_token_expires_at is not null and c.portal_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.clients set portal_token_last_used_at = now() where id = c.id;
  return public.build_client_portal(c.id, 'live');
end;
$function$;

-- ── 3. portal_submit_step — אותה בדיקת תפוגה בנתיב הכתיבה ──────────────────
create or replace function public.portal_submit_step(p_token text, p_step_id text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if c.portal_token_expires_at is not null and c.portal_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.clients set portal_token_last_used_at = now() where id = c.id;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if s.step_type not in ('prev_accountant_details', 'custom_request') then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;

  v_client_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');

  if s.step_type = 'custom_request' then
    v_key := nullif(trim(coalesce(p_data->>'key','')), '');
    if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
    v_val := nullif(trim(coalesce(p_data->>'value','')), '');

    v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
    select x into v_req from jsonb_array_elements(v_reqs) x where x->>'key' = v_key limit 1;
    if v_req is null then return jsonb_build_object('ok', false, 'error', 'requirement_not_found'); end if;

    v_kind := coalesce(v_req->>'kind', '');
    if v_kind in ('file','files') then
      return jsonb_build_object('ok', false, 'error', 'file_via_upload');
    end if;
    if v_kind not in ('confirm','text','email','phone','number','date','select') then
      return jsonb_build_object('ok', false, 'error', 'requirement_not_found');
    end if;

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
      perform public.queue_accountant_notification(
        s.user_id, 'client_request_completed', c.id, s.id, null, null,
        jsonb_build_object(
          'clientName', v_client_name,
          'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד'),
          'lastItem', coalesce(v_label, v_key)));
    end if;

    return jsonb_build_object('ok', true, 'remaining', v_open, 'completed', v_open = 0);
  end if;

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

-- ── 4. resolve_intake_token — אותה בדיקת תפוגה, רק על ענף clients.intake_token ──
-- ‼ הענף השני (representation_requests.onboarding_token) אינו טוקן רחב-לקוח
-- ואינו נוגע לחיזוק הזה — לא השתנה.
create or replace function public.resolve_intake_token(p_token text)
returns table(user_id uuid, client_id text, client_name text, identified boolean)
language sql
security definer
set search_path to 'public'
as $function$
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

-- ── 5. start_intake — מגע שימוש. no-op אם הטוקן הגיע מבקשת ייצוג ולא מהכרטיס ──
create or replace function public.start_intake(p_token text)
returns table(session_id uuid, tax_year integer, model jsonb, current_question_id text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  s public.annual_report_sessions%rowtype;
  v_year int := extract(year from now())::int - 1;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then
    raise exception 'invalid token';
  end if;

  update public.clients set intake_token_last_used_at = now()
   where id = t.client_id and intake_token = p_token;

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
$function$;
