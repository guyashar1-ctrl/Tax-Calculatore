-- ════════════════════════════════════════════════════════════════════════════
-- 233 · דוח שנתי — גרסאות שמורות (שלב 4) — 11.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- הקוד שמקביל: src/features/annualReturn/ (engine.ts מחשב בדפדפן; כאן נשמרים הקלט — טיוטה, השלמות מקצועיות,
-- הכרעות — התוצאה, העובדות שנכנסו וגרסת המרשם). אותו דפוס כמו 231 (הערכת מס).
--
-- ‼ שלושה מצבים נפרדים: טיוטה · מאושרת = «מוכן להגשה» (סקירת משרד, בלי חוסמים ורק בטופס ממופה) · «הוגש בפועל» —
--   רישום ידני (תאריך + אסמכתה) על גרסה מאושרת. אין כאן שידור לרשות.
-- ‼ גרסה מאושרת אינה נערכת; רישום ההגשה נעשה פעם אחת ולא נמחק. דוח מתקן = גרסה חדשה (והקודמת «הוחלפה», עם
--   רישום ההגשה שלה).
-- ‼ עריכה במקביל: p_base («מה ראיתי») כמו ב-231.
-- ‼ תלוי ב-229 (בקשת annual_return) וב-documents. נכתבה 11.10.2026 ולא הוחלה עד 17.10.2026 — אז הוחלה ב-staging **אחרי** 251 (המספר
--   נשמר כי כל התכנון מפנה אליו; אין חפיפה עם 234–251: הטבלה והפונקציות כאן חדשות). יחד איתה: 257 (שורות מקור).
--   בידוד: scripts/sql/233/test-233-257.pglite.mjs · החלה: scripts/sql/233/apply-staging.mjs · חזרה: scripts/sql/233/rollback-233.sql.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.annual_returns (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       text not null references public.clients(id) on delete cascade,
  request_id      text not null references public.onboarding_steps(id) on delete cascade,
  tax_year        int  not null,
  version         int  not null,
  revision        int  not null default 1,
  status          text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  draft           jsonb not null,
  outputs         jsonb,
  input_facts     jsonb not null default '[]'::jsonb,
  ruleset_version text,
  form_version_id text,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  filed_on        date,
  filed_ref       text,
  filed_evidence_id text,
  filed_by        uuid references auth.users(id),
  filed_recorded_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (request_id, version)
);
create index if not exists annual_returns_client_year_idx on public.annual_returns (client_id, tax_year);
create unique index if not exists annual_returns_one_draft_idx on public.annual_returns (request_id) where status = 'draft';
create unique index if not exists annual_returns_one_approved_idx on public.annual_returns (request_id) where status = 'approved';

alter table public.annual_returns enable row level security;
drop policy if exists annual_returns_owner_read on public.annual_returns;
create policy annual_returns_owner_read on public.annual_returns for select to authenticated using (user_id = auth.uid() and public.is_authorized());

-- ── גרסה מאושרת: לא נערכת; מותר רק «הוחלפה» ורישום הגשה אחד ──
create or replace function public._annual_return_immutable()
returns trigger language plpgsql as $$
begin
  if old.status = 'superseded' then
    raise exception 'annual_return_superseded: גרסה שהוחלפה אינה נערכת';
  end if;
  if old.status = 'approved' then
    if new.draft = old.draft and new.outputs is not distinct from old.outputs and new.input_facts = old.input_facts
       and new.version = old.version and new.revision = old.revision and new.approved_at is not distinct from old.approved_at then
      -- «הוחלפה» — בלי לגעת ברישום ההגשה
      if new.status = 'superseded' and new.filed_on is not distinct from old.filed_on and new.filed_ref is not distinct from old.filed_ref then return new; end if;
      -- רישום הגשה — פעם אחת בלבד, על גרסה מאושרת
      if new.status = 'approved' and old.filed_on is null and new.filed_on is not null then return new; end if;
    end if;
    raise exception 'annual_return_approved: גרסה מאושרת אינה נערכת — דוח מתקן הוא גרסה חדשה';
  end if;
  return new;
end $$;
drop trigger if exists annual_returns_immutable on public.annual_returns;
create trigger annual_returns_immutable before update on public.annual_returns
  for each row execute function public._annual_return_immutable();
revoke all on function public._annual_return_immutable() from public, anon, authenticated;

-- ── שמירת טיוטה ──
create or replace function public.save_annual_return(p_request_id text, p_draft jsonb, p_outputs jsonb, p_input_facts jsonb, p_base jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
  c public.clients%rowtype;
  v_id text; v_ver int; v_rev int; v_latest int; v_cur jsonb;
begin
  select * into s from public.onboarding_steps where id = p_request_id;
  if s.id is null or s.step_type <> 'annual_return' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  c := public._tax_year_client(s.client_id);
  if s.status in ('completed','verified','skipped','cancelled','failed') then return jsonb_build_object('ok', false, 'error', 'request_closed'); end if;
  if jsonb_typeof(p_draft) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_draft'); end if;
  if (p_draft->>'taxYear')::int is distinct from (s.payload->>'taxYear')::int
     or (jsonb_typeof(p_outputs) = 'object' and p_outputs ? 'taxYear' and (p_outputs->>'taxYear')::int is distinct from (s.payload->>'taxYear')::int) then
    return jsonb_build_object('ok', false, 'error', 'year_mismatch');
  end if;
  if p_base is null or jsonb_typeof(p_base) <> 'object' then return jsonb_build_object('ok', false, 'error', 'base_required'); end if;
  perform pg_advisory_xact_lock(hashtext('annual_return:' || p_request_id));
  select id, version, revision into v_id, v_ver, v_rev from public.annual_returns where request_id = p_request_id and status = 'draft';
  select coalesce(max(version), 0) into v_latest from public.annual_returns where request_id = p_request_id;
  v_cur := jsonb_build_object('draftId', v_id, 'revision', v_rev, 'latestVersion', v_latest);
  if v_id is not null then
    if p_base->>'draftId' is distinct from v_id or (p_base->>'revision')::int is distinct from v_rev then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'current', v_cur);
    end if;
    update public.annual_returns set draft = p_draft, outputs = p_outputs, input_facts = coalesce(p_input_facts, '[]'::jsonb),
      ruleset_version = p_outputs->>'rulesetVersion', form_version_id = p_outputs->>'formVersionId', revision = revision + 1, updated_at = now()
     where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver, 'revision', v_rev + 1, 'created', false);
  end if;
  if (p_base ? 'draftId' and p_base->>'draftId' is not null) or coalesce((p_base->>'latestVersion')::int, -1) <> v_latest then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'current', v_cur);
  end if;
  v_ver := v_latest + 1;
  insert into public.annual_returns (user_id, client_id, request_id, tax_year, version, draft, outputs, input_facts, ruleset_version, form_version_id)
  values (c.user_id, s.client_id, p_request_id, (s.payload->>'taxYear')::int, v_ver, p_draft, p_outputs, coalesce(p_input_facts, '[]'::jsonb),
          p_outputs->>'rulesetVersion', p_outputs->>'formVersionId')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver, 'revision', 1, 'created', true);
end $$;

-- ── אישור = «מוכן להגשה»: רק בלי חוסמים, רק גיליון מלא (שום שדה או נספח רלוונטי שלא מופק) ──
create or replace function public.approve_annual_return(p_return_id text, p_revision int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare e public.annual_returns%rowtype; c public.clients%rowtype;
begin
  select * into e from public.annual_returns where id = p_return_id for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(e.client_id);
  if e.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  if p_revision is distinct from e.revision then return jsonb_build_object('ok', false, 'error', 'conflict'); end if;
  if e.outputs is null then return jsonb_build_object('ok', false, 'error', 'no_outputs'); end if;
  if jsonb_array_length(coalesce(e.outputs->'blockers', '[]'::jsonb)) > 0 then
    return jsonb_build_object('ok', false, 'error', 'has_blockers', 'blockers', e.outputs->'blockers');
  end if;
  -- ‼ רק «גיליון עבודה מלא» — כל שדה ונספח רלוונטי מופק. גיליון חלקי (יש מה שהמערכת לא מפיקה) אינו «מוכן להגשה»
  if coalesce(e.outputs->>'status', '') <> 'completeWorksheet' then return jsonb_build_object('ok', false, 'error', 'not_ready'); end if;
  if jsonb_array_length(coalesce(e.outputs->'unsupported', '[]'::jsonb)) > 0 then return jsonb_build_object('ok', false, 'error', 'not_ready'); end if;
  update public.annual_returns set status = 'superseded', updated_at = now() where request_id = e.request_id and status = 'approved';
  update public.annual_returns set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now() where id = e.id;
  return jsonb_build_object('ok', true, 'id', e.id, 'version', e.version);
end $$;

-- ── «הוגש בפועל» — רישום ידני, פעם אחת, על גרסה מאושרת; תאריך + אסמכתה (מספר אישור או מסמך) ──
create or replace function public.record_annual_return_filed(p_return_id text, p_filed_on date, p_ref text, p_evidence_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare e public.annual_returns%rowtype; c public.clients%rowtype;
begin
  select * into e from public.annual_returns where id = p_return_id for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(e.client_id);
  if e.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
  if e.filed_on is not null then return jsonb_build_object('ok', false, 'error', 'already_filed'); end if;
  if p_filed_on is null or p_filed_on > current_date then return jsonb_build_object('ok', false, 'error', 'bad_date'); end if;
  if nullif(trim(coalesce(p_ref, '')), '') is null and p_evidence_id is null then return jsonb_build_object('ok', false, 'error', 'evidence_required'); end if;
  if p_evidence_id is not null and not exists (select 1 from public.documents d where d.id = p_evidence_id and d.client_id = e.client_id) then
    return jsonb_build_object('ok', false, 'error', 'evidence_not_found');
  end if;
  update public.annual_returns set filed_on = p_filed_on, filed_ref = nullif(trim(p_ref), ''), filed_evidence_id = p_evidence_id,
         filed_by = auth.uid(), filed_recorded_at = now(), updated_at = now()
   where id = e.id;
  return jsonb_build_object('ok', true, 'id', e.id, 'filedOn', p_filed_on);
end $$;

revoke all on function public.save_annual_return(text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.approve_annual_return(text, int) from public, anon;
revoke all on function public.record_annual_return_filed(text, date, text, text) from public, anon;
grant execute on function public.save_annual_return(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.approve_annual_return(text, int) to authenticated;
grant execute on function public.record_annual_return_filed(text, date, text, text) to authenticated;
-- ‼ 17.10.2026: ברירת המחדל של Supabase מעניקה כתיבה ישירה לטבלה חדשה — כאן הכתיבה רק דרך הפונקציות (SECURITY DEFINER); RLS בלבד אינו מספיק כראיה
revoke all on public.annual_returns from public, anon, authenticated;
grant select on public.annual_returns to authenticated;
