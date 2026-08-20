-- 117 — «חומרים מרו״ח קודם» שהוסרה אינה נולדת מחדש.
--
-- הבעיה: generate_onboarding_steps מדלגת על שלב קיים רק כש-`status <> 'cancelled'`,
-- והיא רצה **שוב** על התקשרות קיימת — create_engagement_for_quotation לוקחת את
-- מסלול `existed=true` ומריצה אותה מחדש, ו-approve_quotation קוראת לה גם כשההצעה
-- כבר מאושרת. כלומר לקוח שפותח שוב את קישור ההצעה ולוחץ "אישור" היה מחזיר את
-- שלושת השלבים שגיא הסיר ביודעין.
--
-- ההכרעה: ביטול הוא החלטה של המשרד. הדרך היחידה להחזיר את הבקשה היא הוספה
-- ידנית מ"+ בקשה" — שם היא יושבת תמיד, בלי תלות ב-has_previous_accountant.
--
-- ‼ טלאי על הגרסה החיה (pg_get_functiondef + replace) ולא שכתוב מקובץ ריפו —
--   הפונקציה זזה מאז live-2026-08-09 (מיגרציות 109/111/115). הטלאי בודק שהטקסט
--   הישן קיים ונכשל בקול אם לא.
-- ‼ להריץ דרך execute_sql ולאמת אחרי — apply_migration מדווח הצלחה על בלוקי DO
--   בלי להחיל אותם (ראה MIGRATIONS.md, לקח מ-101).

do $patch$
declare
  src text;
  old1 text;
  new1 text;
begin
  src := pg_get_functiondef('public.generate_onboarding_steps(text, boolean)'::regprocedure);

  old1 := E'  v_new_id := null;\n\n  if v_has_prev then';

  new1 := E'  v_new_id := null;\n\n'
       || E'  -- ‼ 117: בקשה שהוסרה ידנית אינה נולדת מחדש. המחולל רץ שוב על התקשרות\n'
       || E'  -- קיימת (create_engagement_for_quotation, מסלול existed=true), ולכן בלי\n'
       || E'  -- הבדיקה הזאת לחיצה חוזרת על אישור ההצעה החזירה את שלושת השלבים.\n'
       || E'  -- חזרה לבקשה = הוספה ידנית מ"+ בקשה", ששם היא זמינה תמיד.\n'
       || E'  if v_has_prev and not exists (\n'
       || E'       select 1 from public.onboarding_steps\n'
       || E'        where client_id = e.client_id\n'
       || E'          and step_type in (''prev_accountant_details'',''release_letter'',''materials_received'')\n'
       || E'          and status = ''cancelled'') then';

  if position(old1 in src) = 0 then
    raise exception '117: הטקסט הישן של generate_onboarding_steps לא נמצא — הפונקציה זזה. לבדוק ידנית לפני החלה.';
  end if;

  src := replace(src, old1, new1);
  execute src;
end;
$patch$;
