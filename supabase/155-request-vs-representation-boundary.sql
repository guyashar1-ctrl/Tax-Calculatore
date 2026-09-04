-- ─── 155 · הגבול בין מחזור חיי הבקשה למחזור חיי הייצוג ──────────────────────
--
-- הכרעות המוצר שמאחורי המיגרציה (גיא, 2026-09-04):
--   1. מחזור חיי הבקשה עצמאי ממחזור חיי הייצוג. יצירה/עריכה/השלמה/פתיחה מחדש
--      של בקשה אינה משנה את מצב הייצוג של הלקוח, לעולם.
--   2. לקוח שהפך למיוצג נשאר מיוצג עד שייבנה מסלול ביטול ייצוג מפורש. אין
--      חזרה אוטומטית ל"טרם מיוצג" בגלל בקשה.
--   3. ייצוג של אדם/רשות נוספים (בן/בת זוג בב"ל) הוא בקשה רגילה, ואינו נוגע
--      במצב הייצוג של הלקוח הראשי.
--   4. «נדרש לסגירת הקליטה» קיים אך ורק בתוך קליטה אמיתית ופתוחה.
--   5. מצב הייצוג של הלקוח הוא עובדה סמכותית. מצב הבקשה אינו מגדיר אותו מחדש.
--
-- הרקע: docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md. הבדיקה שגילתה את זה —
-- לקוח מיוצג בלי שום engagement, שחלון «+ בקשה» הציע לו לסמן «נדרש לסגירת
-- הקליטה». אין לו קליטה. הדגל נכתב, ואף אחד לא יקרא אותו לעולם.
--
-- ‼ אין כאן שינוי נתונים. שורות היסטוריות שנושאות דגל חסר-משמעות נשארות כפי
--   שהן: הדגל ממילא אינרטי מחוץ לקליטה פתוחה, ואם ללקוח תיפתח קליטה אמיתית
--   בעתיד הן ייקלטו אליה כעבודה פתוחה — וזו התוצאה הנכונה. הדוח בסוף הקובץ
--   מאפשר לראות אותן בכל רגע בלי לגעת בהן.

-- ── 1 · הקשר הקליטה · מקור אחד ─────────────────────────────────────────────
-- שלושה מצבים, ולא שניים:
--   open    — יש engagement במצב 'onboarding'. יש מה לסגור, והדגל משמעותי.
--   pending — אין engagement, אבל הלקוח ליד/בהצעה: הקליטה עוד תיוולד, והשרת
--             ממילא מחזיק את הבקשות עד אישור ההצעה (מיגרציה 135). בקשה
--             שמכינים עכשיו היא בקשת קליטה לכל דבר, ולכן הדגל מותר.
--   none    — כל השאר. מיוצג בלי התקשרות, התקשרות פעילה/שהסתיימה, לקוח ותיק.
--             אין מה לסגור, ולכן אין דגל.
-- ‼ הגבול 'pending' זהה מילה במילה לגבול של מיגרציה 135, בכוונה: אותה שאלה
--   («האם כבר נמכר משהו») שמכריעה אם בקשה מוחזקת מכריעה גם אם היא חוסמת.

create or replace function public.open_intake_engagement_id(p_client_id text)
returns text
language sql stable security definer set search_path to 'public'
as $function$
  select e.id from public.engagements e
   where e.client_id = p_client_id and e.status = 'onboarding'
   order by e.created_at desc
   limit 1;
$function$;

create or replace function public.client_intake_state(p_client_id text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_eng   text;
  v_stage text;
begin
  v_eng := public.open_intake_engagement_id(p_client_id);
  if v_eng is not null then
    return jsonb_build_object('state', 'open', 'engagementId', v_eng);
  end if;
  v_stage := public.derive_lifecycle_stage(p_client_id);
  if v_stage in ('lead', 'quoted') then
    return jsonb_build_object('state', 'pending', 'engagementId', null);
  end if;
  return jsonb_build_object('state', 'none', 'engagementId', null);
end;
$function$;

/** האם מותר לבקשה של הלקוח הזה לשאת «נדרש לסגירת הקליטה». */
create or replace function public.intake_accepts_required(p_client_id text)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select (public.client_intake_state(p_client_id)->>'state') in ('open', 'pending');
$function$;

grant execute on function public.open_intake_engagement_id(text) to authenticated;
grant execute on function public.client_intake_state(text)       to authenticated;
grant execute on function public.intake_accepts_required(text)   to authenticated;

-- ── 2 · יצירת בקשה · הדגל נכפף להקשר ───────────────────────────────────────
-- ‼ הגוף כאן הוא הגוף המלא של הפרודקשן (100 + 130 + 131 + 135), ולא תיקון
--   נקודתי בטקסט. הסיבה: staging ופרודקשן נפרדו (ל-staging חסרה 135), ורק
--   החלפה מלאה מבטיחה ששניהם מסתיימים באותו קוד בדיוק.
-- ‼ הדגל **מוסב** ל-false ולא נדחה: הבקשה עצמה לגיטימית, רק המשמעות שנטענה
--   עליה אינה קיימת. דחייה הייתה חוסמת עבודה אמיתית בגלל תיבת סימון.
--   התשובה מחזירה intakeState ואת הערך שנשמר בפועל, כדי שהמסך לא ינחש.

create or replace function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null::date,
  p_depends_on text default null::text,
  p_published boolean default true,
  p_required_for_close boolean default true,
  p_owner text default null::text,
  p_stage_id text default null::text
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
  v_old  text;
  v_payload jsonb;
  v_hold boolean := false;
  v_stage text;
  v_eng_open text;
  v_intake text;
  v_required boolean;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_step_type not in ('client_documents','prev_accountant_details','custom_request',
                         'paperless_invite','paperless_connection','paperless_tax_authority','rep_client_approval','retainer_authorization',
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

  -- ‼ 155 · הקשר הקליטה. שים לב שזה **אינו** v_eng: שם מחפשים קבוצה לשיוך
  -- השלב (גם התקשרות שהסתיימה משמשת לקיבוץ), וכאן שואלים אם יש קליטה פתוחה
  -- שאפשר בכלל לסגור. שתי שאלות שונות שנראו כאחת.
  v_eng_open := public.open_intake_engagement_id(c.id);
  v_stage    := public.derive_lifecycle_stage(c.id);
  v_intake   := case when v_eng_open is not null then 'open'
                     when v_stage in ('lead', 'quoted') then 'pending'
                     else 'none' end;
  v_required := coalesce(p_required_for_close, true) and v_intake <> 'none';

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
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  -- בקשה פעילה מאותו סוג כבר קיימת — אין מה להוסיף, ומסך הקטלוג ממילא מסנן
  -- אותה. הבדיקה כאן היא בשביל מסך מיושן או שני חלונות פתוחים.
  if p_step_type <> 'custom_request'
     and exists (select 1 from public.onboarding_steps
                  where client_id = c.id and step_type = p_step_type
                    and status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_type_exists');
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  -- 135: לפני שנמכר משהו, "הוספתי בקשה" פירושו הכנה ולא שליחה.
  if p_published and v_stage in ('lead', 'quoted') then
    p_published := false;
    v_hold := true;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end
    || case when v_hold then jsonb_build_object('heldUntilApproval', true) else '{}'::jsonb end;

  -- שורה מבוטלת מאותו סוג עדיין תופסת את הצמד (התקשרות, סוג). מעדיפים את זו
  -- שבהתקשרות הנוכחית — היא זו שתחסום את ההוספה.
  if p_step_type <> 'custom_request' then
    select id into v_old from public.onboarding_steps
     where client_id = c.id and step_type = p_step_type and status = 'cancelled'
     order by (engagement_id is not distinct from v_eng) desc, updated_at desc
     limit 1;
  end if;

  if v_old is not null then
    -- קשתות תלות ישנות יורדות במלואן: לשלב אפשרו כמה הורים, והטריגר על
    -- העמודה הבודדת אינו מנקה את מה שנוסף מעבר לה.
    delete from public.onboarding_step_dependencies where step_id = v_old;

    update public.onboarding_steps set
      engagement_id      = coalesce(v_eng, engagement_id),
      track              = public.onboarding_track_for(p_step_type),
      scope              = 'person',
      status             = v_status,
      ball               = v_ball,
      depends_on_step_id = p_depends_on,
      due_date           = p_due_date,
      sort_order         = v_next,
      payload            = v_payload,
      required_for_close = v_required,
      published_at       = case when p_published then now() else null end,
      stage_id           = p_stage_id,
      completed_by       = null,
      completed_at       = null,
      verified_at        = null,
      updated_at         = now()
    where id = v_old;

    if p_depends_on is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_old, p_depends_on, c.user_id)
      on conflict do nothing;
    end if;

    v_id := v_old;
  else
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       depends_on_step_id, due_date, sort_order, payload, required_for_close,
       published_at, stage_id)
    values
      (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
       v_status, v_ball, p_depends_on, p_due_date, v_next, v_payload,
       v_required,
       case when p_published then now() else null end,
       p_stage_id)
    returning id into v_id;
  end if;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה'
         when v_hold then 'נוספה בקשה - תפורסם כשההצעה תאושר'
         else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'owner', coalesce(p_owner, 'client'),
                       'revived', v_old is not null,
                       'intakeState', v_intake,
                       'requiredForClose', v_required));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status,
                            'heldUntilApproval', v_hold,
                            'intakeState', v_intake,
                            'requiredForClose', v_required,
                            'revived', v_old is not null);
end;
$function$;

revoke all on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) from public, anon;
grant execute on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) to authenticated;

-- ── 3 · סימון ידני כ«נדרש» · נדחה מחוץ לקליטה ──────────────────────────────
-- ‼ אסימטרי בכוונה: סימון כ«רשות» מותר תמיד. זה הכיוון הבטוח, והוא הדרך
--   לנקות שורות היסטוריות בלי מיגרציית נתונים שמנחשת.

create or replace function public.set_onboarding_step_required(
  p_step_id text,
  p_required boolean
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s      public.onboarding_steps%rowtype;
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_from boolean;
  v_to   boolean := coalesce(p_required, true);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;

  -- הבעלות נבדקת דרך הלקוח, כמו בכל שאר פונקציות הקליטה.
  select * into c from public.clients where id = s.client_id;
  if c.id is null or c.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if s.status in ('completed', 'verified', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_closed', 'status', s.status);
  end if;

  -- 155 · אין קליטה פתוחה ⇒ אין מה לחסום, ולכן אי אפשר לסמן כנדרש.
  if v_to and not public.intake_accepts_required(c.id) then
    return jsonb_build_object('ok', false, 'error', 'no_open_intake',
      'intakeState', public.client_intake_state(c.id)->>'state');
  end if;

  v_from := coalesce(s.required_for_close,
                     s.step_type not in ('representation_upgrade', 'first_month_review'));

  if v_from = v_to then
    return jsonb_build_object('ok', true, 'unchanged', true, 'requiredForClose', v_to);
  end if;

  update public.onboarding_steps
     set required_for_close = v_to, updated_at = now()
   where id = s.id;

  perform public.log_onboarding_event(c.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when v_to then 'עודכן: השלב נדרש לסגירת הקליטה'
         else 'עודכן: השלב אינו נדרש לסגירת הקליטה' end,
    jsonb_build_object('requiredForClose', jsonb_build_object('from', v_from, 'to', v_to)));

  return jsonb_build_object('ok', true, 'requiredForClose', v_to);
end;
$function$;

grant execute on function public.set_onboarding_step_required(text, boolean) to authenticated;

-- ── 4 · סגירת קליטה · כלל אחד לשני המסלולים ────────────────────────────────
-- הבאג שהיה: שני כללים שונים ל"הקליטה הושלמה". הכפתור שאל את
-- onboarding_close_readiness (מכבד required_for_close, מתעלם מ-8 סוגי עבודה
-- פנימית). advance_onboarding_step סגר לבד כשלא נשאר שום שלב פתוח למעט שניים
-- — התעלם לגמרי מ-required_for_close, ולא שלח התראה. אותו תיק יכול היה להיות
-- "מוכן לסגירה" לפי אחד ו"עוד לא" לפי השני, באותו רגע.
--
-- ‼ מכאן: גוף אחד. הכפתור והמסלול האוטומטי קוראים לאותה פונקציה, ולכן שניהם
--   גם רושמים ביומן וגם מוציאים התראה. שינוי התנהגות מכוון: סגירה אוטומטית
--   תקרה עכשיו גם כשנותרו בקשות **רשות** פתוחות — בדיוק כמו שהכפתור היה
--   מאפשר באותו רגע.

create or replace function public.close_onboarding_if_ready(
  p_engagement_id text,
  p_actor text default 'system',
  p_force boolean default false,
  p_reason text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e     public.engagements%rowtype;
  v_rd  jsonb;
  v_client_name text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if e.status <> 'onboarding' then return jsonb_build_object('ok', true, 'noop', true); end if;

  v_rd := public.onboarding_close_readiness(p_engagement_id);
  if not (v_rd->>'ready')::boolean and not p_force then
    return jsonb_build_object('ok', false, 'error', 'not_ready', 'readiness', v_rd);
  end if;

  update public.engagements
     set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
   where id = e.id;

  perform public.log_onboarding_event(e.user_id, null, e.id, 'status_changed', p_actor,
    case when p_force then coalesce(nullif(trim(coalesce(p_reason,'')),''), 'נסגר למרות שנותרו פריטים פתוחים')
         when p_actor = 'system' then 'הקליטה נסגרה מעצמה - כל הפריטים הנדרשים הושלמו'
         else 'הקליטה נסגרה - הלקוח עבר לשוטף' end,
    jsonb_build_object('forced', p_force, 'auto', p_actor = 'system', 'readiness', v_rd));

  perform public.refresh_lifecycle_stage_for(e.client_id);

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client_name from public.clients where id = e.client_id;

  perform public.queue_accountant_notification(
    e.user_id, 'onboarding_closed', e.client_id, null, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'forced', p_force,
      'auto', p_actor = 'system',
      'reason', nullif(trim(coalesce(p_reason,'')), '')));

  return jsonb_build_object('ok', true, 'closed', true, 'forced', p_force,
                            'auto', p_actor = 'system', 'readiness', v_rd);
end;
$function$;

-- ‼ פנימית בלבד: אין בה בדיקת בעלות, והיא נקראת רק מתוך פונקציות שכבר בדקו.
revoke all on function public.close_onboarding_if_ready(text, text, boolean, text) from public, anon, authenticated;

create or replace function public.close_onboarding(
  p_engagement_id text,
  p_force boolean default false,
  p_reason text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e     public.engagements%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if v_uid is null or e.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  return public.close_onboarding_if_ready(p_engagement_id, 'accountant', p_force, p_reason);
end;
$function$;

grant execute on function public.close_onboarding(text, boolean, text) to authenticated;

-- ── 5 · advance_onboarding_step · אותו כלל סגירה ────────────────────────────
-- הגוף זהה לפרודקשן, למעט הבלוק האחרון: במקום כלל סגירה משלו — קריאה לכלל
-- המשותף. ‼ שאר הפונקציה לא נגעה, כולל שער הנעילה ושער הפייפרלס.

create or replace function public.advance_onboarding_step(
  p_step_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s          public.onboarding_steps%rowtype;
  v_new      text;
  v_ball     text;
  v_note     text;
  v_reason   text;
  v_uid      uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_note   := nullif(trim(coalesce(p_payload->>'note', '')), '');
  v_ball   := s.ball;

  if s.status = 'locked' and p_action not in ('cancel','note','block','set_due') then
    if not public.onboarding_dependency_met(s.id) then
      return jsonb_build_object('ok', false, 'error', 'locked',
        'message', case when s.step_type = 'retainer_authorization'
                        then 'הרשאת התשלום נוצרת בתוך חשבון הפייפרלס של הלקוח - יש לאשר קודם את החיבור לפייפרלס.'
                        else 'השלב נעול עד להשלמת השלב שהוא תלוי בו.' end);
    end if;
  end if;

  case p_action
    when 'start'        then v_new := 'in_progress';
    when 'wait_client'  then v_new := 'waiting_client'; v_ball := 'client';
    when 'complete'     then v_new := 'completed';
    when 'verify'       then v_new := 'verified';
    when 'skip'         then v_new := 'skipped';
    when 'block'        then v_new := 'blocked';
    when 'fail'         then v_new := 'failed';
    when 'reopen'       then v_new := 'pending';
    when 'cancel'       then v_new := 'cancelled';
    when 'record_link'  then v_new := case when s.status in ('locked','pending') then 'in_progress' else s.status end;
    when 'email_sent'   then v_new := 'waiting_client'; v_ball := 'client';
    when 'set_due'      then v_new := s.status;
    when 'note'         then v_new := s.status;
    else return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  if p_action = 'skip' and s.step_type in ('paperless_invite','paperless_connection') then
    if coalesce(v_reason, '') not in ('already_connected','transferred_rep','not_applicable') then
      if exists (select 1 from public.onboarding_steps r
                 where r.client_id = s.client_id and r.step_type = 'retainer_authorization'
                   and r.status not in ('completed','verified','cancelled','skipped')
                   and coalesce(r.payload->>'method','') <> 'manual_arrangement') then
        return jsonb_build_object('ok', false, 'error', 'paperless_required',
          'message', 'קיימת הרשאת תשלום שממתינה - אי אפשר לדלג על הפייפרלס אלא אם הלקוח כבר מחובר.');
      end if;
    end if;
  end if;

  update public.onboarding_steps
    set status  = v_new,
        ball    = coalesce(nullif(p_payload->>'ball',''), v_ball),
        payload = payload || coalesce(p_payload - 'note' - 'ball', '{}'::jsonb)
                  || case when v_reason is not null then jsonb_build_object('skipReason', v_reason) else '{}'::jsonb end,
        due_date = coalesce((nullif(p_payload->>'dueDate',''))::date, due_date),
        needs_attention = case when v_new in ('completed','verified','skipped','cancelled') then false else needs_attention end,
        completion_method = coalesce(nullif(p_payload->>'completionMethod',''), completion_method),
        completed_by = case when v_new in ('completed','verified') then v_uid else completed_by end,
        completed_at = case when v_new = 'completed' and completed_at is null then now() else completed_at end,
        verified_at  = case when v_new = 'verified'  and verified_at  is null then now() else verified_at end
    where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
    case when v_new = s.status then 'note' else 'status_changed' end,
    'accountant', coalesce(v_note, v_reason),
    jsonb_build_object('from', s.status, 'to', v_new, 'action', p_action));

  if v_new in ('completed','verified','skipped') then
    perform public.unlock_dependent_steps(s.id);
  end if;

  -- ‼ 155 · כלל סגירה אחד. קודם ישב כאן תנאי משלו שהתעלם מ-required_for_close.
  if s.engagement_id is not null then
    perform public.close_onboarding_if_ready(s.engagement_id, 'system');
  end if;

  return jsonb_build_object('ok', true, 'stepId', s.id, 'from', s.status, 'to', v_new);
end;
$function$;

grant execute on function public.advance_onboarding_step(text, text, jsonb) to authenticated;

-- ── 6 · מצב הייצוג · תחום ערכים סגור ───────────────────────────────────────
-- ‼ אומת לפני ההוספה: בפרודקשן ובסביבת הבדיקות כל הערכים הקיימים בתוך
--   הרשימה. אין שורה שתידחה.

alter table public.representation_requests drop constraint if exists representation_requests_status_check;
alter table public.representation_requests add constraint representation_requests_status_check
  check (status in ('pending_fill','awaiting_accountant','pending_signature',
                    'awaiting_stamp','awaiting_authorities','active'));

alter table public.representation_requests drop constraint if exists representation_requests_onboarding_status_check;
alter table public.representation_requests add constraint representation_requests_onboarding_status_check
  check (onboarding_status in ('pending','submitted'));

-- ‼ null מותר: לקוח ותיק שמעולם לא נפתח לו ייצוג. ראה §8 בהמשך.
alter table public.clients drop constraint if exists clients_representation_status_check;
alter table public.clients add constraint clients_representation_status_check
  check (representation_status is null or representation_status in
         ('pending_fill','awaiting_accountant','pending_signature',
          'awaiting_stamp','awaiting_authorities','active'));

-- ── 7 · «מיוצג נשאר מיוצג» · הכרעת מוצר 2 ──────────────────────────────────
-- הבאג שהיה: handleAttachRepresentation דרס לקוח פעיל בחזרה ל-pending_fill
-- בלי לקרוא את מצבו, והבקשה הישנה נשארה יתומה במצב active. עכשיו זה נחסם
-- במסד, ולכן גם מסך ישן, סקריפט, או קריאת REST ישירה אינם יכולים לעשות את זה.
--
-- ‼ אין כאן טבלת מעברים מלאה בכוונה. אכיפה של כל המעברים הייתה מסכנת מסלולים
--   לגיטימיים שלא נמנו (מסירה בין חותמים, חזרה לחתימה אחרי תיקון). מה שנאכף
--   הוא בדיוק מה שהוכרע: active הוא סופי.

create or replace function public.guard_representation_status()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(old.status,'') = 'active' and coalesce(new.status,'') <> 'active' then
    raise exception 'representation_active_is_terminal'
      using hint = 'לקוח מיוצג נשאר מיוצג. ביטול ייצוג אינו קיים עדיין במערכת.';
  end if;
  return new;
end;
$function$;

drop trigger if exists rep_requests_guard_status on public.representation_requests;
create trigger rep_requests_guard_status
  before update of status on public.representation_requests
  for each row when (old.status is distinct from new.status)
  execute function public.guard_representation_status();

-- ── 8 · מצב הייצוג של הלקוח נגזר מהבקשה · הכרעות 3 ו-5 ─────────────────────
-- הבאג שהיה: הדפדפן כתב פעמיים — פעם לבקשה ופעם לכרטיס — בלי טרנזקציה. אם
-- אחת נכשלה או הוחלפה בסדר, הכרטיס והבקשה נשארו סותרים. בפרודקשן יש כבר
-- שורה כזאת (ראה §10).
--
-- ‼ מונוטוני: הטריגר לעולם אינו מוריד לקוח ממצב 'active'. זו הכרעה 2 אכופה
--   בנקודה שבה היא באמת נשמרת, ולא בתקווה שכל קורא יזכור אותה.
-- ‼ ב"ל נשאר בחוץ בהעברה ל-active: אישור שע"ם אינו אישור ביטוח לאומי, והוא
--   מסתיים בנפרד ופר-אדם (execution.confirmedAt). לסמן אותו כאן היה מציג
--   בן/בת זוג כמיוצג/ת בלי שום ראיה. ראה docs/PLAN-BTL-ADD-SPOUSE-REPRESENTATION.md §9.

-- ‼ מימוש אחד, שני קוראים: הטריגר שלמטה, ותיקון הנתונים ההיסטורי ב-§11.
--   שני עותקים של הכלל הזה היו בדיוק הבעיה שהמיגרציה הזאת באה לסגור.
create or replace function public.apply_client_representation(
  p_client_id text, p_status text
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_reps jsonb;
begin
  if p_client_id is null or p_status is null then return; end if;

  update public.clients
     set representation_status = p_status, updated_at = now()
   where id = p_client_id
     and coalesce(representation_status, '') <> 'active'
     and representation_status is distinct from p_status;

  if p_status = 'active' then
    select coalesce(jsonb_object_agg(
             t.k,
             case when t.k = 'nationalInsurance' then t.v
                  else t.v || jsonb_build_object('status', 'active') end), '{}'::jsonb)
      into v_reps
      from public.clients c,
           lateral jsonb_each(coalesce(c.authority_representations, '{}'::jsonb)) as t(k, v)
     where c.id = p_client_id;

    update public.clients
       set representation_status = 'active',
           authority_representations = case
             when v_reps is null or v_reps = '{}'::jsonb then authority_representations
             else v_reps end,
           updated_at = now()
     where id = p_client_id
       and (representation_status is distinct from 'active'
            or authority_representations is distinct from coalesce(v_reps, authority_representations));
  end if;

  perform public.refresh_lifecycle_stage_for(p_client_id);
end;
$function$;

revoke all on function public.apply_client_representation(text, text) from public, anon, authenticated;

create or replace function public.sync_client_representation()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(old.status,'') = coalesce(new.status,'') then return new; end if;
  if new.linked_client_id is null then return new; end if;
  perform public.apply_client_representation(new.linked_client_id, new.status);
  return new;
end;
$function$;

drop trigger if exists rep_requests_sync_client on public.representation_requests;
create trigger rep_requests_sync_client
  after update of status on public.representation_requests
  for each row execute function public.sync_client_representation();

-- ── 9 · שלב החיים מתרענן גם משינוי ייצוג ───────────────────────────────────
-- עד כה היו טריגרים רק על engagements ועל quotations, ולכן שינוי ייצוג עדכן
-- את שלב החיים רק אם הדפדפן זכר לקרוא ל-refresh_lifecycle_stage_for ביד.
-- ‼ אין רקורסיה: הרענון כותב אך ורק את lifecycle_stage, והטריגר מאזין אך ורק
--   ל-representation_status.

create or replace function public.tg_client_rep_lifecycle()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform public.refresh_lifecycle_stage_for(new.id);
  return null;
end;
$function$;

drop trigger if exists clients_rep_lifecycle on public.clients;
create trigger clients_rep_lifecycle
  after update of representation_status on public.clients
  for each row when (old.representation_status is distinct from new.representation_status)
  execute function public.tg_client_rep_lifecycle();

-- ── 10 · דוח עקביות · רואים, לא נוגעים ─────────────────────────────────────
-- ‼ קריאה בלבד. הוא קיים כדי שסתירה תהיה נראית ולא תתגלה במקרה, ובשביל
--   בדיקת הרגרסיה. שורות שדורשות הכרעה אנושית מדווחות ולא מתוקנות.

create or replace function public.domain_consistency_report()
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    -- דגל «נדרש» על בקשה פתוחה שאין לה קליטה לחסום. אינרטי, לא מזיק.
    'inertRequiredFlags', (
      select count(*) from public.onboarding_steps s
       where coalesce(s.required_for_close, true)
         and s.status not in ('completed','verified','skipped','cancelled')
         and not public.intake_accepts_required(s.client_id)),
    -- ‼ שתי מחלקות שונות לגמרי, ולכן שתי שורות ולא אחת:
    -- (א) הכרטיס **מפגר** אחרי הבקשה. ניתן להשלמה בבטחה, קדימה בלבד — זה
    --     בדיוק מה ש-§11 מתקן, ומכאן והלאה הטריגר מונע.
    'clientBehindRequest', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'clientId', c.id, 'client', c.representation_status, 'request', r.status)), '[]'::jsonb)
        from public.clients c
        join lateral (select status from public.representation_requests rr
                       where rr.linked_client_id = c.id
                       order by created_at desc limit 1) r on true
       where c.representation_status is distinct from r.status
         and coalesce(c.representation_status, '') <> 'active'),
    -- (ב) הכרטיס **מקדים** את הבקשה: מיוצג, בזמן שהבקשה עוד בדרך. אי אפשר
    --     להסיק מה נכון — להוריד את הלקוח מ"מיוצג" אסור (הכרעת מוצר 2),
    --     ולקדם את הבקשה היה ממציא היסטוריית חתימה. דורש עין אנושית.
    'clientAheadOfRequest', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'clientId', c.id, 'client', c.representation_status, 'request', r.status)), '[]'::jsonb)
        from public.clients c
        join lateral (select status from public.representation_requests rr
                       where rr.linked_client_id = c.id
                       order by created_at desc limit 1) r on true
       where c.representation_status is distinct from r.status
         and coalesce(c.representation_status, '') = 'active'),
    -- שלב חיים שמור ששונה מהנגזר. אמור להיות ריק תמיד אחרי §9.
    'lifecycleDrift', (
      select count(*) from public.clients c
       where c.lifecycle_stage is distinct from public.derive_lifecycle_stage(c.id)),
    -- יותר מבקשת ייצוג פתוחה אחת לאותו לקוח.
    'multipleOpenRepRequests', (
      select coalesce(jsonb_agg(x.linked_client_id), '[]'::jsonb) from (
        select linked_client_id from public.representation_requests
         where linked_client_id is not null and status <> 'active'
         group by 1 having count(*) > 1) x)
  );
$function$;

grant execute on function public.domain_consistency_report() to authenticated;

-- ── 11 · תיקון נתונים · קדימה בלבד, ורק מה שניתן להסקה ─────────────────────
-- מה שמתוקן: כרטיס שנשאר מאחורי בקשת הייצוג שלו. זו תוצאת הכתיבה הכפולה
-- מהדפדפן — הבקשה התקדמה, הכתיבה השנייה לא יצאה, והכרטיס נתקע. מקור האמת
-- המוצהר הוא הבקשה (supabase/31-onboarding-engine.sql:458), הכיוון הוא קדימה
-- בלבד, ולכן אף לקוח אינו מאבד ייצוג בגלל התיקון הזה.
--
-- ‼ מה ש**אינו** מתוקן: כרטיס שמקדים את הבקשה (מיוצג, בזמן שהבקשה בדרך).
--   אי אפשר להסיק מה נכון. להוריד לקוח מ"מיוצג" אסור (הכרעת מוצר 2), ולקדם
--   את הבקשה היה ממציא חתימה והגשה שלא היו. השורות האלה מדווחות
--   ב-domain_consistency_report ומחכות להכרעה אנושית.
-- ‼ אידמפוטנטי: הרצה חוזרת אינה משנה דבר.

do $$
declare r record; n int := 0;
begin
  for r in
    select c.id as client_id, rr.status as req_status
      from public.clients c
      join lateral (select status from public.representation_requests x
                     where x.linked_client_id = c.id
                     order by created_at desc limit 1) rr on true
     where c.representation_status is distinct from rr.status
       and coalesce(c.representation_status, '') <> 'active'
  loop
    perform public.apply_client_representation(r.client_id, r.req_status);
    n := n + 1;
  end loop;
  raise notice '155 · כרטיסים שהושלמו קדימה מהבקשה שלהם: %', n;
end $$;

-- ── רולבק ────────────────────────────────────────────────────────────────────
-- drop trigger if exists clients_rep_lifecycle on public.clients;
-- drop trigger if exists rep_requests_sync_client on public.representation_requests;
-- drop trigger if exists rep_requests_guard_status on public.representation_requests;
-- alter table public.representation_requests drop constraint if exists representation_requests_status_check;
-- alter table public.representation_requests drop constraint if exists representation_requests_onboarding_status_check;
-- alter table public.clients drop constraint if exists clients_representation_status_check;
-- ואת ארבע הפונקציות המוחלפות משחזרים מ-supabase/live-2026-09-04/.
