-- חזרה מ-233: הטבלה והפונקציות של גרסאות הדוח יורדות. ‼ מוחק גרסאות שמורות — רק כשגיא אישר, ואחרי גיבוי.
drop function if exists public.record_annual_return_filed(text, date, text, text);
drop function if exists public.approve_annual_return(text, int);
drop function if exists public.save_annual_return(text, jsonb, jsonb, jsonb, jsonb);
drop trigger if exists annual_returns_immutable on public.annual_returns;
drop function if exists public._annual_return_immutable();
drop table if exists public.annual_returns;
