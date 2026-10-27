-- 308 · הערכת מס בארבעה שלבים (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-tax-estimate.html)
--   _tax_year_items: שני פריטים חדשים —
--     business.inPaperless     — בשאלון ההערכה: «כל החשבוניות והקבלות של השנה — כבר בפייפרלס?» (בחירה)
--     business.forecastMonths  — בקשת הצפי שהמשרד מוסיף אחרי המשיכה מפייפרלס: «נכון» או הערכה לכל חודש שנשאר
--                                (רשומה 'record' — portal_submit_tax_info שומר אותה כעובדה ממתינה, 241)
--   ‼ נבנה מהרשימה שבמסד (לא מהעתק): הרשימה הקיימת + החדשים; פריט קיים לא משתנה. החלה חוזרת — בלי שינוי.
--   חזרה: אין צורך — פריט שלא בשימוש אינו משנה דבר; להסרה: אותו דפוס עם jsonb - '{...}'.
do $p$
declare
  v_cur jsonb := public._tax_year_items();
  v_add jsonb := '{"business.inPaperless":"detail","business.forecastMonths":"amount"}'::jsonb;
begin
  if v_cur @> v_add then raise notice '308: _tax_year_items — כבר הוחל'; return; end if;
  if exists (select 1 from jsonb_each_text(v_add) a where v_cur ? a.key and v_cur->>a.key <> a.value) then raise exception '308: פריט קיים בסוג אחר'; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur || v_add)::text);
end
$p$;

-- בדיקה:
--   select public._tax_year_items() ?& array['business.inPaperless','business.forecastMonths'];  -- true
