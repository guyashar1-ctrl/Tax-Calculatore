-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- 303 · הצהרת הון עד הסוף: סכום לכל סעיף ב-1219, וחתימת הלקוח בדף האישי (26.10.2026)
-- ‼ נכתב כ-300 והוחל כך בייצור (26.10); שם הקובץ עבר ל-303 בגלל 300-certificate-message. סימוני «300 · …» בגופים נשארו — «כבר הוחל» נשען עליהם.
-- גיא (26.10): «לבצע ולהשלים עד הסוף את שלושת התהליכים — דוח שנתי, הצהרת הון והערכת מס».
--   1. _tax_year_items: שמונה פריטי סכום חדשים (סעיפי חלק א׳ שלא היה להם סכום) — wealthDeclaration/engine.ts SECTIONS;
--      ובהערכת מס — estimate.applied («בוצע בפועל», המשרד מסמן).
--      ‼ נבנה מהרשימה שבמסד (לא מהעתק): הרשימה הקיימת + החדשים; פריט קיים לא משתנה.
--   2. החתימה של 298 חלה גם על הצהרת הון (step_type 'wealth_declaration'): שליחה, טוקן הדף, הקובץ החתום (תווית «הצהרת הון»).
--   4. הערכת מס: כותרת בקשת־הבת בדף — «הערכת מס {שנה}».
--   3. הפריט בדף: ענף 'wealth_declaration' — «הצהרת ההון ליום … — לחתימה» / «נחתמה» (לפני הענף של הדוח השנתי).
-- ‼ נוצר ב-scripts/sql/303/build.mjs (גופי החתימה נלקחים מ-298). החזרה: scripts/sql/303/rollback-303.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · פריטי הסכום החדשים ──
do $w300$
declare
  v_cur jsonb := public._tax_year_items();
  v_add jsonb := '{"wealth.realEstateAbroad.total":"amount","wealth.crypto.total":"amount","wealth.loansGiven.total":"amount","wealth.vehicles.total":"amount","wealth.valuables.total":"amount","wealth.homeContents.total":"amount","wealth.other.total":"amount","wealth.loansReceived.total":"amount","estimate.applied":"detail"}'::jsonb;
begin
  if v_cur @> v_add then raise notice '300: _tax_year_items — כבר הוחל'; return; end if;
  if exists (select 1 from jsonb_each_text(v_add) a where v_cur ? a.key and v_cur->>a.key <> a.value) then raise exception '300: פריט קיים בסוג אחר'; end if;
  execute format('create or replace function public._tax_year_items() returns jsonb language sql immutable set search_path = public as $f$ select %L::jsonb $f$', (v_cur || v_add)::text);
end
$w300$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

-- ── 2 · החתימה — גם להצהרת הון ──
create or replace function public.annual_return_send_for_signing(p_request_id text, p_snapshot jsonb, p_signers jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
  c public.clients%rowtype;
  v_ver int; v_id text; v_sha text; v_roles text[];
begin
  select * into s from public.onboarding_steps where id = p_request_id;
  if s.id is null or s.step_type not in ('annual_return', 'wealth_declaration') then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
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
declare r public.annual_return_signings%rowtype; c public.clients%rowtype; v_label text; v_doc text; v_type text; v_asof text; v_name text;
begin
  select * into r from public.annual_return_signings where id = p_signing_id;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(r.client_id);
  if r.state <> 'signed' then return jsonb_build_object('ok', false, 'error', 'not_signed'); end if;
  -- ‼ בלי החלפה שקטה: מה שכבר צורף — נשאר
  if r.signed_document_id is not null then return jsonb_build_object('ok', true, 'documentId', r.signed_document_id, 'already', true); end if;
  if coalesce(p_storage_path, '') not like (r.user_id::text || '/' || r.client_id || '/%') then return jsonb_build_object('ok', false, 'error', 'bad_path'); end if;
  if coalesce(p_pdf_sha256, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'bad_sha'); end if;
  select step_type, payload->>'asOfDate' into v_type, v_asof from public.onboarding_steps where id = r.request_id;
  -- 300 · הצהרת הון — תווית משלה; הדוח השנתי — כמו ב-298
  v_name := case when v_type = 'wealth_declaration' then 'הצהרת הון' else 'טופס 1301' end;
  insert into public.document_labels (user_id, name) values (r.user_id, v_name) on conflict (user_id, name) do nothing;
  select id into v_label from public.document_labels where user_id = r.user_id and name = v_name;
  v_doc := replace(gen_random_uuid()::text, '-', '');
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, description, notes, label_id, uploaded_at)
  values (v_doc, r.user_id, r.client_id, p_storage_path,
          case when v_type = 'wealth_declaration' then 'הצהרת-הון-' || coalesce(v_asof, r.tax_year::text) else 'דוח-שנתי-' || r.tax_year end
            || '-' || coalesce(nullif(btrim(c.last_name), ''), 'client') || '-חתום.pdf',
          'application/pdf', greatest(coalesce(p_file_size, 0), 0),
          case when v_type = 'wealth_declaration' then 'other' else 'form_1301' end, r.tax_year::text,
          case when v_type = 'wealth_declaration' then 'הצהרת ההון ליום ' || to_char(v_asof::date, 'DD.MM.YYYY') || ' — חתומה בדף האישי'
               else 'הדוח השנתי ' || r.tax_year || ' — חתום בדף האישי' end,
          'SHA-256 ' || p_pdf_sha256, v_label, now());
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
  if s.id is null or s.step_type not in ('annual_return', 'wealth_declaration') then v_reason := 'step_not_found'; return; end if;
  if s.published_at is null or not public.client_step_gate_open(c.id, s.published_at) then v_reason := 'not_published'; return; end if;
  if s.status in ('cancelled', 'locked') then v_reason := 'not_available'; return; end if;
  select id into v_signing_id from public.annual_return_signings where request_id = s.id and state <> 'superseded' order by version desc limit 1;
  if v_signing_id is null then v_reason := 'not_available'; return; end if;
  v_client_id := c.id;
end $$;

-- ── 3 · הפריט בדף: ענף 'wealth_declaration' (לפני 'annual_return') ──
do $p300$
declare
  v_def text;
  v_nl  text;
  a1 text := E'    when ''annual_return'' then\n';
  n1 text := E'    when ''wealth_declaration'' then\n'
          || E'      -- 300 · חתימה על הצהרת ההון: «לחתימה» כל עוד חסרה חתימה; «נחתמה» כשכולם חתמו\n'
          || E'      v_items := v_items || coalesce((select jsonb_build_array(case when g.state = ''signed''\n'
          || E'          then jsonb_build_object(''bucket'',''done'',''key'',''annualsign_''||s.id,''label'',''הצהרת ההון ליום '' || to_char((s.payload->>''asOfDate'')::date, ''DD.MM.YYYY'') || '' · נחתמה'')\n'
          || E'          else jsonb_build_object(''bucket'',''action'',''key'',''annualsign_''||s.id,''label'',''הצהרת ההון ליום '' || to_char((s.payload->>''asOfDate'')::date, ''DD.MM.YYYY'') || '' — לחתימה'',\n'
          || E'            ''sub'', case when jsonb_array_length(g.signers) > 1 and g.signatures <> ''{}''::jsonb then ''נשארה חתימה אחת'' when jsonb_array_length(g.signers) > 1 then ''שניכם חותמים · כל אחד בנפרד'' else ''עוברים על ההצהרה וחותמים'' end,\n'
          || E'            ''actionKind'',''annualSign'',''actionValue'', s.id) end)\n'
          || E'        from public.annual_return_signings g where g.request_id = s.id and g.state <> ''superseded'' order by g.version desc limit 1), ''[]''::jsonb);\n'
          || E'\n';
begin
  select pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure) into v_def;
  if position('300 · חתימה על הצהרת ההון' in v_def) > 0 then raise notice '300: _portal_step_items — כבר הוחל'; return; end if;
  -- ‼ בייצור הגוף מעורב (חלקו CRLF וחלקו LF) — העוגן בצורה שמופיעה בו בדיוק פעם אחת
  v_nl := case when (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) = 1 then E'\n' else E'\r\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '300: עוגן annual_return ב-_portal_step_items לא נמצא פעם אחת'; end if;
  if position('when ''wealth_declaration'' then' in v_def) > 0 then raise exception '300: ענף wealth_declaration כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p300$;

-- ── 4 · הערכת מס: כותרת בקשת־הבת בדף — «הערכת מס 2026», לא «השלמת מידע לשנת 2026» (כמו «הדוח השנתי» ב-262) ──
do $t300$
declare v_def text;
  a1 text := $blk$when par.step_type = 'annual_return' then 'הדוח השנתי ' || v_year /* 262 · כותרת */$blk$;
  n1 text := $blk$when par.step_type = 'tax_estimate' then 'הערכת מס ' || v_year /* 300 · כותרת */ when par.step_type = 'annual_return' then 'הדוח השנתי ' || v_year /* 262 · כותרת */$blk$;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('300 · כותרת' in v_def) > 0 then raise notice '300: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '300: עוגן הכותרת ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$t300$;

-- ── הרשאות (כמו 298) ──
revoke all on function public.annual_return_send_for_signing(text, jsonb, jsonb) from public, anon;
revoke all on function public.annual_return_store_signed(text, text, int, text) from public, anon;
revoke all on function public._annual_sign_resolve(text, text) from public, anon, authenticated;
grant execute on function public.annual_return_send_for_signing(text, jsonb, jsonb) to authenticated;
grant execute on function public.annual_return_store_signed(text, text, int, text) to authenticated;

-- ── אימות ──
do $$
begin
  if not public._tax_year_items() ? 'wealth.loansReceived.total' then raise exception '300: items not updated'; end if;
  if position('300 · כותרת' in pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure)) = 0 then raise exception '300: estimate title missing'; end if;
  if position('300 · חתימה על הצהרת ההון' in pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure)) = 0 then raise exception '300: portal branch missing'; end if;
  if public.assert_domain_function_invariants() <> 'ok' then raise exception '300: invariants'; end if;
end;
$$;
