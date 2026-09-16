-- ─── 183: הכנת סביבת עבודה לשע״ם — התחברות היברידית ─────────────────────────
-- ‼ ממוספר 183 (לא 168): מיגרציות 168-182 כבר תפוסות על ידי ענף היישור
-- המקביל (consistency-remediation) שהוחל באותו חלון זמן על אותו מסד. שינוי
-- שם קובץ בלבד — התוכן כאן זהה לגמרי למה שכבר הוחל בפועל בייצור.
-- מפרט: פרק 16 ב-"PIVO — גילוי מוצרי וטכני: אוטומציה של בקשות ייצוג" (16.09.2026).
-- מרחיב את יסוד האוטומציה מ-150/153, לא מחליף אותו: אותה טבלה, אותם RPCs
-- קיימים נשארים כפי שהם, ורק מה שהמילסטון הזה דורש בפועל נוסף.
--
-- ‼ הבעיה שזה פותר: shaamConnect.mjs היום עוצר בזרימה טורית בראשון מבין
-- פורטל/GMF/מע״מ/ניכויים שדורש אדם — אם מע״מ תקועה, אף אחד לא בודק אם GMF
-- וניכויים בכלל מוכנות. אין מקום עמיד לשמור "3 מתוך 4 מוכנות", אין דרך
-- לבטל job שכבר "running" (רק queued/needs_human), ואין RPC שמחדש job
-- שנתקע ב-needs_human אחרי שהאתגר שחסם אותו נפתר — היום מנגנון ה"תיקון"
-- היחיד הוא שהדפדפן מבטל ויוצר job חדש, מה שיוצר מרוץ נגד סיום ה-worker
-- (ראה useAuthorityConnections.ts:122-136).

-- ── 1. עמודות עמידות: התקדמות, CAS, ביטול ────────────────────────────────
-- ‼ progress הוא לא טבלה חדשה: התקדמות מרוכזת (מדד לכל capability, ולא רק
-- succeeded/failed גלובלי) יושבת בתוך אותה שורת job, בדיוק כמו result/artifacts.
-- revision הוא ה-CAS: worker כותב רק אם הוא מחזיק את הגרסה האחרונה שראה —
-- מונע מ-worker "זומבי" (חכירה שפגה, נתפס מחדש) לדרוס עדכון של המחזיק הנוכחי.
alter table public.automation_jobs
  add column if not exists progress         jsonb   not null default '{}'::jsonb,
  add column if not exists revision         int     not null default 0,
  add column if not exists cancel_requested boolean not null default false;

comment on column public.automation_jobs.progress is
  'התקדמות עמידה לפי capability: {"capabilities":{"gmf":{"state","reasonCode","observedAt","evidenceKind"},...},"challenges":[...]}. אין כאן ולא יהיה כאן ערך סוד.';
comment on column public.automation_jobs.revision is
  'מונה גרסה ל-CAS: update_automation_job_progress כותב רק כשהוא מחזיק את הגרסה האחרונה.';
comment on column public.automation_jobs.cancel_requested is
  'בקשת ביטול על job שכבר running — ה-worker בודק בין צעדים ומסיים בעצמו; שינוי הדגל לבדו אינו עוצר עבודה שכבר בביצוע.';

-- ‼ session_generation, לא טבלה חדשה ל"work session": יש worker אחד למשתמש
-- (ראה shaamReadiness.tsx — תמיד שורת automation_workers האחרונה). כשה-worker
-- מזהה שינוי הקשר (משרד/חשבון/פרופיל), הוא מקדם את זה — וראיות ישנות מדור
-- קודם לא ייחשבו טריות, בלי לבנות מנגנון workflow נפרד.
alter table public.automation_workers
  add column if not exists session_generation int not null default 1;

comment on column public.automation_workers.session_generation is
  'מקודם ע"י ה-worker כשההקשר (משרד/חשבון/פרופיל) משתנה. ראיות readiness מדור קודם אינן קבילות.';

-- ── 2. עדכון התקדמות אטומי (CAS) — נקרא רק מהעובד המקומי ─────────────────
create or replace function public.update_automation_job_progress(
  p_worker_id         text,
  p_job_id            text,
  p_expected_revision int,
  p_progress          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.automation_jobs;
begin
  update public.automation_jobs
     set progress = coalesce(p_progress, '{}'::jsonb),
         revision = revision + 1
   where id = p_job_id
     and claimed_by = p_worker_id
     and status = 'running'
     and revision = p_expected_revision
   returning * into v_job;

  if found then
    return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
  end if;

  -- ‼ מבחינים בין "מישהו אחר כבר כתב גרסה חדשה יותר" (תקין — ה-worker מוותר
  -- על העדכון הזה, לא מנסה שוב בעיוורון) לבין "כבר לא שלי/כבר הסתיים".
  if exists (
    select 1 from public.automation_jobs
     where id = p_job_id and claimed_by = p_worker_id and status = 'running'
  ) then
    return jsonb_build_object('ok', false, 'error', 'revision_conflict');
  end if;
  return jsonb_build_object('ok', false, 'error', 'not_owner_or_finished');
end;
$function$;

revoke all on function public.update_automation_job_progress(text, text, int, jsonb) from public, anon, authenticated;
grant execute on function public.update_automation_job_progress(text, text, int, jsonb) to service_role;

-- ── 3. חידוש needs_human — יוזם אותו ה-worker, לא הדפדפן ─────────────────
-- ‼ זה מחליף את הדפוס המסוכן שהיה קיים רק בצד הדפדפן: לחכות ש-readiness
-- יתהפך ואז לבטל את ה-job כדי "לפנות מקום". כאן ה-worker עצמו, שראה ישירות
-- שהאתגר שחסם נפתר, מחזיר את אותו job בדיוק ל-running — בלי ליצור job חדש
-- ובלי מרוץ מול הדפדפן שמחליט מתי "זה כבר בטח נגמר".
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

-- ── 4. ביטול job שכבר running — נקרא מהדפדפן ──────────────────────────────
-- ‼ cancel_automation_job הקיים (150) ממשיך לשרת queued/needs_human בדיוק
-- כמו היום — לא נגעתי בו. זה כאן סוגר את הפער שהתיעוד המקורי שלו מציין
-- בפירוש כמחוץ לתחום: ביטול job שכבר נתפס דורש שיתוף פעולה מה-worker, וזה
-- בדיוק מה שהדגל הזה נותן - worker בודק בין צעדי capability ומסיים בעצמו.
create or replace function public.request_job_cancellation(p_job_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  update public.automation_jobs
     set cancel_requested = true
   where id = p_job_id
     and user_id = v_uid
     and status = 'running'
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.request_job_cancellation(text) from public, anon;
grant execute on function public.request_job_cancellation(text) to authenticated;

-- ── 5. דילוג על capability בודדת — נקרא מהדפדפן ("דלג כרגע") ──────────────
-- ‼ ממזג לתוך progress.capabilities.<capability>, לא דורס שדות אחרים
-- (reasonCode/observedAt) שה-worker כבר כתב שם. jsonb_set על נתיב מקונן
-- דורש שההורה כבר קיים - ולכן בונים אותו במפורש עם coalesce לפני המיזוג,
-- ולא מניחים שה-job כבר עבר סבב הכנה אחד.
create or replace function public.defer_job_capability(p_job_id text, p_capability text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  update public.automation_jobs
     set progress = jsonb_set(
           coalesce(progress, '{}'::jsonb),
           '{capabilities}',
           coalesce(progress->'capabilities', '{}'::jsonb)
             || jsonb_build_object(
                  p_capability,
                  coalesce(progress #> array['capabilities', p_capability], '{}'::jsonb)
                    || jsonb_build_object('state', 'deferred')
                ),
           true
         )
   where id = p_job_id
     and user_id = v_uid
     and status in ('running', 'needs_human')
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_deferrable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.defer_job_capability(text, text) from public, anon;
grant execute on function public.defer_job_capability(text, text) to authenticated;

-- ── 6. אכיפת max_attempts בפועל — היום מוגדר בסכימה ולא נאכף בשום מקום ────
-- ‼ עמודת max_attempts קיימת מ-150 אבל אף קוד לא קורא אותה: job שהחכירה
-- שלו פגה שוב ושוב נתפס מחדש לנצח, בלי שום סוף. זה נכון לכל action_type,
-- לא רק שע״ם - ולכן זו הטבה, לא רגרסיה: job שממצה ניסיונות מקבל failed
-- מפורש במקום להישאר תקוע-אבל-נראה-חי.
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

-- ── 7. בדיקת שפיות — נכשלת חזק אם משהו כאן פתוח יתר על המידה ─────────────
do $$
begin
  if has_function_privilege('anon', 'public.update_automation_job_progress(text,text,int,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.resolve_needs_human_job(text,text,int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.update_automation_job_progress(text,text,int,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.resolve_needs_human_job(text,text,int)', 'EXECUTE')
  then
    raise exception '183: פונקציות service_role-בלבד נחשפו בטעות ל-anon/authenticated';
  end if;
end $$;

select public.assert_domain_function_invariants();
