-- ════════════════════════════════════════════════════════════════════════════
-- 208 · טופס 6101 — מיפוי 2 (מיקום מדויק מול הגיאומטריה המודפסת)
-- ════════════════════════════════════════════════════════════════════════════
--
-- מדידת היישור מול הטופס המודפס (scripts/test-smart-form-6101.mjs) הזיזה את תיבות
-- ה-✗ לפנים הריבועים המודפסים והוסיפה קווי כתיבה — על **אותו קובץ** (אותה טביעה).
-- לפי הכלל «הזזת שדה ⇒ mappingVersion עולה»:
--   1. הרשם מחזיר מיפוי 2.
--   2. גרסת טיוטה (חדשה או נשמרת) מקבלת תמיד את המיפוי הנוכחי — לא מעתיקה את
--      הישן מהגרסה הקודמת (smart_form_new_revision העתיק את r.mapping_version).
--   3. נעילה קובעת את המיפוי הנוכחי ומכניסה אותו לטביעה; צילום ממיפוי אחר נדחה.
-- ‼ גרסה שכבר ננעלה/נחתמה נשארת עם המיפוי שלה. דף החתימה משווה את המיפוי של
--   הגרסה לקוד (PublicSmartFormSignPage), והשרת חוסם חתימה/קישור על גרסה כזו
--   (mapping_outdated) — גרסה נעולה ממיפוי 1 דורשת «גרסה חדשה» (הערכים נשמרים).

create or replace function public._smart_form_template(p_key text)
returns jsonb language sql immutable set search_path to 'public' as $$
  select case p_key
    when 'btl-6101' then jsonb_build_object(
      'version', '06.2026',
      'sha256', '79e4f387e851cf1a8218c52c4991321e9daae39f3c02f235aeaa3287c3d93754',
      'mappingVersion', 2,
      'title', 'דין וחשבון רב שנתי (6101) · ביטוח לאומי',
      'purposes', jsonb_build_array('multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'))
    else null end;
$$;

/** טיוטה = המיפוי הנוכחי של הקובץ (רק כשהטביעה היא של הקובץ הרשום). */
create or replace function public._smart_form_draft_mapping()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t jsonb := public._smart_form_template(new.template_key);
begin
  if new.state = 'draft' and t is not null and t->>'sha256' = new.template_sha256 then
    new.mapping_version := (t->>'mappingVersion')::int;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_smart_form_draft_mapping on public.smart_form_revisions;
create trigger trg_smart_form_draft_mapping
  before insert or update on public.smart_form_revisions
  for each row
  when (new.state = 'draft')
  execute function public._smart_form_draft_mapping();

-- טיוטות קיימות — מיפוי נוכחי (נעולות/חתומות לא נוגעים).
update public.smart_form_revisions set mapping_version = mapping_version where state = 'draft';

create or replace function public.smart_form_lock(p_filing_id text, p_revision int, p_snapshot jsonb, p_signers jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_signers jsonb := '[]'::jsonb;
  s jsonb;
  v_hash text;
  v_need_spouse boolean;
  v_req jsonb;
  v_att jsonb;
  v_reason text;
  v_map int;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state not in ('draft', 'review', 'waiting_client_info') then return jsonb_build_object('ok', false, 'error', 'not_lockable', 'state', f.state); end if;
  if p_revision is distinct from f.current_revision then return jsonb_build_object('ok', false, 'error', 'stale_revision'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if r.state <> 'draft' then return jsonb_build_object('ok', false, 'error', 'revision_locked'); end if;
  -- ‼ 208: המיפוי שננעל = המיפוי הנוכחי של הקובץ (לא זה שהועתק מגרסה קודמת). צילום
  -- שהופק בקוד עם מיפוי אחר (דפדפן שלא התרענן) ⇒ לא ננעל: מה שנחתם הוא מה שהוצג.
  v_map := (public._smart_form_template(f.template_key)->>'mappingVersion')::int;
  if (p_snapshot->'template'->>'mappingVersion') is not null
     and (p_snapshot->'template'->>'mappingVersion') is distinct from v_map::text then
    return jsonb_build_object('ok', false, 'error', 'mapping_outdated', 'mappingVersion', v_map);
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot->'data') <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_snapshot'); end if;
  if jsonb_typeof(p_snapshot->'blockers') = 'array' and jsonb_array_length(p_snapshot->'blockers') > 0 then
    return jsonb_build_object('ok', false, 'error', 'has_blockers');
  end if;

  -- ‼ «התחלתי» ו«חדלתי» באותו טופס — רק באישור מקצועי מפורש עם סיבה, שנרשמת
  -- ביומן. נאכף כאן ולא רק במסך: הצילום מהדפדפן אינו ראיה לאישור.
  v_reason := coalesce(trim(p_snapshot->'professional'->'startAndEnd'->>'reason'), '');
  if 'start' = any(f.purposes) and 'end' = any(f.purposes) and v_reason = '' then
    return jsonb_build_object('ok', false, 'error', 'professional_confirmation_required');
  end if;

  -- ‼ אסמכתאות שנדרשות לפי מה שננעל (למשל דיווח למפרע) נרשמות על ההגשה כאן,
  -- עם lockedRequirement — ו«הוגש» נחסם עד שצורפו (smart_form_advance).
  -- אסמכתא קיימת עם אותו מפתח שומרת את המסמך שצורף לה.
  v_req := case when jsonb_typeof(p_snapshot->'requiredAttachments') = 'array' then p_snapshot->'requiredAttachments' else '[]'::jsonb end;
  if exists (select 1 from jsonb_array_elements(v_req) x
              where coalesce(x->>'key', '') = '' or coalesce(x->>'label', '') = '' or jsonb_typeof(x->'required') is distinct from 'boolean') then
    return jsonb_build_object('ok', false, 'error', 'invalid_snapshot');
  end if;
  select coalesce(jsonb_agg(t.x), '[]'::jsonb) into v_att from (
    select case
             when req.x is null then cur.x
             else coalesce(cur.x, '{}'::jsonb) || jsonb_build_object(
               'key', req.x->>'key', 'label', req.x->>'label',
               'required', (req.x->>'required')::boolean or coalesce((cur.x->>'required')::boolean, false),
               'lockedRequirement', (req.x->>'required')::boolean or coalesce((cur.x->>'lockedRequirement')::boolean, false))
           end as x
      from (select a as x from jsonb_array_elements(f.attachments) a) cur
      full join (select a as x from jsonb_array_elements(v_req) a) req on cur.x->>'key' = req.x->>'key'
  ) t;

  v_need_spouse := 'spouse_in_business' = any(f.purposes);
  for s in select * from jsonb_array_elements(coalesce(p_signers, '[]'::jsonb)) loop
    if s->>'role' not in ('client', 'spouse') then return jsonb_build_object('ok', false, 'error', 'bad_signer'); end if;
    if coalesce(trim(s->>'name'), '') = '' then return jsonb_build_object('ok', false, 'error', 'signer_name_required', 'role', s->>'role'); end if;
    v_signers := v_signers || jsonb_build_array(jsonb_build_object(
      'role', s->>'role', 'name', trim(s->>'name'), 'idNumber', s->>'idNumber',
      'required', (s->>'role' = 'client') or v_need_spouse, 'status', 'pending'));
  end loop;
  if not exists (select 1 from jsonb_array_elements(v_signers) x where x->>'role' = 'client') then
    return jsonb_build_object('ok', false, 'error', 'client_signer_required');
  end if;
  if v_need_spouse and not exists (select 1 from jsonb_array_elements(v_signers) x where x->>'role' = 'spouse') then
    return jsonb_build_object('ok', false, 'error', 'spouse_signer_required');
  end if;

  -- ‼ הטביעה מחושבת בשרת: jsonb מנורמל ⇒ אותו תוכן, אותה טביעה.
  v_hash := encode(sha256(convert_to(r.template_sha256 || '|' || v_map::text || '|'
                   || array_to_string(f.purposes, ',') || '|' || (p_snapshot->'data')::text, 'UTF8')), 'hex');

  update public.smart_form_revisions
     set state = 'locked', snapshot = p_snapshot, content_sha256 = v_hash, signers = v_signers, mapping_version = v_map,
         signatures = '{}'::jsonb, sign_tokens = '{}'::jsonb, locked_at = now(), purposes = f.purposes
   where id = r.id;
  update public.smart_form_filings set state = 'awaiting_signatures', missing_info = null, attachments = v_att, updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'locked',
    jsonb_build_object('contentSha256', v_hash,
      'signers', (select jsonb_agg(x->>'role') from jsonb_array_elements(v_signers) x where (x->>'required')::boolean),
      'requiredAttachments', (select jsonb_agg(x->>'key') from jsonb_array_elements(v_req) x where (x->>'required')::boolean))
    || case when v_reason <> '' then jsonb_build_object('professionalStartAndEnd', v_reason) else '{}'::jsonb end);
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'contentSha256', v_hash);
end;
$$;

create or replace function public.smart_form_capture_signature(
  p_filing_id text, p_revision int, p_role text, p_png text, p_content_sha256 text, p_attestation text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_found boolean := false;
  v_signers jsonb := '[]'::jsonb;
  s jsonb;
  v_all boolean;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state <> 'awaiting_signatures' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_signatures', 'state', f.state); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if p_revision is distinct from r.revision or r.state <> 'locked' then return jsonb_build_object('ok', false, 'error', 'stale_revision'); end if;
  -- ‼ 208: גרסה שננעלה במיפוי אחר מהנוכחי מצוירת אחרת ממה שננעל — לא חותמים עליה.
  if r.mapping_version is distinct from (public._smart_form_template(f.template_key)->>'mappingVersion')::int then
    return jsonb_build_object('ok', false, 'error', 'mapping_outdated');
  end if;
  -- ‼ החותם חותם על מה שראה: הטביעה שהמסך הציג חייבת להיות הטביעה הנעולה.
  if p_content_sha256 is distinct from r.content_sha256 then return jsonb_build_object('ok', false, 'error', 'content_changed'); end if;
  if not public._smart_form_png_ok(p_png) then return jsonb_build_object('ok', false, 'error', 'bad_signature_image'); end if;
  if coalesce(trim(p_attestation), '') = '' then return jsonb_build_object('ok', false, 'error', 'attestation_required'); end if;

  for s in select * from jsonb_array_elements(r.signers) loop
    if s->>'role' = p_role then
      if s->>'status' = 'signed' then return jsonb_build_object('ok', false, 'error', 'already_signed'); end if;
      v_found := true;
      s := s || jsonb_build_object('status', 'signed', 'signedAt', now(), 'method', 'in_office', 'attestedBy', auth.uid(), 'attestation', p_attestation);
    end if;
    v_signers := v_signers || jsonb_build_array(s);
  end loop;
  if not v_found then return jsonb_build_object('ok', false, 'error', 'unknown_signer'); end if;

  update public.smart_form_revisions
     set signers = v_signers,
         signatures = signatures || jsonb_build_object(p_role, jsonb_build_object('png', p_png, 'signedAt', now(), 'method', 'in_office')),
         sign_tokens = sign_tokens - p_role
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'signature_captured',
    jsonb_build_object('role', p_role, 'method', 'in_office', 'contentSha256', r.content_sha256));
  v_all := public._smart_form_after_signature(r.id);
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'allSigned', v_all);
end;
$$;

create or replace function public.smart_form_issue_sign_link(p_filing_id text, p_revision int, p_role text, p_days int default 14)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_exp timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_days, 14), 30)));
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if f.state <> 'awaiting_signatures' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_signatures'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if p_revision is distinct from r.revision or r.state <> 'locked' then return jsonb_build_object('ok', false, 'error', 'stale_revision'); end if;
  -- ‼ 208: גרסה שננעלה במיפוי אחר מהנוכחי מצוירת אחרת ממה שננעל — לא חותמים עליה.
  if r.mapping_version is distinct from (public._smart_form_template(f.template_key)->>'mappingVersion')::int then
    return jsonb_build_object('ok', false, 'error', 'mapping_outdated');
  end if;
  if not exists (select 1 from jsonb_array_elements(r.signers) s where s->>'role' = p_role and s->>'status' <> 'signed') then
    return jsonb_build_object('ok', false, 'error', 'no_pending_signer');
  end if;
  -- ‼ נשמרת רק הטביעה של הטוקן; הקישור הקודם לאותו תפקיד מתבטל.
  update public.smart_form_revisions
     set sign_tokens = sign_tokens || jsonb_build_object(p_role, jsonb_build_object(
           'hash', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'expiresAt', v_exp, 'issuedAt', now()))
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'office', 'sign_link_issued',
    jsonb_build_object('role', p_role, 'expiresAt', v_exp));
  return jsonb_build_object('ok', true, 'token', v_token, 'expiresAt', v_exp);
end;
$$;

create or replace function public.submit_smart_form_signature(p_token text, p_png text, p_content_sha256 text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  x record;
  r public.smart_form_revisions%rowtype;
  f public.smart_form_filings%rowtype;
  v_signers jsonb := '[]'::jsonb;
  s jsonb;
  v_all boolean;
begin
  select * into x from public._smart_form_by_token(p_token);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'reason', x.v_reason); end if;
  select * into r from public.smart_form_revisions where id = (x.r).id for update;
  select * into f from public.smart_form_filings where id = r.filing_id for update;
  if f.state <> 'awaiting_signatures' or r.state <> 'locked' then return jsonb_build_object('ok', false, 'reason', 'not_signable'); end if;
  -- ‼ 208: גרסה שננעלה במיפוי אחר מהנוכחי מצוירת אחרת ממה שננעל — לא חותמים עליה.
  if r.mapping_version is distinct from (public._smart_form_template(f.template_key)->>'mappingVersion')::int then
    return jsonb_build_object('ok', false, 'reason', 'mapping_outdated');
  end if;
  if p_content_sha256 is distinct from r.content_sha256 then return jsonb_build_object('ok', false, 'reason', 'content_changed'); end if;
  if p_consent is not true then return jsonb_build_object('ok', false, 'reason', 'consent_required'); end if;
  if not public._smart_form_png_ok(p_png) then return jsonb_build_object('ok', false, 'reason', 'bad_signature_image'); end if;

  for s in select * from jsonb_array_elements(r.signers) loop
    if s->>'role' = x.v_role then
      if s->>'status' = 'signed' then return jsonb_build_object('ok', true, 'alreadySigned', true); end if;
      s := s || jsonb_build_object('status', 'signed', 'signedAt', now(), 'method', 'remote_link');
    end if;
    v_signers := v_signers || jsonb_build_array(s);
  end loop;

  update public.smart_form_revisions
     set signers = v_signers,
         signatures = signatures || jsonb_build_object(x.v_role, jsonb_build_object('png', p_png, 'signedAt', now(), 'method', 'remote_link')),
         sign_tokens = sign_tokens - x.v_role
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, x.v_role, 'signature_captured',
    jsonb_build_object('role', x.v_role, 'method', 'remote_link', 'contentSha256', r.content_sha256));
  v_all := public._smart_form_after_signature(r.id);
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'allSigned', v_all);
end;
$$;

revoke all on function public._smart_form_template(text) from public, anon, authenticated;
revoke all on function public._smart_form_draft_mapping() from public, anon, authenticated;
revoke all on function public.smart_form_lock(text, int, jsonb, jsonb) from public, anon;
grant execute on function public.smart_form_lock(text, int, jsonb, jsonb) to authenticated, service_role;

select public.assert_domain_function_invariants();
