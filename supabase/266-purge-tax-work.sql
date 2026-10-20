-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 266 · «מחק לגמרי» — מחיקת עבודת מס לבדיקות, על הלקוח עצמו (20.10.2026)
-- ‼ גיא: «אני רוצה אופציה למחוק את הדוח בשביל שאוכל לעשות בדיקות» — על הלקוח האמיתי, בלי «לקוח לבדיקה»
--   (docs/plans/2026-10-20-simplicity-roadmap.md §5א, החלטה 12).
-- ‼ למה לא remove_tax_work (242): «ביטול» משאיר תשובות ומסמכים כעובדות של השנה — והשאלון האמיתי הבא היה חושב שהן של
--   הלקוח (scopeYearData בדוח שנתי לוקח את כל עובדות השנה). כאן נמחקים גם הם.
-- ‼ מה נמחק: העבודה ובקשות־הבת שלה, השאלות, העובדות של הבקשה (גם תשובות, גם שורות מקור), הראיות, קבצי הלקוח שהועלו
--   לשאלות (רשומות המסמכים; הקובץ באחסון נשאר), גרסאות הדוח/ההערכה, האירועים וההודעות של הבקשה (cascade).
--   מה נשאר: הכרטיס (שינויים שאושרו לכרטיס — נשארים), יומן המיילים, ושאר הבקשות.
-- ‼ עותק נסתר: לפני המחיקה הכול נשמר ב-tax_work_trash (snapshot jsonb) — לשחזור ידני במקרה של טעות. לא חשוף ל-API.
-- ‼ עבודה שהושלמה — היסטוריה, לא נמחקת (יסודות הבקשות §8).
-- חזרה: scripts/sql/266/rollback-266.sql (מסיר את הפונקציות; הטבלה נשארת עם מה שנשמר בה)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.tax_work_trash (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  client_id   text not null,
  step_id     text not null,
  step_type   text not null,
  title       text,
  deleted_by  uuid,
  deleted_at  timestamptz not null default now(),
  counts      jsonb not null,
  snapshot    jsonb not null
);
alter table public.tax_work_trash enable row level security;
revoke all on table public.tax_work_trash from public, anon, authenticated;

create or replace function public._tax_work_purge_scope(p_step_id text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with st as (select * from public.onboarding_steps where id = p_step_id),
  steps as (select s.* from public.onboarding_steps s, st where s.id = st.id or (s.step_type = 'info_collection' and s.payload->>'parentStepId' = st.id)),
  asks as (select a.* from public.tax_info_asks a where a.parent_step_id = p_step_id or a.step_id in (select id from steps)),
  facts as (select f.* from public.tax_year_facts f where f.request_id in (select id from steps) or f.ask_id in (select id from asks)),
  ev as (select e.* from public.tax_evidence e where e.ask_id in (select id from asks) or e.id in (select evidence_id from facts where evidence_id is not null)),
  docs as (select d.* from public.documents d where d.id in (select document_id from ev where document_id is not null))
  select jsonb_build_object(
    'steps', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from steps x),
    'asks', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from asks x),
    'facts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from facts x),
    'evidence', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from ev x),
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from docs x),
    'annualReturns', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.annual_returns x where x.request_id in (select id from steps)),
    'estimates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.tax_estimates x where x.request_id in (select id from steps)),
    'events', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.onboarding_events x where x.step_id in (select id from steps)),
    'cardTransfers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.tax_card_transfers x where x.fact_id in (select id from facts)));
$$;
revoke all on function public._tax_work_purge_scope(text) from public, anon, authenticated;

-- p_dry_run = true ⇒ רק הספירה (לחלון האישור). ‼ אותה ספירה כמו המחיקה — מקור אחד.
create or replace function public.purge_tax_work(p_step_id text, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  st public.onboarding_steps%rowtype;
  sc jsonb; v_counts jsonb;
begin
  select * into st from public.onboarding_steps where id = p_step_id for update;
  if st.id is null or st.step_type not in ('tax_file_intake', 'annual_return', 'wealth_declaration', 'tax_estimate') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform public._tax_year_client(st.client_id);
  if st.status in ('completed', 'verified', 'skipped') then return jsonb_build_object('ok', false, 'error', 'completed'); end if;
  sc := public._tax_work_purge_scope(st.id);
  v_counts := jsonb_build_object(
    'answers', (select count(*) from jsonb_array_elements(sc->'asks') a where a->>'state' = 'answered'),
    'asks', jsonb_array_length(sc->'asks'),
    'facts', jsonb_array_length(sc->'facts'),
    'files', jsonb_array_length(sc->'documents'),
    'returns', jsonb_array_length(sc->'annualReturns'),
    'estimates', jsonb_array_length(sc->'estimates'));
  if coalesce(p_dry_run, false) then return jsonb_build_object('ok', true, 'dryRun', true, 'counts', v_counts); end if;

  insert into public.tax_work_trash (user_id, client_id, step_id, step_type, title, deleted_by, counts, snapshot)
  values (st.user_id, st.client_id, st.id, st.step_type, st.payload->>'title', auth.uid(), v_counts, sc);

  -- קישורים מבחוץ לעובדות ולראיות שנמחקות — מנותקים, לא נמחקים (NO ACTION)
  update public.tax_year_facts set supersedes = null
   where supersedes in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x)
     and id not in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  update public.tax_year_facts set evidence_id = null
   where evidence_id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'evidence') x)
     and id not in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  delete from public.tax_card_transfers where fact_id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  delete from public.tax_year_facts where id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'facts') x);
  delete from public.tax_evidence where id in (select (x->>'id')::uuid from jsonb_array_elements(sc->'evidence') x);
  delete from public.documents where id in (select x->>'id' from jsonb_array_elements(sc->'documents') x);
  -- העבודה ובקשות־הבת — השאלות, גרסאות הדוח/ההערכה, האירועים וההודעות יורדים איתן (cascade)
  delete from public.onboarding_steps where id in (select x->>'id' from jsonb_array_elements(sc->'steps') x);
  return jsonb_build_object('ok', true, 'counts', v_counts);
end $$;
revoke all on function public.purge_tax_work(text, boolean) from public, anon;
grant execute on function public.purge_tax_work(text, boolean) to authenticated;
