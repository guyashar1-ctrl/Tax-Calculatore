-- 309 · הצהרת הון — הגישור (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-wealth-declaration.html)
--   _tax_year_items: פריט חדש אחד —
--     wealth.bridge.income — הכנסה ומס לכל שנה בין ההצהרות (משע״ם), עובדה אחת ליום ההצהרה: { years: { 2021: { income, tax } … } }
--   wealth.since.sources / uses / living — כבר קיימים ('detail'); עכשיו נענים כרשומה ('record', 241) ולא כטקסט. בלי שינוי כאן.
--   ‼ נבנה מהרשימה שבמסד (לא מהעתק): הרשימה הקיימת + החדש; פריט קיים לא משתנה. החלה חוזרת — בלי שינוי.
do $p$
declare
  v_cur jsonb := public._tax_year_items();
  v_add jsonb := '{"wealth.bridge.income":"amount"}'::jsonb;
begin
  if v_cur @> v_add then raise notice '309: _tax_year_items — כבר הוחל'; return; end if;
  if exists (select 1 from jsonb_each_text(v_add) a where v_cur ? a.key and v_cur->>a.key <> a.value) then raise exception '309: פריט קיים בסוג אחר'; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur || v_add)::text);
end
$p$;

-- בדיקה:
--   select public._tax_year_items() ? 'wealth.bridge.income';  -- true
