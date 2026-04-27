-- ============================================================================
-- SUPABASE SCHEMA — מערכת CRM לרו"ח
-- ============================================================================
-- הקובץ הזה יוצר את:
--   1. כל הטבלאות שהאפליקציה צריכה (clients, tasks, reps, docs, employees, cases)
--   2. כללי הרשאה (RLS) שמבטיחים שכל משתמש רואה רק את הנתונים שלו
--   3. טריגרים לעדכון אוטומטי של updated_at
--   4. טבלת profiles שמתסנכרנת אוטומטית עם auth.users (לכל הרשמה — נוצר פרופיל)
--   5. דליי Storage לקבצים + RLS על קבצים
--
-- אסטרטגיה מרכזית:
--   - שדות עמוקים שתמיד נטענים יחד עם הלקוח (spouse, children, properties,
--     foreignAccounts, additionalContacts, fieldMeta, activity) → jsonb.
--     מתאים לאופי "מסמך אחד לכל לקוח" של האפליקציה היום, ומקל מאוד על
--     המיגרציה (פשוט מעתיקים את ה-object).
--   - שדות שמסננים/חופשים לפיהם (status, ballWith, clientId) → עמודות אמיתיות.
--   - IDs הם text כדי לשמור על תאימות עם המידע הקיים בדפדפן (sample-1, t-1...).
--     רשומות חדשות מקבלות UUID אוטומטית.
--   - כל טבלה: עמודת user_id + RLS שמסננת לפי auth.uid().
-- ============================================================================


-- ============================================================================
-- HELPERS
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================================
-- 1. PROFILES — פרופיל לכל משתמש מחובר (רחבה של auth.users)
-- ============================================================================

create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text not null,
  full_name              text,
  firm_name              text,
  representative_number  text,
  representative_type    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- יצירת פרופיל אוטומטית בכל הרשמה חדשה
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 2. CLIENTS — לקוחות (כל ~80 השדות מהאפיון)
-- ============================================================================

create table public.clients (
  id                                   text primary key default gen_random_uuid()::text,
  user_id                              uuid not null references auth.users(id) on delete cascade,

  -- סוג לקוח
  type                                 text default 'individual',  -- 'individual' | 'company'

  -- ── פרטים אישיים ──
  id_number                            text,
  first_name                           text,
  last_name                            text,
  birth_date                           date,
  gender                               text,
  phone                                text,
  email                                text,
  city                                 text,
  address                              text,

  -- ── סיווג מס הכנסה ──
  income_tax_type                      text,
  vat_status                           text,
  business_description                 text,
  has_exempt_from_withholding          boolean default false,

  -- ── סיווג ביטוח לאומי ──
  ni_type                              text,
  has_tax_coordination                 boolean default false,
  tax_coordination_details             text,

  -- ── מצב משפחתי (סיכום) ──
  family_status                        text,
  spouse_name                          text,
  spouse_id_number                     text,
  spouse_working                       boolean default false,
  spouse_income                        numeric default 0,

  -- ── בן/בת זוג מלא — לחישוב תא משפחתי (jsonb של SpouseData) ──
  spouse                               jsonb,

  -- ── ילדים — מערך של Child ──
  children                             jsonb default '[]'::jsonb,

  -- ── נקודות זיכוי ──
  is_new_immigrant                     boolean default false,
  aliyah_year                          int,
  is_returning_resident                boolean default false,
  returning_year                       int,
  disability_percentage                numeric default 0,
  disability_type                      text,
  has_academic_degree                  boolean default false,
  academic_degree_year                 int,
  academic_degree_type                 text,           -- 'bachelor'|'master'|'phd'|''
  completed_idf                        boolean default false,
  idf_release_year                     int,
  completed_national_service           boolean default false,
  national_service_year                int,

  -- ── ישוב מזכה ──
  qualifying_settlement_id             text,
  qualifying_settlement_override       boolean default false,
  qualifying_settlement_credit_points  numeric default 0,

  -- ── נכסי דיור ──
  has_residential_property             boolean default false,
  property_address                     text,
  number_of_properties                 int default 0,
  properties                           jsonb default '[]'::jsonb,  -- ResidentialProperty[]

  -- ── הכנסה משכירות ──
  has_rental_income                    boolean default false,
  rental_income_annual                 numeric,
  rental_tax_track                     text,           -- 'exempt'|'flat10'|'regular'
  rental_notes                         text,

  -- ── השקעות מקומיות ──
  has_investments                      boolean default false,
  investment_broker_name               text,
  investment_notes                     text,

  -- ── חשבונות והשקעות בחו"ל ──
  has_foreign_assets                   boolean default false,
  foreign_accounts                     jsonb default '[]'::jsonb,  -- ForeignAccount[]
  is_returning_resident_veteran        boolean default false,

  -- ── הגרלות ──
  has_gambling_income                  boolean default false,
  gambling_income_annual               numeric,
  gambling_tax_withheld_at_source      boolean default false,

  -- ── הכנסות הון מקומיות ──
  has_capital_income                   boolean default false,
  capital_gains_annual                 numeric,
  dividend_interest_annual             numeric,
  is_substantial_shareholder           boolean default false,

  -- ── תרומות וביטוחים ──
  donations_annual                     numeric,
  has_life_insurance                   boolean default false,
  life_insurance_annual                numeric,
  has_medical_insurance                boolean default false,
  medical_insurance_annual             numeric,

  -- ── פנסיה וחיסכון ──
  has_pension                          boolean default false,
  pension_fund_name                    text,
  employee_pension_pct                 numeric default 0,
  employer_pension_pct                 numeric default 0,
  has_kupot_gemel                      boolean default false,
  has_kren_hashtalmut                  boolean default false,
  kren_hashtalmut_monthly              numeric default 0,

  -- ── הערות ──
  notes                                text,

  -- ── ייצוג ──
  representation_status                text default 'active',  -- pending_fill|awaiting_accountant|awaiting_authorities|active
  representation_request_id            text,

  -- ── הרחבות תיק עבודה ──
  assigned_accountant_id               text,           -- מצביע ל-employees.id
  tags                                 text[] default '{}',
  pinned_note                          text,
  additional_contacts                  jsonb default '[]'::jsonb,  -- ClientContact[]

  vat_frequency                        text,           -- 'monthly'|'bi_monthly'
  vat_detailed_report                  boolean,
  vat_detailed_report_start_date       date,

  pit_advance_percent                  numeric,
  pit_advance_frequency                text,

  withholding_frequency                text,           -- 'monthly'|'bi_monthly'|'none'
  withholding_rate                     numeric,
  withholding_valid_until              date,
  book_status                          text,           -- 'kosher'|'rejected'|'unknown'

  ni_advance_monthly                   numeric,

  shaam_status                         text,           -- 'active'|'inactive'|'pending'|'unknown'
  shaam_created_at                     date,
  shaam_last_used                      date,
  shaam_source                         text,

  tax_office_name                      text,
  withholding_office_name              text,
  ni_branch_name                       text,

  has_wealth_declaration               boolean,
  last_wealth_declaration_year         int,

  field_meta                           jsonb default '{}'::jsonb,
  activity                             jsonb default '[]'::jsonb,

  created_at                           timestamptz not null default now(),
  updated_at                           timestamptz not null default now()
);

create index clients_user_id_idx                on public.clients(user_id);
create index clients_user_repstatus_idx         on public.clients(user_id, representation_status);
create index clients_user_assigned_idx          on public.clients(user_id, assigned_accountant_id);

alter table public.clients enable row level security;

create policy "clients_select_own" on public.clients
  for select using (auth.uid() = user_id);
create policy "clients_insert_own" on public.clients
  for insert with check (auth.uid() = user_id);
create policy "clients_update_own" on public.clients
  for update using (auth.uid() = user_id);
create policy "clients_delete_own" on public.clients
  for delete using (auth.uid() = user_id);

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 3. EMPLOYEES — עובדי המשרד
-- ============================================================================

create table public.employees (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  role        text,
  initials    text,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index employees_user_id_idx on public.employees(user_id);

alter table public.employees enable row level security;

create policy "employees_select_own" on public.employees
  for select using (auth.uid() = user_id);
create policy "employees_insert_own" on public.employees
  for insert with check (auth.uid() = user_id);
create policy "employees_update_own" on public.employees
  for update using (auth.uid() = user_id);
create policy "employees_delete_own" on public.employees
  for delete using (auth.uid() = user_id);

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 4. CASES — תיקי עבודה (אופציונלי, מוכן לעתיד)
-- ============================================================================

create table public.cases (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   text not null references public.clients(id) on delete cascade,
  title       text not null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create index cases_user_id_idx   on public.cases(user_id);
create index cases_client_id_idx on public.cases(client_id);

alter table public.cases enable row level security;

create policy "cases_select_own" on public.cases
  for select using (auth.uid() = user_id);
create policy "cases_insert_own" on public.cases
  for insert with check (auth.uid() = user_id);
create policy "cases_update_own" on public.cases
  for update using (auth.uid() = user_id);
create policy "cases_delete_own" on public.cases
  for delete using (auth.uid() = user_id);


-- ============================================================================
-- 5. TASKS — משימות
-- ============================================================================

create table public.tasks (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  contact_id    text,                                      -- ClientContact.id (jsonb בלקוח)
  case_id       text references public.cases(id) on delete set null,

  category      text not null default 'not_selected',
  title         text not null,
  description   text,
  ball_with     text not null default 'me',                -- 'me'|'client'|'authority'|'stuck'
  status        text not null default 'open',              -- 'open'|'done'
  progress      text default 'new',                        -- 'new'|'in_progress'
  priority      text not null default 'normal',            -- 'normal'|'urgent'
  due_date      date,
  sort_order    int,
  assignee_id   text references public.employees(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index tasks_user_id_idx        on public.tasks(user_id);
create index tasks_client_id_idx      on public.tasks(client_id);
create index tasks_user_status_idx    on public.tasks(user_id, status);
create index tasks_user_ball_idx      on public.tasks(user_id, ball_with);

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 6. REPRESENTATION_REQUESTS — בקשות ייצוג
-- ============================================================================

create table public.representation_requests (
  id                  text primary key default gen_random_uuid()::text,
  user_id             uuid not null references auth.users(id) on delete cascade,
  linked_client_id    text references public.clients(id) on delete set null,

  client_name         text,
  client_email        text,
  authorities         text[] default '{}',                -- AuthorityKind[]
  requested_docs      jsonb default '[]'::jsonb,           -- RequestedDocItem[]
  notes               text,

  status              text not null default 'pending_fill',

  -- מילוי הלקוח
  submission          jsonb,                                -- RequestSubmission
  submitted_at        timestamptz,

  -- חתימת המייצג + PDF
  part_b              jsonb,                                -- AccountantPartB
  signed_pdf_path     text,                                 -- נתיב ב-Storage (לא IndexedDB)

  -- OCR
  ocr_extracted       jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index reps_user_id_idx     on public.representation_requests(user_id);
create index reps_user_status_idx on public.representation_requests(user_id, status);
create index reps_client_id_idx   on public.representation_requests(linked_client_id);

alter table public.representation_requests enable row level security;

create policy "reps_select_own" on public.representation_requests
  for select using (auth.uid() = user_id);
create policy "reps_insert_own" on public.representation_requests
  for insert with check (auth.uid() = user_id);
create policy "reps_update_own" on public.representation_requests
  for update using (auth.uid() = user_id);
create policy "reps_delete_own" on public.representation_requests
  for delete using (auth.uid() = user_id);

create trigger reps_updated_at
  before update on public.representation_requests
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 7. DOCUMENTS — מטא-דאטה של קבצי לקוח (הקובץ עצמו ב-Storage)
-- ============================================================================

create table public.documents (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,

  storage_path  text not null,                              -- בתוך bucket 'client-documents'
  file_name     text not null,
  file_type     text not null,                              -- MIME
  file_size     bigint not null,
  category      text not null default 'other',              -- DocCategory
  year          text default 'general',                     -- 'general' או '2024' וכו'
  description   text,
  notes         text,
  linked_to     text,                                       -- "task:abc" / "personal:idf_service" וכו'
  linked_label  text,

  uploaded_at   timestamptz not null default now()
);

create index documents_user_id_idx   on public.documents(user_id);
create index documents_client_id_idx on public.documents(client_id);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select using (auth.uid() = user_id);
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = user_id);
create policy "documents_update_own" on public.documents
  for update using (auth.uid() = user_id);
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = user_id);


-- ============================================================================
-- 8. STORAGE BUCKETS — דליי קבצים
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('client-documents',    'client-documents',    false),
  ('representation-pdfs', 'representation-pdfs', false)
on conflict (id) do nothing;

-- מבנה תיקייה: {user_id}/{client_id}/{filename}
-- כך שכל משתמש רואה רק את התיקייה שמתחילה ב-uuid שלו.

create policy "client_docs_select_own" on storage.objects for select
  using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "client_docs_insert_own" on storage.objects for insert
  with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "client_docs_update_own" on storage.objects for update
  using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "client_docs_delete_own" on storage.objects for delete
  using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "rep_pdfs_select_own" on storage.objects for select
  using (bucket_id = 'representation-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rep_pdfs_insert_own" on storage.objects for insert
  with check (bucket_id = 'representation-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rep_pdfs_update_own" on storage.objects for update
  using (bucket_id = 'representation-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rep_pdfs_delete_own" on storage.objects for delete
  using (bucket_id = 'representation-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- DONE
-- ============================================================================
