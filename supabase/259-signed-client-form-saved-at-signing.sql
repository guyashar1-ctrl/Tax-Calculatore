-- 259 · הטופס החתום נשמר במסמכי הלקוח ברגע שהלקוח חותם (17.10.2026)
--
-- גיא, 17.10.2026: «אני רוצה שהמסמכים כמו אלה ישמרו במסמכים של הלקוח».
-- עד עכשיו הקובץ החתום (821/4440) נבנה רק כשהמשרד פתח את הטופס ב«בקשות» —
-- עד אז הלקוח כבר חתם, והמסמך לא היה במסמכים.
--
-- ‼ עכשיו הדף האישי בונה את הקובץ ברגע החתימה (מאותם נתונים, אותה תבנית ואותה חתימה
--   שהלקוח ראה וחתם עליהם) ושולח אותו ל-portal-signed-form. שתי הפונקציות כאן הן
--   הצד של השרת: לאן לשמור, ושמירה+שיוך אטומיים. service_role בלבד — הדף לא קורא להן ישירות.
-- ‼ המשרד ממשיך לבנות את הקובץ כגיבוי (ClientFormPanel) אם השמירה מהדף לא קרתה.
-- ‼ בלי חותמת המשרד (גיא: «אם ארצה, אוסיף אותה ידנית»); שם המייצג ותאריך נשארים —
--   ולכן portal_smart_form_get מחזיר גם repName.
--
-- חזרה: scripts/sql/259/rollback-259.sql

-- ── 1 · הדף האישי מקבל את שם המייצג (להצהרת המייצג בקובץ החתום) ──────────────────────
-- זהה לגרסת 247 (נבדק מול הייצור וה-staging ב-17.10), פלוס 'repName'.
create or replace function public.portal_smart_form_get(p_token text, p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare x record; f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; c public.clients%rowtype; p public.profiles%rowtype; t jsonb;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  update public.clients set portal_token_last_used_at = now() where id = x.v_client_id;
  select * into f from public.smart_form_filings where id = x.v_filing_id;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  select * into c from public.clients where id = f.client_id;
  select * into p from public.profiles where id = f.user_id;
  t := public._smart_form_template(f.template_key);
  return jsonb_build_object('ok', true, 'templateKey', f.template_key, 'title', t->>'clientTitle', 'authority', t->>'authority',
    'firmName', coalesce(p.firm_name, ''), 'state', f.state, 'revisionState', r.state,
    'card', public._scf_card(c), 'answers', coalesce(r.values->'answers', '{}'::jsonb),
    'data', public._scf_data(f.id), 'contentSha256', r.content_sha256,
    'mappingVersion', coalesce(r.mapping_version, (t->>'mappingVersion')::int),
    'activeMappingVersion', (t->>'mappingVersion')::int,
    'mapping', public._smart_form_mapping_fields(f.template_key, coalesce(r.mapping_version, (t->>'mappingVersion')::int)),
    -- ‼ רק החתימה של הלקוח עצמו, ורק אחרי שחתם — כדי להציג לו את הטופס החתום.
    'signature', case when r.state = 'signed' then r.signatures->'client'->'png' end,
    'signedAt', r.signed_at,
    -- 259 · «הצהרת המייצג» בקובץ החתום שהדף בונה (אותו מקור כמו במשרד: profiles.full_name).
    'repName', btrim(coalesce(p.full_name, '')));
end;
$$;

-- ── 2 · לאן לשמור (לפני ההעלאה) ────────────────────────────────────────────────────────
create or replace function public.portal_smart_form_signed_pdf_target(p_token text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare x record; f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; v_doc text;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  select * into f from public.smart_form_filings where id = x.v_filing_id;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  if r.id is null or r.state <> 'signed' then return jsonb_build_object('ok', false, 'error', 'not_signed'); end if;
  if r.signed_document_id is not null then return jsonb_build_object('ok', true, 'alreadyStored', true); end if;
  -- ‼ אותו מזהה ואותו נתיב שהמשרד היה נותן (scf-<filing>-r<rev>) — קובץ אחד, לא שניים.
  v_doc := 'scf-' || f.id || '-r' || r.revision;
  return jsonb_build_object('ok', true, 'revision', r.revision, 'documentId', v_doc,
    'storagePath', f.user_id::text || '/' || f.client_id || '/' || v_doc);
end;
$$;

-- ── 3 · רשומת המסמך + שיוך לגרסה החתומה, באותה טרנזקציה ─────────────────────────────────
create or replace function public.portal_smart_form_store_signed_pdf(p_token text, p_step_id text, p_revision int, p_pdf_sha256 text, p_file_size bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  x record; f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; c public.clients%rowtype;
  v_doc text; v_path text; v_label_name text; v_label text; v_title text; v_num text; v_date date;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  select * into f from public.smart_form_filings where id = x.v_filing_id;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = p_revision for update;
  if r.id is null or r.revision <> f.current_revision or r.state <> 'signed' then
    return jsonb_build_object('ok', false, 'error', 'not_signed');
  end if;
  if p_pdf_sha256 is null or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'bad_hash'); end if;
  v_doc := 'scf-' || f.id || '-r' || r.revision;
  -- ‼ כבר נשמר (המשרד הקדים, או ניסיון קודם) — לא מחליפים קובץ חתום בשקט.
  if r.signed_document_id is not null then
    if r.signed_document_id = v_doc and r.signed_pdf_sha256 = p_pdf_sha256 then return jsonb_build_object('ok', true, 'unchanged', true); end if;
    return jsonb_build_object('ok', false, 'error', 'already_attached');
  end if;

  select * into c from public.clients where id = f.client_id;
  v_path := f.user_id::text || '/' || f.client_id || '/' || v_doc;
  v_num := substring(f.template_key from '[0-9]+');
  v_title := split_part(coalesce(public._smart_form_template(f.template_key)->>'title', 'טופס'), ' · ', 1);
  v_date := (coalesce(r.signed_at, now()) at time zone 'Asia/Jerusalem')::date;
  -- אותה קטגוריה ואותה תווית שהמשרד נותן (ClientFormPanel / ensureSystemLabel).
  v_label_name := case when f.template_key = 'vat-821' then 'מסמך עסקי' else 'אחר' end;
  insert into public.document_labels (user_id, name) values (f.user_id, v_label_name) on conflict (user_id, name) do nothing;
  select id into v_label from public.document_labels where user_id = f.user_id and name = v_label_name;

  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year,
                                description, notes, label_id, uploaded_at)
  values (v_doc, f.user_id, f.client_id, v_path,
          coalesce(v_num, 'form') || '-' || coalesce(nullif(btrim(c.last_name), ''), 'client') || '-' || to_char(v_date, 'YYYY-MM-DD') || '.pdf',
          'application/pdf', greatest(coalesce(p_file_size, 0), 0),
          case when f.template_key = 'vat-821' then 'business_document' else 'other' end,
          to_char(v_date, 'YYYY'), v_title || ' — חתום בדף האישי', 'SHA-256 ' || p_pdf_sha256, v_label, now())
  on conflict (id) do update
     set storage_path = excluded.storage_path, file_size = excluded.file_size, notes = excluded.notes, uploaded_at = excluded.uploaded_at
   where public.documents.user_id = f.user_id and public.documents.client_id = f.client_id;
  if not exists (select 1 from public.documents d where d.id = v_doc and d.user_id = f.user_id and d.client_id = f.client_id) then
    return jsonb_build_object('ok', false, 'error', 'document_not_found');
  end if;

  update public.smart_form_revisions set signed_document_id = v_doc, signed_pdf_sha256 = p_pdf_sha256 where id = r.id;
  update public.smart_form_filings set updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'client', 'signed_pdf_stored',
    jsonb_build_object('documentId', v_doc, 'sha256', p_pdf_sha256, 'builtBy', 'client_page'));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'documentId', v_doc);
end;
$$;

revoke all on function public.portal_smart_form_signed_pdf_target(text, text) from public, anon, authenticated;
revoke all on function public.portal_smart_form_store_signed_pdf(text, text, int, text, bigint) from public, anon, authenticated;
grant execute on function public.portal_smart_form_signed_pdf_target(text, text) to service_role;
grant execute on function public.portal_smart_form_store_signed_pdf(text, text, int, text, bigint) to service_role;
