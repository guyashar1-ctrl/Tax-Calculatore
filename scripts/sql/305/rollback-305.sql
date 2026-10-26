-- חזרה מ-305: הגופים של shaam_filing_import ו-shaam_filing_list כפי שהוגדרו ב-250; הטריגר והפונקציות של 305 יורדים.
-- ‼ הטבלה shaam_filing_source_effects ועמודות undone_at/undo_summary נשארות (נתונים, בלי שימוש) — החלה מחדש של 305 בטוחה.
--   בקשות שנפתחו לבד נשארות כבקשות רגילות; חובות לא משתנות.

drop trigger if exists trg_shaam_filing_from_gmf154_job on public.automation_jobs;
drop function if exists public._shaam_filing_from_gmf154_job();
drop function if exists public._shaam_gmf154_batch(uuid, text, jsonb, text, text, text);
drop function if exists public.undo_shaam_filing_source(uuid);
drop function if exists public._shaam_auto_request_untouched(text, uuid);

create or replace function public.shaam_filing_import(p_batch jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_plan jsonb; p jsonb; r jsonb; s jsonb; v_src uuid; v_srcs jsonb := '{}'::jsonb;
  e public.shaam_filing_obligations%rowtype; v_id uuid; v_group text; v_kind text; v_n jsonb := '{}'::jsonb; v_step text;
  v_values jsonb; st public.onboarding_steps%rowtype; v_marked int := 0; v_linked int := 0;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or jsonb_array_length(coalesce(p_batch->'rows', '[]'::jsonb)) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'bad_batch');
  end if;
  -- מקורות: אותו קובץ (sha) — אותה רשומה; הנתיב בדלי חייב להיות בתיקיית המשרד
  for s in select * from jsonb_array_elements(coalesce(p_batch->'sources', '[]'::jsonb)) loop
    if nullif(s->>'storagePath', '') is not null and split_part(s->>'storagePath', '/', 1) <> v_uid::text then
      return jsonb_build_object('ok', false, 'error', 'bad_storage_path');
    end if;
    if s->>'kind' not in ('annual', 'wealth') then return jsonb_build_object('ok', false, 'error', 'bad_source'); end if;
    v_src := null;
    if nullif(s->>'sha256', '') is not null then
      select id into v_src from public.shaam_filing_sources where user_id = v_uid and content_sha256 = s->>'sha256';
    end if;
    if v_src is null then
      insert into public.shaam_filing_sources (user_id, method, file_name, content_sha256, storage_path, file_size, list_kind, wealth_group, tax_year,
        produced_raw, produced_on, pages, status, note, uploaded_by)
      values (v_uid, coalesce(nullif(s->>'method', ''), 'pdf'), left(coalesce(nullif(s->>'fileName', ''), 'קובץ'), 200), nullif(s->>'sha256', ''),
        nullif(s->>'storagePath', ''), nullif(s->>'size', '')::bigint, s->>'kind', nullif(s->>'group', ''), nullif(s->>'taxYear', '')::int,
        left(nullif(s->>'producedRaw', ''), 40), nullif(s->>'producedOn', '')::date, coalesce(s->'pages', '[]'::jsonb),
        case when s->>'status' in ('ok', 'empty_confirmed', 'partial') then s->>'status' else 'partial' end, left(nullif(s->>'note', ''), 500), v_uid)
      returning id into v_src;
    elsif nullif(s->>'storagePath', '') is not null then
      update public.shaam_filing_sources set storage_path = coalesce(storage_path, s->>'storagePath') where id = v_src;
    end if;
    v_srcs := v_srcs || jsonb_build_object(s->>'key', v_src);
  end loop;

  v_plan := public._shaam_plan(v_uid, p_batch);
  for p in select * from jsonb_array_elements(v_plan) loop
    v_n := jsonb_set(v_n, array[p->>'change'], to_jsonb(coalesce((v_n->>(p->>'change'))::int, 0) + 1));
    if p->>'change' not in ('new', 'updated', 'unchanged') then continue; end if;
    r := p_batch->'rows'->((p->>'i')::int - 1);
    select x.value into s from jsonb_array_elements(p_batch->'sources') x where x.value->>'key' = r->>'sourceKey' limit 1;
    v_kind := s->>'kind'; v_group := nullif(s->>'group', '');
    if p->>'change' = 'unchanged' then
      update public.shaam_filing_obligations set last_seen_at = now(), state = p->>'state',
             client_id = coalesce(client_id, p->>'clientId'), subject_role = coalesce(subject_role, p->>'role'),
             match_kind = coalesce(match_kind, p->>'tier'), review_reason = p->>'reason', candidates = p->'candidates'
       where id = (p->>'existingId')::uuid;
      v_id := (p->>'existingId')::uuid;
    elsif p->>'change' = 'updated' then
      select * into e from public.shaam_filing_obligations where id = (p->>'existingId')::uuid for update;
      update public.shaam_filing_obligations set
        name_captured = nullif(r->>'name', ''), office = nullif(r->>'office', ''), file_type = nullif(r->>'fileType', ''),
        section = nullif(r->>'section', ''), branch = nullif(r->>'branch', ''), required = (r->>'required')::boolean,
        legal_due = nullif(r->>'legalDue', '')::date, legal_due_raw = nullif(r->>'legalDueRaw', ''),
        filed_on = nullif(r->>'filedOn', '')::date, filed_on_raw = nullif(r->>'filedOnRaw', ''),
        no_assessment = coalesce((r->>'noAssessment')::boolean, false), wealth_group = v_group,
        fine = case when v_group is null then null else v_group like '%\_fine' and v_group not like '%no\_fine' end,
        shaam_status = p->>'shaamStatus', state = p->>'state', review_reason = p->>'reason', candidates = p->'candidates',
        client_id = coalesce(e.client_id, p->>'clientId'), subject_role = coalesce(e.subject_role, p->>'role'), match_kind = coalesce(e.match_kind, p->>'tier'),
        source_id = (v_srcs->>(r->>'sourceKey'))::uuid, evidence = jsonb_build_object('sourceId', v_srcs->>(r->>'sourceKey'), 'page', r->'page', 'line', r->'line'),
        produced_on = nullif(s->>'producedOn', '')::date,
        history = e.history || jsonb_build_array(jsonb_build_object('at', now(), 'sourceId', e.source_id, 'producedOn', e.produced_on,
          'state', e.state, 'values', public._shaam_values(e))),
        last_seen_at = now(), updated_at = now()
       where id = e.id;
      v_id := e.id;
    else
      insert into public.shaam_filing_obligations (user_id, kind, file_number, year_shown, tax_year, name_captured, office, file_type, section, branch,
        required, legal_due, legal_due_raw, filed_on, filed_on_raw, no_assessment, wealth_group, fine, shaam_status, state, review_reason,
        client_id, subject_role, match_kind, candidates, source_id, evidence, produced_on)
      values (v_uid, v_kind, public._shaam_file9(r->>'fileNumber'), btrim(r->>'yearShown'), (btrim(r->>'yearShown'))::int,
        nullif(r->>'name', ''), nullif(r->>'office', ''), nullif(r->>'fileType', ''), nullif(r->>'section', ''), nullif(r->>'branch', ''),
        (r->>'required')::boolean, nullif(r->>'legalDue', '')::date, nullif(r->>'legalDueRaw', ''), nullif(r->>'filedOn', '')::date, nullif(r->>'filedOnRaw', ''),
        coalesce((r->>'noAssessment')::boolean, false), v_group,
        case when v_group is null then null else v_group like '%\_fine' and v_group not like '%no\_fine' end,
        p->>'shaamStatus', p->>'state', p->>'reason', p->>'clientId', p->>'role', p->>'tier', p->'candidates',
        (v_srcs->>(r->>'sourceKey'))::uuid, jsonb_build_object('sourceId', v_srcs->>(r->>'sourceKey'), 'page', r->'page', 'line', r->'line'),
        nullif(s->>'producedOn', '')::date)
      returning id into v_id;
    end if;
    perform public._shaam_after_change(v_id);
  end loop;
  return jsonb_build_object('ok', true, 'counts', v_n, 'plan', v_plan, 'sources', v_srcs);
end $$;

drop function if exists public._shaam_filing_import(uuid, jsonb);
drop function if exists public._shaam_auto_open(uuid, uuid);

create or replace function public.shaam_filing_list(p_client_id text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true,
    'obligations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', o.id, 'kind', o.kind, 'fileNumber', o.file_number, 'yearShown', o.year_shown, 'name', o.name_captured,
        'office', o.office, 'fileType', o.file_type, 'section', o.section, 'required', o.required,
        'legalDue', o.legal_due, 'legalDueRaw', o.legal_due_raw, 'filedOn', o.filed_on, 'noAssessment', o.no_assessment,
        'group', o.wealth_group, 'fine', o.fine, 'shaamStatus', o.shaam_status, 'state', o.state, 'reason', o.review_reason,
        'clientId', o.client_id, 'clientName', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'role', o.subject_role,
        'matchKind', o.match_kind, 'candidates', o.candidates,
        'stepId', o.step_id, 'stepStatus', st.status, 'copyStepId', o.copy_step_id, 'copyStepStatus', cs.status,
        'copyInOffice', case when o.client_id is not null and o.state in ('history', 'filed_per_shaam') then exists (
            select 1 from public.documents d left join public.document_labels l on l.id = d.label_id
            where d.client_id = o.client_id and d.user_id = v_uid and d.year = o.year_shown
              and (case when o.kind = 'wealth' then concat_ws(' ', d.file_name, d.description, l.name) ~ 'הצהרת\s*הון'
                        else concat_ws(' ', d.file_name, d.description, l.name) ~ '(1301|דוח\s*שנתי|דו"ח\s*שנתי)' end)) end,
        'evidence', o.evidence, 'producedOn', o.produced_on, 'sourceName', src.file_name,
        'firstSeenAt', o.first_seen_at, 'lastSeenAt', o.last_seen_at, 'updatedAt', o.updated_at,
        'historyCount', jsonb_array_length(o.history)
      )) order by o.legal_due nulls last, o.file_number)
      from public.shaam_filing_obligations o
      left join public.clients c on c.id = o.client_id
      left join public.onboarding_steps st on st.id = o.step_id
      left join public.onboarding_steps cs on cs.id = o.copy_step_id
      left join public.shaam_filing_sources src on src.id = o.source_id
      where o.user_id = v_uid and (p_client_id is null or o.client_id = p_client_id)), '[]'::jsonb),
    'sources', case when p_client_id is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'method', s.method, 'fileName', s.file_name, 'kind', s.list_kind, 'group', s.wealth_group,
        'taxYear', s.tax_year, 'producedRaw', s.produced_raw, 'producedOn', s.produced_on, 'pages', s.pages, 'status', s.status,
        'note', s.note, 'uploadedAt', s.uploaded_at, 'hasFile', s.storage_path is not null, 'sha256', s.content_sha256)) order by s.uploaded_at desc)
      from public.shaam_filing_sources s where s.user_id = v_uid), '[]'::jsonb) end);
end $$;

revoke all on function public.shaam_filing_import(jsonb) from public, anon;
revoke all on function public.shaam_filing_list(text) from public, anon;
grant execute on function public.shaam_filing_import(jsonb) to authenticated;
grant execute on function public.shaam_filing_list(text) to authenticated;
