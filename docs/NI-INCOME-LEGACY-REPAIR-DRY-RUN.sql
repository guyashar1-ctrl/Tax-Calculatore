-- ─── הכנסה מוצהרת בב"ל שנקראה לפני 219 — הצעת תיקון, קריאה בלבד ───────────────
-- ‼ DRY-RUN. SELECT בלבד: לא מעדכן, לא מוחק, לא נוגע ב-field_meta.
-- ‼ לא הורץ מול שום מסד במסגרת 219. להרצה רק אחרי אישור מפורש של גיא.
--
-- מה מחפשים: ni_income_basis_monthly / spouse_ni_income_basis_monthly שנכתבו
-- מקריאה אוטומטית (field_meta.source='automation') — כלומר מהמתאם שלפני 219,
-- שכתב את «סכום הכנסה» של השורה האחרונה בלי לבדוק אם היא הצהרה.
--
-- לכל שורה: מה קריאת ב"ל האחרונה שהצליחה (btl.sync_file) אומרת על אותו
-- אדם — מקור המידע, החודשים והסכום — וההצעה:
--   clear_misread_assessment — הערך שווה ל«סכום הכנסה» של שורת שומה (לא
--                              הצהרה) ⇒ לנקות. כך 47,800 משומה שנתית.
--   confirm_declaration      — הערך שווה להצהרה ⇒ להשאיר; קריאה חוזרת
--                              תשמור את ההצהרה ב-ni_income_list.
--   reread_needed            — אין ראיה מספקת ⇒ קריאה חוזרת של התיק.
--
-- ‼ ההחלה בפועל — **לא** בעדכון ישיר: דרך המסך («קריאת התיק בביטוח לאומי» →
-- «אשר שינויים»), שעובר propose → accept ונרשם ביומן. ערכים שהוזנו ביד
-- (source ≠ automation) אינם ברשימה בכלל.

with persons as (
  select c.id as client_id, c.user_id, 'client'::text as role,
         c.ni_income_basis_monthly as value,
         c.field_meta -> 'niIncomeBasisMonthly' as meta,
         c.ni_income_list as list
    from public.clients c
   where c.ni_income_basis_monthly is not null
  union all
  select c.id, c.user_id, 'spouse',
         c.spouse_ni_income_basis_monthly,
         c.field_meta -> 'spouseNiIncomeBasisMonthly',
         c.spouse_ni_income_list
    from public.clients c
   where c.spouse_ni_income_basis_monthly is not null
),
legacy as (
  select * from persons
   where meta ->> 'source' = 'automation'
     -- ‼ כבר תוקן אחרי 219: הצהרה שמורה ששווה לערך ⇒ לא ברשימה.
     and coalesce((list -> 'declaration' ->> 'amount')::numeric, -1) <> value
),
last_read as (
  select distinct on (j.client_id) j.client_id, j.id as job_id, j.finished_at, j.result
    from public.automation_jobs j
   where j.action_type = 'btl.sync_file' and j.status = 'succeeded'
   order by j.client_id, j.finished_at desc nulls last
),
evidence as (
  select l.*, r.job_id, r.finished_at,
         p -> 'sections' -> 'directIncome' as income
    from legacy l
    left join last_read r on r.client_id = l.client_id
    left join lateral (
      select p from jsonb_array_elements(coalesce(r.result -> 'persons', '[]'::jsonb)) p
       where p ->> 'role' = l.role
       limit 1
    ) pp on true
)
select
  e.client_id, e.role, e.value as card_value,
  e.meta ->> 'syncedAt' as written_at,
  e.job_id as last_btl_read, e.finished_at as last_btl_read_at,
  e.income -> 'value' ->> 'infoSource' as read_info_source,
  e.income -> 'value' ->> 'fromMonth' as read_from_month,
  e.income -> 'value' ->> 'toMonth' as read_to_month,
  coalesce(e.income -> 'value' ->> 'amount', e.income -> 'value' ->> 'monthlyAmount') as read_amount,
  case
    when e.income is null or not coalesce((e.income ->> 'ok')::boolean, false) then 'reread_needed'
    when coalesce((e.income -> 'value' ->> 'amount')::numeric, (e.income -> 'value' ->> 'monthlyAmount')::numeric) = e.value
         and (e.income -> 'value' ->> 'infoSource') ~ 'שומה' then 'clear_misread_assessment'
    when coalesce((e.income -> 'value' ->> 'amount')::numeric, (e.income -> 'value' ->> 'monthlyAmount')::numeric) = e.value
         and (e.income -> 'value' ->> 'infoSource') ~ 'הצהרה' then 'confirm_declaration'
    else 'reread_needed'
  end as proposal
from evidence e
order by proposal, e.client_id, e.role;
