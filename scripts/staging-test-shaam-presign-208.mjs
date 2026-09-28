#!/usr/bin/env node
/**
 * staging-test-shaam-presign-208.mjs — שער הרגרסיה של 208.
 *
 * ‼ מה המבחן הזה שומר שלא יחזור:
 *   A. אין צילום בתיק ⇒ «שלח ללקוח» מצרף בקשת העלאה (פעם אחת), והבקשה עוברת
 *      ל«ממתין לחתימה» (הבאג של עידן: טופס משע״ם לא הזיז את המצב).
 *   B. יש צילום בתיק ⇒ בקשת «אשר שזה שלך»; לפני האישור העובד מקבל not_confirmed
 *      (קיום קובץ אינו אישור); הלקוח מאשר בדף האישי ⇒ clientConfirmedAt.
 *   C. הלקוח מעלה צילום אחר ⇒ רק החדש מאושר; הישן לא.
 *   D. הסרת רשות לפני שהופק טופס ⇒ היקף + כרטיס; האחרונה לא מוסרת.
 *   E. הסרת רשות אחרי שהופק טופס ובקשה בשע״ם ⇒ מסמך החתימה נמחק (אין שליחה של
 *      הישן), המעקב «להחלפה»; בדיקה שרואה ביטול ⇒ היסטוריה; יצירה חדשה ⇒ מה שנשאר.
 *   E2. «ביטלתי בשע״ם» ⇒ היסטוריה.   F. אחרי השליחה ⇒ already_sent.
 *   G. יצירה בשע״ם רצה ⇒ לא מסירים.   H. צילום לא משויך ⇒ עצירה בלי שום תופעת לוואי.
 *   I. צירוף משרד אחרי השליחה ⇒ הלקוח נשאל.   J. execution.shaam לא נדרס מהדפדפן.
 *
 * הכול רץ בבלוק DO אחד שמסתיים ב-raise exception 'ALL_OK' — כל מה שנוצר
 * מתגלגל לאחור, ו-staging נשאר בדיוק כפי שהיה. שום מייל, שום פנייה לשע״ם.
 *
 * הרצה:  node scripts/staging-test-shaam-presign-208.mjs
 */
import { writeStaging } from './staging-lib.mjs';

const sql = `
do $t$
declare
  v_owner  uuid;
  v_label  uuid;
  v_p      text := 'qa206-' || substr(md5(random()::text), 1, 6);
  v_notice text := 'הבקשה נקלטה בהצלחה. בהמשך תתבקש לצרף: טופס ייפוי כוח חתום. צילום תעודת הזהות או רישיון נהיגה של הלקוח. נא לוודא שהמסמכים קריאים.';
  v_c      text;
  v_r      text;
  v_step   text;
  v_job    text;
  j        jsonb;
  x        jsonb;
  v_n      int;
  v_s      text;
begin
  select user_id into v_owner from public.representation_requests limit 1;
  select id into v_label from public.document_labels where user_id = v_owner limit 1;
  if v_label is null then select id into v_label from public.document_labels limit 1; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- ── מפעל לקוחות: לקוח + בקשה עם בקשה בשע״ם, טופס, ו«בהמשך תתבקש לצרף» ─────
  create temp table qa_fx (tag text primary key, client text, req text) on commit drop;
  for v_s in select unnest(array['A','B','C','D','E','E2','F','G','H','I','J']) loop
    v_c := v_p || '-' || lower(v_s);
    v_r := v_c || '-req';
    insert into public.clients (id, user_id, first_name, last_name, family_status, id_number, portal_token,
                                representation_status, authority_representations)
    values (v_c, v_owner, 'לקוח' || v_s, 'בדיקה', 'single', '000000182', v_c || '-tok', 'awaiting_accountant',
            '{"incomeTax":{"status":"requested"},"withholding":{"status":"requested"}}'::jsonb);
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
    values (v_c || '-form', v_owner, v_c, 'qa/208/' || v_c || '/form', 'ייפוי כוח.pdf', 'application/pdf', 1, 'other', v_label);
    insert into public.representation_requests (id, user_id, linked_client_id, status, authorities, scope, execution, signature_documents, signature_setup)
    values (v_r, v_owner, v_c, 'awaiting_accountant', array['incomeTax', 'withholding'],
            '{"incomeTax":{"status":"requested"},"withholding":{"status":"requested"}}'::jsonb,
            case when v_s = 'D' then '{}'::jsonb else jsonb_build_object('shaam', jsonb_build_object('person:client', jsonb_build_object(
              'requestNumber', '20269900' || lpad((ascii(v_s))::text, 2, '0'), 'formDocumentId', v_c || '-form',
              'creationNotice', jsonb_build_object('text', v_notice, 'at', now()),
              'requestedSystems', '["מס הכנסה","ניכויים"]'::jsonb))) end,
            case when v_s = 'D' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('key', 'person:client', 'title', 'x',
              'pdfDocId', v_c || '-form', 'pdfFileName', 'ייפוי כוח.pdf', 'fields', '[]'::jsonb, 'createdAt', now(), 'signedPdfStoredId', null)) end,
            case when v_s = 'D' then null else jsonb_build_object('pdfDocId', v_c || '-form', 'fields', '[]'::jsonb) end);
    update public.clients set representation_request_id = v_r where id = v_c;
    insert into qa_fx values (v_s, v_c, v_r);
  end loop;

  -- ══ A · אין צילום ⇒ בקשת העלאה + «ממתין לחתימה» ════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'A';
  j := public.shaam_presign_client_actions(v_r);
  if jsonb_array_length(j) <> 1 or j->0->>'action' <> 'upload' then raise exception 'FAIL A presign %', j; end if;
  j := public.prepare_request_for_signing(v_r);
  if not (j->>'ok')::boolean or j->>'status' <> 'pending_signature' or j#>>'{documents,0,action}' <> 'upload' then
    raise exception 'FAIL A prepare %', j; end if;
  if (select status from public.representation_requests where id = v_r) <> 'pending_signature' then raise exception 'FAIL A status'; end if;
  j := public.prepare_request_for_signing(v_r);  -- פעם שנייה: בלי כפילות
  select count(*) into v_n from public.onboarding_steps s, jsonb_array_elements(s.payload->'checklist') i
   where s.client_id = v_c and s.status <> 'cancelled' and i->>'requiredBy' = 'shaam' and not coalesce((i->>'done')::boolean, false);
  if v_n <> 1 then raise exception 'FAIL A upload items = % (expected 1)', v_n; end if;
  j := public.build_client_portal(v_c, 'client');
  if not exists (select 1 from jsonb_array_elements(j->'items') it, jsonb_array_elements(coalesce(it->'checklist','[]')) ci
                  where ci->>'note' like '%רשות המסים%') then raise exception 'FAIL A portal upload item %', j->'items'; end if;

  -- ══ B · יש צילום ⇒ «אשר שזה שלך»; לפני האישור — not_confirmed ═══════════════
  select client, req into v_c, v_r from qa_fx where tag = 'B';
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
  values (v_c || '-id', v_owner, v_c, 'qa/208/b/id', 'id.jpg', 'image/jpeg', 1, 'id_card', v_label);
  update public.representation_requests set identity_docs = jsonb_build_object('client', jsonb_build_array(
    jsonb_build_object('documentId', v_c || '-id', 'docKind', 'idCard', 'fileName', 'id.jpg', 'via', 'onboarding'))) where id = v_r;
  j := public.shaam_presign_client_actions(v_r);
  if j->0->>'action' <> 'confirm' then raise exception 'FAIL B presign %', j; end if;
  j := public.prepare_request_for_signing(v_r);
  if j#>>'{documents,0,action}' <> 'confirm' then raise exception 'FAIL B prepare %', j; end if;
  v_step := j#>>'{documents,0,stepId}';
  j := public.prepare_request_for_signing(v_r);
  select count(*) into v_n from public.onboarding_steps where client_id = v_c and step_type = 'custom_request' and payload ? 'shaamIdentity';
  if v_n <> 1 then raise exception 'FAIL B confirm steps = %', v_n; end if;
  select payload into j from public.onboarding_steps where id = v_step and published_at is not null;
  if j#>>'{clientResources,0,documentId}' <> v_c || '-id' or j#>>'{clientResources,0,source}' <> 'client' then
    raise exception 'FAIL B step resources %', j; end if;
  -- העובד: הצילום קיים אבל לא אושר ⇒ not_confirmed
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_c, 'shaam.submit_poa', jsonb_build_object('submissionKey', 'person:client', 'role', 'client', 'entityId', '000000182'),
          'running', 'qa-w206', 1) returning id into v_job;
  j := public.automation_job_identity_document('qa-w206', v_job, '000000182', 'idOrLicense');
  if j->>'error' is distinct from 'not_confirmed' then raise exception 'FAIL B worker before confirm %', j; end if;
  -- הדף האישי: פריט «אשר» עם הצילום
  j := public.build_client_portal(v_c, 'client');
  if not exists (select 1 from jsonb_array_elements(j->'items') it where it->>'kind' = 'identity_confirm'
                   and it#>>'{resources,0,documentId}' = v_c || '-id' and it->>'bucket' = 'action') then
    raise exception 'FAIL B portal item %', j->'items'; end if;
  j := public.portal_submit_step(v_c || '-tok', v_step, '{"key":"nope"}'::jsonb);
  if j->>'error' is distinct from 'bad_key' then raise exception 'FAIL B bad key %', j; end if;
  j := public.portal_submit_step(v_c || '-tok', v_step, '{"key":"identity_confirm"}'::jsonb);
  if not coalesce((j->>'ok')::boolean, false) then raise exception 'FAIL B confirm %', j; end if;
  select identity_docs into j from public.representation_requests where id = v_r;
  if j#>>'{client,0,clientConfirmedAt}' is null then raise exception 'FAIL B not confirmed %', j; end if;
  if (select status from public.onboarding_steps where id = v_step) <> 'completed' then raise exception 'FAIL B step not completed'; end if;
  j := public.automation_job_identity_document('qa-w206', v_job, '000000182', 'idOrLicense');
  if j->>'error' = 'not_confirmed' then raise exception 'FAIL B worker after confirm %', j; end if;
  if jsonb_array_length(public.shaam_presign_client_actions(v_r)) <> 0 then raise exception 'FAIL B presign after confirm'; end if;

  -- ══ C · הלקוח מעלה צילום אחר ⇒ רק החדש מאושר ═══════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'C';
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
  values (v_c || '-old', v_owner, v_c, 'qa/208/c/old', 'old.jpg', 'image/jpeg', 1, 'id_card', v_label),
         (v_c || '-new', v_owner, v_c, 'qa/208/c/new', 'new.png', 'image/png', 1, 'other', v_label);
  update public.representation_requests set identity_docs = jsonb_build_object('client', jsonb_build_array(
    jsonb_build_object('documentId', v_c || '-old', 'docKind', 'idCard', 'fileName', 'old.jpg'))) where id = v_r;
  j := public.prepare_request_for_signing(v_r);
  v_step := j#>>'{documents,0,stepId}';
  -- מה ש-portal-upload-document כותב על פריט file
  update public.onboarding_steps
     set payload = jsonb_set(payload, '{requirements}', (select jsonb_agg(case when r->>'key' = 'identity_replacement'
                     then r || jsonb_build_object('done', true, 'documentId', v_c || '-new', 'doneAt', now()) else r end)
                     from jsonb_array_elements(payload->'requirements') r))
   where id = v_step;
  select identity_docs into j from public.representation_requests where id = v_r;
  if (select count(*) from jsonb_array_elements(j->'client') e where e->>'documentId' = v_c || '-new' and e->>'clientConfirmedAt' is not null) <> 1 then
    raise exception 'FAIL C new doc not confirmed %', j; end if;
  if exists (select 1 from jsonb_array_elements(j->'client') e where e->>'documentId' = v_c || '-old' and e ? 'clientConfirmedAt') then
    raise exception 'FAIL C old doc got confirmed %', j; end if;
  if (select status from public.onboarding_steps where id = v_step) <> 'completed' then raise exception 'FAIL C step'; end if;
  if (select category from public.documents where id = v_c || '-new') <> 'id_card' then raise exception 'FAIL C category'; end if;
  j := public.shaam_confirmed_identity_documents_for(v_c, 'client', 'idOrLicense');
  if j#>>'{documents,0,documentId}' <> v_c || '-new' or jsonb_array_length(j->'documents') <> 1 then
    raise exception 'FAIL C confirmed set %', j; end if;

  -- ══ D · הסרה לפני שהופק טופס ═══════════════════════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'D';
  j := public.remove_authority_before_signing(v_r, 'withholding');
  if not (j->>'ok')::boolean then raise exception 'FAIL D remove %', j; end if;
  if (select scope ? 'withholding' or 'withholding' = any(authorities) from public.representation_requests where id = v_r) then
    raise exception 'FAIL D request still has withholding'; end if;
  if (select authority_representations ? 'withholding' from public.clients where id = v_c) then raise exception 'FAIL D card'; end if;
  j := public.remove_authority_before_signing(v_r, 'incomeTax');
  if j->>'reason' is distinct from 'last_authority' then raise exception 'FAIL D last %', j; end if;

  -- ══ E · הסרה אחרי שהופק טופס, כשהבקשה כבר קיימת בשע״ם ══════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'E';
  update public.representation_requests set status = 'pending_signature' where id = v_r;
  j := public.remove_authority_before_signing(v_r, 'withholding');
  if not (j->>'ok')::boolean or j#>>'{replacement,0}' <> 'person:client' then raise exception 'FAIL E remove %', j; end if;
  select to_jsonb(q) into j from (select status, signature_documents, signature_setup, execution from public.representation_requests where id = v_r) q;
  if jsonb_array_length(j->'signature_documents') <> 0 or j->'signature_setup' <> 'null'::jsonb then raise exception 'FAIL E old form still signable %', j; end if;
  if j->>'status' <> 'awaiting_accountant' then raise exception 'FAIL E status %', j->>'status'; end if;
  if j#>>'{execution,shaam,person:client,replacement,requestNumber}' is null
     or j#>'{execution,shaam,person:client,replacement,removed}' <> '["ניכויים"]'::jsonb
     or j#>'{execution,shaam,person:client}' ? 'formDocumentId' then raise exception 'FAIL E tracking %', j->'execution'; end if;
  if (select notes from public.documents where id = v_c || '-form') not like '%הוחלף%' then raise exception 'FAIL E form note'; end if;
  j := public.prepare_request_for_signing(v_r);
  if j->>'reason' is distinct from 'no_form' then raise exception 'FAIL E old form could be sent %', j; end if;
  if jsonb_array_length(public.shaam_presign_client_actions(v_r)) <> 0 then raise exception 'FAIL E presign'; end if;
  -- בדיקה מול שע״ם רואה שהבקשה בוטלה ⇒ היסטוריה
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, claimed_at, max_attempts)
  values (v_owner, v_c, 'shaam.check_representation', '{"submissionKey":"person:client"}'::jsonb, 'running', 'qa-w206', now(), 1)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', result = jsonb_build_object(
      'submissionKey', 'person:client', 'found', true, 'observedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'rows', jsonb_build_array(
        jsonb_build_object('requestNumber', '20269900' || lpad(ascii('E')::text, 2, '0'), 'system', 'מס הכנסה', 'systemStateCode', 6, 'rawSystemState', 'בוטל', 'requestStateCode', 4, 'rawRequestState', 'בוטלה'),
        jsonb_build_object('requestNumber', '20269900' || lpad(ascii('E')::text, 2, '0'), 'system', 'ניכויים', 'systemStateCode', 6, 'rawSystemState', 'בוטל', 'requestStateCode', 4, 'rawRequestState', 'בוטלה')))
   where id = v_job;
  select execution#>'{shaam,person:client}' into j from public.representation_requests where id = v_r;
  if j ? 'requestNumber' or j#>>'{history,0,archivedHow}' <> 'observed_cancelled' then raise exception 'FAIL E archive %', j; end if;
  -- יצירה חדשה (מה שנשאר) ⇒ מעקב חדש, וההיסטוריה נשמרת
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, claimed_at, max_attempts)
  values (v_owner, v_c, 'shaam.create_representation', '{"submissionKey":"person:client"}'::jsonb, 'running', 'qa-w206', now(), 1)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', result = jsonb_build_object(
      'submissionKey', 'person:client', 'requestNumber', '2026990099', 'formDocumentId', v_c || '-form2',
      'systems', '["מס הכנסה"]'::jsonb, 'creationAttach', '["טופס ייפוי כוח חתום","צילום תעודת הזהות או רישיון נהיגה של הלקוח"]'::jsonb)
   where id = v_job;
  select execution#>'{shaam,person:client}' into j from public.representation_requests where id = v_r;
  if j->>'requestNumber' <> '2026990099' or j->'requestedSystems' <> '["מס הכנסה"]'::jsonb
     or jsonb_array_length(j->'history') <> 1 or j ? 'replacement' then raise exception 'FAIL E recreate %', j; end if;

  -- ══ E2 · «ביטלתי בשע״ם» ═══════════════════════════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'E2';
  j := public.remove_authority_before_signing(v_r, 'withholding');
  j := public.confirm_shaam_request_cancelled(v_r, 'person:client');
  if not (j->>'ok')::boolean then raise exception 'FAIL E2 confirm %', j; end if;
  select execution#>'{shaam,person:client}' into j from public.representation_requests where id = v_r;
  if j ? 'requestNumber' or j#>>'{history,0,archivedHow}' <> 'office_confirmed' then raise exception 'FAIL E2 archive %', j; end if;
  j := public.confirm_shaam_request_cancelled(v_r, 'person:client');
  if j->>'reason' is distinct from 'no_replacement' then raise exception 'FAIL E2 second %', j; end if;
  -- הסימון היה שגוי: «הזן» מוצא את אותה בקשה עדיין פתוחה ⇒ לא מאמצים בשקט, חוזרים ל«להחלפה».
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, claimed_at, max_attempts)
  values (v_owner, v_c, 'shaam.create_representation', '{"submissionKey":"person:client"}'::jsonb, 'running', 'qa-w206', now(), 1)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', result = jsonb_build_object(
      'submissionKey', 'person:client', 'preflight', 'existing_found', 'found', true,
      'observedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'requestNumber', '20269900' || lpad(ascii('E')::text, 2, '0'),
      'rows', jsonb_build_array(jsonb_build_object('requestNumber', '20269900' || lpad(ascii('E')::text, 2, '0'), 'system', 'ניכויים',
        'systemStateCode', 1, 'rawSystemState', 'ממתין לטעינת מסמכים', 'requestStateCode', 1, 'rawRequestState', 'ממתין לטעינת מסמכים')))
   where id = v_job;
  select execution#>'{shaam,person:client}' into j from public.representation_requests where id = v_r;
  if j#>>'{replacement,stillOpenAt}' is null or j->>'createdAt' is not null then raise exception 'FAIL E2 still-open not flagged %', j; end if;
  if public.prepare_request_for_signing(v_r)->>'reason' is distinct from 'no_form' then raise exception 'FAIL E2 sendable'; end if;

  -- ══ F · אחרי השליחה ⇒ לא כאן ═══════════════════════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'F';
  update public.representation_requests set execution = execution || jsonb_build_object('signatureEmailSentAt', now()) where id = v_r;
  j := public.remove_authority_before_signing(v_r, 'withholding');
  if j->>'reason' is distinct from 'already_sent' then raise exception 'FAIL F %', j; end if;

  -- ══ G · יצירה בשע״ם רצה ⇒ לא מסירים ════════════════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'G';
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values (v_owner, v_c, 'shaam.create_representation', '{"submissionKey":"person:client"}'::jsonb, 'queued', 1);
  j := public.remove_authority_before_signing(v_r, 'withholding');
  if j->>'reason' is distinct from 'automation_running' then raise exception 'FAIL G %', j; end if;

  -- ══ H · צילום לא משויך ⇒ עצירה, בלי שום תופעת לוואי; «בקש מהלקוח» ⇒ העלאה ══
  select client, req into v_c, v_r from qa_fx where tag = 'H';
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
  values (v_c || '-loose', v_owner, v_c, 'qa/208/h/loose', 'loose.jpg', 'image/jpeg', 1, 'id_card', v_label);
  j := public.prepare_request_for_signing(v_r);
  if j->>'reason' is distinct from 'unassigned_identity' then raise exception 'FAIL H stop %', j; end if;
  if (select status from public.representation_requests where id = v_r) <> 'awaiting_accountant' then raise exception 'FAIL H status moved'; end if;
  if exists (select 1 from public.onboarding_steps where client_id = v_c and status <> 'cancelled'
               and (payload ? 'shaamIdentity' or exists (select 1 from jsonb_array_elements(coalesce(payload->'checklist','[]')) i where i->>'requiredBy' = 'shaam'))) then
    raise exception 'FAIL H side effects left behind'; end if;
  j := public.prepare_request_for_signing(v_r, true);
  if not (j->>'ok')::boolean or j#>>'{documents,0,action}' <> 'upload' then raise exception 'FAIL H ask %', j; end if;

  -- ══ I · צירוף משרד אחרי השליחה ⇒ הלקוח נשאל לאשר ═══════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'I';
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
  values (v_c || '-wa', v_owner, v_c, 'qa/208/i/wa', 'whatsapp.jpg', 'image/jpeg', 1, 'id_card', v_label);
  update public.representation_requests set status = 'pending_signature',
         execution = execution || jsonb_build_object('signatureEmailSentAt', now()) where id = v_r;
  j := public.office_attach_identity_doc(v_r, 'client', v_c || '-wa');
  if not (j->>'ok')::boolean then raise exception 'FAIL I attach %', j; end if;
  if not exists (select 1 from public.onboarding_steps where client_id = v_c and step_type = 'custom_request'
                   and payload#>>'{shaamIdentity,documentIds,0}' = v_c || '-wa' and status = 'pending') then
    raise exception 'FAIL I no confirm step after office attach'; end if;
  if (select identity_docs#>>'{client,0,clientConfirmedAt}' from public.representation_requests where id = v_r) is not null then
    raise exception 'FAIL I office attach counted as client confirmation'; end if;

  -- ══ J · כתיבה של הדפדפן לא דורסת את מעקב שע״ם ════════════════════════════════
  select client, req into v_c, v_r from qa_fx where tag = 'J';
  execute 'set local role authenticated';
  update public.representation_requests set execution = (execution - 'shaam') || '{"signatureEmailSentAt":"2026-09-28T12:00:00Z"}'::jsonb where id = v_r;
  execute 'reset role';
  select execution into j from public.representation_requests where id = v_r;
  if j#>>'{shaam,person:client,requestNumber}' is null then raise exception 'FAIL J browser wiped execution.shaam %', j; end if;
  if j->>'signatureEmailSentAt' is null then raise exception 'FAIL J browser write of other keys lost %', j; end if;

  raise exception 'ALL_OK';
end
$t$;`;

try {
  await writeStaging(sql);
  console.error('✗ הבלוק הסתיים בלי ALL_OK — משהו לא רץ');
  process.exit(1);
} catch (e) {
  if (String(e.message).includes('ALL_OK')) {
    console.log('✓ 208: העלאה / אישור / החלפה, «ממתין לחתימה», הסרה לפני ואחרי טופס, אין שליחה של הישן, היסטוריה ויצירה מחדש, עצירה על צילום לא משויך, צירוף משרד, ומעקב שע״ם מוגן (הכול התגלגל לאחור)');
  } else {
    console.error('✗', e.message);
    process.exit(1);
  }
}
