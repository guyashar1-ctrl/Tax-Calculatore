-- ─── 150: תשתית אוטומציה כללית — automation_jobs ────────────────────────────
-- הצעד הראשון של יסוד האוטומציה החוזר של PIVO (docs/PIVO-AUTOMATION-FOUNDATION.html,
-- docs/SHAAM-AUTOMATION-HANDOFF.md). לא ספציפי לשע״ם: כל בדיקה/פעולה דטרמיניסטית
-- עתידית מול רשות ממשלתית (שע״ם, ב״ל, ...) עוברת דרך אותה טבלה ואותם RPCs.
--
-- ‼ מודל הביצוע: PIVO יוצר "משימה" (queued) → עובד מקומי על מחשב המשרד תופס
-- אותה (running) → מדווח תוצאה מובנית (succeeded/failed). האימות מול הרשות
-- עצמו (כרטיס חכם, PIN, OTP) תמיד ביד אדם — אין כאן שום דבר שנוגע בזה.
--
-- ‼ לחכירה (lease) יש תפוגה. זה ההבדל המכוון מ-claim_auto_execution הקיים
-- (83-automatic-tasks.sql): שם התפיסה משתחררת רק כי הקורא הוא edge function
-- שרץ עד הסוף ומשחרר בעצמו. כאן הקורא הוא תהליך על מחשב משרד — יכול להיהרג,
-- לאבד רשת, להירדם. בלי תפוגה, משימה כזאת הייתה תקועה לצמיתות. תפוגת החכירה
-- הופכת את אותה שורה לזמינה מחדש לתפיסה הבאה, בלי סריקה נפרדת: שאילתת
-- claim_next_automation_job רואה גם 'queued' וגם 'running שפג' כאותו דבר.
--
-- ‼ תוצאה היא תמיד הצעה, לא כתיבה. עובד אוטומטי לא כותב עובדה מקצועית ישירות
-- ל-clients — הוא מציע (tax_fact_changes, ראה מיגרציה 151) והרו"ח מאשר/דוחה,
-- בדיוק כמו כל מקור אחר. שום דבר כאן לא עוקף את זה.

-- ── 1. הטבלה ─────────────────────────────────────────────────────────────

create table public.automation_jobs (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  -- מפתח הדיספאץ' של העובד המקומי, למשל 'dev.test_automation' או
  -- 'shaam.withholding_certificate'. בלי CHECK — הרישום החי הוא קטלוג
  -- ה-handlers בעובד, לא רשימה כאן שצריך מיגרציה כדי להוסיף לה שורה.
  action_type   text not null,
  -- קלט ספציפי לפעולה, כפי שנקבע ב-PIVO בזמן היצירה. העובד לא קורא clients
  -- בעצמו כדי לגלות מה הוזמן — כל מה שהוא צריך כבר כאן.
  input         jsonb not null default '{}'::jsonb,

  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'needs_human', 'succeeded', 'failed', 'cancelled')),
  claimed_by    text,          -- מזהה תהליך העובד שתפס
  claimed_at    timestamptz,
  -- ‼ העמודה שהמנגנון הקיים (83) חסר. בלעדיה עובד שנהרג באמצע משימה תוקע
  -- אותה לצמיתות. ראה claim_next_automation_job למטה.
  lease_until   timestamptz,
  attempts      int not null default 0,
  max_attempts  int not null default 3,

  result        jsonb,               -- תוצאה מובנית מהעובד, לפי הפעולה
  artifacts     jsonb not null default '[]'::jsonb,  -- [{kind, ...}] — קבצים חיים במסמכי הלקוח, לא כאן
  error_code    text,                -- קוד קריא-למכונה: 'auth_required' | 'timeout' | ...
  error_detail  text,                -- משפט קריא-לאדם, מוצג ב-PIVO
  needs_human   text,                -- מה בדיוק דרוש מהרו"ח, כש-status='needs_human'

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index automation_jobs_user_status_idx   on public.automation_jobs(user_id, status);
create index automation_jobs_client_action_idx on public.automation_jobs(client_id, action_type);

-- לכל היותר משימה פתוחה אחת לאותו (לקוח, פעולה) בו-זמנית — לחיצה כפולה על
-- הכפתור לא יוצרת שתי משימות; create_automation_job מחזירה את הפתוחה הקיימת.
create unique index automation_jobs_open_unique
  on public.automation_jobs(client_id, action_type)
  where status in ('queued', 'running', 'needs_human');

alter table public.automation_jobs enable row level security;

-- קריאה ישירה מהדפדפן (polling של סטטוס). כתיבה — אך ורק דרך ה-RPCs למטה:
-- כל מעבר סטטוס דורש אימות בעלות/חכירה **באותה טרנזקציה** שמבצעת אותו, וזה
-- בדיוק מה ש-security definer + בדיקה בתוך ה-UPDATE נותנים ו-RLS לבד לא.
create policy "automation_jobs_select_own" on public.automation_jobs
  for select using (auth.uid() = user_id);

create trigger automation_jobs_updated_at
  before update on public.automation_jobs
  for each row execute function public.set_updated_at();

-- ── 2. נוכחות עובד — heartbeat/last-seen ─────────────────────────────────
-- כדי ש-PIVO יוכל להבחין "המשימה רצה" מ"מחשב האוטומציה כבוי", בלי לבנות
-- מוצר ניהול-עובדים: שורה אחת לכל עובד, מתעדכנת בכל poll (גם ריק).

create table public.automation_workers (
  worker_id     text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  version       text,
  last_seen_at  timestamptz not null default now()
);

alter table public.automation_workers enable row level security;

create policy "automation_workers_select_own" on public.automation_workers
  for select using (auth.uid() = user_id);

-- ── 3. סוד העובד — Vault, באותה שיטה בדיוק כמו quotation_reminder_cron_secret ──
-- נוצר בתוך המסד ולעולם לא עובר דרך כלי חיצוני. העובד המקומי מקבל את הערך
-- **פעם אחת**, ידנית (scripts/print-worker-secret.mjs), לתוך worker/.env
-- המקומי שלו — הוא לעולם לא נשמר במסד כטקסט גלוי ולעולם לא מגיע ל-Git.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'automation_worker_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'automation_worker_secret');
  end if;
end $$;

create or replace function public.verify_automation_worker_secret(p text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'automation_worker_secret' and decrypted_secret = p
  );
$$;

revoke all on function public.verify_automation_worker_secret(text) from public, anon, authenticated;
grant execute on function public.verify_automation_worker_secret(text) to service_role;

-- ── 4. יצירה וביטול — נקראות מהדפדפן, כמשתמש המחובר ──────────────────────

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
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
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

-- ‼ 'running' נשאר מחוץ לטווח בכוונה: ביטול משימה שכבר נתפסה דורש שיתוף
-- פעולה מהעובד (הוא זה שמחזיק אותה) — מעבר לתחום המילסטון הזה.
create or replace function public.cancel_automation_job(p_job_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  update public.automation_jobs
     set status = 'cancelled', finished_at = now()
   where id = p_job_id
     and user_id = v_uid
     and status in ('queued', 'needs_human')
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.cancel_automation_job(text) from public, anon;
grant execute on function public.cancel_automation_job(text) to authenticated;

-- ── 5. תפיסה, חכירה, דיווח — נקראות אך ורק מ-edge function automation-worker,
--       שמאמתת קודם x-worker-secret מול verify_automation_worker_secret.
--       ה-service_role עצמו לא נחשף לעובד המקומי בשום שלב — ראה §6 בהמשך
--       ותיעוד ב-worker/README.md.

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
  -- העוגן: 'queued' רגיל, או 'running' שהחכירה שלו כבר פקעה (עובד שמת/נתקע) —
  -- שתי הצורות זהות מנקודת המבט של מי שמחפש עבודה. FOR UPDATE SKIP LOCKED
  -- הוא הבטחת האטומיות: שני עובדים שתופסים באותו רגע לא יכולים לזכות באותה
  -- שורה — השני פשוט מדלג אליה ומוצא את הבאה.
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

-- פעימת נוכחות: מתעדכנת בכל poll (גם ריק, כש-p_job_id הוא null) ומאריכה
-- חכירה כשיש משימה פעילה. שתי הפעולות באותה קריאה — לא שתי נקודות קצה.
create or replace function public.heartbeat_automation_job(
  p_user_id        uuid,
  p_worker_id      text,
  p_job_id         text default null,
  p_lease_seconds  int  default 60,
  p_worker_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.automation_jobs;
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, version)
  values (p_worker_id, p_user_id, now(), p_worker_version)
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        version      = coalesce(excluded.version, public.automation_workers.version);

  if p_job_id is null then
    return jsonb_build_object('ok', true);
  end if;

  update public.automation_jobs
     set lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_job_id
     and claimed_by = p_worker_id
     and user_id = p_user_id
     and status = 'running'
   returning * into v_job;

  if not found then
    -- ‼ לא שגיאת תשתית: קורה כשהמשימה כבר הושלמה/נכשלה בזמן שהחכירה
    -- הבאה עמדה בתור. העובד עוצר את החכירה הזאת בשקט ולא מציג שגיאה.
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_finished');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.heartbeat_automation_job(uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.heartbeat_automation_job(uuid, text, text, int, text) to service_role;

create or replace function public.complete_automation_job(
  p_worker_id text,
  p_job_id    text,
  p_result    jsonb default '{}'::jsonb,
  p_artifacts jsonb default '[]'::jsonb
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
     set status       = 'succeeded',
         result       = p_result,
         artifacts    = coalesce(p_artifacts, '[]'::jsonb),
         error_code   = null,
         error_detail = null,
         needs_human  = null,
         finished_at  = now()
   where id = p_job_id
     and claimed_by = p_worker_id
     and status = 'running'
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_already_finished');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.complete_automation_job(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_automation_job(text, text, jsonb, jsonb) to service_role;

-- p_needs_human לא-null ⇒ 'needs_human' (לא סופי — ממתין לאדם); אחרת 'failed'
-- (סופי). שני המצבים נכתבים דרך אותה פונקציה כי שניהם "העובד הפסיק לרוץ
-- ומדווח למה" — ההבדל היחיד הוא אם יש עוד סיכוי בלי קוד חדש.
create or replace function public.fail_automation_job(
  p_worker_id    text,
  p_job_id       text,
  p_error_code   text,
  p_error_detail text default null,
  p_needs_human  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job    public.automation_jobs;
  v_status text := case when p_needs_human is not null then 'needs_human' else 'failed' end;
begin
  update public.automation_jobs
     set status       = v_status,
         error_code   = p_error_code,
         error_detail = left(coalesce(p_error_detail, ''), 500),
         needs_human  = p_needs_human,
         finished_at  = case when v_status = 'failed' then now() else null end
   where id = p_job_id
     and claimed_by = p_worker_id
     and status = 'running'
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_already_finished');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

revoke all on function public.fail_automation_job(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fail_automation_job(text, text, text, text, text) to service_role;
