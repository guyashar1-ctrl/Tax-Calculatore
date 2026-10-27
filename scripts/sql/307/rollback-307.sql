-- חזרה מ-307: purge_tax_work כמו ב-266 (בלי החזרת הכרטיס), והסרת הפונקציות של 307.
-- ‼ עדכונים שכבר הוחזרו (status='superseded') והכרטיס שלפני — ב-tax_work_trash.snapshot (cardChanges, clientBefore).

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

drop function if exists public._tax_work_card_undo(text, text[], boolean);
drop function if exists public._tax_card_same(jsonb, jsonb);
