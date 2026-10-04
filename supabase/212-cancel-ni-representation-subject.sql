-- ─── 212: ביטול בקשת ייצוג בביטוח לאומי — לכל אדם, גם האחרון ─────────────────
-- החלטת גיא (1.10.2026). מחליף את הכללים של 200 (drop_authority_representation):
--
--   · לפני שהבקשה נשלחה לאדם (אין instructionsSentAt) — «מחיקה» מהעבודה הפעילה.
--   · אחרי שנשלחה, כל עוד לא סומנה כמאושרת ב-PIVO — «ביטול», רק עם אישור מפורש
--     (p_acknowledge_sent). בלי האישור השרת מחזיר confirm_required ולא נוגע בדבר.
--   · מאושרת ב-PIVO (confirmedAt או שורת תיק active) — לא זמין.
--
-- ‼ גם האדם היחיד/האחרון. 200 חסמה זאת כי targets ריק מתפרש בכל מקום כ-['client']
-- (targetsOf / 157), כך שהסרת האחרון הייתה מחזירה את הלקוח בשקט. מכאן: הרשומה
-- נושאת סמן `cancelled` (תפקיד ⇐ מתי/באיזה שלב), ובנוכחותו רשימת targets היא
-- הקובעת — גם כשהיא ריקה. ni_targets_of() הוא הנרמול היחיד בשרת; targetsOf() בדפדפן
-- עודכן לאותו כלל. רשות שהתרוקנה מקבלת status='none'.
--
-- ‼ מה שלא נוגעים בו: execution.nationalInsurance[Spouse] — אסמכתא, מועד, הוראות
-- וחותמות זמן נשארים כהיסטוריה, ושלב הבקשה נשאר שורה מבוטלת עם אירוע ביומן.
-- ביטול ב-PIVO אינו מבטל דבר בביטוח לאומי.
--
-- ‼ «לא נוצר מחדש כברירת מחדל» — חמש שכבות:
--   1. סמן ה-cancelled + ni_targets_of: ריק נשאר ריק.
--   2. request_authority_representation: מתחילה מהרשימה המנורמלת, ובקשה חוזרת
--      מפורשת היא הדרך היחידה להחזיר אדם (היא גם מוחקת את הסמן שלו).
--   3. טריגר על clients: כתיבה של עותק ישן (לשונית פתוחה, טריגר אחר) שמחזירה
--      אדם מבוטל ל-targets, או מוחקת את הסמן, מתוקנת בשקט — הביטול נשמר.
--   4. טריגר על representation_requests: סימון «אושר» ידני (כתיבה ישירה) לאדם
--      שבוטל נדחה — לא מציגים הצלחה על פעולה שלא בוצעה.
--   5. משימות אוטומציה: ביטול מבטל משימה ממתינה (queued) לאותו אדם באותה
--      טרנזקציה; משימה שרצה/ממתינה לאדם — חוסמת את הביטול; ומשימה חדשה ב"ל
--      לאדם שבוטל נדחית ביצירה.
--   ותזכורות: claim_representation_reminder מסרב לתבוע תזכורת ב"ל לאדם שאינו
--   ברשימה — כך גם גרסת פונקציית התזכורות שכבר פרוסה (שמנרמלת ריק ל-['client'])
--   לא תשלח לאדם שבוטל.
--
-- ‼ סדר נעילה זהה בכל הנתיבים: clients → representation_requests → automation_jobs.

-- ── 1 · הנרמול היחיד בשרת ──────────────────────────────────────────────────
create or replace function public.ni_targets_of(p_rec jsonb)
returns jsonb
language sql
immutable
as $function$
  select case
    when p_rec is null then '[]'::jsonb
    -- ‼ CASE ולא NOT/AND: jsonb_typeof(null) הוא NULL (מלכודת 157).
    when jsonb_typeof(p_rec -> 'targets') = 'array'
         and (jsonb_array_length(p_rec -> 'targets') > 0 or jsonb_typeof(p_rec -> 'cancelled') = 'object')
      then p_rec -> 'targets'
    when coalesce((p_rec ->> 'coversSpouse')::boolean, false) then '["client","spouse"]'::jsonb
    else '["client"]'::jsonb
  end;
$function$;

-- ── 2 · השלב של אדם: לפני שליחה / אחרי שליחה / מאושר ───────────────────────
create or replace function public.ni_subject_stage(p_track jsonb, p_file jsonb)
returns text
language sql
immutable
as $function$
  select case
    when nullif(p_track ->> 'confirmedAt', '') is not null or (p_file ->> 'repStatus') = 'active' then 'approved'
    when nullif(p_track ->> 'instructionsSentAt', '') is not null then 'sent'
    else 'not_sent'
  end;
$function$;

-- ── 3 · הביטול עצמו ───────────────────────────────────────────────────────
create or replace function public.cancel_authority_representation(
  p_client_id text, p_authority text, p_subject_role text, p_acknowledge_sent boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c           public.clients%rowtype;
  req         public.representation_requests%rowtype;
  v_uid       uuid := auth.uid();
  v_track_key text;
  v_track     jsonb;
  v_rec       jsonb;
  v_targets   jsonb;
  v_left      jsonb;
  v_file      jsonb;
  v_stage     text;
  v_all_ok    boolean;
  v_busy      public.automation_jobs%rowtype;
  v_cancelled int := 0;
  s           record;
  v_name      text;
  v_note      text;
  v_marker    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  if p_authority <> 'national_insurance' then
    return jsonb_build_object('ok', false, 'reason', 'bad_authority');
  end if;
  if p_subject_role is null or p_subject_role not in ('client','spouse') then
    return jsonb_build_object('ok', false, 'reason', 'bad_subject_role');
  end if;

  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;

  v_track_key := case when p_subject_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end;

  -- ‼ סדר הנעילה: לקוח → משימות → בקשת הייצוג. דיווח של עובד נועל משימה ואז את
  -- הבקשה (195); כאן ממתינים קודם על המשימה, ולכן תוצאה שנכנסת ברגע הזה נקראת
  -- למטה כראיה — ולא נדרסת.
  perform 1 from public.automation_jobs j
   where j.client_id = c.id
     and j.action_type in ('btl.create_representation', 'btl.check_representation')
     and j.input ->> 'role' = p_subject_role
     and j.status in ('queued', 'running', 'needs_human')
   for update;

  if c.representation_request_id is not null then
    select * into req from public.representation_requests where id = c.representation_request_id for update;
  end if;
  v_track := case when req.id is null then '{}'::jsonb else coalesce(req.execution -> v_track_key, '{}'::jsonb) end;

  v_rec := c.authority_representations -> 'nationalInsurance';
  v_targets := public.ni_targets_of(v_rec);
  if v_rec is null
     or not coalesce((select bool_or(x = p_subject_role) from jsonb_array_elements_text(v_targets) x), false) then
    return jsonb_build_object('ok', false, 'reason', 'not_requested');
  end if;

  select f into v_file from jsonb_array_elements(coalesce(c.tax_files, '[]'::jsonb)) f
    where f->>'authority' = p_authority and f->>'owner' = p_subject_role limit 1;

  -- ‼ ההכרעה נעשית אחרי הנעילה: אישור שהגיע רגע לפני — נראה כאן, והביטול נדחה.
  v_stage := public.ni_subject_stage(v_track, v_file);
  if v_stage = 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'already_active', 'stage', v_stage);
  end if;

  -- ── אוטומציה שרצה או ממתינה לאדם — חוסמת; ממתינה בתור — תבוטל למטה ────────
  -- ‼ גם ריצה שהחכירה שלה פגה: פעולה מול ב"ל שאולי כבר בוצעה. מנקה המשימות
  -- (183) מכריע אותה תוך דקות; עד אז — לא מבטלים בעיוורון.
  select * into v_busy from public.automation_jobs j
   where j.client_id = c.id
     and j.action_type in ('btl.create_representation', 'btl.check_representation')
     and j.input ->> 'role' = p_subject_role
     and j.status in ('running', 'needs_human')
   order by j.created_at desc
   limit 1;
  if v_busy.id is not null then
    return jsonb_build_object('ok', false, 'reason', 'automation_running', 'stage', v_stage,
      'jobId', v_busy.id, 'actionType', v_busy.action_type, 'jobStatus', v_busy.status);
  end if;

  if v_stage = 'sent' and not coalesce(p_acknowledge_sent, false) then
    return jsonb_build_object('ok', false, 'reason', 'confirm_required', 'stage', v_stage,
      'instructionsSentAt', v_track ->> 'instructionsSentAt');
  end if;

  update public.automation_jobs j
     set status = 'cancelled', finished_at = now(),
         error_code = 'subject_cancelled',
         error_detail = 'בקשת הייצוג בביטוח לאומי לאדם הזה בוטלה ב-PIVO לפני שהפעולה רצה.'
   where j.client_id = c.id
     and j.action_type in ('btl.create_representation', 'btl.check_representation')
     and j.input ->> 'role' = p_subject_role
     and j.status = 'queued';
  get diagnostics v_cancelled = row_count;

  -- ── הרשומה: האדם יוצא, הסמן נכנס, ורשות ריקה נסגרת ────────────────────────
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_left
    from jsonb_array_elements_text(v_targets) x where x <> p_subject_role;

  -- ‼ מי שנשארו כבר אושרו כולם ⇒ הרשות הושלמה (אותו כלל כמו 200 ו-handleSaveExecution).
  if jsonb_array_length(v_left) > 0 then
    select coalesce(bool_and(
             req.id is not null and nullif(req.execution -> (case when x = 'spouse' then 'nationalInsuranceSpouse'
                                                                  else 'nationalInsurance' end) ->> 'confirmedAt', '') is not null),
           false)
      into v_all_ok
      from jsonb_array_elements_text(v_left) x;
  else
    v_all_ok := false;
  end if;

  v_marker := coalesce(case when jsonb_typeof(v_rec -> 'cancelled') = 'object' then v_rec -> 'cancelled' end, '{}'::jsonb)
              || jsonb_build_object(p_subject_role, jsonb_build_object(
                   'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                   'stage', v_stage,
                   'by', v_uid));

  update public.clients
     set authority_representations = jsonb_set(
           authority_representations, '{nationalInsurance}',
           ((v_rec - 'coversSpouse')
              || jsonb_build_object('targets', v_left, 'cancelled', v_marker)
              || (case when jsonb_array_length(v_left) = 0 then jsonb_build_object('status', 'none')
                       when v_all_ok then jsonb_build_object('status', 'active')
                       else '{}'::jsonb end))),
         tax_files = case
           when (v_file->>'repStatus') = 'pending' then (
             select jsonb_agg(case when f->>'authority' = p_authority and f->>'owner' = p_subject_role
                                   then f || jsonb_build_object('repStatus', 'none') else f end)
               from jsonb_array_elements(c.tax_files) f)
           else tax_files end,
         updated_at = now()
   where id = c.id;

  -- ── שלב הבקשה: מבוטל, עם אירוע שאומר מה בדיוק קרה ────────────────────────
  v_name := case when p_subject_role = 'spouse'
    then coalesce(nullif(trim(coalesce(c.spouse_first_name,'') || ' ' || coalesce(c.spouse_last_name,'')), ''),
                  nullif(trim(coalesce(c.spouse_name,'')), ''), 'בן/בת הזוג')
    else coalesce(nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), 'הלקוח') end;
  v_note := case when v_stage = 'sent'
    then 'בקשת הייצוג בביטוח לאומי עבור ' || v_name || ' בוטלה אחרי שנשלחה. ביטול ב-PIVO אינו מבטל את הבקשה בביטוח לאומי.'
    else 'בקשת הייצוג בביטוח לאומי עבור ' || v_name || ' נמחקה מהעבודה הפעילה לפני שנשלחה.' end
    || case when nullif(v_track ->> 'referenceNumber', '') is not null
            then ' האסמכתא (' || (v_track ->> 'referenceNumber') || ') נשמרה.' else '' end;

  for s in
    select * from public.onboarding_steps
     where client_id = c.id and step_type = 'authority_representation'
       and payload->>'authority' = p_authority and payload->>'subjectRole' = p_subject_role
       and status not in ('completed','verified','skipped','cancelled')
  loop
    update public.onboarding_steps
       set status = 'cancelled', needs_attention = false, updated_at = now(),
           -- ‼ צילום של מה שהיה ברגע הביטול: אם תיפתח בקשה חדשה לאותו אדם, המסלול
           -- ב-execution ימשיך ממנו — וההיסטוריה של הבקשה הזאת לא תיעלם.
           payload = payload || jsonb_build_object('cancelled', jsonb_strip_nulls(jsonb_build_object(
             'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'stage', v_stage,
             'referenceNumber', nullif(v_track ->> 'referenceNumber', ''),
             'deadline', nullif(v_track ->> 'deadline', ''),
             'instructionsSentAt', nullif(v_track ->> 'instructionsSentAt', ''))))
     where id = s.id;
    -- קישור השלמת פרטים שנשלח לאדם על הבקשה הזאת — כבר לא מוביל לשום דבר.
    update public.request_participant_links
       set revoked_at = now()
     where step_id = s.id and submitted_at is null and revoked_at is null;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      v_note,
      jsonb_build_object('from', s.status, 'to', 'cancelled',
        'reason', case when v_stage = 'sent' then 'cancelled_after_sent' else 'deleted_before_sent' end,
        'subjectRole', p_subject_role, 'cancelledJobs', v_cancelled));
  end loop;

  return jsonb_build_object('ok', true, 'stage', v_stage, 'completed', v_all_ok,
    'emptied', jsonb_array_length(v_left) = 0, 'cancelledJobs', v_cancelled);
end;
$function$;

revoke all on function public.cancel_authority_representation(text, text, text, boolean) from public, anon;
grant execute on function public.cancel_authority_representation(text, text, text, boolean) to authenticated;

-- ‼ השם הישן (200) נשאר לתאימות עם אתר שעוד לא עודכן: אותם כללים, בלי אישור
-- מפורש — כלומר אחרי שליחה הוא מחזיר confirm_required ולא מבטל בשקט.
create or replace function public.drop_authority_representation(
  p_client_id text, p_authority text, p_subject_role text
) returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select public.cancel_authority_representation(p_client_id, p_authority, p_subject_role, false);
$function$;

revoke all on function public.drop_authority_representation(text, text, text) from public, anon;
grant execute on function public.drop_authority_representation(text, text, text) to authenticated;

-- ── 4 · בקשה חוזרת: מהרשימה המנורמלת, ומוחקת את הסמן של מי שחוזר ─────────────
-- הזרקה מעוגנת לגוף החי (כמו 146/151/157), עם אימות שכל עוגן יחיד.
do $do$
declare
  v_def text;
  v_new text;
  v_a1 constant text := $a1$  if (case when jsonb_typeof(v_rec->'targets') = 'array'
           then jsonb_array_length(v_rec->'targets') else 0 end) > 0 then
    v_targets := v_rec->'targets';
  elsif coalesce((v_rec->>'coversSpouse')::boolean, false) then
    v_targets := '["client","spouse"]'::jsonb;
  else
    v_targets := '["client"]'::jsonb;
  end if;$a1$;
  v_r1 constant text := $r1$  -- 212: נרמול אחד בשרת. רשומה שבוטל בה אדם (סמן cancelled) — הרשימה
  -- קובעת גם כשהיא ריקה; בלי רשומה בכלל — ['client'] כמו קודם.
  v_targets := case when v_rec is null then '["client"]'::jsonb else public.ni_targets_of(v_rec) end;
  -- ‼ זו הבקשה המפורשת היחידה שמחזירה אדם מבוטל; הסמן שלו יוצא, ושומר הכתיבה
  -- (212 §5) יודע שהחזרה הזאת מכוונת.
  perform set_config('pivo.ni_rerequest', p_subject_role, true);$r1$;
  v_a2 constant text := $a2$           coalesce(v_rec, '{}'::jsonb)
             || jsonb_build_object('status', coalesce(v_rec->>'status', 'in_process'), 'targets', v_targets)),$a2$;
  v_r2 constant text := $r2$           (coalesce(v_rec, '{}'::jsonb)
             || jsonb_build_object('status', case when coalesce(v_rec->>'status', 'none') in ('none') then 'in_process'
                                                  else coalesce(v_rec->>'status', 'in_process') end,
                                   'targets', v_targets))
             #- array['cancelled', p_subject_role]),$r2$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_authority_representation';
  if v_def is null then raise exception '212: request_authority_representation לא נמצאה'; end if;

  if position('pivo.ni_rerequest' in v_def) > 0 then
    raise notice '212: request_authority_representation כבר מעודכנת, מדלג';
  else
    if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
      raise exception '212: עוגן הנרמול ב-request_authority_representation אינו יחיד';
    end if;
    if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
      raise exception '212: עוגן הכתיבה ב-request_authority_representation אינו יחיד';
    end if;
    v_new := replace(replace(v_def, v_a1, v_r1), v_a2, v_r2);
    execute v_new;
  end if;
end;
$do$;

-- ── 5 · שומר: אדם מבוטל לא חוזר דרך כתיבה של עותק ישן ───────────────────────
create or replace function public.guard_ni_cancelled_subjects()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old       jsonb := old.authority_representations -> 'nationalInsurance';
  v_new       jsonb := new.authority_representations -> 'nationalInsurance';
  v_old_c     jsonb;
  v_new_c     jsonb;
  v_allow     text := nullif(current_setting('pivo.ni_rerequest', true), '');
  v_keep      jsonb;
  v_targets   jsonb;
  r           text;
begin
  v_old_c := case when jsonb_typeof(v_old -> 'cancelled') = 'object' then v_old -> 'cancelled' end;
  if v_old_c is null then return new; end if;

  -- הסמנים שנשמרים: כל מה שהיה, פחות מי שחוזר עכשיו בבקשה מפורשת, ועוד מה שנוסף.
  v_new_c := case when jsonb_typeof(v_new -> 'cancelled') = 'object' then v_new -> 'cancelled' else '{}'::jsonb end;
  v_keep := (v_old_c - coalesce(v_allow, '')) || v_new_c;
  if v_allow is not null then v_keep := v_keep - v_allow; end if;
  if v_keep = '{}'::jsonb and v_new_c = '{}'::jsonb and v_allow is not null then
    -- חזרה מפורשת של האדם המבוטל היחיד — אין מה לשמור.
    return new;
  end if;

  if v_new is null then
    -- הרשומה כולה נמחקה (הסרת רשות לפני שליחה, 208) — לגיטימי, ההיסטוריה בשלבים.
    return new;
  end if;

  -- targets בלי המבוטלים שעדיין מבוטלים. כתיבה שהשמיטה את הרשימה כולה אינה
  -- טענה ש«אין אף אחד» — נשארים עם הרשימה הקודמת.
  v_targets := case when jsonb_typeof(v_new -> 'targets') = 'array' then v_new -> 'targets'
                    else public.ni_targets_of(v_old) end;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_targets
    from jsonb_array_elements_text(v_targets) x
   where not (v_keep ? x);

  new.authority_representations := jsonb_set(new.authority_representations, '{nationalInsurance}',
    (v_new - 'coversSpouse') || jsonb_build_object('targets', v_targets, 'cancelled', v_keep)
      || case when jsonb_array_length(v_targets) = 0 then jsonb_build_object('status', 'none') else '{}'::jsonb end);

  -- שורת תיק «בתהליך» של מבוטל חוזרת ל-none (אישור אמיתי — active — לא נוגעים).
  if new.tax_files is not null and jsonb_typeof(new.tax_files) = 'array' then
    for r in select jsonb_object_keys(v_keep) loop
      new.tax_files := (select jsonb_agg(case when f->>'authority' = 'national_insurance' and f->>'owner' = r
                                                   and f->>'repStatus' = 'pending'
                                              then f || jsonb_build_object('repStatus', 'none') else f end)
                          from jsonb_array_elements(new.tax_files) f);
    end loop;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_ni_cancelled_subjects() from public, anon, authenticated;

drop trigger if exists clients_guard_ni_cancelled on public.clients;
create trigger clients_guard_ni_cancelled
  before update of authority_representations, tax_files on public.clients
  for each row execute function public.guard_ni_cancelled_subjects();

-- ── 6 · שומר: «אושר» ידני לאדם שבוטל — נדחה בגלוי ─────────────────────────────
create or replace function public.guard_ni_confirm_after_cancel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rec  jsonb;
  r      text;
  v_key  text;
begin
  -- ‼ רק כתיבה ישירה (דפדפן). עדכון שמגיע מטריגר — תוצאת בדיקה מביטוח לאומי
  -- (195) — הוא ראיה מהרשות, ואין להפיל בגללו את דיווח העובד.
  if pg_trigger_depth() > 1 or new.linked_client_id is null then return new; end if;
  select authority_representations -> 'nationalInsurance' into v_rec
    from public.clients where id = new.linked_client_id;
  if jsonb_typeof(v_rec -> 'cancelled') is distinct from 'object' then return new; end if;
  for r in select jsonb_object_keys(v_rec -> 'cancelled') loop
    v_key := case when r = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end;
    if nullif(new.execution -> v_key ->> 'confirmedAt', '') is not null
       and nullif(old.execution -> v_key ->> 'confirmedAt', '') is null
       and not coalesce((select bool_or(x = r) from jsonb_array_elements_text(public.ni_targets_of(v_rec)) x), false) then
      raise exception using
        errcode = 'P0001',
        message = 'ni_subject_cancelled',
        detail = 'בקשת הייצוג בביטוח לאומי לאדם הזה בוטלה — אי אפשר לסמן אותה כמאושרת. כדי לחזור אליה צריך לבקש ייצוג מחדש.',
        hint = r;
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.guard_ni_confirm_after_cancel() from public, anon, authenticated;

drop trigger if exists rep_requests_guard_ni_cancelled on public.representation_requests;
create trigger rep_requests_guard_ni_cancelled
  before update of execution on public.representation_requests
  for each row execute function public.guard_ni_confirm_after_cancel();

-- ── 7 · משימה חדשה בב"ל לאדם שבוטל — נדחית ביצירה ─────────────────────────────
create or replace function public.guard_btl_job_for_cancelled_subject()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rec  jsonb;
  v_role text := new.input ->> 'role';
begin
  if new.action_type not in ('btl.create_representation', 'btl.check_representation') or v_role is null then
    return new;
  end if;
  -- ‼ for share: ביטול שנמצא באמצע (מחזיק את הלקוח) — ממתינים לו וקוראים את
  -- התוצאה שלו, כדי שמשימה לא תיוולד ברגע שבין הבדיקה להתחייבות.
  select authority_representations -> 'nationalInsurance' into v_rec
    from public.clients where id = new.client_id for share;
  if jsonb_typeof(v_rec -> 'cancelled') = 'object' and (v_rec -> 'cancelled') ? v_role
     and not coalesce((select bool_or(x = v_role) from jsonb_array_elements_text(public.ni_targets_of(v_rec)) x), false) then
    raise exception using
      errcode = 'P0001',
      message = 'ni_subject_cancelled',
      detail = 'בקשת הייצוג בביטוח לאומי לאדם הזה בוטלה — אין פעולה לבצע מולו.',
      hint = v_role;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_btl_job_for_cancelled_subject() from public, anon, authenticated;

drop trigger if exists automation_jobs_guard_ni_cancelled on public.automation_jobs;
create trigger automation_jobs_guard_ni_cancelled
  before insert on public.automation_jobs
  for each row execute function public.guard_btl_job_for_cancelled_subject();

-- ── 8 · תזכורות: תביעה לאדם שאינו ברשימה — נדחית ─────────────────────────────
-- ‼ פונקציית התזכורות הפרוסה מנרמלת targets ריק ל-['client'] בעצמה. השער כאן,
-- בשרת, הוא שמבטיח שגם היא לא תשלח לאדם שבוטל — עד שתיפרס הגרסה המתוקנת.
create or replace function public.claim_representation_reminder(
  p_request_id text, p_audience text, p_expected_count int
) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare
  v_rows int;
  v_role text;
  v_rec  jsonb;
begin
  if p_audience not in ('sign', 'niClient', 'niSpouse') then
    raise exception 'invalid audience: %', p_audience;
  end if;

  if p_audience in ('niClient', 'niSpouse') then
    v_role := case when p_audience = 'niSpouse' then 'spouse' else 'client' end;
    select c.authority_representations -> 'nationalInsurance' into v_rec
      from public.representation_requests r join public.clients c on c.id = r.linked_client_id
     where r.id = p_request_id;
    if not coalesce((select bool_or(x = v_role) from jsonb_array_elements_text(public.ni_targets_of(v_rec)) x), false) then
      return false;
    end if;
  end if;

  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb) || jsonb_build_object(
           'reminders', coalesce(execution -> 'reminders', '{}'::jsonb) || jsonb_build_object(
             p_audience, jsonb_build_object('count', p_expected_count + 1, 'lastSentAt', now())
           )
         ),
         updated_at = now()
   where id = p_request_id
     and coalesce((execution -> 'reminders' -> p_audience ->> 'count')::int, 0) = p_expected_count;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.claim_representation_reminder(text, text, int) from public, anon, authenticated;
grant execute on function public.claim_representation_reminder(text, text, int) to service_role;

-- ── 9 · ביטול דרך «בטל» הכללי של שלב — מופנה לנתיב הנכון ──────────────────────
-- ‼ advance_onboarding_step('cancel') על שלב ייצוג-לאדם ביטל עד היום רק את השורה:
-- האדם נשאר ברשימה, התזכורות המשיכו ותיק המס הציג «בתהליך». עכשיו — דחייה.
do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := $anchor$  if s.step_type = 'authority_representation' and p_action not in ('cancel','note','set_due') then$anchor$;
  v_branch constant text := $branch$  -- 212: ביטול בקשת ייצוג לאדם עובר רק דרך cancel_authority_representation.
  if s.step_type = 'authority_representation' and p_action = 'cancel' then
    return jsonb_build_object('ok', false, 'error', 'use_representation_cancel',
      'message', 'ביטול בקשת ייצוג נעשה מכרטיס הבקשה («ביטול הבקשה»), כדי שהייצוג, התזכורות ותיק המס יתעדכנו יחד.');
  end if;

$branch$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'advance_onboarding_step';
  if v_def is null then raise exception '212: advance_onboarding_step לא נמצאה'; end if;

  if position('use_representation_cancel' in v_def) > 0 then
    raise notice '212: advance_onboarding_step כבר מעודכנת, מדלג';
  else
    if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '212: העוגן ב-advance_onboarding_step אינו יחיד';
    end if;
    v_new := replace(v_def, v_anchor, v_branch || v_anchor);
    execute v_new;
  end if;
end;
$do$;

-- ── 9b · טופס הזיהוי של הלקוח: «כולל ביטוח לאומי» לפי מי שבאמת ברשימה ──────────
-- ‼ עד היום — עצם קיום הרשומה. רשומה שכל האנשים בה בוטלו נשארת (סמן + היסטוריה),
-- ולכן בלי התיקון הלקוח היה ממשיך להתבקש לפרטי ביטוח לאומי.
do $do$
declare
  v_def text;
  v_anchor constant text := $a$coalesce(c.authority_representations ? 'nationalInsurance', false) as ni_included$a$;
  v_repl   constant text := $r$(jsonb_array_length(public.ni_targets_of(c.authority_representations -> 'nationalInsurance')) > 0) as ni_included$r$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_onboarding';
  if v_def is null then raise exception '212: get_onboarding לא נמצאה'; end if;
  if position('ni_targets_of' in v_def) > 0 then
    raise notice '212: get_onboarding כבר מעודכנת, מדלג';
  else
    if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '212: העוגן ni_included ב-get_onboarding אינו יחיד';
    end if;
    execute replace(v_def, v_anchor, v_repl);
  end if;
end;
$do$;

-- ── 10 · בדיקות שפיות ─────────────────────────────────────────────────────────
do $$
begin
  if public.ni_targets_of(null) <> '[]'::jsonb
     or public.ni_targets_of('{}'::jsonb) <> '["client"]'::jsonb
     or public.ni_targets_of('{"targets":[]}'::jsonb) <> '["client"]'::jsonb
     or public.ni_targets_of('{"targets":[],"cancelled":{"client":{}}}'::jsonb) <> '[]'::jsonb
     or public.ni_targets_of('{"coversSpouse":true}'::jsonb) <> '["client","spouse"]'::jsonb
     or public.ni_targets_of('{"targets":["spouse"]}'::jsonb) <> '["spouse"]'::jsonb then
    raise exception '212: ni_targets_of אינה מחזירה את הצפוי';
  end if;
  if has_function_privilege('anon', 'public.cancel_authority_representation(text,text,text,boolean)', 'EXECUTE') then
    raise exception '212: cancel_authority_representation נחשפה ל-anon';
  end if;
end;
$$;
