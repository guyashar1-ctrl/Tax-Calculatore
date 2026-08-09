-- 78 — תלות מרובת-הורים: משימה יכולה להמתין לכמה משימות קודמות
--
-- עד היום תלות הייתה עמודה יחידה (depends_on_step_id) — הורה אחד לכל שלב.
-- מודל "מרכז התיק" דורש הסתעפות לשני הכיוונים: כמה משימות שתלויות באותה
-- משימה (קיים), ומשימה אחת שממתינה לכמה קודמות (חדש — למשל "שליחת מכתב
-- השחרור" שממתינה גם לפרטי הרו"ח הקודם וגם לחתימת ההצעה).
--
-- העיצוב:
-- 1. טבלת קשרים onboarding_step_dependencies — מקור האמת החדש.
-- 2. העמודה הישנה נשארת, ומסונכרנת לטבלה בטריגר — כל הכותבים הקיימים
--    (generate_onboarding_steps, create_onboarding_request, set_paperless_path
--    שמאפסת את תלות הריטיינר) ממשיכים לעבוד בלי שינוי, וה-UI הקיים ממשיך
--    לקרוא את העמודה עד שיעבור.
-- 3. onboarding_dependency_met דורשת שכל ההורים (איחוד הטבלה והעמודה)
--    מולאו — אותם כללי ריכוך בדיוק: הושלם/אומת ⇒ כן; דולג ⇒ רק בסיבות
--    המוכרות; הורה שנמחק ⇒ לא חוסם; הורה שבוטל ⇒ חוסם (כמו היום).
-- 4. unlock_dependent_steps מטפלת בילדים משני המקורות, ומשחררת רק כשכל
--    ההורים מולאו.
-- 5. RPC חדש set_onboarding_step_dependencies — יחליף את חוסר-היכולת לערוך
--    תלות אחרי היצירה (ישרת את ממשק העריכה של מרכז התיק).
--
-- ההגדרות שנדרסו שמורות ב-supabase/live-2026-08-09/.

-- ── 1. טבלת הקשרים ───────────────────────────────────────────────────────────

create table if not exists public.onboarding_step_dependencies (
  step_id            text not null references public.onboarding_steps(id) on delete cascade,
  depends_on_step_id text not null references public.onboarding_steps(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (step_id, depends_on_step_id),
  check (step_id <> depends_on_step_id)
);

create index if not exists onboarding_step_deps_parent_idx
  on public.onboarding_step_dependencies (depends_on_step_id);

alter table public.onboarding_step_dependencies enable row level security;

drop policy if exists step_deps_own on public.onboarding_step_dependencies;
create policy step_deps_own on public.onboarding_step_dependencies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists step_deps_require_authorized on public.onboarding_step_dependencies;
create policy step_deps_require_authorized on public.onboarding_step_dependencies
  as restrictive for all
  using (public.is_authorized()) with check (public.is_authorized());

-- ── 2. מילוי-לאחור מהעמודה הקיימת ────────────────────────────────────────────

insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
select s.id, s.depends_on_step_id, s.user_id
  from public.onboarding_steps s
 where s.depends_on_step_id is not null
on conflict do nothing;

-- ── 3. טריגר סנכרון — העמודה הישנה ממשיכה לעבוד לכל הכותבים הקיימים ─────────

create or replace function public.sync_step_dependency_edge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
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

revoke all on function public.sync_step_dependency_edge() from public, anon, authenticated;

drop trigger if exists trg_sync_step_dependency on public.onboarding_steps;
create trigger trg_sync_step_dependency
  after insert or update of depends_on_step_id on public.onboarding_steps
  for each row execute function public.sync_step_dependency_edge();

-- ── 4. onboarding_dependency_met — כל ההורים, אותם כללי ריכוך ────────────────

CREATE OR REPLACE FUNCTION public.onboarding_dependency_met(p_step_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.onboarding_steps%rowtype;
  v_unmet int;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return false; end if;

  -- איחוד שני המקורות; הורה שנמחק מהמסד נופל מה-join ולכן אינו חוסם (כמו היום).
  select count(*) into v_unmet
    from (
      select d.depends_on_step_id as dep_id
        from public.onboarding_step_dependencies d
       where d.step_id = p_step_id
      union
      select s.depends_on_step_id where s.depends_on_step_id is not null
    ) parents
    join public.onboarding_steps dep on dep.id = parents.dep_id
   where not (
     dep.status in ('completed','verified')
     or (dep.status = 'skipped'
         and coalesce(dep.payload->>'skipReason','')
             in ('already_connected','transferred_rep','not_applicable_history','not_applicable'))
   );

  return v_unmet = 0;
end;
$function$;

-- ── 5. unlock_dependent_steps — ילדים משני המקורות, שחרור רק כשהכול מולא ─────

CREATE OR REPLACE FUNCTION public.unlock_dependent_steps(p_step_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.onboarding_steps%rowtype;
  n int := 0;
begin
  for r in
    select distinct st.* from public.onboarding_steps st
    where st.status = 'locked'
      and (st.depends_on_step_id = p_step_id
           or exists (select 1 from public.onboarding_step_dependencies d
                      where d.step_id = st.id and d.depends_on_step_id = p_step_id))
  loop
    if public.onboarding_dependency_met(r.id) then
      update public.onboarding_steps set status = 'pending' where id = r.id;
      perform public.log_onboarding_event(
        r.user_id, r.id, r.engagement_id, 'status_changed', 'system',
        'השלב נפתח — התלייה הקודמת הושלמה', jsonb_build_object('from','locked','to','pending'));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;

-- ── 6. עריכת תלויות של שלב קיים ──────────────────────────────────────────────

create or replace function public.set_onboarding_step_dependencies(
  p_step_id text,
  p_depends_on text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s      public.onboarding_steps%rowtype;
  v_uid  uuid := auth.uid();
  v_deps text[] := coalesce(p_depends_on, '{}');
  v_dep  text;
  v_bad  int;
  v_met  boolean;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status in ('completed','verified','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;

  -- ניקוי כפילויות ו-null
  select coalesce(array_agg(distinct d), '{}') into v_deps
    from unnest(v_deps) d where d is not null and d <> s.id;

  -- כל הורה חייב להיות שלב של אותו לקוח
  select count(*) into v_bad
    from unnest(v_deps) d
    left join public.onboarding_steps ds on ds.id = d and ds.client_id = s.client_id
   where ds.id is null;
  if v_bad > 0 then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;

  -- מניעת מעגל: הורה מוצע שהוא צאצא (ישיר או עקיף) של השלב עצמו יוצר לולאה.
  -- הקשתות החדשות מוסיפות רק שלב→הורה, ולכן מעגל אפשרי רק דרך צאצא קיים.
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

  -- כתיבה: מוחקים הכול, העמודה מקבלת את ההורה הראשון (הטריגר מסנכרן את
  -- הקשת שלו), והשאר נכנסים ישירות לטבלה.
  delete from public.onboarding_step_dependencies where step_id = s.id;

  update public.onboarding_steps
     set depends_on_step_id = case when array_length(v_deps, 1) >= 1 then v_deps[1] else null end
   where id = s.id;

  if array_length(v_deps, 1) > 1 then
    insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
    select s.id, d, s.user_id from unnest(v_deps[2:]) d
    on conflict do nothing;
  end if;

  -- עדכון מצב הנעילה: רק בין pending ⇄ locked. שלב שכבר רץ לא ננעל מחדש —
  -- הוספת תלות למשימה שכבר התחילה אינה עוצרת אותה.
  v_met := public.onboarding_dependency_met(s.id);
  if s.status = 'locked' and v_met then
    update public.onboarding_steps set status = 'pending' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב נפתח — התלויות עודכנו', jsonb_build_object('from','locked','to','pending'));
  elsif s.status = 'pending' and not v_met then
    update public.onboarding_steps set status = 'locked' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב ננעל — נוספה תלות שטרם הושלמה', jsonb_build_object('from','pending','to','locked'));
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    'עודכנו התלויות של הבקשה', jsonb_build_object('dependsOn', to_jsonb(v_deps)));

  return jsonb_build_object('ok', true, 'dependsOn', to_jsonb(v_deps), 'met', v_met);
end;
$function$;

revoke all on function public.set_onboarding_step_dependencies(text, text[]) from public, anon;
grant execute on function public.set_onboarding_step_dependencies(text, text[]) to authenticated;
