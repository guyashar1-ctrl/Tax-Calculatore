-- ─── 09: מודול הצעות מחיר — לידים, קטלוג שירותים, תבניות, הצעות ─────────────
-- הזרימה העסקית: ליד (טלפון) → הצעת מחיר → אישור → המרה ללקוח → ייצוג.
-- ליד הופך ללקוח רק אחרי אישור הצעה — לא לפני (החלטת גיא, 2026-07-15).
-- אין דחייה/בקשת שינויים מצד הלקוח: שינוי = ביטול ההצעה והוצאת הצעה חדשה.

-- ============================================================================
-- 1. LEADS — לידים (מתעניינים שעוד אינם לקוחות)
-- ============================================================================

create table public.leads (
  id                    text primary key default gen_random_uuid()::text,
  user_id               uuid not null references auth.users(id) on delete cascade,
  full_name             text not null,
  phone                 text,
  email                 text,
  business_name         text,
  dealer_type           text,          -- exempt | licensed | company | other
  notes                 text,
  status                text not null default 'new',  -- new | quoted | converted | closed
  converted_client_id   text references public.clients(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index leads_user_id_idx     on public.leads(user_id);
create index leads_user_status_idx on public.leads(user_id, status);

alter table public.leads enable row level security;

create policy "leads_select_own" on public.leads
  for select using (auth.uid() = user_id);
create policy "leads_insert_own" on public.leads
  for insert with check (auth.uid() = user_id);
create policy "leads_update_own" on public.leads
  for update using (auth.uid() = user_id);
create policy "leads_delete_own" on public.leads
  for delete using (auth.uid() = user_id);

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. SERVICE_CATALOG — קטלוג שירותים ומחירון של המשרד
-- ============================================================================

create table public.service_catalog (
  id                  text primary key default gen_random_uuid()::text,
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  category            text not null,   -- monthly | annual | one_time | included
  description         text,
  default_price       numeric not null default 0,
  vat_flag            boolean not null default true,
  billing_type        text not null default 'fixed',  -- fixed | per_unit
  unit_label          text,            -- למשל "עובד" עבור תלושי שכר
  include_by_default  boolean not null default false,
  active              boolean not null default true,
  display_order       int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index service_catalog_user_id_idx on public.service_catalog(user_id);

alter table public.service_catalog enable row level security;

create policy "service_catalog_select_own" on public.service_catalog
  for select using (auth.uid() = user_id);
create policy "service_catalog_insert_own" on public.service_catalog
  for insert with check (auth.uid() = user_id);
create policy "service_catalog_update_own" on public.service_catalog
  for update using (auth.uid() = user_id);
create policy "service_catalog_delete_own" on public.service_catalog
  for delete using (auth.uid() = user_id);

create trigger service_catalog_updated_at
  before update on public.service_catalog
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. QUOTATION_TEMPLATES — תבניות הצעה (עוסק פטור / מורשה / חברה / ...)
-- ============================================================================

create table public.quotation_templates (
  id             text primary key default gen_random_uuid()::text,
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  kind           text not null default 'custom',
  -- exempt_dealer | licensed_dealer | company | tax_refund | representation_only | custom
  service_ids    jsonb not null default '[]'::jsonb,   -- מזהי שירותים מהקטלוג
  email_subject  text,
  email_body     text,
  display_order  int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index quotation_templates_user_id_idx on public.quotation_templates(user_id);

alter table public.quotation_templates enable row level security;

create policy "quotation_templates_select_own" on public.quotation_templates
  for select using (auth.uid() = user_id);
create policy "quotation_templates_insert_own" on public.quotation_templates
  for insert with check (auth.uid() = user_id);
create policy "quotation_templates_update_own" on public.quotation_templates
  for update using (auth.uid() = user_id);
create policy "quotation_templates_delete_own" on public.quotation_templates
  for delete using (auth.uid() = user_id);

create trigger quotation_templates_updated_at
  before update on public.quotation_templates
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. QUOTATION_COUNTERS + מספור אנושי "2026-001" (מונה שנתי לכל משתמש)
-- ============================================================================

create table public.quotation_counters (
  user_id  uuid not null references auth.users(id) on delete cascade,
  year     int not null,
  counter  int not null default 0,
  primary key (user_id, year)
);

alter table public.quotation_counters enable row level security;

create policy "quotation_counters_select_own" on public.quotation_counters
  for select using (auth.uid() = user_id);
create policy "quotation_counters_insert_own" on public.quotation_counters
  for insert with check (auth.uid() = user_id);
create policy "quotation_counters_update_own" on public.quotation_counters
  for update using (auth.uid() = user_id);

create or replace function public.next_quotation_number(p_user uuid)
returns text
language plpgsql
as $$
declare
  v_year    int := extract(year from now())::int;
  v_counter int;
begin
  insert into public.quotation_counters (user_id, year, counter)
  values (p_user, v_year, 1)
  on conflict (user_id, year)
  do update set counter = public.quotation_counters.counter + 1
  returning counter into v_counter;

  return v_year::text || '-' || lpad(v_counter::text, 3, '0');
end;
$$;

-- ============================================================================
-- 5. QUOTATIONS — הצעות מחיר
-- ============================================================================

create table public.quotations (
  id                text primary key default gen_random_uuid()::text,
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- הצעה שייכת לליד (לקוח חדש) או ללקוח קיים (שירות נוסף) — אחד מהשניים
  lead_id           text references public.leads(id) on delete set null,
  client_id         text references public.clients(id) on delete set null,
  quotation_number  text not null,
  revision          int not null default 1,
  status            text not null default 'draft',
  -- draft | sent | viewed | approved | cancelled | expired
  public_token      text,
  items             jsonb not null default '[]'::jsonb,
  vat_rate          numeric not null default 18,
  email_subject     text,
  email_message     text,
  notes_for_client  text,
  internal_notes    text,
  template_id       text,
  expires_at        timestamptz,
  sent_at           timestamptz,
  first_viewed_at   timestamptz,
  approved_at       timestamptz,
  cancelled_at      timestamptz,
  -- העתק קפוא של ההצעה ברגע השליחה — היסטוריה לא משתנה גם אם המחירון ישתנה
  snapshot          jsonb,
  events            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index quotations_user_id_idx     on public.quotations(user_id);
create index quotations_user_status_idx on public.quotations(user_id, status);
create index quotations_lead_id_idx     on public.quotations(lead_id);
create index quotations_client_id_idx   on public.quotations(client_id);
create unique index quotations_public_token_idx
  on public.quotations(public_token) where public_token is not null;

alter table public.quotations enable row level security;

create policy "quotations_select_own" on public.quotations
  for select using (auth.uid() = user_id);
create policy "quotations_insert_own" on public.quotations
  for insert with check (auth.uid() = user_id);
create policy "quotations_update_own" on public.quotations
  for update using (auth.uid() = user_id);
create policy "quotations_delete_own" on public.quotations
  for delete using (auth.uid() = user_id);

create trigger quotations_updated_at
  before update on public.quotations
  for each row execute function public.set_updated_at();

-- מספור אוטומטי: אם לא נמסר quotation_number בהכנסה — נלקח מהמונה השנתי
create or replace function public.assign_quotation_number()
returns trigger
language plpgsql
as $$
begin
  if new.quotation_number is null or new.quotation_number = '' then
    new.quotation_number := public.next_quotation_number(new.user_id);
  end if;
  return new;
end;
$$;

create trigger quotations_assign_number
  before insert on public.quotations
  for each row execute function public.assign_quotation_number();
