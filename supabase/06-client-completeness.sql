-- ============================================================================
-- CLIENT COMPLETENESS — שדות חדשים לכיסוי הרמטי של 1301
-- ============================================================================
-- מוסיף שדות שחסרו בכרטיס הלקוח לטיפול בכל הסעיפים של 1301:
--   - אזרחויות נוספות (FATCA/CRS)
--   - ביטוח אובדן כושר עבודה (שדה 112)
--   - קרובים תלויים במוסד (סעיף 44ב, זיכוי 35%)
--   - רשימת עסקים (לעצמאי עם 2+ עסקים — נספח א' לכל אחד)
--   - דיווחי חובה: חברה משפחתית, CFC, צדדים קשורים בחו"ל (85א), חבר קיבוץ,
--     בחירת סעיף 14 לעולים/חוזרים ותיקים
-- ============================================================================

alter table public.clients
  -- אזרחויות נוספות (מערך טקסט פשוט)
  add column if not exists additional_citizenships text[] default '{}'::text[],

  -- ביטוח אובדן כושר עבודה
  add column if not exists has_disability_insurance      boolean default false,
  add column if not exists disability_insurance_annual   numeric default 0,

  -- קרובים תלויים + עסקים (JSONB lists)
  add column if not exists dependent_relatives           jsonb default '[]'::jsonb,
  add column if not exists businesses                    jsonb default '[]'::jsonb,

  -- דיווחי חובה ומצבים מיוחדים
  add column if not exists is_family_company_member             boolean default false,
  add column if not exists family_company_name                  text,
  add column if not exists is_foreign_controlling_shareholder   boolean default false,
  add column if not exists foreign_company_details              text,
  add column if not exists has_related_party_transactions_abroad boolean default false,
  add column if not exists is_kibbutz_member                    boolean default false,
  add column if not exists kibbutz_name                         text,
  add column if not exists section_14_elected                   boolean default false,
  add column if not exists section_14_start_year                int;
