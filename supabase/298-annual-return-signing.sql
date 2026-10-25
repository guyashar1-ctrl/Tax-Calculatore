-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- 298 · חתימת הלקוח על סט הדוח השנתי — בדף האישי (25.10.2026)
-- ‼ נכתב כ-297 והוחל כך בייצור (25.10); שם הקובץ עבר ל-298 בגלל 297-shaam-annual-certificates. הסימונים «297 · …»
--   בגופי הפונקציות נשארים כמו שהם — בדיקת «כבר הוחל» נשענת עליהם.
-- ההמחשה שגיא אישר: docs/proposals/2026-10-25-annual-return-signing.html · התוכנית: PLAN-GUIDED-RETURN-PREP §2.10
--
--   ‼ רק הלקוח חותם (ובדוח משותף — גם בן/בת הזוג, כל אחד בנפרד). המשרד לא חותם; «שליחה לחתימה» היא האישור שלו.
--   ‼ מה נחתם: הצילום (snapshot) של עמוד הריכוז, 1301 והנספחים — כמו שהמשרד ראה ברגע השליחה. הטביעה (content_sha256)
--     מחושבת כאן, והחתימה מתקבלת רק עם אותה טביעה ⇒ אם המשרד שלח מחדש בינתיים — «content_changed».
--   ‼ «נחתם» = כל החותמים חתמו, והחתימות שמורות כאן (לא טענה של הדפדפן). שליחה מחדש ⇒ גרסה חדשה; הקודמת «הוחלפה» ונשמרת.
--   ‼ הפריט בדף: ענף 'annual_return' ב-_portal_step_items (עוגן שורה אחת, פעם אחת). השלב מתפרסם בשליחה הראשונה
--     (published_at) — כך הוא נכנס לשער הדף ולמייל הדף הרגיל; אין כאן מייל.
--   1. annual_return_signings — גרסה לכל שליחה; קריאה לבעלים בלבד, כתיבה רק דרך הפונקציות.
--   2. annual_return_send_for_signing / annual_return_store_signed — המשרד.
--   3. portal_annual_return_get / portal_annual_return_sign — הדף האישי (anon, טוקן הדף, פרסום ושער).
--   4. ענף בדף + רשימת ההיתר של anon.
-- ‼ החזרה: scripts/sql/298/rollback-298.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.annual_returns') is null then raise exception '297: חסרה annual_returns (233)'; end if;
  if not exists (select 1 from pg_proc where proname = '_portal_step_items') then raise exception '297: חסרה _portal_step_items'; end if;
  if not exists (select 1 from pg_proc where proname = '_smart_form_png_ok') then raise exception '297: חסרה _smart_form_png_ok (206)'; end if;
end
$guard$;

-- ── 1 · הטבלה ──
create table if not exists public.annual_return_signings (
  id                 text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id            uuid not null references auth.users(id) on delete cascade,
  client_id          text not null references public.clients(id) on delete cascade,
  request_id         text not null references public.onboarding_steps(id) on delete cascade,
  tax_year           int  not null,
  version            int  not null,
  state              text not null default 'awaiting' check (state in ('awaiting', 'signed', 'superseded')),
  snapshot           jsonb not null,
  content_sha256     text not null,
  signers            jsonb not null,
  signatures         jsonb not null default '{}'::jsonb,
  signed_document_id text,
  signed_pdf_sha256  text,
  sent_by            uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  signed_at          timestamptz,
  superseded_at      timestamptz,
  unique (request_id, version)
);
create unique index if not exists annual_return_signings_one_live on public.annual_return_signings (request_id) where state <> 'superseded';
create index if not exists annual_return_signings_client_idx on public.annual_return_signings (client_id, tax_year);
alter table public.annual_return_signings enable row level security;
drop policy if exists annual_return_signings_owner_read on public.annual_return_signings;
create policy annual_return_signings_owner_read on public.annual_return_signings for select to authenticated using (user_id = auth.uid() and public.is_authorized());

-- ── 2 · המשרד: שליחה לחתימה ──
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

-- ── המשרד: הקובץ החתום (נבנה בדפדפן מהצילום והחתימות, והועלה לתיקיית הלקוח) — רשומת המסמך נוצרת כאן, פעם אחת ──
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

-- ── 3 · הדף האישי ──
-- טוקן הדף ⇒ הלקוח; השלב שלו, מסוג «דוח שנתי», פורסם והשער פתוח; הגרסה החיה (לא «הוחלפה»)
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

create or replace function public.portal_annual_return_get(p_token text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v record; r public.annual_return_signings%rowtype;
begin
  select * into v from public._annual_sign_resolve(p_token, p_step_id);
  if v.v_reason is not null then return jsonb_build_object('ok', false, 'error', v.v_reason); end if;
  select * into r from public.annual_return_signings where id = v.v_signing_id;
  return jsonb_build_object('ok', true, 'state', r.state, 'version', r.version, 'taxYear', r.tax_year, 'contentSha256', r.content_sha256, 'snapshot', r.snapshot,
    'signers', (select coalesce(jsonb_agg(jsonb_build_object('role', x->>'role', 'name', x->>'name',
                  'signed', r.signatures ? (x->>'role'), 'signedAt', r.signatures #>> array[x->>'role', 'signedAt'])), '[]'::jsonb)
                from jsonb_array_elements(r.signers) x));
end $$;

create or replace function public.portal_annual_return_sign(p_token text, p_step_id text, p_role text, p_png text, p_content_sha256 text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; r public.annual_return_signings%rowtype; v_all boolean;
begin
  if p_consent is distinct from true then return jsonb_build_object('ok', false, 'error', 'consent_required'); end if;
  select * into v from public._annual_sign_resolve(p_token, p_step_id);
  if v.v_reason is not null then return jsonb_build_object('ok', false, 'error', v.v_reason); end if;
  select * into r from public.annual_return_signings where id = v.v_signing_id for update;
  if r.state = 'signed' then return jsonb_build_object('ok', false, 'error', 'already_signed', 'allSigned', true); end if;
  if r.content_sha256 is distinct from p_content_sha256 then return jsonb_build_object('ok', false, 'error', 'content_changed'); end if;
  if not exists (select 1 from jsonb_array_elements(r.signers) x where x->>'role' = p_role) then return jsonb_build_object('ok', false, 'error', 'not_a_signer'); end if;
  if r.signatures ? p_role then return jsonb_build_object('ok', false, 'error', 'already_signed', 'allSigned', false); end if;
  if not public._smart_form_png_ok(p_png) then return jsonb_build_object('ok', false, 'error', 'bad_signature'); end if;
  r.signatures := r.signatures || jsonb_build_object(p_role, jsonb_build_object('png', p_png, 'signedAt', now(), 'consent', true));
  v_all := not exists (select 1 from jsonb_array_elements(r.signers) x where not (r.signatures ? (x->>'role')));
  update public.annual_return_signings set signatures = r.signatures,
    state = case when v_all then 'signed' else state end, signed_at = case when v_all then now() else signed_at end
   where id = r.id;
  return jsonb_build_object('ok', true, 'allSigned', v_all);
end $$;

-- ── 4 · הפריט בדף: ענף 'annual_return' (לפני 'tax_estimate') ──
do $p297$
declare
  v_def text;
  v_nl  text;
  a1 text := E'    when ''tax_estimate'' then\n';
  n1 text := E'    when ''annual_return'' then\n'
          || E'      -- 297 · חתימה על סט הדוח השנתי: «לחתימה» כל עוד חסרה חתימה; «נחתם» כשכולם חתמו\n'
          || E'      v_items := v_items || coalesce((select jsonb_build_array(case when g.state = ''signed''\n'
          || E'          then jsonb_build_object(''bucket'',''done'',''key'',''annualsign_''||s.id,''label'',''הדוח השנתי '' || g.tax_year || '' · נחתם'')\n'
          || E'          else jsonb_build_object(''bucket'',''action'',''key'',''annualsign_''||s.id,''label'',''הדוח השנתי '' || g.tax_year || '' — לחתימה'',\n'
          || E'            ''sub'', case when jsonb_array_length(g.signers) > 1 and g.signatures <> ''{}''::jsonb then ''נשארה חתימה אחת'' when jsonb_array_length(g.signers) > 1 then ''שניכם חותמים · כל אחד בנפרד'' else ''עוברים על הדוח וחותמים'' end,\n'
          || E'            ''actionKind'',''annualSign'',''actionValue'', s.id) end)\n'
          || E'        from public.annual_return_signings g where g.request_id = s.id and g.state <> ''superseded'' order by g.version desc limit 1), ''[]''::jsonb);\n\n';
begin
  select pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure) into v_def;
  if position('297 · חתימה על סט הדוח השנתי' in v_def) > 0 then raise notice '297: _portal_step_items — כבר הוחל'; return; end if;
  -- ‼ בייצור הגוף מעורב (חלקו CRLF וחלקו LF) — העוגן בצורה שמופיעה בו בדיוק פעם אחת
  v_nl := case when (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) = 1 then E'\n' else E'\r\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '297: עוגן tax_estimate ב-_portal_step_items לא נמצא פעם אחת'; end if;
  if position('when ''annual_return'' then' in v_def) > 0 then raise exception '297: ענף annual_return כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p297$;

-- ── הרשאות ──
revoke all on function public.annual_return_send_for_signing(text, jsonb, jsonb) from public, anon;
revoke all on function public.annual_return_store_signed(text, text, int, text) from public, anon;
revoke all on function public._annual_sign_resolve(text, text) from public, anon, authenticated;
revoke all on function public.portal_annual_return_get(text, text) from public;
revoke all on function public.portal_annual_return_sign(text, text, text, text, text, boolean) from public;
grant execute on function public.annual_return_send_for_signing(text, jsonb, jsonb) to authenticated;
grant execute on function public.annual_return_store_signed(text, text, int, text) to authenticated;
-- ‼ גם authenticated: שרת הפיתוח ב-staging מחובר כרו״ח (כמו portal_smart_form_*)
grant execute on function public.portal_annual_return_get(text, text) to anon, authenticated;
grant execute on function public.portal_annual_return_sign(text, text, text, text, text, boolean) to anon, authenticated;

-- ── רשימת ההיתר של anon (אותה תבנית כמו 285) ──
do $$
declare
  v_def  text := pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure);
  v_head int  := position('v_anon_ok text[] := array[' in v_def);
  v_pos  int;
begin
  if position('''portal_annual_return_sign''' in v_def) > 0 then return; end if;
  if v_head = 0 then raise exception '297: v_anon_ok not found'; end if;
  v_pos := v_head + position(E'\n  ];' in substr(v_def, v_head)) - 1;
  if v_pos < v_head then raise exception '297: end of v_anon_ok not found'; end if;
  execute substr(v_def, 1, v_pos - 1)
    || E',\n    -- 297 · חתימת הלקוח על סט הדוח השנתי בדף האישי (טוקן הדף, פרסום ושער)'
    || E'\n    ''portal_annual_return_get'', ''portal_annual_return_sign'''
    || substr(v_def, v_pos);
end;
$$;

-- ── אימות ──
do $$
begin
  if position('''portal_annual_return_sign''' in pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure)) = 0 then raise exception '297: allowlist not updated'; end if;
  if position('297 · חתימה על סט הדוח השנתי' in pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure)) = 0 then raise exception '297: portal branch missing'; end if;
end;
$$;
