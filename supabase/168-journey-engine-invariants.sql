-- ═══════════════════════════════════════════════════════════════════════════
--  168 — מנוע המסע: אינווריאנטים של תלויות, ביטול, תבניות וסדר תצוגה
-- ═══════════════════════════════════════════════════════════════════════════
--  ספר הפערים (ביקורת 09.09.2026), אשכול C. כל סעיף כאן הוא כלל אחד שהיה
--  כתוב בשני מקומות (או באף מקום) והמסכים סתרו זה את זה בגללו.
--
--  ‼ הכללים שנקבעים כאן, בקצרה:
--   1. תלות שבוטלה — מסופקת. שלב שההורה שלו נמחק לא ימתין לו לנצח (JF6).
--   2. טבלת הקשתות (onboarding_step_dependencies) היא מקור האמת היחיד לתלות.
--      העמודה depends_on_step_id היא מראה נגזרת: ההורה הראשון לפי סדר. כתיבה
--      לעמודה עדיין מתקבלת (ממשק ישן) ומתורגמת לקשת — אבל אף אחד לא קורא
--      אותה יותר לצורך הכרעה (JF7).
--   3. כל שינוי סטטוס של שלב שנעשה בשרת עובר דרך _set_step_status — כתיבה,
--      יומן, פתיחת תלויים ובדיקת מוכנות לסגירה — במקום שלושה עותקים חלקיים
--      בטריגר הייצוג, בשדרוג הייצוג ובמסלול הפייפרלס (JF10, JF29).
--   4. האינדקס (התקשרות, סוג) מפנה מקום לשורה מבוטלת, כמו אחיו (לקוח, סוג).
--      בלי זה ריצה חוזרת של המחולל אחרי הסרה נפלה על duplicate key — וזה
--      נגיש דרך טריגר על עדכון כרטיס הלקוח (JF11).
--      ‼ מיגרציה 100 בחרה בכוונה לא לעשות זאת ולהחיות במקום — ההחייאה
--      ב-create_onboarding_request נשארת כמו שהיא; רק המחוללים האוטומטיים,
--      שלעולם לא מחיים, מפסיקים ליפול.
--   5. תבניות: מובנית ייחודית לפי seed_key בין המובנות בלבד; עותק משרדי
--      ייחודי לפי (משרד, seed_key). החלה לפי היקף המשרד, ולא לפי מי-יצר.
--      שמירת מסע כתבנית קובעת office_id (JF15, JF16, JF17, JF13).
--   6. מכתב השחרור: due_date הוא חלון ההתייחסות היחיד. הדף של הרו"ח הקודם
--      ושער הסגירה קוראים ממנו; payload.objectionDueDate הוא מראה. התנגדות
--      מפורשת אינה הסכמה — גם אחרי שהחלון עבר (JF27).
--   7. המחולל מוליד את רשימת החומרים של היום (127), לא את זו של לפני 123
--      שדרשה ארבע מיגרציות תיקון (JF24).
--   8. סדר תצוגה: publish_case_changes כבר מעתיק pending_sort_order ⇒
--      sort_order (101). הצד של הדפדפן ממוין מעכשיו לפי
--      coalesce(pending, live) — ראה src/types/onboarding.ts (JF20).
--
--  ‼ מה לא השתנה: החוזה הציבורי של advance_onboarding_step; אין סגירה
--  אוטומטית של קליטה (156) — «בדיקת מוכנות» מחזירה ערך, לא מזיזה שלב.
--  כל פונקציה נקראה מהפרודקשן (pg_get_functiondef) ונכתבת כאן במלואה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① אינדקסים ─────────────────────────────────────────────────────────────

-- JF11 · שורה מבוטלת מפנה את הצמד (התקשרות, סוג). הרשימה המוחרגת זהה ל-157.
drop index if exists public.onboarding_steps_engagement_type_idx;
create unique index onboarding_steps_engagement_type_idx
  on public.onboarding_steps (engagement_id, step_type)
  where engagement_id is not null
    and status <> 'cancelled'
    and step_type not in ('custom_request', 'authority_representation');

-- JF15 · «עדכן תבנית» על מובנית יוצר עותק משרדי עם אותו seed_key. האינדקס
-- הגלובלי של 111 הפיל את זה תמיד. מעכשיו: מובנית אחת לכל מפתח, ועותק אחד
-- לכל (משרד, מפתח).
drop index if exists public.journey_templates_seed_key_idx;
create unique index journey_templates_seed_key_idx
  on public.journey_templates (seed_key)
  where seed_key is not null and office_id is null;
create unique index if not exists journey_templates_office_seed_idx
  on public.journey_templates (office_id, seed_key)
  where seed_key is not null and office_id is not null;

-- ── ② מודל התלות: הטבלה היא המקור, העמודה מראה ────────────────────────────

-- הכלל היחיד "האם הורה מספק את התלות". שלושת הקוראים (הכרעה, פתיחה, סיבת
-- הנעילה בדף האישי) עוברים דרכו, ולכן אינם יכולים לסטות זה מזה.
-- ‼ 'cancelled' מסופק: מה שבוטל לא יקרה, ואין טעם להמתין לו.
-- ‼ 'skipped' מסופק רק עם סיבה מוכרת (46) — דילוג סתמי אינו "בוצע".
create or replace function public.step_satisfies_dependency(p_status text, p_payload jsonb)
returns boolean
language sql
immutable
as $function$
  select p_status in ('completed', 'verified', 'cancelled')
      or (p_status = 'skipped'
          and coalesce(p_payload->>'skipReason', '')
              in ('already_connected', 'transferred_rep', 'not_applicable_history', 'not_applicable'));
$function$;

revoke execute on function public.step_satisfies_dependency(text, jsonb) from public, anon, authenticated;
grant  execute on function public.step_satisfies_dependency(text, jsonb) to service_role;

-- העמודה נגזרת: ההורה הראשון לפי סדר תצוגה. null ⇔ אין קשתות.
create or replace function public.mirror_step_dependency_column(p_step_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new text;
begin
  if p_step_id is null then return; end if;
  select d.depends_on_step_id into v_new
    from public.onboarding_step_dependencies d
    join public.onboarding_steps p on p.id = d.depends_on_step_id
   where d.step_id = p_step_id
   order by coalesce(p.sort_order, 0), p.created_at, p.id
   limit 1;

  -- הדגל משתיק את הטריגר עמודה⇒קשת בזמן שהמראה נכתבת; בלעדיו כל כתיבה
  -- של המראה הייתה מוחקת קשת ומוסיפה קשת — ומתחילה סיבוב נוסף.
  perform set_config('pivo.dep_mirror', '1', true);
  update public.onboarding_steps
     set depends_on_step_id = v_new
   where id = p_step_id and depends_on_step_id is distinct from v_new;
  perform set_config('pivo.dep_mirror', '', true);
end;
$function$;

revoke execute on function public.mirror_step_dependency_column(text) from public, anon, authenticated;
grant  execute on function public.mirror_step_dependency_column(text) to service_role;

create or replace function public.mirror_step_dependency_column_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.mirror_step_dependency_column(new.step_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.step_id is distinct from new.step_id) then
    perform public.mirror_step_dependency_column(old.step_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_mirror_step_dependency_column on public.onboarding_step_dependencies;
create trigger trg_mirror_step_dependency_column
  after insert or update or delete on public.onboarding_step_dependencies
  for each row execute function public.mirror_step_dependency_column_trg();

-- עמודה ⇒ קשת (ממשק הכתיבה הישן נשאר תקף). מושתק כשהמראה היא שכותבת.
create or replace function public.sync_step_dependency_edge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('pivo.dep_mirror', true) = '1' then return new; end if;

  if tg_op = 'INSERT' then
    if new.depends_on_step_id is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (new.id, new.depends_on_step_id, new.user_id)
      on conflict do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.depends_on_step_id is distinct from new.depends_on_step_id then
    if old.depends_on_step_id is not null then
      delete from public.onboarding_step_dependencies
       where step_id = new.id and depends_on_step_id = old.depends_on_step_id;
    end if;
    if new.depends_on_step_id is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (new.id, new.depends_on_step_id, new.user_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$function$;

-- יישור חד-פעמי. סדר הפעולות חשוב: קודם עמודה שאין לה קשת הופכת לקשת (לא
-- מאבדים תלות ישנה), ורק אחר כך הטבלה מכתיבה את העמודה.
insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
select s.id, s.depends_on_step_id, s.user_id
  from public.onboarding_steps s
 where s.depends_on_step_id is not null
   and s.depends_on_step_id <> s.id
   and not exists (select 1 from public.onboarding_step_dependencies d
                    where d.step_id = s.id and d.depends_on_step_id = s.depends_on_step_id)
on conflict do nothing;

do $do$
declare r record;
begin
  for r in
    select s.id
      from public.onboarding_steps s
     where s.depends_on_step_id is distinct from (
             select d.depends_on_step_id
               from public.onboarding_step_dependencies d
               join public.onboarding_steps p on p.id = d.depends_on_step_id
              where d.step_id = s.id
              order by coalesce(p.sort_order, 0), p.created_at, p.id
              limit 1)
  loop
    perform public.mirror_step_dependency_column(r.id);
  end loop;
end
$do$;

create or replace function public.onboarding_dependency_met(p_step_id text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_unmet int;
begin
  if not exists (select 1 from public.onboarding_steps where id = p_step_id) then
    return false;
  end if;

  select count(*) into v_unmet
    from public.onboarding_step_dependencies d
    join public.onboarding_steps dep on dep.id = d.depends_on_step_id
   where d.step_id = p_step_id
     and not public.step_satisfies_dependency(dep.status, dep.payload);

  return v_unmet = 0;
end;
$function$;

revoke execute on function public.onboarding_dependency_met(text) from public, anon, authenticated;
grant  execute on function public.onboarding_dependency_met(text) to service_role;

create or replace function public.unlock_dependent_steps(p_step_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.onboarding_steps%rowtype;
  n int := 0;
begin
  for r in
    select st.* from public.onboarding_steps st
    where st.status = 'locked'
      and exists (select 1 from public.onboarding_step_dependencies d
                   where d.step_id = st.id and d.depends_on_step_id = p_step_id)
  loop
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח - התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      perform public.execute_automatic_step(r.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;

revoke execute on function public.unlock_dependent_steps(text) from public, anon, authenticated;
grant  execute on function public.unlock_dependent_steps(text) to service_role;

create or replace function public.portal_lock_reason(p_step_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  with blocking as (
    select coalesce(
             nullif(ps.payload->>'clientTitle', ''),
             case ps.step_type
               when 'paperless_connection'    then 'חיבור לפייפרלס'
               when 'paperless_invite'        then 'פתיחת חשבון פייפרלס'
               when 'retainer_authorization'  then 'הרשאת התשלום החודשי'
               when 'client_documents'        then 'המסמכים שביקשנו'
               when 'prev_accountant_details' then 'פרטי רואה החשבון הקודם'
               when 'intake_questionnaire'    then 'עדכון סטטוס מיסויי'
               when 'representation'          then 'ייפוי הכוח'
               when 'release_letter'          then 'מכתב השחרור'
               when 'materials_received'      then 'קבלת החומרים מרואה החשבון הקודם'
               when 'file_opening'            then 'פתיחת התיקים ברשויות'
               else 'השלב הקודם'
             end
           ) as lbl,
           coalesce(ps.sort_order, 0) as ord,
           ps.created_at as created
      from public.onboarding_step_dependencies d
      join public.onboarding_steps ps on ps.id = d.depends_on_step_id
     where d.step_id = p_step_id
       and not public.step_satisfies_dependency(ps.status, ps.payload)
  )
  select case when count(*) = 0 then null
              else 'ייפתח אחרי ' || string_agg(lbl, ' · ' order by ord, created)
         end
    from blocking;
$function$;

revoke execute on function public.portal_lock_reason(text) from public, anon, authenticated;
grant  execute on function public.portal_lock_reason(text) to service_role;

create or replace function public.set_onboarding_step_dependencies(p_step_id text, p_depends_on text[] default '{}'::text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s      public.onboarding_steps%rowtype;
  v_uid  uuid := auth.uid();
  v_deps text[] := coalesce(p_depends_on, '{}');
  v_bad  int;
  v_met  boolean;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status in ('completed','verified','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;

  select coalesce(array_agg(distinct d), '{}') into v_deps
    from unnest(v_deps) d where d is not null and d <> s.id;

  select count(*) into v_bad
    from unnest(v_deps) d
    left join public.onboarding_steps ds on ds.id = d and ds.client_id = s.client_id
   where ds.id is null;
  if v_bad > 0 then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;

  if exists (
    with recursive desc_steps(id) as (
      select d.step_id from public.onboarding_step_dependencies d
       where d.depends_on_step_id = s.id
      union
      select d2.step_id from public.onboarding_step_dependencies d2
        join desc_steps ds on ds.id = d2.depends_on_step_id
    )
    select 1 from desc_steps where id = any(v_deps)
  ) then
    return jsonb_build_object('ok', false, 'error', 'dependency_cycle');
  end if;

  -- הקשתות הן המקור; העמודה נגזרת מהן בטריגר.
  delete from public.onboarding_step_dependencies where step_id = s.id;
  if array_length(v_deps, 1) >= 1 then
    insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
    select s.id, d, s.user_id from unnest(v_deps) d
    on conflict do nothing;
  end if;

  v_met := public.onboarding_dependency_met(s.id);
  if s.status = 'locked' and v_met then
    update public.onboarding_steps set status = 'pending' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב נפתח - התלויות עודכנו', jsonb_build_object('from','locked','to','pending'));
  elsif s.status = 'pending' and not v_met then
    update public.onboarding_steps set status = 'locked' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב ננעל - נוספה תלות שטרם הושלמה', jsonb_build_object('from','pending','to','locked'));
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    'עודכנו התלויות של הבקשה', jsonb_build_object('dependsOn', to_jsonb(v_deps)));

  return jsonb_build_object('ok', true, 'dependsOn', to_jsonb(v_deps), 'met', v_met);
end;
$function$;

revoke execute on function public.set_onboarding_step_dependencies(text, text[]) from public, anon;
grant  execute on function public.set_onboarding_step_dependencies(text, text[]) to authenticated, service_role;

-- ── ③ שינוי סטטוס בשרת — נתיב אחד ─────────────────────────────────────────
--  כתיבה + יומן + פתיחת תלויים + בדיקת מוכנות. מוחזר: האם השתנה, כמה נפתחו,
--  והאם הקליטה מוכנה לסגירה. ‼ אינו סוגר קליטה (156): המוכנות מאירה כפתור,
--  ורק לחיצה מזיזה. פנימי — אין לו קורא מהדפדפן.
create or replace function public._set_step_status(
  p_step_id text,
  p_status text,
  p_actor text default 'system',
  p_note text default null,
  p_meta jsonb default '{}'::jsonb,
  p_ball text default null,
  p_completion_method text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s          public.onboarding_steps%rowtype;
  v_unlocked int := 0;
  v_ready    jsonb;
  v_terminal boolean;
begin
  if p_status not in ('locked','pending','in_progress','waiting_client','completed',
                      'verified','skipped','blocked','failed','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;
  if p_actor not in ('accountant', 'client', 'system') then
    return jsonb_build_object('ok', false, 'error', 'bad_actor');
  end if;

  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;

  if s.status = p_status and (p_ball is null or s.ball = p_ball) then
    return jsonb_build_object('ok', true, 'changed', false, 'from', s.status, 'to', p_status);
  end if;

  v_terminal := p_status in ('completed', 'verified', 'skipped', 'cancelled');

  update public.onboarding_steps
     set status            = p_status,
         ball              = coalesce(p_ball, ball),
         completion_method = coalesce(p_completion_method, completion_method),
         needs_attention   = case when v_terminal then false else needs_attention end,
         completed_at      = case when p_status = 'completed' and completed_at is null then now() else completed_at end,
         verified_at       = case when p_status = 'verified'  and verified_at  is null then now() else verified_at  end
   where id = s.id;

  if s.status <> p_status then
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', p_actor,
      p_note, coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('from', s.status, 'to', p_status));
    if v_terminal then
      v_unlocked := public.unlock_dependent_steps(s.id);
    end if;
  end if;

  if v_terminal and s.engagement_id is not null then
    v_ready := public.onboarding_close_readiness(s.engagement_id);
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'from', s.status, 'to', p_status,
                            'unlocked', v_unlocked,
                            'closeReady', coalesce((v_ready->>'ready')::boolean, false));
end;
$function$;

revoke execute on function public._set_step_status(text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant  execute on function public._set_step_status(text, text, text, text, jsonb, text, text) to service_role;

-- JF10 · טריגר הייצוג — המשלים היחיד של שלב הייצוג — עובר דרך הנתיב האחד.
create or replace function public.sync_representation_step()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_ball   text;
  v_note   text;
  r        record;
begin
  if coalesce(old.status,'') = coalesce(new.status,'') then return new; end if;
  if new.linked_client_id is null then return new; end if;

  case new.status
    when 'pending_fill'         then v_status := 'waiting_client'; v_ball := 'client';    v_note := 'הלקוח מתבקש למלא את פרטי הייצוג';
    when 'awaiting_accountant'  then v_status := 'in_progress';    v_ball := 'me';        v_note := 'פרטי הייצוג התקבלו - ממתין לבדיקת המשרד';
    when 'pending_signature'    then v_status := 'waiting_client'; v_ball := 'client';    v_note := 'ייפוי הכוח ממתין לחתימת הלקוח';
    when 'awaiting_stamp'       then v_status := 'in_progress';    v_ball := 'me';        v_note := 'ייפוי הכוח ממתין לחתימת המשרד';
    when 'awaiting_authorities' then v_status := 'in_progress';    v_ball := 'authority'; v_note := 'ייפוי הכוח הוגש לרשויות';
    when 'active'               then v_status := 'completed';      v_ball := 'me';        v_note := 'הייצוג נכנס לתוקף';
    else return new;
  end case;

  for r in
    select id from public.onboarding_steps
     where client_id = new.linked_client_id
       and step_type = 'representation'
       and status not in ('cancelled','skipped')
  loop
    perform public._set_step_status(r.id, v_status, 'system', v_note,
      jsonb_build_object('requestStatus', new.status, 'requestId', new.id), v_ball, 'auto');
  end loop;

  if new.status = 'awaiting_authorities' then
    perform public.ensure_rep_client_approval_step(new.linked_client_id);
  end if;

  if new.status = 'active' then
    for r in
      select id from public.onboarding_steps
       where client_id = new.linked_client_id
         and step_type = 'rep_client_approval'
         and status not in ('completed','verified','skipped','cancelled')
    loop
      perform public._set_step_status(r.id, 'completed', 'system',
        'הייצוג נכנס לתוקף - אין עוד צורך בזירוז', jsonb_build_object('requestId', new.id), 'me', 'auto');
    end loop;
  end if;

  return new;
end;
$function$;

-- JF29 · השדרוג לייצוג ראשי נסגר דרך אותו נתיב (פתיחת תלויים + מוכנות).
create or replace function public.sync_representation_upgrade_step(p_client_id text, p_reminder_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c            public.clients%rowtype;
  v_secondary  text[];
  v_step       public.onboarding_steps%rowtype;
  v_eng        text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  -- אילו רשויות רשומות כמשני. ביטוח לאומי אינו נושא רמת ייצוג ולכן אינו נספר.
  select coalesce(array_agg(k), '{}'::text[]) into v_secondary
    from jsonb_each(coalesce(c.authority_representations, '{}'::jsonb)) as t(k, v)
    where v->>'level' = 'secondary' and coalesce(v->>'status','') <> 'none';

  select * into v_step from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation_upgrade'
      and status not in ('cancelled') limit 1;

  if array_length(v_secondary, 1) is null then
    -- אין יותר ייצוג משני ⇒ השדרוג הושלם בפועל. סוגרים ולא משאירים שלב פתוח.
    if v_step.id is not null and v_step.status not in ('completed','verified') then
      perform public._set_step_status(v_step.id, 'completed', 'system',
        'כל הרשויות עברו לייצוג ראשי - השלב נסגר מעצמו', '{}'::jsonb, null, 'auto');
    end if;
    return jsonb_build_object('ok', true, 'secondary', 0, 'action', 'closed_or_none');
  end if;

  if v_step.id is null then
    select id into v_eng from public.engagements
      where client_id = p_client_id order by created_at desc limit 1;
    insert into public.onboarding_steps (
      user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, due_date, payload)
    values (
      c.user_id, v_eng, p_client_id, false, 'representation_upgrade', 'authorities', 'person', 'pending', 'me',
      (current_date + make_interval(days => p_reminder_days))::date,
      jsonb_build_object('secondaryAuthorities', to_jsonb(v_secondary)))
    returning * into v_step;
    perform public.log_onboarding_event(c.user_id, v_step.id, v_eng, 'created', 'system',
      'נפתח שלב שדרוג לייצוג ראשי - הייצוג נלקח כמשני',
      jsonb_build_object('authorities', to_jsonb(v_secondary)));
    return jsonb_build_object('ok', true, 'secondary', array_length(v_secondary, 1), 'action', 'created',
                              'stepId', v_step.id, 'dueDate', v_step.due_date);
  end if;

  -- קיים: מרעננים רק את רשימת הרשויות. תאריך התזכורת שהרו"ח קבע לא נדרס.
  update public.onboarding_steps
    set payload = payload || jsonb_build_object('secondaryAuthorities', to_jsonb(v_secondary))
    where id = v_step.id;
  return jsonb_build_object('ok', true, 'secondary', array_length(v_secondary, 1), 'action', 'refreshed',
                            'stepId', v_step.id, 'dueDate', v_step.due_date);
end;
$function$;

revoke execute on function public.sync_representation_upgrade_step(text, integer) from public, anon, authenticated;
grant  execute on function public.sync_representation_upgrade_step(text, integer) to service_role;

-- ── ④ מסלול הפייפרלס ──────────────────────────────────────────────────────
--  שינויים לעומת 46/114: (א) כל שינוי סטטוס דרך _set_step_status — ולכן
--  דילוג/ביטול פותחים תלויים ונרשמים ביומן; (ב) התלות של הרשאת התשלום
--  ושל אימות הנתונים נכתבת כקשתות ולא כעמודה; (ג) JF32 — «חיבור פייפרלס
--  לרשות המסים» נולד רק כשיש פייפרלס (130/132), ולכן «לא רלוונטי» מדלג גם
--  עליו, וחזרה למסלול פייפרלס מחזירה אותו (נעול עד החיבור, כמו בלידתו).
--  (ד) במסלול «אין עדיין» החיבור ננעל כשההרשמה חוזרת להיות פתוחה — הגרסה
--  הקודמת קראה את הסטטוס הישן של ההרשמה והשאירה את החיבור פתוח בלי הורה
--  מסופק.
create or replace function public.set_paperless_path(p_client_id text, p_paperless_status text, p_data_source text, p_software_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.onboarding_steps%rowtype;
  v_conn     public.onboarding_steps%rowtype;
  v_pta      public.onboarding_steps%rowtype;
  v_import   public.onboarding_steps%rowtype;
  v_verify   public.onboarding_steps%rowtype;
  v_retainer public.onboarding_steps%rowtype;
  v_eng      text;
  v_facts    jsonb;
  v_created  int := 0;
  v_na       boolean;
  v_res      jsonb;
  v_conn_new text;
  v_invite_open boolean;
begin
  if p_paperless_status not in ('none','other_rep','self','not_applicable')
     or p_data_source not in ('none','other_software','paperless') then
    return jsonb_build_object('ok', false, 'error', 'bad_values');
  end if;
  v_na := p_paperless_status = 'not_applicable';

  select * into v_invite from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_invite' and status <> 'cancelled' limit 1;
  select * into v_conn from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
  select * into v_pta from public.onboarding_steps
    where client_id = p_client_id and step_type = 'paperless_tax_authority' and status <> 'cancelled' limit 1;

  if v_conn.id is null then return jsonb_build_object('ok', false, 'error', 'no_paperless_steps'); end if;
  if v_uid is null or v_conn.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  v_eng := v_conn.engagement_id;
  v_facts := jsonb_build_object(
    'paperlessStatus', p_paperless_status,
    'dataSource', case when v_na then 'none' else p_data_source end,
    'softwareName', nullif(trim(coalesce(p_software_name, '')), ''));

  update public.clients set paperless_status = p_paperless_status, updated_at = now()
    where id = p_client_id;

  update public.onboarding_steps set payload = payload || v_facts
    where client_id = p_client_id and step_type in ('paperless_invite','paperless_connection')
      and status <> 'cancelled';

  if v_na then
    -- JF32 · בלי פייפרלס אין מה לחבר לרשות המסים. קודם הוא, כדי שדילוג
    -- החיבור לא "יפתח" אותו לרגע לפני שהוא מדולג.
    if v_pta.id is not null and v_pta.status not in ('completed','verified','cancelled') then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('skipReason', 'not_applicable')
       where id = v_pta.id;
      perform public._set_step_status(v_pta.id, 'skipped', 'accountant',
        'הלקוח לא יעבוד עם פייפרלס - החיבור לרשות המסים אינו נדרש', v_facts);
    end if;
    if v_invite.id is not null and v_invite.status not in ('completed','verified','cancelled') then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('skipReason', 'not_applicable')
       where id = v_invite.id;
      v_res := public._set_step_status(v_invite.id, 'skipped', 'accountant',
        'הלקוח לא יעבוד עם פייפרלס - ההרשמה אינה נדרשת', v_facts);
      if not coalesce((v_res->>'changed')::boolean, false) then
        perform public.unlock_dependent_steps(v_invite.id);
      end if;
    end if;
    if v_conn.status not in ('completed','verified','cancelled') then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('skipReason', 'not_applicable')
       where id = v_conn.id;
      v_res := public._set_step_status(v_conn.id, 'skipped', 'accountant',
        'הלקוח לא יעבוד עם פייפרלס - החיבור אינו נדרש', v_facts);
      if not coalesce((v_res->>'changed')::boolean, false) then
        perform public.unlock_dependent_steps(v_conn.id);
      end if;
    end if;

  elsif p_paperless_status in ('other_rep','self') then
    if v_invite.id is not null and v_invite.status in ('locked','pending','in_progress','waiting_client','skipped') then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('skipReason',
               case when p_paperless_status = 'other_rep' then 'transferred_rep' else 'already_connected' end)
       where id = v_invite.id;
      v_res := public._set_step_status(v_invite.id, 'skipped', 'accountant',
        case when p_paperless_status = 'other_rep'
             then 'הלקוח כבר בפייפרלס אצל מייצג אחר - ההרשמה אינה נדרשת'
             else 'הלקוח כבר רשום לפייפרלס - ההרשמה אינה נדרשת' end, v_facts);
      -- הסיבה השתנתה גם אם הסטטוס לא (דילוג ⇒ דילוג): התלויים נבדקים שוב.
      if not coalesce((v_res->>'changed')::boolean, false) then
        perform public.unlock_dependent_steps(v_invite.id);
      end if;
    end if;
    if v_conn.status not in ('completed','verified','cancelled') then
      update public.onboarding_steps
         set payload = payload - 'skipReason',
             -- 114: הבעלות של שלב החיבור היא של המשרד בכל מסלול —
             -- שם מזינים את פרטי האשראי שפייפרלס מבקשת (ראה מיגרציה 106).
             ball = 'me'
       where id = v_conn.id;
      if v_conn.status = 'skipped' then
        perform public._set_step_status(v_conn.id, 'pending', 'accountant',
          'מסלול הפייפרלס נקבע - החיבור חוזר לטיפול המשרד', v_facts, 'me');
      end if;
    end if;
  else
    v_invite_open := false;
    if v_invite.id is not null and v_invite.status = 'skipped' then
      update public.onboarding_steps set payload = payload - 'skipReason' where id = v_invite.id;
      perform public._set_step_status(v_invite.id, 'pending', 'accountant',
        'הלקוח טרם נרשם לפייפרלס - ההרשמה חוזרת לטיפול', v_facts, 'client');
      v_invite_open := true;
    end if;
    if v_conn.status in ('pending','locked','skipped') then
      v_conn_new := case
                      when v_invite.id is null then 'locked'
                      when not v_invite_open and v_invite.status in ('completed','verified') then 'pending'
                      else 'locked' end;
      update public.onboarding_steps
         set ball = 'me', payload = payload - 'skipReason'
       where id = v_conn.id;
      if v_conn.status <> v_conn_new then
        perform public._set_step_status(v_conn.id, v_conn_new, 'accountant',
          case when v_conn_new = 'pending' then 'החיבור לפייפרלס פתוח לטיפול'
               else 'החיבור לפייפרלס ממתין להרשמת הלקוח' end, v_facts, 'me');
      end if;
    end if;
  end if;

  -- JF32 · חזרה למסלול פייפרלס מחזירה את החיבור לרשות המסים שדולג כ«לא רלוונטי».
  if not v_na and v_pta.id is not null and v_pta.status = 'skipped'
     and coalesce(v_pta.payload->>'skipReason', '') = 'not_applicable' then
    update public.onboarding_steps set payload = payload - 'skipReason' where id = v_pta.id;
    perform public._set_step_status(v_pta.id,
      case when public.onboarding_dependency_met(v_pta.id) then 'pending' else 'locked' end,
      'accountant', 'הלקוח יעבוד עם פייפרלס - החיבור לרשות המסים חוזר למסלול', v_facts);
  end if;

  select * into v_import from public.onboarding_steps
    where client_id = p_client_id and step_type = 'data_import' and status <> 'cancelled' limit 1;

  if p_data_source = 'other_software' and not v_na then
    if v_import.id is null then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
      values (v_conn.user_id, v_eng, p_client_id, 'data_import', 'tools', 'person', 'locked', 'me', v_conn.id,
              v_facts || jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','uniform_file','label','קובץ מבנה אחיד התקבל','done',false),
                jsonb_build_object('key','imported','label','יובא לפייפרלס','done',false))))
      returning * into v_import;
      v_created := v_created + 1;
    end if;
  elsif v_import.id is not null and v_import.status in ('locked','pending') then
    perform public._set_step_status(v_import.id, 'cancelled', 'accountant',
      'ייבוא הנתונים אינו נדרש במסלול שנבחר', v_facts);
    v_import := null;
  end if;

  select * into v_verify from public.onboarding_steps
    where client_id = p_client_id and step_type = 'data_verification' and status <> 'cancelled' limit 1;

  if p_data_source in ('other_software','paperless') and not v_na then
    if v_verify.id is null then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, depends_on_step_id, payload)
      values (v_conn.user_id, v_eng, p_client_id, 'data_verification', 'tools', 'person', 'locked', 'me',
              coalesce(v_import.id, v_conn.id),
              jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','documents','label','מסמכים קיימים','done',false),
                jsonb_build_object('key','income','label','הכנסות קיימות','done',false),
                jsonb_build_object('key','expenses','label','הוצאות קיימות','done',false),
                jsonb_build_object('key','balances','label','יתרות פתיחה הגיוניות','done',false))));
      v_created := v_created + 1;
    elsif v_verify.status in ('locked','pending') then
      delete from public.onboarding_step_dependencies where step_id = v_verify.id;
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_verify.id, coalesce(v_import.id, v_conn.id), v_verify.user_id)
      on conflict do nothing;
      -- ההורה התחלף ⇒ הסטטוס נגזר ממנו מחדש (ביטול הייבוא פתח את האימות לרגע).
      perform public._set_step_status(v_verify.id,
        case when public.onboarding_dependency_met(v_verify.id) then 'pending' else 'locked' end,
        'accountant', 'התלות של אימות הנתונים עודכנה למסלול שנבחר', v_facts);
    end if;
  elsif v_verify.id is not null and v_verify.status in ('locked','pending') then
    perform public._set_step_status(v_verify.id, 'cancelled', 'accountant',
      'אימות הנתונים אינו נדרש במסלול שנבחר', v_facts);
  end if;

  select * into v_retainer from public.onboarding_steps
    where client_id = p_client_id and step_type = 'retainer_authorization'
      and status not in ('cancelled') limit 1;

  if v_retainer.id is not null then
    if v_na then
      -- הגבייה תוסדר ידנית: ההרשאה אינה תלויה עוד בחיבור.
      delete from public.onboarding_step_dependencies where step_id = v_retainer.id;
      update public.onboarding_steps
         set ball = 'me',
             payload = payload || jsonb_build_object('method', 'manual_arrangement')
       where id = v_retainer.id;
      if v_retainer.status = 'locked' then
        perform public._set_step_status(v_retainer.id, 'pending', 'accountant',
          'הגבייה תוסדר ידנית - הרשאת התשלום פתוחה לטיפול', v_facts, 'me');
      end if;
    else
      delete from public.onboarding_step_dependencies where step_id = v_retainer.id;
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_retainer.id, v_conn.id, v_retainer.user_id)
      on conflict do nothing;
      update public.onboarding_steps set payload = payload - 'method' where id = v_retainer.id;
      if v_retainer.status = 'pending' and not public.onboarding_dependency_met(v_retainer.id) then
        perform public._set_step_status(v_retainer.id, 'locked', 'accountant',
          'הרשאת התשלום נוצרת בתוך חשבון הפייפרלס - ממתינה לחיבור', v_facts);
      end if;
    end if;
  end if;

  perform public.log_onboarding_event(v_conn.user_id, v_conn.id, v_eng, 'status_changed', 'accountant',
    case when v_na then 'הלקוח לא יעבוד עם פייפרלס - הגבייה תוסדר ידנית'
         else 'מסלול הפייפרלס נקבע' end, v_facts);

  return jsonb_build_object('ok', true, 'created', v_created, 'facts', v_facts,
                            'notApplicable', v_na);
end;
$function$;

revoke execute on function public.set_paperless_path(text, text, text, text) from public, anon;
grant  execute on function public.set_paperless_path(text, text, text, text) to authenticated, service_role;

-- ── ⑤ advance_onboarding_step — ביטול פותח תלויים; מכתב השחרור משקף due_date ─
--  החוזה הציבורי לא השתנה. שני שינויים בגוף:
--  · JF6  — 'cancelled' מצטרף לרשימת הסטטוסים שאחריהם נבדקים התלויים.
--  · JF27 — במכתב השחרור payload.objectionDueDate הוא מראה של due_date, בכל
--           פעולה (set_due, wait_client, note…), ולא ערך עצמאי שנסחף.
create or replace function public.advance_onboarding_step(p_step_id text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
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
  v_due      date;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_note   := nullif(trim(coalesce(p_payload->>'note', '')), '');
  v_ball   := s.ball;
  v_due    := coalesce((nullif(p_payload->>'dueDate',''))::date, s.due_date);

  if s.status = 'locked' and p_action not in ('cancel','note','block','set_due') then
    if not public.onboarding_dependency_met(s.id) then
      return jsonb_build_object('ok', false, 'error', 'locked',
        'message', case when s.step_type = 'retainer_authorization'
                        then 'הרשאת התשלום נוצרת בתוך חשבון הפייפרלס של הלקוח - יש לאשר קודם את החיבור לפייפרלס.'
                        else 'השלב נעול עד להשלמת השלב שהוא תלוי בו.' end);
    end if;
  end if;

  if s.step_type = 'authority_representation' and p_action not in ('cancel','note','set_due') then
    return jsonb_build_object('ok', false, 'error', 'derived_step',
      'message', 'המצב של הפריט הזה נגזר אוטומטית מהביצוע בפועל, ואינו ניתן לסימון ידני.');
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
                  || case when v_reason is not null then jsonb_build_object('skipReason', v_reason) else '{}'::jsonb end
                  -- JF27 · חלון ההתייחסות של מכתב השחרור נקרא מהעמודה; המפתח ב-payload הוא מראה בלבד.
                  || case when s.step_type = 'release_letter' and v_due is not null
                          then jsonb_build_object('objectionDueDate', v_due::text) else '{}'::jsonb end,
        due_date = v_due,
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

  -- JF6 · מה שבוטל לא יקרה — התלויים בו נבדקים כמו אחרי השלמה.
  if v_new in ('completed','verified','skipped','cancelled') then
    perform public.unlock_dependent_steps(s.id);
  end if;

  -- ‼ 156 · הבלוק שסגר קליטה אוטומטית ירד. onboarding_close_readiness ממשיכה
  -- להאיר את הכפתור ולהריק את רשימת החוסמים — המוכנות לא נעלמה, רק המעבר
  -- בפועל דורש עכשיו לחיצה. ראה close_onboarding / close_onboarding_if_ready.

  return jsonb_build_object('ok', true, 'stepId', s.id, 'from', s.status, 'to', v_new);
end;
$function$;

revoke execute on function public.advance_onboarding_step(text, text, jsonb) from public, anon;
grant  execute on function public.advance_onboarding_step(text, text, jsonb) to authenticated, service_role;

-- ── ⑥ publish_case_changes — הסרה ממתינה עוברת דרך הנתיב האחד ─────────────
--  (JF6/JF34) ההסרה בפרסום התנהגה כמו advance('cancel') אבל בלי לפתוח תלויים.
--  שאר הגוף זהה ל-104.
create or replace function public.publish_case_changes(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  e        record;
  s        record;
  v_opened  int := 0;
  v_ordered int := 0;
  v_edits   int := 0;
  v_removed int := 0;
  v_exposed int := 0;
  v_auto    int := 0;
  r        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- 135: עוד לא נמכר כלום - הבקשות מוכנות ומחכות לאישור ההצעה, לא לכפתור.
  if public.derive_lifecycle_stage(c.id) in ('lead', 'quoted') then
    return jsonb_build_object('ok', false, 'error', 'quotation_not_approved');
  end if;

  -- 1. פתיחת תהליך שטרם נפתח — דרך הפונקציה הקיימת (יומן + אידמפוטנטיות שלה)
  for e in
    select id from public.engagements
     where client_id = c.id and status = 'onboarding' and process_published_at is null
  loop
    r := public.publish_onboarding_process(e.id);
    if coalesce((r->>'ok')::boolean, false) and not coalesce((r->>'alreadyPublished')::boolean, false) then
      v_opened := v_opened + 1;
    end if;
  end loop;

  -- 2. סידור ממתין (מיגרציה 101)
  update public.onboarding_steps
     set sort_order = pending_sort_order,
         pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_ordered = row_count;

  -- 3. עריכות ממתינות על בקשות קיימות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and draft_payload is not null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, draft_payload) - 'published',
           draft_payload = null
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
      'נוסח הבקשה עודכן ופורסם', jsonb_build_object('editApplied', true));
    v_edits := v_edits + 1;
  end loop;

  -- 4. הסרות ממתינות (מיגרציה 101) — אותה סמנטיקה כמו advance_onboarding_step('cancel'),
  --    כולל פתיחת התלויים ורישום ביומן (167).
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and pending_cancel = true and status <> 'cancelled'
  loop
    update public.onboarding_steps set pending_cancel = false where id = s.id;
    perform public._set_step_status(s.id, 'cancelled', 'accountant',
      'הבקשה הוסרה בעדכון דף הלקוח', jsonb_build_object('pendingCancel', true));
    v_removed := v_removed + 1;
  end loop;

  -- 5. חשיפת טיוטות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and published_at is null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));
    v_exposed := v_exposed + 1;
  end loop;

  -- 6. הערכה-מחדש אחרי חימוש (D3 §5, מיגרציה 83) — תצורה אוטומטית שפורסמה
  -- עכשיו, ושכל תנאיה כבר מולאו, מתבצעת בדיוק פעם אחת (התביעה בפונקציית השליחה).
  for s in
    select id from public.onboarding_steps
     where client_id = c.id
       and status in ('pending', 'in_progress')
       and payload->'autoAction'->>'kind' = 'email'
       and payload->>'autoExecutedAt' is null
  loop
    r := public.execute_automatic_step(s.id);
    if coalesce((r->>'ok')::boolean, false) then v_auto := v_auto + 1; end if;
  end loop;

  return jsonb_build_object('ok', true,
    'processOpened', v_opened, 'ordered', v_ordered, 'editsApplied', v_edits,
    'removed', v_removed, 'draftsExposed', v_exposed, 'autoQueued', v_auto);
end;
$function$;

revoke execute on function public.publish_case_changes(text) from public, anon;
grant  execute on function public.publish_case_changes(text) to authenticated, service_role;

-- ── ⑦ מכתב השחרור — due_date הוא חלון ההתייחסות היחיד ─────────────────────

-- JF27 · שער הסגירה: «שתיקה היא הסכמה» — אבל התנגדות מפורשת אינה שתיקה,
-- גם אם החלון עבר בינתיים. שאר הגוף זהה ל-105.
create or replace function public.onboarding_close_readiness(p_engagement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
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
     -- ‼ עבודה פנימית אוטומטית שהמסך אינו מציג — אינה חוסמת.
     and step_type not in ('internal_setup', 'kyc_identification', 'first_month_review',
                           'representation_upgrade', 'opening_call', 'file_opening',
                           'data_import', 'data_verification')
     and not (step_type = 'release_letter'
              and status not in ('pending', 'locked')
              and due_date is not null
              and due_date <= current_date
              -- התנגדות שנרשמה אינה שתיקה.
              and nullif(payload->>'prevAccountantResponseNote', '') is null);

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'blocking', v_blocking,
    'ready', jsonb_array_length(v_blocking) = 0);
end;
$function$;

revoke execute on function public.onboarding_close_readiness(text) from public, anon, authenticated;
grant  execute on function public.onboarding_close_readiness(text) to service_role;

-- JF27 · דף הרו"ח הקודם קורא את החלון מ-due_date. שאר הגוף זהה ל-115/119/121.
create or replace function public.get_release_portal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_bulk   int := 0;
  v_ups    jsonb := '[]'::jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_due    date;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token
     -- ‼ 165: מכתב שבוטל = הטוקן שלו מת. אותו תנאי בכל חמש הדלתות.
     and status <> 'cancelled' limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;

  if m.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false),
             'optional', coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material'),
             'priority', coalesce((x->>'priority')::boolean, false),
             'declaredByRecipient', coalesce((x->>'declaredByRecipient')::boolean, false),
             'uploads', coalesce(jsonb_array_length(x->'documentIds'),
                                 case when x ? 'documentId' then 1 else 0 end))
             order by coalesce((x->>'priority')::boolean, false) desc, ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total
      from jsonb_array_elements(v_items) x
     where not coalesce((x->>'optional')::boolean, false);
    v_bulk := coalesce(jsonb_array_length(m.payload->'bulkUploads'), 0);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x->>'documentId',
             'name', coalesce(nullif(x->>'fileName',''), 'קובץ'),
             'at', x->>'at') order by ord), '[]'::jsonb)
      into v_ups
      from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', x->>'key', 'label', x->>'label') order by ord), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(coalesce(s.payload->'outstandingItems','[]'::jsonb)) with ordinality t(x, ord);

  v_due := s.due_date;

  return jsonb_build_object(
    'ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'clientName', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
    'prevAccountantName', nullif(trim(coalesce(c.prev_accountant_name,'')), ''),
    'subject', nullif(s.payload->>'releaseSubject',''),
    'body', nullif(s.payload->>'releaseBody',''),
    'sentAt', s.payload->>'releaseSentAt',
    'objectionDueDate', v_due::text,
    'objectionWindowPassed', (v_due is not null and v_due < current_date
                              and nullif(s.payload->>'prevAccountantResponseNote','') is null),
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'responseNote', nullif(s.payload->>'prevAccountantResponseNote',''),
    'respondedAt', s.payload->>'prevAccountantRespondedAt',
    'responderName', nullif(s.payload->>'prevAccountantResponderName',''),
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total,
    'bulkUploads', v_bulk,
    'uploads', v_ups,
    'outstanding', v_out);
end;
$function$;

revoke execute on function public.get_release_portal(text) from public;
grant  execute on function public.get_release_portal(text) to anon, authenticated, service_role;

-- יישור חד-פעמי של המראה למכתבים קיימים.
update public.onboarding_steps
   set payload = case when due_date is null then payload - 'objectionDueDate'
                      else payload || jsonb_build_object('objectionDueDate', due_date::text) end
 where step_type = 'release_letter'
   and (payload->>'objectionDueDate') is distinct from due_date::text;

-- ── ⑧ תבניות ──────────────────────────────────────────────────────────────

-- JF15 · עותק משרדי של מובנית: אחד לכל (משרד, מפתח); לחיצה שנייה מעדכנת אותו.
create or replace function public.update_request_template(p_template_id text, p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  v_entry  jsonb;
  v_id     text;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  select * into t from public.journey_templates where id = p_template_id;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;
  if t.office_id is not null and t.office_id <> v_office then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'key', 'e1',
    'stepType', s.step_type,
    'owner', case when s.payload ? 'externalParty' then 'external'
                  when s.ball = 'client' then 'client' else 'me' end,
    'requiredForClose', coalesce(s.required_for_close, true),
    'payload', public.template_payload_from_step(coalesce(s.draft_payload, s.payload))));

  if t.office_id is null then
    -- מובנית: נשארת כפי שהיא, והמשרד מקבל עותק משלו שגובר עליה בתצוגה.
    -- עותק שכבר קיים מתעדכן במקום להיכפל.
    if t.seed_key is not null then
      select id into v_id from public.journey_templates
       where office_id = v_office and seed_key = t.seed_key limit 1;
    end if;
    if v_id is not null then
      update public.journey_templates
         set entries = jsonb_build_array(v_entry), updated_at = now()
       where id = v_id;
      return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', true, 'updatedCopy', true);
    end if;
    insert into public.journey_templates (user_id, office_id, kind, name, description, entries, seed_key)
    values (v_uid, v_office, 'request', t.name, t.description, jsonb_build_array(v_entry), t.seed_key)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', true);
  end if;

  update public.journey_templates
     set entries = jsonb_build_array(v_entry), updated_at = now()
   where id = t.id;

  return jsonb_build_object('ok', true, 'templateId', t.id);
end;
$function$;

revoke execute on function public.update_request_template(text, text) from public, anon;
grant  execute on function public.update_request_template(text, text) to authenticated, service_role;

-- JF17 · תבנית שנשמרת שייכת למשרד (office_id), אחרת היא נראית כמובנית ואי
-- אפשר למחוק אותה. התלויות נקראות מהטבלה בלבד (②).
create or replace function public.save_journey_template(p_client_id text, p_name text, p_description text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c       public.clients%rowtype;
  v_uid   uuid := auth.uid();
  v_office uuid;
  v_items jsonb;
  v_id    text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  with src as (
    select s.*,
           'e' || row_number() over (order by s.sort_order, s.created_at) as tkey
      from public.onboarding_steps s
     where s.client_id = c.id
       and s.status <> 'cancelled'
       and s.step_type not in ('representation', 'representation_upgrade', 'internal_setup', 'first_month_review')
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key', src.tkey,
           'stepType', src.step_type,
           'owner', case
                      when src.payload ? 'externalParty' then 'external'
                      when src.ball = 'client' then 'client'
                      else 'me' end,
           'stageTitle', js.title,
           'stageOrder', js.sort_order,
           'requiredForClose', coalesce(src.required_for_close,
             src.step_type not in ('representation_upgrade', 'first_month_review')),
           'dueInDays', case when src.due_date is not null and src.created_at is not null
                             then greatest(0, (src.due_date - src.created_at::date)) end,
           'dependsOn', (
             select coalesce(jsonb_agg(distinct p.tkey), null)
               from public.onboarding_step_dependencies d
               join src p on p.id = d.depends_on_step_id
              where d.step_id = src.id),
           'payload', public.template_payload_from_step(src.payload)))
         order by src.sort_order, src.created_at), '[]'::jsonb)
    into v_items
    from src
    left join public.journey_stages js on js.id = src.stage_id;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (v_uid, v_office, 'journey', trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items));
end;
$function$;

revoke execute on function public.save_journey_template(text, text, text) from public, anon;
grant  execute on function public.save_journey_template(text, text, text) to authenticated, service_role;

-- JF16 · החלה לפי היקף המשרד (כמו ה-RLS): תבנית של עמית למשרד ותבנית מובנית
-- מוחלות; של משרד אחר — לא. JF13 · התלויות נפתרות אחרי שכל הרשומות קיימות —
-- גם תלות "קדימה" וגם תלות ברשומה שדולגה כי הבקשה כבר קיימת אצל הלקוח —
-- והסטטוס ההתחלתי נגזר מהן (נעול כשההורה פתוח).
create or replace function public.apply_journey_template(p_client_id text, p_template_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  e        jsonb;
  v_res    jsonb;
  v_added  int := 0;
  v_skip   int := 0;
  v_dup_id text;
  v_title  text;
  v_key    text;
  v_map    jsonb := '{}'::jsonb;
  v_stages jsonb := '{}'::jsonb;
  v_stage  text;
  v_dep_ids text[];
  v_owner  text;
  v_due    date;
  v_new    text;
  v_payload jsonb;
  v_deferred jsonb := '[]'::jsonb;
  d        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  select * into t from public.journey_templates
   where id = p_template_id
     and (office_id is null or (v_office is not null and office_id = v_office));
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  for e in select * from jsonb_array_elements(t.entries) loop
    v_key := nullif(trim(coalesce(e->>'key','')), '');
    v_dup_id := null;

    if (e->>'stepType') = 'custom_request' then
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      if v_key is not null then
        select s.id into v_dup_id from public.onboarding_steps s
         where s.client_id = c.id and s.step_type = 'custom_request'
           and s.status <> 'cancelled'
           and s.payload->'templateOrigin'->>'templateId' = t.id
           and s.payload->'templateOrigin'->>'key' = v_key
         limit 1;
        if v_dup_id is null then
          select s.id into v_dup_id from public.onboarding_steps s
           where s.client_id = c.id and s.step_type = 'custom_request'
             and s.status <> 'cancelled'
             and coalesce(s.payload->'templateOrigin'->>'templateId', '') <> t.id
             and coalesce(nullif(trim(s.payload->>'title'), ''),
                          nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title
           limit 1;
        end if;
      else
        select s.id into v_dup_id from public.onboarding_steps s
         where s.client_id = c.id and s.step_type = 'custom_request'
           and s.status <> 'cancelled'
           and coalesce(nullif(trim(s.payload->>'title'), ''),
                        nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title
         limit 1;
      end if;
    else
      select s.id into v_dup_id from public.onboarding_steps s
       where s.client_id = c.id and s.step_type = e->>'stepType'
         and s.status <> 'cancelled'
       limit 1;
    end if;

    if v_dup_id is not null then
      -- הבקשה כבר קיימת: לא נוגעים בה, אבל תלות בה נפתרת אליה.
      if v_key is not null then v_map := v_map || jsonb_build_object(v_key, v_dup_id); end if;
      v_skip := v_skip + 1;
      continue;
    end if;

    v_stage := null;
    if nullif(trim(coalesce(e->>'stageTitle','')), '') is not null then
      if v_stages ? (e->>'stageTitle') then
        v_stage := v_stages->>(e->>'stageTitle');
      else
        select id into v_stage from public.journey_stages
         where client_id = c.id and title = e->>'stageTitle' limit 1;
        if v_stage is null then
          insert into public.journey_stages (user_id, client_id, title, sort_order)
          values (c.user_id, c.id, e->>'stageTitle',
                  coalesce((e->>'stageOrder')::int,
                           (select coalesce(max(sort_order), 0) + 10 from public.journey_stages where client_id = c.id)))
          returning id into v_stage;
        end if;
        v_stages := v_stages || jsonb_build_object(e->>'stageTitle', v_stage);
      end if;
    end if;

    v_owner := nullif(e->>'owner', '');
    v_due := case when (e->>'dueInDays') is not null
                  then (current_date + ((e->>'dueInDays')::int)) end;

    v_payload := coalesce(e->'payload','{}'::jsonb);
    if v_key is not null and (e->>'stepType') = 'custom_request' then
      v_payload := v_payload || jsonb_build_object('templateOrigin',
        jsonb_build_object('templateId', t.id, 'key', v_key));
    end if;

    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', v_payload,
               p_due_date => v_due,
               p_depends_on => null,
               p_published => false,
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_owner => v_owner,
               p_stage_id => v_stage);

    if coalesce((v_res->>'ok')::boolean, false) then
      v_added := v_added + 1;
      v_new := v_res->>'stepId';
      if v_key is not null then
        v_map := v_map || jsonb_build_object(v_key, v_new);
      end if;
      if jsonb_typeof(e->'dependsOn') = 'array' and jsonb_array_length(e->'dependsOn') > 0 then
        v_deferred := v_deferred || jsonb_build_object('stepId', v_new, 'dependsOn', e->'dependsOn');
      end if;
    else
      v_skip := v_skip + 1;
    end if;
  end loop;

  -- שלב שני: כל הרשומות קיימות, אפשר לפתור כל תלות — קדימה, אחורה, וגם לבקשה
  -- שכבר הייתה אצל הלקוח.
  for d in select * from jsonb_array_elements(v_deferred) loop
    select coalesce(array_agg(v_map->>k), '{}')
      into v_dep_ids
      from jsonb_array_elements_text(d->'dependsOn') k
     where v_map ? k;
    if array_length(v_dep_ids, 1) >= 1 then
      perform public.set_onboarding_step_dependencies(d->>'stepId', v_dep_ids);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip, 'template', t.name);
end;
$function$;

revoke execute on function public.apply_journey_template(text, text) from public, anon;
grant  execute on function public.apply_journey_template(text, text) to authenticated, service_role;

-- ── ⑨ המחולל — רשימת החומרים של היום ─────────────────────────────────────
--  JF24 · הרשימה זהה ל-CATALOG של 127 ול-RELEASE_MATERIALS ב-releaseLetter.ts.
--  שאר הגוף הוא ההגדרה החיה מהפרודקשן (אחרי הטלאים 130/136/137), כלשונה.
create or replace function public.generate_onboarding_steps(p_engagement_id text, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e            public.engagements%rowtype;
  q            public.quotations%rowtype;
  v_items      jsonb;
  v_has_monthly boolean := false;
  v_has_paperless boolean := false;
  v_needs_paperless boolean := false;
  v_has_rep    boolean := false;
  v_has_prev   boolean := false;
  v_new_business boolean := false;
  v_client     public.clients%rowtype;
  v_planned    jsonb := '[]'::jsonb;
  v_created    int := 0;
  v_id_invite  text;
  v_id_conn    text;
  v_id_release text;
  v_id_prevdet text;
  v_new_id     text;
  v_no_paperless boolean := false;
  v_conn_done  boolean := false;
  v_needs_prevdet boolean := false;
  v_docs       jsonb;
  v_licensed   boolean := false;
  v_kind       text;
  v_snap       jsonb;
  v_facts      jsonb;
  v_var        jsonb;
  v_prev_known boolean;
  v_fresh      boolean;
  v_office     uuid;
  v_oentry     jsonb;
  v_opayload   jsonb;
  v_ores       jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select * into q from public.quotations where id = e.quotation_id;
  select * into v_client from public.clients where id = e.client_id;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  select
    bool_or(coalesce(it->>'category','') = 'monthly'),
    bool_or(coalesce(it->>'name','') ilike '%הנהלת חשבונות%'
         or coalesce(it->>'name','') ilike '%פייפרלס%'
         or coalesce(it->>'name','') ilike '%paperless%')
  into v_has_monthly, v_has_paperless
  from jsonb_array_elements(v_items) it;

  v_has_monthly   := coalesce(v_has_monthly, false);
  v_has_paperless := coalesce(v_has_paperless, false);

  v_no_paperless := coalesce(v_client.paperless_status, '') = 'not_applicable';
  v_needs_paperless := (v_has_monthly or v_has_paperless) and not v_no_paperless;

  -- ‼ עוסק מורשה וחברה בלבד: מספר הקצאה נדרש לחשבונית מס, ועוסק פטור אינו
  -- מוציא כזו. תבנית ההצעה היא ההכרעה; סוג העוסק שעל הכרטיס הוא הגיבוי
  -- כשההצעה נבנתה בלי תבנית. אין אף אחד מהם ⇒ לא מנחשים, והבקשה נשארת
  -- זמינה ידנית מ"+ בקשה חדשה".
  select coalesce(t.kind in ('licensed_dealer','company'), false)
    into v_licensed
    from public.quotation_templates t where t.id = q.template_id;
  v_licensed := coalesce(v_licensed, false)
                or coalesce(v_client.dealer_type, '') in ('licensed','company')
                or coalesce(v_client.vat_status, '') = 'authorizedDealer';

  v_has_rep := coalesce(q.representation_request_id, v_client.representation_request_id) is not null;

  v_has_prev := v_client.has_previous_accountant;
  if v_has_prev is null then
    select l.has_previous_accountant into v_has_prev
      from public.leads l where l.converted_client_id = e.client_id limit 1;
  end if;
  if v_has_prev is null and q.lead_id is not null then
    select l.has_previous_accountant into v_has_prev
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  v_has_prev := coalesce(v_has_prev, false);

  v_prev_known := v_client.has_previous_accountant;
  if v_prev_known is null then
    select l.has_previous_accountant into v_prev_known
      from public.leads l where l.converted_client_id = e.client_id limit 1;
  end if;
  if v_prev_known is null and q.lead_id is not null then
    select l.has_previous_accountant into v_prev_known
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  v_fresh := not exists (select 1 from public.onboarding_steps where engagement_id = e.id);
  if v_fresh then
    v_new_business := (v_prev_known is false) or (v_client.business_transfer is false);
  else
    v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false
                      and v_client.business_transfer is not null;
  end if;

  v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null;

  -- ‼ גבול מחזור החיים במפורש: רק התקשרות שאין לה עדיין שום שלב
  -- מקבלת צילום. מסע שכבר התחיל ממשיך לפי מה שנולד איתו, ולכן עריכה
  -- עתידית של ברירת המחדל אינה נוגעת בו (הכרעת גיא 2026-08-25).
  v_facts := jsonb_build_object(
    'monthly', v_has_monthly, 'paperless', v_has_paperless,
    'licensed', v_licensed, 'rep', v_has_rep, 'has_prev', v_has_prev,
    'new_business', v_new_business, 'no_prev_email', v_needs_prevdet);

  v_snap := e.journey_default_snapshot;
  if v_snap is null and v_fresh then
    v_kind := public.resolve_client_kind(e.quotation_id, e.client_id);
    select office_id into v_office from public.profiles where id = e.user_id;
    if v_kind is not null and v_office is not null then
      select d.entries into v_snap from public.office_journey_defaults d
       where d.office_id = v_office and d.client_kind = v_kind;
      if v_snap is not null and not p_dry_run then
        update public.engagements
           set journey_default_snapshot = v_snap, journey_default_facts = v_facts
         where id = e.id;
      end if;
    end if;
  elsif e.journey_default_facts is not null then
    v_facts := e.journey_default_facts;   -- הרצה חוזרת: דטרמיניזם
  end if;
  if v_has_rep then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'representation' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','representation','track','authorities','scope','person','status','in_progress');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, true, 'representation', 'authorities', 'person', 'in_progress', 'me');
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;

    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'kyc_identification' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','kyc_identification','track','internal','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, true, 'kyc_identification', 'internal', 'person', 'pending', 'me');
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  if v_new_business then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'file_opening' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','file_opening','track','authorities','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, true, 'file_opening', 'authorities', 'person', 'pending', 'me',
                jsonb_build_object('checklist', jsonb_build_array(
                  jsonb_build_object('key','vat','label','פתיחת תיק מעמ','done',false),
                  jsonb_build_object('key','income_tax','label','פתיחת תיק מס הכנסה','done',false),
                  jsonb_build_object('key','ni','label','פתיחת תיק ביטוח לאומי','done',false))));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  -- ── מסמכים מהלקוח ────────────────────────────────────────────────────────────
  -- הרשימה נגזרת מסוג הלקוח: מי שעובר מרו"ח מתבקש את מה שיש לו ביד; עסק חדש
  -- מתבקש את תעודות הפתיחה. הרו"ח יכול לערוך את הרשימה בבונה התהליך.
  select id into v_new_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'client_documents' and status <> 'cancelled' limit 1;
  if v_new_id is null and public.journey_default_enabled(v_snap, 'client_documents') then
    v_var := public.journey_default_variant(v_snap, 'client_documents', v_facts);
    if v_var is not null then
      v_docs := public.journey_default_checklist(v_var);
    elsif v_new_business then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','vat_cert','label','תעודת עוסק','done',false),
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false));
    elsif v_has_prev then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false),
        jsonb_build_object('key','last_return','label','דוח שנתי אחרון','done',false),
        jsonb_build_object('key','form106','label','טופס 106','done',false));
    else
      v_docs := jsonb_build_array(
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false));
    end if;

    v_planned := v_planned || jsonb_build_object('step_type','client_documents','track','tools','scope','person','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
      values (e.user_id, e.id, e.client_id, true, 'client_documents', 'tools', 'person', 'pending', 'client',
              jsonb_build_object(
                'checklist', v_docs,
                'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',
                'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d),
                'clientCta', 'להעלאה'));
      v_created := v_created + 1;
    end if;
  end if;
  v_new_id := null;

  -- ‼ 117: בקשה שהוסרה ידנית אינה נולדת מחדש. המחולל רץ שוב על התקשרות
  -- קיימת (create_engagement_for_quotation, מסלול existed=true), ולכן בלי
  -- הבדיקה הזאת לחיצה חוזרת על אישור ההצעה החזירה את שלושת השלבים.
  -- חזרה לבקשה = הוספה ידנית מ"+ בקשה", ששם היא זמינה תמיד.
  if v_has_prev and not exists (
       select 1 from public.onboarding_steps
        where client_id = e.client_id
          and step_type in ('prev_accountant_details','release_letter','materials_received')
          and status = 'cancelled') then
    -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
    -- נשאלים רק אם אינם על הכרטיס. בלי מייל אין למי לשלוח מכתב שחרור,
    -- ולכן המכתב תלוי בשלב הזה ולא נולד פתוח לחינם.
    v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null;

    -- ‼ 115: השאלה ללקוח נוצרת תמיד (הכרעת גיא 2026-08-18). כשיש כבר
    -- אימייל בכרטיס היא בקשת אישור בלבד — לא נועלת ולא חוסמת סגירה.
    select id into v_id_prevdet from public.onboarding_steps
      where client_id = e.client_id and step_type = 'prev_accountant_details' and status <> 'cancelled' limit 1;
    if v_id_prevdet is null and public.journey_default_enabled(v_snap, 'prev_accountant_details') then
      v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, v_needs_prevdet, 'prev_accountant_details', 'prev_accountant', 'person', 'pending', 'client',
                coalesce(
                  public.journey_default_variant(v_snap, 'prev_accountant_details', v_facts)->'copy',
                case when v_needs_prevdet then jsonb_build_object(
                  'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                  'clientSub', 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
                  'clientCta', 'למילוי')
                else jsonb_build_object(
                  'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                  'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
                  'clientCta', 'לאישור') end))
        returning id into v_id_prevdet;
        v_created := v_created + 1;
      end if;
    end if;

    select id into v_id_release from public.onboarding_steps
      where client_id = e.client_id and step_type = 'release_letter' and status <> 'cancelled' limit 1;
    if v_id_release is null and public.journey_default_enabled(v_snap, 'release_letter') then
      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person',
        'status', case when v_needs_prevdet and v_id_prevdet is not null then 'locked' else 'pending' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id)
        values (e.user_id, e.id, e.client_id, true, 'release_letter', 'prev_accountant', 'person',
                case when v_needs_prevdet and v_id_prevdet is not null then 'locked' else 'pending' end, 'me',
                case when v_needs_prevdet then v_id_prevdet else null end)
        returning id into v_id_release;
        v_created := v_created + 1;
      end if;
    end if;

    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
    if v_new_id is null and public.journey_default_enabled(v_snap, 'materials_received') then
      v_planned := v_planned || jsonb_build_object('step_type','materials_received','track','prev_accountant','scope','person','status','locked');
      if not p_dry_run then
        -- ‼ JF24 · הקטלוג של היום (127 / RELEASE_MATERIALS). המכתב שיוצא בפועל
        -- מחליף את הרשימה במה שנתבקש (syncRequestedMaterials) — זו ברירת המחדל
        -- עד אז, ולכן היא חייבת להיות זהה למה שהמכתב מציע.
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'materials_received', 'prev_accountant', 'person', 'locked', 'prev_accountant', v_id_release,
                jsonb_build_object('checklist', jsonb_build_array(
                  jsonb_build_object('key','uniform_file','label','קובץ מבנה אחיד - השנה','done',false),
                  jsonb_build_object('key','uniform_file_prev','label','קובץ מבנה אחיד - שנה קודמת','done',false),
                  jsonb_build_object('key','pnl_current','label','כרטסת רווח והפסד באקסל - השנה','done',false),
                  jsonb_build_object('key','pnl_prev','label','כרטסת רווח והפסד באקסל - שנה קודמת','done',false),
                  jsonb_build_object('key','ledgers','label','כרטסות הנהלת חשבונות','done',false),
                  jsonb_build_object('key','depreciation','label','טופס פחת','done',false),
                  jsonb_build_object('key','last_return','label','דוח שנתי אחרון','done',false),
                  jsonb_build_object('key','capital_declaration','label','הצהרת הון אחרונה','done',false),
                  jsonb_build_object('key','trial_balance','label','מאזן בוחן','done',false))));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  if v_needs_paperless then
    select id into v_id_invite from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_invite' and status <> 'cancelled' limit 1;
    if v_id_invite is null and public.journey_default_enabled(v_snap, 'paperless_invite') then
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, true, 'paperless_invite', 'tools', 'person', 'pending', 'client',
                jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                   'dataSource','unknown',
                                   'clientTitle','הרשמה לפייפרלס',
                                   'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                   'clientCta','נרשמתי לפייפרלס'))
        returning id into v_id_invite;
        v_created := v_created + 1;
      end if;
    end if;

    select id, status in ('completed','verified','skipped')
      into v_id_conn, v_conn_done
      from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
    if v_id_conn is null and public.journey_default_enabled(v_snap, 'paperless_connection') then
      v_planned := v_planned || jsonb_build_object('step_type','paperless_connection','track','tools','scope','person','status','locked');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'paperless_connection', 'tools', 'person', 'locked', 'me', v_id_invite,
                jsonb_build_object(
                  'clientTitle', 'חיבור לפייפרלס',
                  'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'))
        returning id into v_id_conn;
        v_created := v_created + 1;
        v_conn_done := false;
      end if;
    end if;
  end if;

  -- ── חיבור פייפרלס לרשות המסים ──────────────────────────────────────────
  -- ‼ תלוי בחיבור ולא בהרשמה: בלי שם עסק ומשיכת עוסקים בחשבון אין מה לחבר.
  -- ‼ הכדור אצל הלקוח — ההזדהות היא בתעודת הזהות ובקוד הקבוע שלו.
  -- ‼ 117: בקשה שהמשרד הסיר אינה נולדת מחדש בהרצה חוזרת של המחולל.
  if v_needs_paperless and v_licensed
     and not exists (select 1 from public.onboarding_steps
                      where client_id = e.client_id
                        and step_type = 'paperless_tax_authority'
                        and status = 'cancelled') then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_tax_authority'
        and status <> 'cancelled' limit 1;
    if v_new_id is null and public.journey_default_enabled(v_snap, 'paperless_tax_authority') then
      v_planned := v_planned || jsonb_build_object(
        'step_type','paperless_tax_authority','track','tools','scope','person',
        'status', case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close,
                                             step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'paperless_tax_authority', 'tools', 'person',
                case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end,
                'client', v_id_conn,
                jsonb_build_object(
                  'clientTitle', 'חיבור פייפרלס לרשות המסים',
                  'clientSub', 'כדי שהחשבוניות שלך יקבלו מספר הקצאה',
                  'clientNote', E'1. בפייפרלס: הגדרות ← חיבורים והרשאות, ולחיצה על אייקון הקישור.\n2. נפתח אתר רשות המסים ומבקש הזדהות - תעודת זהות וקוד קבוע (לא כרטיס חכם). מאשרים את ההרשאה.\n3. חוזרים לפייפרלס ולוחצים "המשך".',
                  'clientNoteAfter', 'החיבור תקף לשלושה חודשים ואז צריך לחדש אותו - נזכיר לך כשיגיע הזמן. אם החיבור נכשל, ממתינים כשלוש שעות ומנסים שוב.',
                  'clientCta', 'ביצעתי את החיבור',
                  'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D'));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  if v_has_monthly then
    if not exists (select 1 from public.onboarding_steps
                   where engagement_id = e.id and step_type = 'retainer_authorization')
       and public.journey_default_enabled(v_snap, 'retainer_authorization') then
      v_planned := v_planned || jsonb_build_object(
        'step_type','retainer_authorization','track','payment','scope','engagement',
        'status', case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end,
        'depends_on', case when v_id_conn is null then null else 'paperless_connection' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'retainer_authorization', 'payment', 'engagement',
                case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end,
                'me', v_id_conn,
                jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month,
                                   'clientTitle', 'להזין אמצעי תשלום',
                                   'clientSub', 'הסכום שסוכם בהצעה, כהרשאה קבועה',
                                   'clientCta', 'להזנה')
                || case when v_no_paperless then jsonb_build_object('method','manual_arrangement') else '{}'::jsonb end);
        v_created := v_created + 1;
      end if;
    end if;
  end if;

  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'internal_setup') then
    v_planned := v_planned || jsonb_build_object('step_type','internal_setup','track','internal','scope','engagement','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
      values (e.user_id, e.id, e.client_id, true, 'internal_setup', 'internal', 'engagement', 'pending', 'me',
              jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','file_numbers','label','מספרי תיקים בכרטיס','done',false),
                jsonb_build_object('key','assignee','label','שיוך מטפל','done',false),
                jsonb_build_object('key','frequencies','label','תדירויות דיווח','done',false))));
      v_created := v_created + 1;
    end if;
  end if;

  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'first_month_review') then
    v_planned := v_planned || jsonb_build_object('step_type','first_month_review','track','review','scope','engagement','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, due_date)
      values (e.user_id, e.id, e.client_id, false, 'first_month_review', 'review', 'engagement', 'pending', 'me',
              (coalesce(e.approved_at, now()) + interval '30 days')::date);
      v_created := v_created + 1;
    end if;
  end if;

  -- ── בקשות חופשיות של המשרד ─────────────────────────────────────────
  if v_snap is not null then
    for v_oentry in
      select value from jsonb_array_elements(v_snap)
       where value->>'source' = 'office'
         and coalesce((value->>'enabled')::boolean, true)
       order by coalesce((value->>'sortIndex')::int, 0)
    loop
      v_opayload := v_oentry->'payload';
      -- תצורה חסרה ⇒ אין מה לבקש
      continue when v_opayload is null or jsonb_typeof(v_opayload) <> 'object'
                    or v_opayload = '{}'::jsonb;
      -- כבר קיימת אצל הלקוח (כולל מבוטלת) ⇒ לא נוצרת שוב
      continue when exists (
        select 1 from public.onboarding_steps s
         where s.client_id = e.client_id
           and s.payload->'defaultOrigin'->>'key' = v_oentry->>'key');

      v_planned := v_planned || jsonb_build_object(
        'step_type', coalesce(v_oentry->>'stepType', 'custom_request'),
        'track', 'custom', 'scope', 'person', 'status', 'pending',
        'officeKey', v_oentry->>'key');

      if not p_dry_run then
        v_ores := public.create_onboarding_request(
          e.client_id,
          coalesce(v_oentry->>'stepType', 'custom_request'),
          v_opayload || jsonb_build_object('defaultOrigin',
            jsonb_build_object('key', v_oentry->>'key', 'kind', 'office_default')),
          p_due_date => case when v_oentry->>'dueInDays' is not null
                             then current_date + (v_oentry->>'dueInDays')::int end,
          p_depends_on => null,
          p_published => true,
          p_required_for_close => coalesce((v_oentry->>'requiredForClose')::boolean, true),
          p_owner => 'client',
          p_stage_id => null);

        if coalesce((v_ores->>'ok')::boolean, false) then
          update public.onboarding_steps
             set sort_order = coalesce((v_oentry->>'sortIndex')::int, 0)
           where id = v_ores->>'stepId';
          v_created := v_created + 1;
        else
          -- ‼ לא מפילים את הקליטה בגלל בקשה אחת. נרשם ביומן וממשיכים.
          perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
            'בקשת ברירת מחדל לא נוצרה: ' || coalesce(v_oentry->>'key', '?')
              || ' - ' || coalesce(v_ores->>'error', '?'), v_oentry);
        end if;
      end if;
    end loop;
  end if;
  if not p_dry_run and v_snap is not null then
    update public.onboarding_steps s
       set sort_order = public.journey_default_order(v_snap, s.step_type)
     where s.engagement_id = e.id
       and coalesce(s.sort_order, 0) = 0
       and public.journey_default_entry(v_snap, s.step_type) is not null;
  end if;
  if not p_dry_run and v_created > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'created', 'system',
      'מסלול הקליטה הורכב מההצעה שאושרה', jsonb_build_object('stepsCreated', v_created));
  end if;

  return jsonb_build_object(
    'ok', true, 'dryRun', p_dry_run, 'engagementId', e.id, 'clientId', e.client_id,
    'created', v_created, 'planned', v_planned,
    'facts', jsonb_build_object(
      'hasMonthly', v_has_monthly, 'hasPaperlessService', v_has_paperless,
      'needsPaperless', v_needs_paperless, 'hasRepresentation', v_has_rep,
      'hasPreviousAccountant', v_has_prev, 'newBusiness', v_new_business,
      'noPaperless', v_no_paperless, 'needsPrevDetails', v_needs_prevdet,
      'monthlyTotal', e.monthly_total, 'billingStartMonth', e.billing_start_month));
end;
$function$;

revoke execute on function public.generate_onboarding_steps(text, boolean) from public, anon, authenticated;
grant  execute on function public.generate_onboarding_steps(text, boolean) to service_role;

-- ── ⑩ שומר הקבועים ─────────────────────────────────────────────────────────
select public.assert_domain_function_invariants();
