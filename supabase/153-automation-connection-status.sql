-- ─── 153: מצב חיבור לרשויות — מה שמדליק את הנורית בכותרת ────────────────────
-- הכותרת של PIVO מציגה שני כפתורים: "שע״ם" ו"ביטוח לאומי". אפור = לא מחובר,
-- ירוק = מחובר. הדפדפן של הרו"ח לא יכול לדבר עם העובד המקומי ישירות, ולכן
-- המצב עובר דרך כאן: העובד כותב, המסך קורא.
--
-- ‼ מה **לא** נשמר כאן, לעולם: עוגיות, מזהי סשן, טוקנים, PIN, פרטי אישור
-- דיגיטלי. רק דגל בוליאני "מחובר/לא" וחותמת זמן. זו כל המטרה של העמודה
-- הזאת — לדעת אם להדליק נורית, לא להחזיק סוד.
--
-- ‼ אידמפוטנטי: ריצה חוזרת לא שוברת דבר.

alter table public.automation_workers
  add column if not exists status jsonb not null default '{}'::jsonb;

comment on column public.automation_workers.status is
  'מצב חיבור לרשויות, לנורית בכותרת. למשל {"shaam":{"connected":true,"checkedAt":"..."}}. אין כאן ולא יהיה כאן מידע אימות.';

-- דיווח מצב מהעובד המקומי. נפרד מ-heartbeat_automation_job בכוונה: זו
-- פעולה עצמאית שקורית גם כשאין שום משימה פעילה, ושינוי חתימה של פונקציה
-- קיימת שכבר בייצור מסכן את מה שעובד.
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
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, status)
  values (p_worker_id, p_user_id, now(), coalesce(p_status, '{}'::jsonb))
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        status       = coalesce(excluded.status, public.automation_workers.status);
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.report_worker_status(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.report_worker_status(uuid, text, jsonb) to service_role;

-- ── משימות מערכת: חיבור/ניתוק אינם שייכים ללקוח ─────────────────────────────
-- ‼ "התחברות לשע״ם" היא פעולה של המשרד, לא של לקוח מסוים. עד עכשיו כל משימה
-- חייבה client_id, ולכן פעולה גלובלית הייתה נאלצת להיתלות על לקוח שרירותי —
-- מה שהיה מזהם את ההיסטוריה של אותו לקוח בפעולות שלא קשורות אליו.
alter table public.automation_jobs alter column client_id drop not null;

-- האינדקס הקיים (client_id, action_type) לא מונע כפילות כש-client_id הוא
-- NULL, כי ב-SQL כל NULL שונה מכל NULL. לכן אינדקס נפרד למשימות המערכת.
create unique index if not exists automation_jobs_open_system_unique
  on public.automation_jobs(user_id, action_type)
  where client_id is null and status in ('queued', 'running', 'needs_human');

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
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- לקוח מסוים ⇒ חייב להיות שלו. משימת מערכת (בלי לקוח) ⇒ אין מה לאמת מעבר
  -- לזהות המשתמש, שכבר נבדקה.
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
    insert into public.automation_jobs (user_id, client_id, action_type, input, status)
    values (v_uid, null, p_action_type, coalesce(p_input, '{}'::jsonb), 'queued')
    returning * into v_job;
    return jsonb_build_object('ok', true, 'created', true, 'job', to_jsonb(v_job));
  end if;

  insert into public.automation_jobs (user_id, client_id, action_type, input, status)
  values (v_uid, p_client_id, p_action_type, coalesce(p_input, '{}'::jsonb), 'queued')
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
