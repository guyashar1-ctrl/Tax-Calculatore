-- 300 · חזרה: הענף של הצהרת הון יוצא מהדף, והחתימה חוזרת לדוח השנתי בלבד (גופי 298). פריטי הסכום נשארים ב-_tax_year_items.
-- ‼ נוצר ב-scripts/sql/303/build.mjs
do $rt300$
declare v_def text := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
begin
  if position('300 · כותרת' in v_def) = 0 then return; end if;
  execute replace(v_def, $blk$when par.step_type = 'tax_estimate' then 'הערכת מס ' || v_year /* 300 · כותרת */ $blk$, '');
end
$rt300$;

do $r300$
declare v_def text; v_start int; v_end int;
begin
  select pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure) into v_def;
  v_start := position('    when ''wealth_declaration'' then' in v_def);
  if v_start = 0 then raise notice '300 rollback: הענף כבר לא קיים'; return; end if;
  v_end := position('    when ''annual_return'' then' in v_def);
  if v_end <= v_start then raise exception '300 rollback: סדר הענפים לא צפוי'; end if;
  execute substr(v_def, 1, v_start - 1) || substr(v_def, v_end);
end
$r300$;

create or replace function public.annual_return_send_for_signing(p_request_id text, p_snapshot jsonb, p_signers jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
  c public.clients%rowtype;
  v_ver int; v_id text; v_sha text; v_roles text[];
begin
  select * into s from public.onboarding_steps where id = p_request_id;
  if s.id is null or s.step_type <> 'annual_return' then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  c := public._tax_year_client(s.client_id);
  if s.status in ('completed', 'verified', 'skipped', 'cancelled', 'failed') then return jsonb_build_object('ok', false, 'error', 'request_closed'); end if;
  if jsonb_typeof(p_snapshot) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_snapshot'); end if;
  if jsonb_typeof(p_signers) <> 'array' or jsonb_array_length(p_signers) not between 1 and 2 then return jsonb_build_object('ok', false, 'error', 'bad_signers'); end if;
  select array_agg(x->>'role') into v_roles from jsonb_array_elements(p_signers) x;
  if exists (select 1 from jsonb_array_elements(p_signers) x where coalesce(x->>'role', '') not in ('client', 'spouse') or nullif(trim(coalesce(x->>'name', '')), '') is null)
     or (select count(distinct r) from unnest(v_roles) r) <> array_length(v_roles, 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_signers');
  end if;
  perform pg_advisory_xact_lock(hashtext('annual_return_sign:' || p_request_id));
  update public.annual_return_signings set state = 'superseded', superseded_at = now() where request_id = p_request_id and state <> 'superseded';
  select coalesce(max(version), 0) + 1 into v_ver from public.annual_return_signings where request_id = p_request_id;
  v_sha := encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex');
  insert into public.annual_return_signings (user_id, client_id, request_id, tax_year, version, snapshot, content_sha256, signers, sent_by)
  values (c.user_id, s.client_id, p_request_id, (s.payload->>'taxYear')::int, v_ver, p_snapshot, v_sha, p_signers, auth.uid())
  returning id into v_id;
  -- הפריט בדף: השלב מתפרסם בשליחה הראשונה (שער הדף ומייל הדף — כמו כל בקשה שפורסמה)
  if s.published_at is null then update public.onboarding_steps set published_at = now() where id = s.id; end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_ver, 'contentSha256', v_sha);
end $$;

create or replace function public.annual_return_store_signed(p_signing_id text, p_storage_path text, p_file_size int, p_pdf_sha256 text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.annual_return_signings%rowtype; c public.clients%rowtype; v_label text; v_doc text;
begin
  select * into r from public.annual_return_signings where id = p_signing_id;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(r.client_id);
  if r.state <> 'signed' then return jsonb_build_object('ok', false, 'error', 'not_signed'); end if;
  -- ‼ בלי החלפה שקטה: מה שכבר צורף — נשאר
  if r.signed_document_id is not null then return jsonb_build_object('ok', true, 'documentId', r.signed_document_id, 'already', true); end if;
  if coalesce(p_storage_path, '') not like (r.user_id::text || '/' || r.client_id || '/%') then return jsonb_build_object('ok', false, 'error', 'bad_path'); end if;
  if coalesce(p_pdf_sha256, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'bad_sha'); end if;
  insert into public.document_labels (user_id, name) values (r.user_id, 'טופס 1301') on conflict (user_id, name) do nothing;
  select id into v_label from public.document_labels where user_id = r.user_id and name = 'טופס 1301';
  v_doc := replace(gen_random_uuid()::text, '-', '');
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, description, notes, label_id, uploaded_at)
  values (v_doc, r.user_id, r.client_id, p_storage_path,
          'דוח-שנתי-' || r.tax_year || '-' || coalesce(nullif(btrim(c.last_name), ''), 'client') || '-חתום.pdf', 'application/pdf', greatest(coalesce(p_file_size, 0), 0),
          'form_1301', r.tax_year::text, 'הדוח השנתי ' || r.tax_year || ' — חתום בדף האישי', 'SHA-256 ' || p_pdf_sha256, v_label, now());
  update public.annual_return_signings set signed_document_id = v_doc, signed_pdf_sha256 = p_pdf_sha256 where id = r.id;
  return jsonb_build_object('ok', true, 'documentId', v_doc);
end $$;

create or replace function public._annual_sign_resolve(p_token text, p_step_id text, out v_client_id text, out v_signing_id text, out v_reason text)
returns record language plpgsql stable security definer set search_path to 'public' as $$
declare c public.clients%rowtype; s public.onboarding_steps%rowtype;
begin
  if coalesce(p_token, '') = '' then v_reason := 'invalid'; return; end if;
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null or (c.portal_token_expires_at is not null and c.portal_token_expires_at < now()) then v_reason := 'invalid'; return; end if;
  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null or s.step_type <> 'annual_return' then v_reason := 'step_not_found'; return; end if;
  if s.published_at is null or not public.client_step_gate_open(c.id, s.published_at) then v_reason := 'not_published'; return; end if;
  if s.status in ('cancelled', 'locked') then v_reason := 'not_available'; return; end if;
  select id into v_signing_id from public.annual_return_signings where request_id = s.id and state <> 'superseded' order by version desc limit 1;
  if v_signing_id is null then v_reason := 'not_available'; return; end if;
  v_client_id := c.id;
end $$;
