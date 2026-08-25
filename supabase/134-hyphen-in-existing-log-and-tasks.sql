-- ─── 134 · מקף רגיל גם בשורות שכבר נכתבו ביומן ובמשימות ─────────────────────
-- 133 תיקנה את הפונקציות, כלומר את מה שייווצר מכאן והלאה. מה שאותן פונקציות
-- כתבו בעבר נשאר עם "—". הכרעת גיא (2026-08-25): ליישר גם אותו.
--
-- שלוש עמודות בלבד, כפי שהוגדר:
--   · onboarding_events.note   - שורות יומן הפעילות שהרו"ח קורא בלשונית
--   · tasks.title              - כותרות משימות שיושבות על השולחן
--   · tasks.description        - גוף המשימה באותן משימות
--
-- ‼ מה **לא** נגעו בו, במפורש:
--   · email_messages (גוף ונושא) - זה מה שהנמען קיבל בפועל.
--   · accountant_notifications - שלוש השורות שנושאות "—" כולן suppressed,
--     כלומר לא נשלחו ולא יישלחו. אין למי לתקן שם טקסט.
--   · documents, clients, quotations - טקסט שגיא הקליד בעצמו. 128/129 לא
--     נגעו בו, והוא אינו בהיקף שהתבקש.
--
-- ‼ **משימת מערכת שהכותרת המנורמלת שלה כבר תפוסה אינה משוכתבת.** האינדקס
-- `tasks_system_unique_title (user_id, title) where client_id is null` הוא
-- מנגנון הזהות של משימות המערכת: הכותרת *היא* המפתח. כשה-codemod של
-- 2026-08-24 שינה את הכותרת שהקוד מייצר מ-"—" ל-"-", המפתח השתנה - והמערכת
-- יצרה עותק שני של משימת בדיקת העדכניות הרבעונית, כי הכותרת החדשה לא התאימה
-- לישנה. נרמול הכותרת הישנה עכשיו היה מתנגש בעותק החדש.
--   ‼ המיגרציה **אינה מוחקת כפילות** - זו הכרעה של גיא על נתון אמת. היא
--   מדלגת על השורה, מודיעה עליה בשם, והאימות בסוף מוודא שכל שורה שנשארה עם
--   "—" חסומה מהסיבה הזאת בדיוק ולא מסיבה אחרת.
--
-- ‼ `tasks.updated_at` יזוז ל-now() בשורות שנגענו בהן - הטריגר
-- `tasks_updated_at` רץ על כל עדכון. נבדק לפני ההחלה שאין לזה משמעות במסך:
-- `updatedAt` של משימה משמש רק כמפתח מיון משני ל**משימות שהושלמו ללא**
-- `completedAt`, ולכל המשימות המושלמות שנגענו בהן יש `completedAt`. משימות
-- פתוחות ממוינות לפי דחיפות ותאריך יעד בלבד. לא ניטרלנו את הטריגר: טריגר
-- שנשאר מנוטרל בטבלת המשימות הוא נזק אמיתי, והשדה כאן אינו מטעה - השורה
-- באמת נגעה בתאריך הזה.
--
-- ‼ ההחלפה היא תו-בתו: replace של תו יחיד בתו יחיד, ולכן אורך הטקסט חייב
-- להישאר זהה. הבלוק מודד את האורך הכולל לפני ואחרי ונופל אם הוא זז - זו
-- ההוכחה שלא נגרר לכאן שום שינוי אחר.

do $do$
declare
  v_ev_rows  int;
  v_ti_rows  int;
  v_de_rows  int;
  v_len_pre  bigint;
  v_len_post bigint := 0;
  v_l        bigint;
  r          record;
begin
  -- ── האורך הכולל של השורות שעומדות להשתנות, לפני הנגיעה ────────────────────
  -- כותרות חסומות אינן נספרות כאן, כי אינן עומדות להשתנות.
  select coalesce((select sum(length(note)) from public.onboarding_events where note like '%—%'), 0)
       + coalesce((select sum(length(t.title)) from public.tasks t
                    where t.title like '%—%'
                      and not (t.client_id is null and exists (
                            select 1 from public.tasks o
                             where o.user_id = t.user_id and o.id <> t.id
                               and o.client_id is null
                               and o.title = replace(t.title, '—', '-')))), 0)
       + coalesce((select sum(length(description)) from public.tasks where description like '%—%'), 0)
    into v_len_pre;

  -- ── 1. יומן הפעילות ───────────────────────────────────────────────────────
  with upd as (
    update public.onboarding_events
       set note = replace(note, '—', '-')
     where note like '%—%'
    returning length(note) as l)
  select count(*)::int, coalesce(sum(l), 0) into v_ev_rows, v_l from upd;
  v_len_post := v_len_post + v_l;
  raise notice '134: onboarding_events.note - % שורות', v_ev_rows;

  -- ── 2. כותרות משימות · פרט לאלה שהכותרת המנורמלת שלהן כבר תפוסה ───────────
  with upd as (
    update public.tasks t
       set title = replace(t.title, '—', '-')
     where t.title like '%—%'
       and not (t.client_id is null and exists (
             select 1 from public.tasks o
              where o.user_id = t.user_id and o.id <> t.id
                and o.client_id is null
                and o.title = replace(t.title, '—', '-')))
    returning length(t.title) as l)
  select count(*)::int, coalesce(sum(l), 0) into v_ti_rows, v_l from upd;
  v_len_post := v_len_post + v_l;
  raise notice '134: tasks.title - % שורות', v_ti_rows;

  for r in
    select t.id, t.title from public.tasks t
     where t.title like '%—%'
       and t.client_id is null
       and exists (select 1 from public.tasks o
                    where o.user_id = t.user_id and o.id <> t.id
                      and o.client_id is null
                      and o.title = replace(t.title, '—', '-'))
  loop
    raise notice '134: ‼ דילוג - הכותרת המנורמלת כבר תפוסה (כפילות משימת מערכת): % · %',
      r.id, r.title;
  end loop;

  -- ── 3. גוף המשימות ────────────────────────────────────────────────────────
  with upd as (
    update public.tasks
       set description = replace(description, '—', '-')
     where description like '%—%'
    returning length(description) as l)
  select count(*)::int, coalesce(sum(l), 0) into v_de_rows, v_l from upd;
  v_len_post := v_len_post + v_l;
  raise notice '134: tasks.description - % שורות', v_de_rows;

  if v_len_post <> v_len_pre then
    raise exception '134: האורך הכולל השתנה (% אל %). ההחלפה נגעה במשהו מעבר לתו המקף.',
      v_len_pre, v_len_post;
  end if;

  raise notice '134: % שורות תוקנו · האורך הכולל נשמר (% תווים).',
    v_ev_rows + v_ti_rows + v_de_rows, v_len_pre;
end $do$;

-- ─── אימות · אפס מקפים ארוכים, פרט לכותרות שהאינדקס חוסם ────────────────────
-- ‼ בלוק נפרד ובלתי-תלוי. אם ה-DO שלמעלה לא רץ כלל (וזה קרה בעבר דרך
-- apply_migration) - הבדיקה הזאת היא זו שתצעק במקומו.
do $do$
declare
  v_ev      int;
  v_ti      int;
  v_blocked int;
  v_de      int;
  v_trg     text;
begin
  select count(*)::int into v_ev from public.onboarding_events where note        like '%—%';
  select count(*)::int into v_de from public.tasks             where description like '%—%';
  select count(*)::int into v_ti from public.tasks             where title       like '%—%';
  select count(*)::int into v_blocked from public.tasks t
   where t.title like '%—%'
     and t.client_id is null
     and exists (select 1 from public.tasks o
                  where o.user_id = t.user_id and o.id <> t.id
                    and o.client_id is null
                    and o.title = replace(t.title, '—', '-'));

  if v_ev > 0 or v_de > 0 then
    raise exception '134: נשארו מקפים ארוכים - יומן:% גוף משימה:%', v_ev, v_de;
  end if;

  -- כל כותרת שנשארה חייבת להיות חסומה בגלל האינדקס. אחרת - משהו לא רץ.
  if v_ti <> v_blocked then
    raise exception '134: % כותרות נשארו עם מקף ארוך, מתוכן רק % חסומות. השאר לא טופלו.',
      v_ti, v_blocked;
  end if;
  if v_ti > 0 then
    raise notice '134: % כותרות נשארו במכוון - כפילות משימת מערכת, מחכה להכרעת גיא.', v_ti;
  end if;

  -- לא ניטרלנו טריגרים, ולכן זה חייב להיות נכון. אם לא - מישהו כן ניטרל.
  select t.tgenabled into v_trg
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'tasks' and t.tgname = 'tasks_updated_at';
  if v_trg is distinct from 'O' then
    raise exception '134: הטריגר tasks_updated_at אינו פעיל (%)', coalesce(v_trg, 'חסר');
  end if;

  raise notice '134: אימות עבר.';
end $do$;
