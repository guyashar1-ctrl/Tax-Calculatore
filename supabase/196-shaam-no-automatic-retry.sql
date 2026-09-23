-- ─── 196: שע״ם — ניסיון חיצוני אחד, ולעולם לא ניסיון אוטומטי שני ────────────
--
-- ‼ הכלל העסקי, ומעליו אין: **פנייה חיצונית לשע״ם נעשית פעם אחת.** כישלון,
-- דחייה, או תוצאה שלא ניתן להכריע — עוצרים, מודיעים לרו"ח, ומחכים להחלטה
-- אנושית. שע״ם היא מערכת ממשלתית עם כרטיס חכם: ניסיונות חוזרים מסכנים
-- חסימה של הכרטיס, של הסשן ושל המשתמש, ועלולים ליצור בקשות/הגשות כפולות.
-- המחיר של עצירה קטן לאין ערוך מהמחיר של חסימה.
--
-- ‼ למה מיגרציה ולא תיקון ב-handler: handler שמבצע ניסיון אחד **אינו
-- מספיק**. התשתית הכללית (150/183) מריצה אותו שוב לבדה בשלושה מסלולים
-- נפרדים, וכל אחד מהם היה מספיק כדי לפנות שוב לשע״ם בלי שאף אדם ביקש:
--
--   V1 · חכירה שפקעה ⇒ תפיסה מחדש. עובד שמת/נתקע באמצע אינטראקציה עם
--        שע״ם השאיר שורה 'running'; claim_next_automation_job רואה
--        `lease_until < now()` ומוסר אותה שוב — בדיוק במצב שבו **לא
--        ידוע** אם שע״ם כבר קלטה.
--   V2 · `max_attempts` ברירת מחדל 3 ⇒ עד שלוש פניות.
--   V3 · report_worker_status מחדשת needs_human('awaiting_*_auth') ברגע
--        שהעובד מדווח «מחובר» — בלי לחיצה. נכון לחיבור, מסוכן לשידור.
--
-- מה שנסגר כאן:
--   · פעולות משנות בשע״ם (יצירת בקשה, שידור טופס) אינן נתפסות מחדש לעולם.
--     חכירה שפקעה מעבירה אותן ל-needs_human עם מצב מפורש, והעובד נדרש
--     להחלטה אנושית.
--   · max_attempts = 1 לפעולות האלה, כבר ביצירה.
--   · שלוש פעולות הייצוג יוצאות מרשימת החידוש האוטומטי.
--   · ביטול של פעולה שכבר נגעה בשע״ם דורש אישור מפורש מהמסך — כך ש
--     «בטל-ואז-נסה-שוב» השקט של הדפדפן אינו יכול להוליד פנייה שנייה.
--
-- ‼ מה **לא** נגעתי בו: ביטוח לאומי. `btl.create_representation` היא גם
-- פעולה משנה, אבל סשן מקביל עובד עליה בדיוק עכשיו (מיגרציה 195), והרחבת
-- הכלל לשם שייכת לו. הכלל כאן נכתב גנרי (`is_external_mutation_action`)
-- כדי שההרחבה תהיה שורה אחת.

-- ── 1. מי מוגן ─────────────────────────────────────────────────────────────

/*
  הפעולות שאסור לחזור עליהן אוטומטית: אלו שמשנות מצב בשע״ם.
  ‼ `shaam.check_representation` **אינה** ברשימה במכוון — היא קוראת בלבד
  (מנווטת לרשימה, מחפשת לפי מספר בקשה, קוראת טקסט), ולכן תפיסה מחדש שלה
  אחרי קריסה אינה מסכנת דבר. האיסור על חידוש אוטומטי אחרי כשל אימות חל
  עליה בכל זאת — ראה §4.
*/
create or replace function public.is_external_mutation_action(p_action_type text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_action_type in ('shaam.create_representation', 'shaam.submit_poa');
$function$;

comment on function public.is_external_mutation_action(text) is
  'פעולות שמשנות מצב במערכת חיצונית רגישה ואסור לחזור עליהן אוטומטית. ראה מיגרציה 196.';

/*
  האם המשימה כבר נגעה בשע״ם בפועל. ה-worker כותב `progress.externalAttempt`
  **לפני** האינטראקציה הראשונה (ולא אחריה) — ולכן קריסה בדיוק באמצע משאירה
  את הסימן דלוק. זו כל ההבחנה בין «נכשל לפני שנגענו» ל«לא ידוע אם נקלט».
*/
create or replace function public.job_touched_external(p_progress jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(p_progress ? 'externalAttempt', false);
$function$;

-- ── 2. יצירה: ניסיון אחד בלבד ─────────────────────────────────────────────

create or replace function public.create_automation_job(
  p_client_id   text,
  p_action_type text,
  p_input       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_job     public.automation_jobs;
  v_created boolean := true;
  -- ‼ 196: פעולה משנה בשע״ם נולדת עם ניסיון אחד. ברירת המחדל (3) פירושה
  -- שלוש פניות לרשות על לחיצה אחת.
  v_max     int := case when public.is_external_mutation_action(p_action_type) then 1 else 3 end;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if p_client_id is not null
     and not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;

  if p_client_id is null then
    select * into v_job from public.automation_jobs
     where user_id = v_uid and client_id is null and action_type = p_action_type
       and status in ('queued', 'running', 'needs_human')
     order by created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', true, 'created', false, 'job', to_jsonb(v_job));
    end if;
    insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
    values (v_uid, null, p_action_type, coalesce(p_input, '{}'::jsonb), 'queued', v_max)
    returning * into v_job;
    return jsonb_build_object('ok', true, 'created', true, 'job', to_jsonb(v_job));
  end if;

  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values (v_uid, p_client_id, p_action_type, coalesce(p_input, '{}'::jsonb), 'queued', v_max)
  on conflict (client_id, action_type) where status in ('queued', 'running', 'needs_human')
  do nothing
  returning * into v_job;

  if not found then
    v_created := false;
    select * into v_job from public.automation_jobs
     where client_id = p_client_id and action_type = p_action_type
       and status in ('queued', 'running', 'needs_human')
     order by created_at desc limit 1;
  end if;

  return jsonb_build_object('ok', true, 'created', v_created, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.create_automation_job(text, text, jsonb) from public, anon;
grant execute on function public.create_automation_job(text, text, jsonb) to authenticated;

-- ── 3. תפיסה: פעולה משנה לעולם אינה נתפסת מחדש ────────────────────────────

create or replace function public.claim_next_automation_job(
  p_user_id      uuid,
  p_worker_id    text,
  p_action_types text[] default null,
  p_lease_seconds int   default 60
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.automation_jobs;
begin
  -- ‼ 196 · V1 — הסוגר המרכזי. פעולה משנה בשע״ם שהחכירה שלה פקעה **אינה**
  -- חוזרת לתור. היא עוברת ל-needs_human עם מצב מפורש, ומחכה לאדם:
  --   · נגעה בשע״ם  ⇒ «לא ידוע אם נקלט» — לפני כל פנייה נוספת חייבים
  --                    לבדוק מול שע״ם מה קרה, לא לשדר שוב.
  --   · לא נגעה     ⇒ נעצרה לפני שנגענו; ניסיון נוסף בטוח, אבל עדיין
  --                    ביוזמת אדם, כדי שלא ייווצר לופ שקט.
  update public.automation_jobs
     set status      = 'needs_human',
         error_code  = case when public.job_touched_external(progress)
                            then 'external_outcome_unknown'
                            else 'worker_stopped_before_external' end,
         needs_human = case when public.job_touched_external(progress)
           then 'הפעולה מול שע״ם נעצרה באמצע, ולא ידוע אם שע״ם קלטה אותה. '
             || 'המערכת לא תנסה שוב מעצמה — ניסיון חוזר עלול ליצור בקשה או '
             || 'שידור כפולים. הריצו «בדוק קבלת הייצוג» כדי לראות מה נקלט בפועל, '
             || 'ורק לפי זה החליטו אם לנסות שוב.'
           else 'הפעולה נעצרה לפני שנגעה בשע״ם (מחשב האוטומציה נסגר או נותק). '
             || 'לא בוצעה שום פנייה לרשות. אפשר להריץ שוב.' end,
         error_detail = 'lease expired; no automatic retry for external mutation (196)',
         finished_at = null
   where user_id = p_user_id
     and status = 'running'
     and lease_until < now()
     and public.is_external_mutation_action(action_type);

  -- מיצוי ניסיונות — ללא שינוי מ-183, חל על כל שאר הפעולות.
  update public.automation_jobs
     set status       = 'failed',
         error_code   = 'max_attempts_exceeded',
         error_detail = 'מוצו הניסיונות המותרים להשלמת הפעולה.',
         finished_at  = now()
   where user_id = p_user_id
     and status = 'running'
     and lease_until < now()
     and attempts >= max_attempts;

  update public.automation_jobs
     set status      = 'running',
         claimed_by  = p_worker_id,
         claimed_at  = now(),
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts    = attempts + 1
   where id = (
     select id from public.automation_jobs
      where user_id = p_user_id
        and (p_action_types is null or action_type = any(p_action_types))
        and attempts < max_attempts
        -- ‼ 196 · חגורה ושני שלייקס: גם אם שורה מוגנת שרדה את הסריקה
        -- למעלה (מרוץ, שעון, שורה שמישהו החזיר ל-queued ביד) — אם היא כבר
        -- נגעה בשע״ם, היא לא נתפסת. אין מסלול שבו פנייה חיצונית שנייה
        -- יוצאת בלי אדם.
        and not (public.is_external_mutation_action(action_type)
                 and public.job_touched_external(progress))
        and not (public.is_external_mutation_action(action_type) and status = 'running')
        and (
          status = 'queued'
          or (status = 'running' and lease_until < now())
        )
      order by created_at asc
      limit 1
      for update skip locked
   )
   returning * into v_job;

  if not found then
    return null;
  end if;
  return to_jsonb(v_job);
end;
$function$;

revoke all on function public.claim_next_automation_job(uuid, text, text[], int) from public, anon, authenticated;
grant execute on function public.claim_next_automation_job(uuid, text, text[], int) to service_role;

-- ── 4. חידוש אוטומטי אחרי חיבור — לא לפעולות הייצוג בשע״ם ─────────────────
--
-- ‼ החידוש הזה (187/194) נכון לפעולות שכל בעייתן היא «החלון לא היה מחובר»:
-- הרו"ח מתחבר, והמשימה ממשיכה. הוא **שגוי** לפעולות הייצוג בשע״ם, מכיוון
-- שהוא מריץ פנייה חיצונית בלי שאף אחד לחץ על כלום — וכשל אימות נראה בדיוק
-- כמו חלון סגור. הכלל של המילסטון הזה: כשל אימות ⇒ עצירה + הודעה + ניסיון
-- ידני. שלוש הפעולות יוצאות מהרשימה, כולל הקריאה-בלבד, כדי שלא יישאר מסלול
-- שבו אימות שנכשל נבדק שוב מעצמו.
--
-- ‼ ה-UX לא נפגע: הכפתור עצמו כבר פותח את ההתחברות ומריץ את הפעולה ברגע
-- שהחיבור מוכן (useAutomationGate) — וזה קורה בתוך אותה לחיצה של אדם.

create or replace function public.report_worker_status(
  p_user_id   uuid,
  p_worker_id text,
  p_status    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status   jsonb;
  v_job      record;
  v_capability text;
  v_ready    boolean;
  v_resumed  text[] := '{}';
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, status)
  values (p_worker_id, p_user_id, now(), coalesce(p_status, '{}'::jsonb))
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        status       = coalesce(excluded.status, public.automation_workers.status)
  returning status into v_status;

  for v_job in
    select id, error_code from public.automation_jobs
     where claimed_by = p_worker_id
       and status = 'needs_human'
       -- ‼ 196: שלוש פעולות הייצוג בשע״ם הוסרו מכאן. ראה ההערה למעלה.
       and action_type in (
         'shaam.connect', 'shaam.ensure_capability',
         'btl.create_representation', 'btl.check_representation'
       )
       and cancel_requested = false
  loop
    v_capability := (regexp_match(coalesce(v_job.error_code, ''), '^awaiting_(\w+)_auth$'))[1];
    continue when v_capability is null;

    v_ready := case
      when v_capability = 'shaam' then coalesce((v_status #>> array['shaam', 'connected'])::boolean, false)
      when v_capability = 'btl' then coalesce((v_status #>> array['btl', 'connected'])::boolean, false)
      else coalesce((v_status #>> array[v_capability, 'ready'])::boolean, false)
    end;
    continue when not v_ready;

    update public.automation_jobs
       set status       = 'running',
           claimed_at   = now(),
           lease_until  = now() + make_interval(secs => 5),
           needs_human  = null,
           error_code   = null,
           error_detail = null
     where id = v_job.id
       and claimed_by = p_worker_id
       and status = 'needs_human'
       and cancel_requested = false;

    if found then
      v_resumed := array_append(v_resumed, v_job.id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'resumed', to_jsonb(v_resumed));
end;
$function$;

revoke all on function public.report_worker_status(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.report_worker_status(uuid, text, jsonb) to service_role;

-- ── 5. חידוש יזום של העובד — אותו איסור ───────────────────────────────────
-- ‼ `resolve_needs_human_job` (183) אינה בשימוש בנתיב האוטומטי היום, אבל היא
-- קיימת ומוענקת ל-service_role. משאירים אותה — וסוגרים בה את אותה דלת.

create or replace function public.resolve_needs_human_job(
  p_worker_id     text,
  p_job_id        text,
  p_lease_seconds int default 60
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.automation_jobs;
begin
  -- ‼ 196: פעולה משנה בשע״ם שכבר נגעה ברשות אינה מתחדשת — לא אוטומטית,
  -- ולא «ביוזמת העובד». ההחלטה הזאת שייכת לאדם, מהמסך.
  if exists (
    select 1 from public.automation_jobs
     where id = p_job_id
       and public.is_external_mutation_action(action_type)
       and public.job_touched_external(progress)
  ) then
    return jsonb_build_object('ok', false, 'error', 'external_attempt_requires_human');
  end if;

  update public.automation_jobs
     set status       = 'running',
         claimed_at   = now(),
         lease_until  = now() + make_interval(secs => p_lease_seconds),
         needs_human  = null,
         error_code   = null,
         error_detail = null
   where id = p_job_id
     and claimed_by = p_worker_id
     and status = 'needs_human'
     and cancel_requested = false
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_resumable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.resolve_needs_human_job(text, text, int) from public, anon, authenticated;
grant execute on function public.resolve_needs_human_job(text, text, int) to service_role;

-- ── 6. ביטול: «בטל-ואז-נסה-שוב» השקט נחסם ─────────────────────────────────
--
-- ‼ הדפוס בדפדפן (useAutomationJob.run, 170) הוא: משימה פתוחה שאינה חיה ⇒
-- לבטל וליצור חדשה. הוא נכון לכל פעולה שלא נגעה בעולם, והוא **בדיוק** הדרך
-- שבה פנייה חיצונית שנייה הייתה נולדת בשקט: המסך מבטל משימה שנעצרה באמצע
-- שידור, יוצר חדשה, והעובד משדר שוב.
-- מעכשיו: ביטול של פעולה משנה **שכבר נגעה בשע״ם** דורש אישור מפורש. המסך
-- מעביר אותו רק אחרי שהציג לרו"ח מה קרה ומה הסיכון.
-- ‼ החתימה משתנה ⇒ drop של הקודמת, אחרת PostgREST רואה שתי התאמות.

drop function if exists public.cancel_automation_job(text);

create or replace function public.cancel_automation_job(
  p_job_id text,
  p_acknowledge_external boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  if not coalesce(p_acknowledge_external, false) and exists (
    select 1 from public.automation_jobs
     where id = p_job_id
       and user_id = v_uid
       and public.is_external_mutation_action(action_type)
       and public.job_touched_external(progress)
  ) then
    return jsonb_build_object('ok', false, 'error', 'external_attempt_requires_acknowledgement');
  end if;

  update public.automation_jobs
     set status = 'cancelled', finished_at = now()
   where id = p_job_id
     and user_id = v_uid
     and (status in ('queued', 'needs_human')
          or (status = 'running' and (lease_until is null or lease_until < now())))
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke execute on function public.cancel_automation_job(text, boolean) from public, anon;
grant  execute on function public.cancel_automation_job(text, boolean) to authenticated, service_role;

-- ── 7. בדיקות שפיות ───────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.claim_next_automation_job(uuid,text,text[],int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_next_automation_job(uuid,text,text[],int)', 'EXECUTE')
     or has_function_privilege('anon', 'public.cancel_automation_job(text,boolean)', 'EXECUTE')
  then
    raise exception '196: פונקציה נחשפה בטעות';
  end if;
  if public.is_external_mutation_action('shaam.create_representation') is not true
     or public.is_external_mutation_action('shaam.submit_poa') is not true
     or public.is_external_mutation_action('shaam.check_representation') is not false then
    raise exception '196: רשימת הפעולות המוגנות אינה כמצופה';
  end if;
  if public.job_touched_external('{"externalAttempt":{"at":"x"}}'::jsonb) is not true
     or public.job_touched_external('{}'::jsonb) is not false then
    raise exception '196: זיהוי «נגע בשע״ם» אינו כמצופה';
  end if;
end $$;

select public.assert_domain_function_invariants();
