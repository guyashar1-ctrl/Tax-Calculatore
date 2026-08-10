-- 85 — תיקון: כתיבת תלויות מחדש איבדה את קשת ההורה הראשון
--
-- הבאג (התגלה ב-E2E של שלב 11): set_onboarding_step_dependencies מחקה את כל
-- הקשתות, עדכנה את depends_on_step_id להורה הראשון, וסמכה על הטריגר
-- trg_sync_step_dependency שיכתוב את הקשת שלו חזרה. אבל הטריגר יורה רק כאשר
-- הערך **משתנה** — וכשההורה הראשון נשאר אותו הורה, ה-UPDATE הוא no-op,
-- הטריגר שותק, והקשת שנמחקה אינה חוזרת.
--
-- מה זה שבר בפועל: רק את התצוגה. onboarding_dependency_met מאחדת את הטבלה
-- עם העמודה, ולכן שני ההורים המשיכו להיאכף והשלב נשאר נעול כנדרש — אבל
-- שורת "ממתין ל:" הציגה הורה אחד במקום שניים, ובוחר התלויות בעריכה נפתח
-- חסר. משימה שנראית תלויה בדבר אחד בזמן שהיא תלויה בשניים היא בדיוק סוג
-- השקר שהמסך הזה אמור למנוע.
--
-- התיקון: לכתוב את **כל** ההורים לטבלה במפורש, בלי להסתמך על הטריגר.
-- הטריגר נשאר — הוא עדיין משרת את כל הכותבים הישנים שמעדכנים רק את העמודה
-- (המרכיב, set_paperless_path), וה-on conflict do nothing מונע התנגשות.

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

  delete from public.onboarding_step_dependencies where step_id = s.id;

  update public.onboarding_steps
     set depends_on_step_id = case when array_length(v_deps, 1) >= 1 then v_deps[1] else null end
   where id = s.id;

  -- ‼ כל ההורים נכתבים במפורש. הסתמכות על הטריגר איבדה את ההורה הראשון
  -- כשהוא לא השתנה (UPDATE ללא שינוי אינו מפעיל טריגר).
  if array_length(v_deps, 1) >= 1 then
    insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
    select s.id, d, s.user_id from unnest(v_deps) d
    on conflict do nothing;
  end if;

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

-- מילוי-לאחור: שלבים שיש להם הורה בעמודה אך הקשת חסרה בטבלה (התוצאה של הבאג).
insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
select s.id, s.depends_on_step_id, s.user_id
  from public.onboarding_steps s
 where s.depends_on_step_id is not null
on conflict do nothing;
