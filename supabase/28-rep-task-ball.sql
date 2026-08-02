-- ═══════════════════════════════════════════════════════════════════════════
--  28 — "אצל מי הכדור" במשימת הייצוג מתעדכן לפי שלב הבקשה
-- ═══════════════════════════════════════════════════════════════════════════
--  משימת "להשלים ייצוג" נוצרת פעם אחת — מהאפליקציה (כדור אצלי) או מאישור
--  הצעת מחיר (כדור אצל הלקוח, כי הרגע נשלח לו הקישור). משם היא קפאה: הלקוח
--  מילא, חתם, הטופס הוגש לשע"ם — והכדור נשאר על מי שהיה בהתחלה.
--
--  ‼ טריגר ולא קריאה מתוך כל פונקציה — כמו בהתראות (27). שינוי הסטטוס נתפס
--  בכל מסלול: הדפדפן של הרו"ח, העמוד הציבורי של הלקוח, ומסלולים עתידיים.
--
--  המיפוי זהה לזה שמוצג ברשימת הלקוחות (PIPELINE_STAGES ב-ClientList).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sync_rep_task_ball()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ball text;
begin
  if coalesce(old.status, '') = coalesce(new.status, '') then return new; end if;
  if new.linked_client_id is null then return new; end if;

  -- הייצוג אושר — אין עוד מה "להשלים", והמשימה נסגרת.
  if new.status = 'active' then
    update public.tasks
      set status = 'done', completed_at = now()
      where user_id = new.user_id
        and client_id = new.linked_client_id
        and status = 'open'
        and title like 'להשלים ייצוג%';
    return new;
  end if;

  v_ball := case new.status
    when 'pending_fill'         then 'client'      -- ממתין שהלקוח ימלא
    when 'awaiting_accountant'  then 'me'          -- מילא — עליי להפיק את הטופס
    when 'pending_signature'    then 'client'      -- נשלח לחתימתו
    when 'awaiting_stamp'       then 'me'          -- חתם — עליי לחתום ולהגיש
    when 'awaiting_authorities' then 'authority'   -- הוגש — ממתין לרשויות
    else null
  end;
  if v_ball is null then return new; end if;

  update public.tasks
    set ball_with = v_ball,
        -- ברגע שהלקוח נגע בתהליך המשימה כבר לא "טרם התחילה"
        progress = case when new.status = 'pending_fill' then progress else 'in_progress' end
    where user_id = new.user_id
      and client_id = new.linked_client_id
      and status = 'open'
      and title like 'להשלים ייצוג%'
      and (ball_with is distinct from v_ball
           or (new.status <> 'pending_fill' and progress is distinct from 'in_progress'));

  return new;
end;
$$;

drop trigger if exists rep_requests_sync_task_ball on public.representation_requests;
create trigger rep_requests_sync_task_ball
  after update on public.representation_requests
  for each row execute function public.sync_rep_task_ball();


-- ─── יישור המשימות הקיימות למצב האמיתי של הבקשה ────────────────────────────
-- משימות פתוחות שהכדור עליהן נשאר משלב היצירה — תיקון "אצל מי הכדור" למי
-- שבאמת מחזיק בו עכשיו, וסגירת מה שכבר הושלם.
update public.tasks t
   set ball_with = m.ball
  from (
    select r.user_id, r.linked_client_id,
           case r.status
             when 'pending_fill'         then 'client'
             when 'awaiting_accountant'  then 'me'
             when 'pending_signature'    then 'client'
             when 'awaiting_stamp'       then 'me'
             when 'awaiting_authorities' then 'authority'
           end as ball
      from public.representation_requests r
     where r.linked_client_id is not null
       and r.status <> 'active'
  ) m
 where t.user_id = m.user_id
   and t.client_id = m.linked_client_id
   and t.status = 'open'
   and t.title like 'להשלים ייצוג%'
   and m.ball is not null
   and t.ball_with is distinct from m.ball;

-- ייצוג שכבר אושר — המשימה נשארה פתוחה כי בזמנו לא היה מי שיסגור אותה.
update public.tasks t
   set status = 'done', completed_at = now()
  from public.representation_requests r
 where r.linked_client_id = t.client_id
   and r.user_id = t.user_id
   and r.status = 'active'
   and t.status = 'open'
   and t.title like 'להשלים ייצוג%';
