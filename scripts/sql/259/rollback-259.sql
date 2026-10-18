-- חזרה מ-259: portal_smart_form_get כפי שהיה ב-247, והסרת שתי פונקציות השמירה מהדף.
-- ‼ קבצים חתומים שכבר נשמרו נשארים במסמכים ובשיוך שלהם — זו היסטוריה, לא מוחקים.
begin;
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
    'signedAt', r.signed_at);
end;
$$;
drop function if exists public.portal_smart_form_signed_pdf_target(text, text);
drop function if exists public.portal_smart_form_store_signed_pdf(text, text, int, text, bigint);
commit;
