-- 188: תיקון קריטי ל-186 — jsonb_set לא יוצר רמות-ביניים חסרות בנתיב.
--
-- claim_representation_reminder / release_representation_reminder_claim (186) כתבו
--   execution = jsonb_set(coalesce(execution,'{}'), array['reminders', p_audience], ...)
-- אבל jsonb_set יוצר רק את המפתח האחרון בנתיב — אם execution.reminders עצמו עדיין
-- לא קיים (המצב של כל שורה קיימת, כי 'reminders' הוא מפתח חדש שהמיגרציה הזו
-- הוסיפה), הקריאה מחזירה את האובייקט המקורי ללא שינוי, בשקט, בלי שגיאה.
--
-- ה-WHERE עדיין תפס (coalesce(...,0) = p_expected_count), ולכן הפונקציה דיווחה
-- claimed=true — אבל שום דבר לא נכתב בפועל. המשמעות: הטענה האטומית לא הגנה על
-- כלום בפעם הראשונה שתזכורת נשלחת לבקשה נתונה — כל הרצה חוזרת/חופפת הייתה
-- "תובעת" בהצלחה, מונה ה-count לעולם לא היה מתקדם, ותקרת maxReminders לא הייתה
-- נאכפת. אומת ב-staging (186-representation-office-settings.sql) לפני שהמיגרציה
-- הזו נכתבה: claim על שורה טרייה מחזיר true פעמיים ברציפות, execution.reminders
-- נשאר ריק אחרי שתיהן.
--
-- claim_representation_portal_reminder / release_representation_portal_reminder_claim
-- לא נפגעו: הנתיב שלהן הוא חד-רמתי (array['reminder'] בתוך payload, שתמיד
-- '{}'::jsonb לא-null) — יצירת מפתח אחרון-בנתיב-שהוא-גם-הראשון עובדת נכון.
--
-- התיקון: מיזוג (||) במקום jsonb_set מקונן — יוצר את 'reminders' אם חסר,
-- ומשמר אודיינסים אחרים שכבר קיימים תחתיו.

create or replace function public.claim_representation_reminder(
  p_request_id text, p_audience text, p_expected_count int
) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare
  v_rows int;
begin
  if p_audience not in ('sign', 'niClient', 'niSpouse') then
    raise exception 'invalid audience: %', p_audience;
  end if;

  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb) || jsonb_build_object(
           'reminders', coalesce(execution -> 'reminders', '{}'::jsonb) || jsonb_build_object(
             p_audience, jsonb_build_object('count', p_expected_count + 1, 'lastSentAt', now())
           )
         ),
         updated_at = now()
   where id = p_request_id
     and coalesce((execution -> 'reminders' -> p_audience ->> 'count')::int, 0) = p_expected_count;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.release_representation_reminder_claim(
  p_request_id text, p_audience text, p_claimed_count int, p_prev_last_sent_at timestamptz
) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_audience not in ('sign', 'niClient', 'niSpouse') then
    raise exception 'invalid audience: %', p_audience;
  end if;

  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb) || jsonb_build_object(
           'reminders', coalesce(execution -> 'reminders', '{}'::jsonb) || jsonb_build_object(
             p_audience, jsonb_strip_nulls(jsonb_build_object(
               'count', greatest(p_claimed_count - 1, 0), 'lastSentAt', p_prev_last_sent_at))
           )
         )
   where id = p_request_id
     and (execution -> 'reminders' -> p_audience ->> 'count')::int = p_claimed_count;
end;
$$;

revoke all on function public.claim_representation_reminder(text, text, int) from public, anon, authenticated;
grant execute on function public.claim_representation_reminder(text, text, int) to service_role;
revoke all on function public.release_representation_reminder_claim(text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.release_representation_reminder_claim(text, text, int, timestamptz) to service_role;
