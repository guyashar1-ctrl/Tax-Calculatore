-- ============================================================================
-- ANNUAL REPORT (1301) MODULE — מודול הדוח השנתי
-- ============================================================================
-- מוסיף תמיכה בטופס 1301:
--   - sessions: מופע אחד של דוח שנתי לכל זוג (לקוח, שנת מס)
--   - answers: תשובות גולמיות לעץ ההחלטות (היסטוריה: superseded_by)
--   - model_snapshots: snapshot של ה-TaxpayerModel המורכב (jsonb)
--
-- בהתאם לאפיון, ה-mapping ל-1301 שדה-שדה (form_1301_mappings)
-- ו-parsed_documents יוכנסו בפרוסה הבאה ולא ב-MVP הראשון.
-- ============================================================================


-- ─── 1. SESSIONS ────────────────────────────────────────────────────────────

create table public.annual_report_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    text not null references public.clients(id) on delete cascade,
  tax_year     int not null,

  status       text not null default 'in_progress'
               check (status in ('in_progress','review','mapping_done','archived')),

  -- ה-model המתעדכן בכל תשובה (מפושט; snapshot גרסאות בטבלה הנפרדת למטה)
  model        jsonb not null default '{}'::jsonb,

  current_question_id text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,

  unique (client_id, tax_year)
);

create index ars_user_id_idx     on public.annual_report_sessions(user_id);
create index ars_client_year_idx on public.annual_report_sessions(client_id, tax_year);

alter table public.annual_report_sessions enable row level security;

create policy "ars_select_own" on public.annual_report_sessions
  for select using (auth.uid() = user_id);
create policy "ars_insert_own" on public.annual_report_sessions
  for insert with check (auth.uid() = user_id);
create policy "ars_update_own" on public.annual_report_sessions
  for update using (auth.uid() = user_id);
create policy "ars_delete_own" on public.annual_report_sessions
  for delete using (auth.uid() = user_id);

create trigger ars_updated_at
  before update on public.annual_report_sessions
  for each row execute function public.set_updated_at();


-- ─── 2. ANSWERS ─────────────────────────────────────────────────────────────

create table public.annual_report_answers (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.annual_report_sessions(id) on delete cascade,
  question_id   text not null,                                 -- e.g. 'marital_status'
  answer_value  jsonb not null,
  answered_at   timestamptz not null default now(),
  superseded_by uuid references public.annual_report_answers(id)
);

create index ara_session_idx on public.annual_report_answers(session_id);
create unique index ara_active_uq
  on public.annual_report_answers(session_id, question_id)
  where superseded_by is null;

alter table public.annual_report_answers enable row level security;

create policy "ara_select_own" on public.annual_report_answers
  for select using (
    exists (
      select 1 from public.annual_report_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
create policy "ara_insert_own" on public.annual_report_answers
  for insert with check (
    exists (
      select 1 from public.annual_report_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
create policy "ara_update_own" on public.annual_report_answers
  for update using (
    exists (
      select 1 from public.annual_report_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
create policy "ara_delete_own" on public.annual_report_answers
  for delete using (
    exists (
      select 1 from public.annual_report_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );


-- ─── 3. MODEL SNAPSHOTS (audit) ─────────────────────────────────────────────

create table public.annual_report_model_snapshots (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.annual_report_sessions(id) on delete cascade,
  version     int not null,
  model       jsonb not null,
  created_at  timestamptz not null default now(),
  unique (session_id, version)
);

create index arms_session_idx on public.annual_report_model_snapshots(session_id);

alter table public.annual_report_model_snapshots enable row level security;

create policy "arms_select_own" on public.annual_report_model_snapshots
  for select using (
    exists (
      select 1 from public.annual_report_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
create policy "arms_insert_own" on public.annual_report_model_snapshots
  for insert with check (
    exists (
      select 1 from public.annual_report_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );


-- ============================================================================
-- DONE
-- ============================================================================
