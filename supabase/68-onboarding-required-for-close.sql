-- 68 · חובה/רשות לכל שלב קליטה
--
-- ‼‼ לא הוחל על המסד החי. דורש אישור מפורש לפני הרצה.
--
-- למה: היום "מה חוסם סגירה" נקבע לפי סוג השלב בלבד — כל שלב פתוח חוסם,
-- למעט representation_upgrade ו-first_month_review. זה גס מדי: אותו סוג
-- יכול להיות חובה במסע אחד ורשות במסע אחר (ייבוא היסטוריה, שאלון, בקשה
-- חופשית). ההחלטה עוברת לשלב עצמו.
--
-- ‼ לפני הרצה: ההגדרות החיות של שתי הפונקציות שמוחלפות כאן שמורות ב-
--   supabase/live-2026-08-07/ (create_onboarding_request, onboarding_close_readiness).
--   הרולבק בתחתית הקובץ מסתמך עליהן.

-- ── 1 · העמודה ───────────────────────────────────────────────────────────────
-- מתווספת כ-nullable כדי שהמילוי לאחור ירוץ בלי לנעול ובלי לנחש, ורק
-- אחריו נקבעים NOT NULL וברירת מחדל.
alter table public.onboarding_steps
  add column if not exists required_for_close boolean;

comment on column public.onboarding_steps.required_for_close is
  'האם השלב חוסם סגירת קליטה. ברירת מחדל true — שלב שביקשנו הוא עבודה.';

-- ── 2 · מילוי לאחור · שימור התנהגות קיימת מדויק ─────────────────────────────
-- הכלל: מה שנסגר אתמול ייסגר גם היום, ומה שנחסם אתמול ייחסם גם היום.
--
-- 2a. שני הסוגים שמעולם לא חסמו → רשות.
update public.onboarding_steps
   set required_for_close = false
 where required_for_close is null
   and step_type in ('representation_upgrade', 'first_month_review');

-- 2b. ‼ שאלון שכבר נשלח ללקוח (waiting_client) נחשב עד היום "מסופק" ולא
--     חסם סגירה. ההקלה הזאת מבוטלת בקוד החדש, ולכן בדיוק השורות שנהנו
--     ממנה מסומנות רשות — אחרת קליטה שהיה אפשר לסגור אתמול הייתה ננעלת
--     היום. שאלון במצב אחר (pending) חסם אתמול ויחסום גם מחר.
--     נכון ל-2026-08-07 הכלל הזה תואם אפס שורות במסד החי (אין שלבי
--     intake_questionnaire כלל). הוא נשאר להגנה, לא כי הוא נדרש היום.
update public.onboarding_steps
   set required_for_close = false
 where required_for_close is null
   and step_type = 'intake_questionnaire'
   and status = 'waiting_client';

-- 2c. כל השאר → נדרש. זהה בדיוק לרשימת החוסמים של היום.
update public.onboarding_steps
   set required_for_close = true
 where required_for_close is null;

-- ── 3 · ברירת מחדל ואילוץ ────────────────────────────────────────────────────
alter table public.onboarding_steps
  alter column required_for_close set default true;
alter table public.onboarding_steps
  alter column required_for_close set not null;

-- ── 4 · יצירת בקשה — הרו״ח מחליט לכל בקשה ───────────────────────────────────
-- ‼ זו ההגדרה החיה (live-2026-08-07/create_onboarding_request.sql) עם שלושה
--   שינויים בלבד, ותו לא:
--     (1) פרמטר אחרון חדש p_required_for_close עם ברירת מחדל — כדי שכל
--         הקריאות הקיימות, שאינן מעבירות אותו, ימשיכו לעבוד כמות שהן;
--     (2) העמודה required_for_close ברשימת ה-insert;
--     (3) requiredForClose נוסף ל-meta של אירוע היצירה.
--   כל השאר — בדיקת הבעלות, רשימת הסוגים הסגורה, שער "בקשה בלי דרישות",
--   נפילה לאחור להתקשרות האחרונה, ה-ball לפי סוג, scope='person', אימות
--   התלות ולידה במצב locked, sort_order = max+10 ו-status בערך המוחזר —
--   נשמר מילה במילה. גרסה קודמת של הקובץ הזה שכתבה את הפונקציה מחדש
--   והשמיטה את כולם.
create or replace function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null::date,
  p_depends_on text default null::text,
  p_published boolean default true,
  p_required_for_close boolean default true
) returns jsonb
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

  -- בקשה חופשית בלי דרישות אינה בקשה — אין ללקוח מה לעשות בה.
  if p_step_type = 'custom_request'
     and coalesce(jsonb_array_length(p_payload->'requirements'), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_requirements');
  end if;

  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  end if;

  v_ball := case when p_step_type in ('client_documents','prev_accountant_details','custom_request')
                 then 'client' else 'me' end;

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
     depends_on_step_id, due_date, sort_order, payload, required_for_close)
  values
    (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
     v_status, v_ball, p_depends_on, p_due_date, v_next,
     coalesce(p_payload, '{}'::jsonb)
       || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end,
     coalesce(p_required_for_close, true))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה' else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'requiredForClose', coalesce(p_required_for_close, true)));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status);
end;
$function$;

-- ── 5 · מוכנות הסגירה קוראת מהעמודה ─────────────────────────────────────────
-- חוק אחד במקום שלוש הקלות לפי סוג: שלב נדרש שאינו סגור — חוסם.
--
-- ‼ ההקלות שיורדות: "שאלון שנשלח ללקוח נחשב מסופק" ו-"ריטיינר/מכתב שחרור
--   לפי ספירה". שתיהן היו למעשה מנוטרלות ממילא — התנאי ready דרש גם מערך
--   חוסמים ריק, והמערך הזה כלל כל שלב פתוח למעט שני סוגי הזנב הארוך.
--   התוצאה: השרת חסם, בעוד שהמסך חישב לבד ולעיתים הראה "0 נדרשים".
--   מכאן — מקור אמת אחד.
--
-- ‼ חלון ההתנגדות של מכתב השחרור הוא **כלל עבודה פנימי של המשרד** ולא חוק,
--   תקנה או כלל מקצועי מאומת. הוא נשאר בתוקף כפי שהוא, ורק מדויק כאן.
--
-- ‼ תיקון: עד היום החלון נספר לפי due_date בלבד, בלי לבדוק שהמכתב אכן יצא.
--   מכיוון שאפשר לקבוע לכל שלב תאריך יעד ידנית, מכתב שמעולם לא נשלח ותאריכו
--   עבר היה "מספק" את הסגירה בשקט. שתיקה נחשבת הסכמה רק אחרי ששאלנו: השלב
--   חייב לצאת מהכנה (status לא pending ולא locked).
create or replace function public.onboarding_close_readiness(p_engagement_id text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_blocking jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'stepType', step_type, 'status', status, 'ball', ball)), '[]'::jsonb)
    into v_blocking
    from public.onboarding_steps
   where engagement_id = e.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
     and required_for_close
     and not (step_type = 'release_letter'
              and status not in ('pending', 'locked')
              and due_date is not null
              and due_date <= current_date);

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'blocking', v_blocking,
    'ready', jsonb_array_length(v_blocking) = 0);
end;
$function$;

-- ‼ תת-הפסיקות שירדו מהערך המוחזר (retainer / releaseLetter / intake) אינן
--   נקראות ע"י אף קורא: המסך בענף מתעלם מהן ומחשב לבד, והמסך ב-master רק
--   סופר את blocking. נבדק קובץ-קובץ ב-2026-08-07.

-- ── רולבק ────────────────────────────────────────────────────────────────────
-- 1. שחזור שתי הפונקציות מ-supabase/live-2026-08-07/ (העותק החי שנשמר לפני).
-- 2. alter table public.onboarding_steps drop column required_for_close;
-- העמודה אינה נקראת בשום מקום אחר, ולכן הפלת העמודה בטוחה אחרי שחזור הפונקציות.
