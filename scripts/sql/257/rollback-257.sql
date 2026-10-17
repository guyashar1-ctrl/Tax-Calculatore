-- חזרה מ-257: הפונקציה יורדת; העמודות נשארות (ריקות אצל מי שלא הזין — מחיקה הייתה מוחקת היסטוריה של שורות מקור).
-- להסרה מלאה (רק כשאין שורות עם line_key): הורידו את ההערה משתי השורות האחרונות.
drop function if exists public.record_source_lines(text, uuid, jsonb, jsonb, uuid);
drop index if exists public.tax_year_facts_evidence_idx;
-- alter table public.tax_year_facts drop column if exists line_key;
-- alter table public.tax_year_facts drop column if exists entered_by;
