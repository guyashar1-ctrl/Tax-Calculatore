-- 314 · הערכת מס פשוטה (30.10.2026, הדמיה מאושרת docs/proposals/2026-10-30-tax-estimate-simple.html)
--   _tax_year_items: שני פריטים חדשים — מה שנפתח מריבוע «הכנסה נוספת» בשאלון ההערכה:
--     salary.estimate      — «בערך כמה משכורת ברוטו בחודש?» (רשומה: בחודש, וכמה חודשים השנה)
--     niBenefits.estimate  — «בערך כמה קיבלת השנה מביטוח לאומי?» (סכום)
--   ‼ נבנה מהרשימה שבמסד (לא מהעתק): הרשימה הקיימת + החדשים; פריט קיים לא משתנה. החלה חוזרת — בלי שינוי.
--   חזרה: אין צורך — פריט שלא בשימוש אינו משנה דבר; להסרה: אותו דפוס עם jsonb - '{...}'.
do $p$
declare
  v_cur jsonb := public._tax_year_items();
  v_add jsonb := '{"salary.estimate":"amount","niBenefits.estimate":"amount"}'::jsonb;
begin
  if v_cur @> v_add then raise notice '314: _tax_year_items — כבר הוחל'; return; end if;
  if exists (select 1 from jsonb_each_text(v_add) a where v_cur ? a.key and v_cur->>a.key <> a.value) then raise exception '314: פריט קיים בסוג אחר'; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur || v_add)::text);
end
$p$;

-- בדיקה:
--   select public._tax_year_items() ?& array['salary.estimate','niBenefits.estimate'];  -- true
