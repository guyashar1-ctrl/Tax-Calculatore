-- ═══════════════════════════════════════════════════════════════════════════
-- 289 · פייפרלס נפתח באישור ההצעה — גם בעסק חדש (23.10.2026)
--
-- ‼ גיא: «הדרך היחידה שלי לעשות גבייה היא דרך פייפרלס, והעדיפות לפתוח את זה כמה שיותר
--   מוקדם». הכרעה (23.10.2026): בעסק חדש ההרשמה, החיבור והכרטיס נפתחים באישור ההצעה;
--   רק «חיבור פייפרלס לרשות המסים» מחכה לפתיחת התיקים (מספרי הקצאה בלי תיק — אין).
--   נצפה חי באותו יום (צפייה בלבד): טופס ההרשמה של הלקוח ו«הזמנת עוסק» של המשרד לא
--   שואלים מספר עוסק או תיק — שם, סוג עסק, מייל ונייד.
--
-- עד היום (234 §2ה): בעסק חדש `paperless_invite` נוצר locked עם תלות ב-file_opening, וכל
--   השרשרת (חיבור ← הרשאת תשלום) חיכתה לפתיחת התיקים.
-- מעכשיו:
--   1 · המחולל לא נועל את ההרשמה. (שורות קיימות לא משתנות — ליאת נשארת נעולה עד
--       «פתח עכשיו» של המשרד; אין מילוי לאחור.)
--   2 · `paperless_tax_authority` מקבל הורה שני — פתיחת התיקים — כשיש ללקוח פתיחת
--       תיקים פתוחה. טריגר אחד על השורה, כדי שכל נתיבי היצירה (המחולל, 132 — עוסק
--       שנעשה מורשה, «＋ בקשה חדשה», שחרור סוג העוסק) יקבלו אותו כלל. ההורה הראשון
--       (החיבור) לא נגע. נפתח רק כששניהם הושלמו (onboarding_dependency_met / unlock_dependent_steps).
--   3 · ובכיוון ההפוך: פתיחת תיקים שנוצרת אחרי שהחיבור לרשות המסים כבר קיים ונעול —
--       מתווספת כהורה. שלב שכבר פתוח ללקוח לא נלקח ממנו.
-- מי תלוי (scripts/who-depends.mjs file_opening): portal_lock_reason (מציג את כל ההורים
--   החוסמים — «ייפתח אחרי חיבור לפייפרלס · פתיחת התיקים ברשויות»), office_open_locked_step
--   (מוחק את כל הקשתות), mirror_step_dependency_column (העמודה = ההורה הראשון בסדר), והמסך
--   מקבץ לפי סוג השלב (requestGroups) ולא לפי העמודה. ההוכחה: staging-test-new-business-234.mjs
--   N1 (ההרשמה פתוחה) ו-N2–N3 (שני הורים; נפתח רק כששניהם הושלמו; «פתח עכשיו»).
--
-- ‼ לא שולח מייל ולא מפרסם לדף. סדר הפריטים («פייפרלס ראשון») הוא נתון של המסלול
--   ונשמר דרך save_office_flow, לא כאן.
-- ‼ להריץ דרך execute_sql ולאמת בגופים (apply_migration בלע בעבר בלוקי DO בעברית).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · המחולל: ההרשמה לפייפרלס לא מחכה לפתיחת התיקים ──────────────────────────
do $mig$
declare
  v_fn  constant regprocedure := 'public.generate_onboarding_steps(text,boolean)'::regprocedure;
  v_def text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  v_from constant text := E'      -- ‼ 234: אין קבלות בלי תיק.';
  v_to   constant text := E'      v_planned := v_planned || jsonb_build_object(''step_type'',''paperless_invite''';
  v_new  constant text := E'      -- 289: ההרשמה לפייפרלס נפתחת באישור ההצעה גם בעסק חדש — הגבייה עוברת בה. רק\n'
                       || E'      -- «חיבור פייפרלס לרשות המסים» מחכה לפתיחת התיקים (טריגר 289 על השלב ההוא).\n';
  v_a int; v_b int;
begin
  if position('-- 289: ההרשמה לפייפרלס' in v_def) > 0 then
    raise notice '289 §1: already applied';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1
     or (length(v_def) - length(replace(v_def, v_to, ''))) / length(v_to) <> 1 then
    raise exception '289 §1: anchors not found exactly once';
  end if;
  v_a := position(v_from in v_def);
  v_b := position(v_to in v_def);
  if v_b <= v_a or v_b - v_a > 1500 then
    raise exception '289 §1: unexpected block span % → %', v_a, v_b;
  end if;
  execute left(v_def, v_a - 1) || v_new || substr(v_def, v_b);
  -- אימות מהמסד, לא מהמשתנה
  v_def := pg_get_functiondef(v_fn);
  if position('234: אין קבלות' in v_def) > 0 or position('-- 289: ההרשמה לפייפרלס' in v_def) = 0 then
    raise exception '289 §1: verification failed';
  end if;
end
$mig$;

-- ── 2 · חיבור פייפרלס לרשות המסים מחכה גם לפתיחת התיקים ──────────────────────
create or replace function public._paperless_tax_authority_waits_for_files()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_fo public.onboarding_steps%rowtype;
  t    public.onboarding_steps%rowtype;
begin
  if new.step_type = 'paperless_tax_authority' then
    -- ‼ רק בקשה שעוד לא נפתחה ללקוח: נעולה, או «ממתין» שזה עתה נוצר. שורה שנכנסת סגורה
    --   היא היסטוריה.
    if new.status not in ('locked', 'pending') then return null; end if;
    select * into v_fo from public.onboarding_steps
     where client_id = new.client_id and step_type = 'file_opening' and status <> 'cancelled'
       and not public.step_satisfies_dependency(status, payload)
     order by (engagement_id is not distinct from new.engagement_id) desc, created_at desc limit 1;
    if v_fo.id is null then return null; end if;
    insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
    values (new.id, v_fo.id, new.user_id) on conflict do nothing;
    if new.status = 'pending' then
      update public.onboarding_steps set status = 'locked', updated_at = now() where id = new.id;
    end if;
  elsif new.step_type = 'file_opening' and new.status <> 'cancelled'
        and not public.step_satisfies_dependency(new.status, new.payload) then
    -- ‼ רק נעולה: בקשה שכבר פתוחה ללקוח לא נלקחת ממנו.
    for t in select * from public.onboarding_steps
              where client_id = new.client_id and step_type = 'paperless_tax_authority' and status = 'locked' loop
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (t.id, new.id, t.user_id) on conflict do nothing;
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public._paperless_tax_authority_waits_for_files() from public, anon, authenticated;

drop trigger if exists z_paperless_tax_authority_waits_for_files on public.onboarding_steps;
create trigger z_paperless_tax_authority_waits_for_files
  after insert on public.onboarding_steps
  for each row when (new.step_type in ('paperless_tax_authority', 'file_opening'))
  execute function public._paperless_tax_authority_waits_for_files();
