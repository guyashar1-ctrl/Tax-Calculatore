-- ═══════════════════════════════════════════════════════════════════════════
-- 270 · «הפעל הכול» — משימת אוטומציה שממתינה לקודמת מאותו סוג (21.10.2026)
--
-- המקרה: ליאת ואוריה ברנשטיין. גיא: «לחיצה אחת, והוא ירוץ גם בשע״ם וגם בביטוח לאומי
-- לשניהם». ‼ automation_jobs_open_unique מתיר משימה פתוחה אחת לכל (לקוח, סוג פעולה) —
-- ב״ל של ליאת ושל אוריה הם אותו סוג, ולכן אי אפשר להכניס את שתיהן לתור יחד.
--
-- הפתרון: «המשך» — משימה ששמורה כאן ונכנסת לתור בשרת ברגע שהקודמת יוצאת ממצב פתוח
-- (הצליחה, נכשלה או בוטלה). ‼ לא נכנסת כשהקודמת «ממתינה לך» (needs_human) — שם הרו"ח
-- מכריע, ורק אחר כך ממשיכים. הדפדפן לא צריך להישאר פתוח.
--
-- ‼ שום ניסיון חוזר לא נולד כאן: כל «המשך» נכנס לתור פעם אחת בדיוק (released), עם אותו
--   max_attempts כמו create_automation_job (פעולה משנה ⇒ ניסיון אחד, 196).
-- ‼ להריץ דרך execute_sql/prod-apply-migration ולאמת.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.automation_job_followups (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       text not null references public.clients(id) on delete cascade,
  action_type     text not null,
  input           jsonb not null default '{}'::jsonb,
  after_job_id    text not null references public.automation_jobs(id) on delete cascade,
  status          text not null default 'waiting' check (status in ('waiting', 'released', 'cancelled', 'skipped')),
  released_job_id text references public.automation_jobs(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists automation_job_followups_after_idx
  on public.automation_job_followups (after_job_id) where status = 'waiting';
create index if not exists automation_job_followups_client_idx
  on public.automation_job_followups (client_id, status);

alter table public.automation_job_followups enable row level security;
drop policy if exists automation_job_followups_owner_read on public.automation_job_followups;
create policy automation_job_followups_owner_read on public.automation_job_followups
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.automation_job_followups from anon, authenticated;

/**
 * יוצר משימה שתיכנס לתור אחרי `p_after_job_id`. הקודמת כבר לא פתוחה ⇒ נכנסת עכשיו
 * (create_automation_job, אותה הכרעה בדיוק). ‼ «המשך» ממתין קיים לאותו (לקוח, סוג, תפקיד/הגשה)
 * מוחזר — לחיצה כפולה לא יוצרת שניים.
 */
create or replace function public.create_automation_job_after(
  p_client_id text, p_action_type text, p_input jsonb, p_after_job_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_after public.automation_jobs;
  v_f     public.automation_job_followups;
  v_who   text := coalesce(p_input->>'submissionKey', p_input->>'role', '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;
  select * into v_after from public.automation_jobs where id = p_after_job_id and user_id = v_uid;
  if v_after.id is null then return jsonb_build_object('ok', false, 'error', 'after_job_not_found'); end if;

  if v_after.status not in ('queued', 'running', 'needs_human') then
    return public.create_automation_job(p_client_id, p_action_type, p_input) || jsonb_build_object('immediate', true);
  end if;

  select * into v_f from public.automation_job_followups
   where client_id = p_client_id and action_type = p_action_type and status = 'waiting'
     and coalesce(input->>'submissionKey', input->>'role', '') = v_who
   order by created_at desc limit 1;
  if v_f.id is not null then
    if exists (select 1 from public.automation_jobs j where j.id = v_f.after_job_id
                and j.status in ('queued', 'running', 'needs_human')) then
      return jsonb_build_object('ok', true, 'created', false, 'followup', to_jsonb(v_f));
    end if;
    -- הקודמת שלו נסגרה בלי לשחרר אותו (בוטלה מ«ממתין לך») — מוחלף בזה.
    update public.automation_job_followups
       set status = 'cancelled', note = 'הוחלף בהפעלה חדשה', updated_at = now()
     where id = v_f.id;
  end if;

  insert into public.automation_job_followups (user_id, client_id, action_type, input, after_job_id)
  values (v_uid, p_client_id, p_action_type, coalesce(p_input, '{}'::jsonb), p_after_job_id)
  returning * into v_f;
  return jsonb_build_object('ok', true, 'created', true, 'followup', to_jsonb(v_f));
end;
$$;
revoke all on function public.create_automation_job_after(text, text, jsonb, text) from public, anon;
grant execute on function public.create_automation_job_after(text, text, jsonb, text) to authenticated;

/** ביטול «המשך» שעוד ממתין — רק של המשתמש עצמו. */
create or replace function public.cancel_automation_job_followup(p_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_f public.automation_job_followups;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  update public.automation_job_followups
     set status = 'cancelled', note = 'בוטל על ידי המשרד', updated_at = now()
   where id = p_id and user_id = auth.uid() and status = 'waiting'
  returning * into v_f;
  if v_f.id is null then return jsonb_build_object('ok', false, 'error', 'not_waiting'); end if;
  return jsonb_build_object('ok', true, 'followup', to_jsonb(v_f));
end;
$$;
revoke all on function public.cancel_automation_job_followup(text) from public, anon;
grant execute on function public.cancel_automation_job_followup(text) to authenticated;

/**
 * הקודמת יצאה ממצב פתוח ⇒ ה«המשך» שלה נכנס לתור. ‼ כשבינתיים נפתחה משימה אחרת מאותו
 * סוג (לחיצה ידנית), ה«המשך» עובר לחכות לה — לא נוצרת כפילות ולא נזרקת שגיאה.
 * ‼ אותו אדם/הגשה כבר הופעל/ה ידנית אחרי שה«המשך» נוצר ⇒ skipped: לא פונים לרשות פעמיים.
 * ‼ משימה שנחסמה בהכנסה (למשל ב״ל לאדם שבוטל, 212) — ה«המשך» מסומן skipped עם הסיבה,
 *   והקודמת לא נכשלת בגללו.
 */
create or replace function public._release_automation_job_followups()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  f      public.automation_job_followups;
  v_open public.automation_jobs;
  v_job  public.automation_jobs;
begin
  for f in select * from public.automation_job_followups
            where after_job_id = new.id and status = 'waiting'
            order by created_at
  loop
    if exists (select 1 from public.automation_jobs j
                where j.client_id = f.client_id and j.action_type = f.action_type
                  and j.created_at > f.created_at and j.status <> 'cancelled'
                  and coalesce(j.input->>'submissionKey', j.input->>'role', '')
                      = coalesce(f.input->>'submissionKey', f.input->>'role', '')) then
      update public.automation_job_followups
         set status = 'skipped', note = 'כבר הופעל ידנית', updated_at = now()
       where id = f.id;
      continue;
    end if;
    v_open := null;
    select * into v_open from public.automation_jobs
     where client_id = f.client_id and action_type = f.action_type
       and status in ('queued', 'running', 'needs_human')
     order by created_at desc limit 1;
    if v_open.id is not null then
      update public.automation_job_followups
         set after_job_id = v_open.id, updated_at = now()
       where id = f.id;
      continue;
    end if;
    begin
      insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
      values (f.user_id, f.client_id, f.action_type, f.input, 'queued',
              case when public.is_external_mutation_action(f.action_type) then 1 else 3 end)
      returning * into v_job;
      update public.automation_job_followups
         set status = 'released', released_job_id = v_job.id, updated_at = now()
       where id = f.id;
    exception when others then
      update public.automation_job_followups
         set status = 'skipped', note = left(sqlerrm, 300), updated_at = now()
       where id = f.id;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function public._release_automation_job_followups() from public, anon, authenticated;

-- ‼ ביטול מ«ממתין לך» אינו שחרור: זה הרגע של «כן, נסה שוב» (ביטול ואז משימה חדשה לאותו
--   אדם). שחרור שם היה תופס את המקום בתור, והניסיון החוזר של הרו"ח לא היה נוצר.
--   המשימה החדשה מקבלת את ה«המשך» (הטריגר הבא).
drop trigger if exists trg_release_automation_job_followups on public.automation_jobs;
create trigger trg_release_automation_job_followups
  after update of status on public.automation_jobs
  for each row
  when (old.status in ('queued', 'running', 'needs_human')
        and (new.status in ('succeeded', 'failed')
             or (new.status = 'cancelled' and old.status <> 'needs_human')))
  execute function public._release_automation_job_followups();

/** משימה חדשה מאותו סוג ⇒ «המשך» שהקודמת שלו כבר לא פתוחה עובר לחכות לה. */
create or replace function public._repoint_automation_job_followups()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.automation_job_followups f
     set after_job_id = new.id, updated_at = now()
   where f.client_id = new.client_id and f.action_type = new.action_type and f.status = 'waiting'
     and coalesce(f.input->>'submissionKey', f.input->>'role', '')
         <> coalesce(new.input->>'submissionKey', new.input->>'role', '')
     and not exists (select 1 from public.automation_jobs j where j.id = f.after_job_id
                      and j.status in ('queued', 'running', 'needs_human'));
  return null;
end;
$$;
revoke all on function public._repoint_automation_job_followups() from public, anon, authenticated;

drop trigger if exists trg_repoint_automation_job_followups on public.automation_jobs;
create trigger trg_repoint_automation_job_followups
  after insert on public.automation_jobs
  for each row when (new.client_id is not null and new.status = 'queued')
  execute function public._repoint_automation_job_followups();
