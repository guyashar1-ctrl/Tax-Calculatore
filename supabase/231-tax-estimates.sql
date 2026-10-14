-- ════════════════════════════════════════════════════════════════════════════
-- 231 · הערכת מס — גרסאות שמורות (שלב 3) — 11.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- הקוד שמקביל: src/features/taxEstimate/ (engine.ts — החישוב רץ בדפדפן; כאן נשמרים הקלט, ההנחות,
-- ההכרעות, התוצאה וגרסת המרשם). docs/tax-foundation/architecture-and-delivery-plan.md §4.4.
--
-- ‼ גרסה מאושרת אינה נערכת (טריגר). שינוי נתונים או כללים אחרי אישור לא משכתב אותה — חישוב
--   מחדש יוצר גרסה חדשה (טיוטה), ואישורה מסמן את הקודמת «הוחלפה».
-- ‼ אישור נחסם בשרת כשיש בתוצאה «חוסם» (חסר נתון, תחזית שלא נבחרה, כלל לא מוכרע בלי הכרעה)
--   או יישור בין מקורות שלא הוכרע.
-- ‼ אין כאן שינוי מקדמות ברשות ואין שליחה ללקוח — המלצה היא טיוטה בתוך הגרסה.
-- ‼ עריכה במקביל: כל שמירה מצהירה על מה שהיא ראתה (p_base: הטיוטה ומספר העדכון שלה, או הגרסה האחרונה
--   כשאין טיוטה). השרת משווה תחת נעילה; שונה ⇒ «conflict» עם המצב הנוכחי, ושום דבר לא נדרס.
-- ‼ שנת המס בתוצאה חייבת להיות שנת הבקשה — אין ערבוב שנים בין בקשות.
-- ‼ תלוי ב-229 (בקשת tax_estimate). לא הוחל על שום סביבה. בידוד: scripts/sql/231/test-231-estimates.pglite.mjs.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.tax_estimates (
  id           text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    text not null references public.clients(id) on delete cascade,
  request_id   text not null references public.onboarding_steps(id) on delete cascade,
  tax_year     int  not null,
  version      int  not null,
  status       text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  cutoff_month int  not null check (cutoff_month between 0 and 12),
  draft        jsonb not null,
  outputs      jsonb,
  input_facts  jsonb not null default '[]'::jsonb,
  ruleset_version text,
  revision     int  not null default 1,
  approved_by  uuid references auth.users(id),
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (request_id, version)
);
alter table public.tax_estimates add column if not exists revision int not null default 1;
create index if not exists tax_estimates_client_year_idx on public.tax_estimates (client_id, tax_year);
-- טיוטה אחת לכל בקשה
create unique index if not exists tax_estimates_one_draft_idx on public.tax_estimates (request_id) where status = 'draft';
-- מאושרת אחת לכל בקשה
create unique index if not exists tax_estimates_one_approved_idx on public.tax_estimates (request_id) where status = 'approved';

alter table public.tax_estimates enable row level security;
drop policy if exists tax_estimates_owner_read on public.tax_estimates;
create policy tax_estimates_owner_read on public.tax_estimates for select to authenticated using (user_id = auth.uid() and public.is_authorized());
-- ‼ אין מדיניות כתיבה: כל כתיבה דרך הפונקציות.

-- ── גרסה מאושרת אינה נערכת ──
create or replace function public._tax_estimate_immutable()
returns trigger language plpgsql as $$
begin
  if old.status = 'superseded' then
    raise exception 'tax_estimate_superseded: גרסה שהוחלפה אינה נערכת';
  end if;
  if old.status = 'approved' then
    -- המעבר היחיד המותר: «הוחלפה», בלי לגעת בשום שדה אחר
    if new.status = 'superseded'
       and new.draft = old.draft and new.outputs is not distinct from old.outputs and new.input_facts = old.input_facts
       and new.version = old.version and new.revision = old.revision and new.cutoff_month = old.cutoff_month and new.approved_at is not distinct from old.approved_at then
      return new;
    end if;
    raise exception 'tax_estimate_approved: גרסה מאושרת אינה נערכת — חישוב מחדש יוצר גרסה חדשה';
  end if;
  return new;
end $$;
drop trigger if exists tax_estimates_immutable on public.tax_estimates;
create trigger tax_estimates_immutable before update on public.tax_estimates
  for each row execute function public._tax_estimate_immutable();
revoke all on function public._tax_estimate_immutable() from public, anon, authenticated;

-- ── שמירת טיוטה: מעדכנת את הטיוטה הקיימת, או פותחת גרסה חדשה אחרי גרסה מאושרת ──
drop function if exists public.save_tax_estimate(text, jsonb, jsonb, jsonb);
create or replace function public.save_tax_estimate(p_request_id text, p_draft jsonb, p_outputs jsonb, p_input_facts jsonb, p_base jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s     public.onboarding_steps%rowtype;
  c     public.clients%rowtype;
  v_id  text;
  v_ver int;
  v_cut int;
  v_rev int;
  v_latest int;
  v_cur jsonb;
begin
  select * into s from public.onboarding_steps where id = p_request_id;
  if s.id is null or s.step_type <> 'tax_estimate' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  c := public._tax_year_client(s.client_id);
  if s.status in ('completed','verified','skipped','cancelled','failed') then return jsonb_build_object('ok', false, 'error', 'request_closed'); end if;
  if jsonb_typeof(p_draft) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_draft'); end if;
  v_cut := coalesce((p_draft->>'cutoffMonth')::int, -1);
  if v_cut not between 0 and 12 then return jsonb_build_object('ok', false, 'error', 'bad_cutoff'); end if;
  if jsonb_typeof(p_outputs) = 'object' and p_outputs ? 'taxYear' and (p_outputs->>'taxYear')::int is distinct from (s.payload->>'taxYear')::int then
    return jsonb_build_object('ok', false, 'error', 'year_mismatch');
  end if;
  if p_base is null or jsonb_typeof(p_base) <> 'object' then return jsonb_build_object('ok', false, 'error', 'base_required'); end if;
  perform pg_advisory_xact_lock(hashtext('tax_estimate:' || p_request_id));
  select id, version, revision into v_id, v_ver, v_rev from public.tax_estimates where request_id = p_request_id and status = 'draft';
  select coalesce(max(version), 0) into v_latest from public.tax_estimates where request_id = p_request_id;
  v_cur := jsonb_build_object('draftId', v_id, 'revision', v_rev, 'latestVersion', v_latest);
  if v_id is not null then
    if p_base->>'draftId' is distinct from v_id or (p_base->>'revision')::int is distinct from v_rev then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'current', v_cur);
    end if;
    update public.tax_estimates set draft = p_draft, outputs = p_outputs, input_facts = coalesce(p_input_facts, '[]'::jsonb),
      cutoff_month = v_cut, ruleset_version = p_outputs->>'rulesetVersion', revision = revision + 1, updated_at = now()
     where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver, 'revision', v_rev + 1, 'created', false);
  end if;
  if (p_base ? 'draftId' and p_base->>'draftId' is not null) or coalesce((p_base->>'latestVersion')::int, -1) <> v_latest then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'current', v_cur);
  end if;
  v_ver := v_latest + 1;
  insert into public.tax_estimates (user_id, client_id, request_id, tax_year, version, cutoff_month, draft, outputs, input_facts, ruleset_version)
  values (c.user_id, s.client_id, p_request_id, (s.payload->>'taxYear')::int, v_ver, v_cut, p_draft, p_outputs, coalesce(p_input_facts, '[]'::jsonb), p_outputs->>'rulesetVersion')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver, 'revision', 1, 'created', true);
end $$;

-- ── אישור: רק טיוטה בלי חוסמים ובלי יישור פתוח; המאושרת הקודמת — «הוחלפה» ──
drop function if exists public.approve_tax_estimate(text);
create or replace function public.approve_tax_estimate(p_estimate_id text, p_revision int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  e public.tax_estimates%rowtype;
  c public.clients%rowtype;
begin
  select * into e from public.tax_estimates where id = p_estimate_id for update;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(e.client_id);
  if e.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  -- מאשרים בדיוק את מה שהוצג: אם מישהו שמר בינתיים — «conflict»
  if p_revision is distinct from e.revision then return jsonb_build_object('ok', false, 'error', 'conflict', 'current', jsonb_build_object('draftId', e.id, 'revision', e.revision)); end if;
  if e.outputs is null then return jsonb_build_object('ok', false, 'error', 'no_outputs'); end if;
  if jsonb_array_length(coalesce(e.outputs->'blockers', '[]'::jsonb)) > 0 then
    return jsonb_build_object('ok', false, 'error', 'has_blockers', 'blockers', e.outputs->'blockers');
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(e.draft->'reconciliations', '[]'::jsonb)) r where nullif(r->>'decision', '') is null) then
    return jsonb_build_object('ok', false, 'error', 'reconciliation_open');
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(e.draft->'lines', '[]'::jsonb)) l
             where (e.draft->>'cutoffMonth')::int < 12 and nullif(l->>'chosen', '') is null) then
    return jsonb_build_object('ok', false, 'error', 'forecast_not_chosen');
  end if;
  update public.tax_estimates set status = 'superseded', updated_at = now() where request_id = e.request_id and status = 'approved';
  update public.tax_estimates set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now() where id = e.id;
  return jsonb_build_object('ok', true, 'id', e.id, 'version', e.version);
end $$;

revoke all on function public.save_tax_estimate(text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.approve_tax_estimate(text, int) from public, anon;
grant execute on function public.save_tax_estimate(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.approve_tax_estimate(text, int) to authenticated;
grant select on public.tax_estimates to authenticated;
