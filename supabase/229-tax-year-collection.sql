-- ════════════════════════════════════════════════════════════════════════════
-- 229 · שנת מס ואיסוף משותף (שלב 2 בתשתית המס) — 11.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- מסמך הביצוע: docs/tax-foundation/stage2-execution-plan.md. הקוד שמקביל לכאן:
-- src/features/taxYear/* (תמונת השנה, שאלות, תשובות→עובדות, העברה מהכרטיס).
--
-- ‼ עובדה לשנה: שנה, אדם כתפקיד (client/spouse/couple), ישות (מעביד/עסק/נכס/
--   חשבון…), תקופה, מצב תשובה, בסיס, מקור, ראיה ומצב אישור. «חסר» = אין שורה;
--   ריק ≠ אפס ≠ «לא» ≠ «לא רלוונטי».
-- ‼ תשובה של לקוח היא תמיד ממתינה. «הלקוח אישר שאין שינוי» ≠ אישור מקצועי.
-- ‼ תחזית לעולם לא מחליפה בפועל; «עד החתך» אינו שנה מלאה.
-- ‼ מסמך שהתקבל אינו מידע מאושר: קבלה → חילוץ → התאמה → אישור, בעמודות נפרדות.
-- ‼ שום כתיבה לכרטיס הלקוח כאן. העברת סכומים מהכרטיס שומרת את המקור כמו שהוא.
-- ‼ בקשה אחת פתוחה לכל לקוח + תכלית + שנה — נאכף בשרת (אינדקס ייחודי + נעילה).
--
-- לא הוחל על שום סביבה. נבדק בבידוד (PGlite) — scripts/sql/229/test-229-tax-year.pglite.mjs (53 בדיקות).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. סוגי בקשה ─────────────────────────────────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter', 'rep_client_approval',
    'materials_received', 'paperless_invite', 'paperless_connection', 'paperless_tax_authority',
    'data_import', 'data_verification', 'retainer_authorization', 'internal_setup', 'kyc_identification',
    'first_month_review', 'intake_questionnaire', 'client_documents', 'prev_accountant_details',
    'custom_request', 'institution_alignment_btl', 'institution_alignment_vat',
    'institution_alignment_income', 'opening_call', 'authority_representation',
    'business_details',
    -- 229
    'tax_estimate', 'annual_return', 'info_collection',
    -- ‼ 12.10.2026: גם הסוגים של 230 ו-236 — כדי שהחלה חוזרת של 229 אחריהן לא תיכשל על שורות שכבר קיימות
    --   (האילוץ הוא רשימה מותרת בלבד; הפונקציות של הסוגים האלה נוספות ב-230 וב-236).
    'wealth_declaration', 'tax_file_intake']));

-- ‼ האינדקס של 220 מגביל כל סוג «אדם» חדש לבקשה אחת ללקוח — לתמיד. הערכת מס
-- ודוח שנתי הם אחד לכל שנה, ולכן מוחרגים כאן ונאכפים באינדקס לפי שנה (למטה).
drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type <> all (array['custom_request', 'authority_representation', 'client_documents',
      'prev_accountant_details', 'release_letter', 'materials_received', 'intake_questionnaire',
      'retainer_authorization', 'business_details',
      'tax_estimate', 'annual_return', 'info_collection', 'wealth_declaration', 'tax_file_intake']);

-- יחידת עבודה אחת = מחזור אחד: פתוחה אחת לכל לקוח + תכלית + שנה.
create unique index if not exists onboarding_steps_tax_year_open_idx
  on public.onboarding_steps (client_id, step_type, (payload->>'taxYear'))
  where step_type in ('tax_estimate', 'annual_return')
    and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
-- «השלמת מידע» פתוחה אחת לכל בקשה ראשית.
create unique index if not exists onboarding_steps_info_collection_open_idx
  on public.onboarding_steps (client_id, (payload->>'parentStepId'))
  where step_type = 'info_collection'
    and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);

-- ── 2. קטלוג הפריטים (allowlist) — זהה ל-src/features/taxYear/catalog.ts ───────
-- ‼ בדיקה (taxYearSql.test.ts) משווה את המפה כאן לקטלוג בקוד. מפתח = זהות.
create or replace function public._tax_year_items()
returns jsonb language sql immutable as $$
  select '{
    "household.maritalAtYearEnd":"confirm","household.children":"confirm","household.childDeferral":"detail","household.settlement":"confirm",
    "household.degree":"confirm","household.release":"confirm","household.creditChanges":"screener","household.degreeDocs":"document",
    "household.creditEmployer":"detail","household.alimonyPaid":"amount","salary.worked":"screener","salary.employers":"confirm",
    "salary.spouseIncomeEstimate":"amount","salary.form106":"document","salary.employerDetails":"detail","salary.payslipToDate":"document",
    "salary.amounts":"amount","business.active":"confirm","business.books":"document","business.profit":"amount",
    "business.selfDeposits":"amount","business.assetsChanged":"screener","business.assetDocs":"document","business.depreciation":"document",
    "business.inventory":"screener","business.inventoryCount":"document","business.employees":"screener","business.payrollReport":"document",
    "business.badDebts":"screener","business.badDebtDocs":"document","business.vehicle":"screener","business.vehicleDetails":"detail",
    "business.vehicleLicense":"document","business.vehicleExpenses":"amount","business.partnership":"screener","business.partnershipDocs":"document",
    "business.partners":"detail","business.rentsPremises":"screener","business.premisesLease":"document","business.priorDepreciation":"document",
    "business.microRegistration":"document","business.microTrack":"amount","business.microExclusions":"screener","business.microCoordination":"document",
    "business.forecast":"amount","business.oneOffs":"amount","niBenefits.received":"screener","niBenefits.cert":"document",
    "rent.properties":"confirm","rent.income":"amount","rent.incomeTotal":"amount","rent.expenses":"amount",
    "rent.contract":"document","rent.track":"detail","rent.singleApartment":"screener","rent.businessUse":"screener",
    "rent.businessUseDocs":"document","rent.businessUseAmounts":"amount","rent.coOwned":"screener","rent.coOwners":"detail",
    "rent.keyMoney":"screener","rent.keyMoneyDocs":"document","rent.ownRent":"screener","rent.ownRentDocs":"document",
    "rent.otherProperty":"screener","rent.otherPropertyDocs":"document","capital.accounts":"confirm","capital.form867":"document",
    "capital.amounts":"amount","capital.owner":"detail","capital.relatedParty":"screener","capital.totals":"amount",
    "capital.estimate":"amount","sales.sold":"screener","sales.transaction":"detail","sales.circumstances":"screener",
    "sales.buyer":"detail","sales.expenseDocs":"document","sales.specialDeal":"screener","sales.specialDocs":"document",
    "sales.officeChecks":"detail","sales.docs":"document","foreign.income":"screener","foreign.totals":"amount",
    "foreign.sourceDetails":"detail","foreign.statements":"document","foreign.securitiesSold":"screener","foreign.tradeReport":"document",
    "foreign.taxCert":"document","foreign.amounts":"amount","foreign.work":"screener","foreign.workDocs":"document",
    "foreign.rentalProperty":"screener","foreign.leaseDocs":"document","foreign.company":"screener","foreign.companyDocs":"document",
    "foreign.owner":"detail","foreign.taxRefund":"screener","savings.selfDeposits":"screener","savings.selfAmounts":"amount",
    "savings.fundDetails":"detail","savings.fundCerts":"document","savings.depositsEstimate":"amount","savings.insuranceAmounts":"amount",
    "savings.insuranceCert":"document","savings.insurance":"screener","donations.given":"screener","donations.amount":"amount",
    "donations.receipts":"document","companies.controlled":"screener","payments.advances":"amount","payments.withholding":"amount",
    "payments.niPaid":"amount","carryForward.balances":"amount","special.otherIncome":"amount","special.gambling":"amount",
    "special.reserveCombatDays":"amount","special.trust":"screener","special.kibbutz":"screener","special.reportablePosition":"screener",
    "special.partnership":"screener","special.nonResident":"screener","special.moneyAbroad":"screener","special.financialInstitution":"screener",
    "filing.refundAccount":"detail","filing.declarations":"detail","filing.identity":"detail","household.changesSince":"screener",
    "salary.changesSince":"screener","business.changesSince":"screener","niBenefits.changesSince":"screener","rent.changesSince":"screener",
    "capital.changesSince":"screener","sales.changesSince":"screener","foreign.changesSince":"screener","savings.changesSince":"screener",
    "donations.changesSince":"screener"}'::jsonb
$$;

-- מתי מסמך לשנה Y זמין בדרך כלל — זהה ל-documents.ts. ברירת מחדל של המשרד, לא מועד בחוק.
create or replace function public._tax_doc_follow_up(p_doc text, p_year int, p_today date)
returns date language plpgsql immutable as $$
declare v_usual date;
begin
  v_usual := case p_doc
    when 'form106' then make_date(p_year + 1, 3, 1)
    when 'form867' then make_date(p_year + 1, 3, 1)
    when 'fundAnnualCert' then make_date(p_year + 1, 3, 1)
    when 'foreignStatement' then make_date(p_year + 1, 3, 1)
    when 'niAnnualCert' then make_date(p_year + 1, 2, 1)
    when 'annualPnl' then make_date(p_year + 1, 2, 1)
    when 'depreciationReport' then make_date(p_year + 1, 2, 1)
    -- 12.10.2026 · ני״ע בחו״ל
    when 'foreignTradeReport' then make_date(p_year + 1, 1, 15)
    when 'foreignTaxCert' then make_date(p_year + 1, 3, 15)
    else null end;
  if v_usual is not null and v_usual > p_today then return v_usual; end if;
  return p_today + 30;
end $$;

-- ── 3. טבלאות ────────────────────────────────────────────────────────────────
create table if not exists public.tax_evidence (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  client_id     text not null references public.clients(id) on delete cascade,
  tax_year      int,
  doc_kind      text not null,
  subject_role  text not null check (subject_role in ('client','spouse','couple')),
  entity_kind   text,
  entity_ref    text,
  period_from   date, period_to date,
  document_id   text,
  file_name     text,
  received_at   timestamptz not null default now(),
  received_via  text not null check (received_via in ('portal','office','automation')),
  ask_id        uuid,
  extraction    text not null default 'not_supported' check (extraction in ('not_supported','pending','extracted','office_entered')),
  identity_match text not null default 'unchecked' check (identity_match in ('match','mismatch','unchecked')),
  period_match  text not null default 'unchecked' check (period_match in ('match','mismatch','unchecked')),
  review        text not null default 'needs_review' check (review in ('needs_review','accepted','rejected')),
  reviewed_by   uuid, reviewed_at timestamptz, note text
);
create index if not exists tax_evidence_client_year_idx on public.tax_evidence (client_id, tax_year);

create table if not exists public.tax_year_facts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  client_id     text not null references public.clients(id) on delete cascade,
  tax_year      int not null check (tax_year between 2000 and 2100),
  item_key      text not null,
  subject_role  text not null check (subject_role in ('client','spouse','couple')),
  entity_kind   text check (entity_kind in ('employer','business','property','account','foreign_source','fund','child','transaction','company','asset')),
  entity_ref    text,
  period_kind   text not null check (period_kind in ('year','months','as_of','transaction','carry_forward')),
  period_from   date, period_to date,
  answer        text not null check (answer in ('value','zero','no','not_applicable')),
  value         jsonb,
  basis         text not null check (basis in ('actual','actual_to_date','forecast','final','declared','derived')),
  forecast_by   text check (forecast_by in ('client','office')),
  assumption    text,
  is_one_off    boolean not null default false,
  source        text not null check (source in ('portal','office','document','import','automation','card_migration','legacy_questionnaire')),
  source_ref    text,
  client_assertion text check (client_assertion in ('unchanged','changed')),
  confirms_fact_id uuid,
  request_id    text,
  ask_id        uuid,
  evidence_id   uuid references public.tax_evidence(id),
  status        text not null default 'pending' check (status in ('pending','accepted','rejected','superseded')),
  decided_by    uuid, decided_at timestamptz,
  supersedes    uuid references public.tax_year_facts(id),
  note          text,
  created_at    timestamptz not null default now(),
  -- ריק נשמר רק כתשובה שאינה ערך
  constraint tax_year_facts_value_ck check ((answer = 'value') = (value is not null) or answer = 'zero'),
  constraint tax_year_facts_period_ck check (period_from is null or period_to is null or period_from <= period_to)
);
create index if not exists tax_year_facts_client_year_idx on public.tax_year_facts (client_id, tax_year);
-- שאלון ישן / העברה: קליטה חוזרת לא יוצרת כפילות.
create unique index if not exists tax_year_facts_source_ref_uidx on public.tax_year_facts (client_id, source, source_ref)
  where source_ref is not null;

create table if not exists public.tax_info_asks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  client_id     text not null references public.clients(id) on delete cascade,
  tax_year      int not null,
  step_id       text not null references public.onboarding_steps(id) on delete cascade,
  parent_step_id text not null references public.onboarding_steps(id) on delete cascade,
  item_key      text not null,
  item_kind     text not null,
  subject_role  text not null check (subject_role in ('client','spouse','couple')),
  entity_kind   text, entity_ref text,
  prompt        jsonb not null,
  state         text not null default 'draft' check (state in ('draft','published','answered','unavailable','cancelled')),
  saved_draft   jsonb,
  unavailable   jsonb,
  office_note   text,
  -- «לא בטוח» של הלקוח — המשרד סגר (שאל שוב / השלים בעצמו). ההערה נשמרת.
  note_resolved_at timestamptz,
  answered_at   timestamptz,
  created_at    timestamptz not null default now()
);
-- לא שואלים פעמיים: פריט פתוח אחד לזהות (לקוח + שנה + פריט + אדם + ישות).
create unique index if not exists tax_info_asks_open_uidx on public.tax_info_asks
  (client_id, tax_year, item_key, subject_role, coalesce(entity_ref, ''))
  where state in ('draft','published','unavailable');

create table if not exists public.tax_card_transfers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  client_id     text not null references public.clients(id) on delete cascade,
  path          text not null,
  entity_ref    text not null default '',
  original      jsonb not null,           -- הערך בכרטיס ברגע ההחלטה — נשמר כמו שהוא
  suggested_year int,
  evidence      text,
  decision      text not null check (decision in ('year','unknown_year','skip')),
  assigned_year int,
  fact_id       uuid references public.tax_year_facts(id),
  decided_by    uuid not null, decided_at timestamptz not null default now(),
  unique (client_id, path, entity_ref)
);

alter table public.tax_year_facts enable row level security;
alter table public.tax_evidence enable row level security;
alter table public.tax_info_asks enable row level security;
alter table public.tax_card_transfers enable row level security;
drop policy if exists tax_year_facts_owner_read on public.tax_year_facts;
create policy tax_year_facts_owner_read on public.tax_year_facts for select to authenticated using (user_id = auth.uid() and public.is_authorized());
drop policy if exists tax_evidence_owner_read on public.tax_evidence;
create policy tax_evidence_owner_read on public.tax_evidence for select to authenticated using (user_id = auth.uid() and public.is_authorized());
drop policy if exists tax_info_asks_owner_read on public.tax_info_asks;
create policy tax_info_asks_owner_read on public.tax_info_asks for select to authenticated using (user_id = auth.uid() and public.is_authorized());
drop policy if exists tax_card_transfers_owner_read on public.tax_card_transfers;
create policy tax_card_transfers_owner_read on public.tax_card_transfers for select to authenticated using (user_id = auth.uid() and public.is_authorized());
-- ‼ אין מדיניות כתיבה: כל כתיבה דרך הפונקציות למטה (allowlist, בעלות, מצבים).

-- ── 4. עזר ───────────────────────────────────────────────────────────────────
create or replace function public._tax_year_client(p_client_id text)
returns public.clients language plpgsql stable security definer set search_path to 'public' as $$
declare c public.clients%rowtype;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null or c.user_id <> auth.uid() or not public.is_authorized() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return c;
end $$;

-- התקופה והבסיס של תשובה — זהה ל-periodFor ב-asks.ts.
create or replace function public._tax_answer_period(p_purpose text, p_cutoff int, p_year int, p_item text, p_kind text)
returns jsonb language plpgsql immutable as $$
declare m int := coalesce(p_cutoff, 12);
begin
  if p_item like '%.changesSince' then
    return jsonb_build_object('periodKind','year','from',make_date(p_year,1,1),'to',make_date(p_year,12,31),'basis','actual');
  end if;
  if p_purpose = 'estimate' then
    if p_item in ('business.forecast','capital.estimate') then
      return jsonb_build_object('periodKind','year','from',make_date(p_year,1,1),'to',make_date(p_year,12,31),'basis','forecast');
    end if;
    return jsonb_build_object('periodKind','months','from',make_date(p_year,1,1),
      'to',(make_date(p_year, m, 1) + interval '1 month - 1 day')::date,
      'basis', case when m = 12 then 'actual' else 'actual_to_date' end);
  end if;
  return jsonb_build_object('periodKind','year','from',make_date(p_year,1,1),'to',make_date(p_year,12,31),
    'basis', case when p_kind = 'amount' then 'declared' else 'actual' end);
end $$;

-- ── 5. בקשה ראשית לשנה (אידמפוטנטית) ──────────────────────────────────────────
create or replace function public.ensure_tax_year_request(p_client_id text, p_purpose text, p_tax_year int, p_cutoff_month int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c        public.clients%rowtype;
  v_type   text;
  v_id     text;
  v_legacy text;
  v_legacy_step text;
  v_payload jsonb;
begin
  c := public._tax_year_client(p_client_id);
  if p_purpose not in ('estimate','annual') then return jsonb_build_object('ok', false, 'error', 'bad_purpose'); end if;
  if p_tax_year is null or p_tax_year < 2000 or p_tax_year > 2100 then return jsonb_build_object('ok', false, 'error', 'bad_year'); end if;
  if p_purpose = 'estimate' and (p_cutoff_month is null or p_cutoff_month < 1 or p_cutoff_month > 12) then
    return jsonb_build_object('ok', false, 'error', 'bad_cutoff');
  end if;
  v_type := case p_purpose when 'estimate' then 'tax_estimate' else 'annual_return' end;
  -- שתי לשוניות / לחיצה כפולה: נעילה לזהות, ואחריה בדיקה
  perform pg_advisory_xact_lock(hashtext('tax_year_request:' || p_client_id || ':' || v_type || ':' || p_tax_year));
  select id into v_id from public.onboarding_steps
   where client_id = p_client_id and step_type = v_type and payload->>'taxYear' = p_tax_year::text
     and status <> all (array['completed','verified','skipped','cancelled','failed'])
   limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'stepId', v_id, 'created', false); end if;

  -- ‼ השאלון הישן לאותה שנה: לא פותחים מסלול שני — מקשרים (החלטת גיא 11.10.2026)
  if p_purpose = 'annual' then
    select id::text into v_legacy from public.annual_report_sessions
     where client_id = p_client_id and tax_year = p_tax_year and superseded_by is null
     order by created_at desc limit 1;
    select id into v_legacy_step from public.onboarding_steps
     where client_id = p_client_id and step_type = 'intake_questionnaire'
       and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
  end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'taxYear', p_tax_year, 'purpose', p_purpose, 'cutoffMonth', p_cutoff_month,
    'title', case p_purpose when 'estimate' then 'הערכת מס ' || p_tax_year else 'דוח שנתי ' || p_tax_year end,
    'legacySessionId', v_legacy, 'legacyStepId', v_legacy_step));
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (c.user_id, p_client_id, v_type, 'internal', 'person', 'in_progress', 'me', v_payload, now())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.onboarding_steps
     where client_id = p_client_id and step_type = v_type and payload->>'taxYear' = p_tax_year::text
       and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
    return jsonb_build_object('ok', true, 'stepId', v_id, 'created', false);
  end if;
  return jsonb_build_object('ok', true, 'stepId', v_id, 'created', true, 'legacySessionId', v_legacy);
end $$;

-- ── 6. «השלמת מידע»: הוספה, ביטול, פרסום ────────────────────────────────────
create or replace function public.add_tax_info_asks(p_parent_step_id text, p_asks jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  par      public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  v_info   text;
  v_year   int;
  v_items  jsonb := public._tax_year_items();
  a        jsonb;
  v_added  int := 0;
  v_skip   int := 0;
  v_n      int;
begin
  select * into par from public.onboarding_steps where id = p_parent_step_id for update;
  if par.id is null or par.step_type not in ('tax_estimate','annual_return') then return jsonb_build_object('ok', false, 'error', 'bad_parent'); end if;
  c := public._tax_year_client(par.client_id);
  if par.status in ('completed','verified','skipped','cancelled','failed') then return jsonb_build_object('ok', false, 'error', 'parent_closed'); end if;
  v_year := (par.payload->>'taxYear')::int;

  select id into v_info from public.onboarding_steps
   where client_id = par.client_id and step_type = 'info_collection' and payload->>'parentStepId' = par.id
     and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
  if v_info is null then
    -- ‼ published_at במפורש null: ברירת המחדל של העמודה היא now(), ואז טיוטה נספרה ב«שלח בקשות»
    --   לפני שהלקוח רואה בה שאלה (נמצא ב-staging, 11.10.2026). הפרסום — רק ב-publish_tax_info.
    insert into public.onboarding_steps (user_id, client_id, engagement_id, step_type, track, scope, status, ball, published_at, payload)
    values (c.user_id, par.client_id, par.engagement_id, 'info_collection', 'tools', 'person', 'pending', 'client', null,
      jsonb_build_object('parentStepId', par.id, 'taxYear', v_year, 'purpose', par.payload->>'purpose',
        'cutoffMonth', par.payload->'cutoffMonth', 'title', 'השלמת מידע לשנת ' || v_year))
    returning id into v_info;
  end if;

  for a in select value from jsonb_array_elements(coalesce(p_asks, '[]'::jsonb)) loop
    if not (v_items ? (a->>'itemKey')) then return jsonb_build_object('ok', false, 'error', 'unknown_item', 'itemKey', a->>'itemKey'); end if;
    if coalesce(a->>'subjectRole','') not in ('client','spouse','couple') then return jsonb_build_object('ok', false, 'error', 'bad_subject'); end if;
    if nullif(a->'prompt'->>'title','') is null or coalesce(a->'prompt'->'input'->>'kind','') not in ('yesno','amount','date','text','choice','confirm','file','who') then
      return jsonb_build_object('ok', false, 'error', 'bad_prompt', 'itemKey', a->>'itemKey');
    end if;
    insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt)
    values (c.user_id, par.client_id, v_year, v_info, par.id, a->>'itemKey', v_items->>(a->>'itemKey'), a->>'subjectRole',
            nullif(a->>'entityKind',''), nullif(a->>'entityRef',''), a->'prompt')
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then v_added := v_added + 1; else v_skip := v_skip + 1; end if;
  end loop;
  update public.onboarding_steps set updated_at = now() where id = v_info;
  return jsonb_build_object('ok', true, 'infoStepId', v_info, 'added', v_added, 'skipped', v_skip);
end $$;

create or replace function public.resolve_tax_info_note(p_ask_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a public.tax_info_asks%rowtype;
begin
  select * into a from public.tax_info_asks where id = p_ask_id for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._tax_year_client(a.client_id);
  update public.tax_info_asks set note_resolved_at = now() where id = p_ask_id and office_note is not null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_tax_info_ask(p_ask_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a public.tax_info_asks%rowtype;
begin
  select * into a from public.tax_info_asks where id = p_ask_id for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._tax_year_client(a.client_id);
  if a.state not in ('draft','published','unavailable') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  update public.tax_info_asks set state = 'cancelled' where id = p_ask_id;
  return jsonb_build_object('ok', true);
end $$;

-- פרסום בדף האישי. ‼ אין כאן מייל: השליחה רק דרך «שלח בקשות» הקיים.
create or replace function public.publish_tax_info(p_info_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.onboarding_steps%rowtype; v_n int;
begin
  select * into s from public.onboarding_steps where id = p_info_step_id for update;
  if s.id is null or s.step_type <> 'info_collection' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._tax_year_client(s.client_id);
  update public.tax_info_asks set state = 'published' where step_id = s.id and state = 'draft';
  get diagnostics v_n = row_count;
  if v_n = 0 and not exists (select 1 from public.tax_info_asks where step_id = s.id and state = 'published') then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_publish');
  end if;
  -- ‼ שאלות חדשות בבקשה שכבר פורסמה = עדכון ללקוח: גרסת התוכן עולה כדי ש«שלח בקשות» יציע אותו.
  --   (פרסום ראשון — הטריגר של 214 מעלה בעצמו.)
  update public.onboarding_steps set status = 'waiting_client', ball = 'client', published_at = coalesce(published_at, now()),
         client_content_version = case when published_at is not null and v_n > 0 then client_content_version + 1 else client_content_version end,
         updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'published', v_n);
end $$;

-- ── 7. הדף האישי: קריאה, טיוטה, שליחה ────────────────────────────────────────
create or replace function public._portal_client(p_token text)
returns public.clients language plpgsql stable security definer set search_path to 'public' as $$
declare c public.clients%rowtype;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null or (c.portal_token_expires_at is not null and c.portal_token_expires_at < now()) then return null; end if;
  return c;
end $$;

create or replace function public._tax_info_view(p_client_id text, p_step_id text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('ok', true, 'stepId', s.id, 'taxYear', (s.payload->>'taxYear')::int, 'title', s.payload->>'title',
    'asks', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', a.id, 'itemKey', a.item_key, 'subjectRole', a.subject_role, 'entityRef', a.entity_ref, 'prompt', a.prompt,
        'state', a.state, 'savedDraft', a.saved_draft, 'unavailable', a.unavailable, 'answeredAt', a.answered_at))
        order by a.created_at, a.id)
      from public.tax_info_asks a where a.step_id = s.id and a.state in ('published','answered','unavailable')), '[]'::jsonb))
  from public.onboarding_steps s
  where s.id = p_step_id and s.client_id = p_client_id and s.step_type = 'info_collection'
$$;

create or replace function public.portal_tax_info(p_token text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c public.clients%rowtype; v jsonb;
begin
  c := public._portal_client(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  v := public._tax_info_view(c.id, p_step_id);
  return coalesce(v, jsonb_build_object('ok', false, 'error', 'not_found'));
end $$;

-- «מה הלקוח רואה» מהמשרד — אותה תצוגה, בלי טוקן.
create or replace function public.portal_tax_info_preview(p_client_id text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public._tax_year_client(p_client_id);
  return coalesce(public._tax_info_view(p_client_id, p_step_id), jsonb_build_object('ok', false, 'error', 'not_found'));
end $$;

-- שמירה ויציאה: טיוטה בצד השרת, לא בדפדפן.
create or replace function public.portal_save_tax_info_draft(p_token text, p_ask_id uuid, p_draft jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.clients%rowtype; v_n int;
begin
  c := public._portal_client(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update public.tax_info_asks set saved_draft = p_draft where id = p_ask_id and client_id = c.id and state in ('published','unavailable');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end $$;

create or replace function public.portal_submit_tax_info(p_token text, p_ask_id uuid, p_answer jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c      public.clients%rowtype;
  a      public.tax_info_asks%rowtype;
  s      public.onboarding_steps%rowtype;
  v_kind text := p_answer->>'kind';
  v_per  jsonb;
  v_amt  numeric;
  v_txt  text;
  v_doc  text;
  v_ev   uuid;
  v_ins  jsonb;
begin
  c := public._portal_client(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into a from public.tax_info_asks where id = p_ask_id and client_id = c.id for update;
  if a.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- אידמפוטנטי: שליחה כפולה של אותה תשובה לא כותבת שוב
  if a.state = 'answered' then return jsonb_build_object('ok', true, 'already', true); end if;
  if a.state not in ('published','unavailable') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  select * into s from public.onboarding_steps where id = a.step_id;
  select payload into v_ins from public.onboarding_steps where id = a.parent_step_id;
  v_per := public._tax_answer_period(v_ins->>'purpose', (v_ins->>'cutoffMonth')::int, a.tax_year, a.item_key, a.item_kind);
  v_doc := a.prompt->'input'->>'docKind';

  if v_kind = 'unavailable' then
    if v_doc is null then return jsonb_build_object('ok', false, 'error', 'not_document'); end if;
    update public.tax_info_asks set state = 'unavailable', saved_draft = null, unavailable = jsonb_build_object(
      'reason', coalesce(nullif(btrim(p_answer->>'reason'), ''), 'עוד לא התקבל'),
      'followUpOn', public._tax_doc_follow_up(v_doc, a.tax_year, current_date),
      'recordedAt', now()) where id = a.id;
    -- ‼ 12.10.2026: גם כשהפריט האחרון שנשאר נענה «אין לי עדיין» — הכדור חוזר למשרד (עד עכשיו נשאר «ממתין ללקוח»
    --   כשלא נשאר ללקוח מה לעשות). מסמך «אין עדיין» אינו חוסם בדיקה.
    if not exists (select 1 from public.tax_info_asks where step_id = a.step_id and state = 'published') then
      update public.onboarding_steps set status = 'in_progress', ball = 'me', updated_at = now() where id = a.step_id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'unavailable');
  elsif v_kind = 'file' then
    if v_doc is null then return jsonb_build_object('ok', false, 'error', 'not_document'); end if;
    insert into public.tax_evidence (user_id, client_id, tax_year, doc_kind, subject_role, entity_kind, entity_ref, document_id, file_name, received_via, ask_id)
    values (a.user_id, c.id, a.tax_year, v_doc, a.subject_role, a.entity_kind, a.entity_ref, nullif(p_answer->>'documentId',''), p_answer->>'fileName', 'portal', a.id)
    returning id into v_ev;
  elsif v_kind = 'notSure' then
    update public.tax_info_asks set office_note = coalesce(nullif(btrim(p_answer->>'note'),''), 'הלקוח לא בטוח') where id = a.id;
  elsif v_kind = 'who' then
    -- «מי מכם?» — עובדה לכל אחד מבני הזוג (כן / לא), לא עובדה של הזוג
    if coalesce(p_answer->>'value','') not in ('none','client','spouse','both') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
    insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref,
      period_kind, period_from, period_to, answer, value, basis, source, request_id, ask_id, status)
    select a.user_id, c.id, a.tax_year, a.item_key, r.role, a.entity_kind, a.entity_ref,
      v_per->>'periodKind', (v_per->>'from')::date, (v_per->>'to')::date,
      case when r.yes then 'value' else 'no' end, case when r.yes then 'true'::jsonb end,
      v_per->>'basis', 'portal', a.parent_step_id, a.id, 'pending'
    from (values ('client', p_answer->>'value' in ('client','both')), ('spouse', p_answer->>'value' in ('spouse','both'))) as r(role, yes);
  else
    if v_kind = 'amount' then
      v_amt := (p_answer->>'amount')::numeric;
      if v_amt is null or v_amt < 0 then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;
    elsif v_kind in ('text','changed') then
      v_txt := btrim(coalesce(p_answer->>'text', p_answer->>'note', ''));
      if v_txt = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
    elsif v_kind not in ('yes','no','choice','unchanged') then
      return jsonb_build_object('ok', false, 'error', 'bad_kind');
    end if;
    insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref,
      period_kind, period_from, period_to, answer, value, basis, source, client_assertion, request_id, ask_id, status)
    values (a.user_id, c.id, a.tax_year, a.item_key, a.subject_role, a.entity_kind, a.entity_ref,
      v_per->>'periodKind', (v_per->>'from')::date, (v_per->>'to')::date,
      case v_kind when 'no' then 'no' when 'amount' then case when v_amt = 0 then 'zero' else 'value' end else 'value' end,
      case v_kind
        when 'no' then null
        when 'yes' then case when nullif(btrim(p_answer->>'note'),'') is null then 'true'::jsonb else jsonb_build_object('yes', true, 'note', btrim(p_answer->>'note')) end
        when 'amount' then to_jsonb(v_amt)
        when 'text' then to_jsonb(v_txt)
        when 'choice' then to_jsonb(p_answer->>'value')
        when 'unchanged' then jsonb_build_object('unchanged', true, 'lines', coalesce(a.prompt->'input'->'lines', '[]'::jsonb))
        when 'changed' then jsonb_build_object('changed', true, 'note', v_txt, 'was', coalesce(a.prompt->'input'->'lines', '[]'::jsonb))
      end,
      v_per->>'basis', 'portal',
      case v_kind when 'unchanged' then 'unchanged' when 'changed' then 'changed' end,
      a.parent_step_id, a.id, 'pending');
  end if;

  update public.tax_info_asks set state = 'answered', answered_at = now(), saved_draft = null where id = a.id;
  -- כשאין עוד שאלות פתוחות — הכדור חוזר למשרד (לבדיקה). מסמך «אין עדיין» אינו חוסם.
  if not exists (select 1 from public.tax_info_asks where step_id = a.step_id and state = 'published') then
    update public.onboarding_steps set status = 'in_progress', ball = 'me', updated_at = now() where id = a.step_id;
  end if;
  return jsonb_build_object('ok', true, 'state', 'answered', 'evidenceId', v_ev);
end $$;

-- ── 8. המשרד: אישור, תיקון, הזנה, ראיות ──────────────────────────────────────
-- ‼ אישור מרוכז מותר — הרשימה היא מזהים מפורשים שהמשרד ראה, לא «כל הממתינים».
create or replace function public.decide_tax_year_facts(p_fact_ids uuid[], p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare f public.tax_year_facts%rowtype; v_n int := 0;
begin
  if p_decision not in ('accept','reject') then return jsonb_build_object('ok', false, 'error', 'bad_decision'); end if;
  for f in select * from public.tax_year_facts where id = any(p_fact_ids) and status = 'pending' for update loop
    perform public._tax_year_client(f.client_id);
    if p_decision = 'accept' then
      -- עובדה מאושרת קודמת לאותה זהות, בסיס ותקופה — מוחלפת (נשארת כהיסטוריה)
      update public.tax_year_facts set status = 'superseded'
       where client_id = f.client_id and tax_year = f.tax_year and item_key = f.item_key and subject_role = f.subject_role
         and coalesce(entity_ref,'') = coalesce(f.entity_ref,'') and basis = f.basis
         and coalesce(period_to, '9999-12-31') = coalesce(f.period_to, '9999-12-31') and status = 'accepted';
      update public.tax_year_facts set status = 'accepted', decided_by = auth.uid(), decided_at = now(), note = coalesce(p_note, note) where id = f.id;
    else
      update public.tax_year_facts set status = 'rejected', decided_by = auth.uid(), decided_at = now(), note = coalesce(p_note, note) where id = f.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'decided', v_n);
end $$;

-- תיקון של המשרד: שורה חדשה (מקור: משרד) שמחליפה את התשובה; המקורית נשמרת.
create or replace function public.correct_tax_year_fact(p_fact_id uuid, p_answer text, p_value jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare f public.tax_year_facts%rowtype; v_id uuid;
begin
  select * into f from public.tax_year_facts where id = p_fact_id for update;
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._tax_year_client(f.client_id);
  if f.status not in ('pending','accepted') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_answer not in ('value','zero','no','not_applicable') or ((p_answer = 'value') <> (p_value is not null)) then
    return jsonb_build_object('ok', false, 'error', 'bad_value');
  end if;
  update public.tax_year_facts set status = 'superseded', decided_by = auth.uid(), decided_at = now() where id = f.id;
  insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to,
    answer, value, basis, source, request_id, evidence_id, status, decided_by, decided_at, supersedes, note)
  values (f.user_id, f.client_id, f.tax_year, f.item_key, f.subject_role, f.entity_kind, f.entity_ref, f.period_kind, f.period_from, f.period_to,
    p_answer, case when p_answer = 'zero' then to_jsonb(0) else p_value end, f.basis, 'office', f.request_id, f.evidence_id, 'accepted', auth.uid(), now(), f.id, p_note)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'factId', v_id);
end $$;

-- הזנה של המשרד (למשל סכומים מ-106), מאושרת, עם ראיה כשיש.
create or replace function public.record_tax_year_fact(p_client_id text, p_fact jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.clients%rowtype; v_id uuid; v_answer text := coalesce(p_fact->>'answer','value');
begin
  c := public._tax_year_client(p_client_id);
  if not (public._tax_year_items() ? (p_fact->>'itemKey')) then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
  if v_answer = 'value' and (p_fact->'value') is null then return jsonb_build_object('ok', false, 'error', 'bad_value'); end if;
  insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to,
    answer, value, basis, source, request_id, evidence_id, status, decided_by, decided_at, note)
  values (c.user_id, c.id, (p_fact->>'taxYear')::int, p_fact->>'itemKey', p_fact->>'subjectRole', nullif(p_fact->>'entityKind',''), nullif(p_fact->>'entityRef',''),
    coalesce(p_fact->>'periodKind','year'), (p_fact->>'periodFrom')::date, (p_fact->>'periodTo')::date,
    v_answer, case when v_answer = 'value' then p_fact->'value' when v_answer = 'zero' then to_jsonb(0) end,
    coalesce(p_fact->>'basis','actual'), case when nullif(p_fact->>'evidenceId','') is not null then 'document' else 'office' end,
    nullif(p_fact->>'requestId',''), nullif(p_fact->>'evidenceId','')::uuid, 'accepted', auth.uid(), now(), p_fact->>'note')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'factId', v_id);
end $$;

create or replace function public.review_tax_evidence(p_evidence_id uuid, p_identity text, p_period text, p_review text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare e public.tax_evidence%rowtype;
begin
  select * into e from public.tax_evidence where id = p_evidence_id for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._tax_year_client(e.client_id);
  -- ‼ אי אפשר לאשר מסמך שלא תואם ללקוח או לתקופה
  if p_review = 'accepted' and (p_identity <> 'match' or p_period <> 'match') then
    return jsonb_build_object('ok', false, 'error', 'mismatch_cannot_accept');
  end if;
  update public.tax_evidence set identity_match = p_identity, period_match = p_period, review = p_review,
    reviewed_by = auth.uid(), reviewed_at = now(), note = coalesce(p_note, note) where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

-- ── 9. העברה מהכרטיס ושאלון ישן ──────────────────────────────────────────────
-- ‼ החלטת גיא 11.10.2026: שנה רק עם ראיה שמוצגת; בלי ראיה — «שנה לא ידועה», בלי
-- עובדה ובלי שימוש בחישוב. הערך המקורי נשמר כאן; הכרטיס לא משתנה.
-- ‼ ההחלטה כאן היא האישור המרוכז של המשרד (לקבוצה עם אותו בסיס, עם חריגים) — ולכן
-- העובדה נרשמת מאושרת, עם מי ומתי, בבסיס «דווח» (לא «סופי»): לדוח השנתי עדיין נדרש מסמך.
create or replace function public.decide_card_transfers(p_client_id text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.clients%rowtype; x jsonb; v_fact uuid; v_n int := 0; v_year int;
begin
  c := public._tax_year_client(p_client_id);
  for x in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if x->>'decision' not in ('year','unknown_year','skip') then return jsonb_build_object('ok', false, 'error', 'bad_decision'); end if;
    if exists (select 1 from public.tax_card_transfers where client_id = c.id and path = x->>'path' and entity_ref = coalesce(x->>'entityRef','')) then
      continue; -- הוכרע כבר: אידמפוטנטי, לא דורסים
    end if;
    v_fact := null;
    v_year := nullif(x->>'year','')::int;
    if x->>'decision' = 'year' then
      if v_year is null then return jsonb_build_object('ok', false, 'error', 'year_required'); end if;
      if not (public._tax_year_items() ? (x->>'itemKey')) then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
      insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to,
        answer, value, basis, source, source_ref, status, note, decided_by, decided_at)
      values (c.user_id, c.id, v_year, x->>'itemKey', x->>'subjectRole', nullif(x->>'entityKind',''), nullif(x->>'entityRef',''), 'year',
        make_date(v_year,1,1), make_date(v_year,12,31), 'value', jsonb_build_object(replace(x->>'path','[].','.'), x->'original'),
        'declared', 'card_migration', 'card:' || (x->>'path') || ':' || coalesce(x->>'entityRef',''), 'accepted',
        case when nullif(x->>'evidence','') is not null then 'שנה לפי ראיה: ' || (x->>'evidence') else 'שנה נקבעה במשרד' end, auth.uid(), now())
      returning id into v_fact;
    end if;
    insert into public.tax_card_transfers (user_id, client_id, path, entity_ref, original, suggested_year, evidence, decision, assigned_year, fact_id, decided_by)
    values (c.user_id, c.id, x->>'path', coalesce(x->>'entityRef',''), x->'original', nullif(x->>'suggestedYear','')::int, nullif(x->>'evidence',''),
            x->>'decision', case when x->>'decision' = 'year' then v_year end, v_fact, auth.uid());
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'decided', v_n);
end $$;

-- תשובות מקישור ישן שכבר נשלח — לשנת הסשן, ממתינות, בלי כפילות (source_ref).
create or replace function public.record_legacy_tax_year_facts(p_client_id text, p_session_id text, p_facts jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c public.clients%rowtype; v_year int; x jsonb; v_n int := 0; v_k int;
begin
  c := public._tax_year_client(p_client_id);
  select tax_year into v_year from public.annual_report_sessions where id::text = p_session_id and client_id = p_client_id;
  if v_year is null then return jsonb_build_object('ok', false, 'error', 'session_not_found'); end if;
  for x in select value from jsonb_array_elements(coalesce(p_facts, '[]'::jsonb)) loop
    if (x->>'taxYear')::int <> v_year then return jsonb_build_object('ok', false, 'error', 'year_mismatch'); end if;
    if not (public._tax_year_items() ? (x->>'itemKey')) then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
    insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_from, period_to,
      answer, value, basis, source, source_ref, status, note)
    values (c.user_id, c.id, v_year, x->>'itemKey', x->>'subjectRole', 'year', make_date(v_year,1,1), make_date(v_year,12,31),
      x->>'answer', x->'value', 'declared', 'legacy_questionnaire', x->>'sourceRef', 'pending', x->>'note')
    on conflict do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return jsonb_build_object('ok', true, 'recorded', v_n);
end $$;

-- ── 10. הרשאות ──────────────────────────────────────────────────────────────
revoke all on function public.ensure_tax_year_request(text, text, int, int) from public, anon;
revoke all on function public.add_tax_info_asks(text, jsonb) from public, anon;
revoke all on function public.cancel_tax_info_ask(uuid) from public, anon;
revoke all on function public.resolve_tax_info_note(uuid) from public, anon;
revoke all on function public.publish_tax_info(text) from public, anon;
revoke all on function public.portal_tax_info_preview(text, text) from public, anon;
revoke all on function public.decide_tax_year_facts(uuid[], text, text) from public, anon;
revoke all on function public.correct_tax_year_fact(uuid, text, jsonb, text) from public, anon;
revoke all on function public.record_tax_year_fact(text, jsonb) from public, anon;
revoke all on function public.review_tax_evidence(uuid, text, text, text, text) from public, anon;
revoke all on function public.decide_card_transfers(text, jsonb) from public, anon;
revoke all on function public.record_legacy_tax_year_facts(text, text, jsonb) from public, anon;
grant execute on function public.ensure_tax_year_request(text, text, int, int) to authenticated;
grant execute on function public.add_tax_info_asks(text, jsonb) to authenticated;
grant execute on function public.cancel_tax_info_ask(uuid) to authenticated;
grant execute on function public.resolve_tax_info_note(uuid) to authenticated;
grant execute on function public.publish_tax_info(text) to authenticated;
grant execute on function public.portal_tax_info_preview(text, text) to authenticated;
grant execute on function public.decide_tax_year_facts(uuid[], text, text) to authenticated;
grant execute on function public.correct_tax_year_fact(uuid, text, jsonb, text) to authenticated;
grant execute on function public.record_tax_year_fact(text, jsonb) to authenticated;
grant execute on function public.review_tax_evidence(uuid, text, text, text, text) to authenticated;
grant execute on function public.decide_card_transfers(text, jsonb) to authenticated;
grant execute on function public.record_legacy_tax_year_facts(text, text, jsonb) to authenticated;
-- הדף האישי: טוקן בלבד
revoke all on function public.portal_tax_info(text, text) from public;
revoke all on function public.portal_save_tax_info_draft(text, uuid, jsonb) from public;
revoke all on function public.portal_submit_tax_info(text, uuid, jsonb) from public;
grant execute on function public.portal_tax_info(text, text) to anon, authenticated;
grant execute on function public.portal_save_tax_info_draft(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.portal_submit_tax_info(text, uuid, jsonb) to anon, authenticated;
-- עזר פנימי — לא לקריאה ישירה
revoke all on function public._tax_year_client(text) from public, anon, authenticated;
revoke all on function public._portal_client(text) from public, anon, authenticated;
revoke all on function public._tax_info_view(text, text) from public, anon, authenticated;

-- ── 11. הדף האישי: «השלמת מידע» כפריט פעולה ─────────────────────────────────
-- ‼ _portal_step_items (222) מדלג על סוג לא מוכר. הענף נוסף לגוף החי בהזרקה
-- מבוקרת — עוגן אחד בדיוק, אחרת נכשל — כדי שלא לשכפל 600 שורות שנגזרות בסקריפט.
-- (אותו דפוס כמו 219; ‼ apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל —
--  לאמת אחרי ההחלה: select prosrc like '%info_collection%' from pg_proc.)
do $patch$
declare
  v_def    text;
  v_anchor text := E'    else\n      exit step_body;\n    end case;';
  v_branch text := E'    when ''info_collection'' then\n'
    || E'      -- 229 · «השלמת מידע» לשנת מס: פעולה ללקוח כשיש שאלות פתוחות; «נשלח» כשענה; מסמך «אין עדיין» — ממתין, בלי תזכורת אוטומטית\n'
    || E'      select count(*) filter (where a.state = ''published''), count(*) filter (where a.state = ''answered''), count(*) filter (where a.state = ''unavailable'')\n'
    || E'        into v_ck_total, v_ck_done, v_rq_total from public.tax_info_asks a where a.step_id = s.id;\n'
    || E'      v_label := coalesce(nullif(s.payload->>''title'',''''), ''השלמת מידע'');\n'
    || E'      if v_ck_total > 0 then\n'
    || E'        v_items := v_items || jsonb_build_object(''bucket'',''action'',''key'',''taxinfo_''||s.id,''label'',v_label,\n'
    || E'          ''sub'', case when v_ck_total = 1 then ''שאלה אחת'' else v_ck_total || '' שאלות'' end || '' · אפשר לעצור ולהמשיך'', ''actionKind'',''taxInfo'',''actionValue'', s.id);\n'
    || E'      elsif v_rq_total > 0 then\n'
    || E'        v_items := v_items || jsonb_build_object(''bucket'',''office'',''key'',''taxinfo_''||s.id,''label'',v_label,\n'
    || E'          ''sub'', ''מחכים למסמכים שעוד לא הגיעו — נבקש כשיהיו'', ''actionKind'',''taxInfo'',''actionValue'', s.id);\n'
    || E'      elsif v_ck_done > 0 then\n'
    || E'        v_items := v_items || jsonb_build_object(''bucket'',''done'',''key'',''taxinfo_''||s.id,''label'', v_label || '' · נשלח למשרד'');\n'
    || E'      end if;\n\n';
  -- ‼ 12.10.2026 · החלה חוזרת מעדכנת גרסה ישנה של הענף (עד עכשיו דילגה כשהסימון קיים, ו«שאלה אחת» לא הגיע ל-staging).
  --   גרסה מוכרת — מוחלפת במקומה; הגרסה הנוכחית — דילוג; סימון בלי גרסה מוכרת — עצירה (לא מנחשים).
  v_sub_new text := E'''sub'', case when v_ck_total = 1 then ''שאלה אחת'' else v_ck_total || '' שאלות'' end || '' · אפשר לעצור ולהמשיך'',';
  v_sub_old text := E'''sub'', v_ck_total || '' שאלות · אפשר לעצור ולהמשיך'',';
begin
  select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure)
    into v_def;
  if v_def like '%229 · «השלמת מידע»%' then
    if position(v_sub_new in v_def) > 0 then
      raise notice '229: הענף כבר קיים בגרסה הנוכחית';
    elsif (length(v_def) - length(replace(v_def, v_sub_old, ''))) / length(v_sub_old) = 1 then
      execute replace(v_def, v_sub_old, v_sub_new);
      raise notice '229: הענף עודכן מגרסה קודמת («N שאלות» ⇐ «שאלה אחת»)';
    else
      raise exception '229: הענף קיים בגרסה לא מוכרת — לבדוק ידנית לפני החלה';
    end if;
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '229: עוגן הענף ב-_portal_step_items לא נמצא פעם אחת בדיוק';
  end if;
  execute replace(v_def, v_anchor, v_branch || v_anchor);
end
$patch$;

-- ── 12. «שלח בקשות» — «השלמת מידע» שפורסמה נספרת (נמצא בבדיקת staging, 11.10.2026) ──
-- ‼ הרשימה של _client_announceable_steps (214/220) סגורה לפי סוג, ו«השלמת מידע» לא הייתה בה:
--   הבקשה הופיעה בדף האישי אבל «שלח בקשות» לא ספר אותה ולא שלח עליה מייל. נוספת — רק כשהכדור
--   אצל הלקוח (כמו פרטי העסק) — ומפתח הדף `taxinfo_<id>` (אותו מפתח של הענף בסעיף 11), כדי
--   שהמייל יקשר לפריט הנכון. הזרקה מבוקרת לגוף החי, עוגן אחד בדיוק; החלה חוזרת לא מכפילה.
-- ‼ 12.10.2026: שני עוגנים של שורה אחת, כל אחד פעם אחת בדיוק — ולא שתי שורות צמודות. 239 (בייצור) מכניס שורה
--   בין רשימת הסוגים לתנאי של פרטי העסק, והעוגן הצמוד הקודם לא נמצא אחריה (229 הייתה נכשלת בייצור).
--   התוצאה זהה לגרסה הקודמת של ההזרקה — ולכן מה שכבר חל ב-staging וההתאוששות (rollback-229) לא משתנים.
--   נבדק בשני הסדרים: scripts/sql/229/test-229-order.pglite.mjs.
do $patch12$
declare
  v_def text;
  v_a1 text := E'''business_details'')';
  v_n1 text := E'''business_details'',\n                         -- 229 · «השלמת מידע» — רק כשהיא אצל הלקוח\n                         ''info_collection'')';
  v_a1b text := E'and (s.step_type <> ''business_details'' or coalesce(s.ball, ''client'') = ''client'')';
  v_n1b text := E'and (s.step_type <> ''business_details'' or coalesce(s.ball, ''client'') = ''client'')\n     and (s.step_type <> ''info_collection'' or coalesce(s.ball, ''client'') = ''client'')';
  v_a2 text := E'when ''rep_client_approval'' then ''rep_approval''';
  v_n2 text := E'when ''info_collection'' then ''taxinfo_'' || p_step_id\n           when ''rep_client_approval'' then ''rep_approval''';
begin
  if to_regprocedure('public._client_announceable_steps(text)') is null then
    raise notice '229/12: _client_announceable_steps חסרה — מדלג (סביבה בלי 214)';
  else
    v_def := pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure);
    if v_def like '%''info_collection''%' then
      raise notice '229/12: «השלמת מידע» כבר ברשימה';
    elsif (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1
       or (length(v_def) - length(replace(v_def, v_a1b, ''))) / length(v_a1b) <> 1 then
      raise exception '229/12: העוגן ב-_client_announceable_steps לא נמצא פעם אחת בדיוק';
    else
      execute replace(replace(v_def, v_a1, v_n1), v_a1b, v_n1b);
    end if;
  end if;
  if to_regprocedure('public._client_step_portal_key(text, text)') is null then
    raise notice '229/12: _client_step_portal_key חסרה — מדלג';
  else
    v_def := pg_get_functiondef('public._client_step_portal_key(text, text)'::regprocedure);
    if v_def like '%''info_collection''%' then
      raise notice '229/12: מפתח הדף כבר קיים';
    elsif (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
      raise exception '229/12: העוגן ב-_client_step_portal_key לא נמצא פעם אחת בדיוק';
    else
      execute replace(v_def, v_a2, v_n2);
    end if;
  end if;
end
$patch12$;
