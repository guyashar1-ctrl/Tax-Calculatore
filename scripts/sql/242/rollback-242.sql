-- ─── החזרה לאחור של 242 (הסרת עבודת מס) ──────────────────────────────────────────
-- ‼ 242 מוסיפה פונקציות בלבד — אין טבלה, עמודה או טריגר.
-- ‼ סדר ההתאוששות (RELEASE-TAX-AREA-UX-2026-10-14.md):
--   1. תקלה באתר בלבד — מחזירים את Vercel לפריסה הקודמת ולא נוגעים במסד. 242 לא מפריעה לאתר הישן,
--      ועבודות שבוטלו נשארות ניתנות להחזרה ברגע שהאתר המתוקן חוזר.
--   2. תקלה בפונקציות — קודם restore-cancelled-242.sql (כל עבודה שבוטלה חוזרת למצבה; מה שהוחלף — בדוח),
--      ורק אחר כך הקובץ הזה. מחיקה שבוצעה (רק טיוטות שלא יצאו מהמשרד) — אין מה להחזיר.
-- ‼ מגן: אם נשארה עבודה שבוטלה ולא טופלה — הקובץ נעצר ולא מוחק את הפונקציות.
do $$
declare n int;
begin
  select count(*) into n from public.onboarding_steps
   where status = 'cancelled' and payload ? 'removal'
     and step_type in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate');
  if n > 0 then
    raise exception 'rollback-242: % עבודות שבוטלו עדיין מסומנות לביטול — הרץ קודם restore-cancelled-242.sql (ובדוק את דוח ה-superseded)', n;
  end if;
end $$;
drop function if exists public.restore_tax_work(text);
drop function if exists public.remove_tax_work(text, text, text);
drop function if exists public.tax_work_removal_check(text);
drop function if exists public._tax_work_removal_mode(jsonb);
drop function if exists public._tax_work_removal_facts(text);
