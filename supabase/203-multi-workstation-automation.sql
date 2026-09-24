-- ─── 203: אוטומציה מכמה מחשבי עבודה ──────────────────────────────────────────
--
-- הרקע (24.09.2026): האוטומציה הייתה קשורה ל«מחשב האוטומציה» אחד. העובד
-- הזדהה בסוד משותף אחד (vault: automation_worker_secret) ואמר בעצמו מי הוא
-- (worker_id) ובשביל מי הוא עובד (user_id) — ו-heartbeat אף דרס את user_id
-- של שורה קיימת. המסך קרא «העובד האחרון» בלבד.
--
-- מה משתנה (הכול תוסף; שום עמודה/שורה לא נמחקת):
--   ① זהות מחשב עבודה: automation_workers מקבל token_hash (sha256 של אסימון
--      אישי שנשאר רק במחשב), label, capabilities, revoked_at, ומופע-תהליך
--      (instance_id). אסימון ⇒ השרת גוזר user_id/worker_id בעצמו.
--   ② רישום: קוד צימוד חד-פעמי (15 דק') שמשתמש מחובר יוצר ב-PIVO; תוכנת
--      ההתקנה פודה אותו פעם אחת ומקבלת אסימון. אין סודות ב-git, ואין העברת
--      אסימון ממחשב למחשב דרך הענן.
--   ③ מופע אחד לכל זהות: תהליך נוסף עם אותה זהות (כפול באותו מחשב, או
--      .env שהועתק למחשב אחר) לא תופס עבודה כל עוד המופע הקיים חי.
--   ④ התאמת משימה למחשב: רק מחשב עם היכולת (shaam/btl); משימה שצריכה חיבור
--      פעיל הולכת קודם למחשב שהחיבור פתוח בו; התחברות (שדורשת אדם ליד
--      המחשב) הולכת למחשב שבו עבדו לאחרונה. ‼ מפנים רק למחשב שמתשאל עכשיו
--      את הסוג הזה — העדפה, לעולם לא חסימה של מי שכן יכול.
--   ⑤ ב״ל: btl.create_representation היא פעולה משנה — אותו כלל כמו שע״ם
--      (196): ניסיון אחד, חכירה שפקעה ⇒ needs_human, אין חידוש של משימה שכבר
--      נגעה ברשות.
--   ⑥ heartbeat/status לא דורסים user_id של שורה קיימת.
--
-- ‼ חתימות: הגרסאות החדשות (עם p_instance) בלי ברירות מחדל כלל, והישנות שומרות
--   בדיוק את ברירות המחדל שלהן — כך ש-PostgREST לעולם לא רואה שני מועמדים.
-- ‼ אטומיות התפיסה לא השתנתה: UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
--   LOCKED). שני מחשבים שמושכים באותו רגע — רק אחד מקבל את השורה.

-- ── ① עמודות ────────────────────────────────────────────────────────────────
alter table public.automation_workers
  add column if not exists token_hash      text,
  add column if not exists label           text,
  add column if not exists capabilities    text[] not null default array['shaam', 'btl'],
  add column if not exists registered_at   timestamptz,
  add column if not exists revoked_at      timestamptz,
  add column if not exists instance_id     text,
  add column if not exists instance_seen_at timestamptz,
  -- מתי המחשב ביקש עבודה לאחרונה, ולאילו סוגים — «מי באמת ייקח את זה עכשיו».
  add column if not exists last_claim_at    timestamptz,
  add column if not exists claim_action_types text[];

create unique index if not exists automation_workers_token_hash_uq
  on public.automation_workers (token_hash) where token_hash is not null;

-- ── ② צימוד ─────────────────────────────────────────────────────────────────
create table if not exists public.automation_workstation_pairings (
  code_hash   text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text,
  worker_id   text,            -- רישום-מחדש של זהות קיימת של אותו משתמש (הגירה)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
alter table public.automation_workstation_pairings enable row level security;
-- ‼ אין מדיניות: אף לקוח (anon/authenticated) לא קורא את הטבלה. יצירה רק דרך
--   create_workstation_pairing, פדיון רק דרך השרת.

create or replace function public._sha256_hex(p text)
returns text language sql immutable set search_path to 'public', 'extensions' as $function$
  select encode(extensions.digest(convert_to(p, 'UTF8'), 'sha256'), 'hex');
$function$;
revoke all on function public._sha256_hex(text) from public, anon, authenticated;

/** משתמש מחובר ⇒ קוד צימוד חד-פעמי. הקוד מוחזר פעם אחת; נשמר רק ה-hash. */
create or replace function public.create_workstation_pairing(p_label text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  -- 10 תווים מאלפבית בלי תווים מתבלבלים (0/O, 1/I/L).
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '')
    into v_code
    from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) i;
  delete from public.automation_workstation_pairings
   where user_id = v_uid and (used_at is not null or expires_at < now());
  insert into public.automation_workstation_pairings (code_hash, user_id, label, expires_at)
  values (public._sha256_hex(v_code), v_uid, nullif(trim(coalesce(p_label, '')), ''), now() + interval '15 minutes');
  return jsonb_build_object('ok', true, 'code', v_code, 'expiresInMinutes', 15);
end;
$function$;
revoke all on function public.create_workstation_pairing(text) from public, anon;
grant execute on function public.create_workstation_pairing(text) to authenticated;

/**
 * פדיון קוד (השרת בלבד): יוצר/מעדכן את זהות המחשב עם hash האסימון שהשרת
 * הנפיק. ‼ p_worker_id — רק לרישום-מחדש של זהות **קיימת של אותו משתמש**
 * (הגירת המחשב הנוכחי); זהות של משתמש אחר ⇒ נדחה.
 */
create or replace function public.redeem_workstation_pairing(
  p_code text, p_token_hash text, p_new_worker_id text, p_existing_worker_id text default null, p_label text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_pair public.automation_workstation_pairings;
  v_wid  text;
  v_row  public.automation_workers;
begin
  update public.automation_workstation_pairings
     set used_at = now()
   where code_hash = public._sha256_hex(upper(trim(p_code)))
     and used_at is null and expires_at > now()
   returning * into v_pair;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  v_wid := coalesce(nullif(trim(p_existing_worker_id), ''), p_new_worker_id);
  select * into v_row from public.automation_workers where worker_id = v_wid;
  if found and v_row.user_id <> v_pair.user_id then
    return jsonb_build_object('ok', false, 'error', 'worker_belongs_to_another_account');
  end if;
  if not found and p_existing_worker_id is not null then
    return jsonb_build_object('ok', false, 'error', 'existing_worker_not_found');
  end if;

  insert into public.automation_workers (worker_id, user_id, last_seen_at, token_hash, label, registered_at, revoked_at)
  values (v_wid, v_pair.user_id, now(), p_token_hash, coalesce(p_label, v_pair.label), now(), null)
  on conflict (worker_id) do update
     set token_hash = excluded.token_hash,
         label = coalesce(excluded.label, public.automation_workers.label),
         registered_at = now(),
         revoked_at = null;
  return jsonb_build_object('ok', true, 'workerId', v_wid, 'userId', v_pair.user_id);
end;
$function$;
revoke all on function public.redeem_workstation_pairing(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_workstation_pairing(text, text, text, text, text) to service_role;

/** אימות אסימון (השרת בלבד) ⇒ הזהות שהשרת יכפה על כל הבקשה. */
create or replace function public.authenticate_workstation(p_worker_id text, p_token text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(
    (select jsonb_build_object('ok', true, 'workerId', w.worker_id, 'userId', w.user_id)
       from public.automation_workers w
      where w.worker_id = p_worker_id
        and w.token_hash is not null
        and w.token_hash = public._sha256_hex(p_token)
        and w.revoked_at is null),
    jsonb_build_object('ok', false, 'error', 'unauthorized'));
$function$;
revoke all on function public.authenticate_workstation(text, text) from public, anon, authenticated;
grant execute on function public.authenticate_workstation(text, text) to service_role;

/** האם לזהות הזאת יש אסימון (ואז הסוד המשותף הישן אינו מספיק לה). */
create or replace function public.workstation_requires_token(p_worker_id text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.automation_workers where worker_id = p_worker_id and token_hash is not null);
$function$;
revoke all on function public.workstation_requires_token(text) from public, anon, authenticated;
grant execute on function public.workstation_requires_token(text) to service_role;

-- ── ③ נגיעת מופע: הזהות חיה, ומופע אחד בלבד ─────────────────────────────────
/**
 * כל פנייה של עובד עוברת כאן. ‼ לעולם לא מחליפה user_id של שורה קיימת.
 * מופע אחר של אותה זהות שנראה ב-30 השניות האחרונות ⇒ 'instance_conflict',
 * ואז אסור לתפוס עבודה. מופע ותיק שלא נראה ⇒ המופע החדש מחליף אותו (הפעלה מחדש).
 */
create or replace function public.automation_worker_touch(p_user_id uuid, p_worker_id text, p_instance text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_row public.automation_workers;
begin
  select * into v_row from public.automation_workers where worker_id = p_worker_id for update;
  if not found then
    insert into public.automation_workers (worker_id, user_id, last_seen_at, instance_id, instance_seen_at)
    values (p_worker_id, p_user_id, now(), p_instance, case when p_instance is null then null else now() end);
    return 'ok';
  end if;
  if v_row.user_id <> p_user_id then return 'wrong_account'; end if;
  if v_row.revoked_at is not null then return 'revoked'; end if;
  if p_instance is not null and v_row.instance_id is not null and v_row.instance_id <> p_instance
     and v_row.instance_seen_at > now() - interval '30 seconds' then
    return 'instance_conflict';
  end if;
  update public.automation_workers
     set last_seen_at = now(),
         instance_id = coalesce(p_instance, instance_id),
         instance_seen_at = case when p_instance is null then instance_seen_at else now() end
   where worker_id = p_worker_id;
  return 'ok';
end;
$function$;
revoke all on function public.automation_worker_touch(uuid, text, text) from public, anon, authenticated;

-- ── ④ התאמת משימה למחשב ─────────────────────────────────────────────────────
create or replace function public.automation_job_subsystem(p_action_type text)
returns text language sql immutable set search_path to 'public' as $function$
  select case when p_action_type like 'shaam.%' then 'shaam'
              when p_action_type like 'btl.%' then 'btl' else null end;
$function$;

/** פעולה שדורשת אדם ליד המחשב (הזנת אישור דיגיטלי/קוד). */
create or replace function public.automation_job_is_interactive(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_action_type in ('shaam.connect', 'btl.connect');
$function$;

/** פעולה שצריכה חיבור פעיל לרשות (לא התחברות/ניתוק/זיהוי). */
create or replace function public.automation_job_needs_session(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select public.automation_job_subsystem(p_action_type) is not null
     and p_action_type not in ('shaam.connect', 'shaam.disconnect', 'shaam.detect', 'shaam.check_auth',
                               'btl.connect', 'btl.disconnect');
$function$;

create or replace function public.automation_worker_fresh(w public.automation_workers)
returns boolean language sql stable set search_path to 'public' as $function$
  select w.revoked_at is null and w.last_seen_at > now() - interval '90 seconds';
$function$;

/**
 * המחשב הזה מבקש עכשיו עבודה מהסוג הזה (תשאול ב-20 השניות האחרונות, והסוג
 * ברשימה שלו). ‼ רק למחשב כזה מפנים משימה — מחשב «מחובר» שלא לוקח את הסוג
 * הזה (למשל עובד ב״ל בלבד), או שהפסיק לתשאל, לא חוסם אף אחד.
 */
create or replace function public.automation_worker_polling(w public.automation_workers, p_action_type text)
returns boolean language sql stable set search_path to 'public' as $function$
  select public.automation_worker_fresh(w)
     and w.last_claim_at > now() - interval '20 seconds'
     and (w.claim_action_types is null or p_action_type = any(w.claim_action_types));
$function$;

create or replace function public.automation_worker_session(w public.automation_workers, p_subsystem text)
returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce((w.status #>> array[p_subsystem, 'connected'])::boolean, false);
$function$;

/** שניות מאז קלט אחרון במחשב (מקלדת/עכבר). לא ידוע ⇒ אינסוף. */
create or replace function public.automation_worker_idle(w public.automation_workers)
returns numeric language sql stable set search_path to 'public' as $function$
  select case
    when (w.status #>> '{host,idleSeconds}') ~ '^[0-9.]+$'
     and (w.status #>> '{host,reportedAt}') ~ '^\d{4}-'
     and (w.status #>> '{host,reportedAt}')::timestamptz > now() - interval '3 minutes'
    then (w.status #>> '{host,idleSeconds}')::numeric
    else 1e12 end;
$function$;

/**
 * האם המחשב הזה הוא הנכון לפעולה הזאת עכשיו. ‼ לא אבטחה (זה בתפיסה עצמה
 * ובאסימון) — בחירה: לא לגנוב משימה ממחשב שמתאים לה יותר.
 */
create or replace function public.automation_worker_should_take(me public.automation_workers, p_action_type text)
returns boolean language plpgsql stable set search_path to 'public' as $function$
declare
  v_sub text := public.automation_job_subsystem(p_action_type);
begin
  if v_sub is null then return true; end if;
  if not (v_sub = any(me.capabilities)) then return false; end if;

  if public.automation_job_is_interactive(p_action_type) then
    -- התחברות: המחשב שבו נגעו לאחרונה במקלדת/עכבר. שוויון ⇒ לפי מזהה.
    return not exists (
      select 1 from public.automation_workers o
       where o.user_id = me.user_id and o.worker_id <> me.worker_id
         and public.automation_worker_polling(o, p_action_type) and v_sub = any(o.capabilities)
         and (public.automation_worker_idle(o) < public.automation_worker_idle(me)
              or (public.automation_worker_idle(o) = public.automation_worker_idle(me) and o.worker_id < me.worker_id)));
  end if;

  if public.automation_job_needs_session(p_action_type) and not public.automation_worker_session(me, v_sub) then
    -- אין לי חיבור; אם למחשב אחר יש — הוא יתפוס. אם לאף אחד אין, אני תופס
    -- ומבקש התחברות כרגיל (awaiting_*_auth).
    return not exists (
      select 1 from public.automation_workers o
       where o.user_id = me.user_id and o.worker_id <> me.worker_id
         and public.automation_worker_polling(o, p_action_type) and v_sub = any(o.capabilities)
         and public.automation_worker_session(o, v_sub));
  end if;
  return true;
end;
$function$;

-- ── ⑤ ב״ל היא פעולה משנה ────────────────────────────────────────────────────
create or replace function public.is_external_mutation_action(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_action_type in ('shaam.create_representation', 'shaam.submit_poa', 'btl.create_representation');
$function$;

-- ── התפיסה ───────────────────────────────────────────────────────────────────
-- ‼ גוף 196, ועליו: נגיעת מופע (③), סינון התאמה (④), והודעה לפי רשות.
create or replace function public.claim_next_automation_job(
  p_user_id uuid, p_worker_id text, p_action_types text[], p_lease_seconds integer, p_instance text
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_job   public.automation_jobs;
  v_me    public.automation_workers;
  v_touch text;
begin
  v_touch := public.automation_worker_touch(p_user_id, p_worker_id, p_instance);
  if v_touch <> 'ok' then
    return jsonb_build_object('blocked', v_touch);
  end if;
  update public.automation_workers
     set last_claim_at = now(), claim_action_types = p_action_types
   where worker_id = p_worker_id
   returning * into v_me;

  update public.automation_jobs
     set status      = 'needs_human',
         error_code  = case when public.job_touched_external(progress)
                            then 'external_outcome_unknown'
                            else 'worker_stopped_before_external' end,
         -- ‼ הניסוח של שע״ם זהה ל-196 (בדיקות 196 נשענות עליו); לב״ל ניסוח משלה.
         needs_human = case
           when public.job_touched_external(progress) and action_type like 'btl.%'
           then 'ההזנה מול ביטוח לאומי נעצרה באמצע, ולא ידוע אם ביטוח לאומי קלט אותה. '
             || 'המערכת לא תנסה שוב מעצמה — ניסיון חוזר עלול ליצור ייפוי כוח כפול. '
             || 'בדקו במסך «מעקב ייפוי כוח» מה נקלט בפועל, ורק לפי זה החליטו אם לנסות שוב.'
           when public.job_touched_external(progress)
           then 'הפעולה מול שע״ם נעצרה באמצע, ולא ידוע אם שע״ם קלטה אותה. '
             || 'המערכת לא תנסה שוב מעצמה — ניסיון חוזר עלול ליצור בקשה או '
             || 'שידור כפולים. הריצו «בדוק קבלת הייצוג» כדי לראות מה נקלט בפועל, '
             || 'ורק לפי זה החליטו אם לנסות שוב.'
           else 'הפעולה נעצרה לפני שנגעה ב' || case when action_type like 'btl.%' then 'ביטוח לאומי' else 'שע״ם' end
             || ' (מחשב העבודה נסגר או נותק). לא בוצעה שום פנייה לרשות. אפשר להריץ שוב.' end,
         error_detail = 'lease expired; no automatic retry for external mutation (196/203)',
         finished_at = null
   where user_id = p_user_id
     and status = 'running'
     and lease_until < now()
     and public.is_external_mutation_action(action_type);

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
     select j.id from public.automation_jobs j
      where j.user_id = p_user_id
        and (p_action_types is null or j.action_type = any(p_action_types))
        and j.attempts < j.max_attempts
        and not (public.is_external_mutation_action(j.action_type)
                 and public.job_touched_external(j.progress))
        and not (public.is_external_mutation_action(j.action_type) and j.status = 'running')
        and (j.status = 'queued' or (j.status = 'running' and j.lease_until < now()))
        and public.automation_worker_should_take(v_me, j.action_type)
      order by j.created_at asc
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

-- החתימה הישנה (4 פרמטרים) נשארת כעטיפה — עובד ישן ממשיך לעבוד כמו קודם.
create or replace function public.claim_next_automation_job(
  p_user_id uuid, p_worker_id text, p_action_types text[] default null, p_lease_seconds integer default 60
) returns jsonb language sql security definer set search_path to 'public' as $function$
  select public.claim_next_automation_job(p_user_id, p_worker_id, p_action_types, p_lease_seconds, null::text);
$function$;

-- ── ⑥ heartbeat / status — בלי לדרוס user_id, עם נגיעת מופע ───────────────
create or replace function public.heartbeat_automation_job(
  p_user_id uuid, p_worker_id text, p_job_id text, p_lease_seconds integer,
  p_worker_version text, p_instance text
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_job   public.automation_jobs;
  v_touch text;
begin
  v_touch := public.automation_worker_touch(p_user_id, p_worker_id, p_instance);
  if v_touch <> 'ok' then
    return jsonb_build_object('ok', false, 'error', v_touch);
  end if;
  if p_worker_version is not null then
    update public.automation_workers set version = p_worker_version where worker_id = p_worker_id;
  end if;

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
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_finished');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$;

create or replace function public.heartbeat_automation_job(
  p_user_id uuid, p_worker_id text, p_job_id text default null, p_lease_seconds integer default 60,
  p_worker_version text default null
) returns jsonb language sql security definer set search_path to 'public' as $function$
  select public.heartbeat_automation_job(p_user_id, p_worker_id, p_job_id, p_lease_seconds, p_worker_version, null::text);
$function$;

create or replace function public.report_worker_status(
  p_user_id uuid, p_worker_id text, p_status jsonb, p_instance text
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status     jsonb;
  v_job        record;
  v_capability text;
  v_ready      boolean;
  v_resumed    text[] := '{}';
  v_touch      text;
begin
  v_touch := public.automation_worker_touch(p_user_id, p_worker_id, p_instance);
  if v_touch <> 'ok' then
    return jsonb_build_object('ok', false, 'error', v_touch);
  end if;
  update public.automation_workers
     set status = coalesce(p_status, status)
   where worker_id = p_worker_id
   returning status into v_status;

  for v_job in
    select id, error_code from public.automation_jobs
     where claimed_by = p_worker_id
       and user_id = p_user_id
       and status = 'needs_human'
       and action_type in (
         'shaam.connect', 'shaam.ensure_capability',
         'btl.create_representation', 'btl.check_representation'
       )
       and cancel_requested = false
       -- ‼ 203: פעולה משנה שכבר נגעה ברשות לא מתחדשת לעולם מעצמה.
       and not (public.is_external_mutation_action(action_type) and public.job_touched_external(progress))
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

create or replace function public.report_worker_status(p_user_id uuid, p_worker_id text, p_status jsonb)
returns jsonb language sql security definer set search_path to 'public' as $function$
  select public.report_worker_status(p_user_id, p_worker_id, p_status, null::text);
$function$;

-- ── הרשאות: כל פונקציות העובד — השרת בלבד ──────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.claim_next_automation_job(uuid, text, text[], integer, text)',
    'public.claim_next_automation_job(uuid, text, text[], integer)',
    'public.heartbeat_automation_job(uuid, text, text, integer, text, text)',
    'public.heartbeat_automation_job(uuid, text, text, integer, text)',
    'public.report_worker_status(uuid, text, jsonb, text)',
    'public.report_worker_status(uuid, text, jsonb)',
    'public.automation_worker_should_take(public.automation_workers, text)',
    'public.automation_worker_fresh(public.automation_workers)',
    'public.automation_worker_session(public.automation_workers, text)',
    'public.automation_worker_idle(public.automation_workers)',
    'public.automation_worker_polling(public.automation_workers, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

select public.assert_domain_function_invariants();
