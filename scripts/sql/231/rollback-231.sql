-- התאוששות מ-231 (גרסאות הערכת מס) — staging בלבד. מוחק את כל הגרסאות השמורות.
-- ‼ לא לייצור בלי גיבוי של public.tax_estimates. 231 לא משנה שום פונקציה או טבלה קיימת — אין מה לשחזר.
begin;
drop function if exists public.approve_tax_estimate(text, int);
drop function if exists public.approve_tax_estimate(text);
drop function if exists public.save_tax_estimate(text, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.save_tax_estimate(text, jsonb, jsonb, jsonb);
drop trigger if exists tax_estimates_immutable on public.tax_estimates;
drop function if exists public._tax_estimate_immutable();
drop table if exists public.tax_estimates;
commit;
