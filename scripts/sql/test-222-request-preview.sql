-- בדיקת 222 («צפייה» בבקשה) בתוך בקשה אחת שמסתיימת ב-raise — הכול מתבטל.
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום מייל לא נשלח (התור בלבד), ושום דבר לא נשמר.
-- הרצה: node scripts/staging-dryrun-flows.mjs --tests-only scripts/sql/test-222-request-preview.sql
-- (P.1 — זהות הדף לפני ואחרי — נבדקת בנפרד: scripts/qa-222-identity.mjs.)
--
-- P.2  דוגמה = אמת: אותו פריט בדף של לקוח שנוצרה לו בקשה בנתיב האמיתי, ובצפייה.
-- P.3  אין כתיבה: STABLE, ושום ספירה לא זזה אחרי הרבה קריאות.
-- P.4  הרשאות: anon, משתמש לא מורשה, תבנית של משרד אחר, ואף טוקן אמיתי בפלט.
-- P.5  קצוות: לא חוזרת, לא קיימת, משימה פנימית, וריאנט לא מוכר.

-- «אותו פריט»: בלי מה שנקבע לפי מזהה השלב (actionValue, stepId) ובלי המפתח שמכיל אותו (custom_<id>).
create or replace function pg_temp.n222(x jsonb) returns jsonb language sql immutable as $$
  select (x - 'actionValue' - 'stepId' - 'draft')
         || jsonb_build_object('key', regexp_replace(coalesce(x->>'key', ''), '^(custom_|authrep_).*', E'\\1*'))
$$;
-- הפריט במפתח k מתוך תשובה של הדף / הצפייה.
create or replace function pg_temp.item222(res jsonb, k text) returns jsonb language sql immutable as $$
  select pg_temp.n222(x) from jsonb_array_elements(res->'items') x where x->>'key' = k or (k = 'custom_*' and x->>'key' like 'custom\_%') limit 1
$$;
-- כל הפריטים (מנורמלים) — לפי מפתח, כדי להשוות קבוצה.
create or replace function pg_temp.items222(res jsonb, keys text[]) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(pg_temp.n222(x) order by x->>'key'), '[]'::jsonb)
    from jsonb_array_elements(res->'items') x where x->>'key' = any (keys)
$$;

do $test$
declare
  uid   uuid := '__USER__';
  other uuid := gen_random_uuid();
  office uuid := (select office_id from public.profiles where id = uid);
  sfx   text := substr(md5(random()::text), 1, 8);
  cR text := 'qa222r' || sfx;  eR text := 'qa222re' || sfx;  rqR text := 'qa222rq' || sfx;
  cT text := 'qa222t' || sfx;  eT text := 'qa222te' || sfx;
  cD text := 'qa222d' || sfx;  eD text := 'qa222de' || sfx;
  cC text := 'qa222c' || sfx;  eC text := 'qa222ce' || sfx;
  cG text := 'qa222g' || sfx;  eG text := 'qa222ge' || sfx;  qG text := 'qa222gq' || sfx;
  cX text;  eX text;  rX text;
  out   jsonb := '[]'::jsonb;
  res jsonb; prev jsonb; real jsonb; spec jsonb; v jsonb; r jsonb;
  sid text; sid2 text; seedId text; docId text := 'qa222doc';
  st jsonb; i int; vi int; vb boolean; vt text;
  composer jsonb;
  counts_before jsonb; counts_after jsonb;
  ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- ══ P.2א · אישור הייצוג באזור האישי (זוג) ══════════════════════════════════
  begin
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, spouse_first_name, business_name)
    values (cR, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'married', 'ישראלה', 'ישראלי ייעוץ (דוגמה)');
    insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eR, uid, cR, 'onboarding', now());
    insert into public.representation_requests (id, user_id, status, linked_client_id, onboarding_token, execution)
    values (rqR, uid, 'awaiting_authorities', cR, md5(rqR),
      '{"shaam":{"person:client":{"requestedSystems":["מע״מ"]},"person:spouse":{"requestedSystems":["מס הכנסה","מע״מ"]}}}'::jsonb);
    sid := public.ensure_rep_client_approval_step(cR);
    out := out || jsonb_build_object('t', 'P.2א.0 הכרטיס נוצר בנתיב האמיתי (ensure_rep_client_approval_step)', 'pass', sid is not null,
      'got', (select payload from public.onboarding_steps where id = sid));
    out := out || jsonb_build_object('t', 'P.2א.0ב מי מאשר ואת מה — מהשרת, כמו בדוגמת הזוג', 'pass',
      public._rep_approval_people(cR) = '[{"name":"ישראל","person":"client","systems":["מע״מ"]},{"name":"ישראלה","person":"spouse","systems":["מס הכנסה","מע״מ"]}]'::jsonb,
      'got', public._rep_approval_people(cR));

    real := public.build_client_portal(cR, 'live');
    prev := public.preview_request_sample(jsonb_build_object('persona', jsonb_build_object('couple', true),
      'rep', jsonb_build_object('approvals', 'couple'),
      'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'rep_client_approval'), 'status', 'pending'))));
    out := out || jsonb_build_object('t', 'P.2א.1 ממתין — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'rep_approval') is not null and pg_temp.item222(real, 'rep_approval') = pg_temp.item222(prev, 'rep_approval'),
      'got', jsonb_build_array(pg_temp.item222(real, 'rep_approval'), pg_temp.item222(prev, 'rep_approval')));

    -- «חובה» — שע״ם דורשת (shaam_require_client_approval → _rep_client_approval_required_payload)
    perform public.shaam_require_client_approval(cR);
    real := public.build_client_portal(cR, 'live');
    prev := public.preview_request_sample(jsonb_build_object('persona', jsonb_build_object('couple', true), 'rep', jsonb_build_object('approvals', 'couple'),
      'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'rep_client_approval'), 'status', 'pending', 'required', true))));
    out := out || jsonb_build_object('t', 'P.2א.2 חובה — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'rep_approval') is not null and pg_temp.item222(real, 'rep_approval') = pg_temp.item222(prev, 'rep_approval')
      and pg_temp.item222(prev, 'rep_approval')->>'label' = 'אישור הייצוג באזור האישי',
      'got', jsonb_build_array(pg_temp.item222(real, 'rep_approval'), pg_temp.item222(prev, 'rep_approval')));

    -- «אישרתי» — הלקוח הצהיר
    update public.onboarding_steps set payload = payload || '{"clientDeclaredAt":"2026-10-05T10:00:00Z"}'::jsonb where id = sid;
    real := public.build_client_portal(cR, 'live');
    prev := public.preview_request_sample(jsonb_build_object('persona', jsonb_build_object('couple', true), 'rep', jsonb_build_object('approvals', 'couple'),
      'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'rep_client_approval'), 'status', 'pending', 'required', true,
        'patch', jsonb_build_object('clientDeclaredAt', '2026-10-05T10:00:00Z')))));
    out := out || jsonb_build_object('t', 'P.2א.3 אחרי «אישרתי» — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'rep_approval')->>'bucket' = 'office' and pg_temp.item222(real, 'rep_approval') = pg_temp.item222(prev, 'rep_approval'),
      'got', jsonb_build_array(pg_temp.item222(real, 'rep_approval'), pg_temp.item222(prev, 'rep_approval')));

    update public.onboarding_steps set status = 'completed', completed_at = now() where id = sid;
    real := public.build_client_portal(cR, 'live');
    prev := public.preview_request_sample(jsonb_build_object('persona', jsonb_build_object('couple', true), 'rep', jsonb_build_object('approvals', 'couple'),
      'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'rep_client_approval'), 'status', 'completed', 'required', true,
        'patch', jsonb_build_object('clientDeclaredAt', '2026-10-05T10:00:00Z')))));
    out := out || jsonb_build_object('t', 'P.2א.4 הושלם — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'rep_approval')->>'bucket' = 'done' and pg_temp.item222(real, 'rep_approval') = pg_temp.item222(prev, 'rep_approval'),
      'got', jsonb_build_array(pg_temp.item222(real, 'rep_approval'), pg_temp.item222(prev, 'rep_approval')));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2א · אישור הייצוג', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.2ב · נוסח מוכן מהספרייה (תביעת המילואים) — נתיב היצירה של מסלול (_flow_item_spec → create_onboarding_request) ══
  begin
    select id into seedId from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null;
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
    values (cT, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'single');
    insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eT, uid, cT, 'onboarding', now());
    spec := public._flow_item_spec(uid, jsonb_build_object('ref', jsonb_build_object('kind', 'template', 'templateId', seedId)), false);
    r := public.create_onboarding_request(cT, spec->>'stepType', spec->'payload', null, null, true, false, spec->>'owner', null);
    sid := r->>'stepId';
    out := out || jsonb_build_object('t', 'P.2ב.0 נוצרה בנתיב האמיתי', 'pass', coalesce((r->>'ok')::boolean, false) and sid is not null, 'got', r);
    real := public.build_client_portal(cT, 'live');
    prev := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object(
      'key', 'a', 'ref', jsonb_build_object('kind', 'template', 'templateId', seedId), 'status', 'pending'))));
    out := out || jsonb_build_object('t', 'P.2ב.1 המילואים — הפריט בדף == הפריט בצפייה (כולל מדריך מצולם, שאלה ותשובות)', 'pass',
      pg_temp.item222(real, 'custom_*') is not null and pg_temp.item222(real, 'custom_*') = pg_temp.item222(prev, 'custom_*')
      and pg_temp.item222(prev, 'custom_*')->>'photoGuide' = 'reserve_duty_claim' and pg_temp.item222(prev, 'custom_*')->>'kind' = 'custom',
      'got', jsonb_build_array(pg_temp.item222(real, 'custom_*'), pg_temp.item222(prev, 'custom_*')));
    update public.onboarding_steps set status = 'completed', completed_at = now() where id = sid;
    real := public.build_client_portal(cT, 'live');
    prev := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object(
      'key', 'a', 'ref', jsonb_build_object('kind', 'template', 'templateId', seedId), 'status', 'completed'))));
    out := out || jsonb_build_object('t', 'P.2ב.2 הושלמה — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'custom_*')->>'bucket' = 'done' and pg_temp.item222(real, 'custom_*') = pg_temp.item222(prev, 'custom_*'),
      'got', jsonb_build_array(pg_temp.item222(real, 'custom_*'), pg_temp.item222(prev, 'custom_*')));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2ב · נוסח מוכן', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.2ג · מסמך מהספרייה ══════════════════════════════════════════════════
  begin
    update public.profiles set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{client_documents}',
      coalesce(case when jsonb_typeof(settings->'client_documents') = 'array' then settings->'client_documents' end, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('id', docId, 'label', 'מדריך הוצאות QA', 'url', 'https://example.test/qa222.pdf')))
     where id = uid;
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
    values (cD, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'single');
    insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eD, uid, cD, 'onboarding', now());
    spec := public._flow_item_spec(uid, jsonb_build_object('ref', jsonb_build_object('kind', 'document', 'docId', docId)), false);
    r := public.create_onboarding_request(cD, spec->>'stepType', spec->'payload', null, null, true, false, spec->>'owner', null);
    sid := r->>'stepId';
    real := public.build_client_portal(cD, 'live');
    prev := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object(
      'key', 'a', 'ref', jsonb_build_object('kind', 'document', 'docId', docId), 'status', 'pending'))));
    out := out || jsonb_build_object('t', 'P.2ג מסמך מהמדף — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'custom_*') is not null and pg_temp.item222(real, 'custom_*') = pg_temp.item222(prev, 'custom_*'),
      'got', jsonb_build_array(pg_temp.item222(real, 'custom_*'), pg_temp.item222(prev, 'custom_*'), r));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2ג · מסמך', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.2ד · payload שנבנה בדפדפן (בקשה חופשית מהקומפוזר) ═══════════════════
  begin
    composer := jsonb_build_object('title', 'דוגמה QA', 'clientTitle', 'מה לעשות', 'clientSub', 'שורה',
      'clientNote', E'הסבר\nבשתי שורות', 'clientRefs', jsonb_build_array(jsonb_build_object('label', 'קוד מוסד', 'value', '123')),
      'clientNoteAfter', 'אחרי', 'clientCta', 'שליחה',
      'requirements', jsonb_build_array(
        jsonb_build_object('key', 'a', 'kind', 'text', 'label', 'שם', 'done', false, 'required', true),
        jsonb_build_object('key', 'b', 'kind', 'file', 'label', 'קובץ', 'done', false, 'required', false)));
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
    values (cC, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'single');
    insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eC, uid, cC, 'onboarding', now());
    r := public.create_onboarding_request(cC, 'custom_request', composer, null, null, true, false, 'client', null);
    real := public.build_client_portal(cC, 'live');
    prev := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object(
      'key', 'a', 'stepType', 'custom_request', 'payload', composer, 'status', 'pending'))));
    out := out || jsonb_build_object('t', 'P.2ד בקשה חופשית (payload מהדפדפן) — הפריט בדף == הפריט בצפייה', 'pass',
      pg_temp.item222(real, 'custom_*') is not null and pg_temp.item222(real, 'custom_*') = pg_temp.item222(prev, 'custom_*'),
      'got', jsonb_build_array(pg_temp.item222(real, 'custom_*'), pg_temp.item222(prev, 'custom_*'), r));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2ד · בקשה חופשית', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.2ז · «בהמשך» (lockAfter) ו«התקבל חלק» (markDone) ═══════════════════════
  begin
    select id into sid from public.onboarding_steps where client_id = cC and step_type = 'custom_request' limit 1;
    r := public.create_onboarding_request(cC, 'custom_request',
      jsonb_build_object('title', 'בקשה ב', 'clientTitle', 'בקשה ב', 'clientSub', 'תיאור ב',
        'requirements', jsonb_build_array(jsonb_build_object('key', 'q', 'kind', 'text', 'label', 'שאלה', 'done', false, 'required', true))),
      null, sid, true, false, 'client', null);
    sid2 := r->>'stepId';
    real := public.build_client_portal(cC, 'live');
    prev := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'b', 'stepType', 'custom_request',
      'payload', jsonb_build_object('title', 'בקשה ב', 'clientTitle', 'בקשה ב', 'clientSub', 'תיאור ב',
        'requirements', jsonb_build_array(jsonb_build_object('key', 'q', 'kind', 'text', 'label', 'שאלה', 'done', false, 'required', true))),
      'status', 'locked', 'lockAfter', jsonb_build_array(composer->>'clientTitle')))));
    out := out || jsonb_build_object('t', 'P.2ז.1 «בהמשך» — הפריט בדף (נעול אחרי בקשה אחרת) == הפריט בצפייה עם lockAfter', 'pass',
      pg_temp.item222(real, 'custom_*') is not null
      and (select x->>'bucket' = 'future' and x->>'sub' = 'ייפתח אחרי ' || (composer->>'clientTitle')
             from jsonb_array_elements(real->'items') x where x->>'key' = 'custom_' || sid2)
      and (select pg_temp.n222(x) from jsonb_array_elements(real->'items') x where x->>'key' = 'custom_' || sid2)
          = pg_temp.item222(prev, 'custom_*'),
      'got', jsonb_build_array((select x from jsonb_array_elements(real->'items') x where x->>'key' = 'custom_' || sid2), pg_temp.item222(prev, 'custom_*')));
    -- «התקבל חלק»: markDone = אותן דרישות/פריטים מסומנים כמו עדכון מפורש של הרשימה
    prev := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(
      jsonb_build_object('key', 'a', 'stepType', 'custom_request', 'payload', composer, 'markDone', 1),
      jsonb_build_object('key', 'b', 'stepType', 'client_documents', 'payload', jsonb_build_object('clientTitle', 'מסמכים', 'checklist',
        jsonb_build_array(jsonb_build_object('key', 'x', 'label', 'א', 'done', false), jsonb_build_object('key', 'y', 'label', 'ב', 'done', false))), 'markDone', 1))));
    out := out || jsonb_build_object('t', 'P.2ז.2 markDone — הדרישה הראשונה והפריט הראשון ברשימה מסומנים', 'pass',
      (select (x->'requirements'->0->>'done')::boolean and not (x->'requirements'->1->>'done')::boolean from jsonb_array_elements(prev->'items') x where x->>'key' like 'custom_%' limit 1)
      and (select (x->'checklist'->0->>'done')::boolean and not (x->'checklist'->1->>'done')::boolean from jsonb_array_elements(prev->'items') x where x->>'key' = 'docs'),
      'got', prev->'items');
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2ז · בהמשך / התקבל חלק', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.2ה · בקשות המערכת של המחולל (פייפרלס, רו״ח קודם, מסמכים, הרשאת תשלום) ══
  begin
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, has_previous_accountant,
        prev_accountant_name, prev_accountant_email, prev_accountant_phone, business_name)
    values (cG, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'single', 'licensed', true,
        'רו״ח לדוגמה', 'prev-accountant@example.test', '050-0000000', 'ישראלי ייעוץ (דוגמה)');
    insert into public.quotations (id, user_id, quotation_number, status, public_token, items, vat_rate, sent_at)
    values (qG, uid, 'QA222-' || sfx, 'sent', md5(qG), '[{"category":"monthly","name":"הנהלת חשבונות","price":500}]'::jsonb, 18, now());
    insert into public.engagements (id, user_id, client_id, quotation_id, status, process_published_at, monthly_total)
    values (eG, uid, cG, qG, 'onboarding', now(), 500);
    r := public.generate_onboarding_steps(eG, false);
    out := out || jsonb_build_object('t', 'P.2ה.0 המחולל יצר בקשות', 'pass', coalesce((r->>'ok')::boolean, false) and (r->>'created')::int > 0, 'got', r);
    real := public.build_client_portal(cG, 'preview');
    -- לכל סוג שהמחולל יצר: הצפייה באותו סוג, באותו מצב, עם אותם קלטים ואותה סיבת נעילה.
    for st in
      select jsonb_build_object('type', s.step_type, 'status', s.status, 'ball', s.ball, 'payload', s.payload, 'id', s.id,
               'lock', public.portal_lock_reason(s.id))
        from public.onboarding_steps s
       where s.client_id = cG and s.step_type in ('client_documents', 'prev_accountant_details', 'paperless_invite',
             'paperless_connection', 'paperless_tax_authority', 'retainer_authorization')
       order by s.step_type
    loop
      v := jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', st->>'type'),
        'status', st->>'status', 'ball', st->>'ball',
        'inputs', case st->>'type'
                    when 'client_documents' then jsonb_build_object('checklist', st->'payload'->'checklist')
                    when 'prev_accountant_details' then jsonb_build_object('needsDetails', false)
                    when 'paperless_invite' then jsonb_build_object('paperlessStatus', coalesce(st->'payload'->>'paperlessStatus', 'unknown'))
                    when 'retainer_authorization' then jsonb_build_object('amount', st->'payload'->'amount', 'billingStartMonth', st->'payload'->'billingStartMonth')
                    else '{}'::jsonb end);
      if st->>'lock' is not null then v := v || jsonb_build_object('lockReason', st->>'lock'); end if;
      -- ‼ הלקוח האמיתי כאן עם פרטי רו״ח קודם בכרטיס — «ידועים» גם בדוגמה.
      prev := public.preview_request_sample(jsonb_build_object('persona', jsonb_build_object('prevKnown', true), 'samples', jsonb_build_array(v)));
      vt := case st->>'type' when 'client_documents' then 'docs' when 'prev_accountant_details' then 'prev_details'
                 when 'paperless_invite' then 'paperless_signup' when 'paperless_tax_authority' then 'paperless_tax'
                 else null end;
      if st->>'type' = 'paperless_connection' then
        out := out || jsonb_build_object('t', 'P.2ה ' || (st->>'type') || ' (' || (st->>'status') || ')', 'pass',
          coalesce(pg_temp.item222(real, 'paperless_connect'), pg_temp.item222(real, 'paperless_transfer')) is not distinct from coalesce(pg_temp.item222(prev, 'paperless_connect'), pg_temp.item222(prev, 'paperless_transfer')),
          'got', jsonb_build_array(pg_temp.item222(real, 'paperless_connect'), pg_temp.item222(prev, 'paperless_connect')));
      elsif st->>'type' = 'retainer_authorization' then
        out := out || jsonb_build_object('t', 'P.2ה ' || (st->>'type') || ' (' || (st->>'status') || ')', 'pass',
          pg_temp.items222(real, array['retainer', 'retainer_charge', 'retainer_card', 'retainer_future', 'retainer_info']) = pg_temp.items222(prev, array['retainer', 'retainer_charge', 'retainer_card', 'retainer_future', 'retainer_info'])
          and jsonb_array_length(pg_temp.items222(prev, array['retainer', 'retainer_charge', 'retainer_card', 'retainer_future', 'retainer_info'])) = 1,
          'got', jsonb_build_array(pg_temp.items222(real, array['retainer', 'retainer_charge', 'retainer_card', 'retainer_future', 'retainer_info']),
                                   pg_temp.items222(prev, array['retainer', 'retainer_charge', 'retainer_card', 'retainer_future', 'retainer_info'])));
      else
        out := out || jsonb_build_object('t', 'P.2ה ' || (st->>'type') || ' (' || (st->>'status') || ')', 'pass',
          pg_temp.item222(real, vt) is not null and pg_temp.item222(real, vt) = pg_temp.item222(prev, vt),
          'got', jsonb_build_array(pg_temp.item222(real, vt), pg_temp.item222(prev, vt)));
      end if;
    end loop;
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2ה · בקשות המחולל', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.2ו · בקשת ייצוג — כל מצב ═════════════════════════════════════════════
  begin
    i := 0;
    for st in select jsonb_build_object('status', s, 'signers', g, 'spousePending', sp, 'signed', sg)
                from (values ('pending_fill', '[]'::jsonb, false, false),
                             ('pending_signature', '[{"role":"client","signToken":"sample","signStatus":"pending"}]'::jsonb, false, false),
                             ('pending_signature', '[{"role":"client","signToken":"sample","signStatus":"signed"},{"role":"spouse","signToken":"sample-spouse","signStatus":"pending"}]'::jsonb, true, false),
                             ('awaiting_accountant', '[{"role":"client","signToken":"sample","signStatus":"pending"}]'::jsonb, false, false),
                             ('awaiting_accountant', '[{"role":"client","signToken":"sample","signStatus":"signed"}]'::jsonb, false, true),
                             ('awaiting_stamp', '[{"role":"client","signToken":"sample","signStatus":"pending"}]'::jsonb, false, false),
                             ('awaiting_authorities', '[{"role":"client","signToken":"sample","signStatus":"signed"}]'::jsonb, false, false),
                             ('active', '[]'::jsonb, false, false)) x(s, g, sp, sg)
    loop
      i := i + 1;
      cX := 'qa222x' || i || sfx; eX := 'qa222xe' || i || sfx; rX := 'qa222xr' || i || sfx;
      insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
      values (cX, uid, 'ישראל', 'QA222', 'delivered@resend.dev', 'onboarding', 'single');
      insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eX, uid, cX, 'onboarding', now());
      insert into public.representation_requests (id, user_id, status, linked_client_id, onboarding_token, signers)
      values (rX, uid, st->>'status', cX, md5(rX), st->'signers');
      real := public.build_client_portal(cX, 'live');
      prev := public.preview_request_sample(jsonb_build_object('rep', jsonb_build_object('status', st->>'status',
          'spousePending', (st->>'spousePending')::boolean, 'signed', (st->>'signed')::boolean),
        'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'representation'), 'status', 'in_progress', 'ball', 'me'))));
      -- ‼ אותה בקשה: בדף — פריט הייצוג שהשרת בונה; בצפייה — אותו פריט (טוקנים: 'sample').
      out := out || jsonb_build_object('t', 'P.2ו ייצוג ' || (st->>'status') || case when (st->>'spousePending')::boolean then ' (בן/בת זוג)' when (st->>'signed')::boolean then ' (נחתם)' else '' end,
        'pass', jsonb_array_length(pg_temp.items222(real, array['rep_fill', 'rep_sign', 'rep_sign_spouse', 'rep_office', 'rep_authorities', 'rep_done'])) = 1
                and (pg_temp.items222(real, array['rep_fill', 'rep_sign', 'rep_sign_spouse', 'rep_office', 'rep_authorities', 'rep_done'])
                     = pg_temp.items222(prev, array['rep_fill', 'rep_sign', 'rep_sign_spouse', 'rep_office', 'rep_authorities', 'rep_done'])),
        'got', jsonb_build_array(pg_temp.items222(real, array['rep_fill', 'rep_sign', 'rep_sign_spouse', 'rep_office', 'rep_authorities', 'rep_done']),
                                pg_temp.items222(prev, array['rep_fill', 'rep_sign', 'rep_sign_spouse', 'rep_office', 'rep_authorities', 'rep_done'])));
    end loop;
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.2ו · בקשת ייצוג', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.3 · אין כתיבה ═══════════════════════════════════════════════════════
  begin
    select string_agg(p.proname || ':' || p.provolatile::text, ', ' order by p.proname) into vt
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('preview_request_sample', '_portal_step_items', '_portal_rep_item', '_rep_client_approval_payload',
                         '_rep_client_approval_required_payload', '_onboarding_system_payload');
    out := out || jsonb_build_object('t', 'P.3.1 הצפייה והפונקציות שהיא קוראת — לא פונקציות כותבות (s/i)', 'pass',
      not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                    and p.proname in ('preview_request_sample', '_portal_step_items', '_portal_rep_item', '_rep_client_approval_payload',
                                      '_rep_client_approval_required_payload', '_onboarding_system_payload', '_portal_prev_items')
                    and p.provolatile = 'v'),
      'got', vt);
    out := out || jsonb_build_object('t', 'P.3.2 preview_request_sample דווקא STABLE', 'pass',
      (select provolatile = 's' from pg_proc where oid = 'public.preview_request_sample(jsonb)'::regprocedure), 'got', vt);
    counts_before := jsonb_build_object(
      'clients', (select count(*) from public.clients), 'steps', (select count(*) from public.onboarding_steps),
      'events', (select count(*) from public.onboarding_events), 'mail', (select count(*) from public.email_messages),
      'notice', (select count(*) from public.client_step_notice_state), 'jobs', (select count(*) from public.automation_jobs),
      'notif', (select count(*) from public.accountant_notifications), 'profiles', (select count(*) from public.profiles),
      'reps', (select count(*) from public.representation_requests), 'settings', (select md5(string_agg(settings::text, ',' order by id)) from public.profiles));
    begin
      counts_before := counts_before || jsonb_build_object('queue', (select count(*) from net.http_request_queue));
    exception when others then counts_before := counts_before || jsonb_build_object('queue', -1);
    end;
    for i in 1..50 loop
      res := public.preview_request_sample(jsonb_build_object('persona', jsonb_build_object('couple', i % 2 = 0),
        'rep', jsonb_build_object('status', (array['pending_fill', 'pending_signature', 'awaiting_authorities', 'active'])[1 + i % 4], 'approvals', 'couple', 'niReference', true),
        'samples', jsonb_build_array(
          jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'rep_client_approval'), 'status', 'pending', 'required', i % 3 = 0),
          jsonb_build_object('key', 'b', 'ref', jsonb_build_object('kind', 'template', 'templateId', seedId), 'status', 'pending'),
          jsonb_build_object('key', 'c', 'stepType', 'custom_request', 'payload', composer, 'status', 'completed'),
          jsonb_build_object('key', 'd', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'representation')),
          jsonb_build_object('key', 'e', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'authority_representation'), 'status', 'waiting_client'))));
    end loop;
    counts_after := jsonb_build_object(
      'clients', (select count(*) from public.clients), 'steps', (select count(*) from public.onboarding_steps),
      'events', (select count(*) from public.onboarding_events), 'mail', (select count(*) from public.email_messages),
      'notice', (select count(*) from public.client_step_notice_state), 'jobs', (select count(*) from public.automation_jobs),
      'notif', (select count(*) from public.accountant_notifications), 'profiles', (select count(*) from public.profiles),
      'reps', (select count(*) from public.representation_requests), 'settings', (select md5(string_agg(settings::text, ',' order by id)) from public.profiles));
    begin
      counts_after := counts_after || jsonb_build_object('queue', (select count(*) from net.http_request_queue));
    exception when others then counts_after := counts_after || jsonb_build_object('queue', -1);
    end;
    out := out || jsonb_build_object('t', 'P.3.3 אחרי 50 קריאות — שום ספירה לא זזה (לקוחות, בקשות, אירועים, מיילים, מצב הודעות, אוטומציות, הודעות למשרד, תור הרשת)', 'pass',
      counts_before = counts_after, 'got', jsonb_build_array(counts_before, counts_after));
    out := out || jsonb_build_object('t', 'P.3.4 הקריאה האחרונה הצליחה ובה פריטים', 'pass',
      (res->>'ok')::boolean and jsonb_array_length(res->'items') >= 3 and (res->>'sample')::boolean, 'got', left(res::text, 600));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.3', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.4 · הרשאות ══════════════════════════════════════════════════════════
  begin
    out := out || jsonb_build_object('t', 'P.4.1 הפונקציה הפנימיות סגורות ל-anon ול-authenticated', 'pass',
      not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                    and p.proname in ('_portal_step_items', '_portal_rep_item', '_portal_prev_items', '_rep_client_approval_payload',
                                      '_rep_client_approval_required_payload', '_onboarding_system_payload', 'build_client_portal')
                    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
      'got', null);
    out := out || jsonb_build_object('t', 'P.4.2 preview_request_sample: authenticated כן, anon לא', 'pass',
      has_function_privilege('authenticated', 'public.preview_request_sample(jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.preview_request_sample(jsonb)', 'execute'), 'got', null);
    -- anon ממש (לא רק בדיקת הרשאה)
    begin
      execute 'set local role anon';
      res := public.preview_request_sample('{"samples":[{"key":"a","stepType":"custom_request","payload":{}}]}'::jsonb);
      execute 'set local role postgres';
      out := out || jsonb_build_object('t', 'P.4.3 anon — נדחה', 'pass', false, 'got', res);
    exception when insufficient_privilege then
      execute 'set local role postgres';
      out := out || jsonb_build_object('t', 'P.4.3 anon — נדחה', 'pass', true, 'got', sqlstate);
    end;
    -- בלי התחברות
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    res := public.preview_request_sample('{"samples":[{"key":"a","stepType":"custom_request","payload":{}}]}'::jsonb);
    out := out || jsonb_build_object('t', 'P.4.4 בלי משתמש — forbidden', 'pass', res->>'error' = 'forbidden', 'got', res);
    -- משתמש לא מורשה
    perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', other::text, true);
    res := public.preview_request_sample('{"samples":[{"key":"a","stepType":"custom_request","payload":{}}]}'::jsonb);
    out := out || jsonb_build_object('t', 'P.4.5 משתמש לא מורשה — forbidden', 'pass', res->>'error' = 'forbidden', 'got', res);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    -- תבנית של משרד אחר
    insert into public.journey_templates (user_id, office_id, kind, name, entries)
    values (uid, gen_random_uuid(), 'request', 'QA222 תבנית של משרד אחר',
            jsonb_build_array(jsonb_build_object('key', 'e1', 'stepType', 'custom_request', 'owner', 'client', 'payload', jsonb_build_object('title', 'סוד של משרד אחר', 'clientTitle', 'סוד של משרד אחר'))))
    returning id into sid2;
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'template', 'templateId', sid2)))));
    out := out || jsonb_build_object('t', 'P.4.6 תבנית של משרד אחר — library_item_missing, בלי התוכן שלה', 'pass',
      res->'specs'->0->>'reason' = 'library_item_missing' and position('סוד של משרד אחר' in res::text) = 0 and jsonb_array_length(res->'items') = 0, 'got', res);
    -- אף טוקן אמיתי בפלט
    res := public.preview_request_sample(jsonb_build_object('rep', jsonb_build_object('status', 'pending_signature', 'niReference', true),
      'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'representation')),
        jsonb_build_object('key', 'b', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'intake_questionnaire'), 'status', 'waiting_client'))));
    out := out || jsonb_build_object('t', 'P.4.7 בפלט רק טוקנים של דוגמה — אף טוקן של לקוח או בקשה אמיתיים', 'pass',
      not exists (select 1 from public.clients c where c.portal_token is not null and position(c.portal_token in res::text) > 0)
      and not exists (select 1 from public.clients c where c.intake_token is not null and position(c.intake_token in res::text) > 0)
      and not exists (select 1 from public.representation_requests q where q.onboarding_token is not null and q.onboarding_token <> 'sample' and position(q.onboarding_token in res::text) > 0)
      and position('"sample"' in res::text) > 0, 'got', left(res::text, 500));
  exception when others then
    execute 'set local role postgres';
    out := out || jsonb_build_object('t', 'קרס: P.4', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ P.5 · קצוות ═══════════════════════════════════════════════════════════
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    select id into sid from public.journey_templates where seed_key = 'prev_accountant_details' and office_id is null;
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a',
      'ref', jsonb_build_object('kind', 'template', 'templateId', sid), 'repeatable', true))));
    out := out || jsonb_build_object('t', 'P.5.1 במסלול שחוזר: סוג של «פעם אחת» ⇒ not_repeatable', 'pass', res->'specs'->0->>'reason' = 'not_repeatable' and (res->'specs'->0->>'ok')::boolean = false, 'got', res->'specs');
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a',
      'ref', jsonb_build_object('kind', 'template', 'templateId', 'qa222-does-not-exist')))));
    out := out || jsonb_build_object('t', 'P.5.2 תבנית שלא קיימת ⇒ library_item_missing', 'pass', res->'specs'->0->>'reason' = 'library_item_missing', 'got', res->'specs');
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a',
      'ref', jsonb_build_object('kind', 'document', 'docId', 'qa222-no-such-doc')))));
    out := out || jsonb_build_object('t', 'P.5.3 מסמך שהוסר ⇒ library_item_missing', 'pass', res->'specs'->0->>'reason' = 'library_item_missing', 'got', res->'specs');
    insert into public.journey_templates (user_id, office_id, kind, name, entries)
    values (uid, office, 'request', 'QA222 משימה פנימית',
            jsonb_build_array(jsonb_build_object('key', 'e1', 'stepType', 'custom_request', 'owner', 'me', 'officeTask', true,
              'payload', jsonb_build_object('title', 'משימה פנימית QA', 'clientTitle', 'פנימית'))))
    returning id into sid2;
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'template', 'templateId', sid2)))));
    out := out || jsonb_build_object('t', 'P.5.4 משימה של המשרד ⇒ internal, בלי פריטים בדף', 'pass',
      (res->'specs'->0->>'internal')::boolean and jsonb_array_length(res->'items') = 0 and (res->'specs'->0->>'ok')::boolean, 'got', res->'specs');
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a', 'stepType', 'custom_request', 'payload', '{}'::jsonb, 'status', 'finished'))));
    out := out || jsonb_build_object('t', 'P.5.5 מצב לא מוכר ⇒ bad_variant', 'pass', res->'specs'->0->>'reason' = 'bad_variant', 'got', res->'specs');
    res := public.preview_request_sample(jsonb_build_object('rep', jsonb_build_object('status', 'bogus'), 'samples', jsonb_build_array(jsonb_build_object('key', 'a', 'stepType', 'custom_request', 'payload', '{}'::jsonb))));
    out := out || jsonb_build_object('t', 'P.5.6 מצב ייצוג לא מוכר ⇒ bad_variant', 'pass', res->>'error' = 'bad_variant', 'got', res);
    res := public.preview_request_sample('{"samples":[]}'::jsonb);
    out := out || jsonb_build_object('t', 'P.5.7 בלי דוגמאות ⇒ bad_request', 'pass', res->>'error' = 'bad_request', 'got', res);
    res := public.preview_request_sample(jsonb_build_object('samples', (select jsonb_agg(jsonb_build_object('key', n::text, 'stepType', 'custom_request', 'payload', '{}'::jsonb)) from generate_series(1, 21) n)));
    out := out || jsonb_build_object('t', 'P.5.8 יותר מ-20 דוגמאות ⇒ bad_request', 'pass', res->>'error' = 'bad_request', 'got', res->'error');
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(jsonb_build_object('key', 'a', 'stepType', 'data_import', 'status', 'pending'))));
    out := out || jsonb_build_object('t', 'P.5.9 סוג פנימי של המערכת ⇒ אפס פריטים, בלי שגיאה', 'pass', (res->>'ok')::boolean and jsonb_array_length(res->'items') = 0, 'got', res->'items');
    -- בקשה בקבוצה: כמה דוגמאות יחד (פייפרלס) — הפריטים כולם, בסדר
    res := public.preview_request_sample(jsonb_build_object('samples', jsonb_build_array(
      jsonb_build_object('key', 'a', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'paperless_invite'), 'status', 'pending'),
      jsonb_build_object('key', 'b', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'business_details'), 'status', 'pending'),
      jsonb_build_object('key', 'c', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'paperless_connection'), 'status', 'locked', 'lockReason', 'ייפתח אחרי הרשמה לפייפרלס'))));
    out := out || jsonb_build_object('t', 'P.5.10 קבוצה — שלושה פריטים לפי הסדר, ו«בהמשך» נושא את סיבת הנעילה שנשלחה', 'pass',
      jsonb_array_length(res->'items') = 3
      and res->'items'->0->>'key' = 'paperless_signup' and res->'items'->1->>'key' = 'business_details'
      and res->'items'->2->>'bucket' = 'future' and res->'items'->2->>'sub' = 'ייפתח אחרי הרשמה לפייפרלס', 'got', res->'items');
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.5', 'pass', false, 'got', sqlerrm);
  end;

  -- ══ ניקיון ההרשאות: הרשאות היוצרים לא השתנו ══════════════════════════════
  begin
    out := out || jsonb_build_object('t', 'P.6.1 היוצרים נשארו סגורים ל-anon/authenticated ופתוחים ל-service_role', 'pass',
      not has_function_privilege('anon', 'public.generate_onboarding_steps(text,boolean)', 'execute')
      and not has_function_privilege('authenticated', 'public.generate_onboarding_steps(text,boolean)', 'execute')
      and has_function_privilege('service_role', 'public.generate_onboarding_steps(text,boolean)', 'execute')
      and not has_function_privilege('anon', 'public.ensure_rep_client_approval_step(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.ensure_rep_client_approval_step(text)', 'execute')
      and has_function_privilege('service_role', 'public.ensure_rep_client_approval_step(text)', 'execute')
      and not has_function_privilege('anon', 'public.shaam_require_client_approval(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.shaam_require_client_approval(text)', 'execute')
      and has_function_privilege('service_role', 'public.shaam_require_client_approval(text)', 'execute'), 'got', null);
    out := out || jsonb_build_object('t', 'P.6.2 assert_domain_function_invariants', 'pass', public.assert_domain_function_invariants() = 'ok', 'got', null);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.6', 'pass', false, 'got', sqlerrm);
  end;

  raise exception 'RESULTS:%', out::text;
end;
$test$;
