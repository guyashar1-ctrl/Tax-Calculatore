#!/usr/bin/env node
/**
 * staging-test-shaam-required-documents.mjs — שער הרגרסיה של 204.
 *
 * ‼ מה המבחן הזה שומר שלא יחזור:
 *   ① הבעלים של דרישת שע״ם = הת.ז. בכותרת המסך ⇒ אדם אחד בכרטיס (לא התפקיד).
 *      ת.ז. שאינה אדם אחד ⇒ needs_document_assignment, בלי בקשת מסמך מנוחשת.
 *   ② בקשת מסמך אחת, מסומנת requiredBy='shaam' — גם בהרצה חוזרת, וגם כשפריט
 *      באותו מפתח סומן «הושלם» בלי מסמך (נפתח מחדש במקום, לא שכפול).
 *   ③ מסמך של אדם אחד אינו מספק דרישה של אחר.
 *   ④ idOrLicense: רישיון נהיגה של אותו אדם מספק.
 *   ⑤ המשימה שעצרה על מסמך ⇒ documentsGate עמיד; המסמך הנכון מגיע ⇒ **בדיוק**
 *      משימת שידור חדשה אחת; מסמך נוסף אחר כך ⇒ לא שנייה.
 *   ⑥ משימה שנגעה בשע״ם (externalAttempt) לעולם אינה בסיס להמשך.
 *   ⑦ באג ה-NULL של 191: צילום של אחד לא סוגר את הפריט של השני.
 *   ⑧ צירוף במשרד: לאדם שנבחר; מסמך שרשום לאחד לא יירשם לשני.
 *   ⑨ המסמך לעובד — רק בגבול המשימה שהוא מחזיק, ורק של האדם שבכותרת.
 *   ⑩ הדף האישי: «נדרש על ידי רשות המסים להשלמת הייצוג» רק על פריט של שע״ם.
 *
 * הכול רץ בבלוק DO אחד שמסתיים ב-raise exception 'ALL_OK' — כל מה שנוצר
 * מתגלגל לאחור, ו-staging נשאר בדיוק כפי שהיה. שום מייל, שום פנייה לשע״ם.
 *
 * הרצה:  node scripts/staging-test-shaam-required-documents.mjs
 * דורש: מיגרציה 204 על staging.
 */
import { writeStaging } from './staging-lib.mjs';

const sql = `
do $t$
declare
  v_owner  uuid;
  v_client text := 'qa204-' || substr(md5(random()::text), 1, 8);
  v_req    text := v_client || '-req';
  v_step   text := replace(gen_random_uuid()::text, '-', '');
  v_cid    text := '000000182';   -- הנישום
  v_sid    text := '000000273';   -- בן/בת הזוג (הרשום/ה בבקשה הזו)
  v_label  uuid;
  v_doc_client text := v_client || '-d-client';
  v_doc_lic    text := v_client || '-d-lic';
  v_doc_extra  text := v_client || '-d-extra';
  v_doc_pass   text := v_client || '-d-pass';
  v_job    text;
  v_job2   text;
  r        record;
  j        jsonb;
  cl       jsonb;
  v_n      int;
  v_txt    text;
begin
  select user_id into v_owner from public.representation_requests limit 1;
  select id into v_label from public.document_labels where user_id = v_owner limit 1;
  if v_label is null then select id into v_label from public.document_labels limit 1; end if;

  insert into public.clients (id, user_id, first_name, last_name, family_status, id_number,
                              spouse_id_number, spouse_first_name, spouse_last_name)
  values (v_client, v_owner, 'אריאל', 'בדיקה', 'married', v_cid, v_sid, 'דנה', 'בדיקה');
  insert into public.representation_requests (id, user_id, linked_client_id, status, authorities, execution, identity_docs)
  values (v_req, v_owner, v_client, 'awaiting_stamp', array['incomeTax'],
          jsonb_build_object('shaam', jsonb_build_object('person:spouse', jsonb_build_object('requestNumber', '2026000001'))),
          null);
  update public.clients set representation_request_id = v_req where id = v_client;
  insert into public.onboarding_steps (id, user_id, client_id, step_type, track, scope, status, payload, published_at)
  values (v_step, v_owner, v_client, 'client_documents', 'custom', 'person', 'pending',
          jsonb_build_object('checklist', jsonb_build_array(
            jsonb_build_object('key', 'id_card', 'label', 'צילום תעודת זהות', 'done', false))), now());
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
  values (v_doc_client, v_owner, v_client, 'qa/204/a', 'client-id.jpg', 'image/jpeg', 1, 'id_card', v_label),
         (v_doc_lic,    v_owner, v_client, 'qa/204/b', 'spouse-license.jpg', 'image/jpeg', 1, 'drivers_license', v_label),
         (v_doc_extra,  v_owner, v_client, 'qa/204/c', 'spouse-back.png', 'image/png', 1, 'drivers_license', v_label),
         (v_doc_pass,   v_owner, v_client, 'qa/204/d', 'passport.heic', 'image/heic', 1, 'id_card', v_label);

  -- ① מיפוי הכותרת
  if public.shaam_person_for_entity(v_client, v_cid) is distinct from 'client' then raise exception 'FAIL map client'; end if;
  if public.shaam_person_for_entity(v_client, '0' || ltrim(v_sid, '0')) is distinct from 'spouse' then raise exception 'FAIL map spouse (leading zero)'; end if;
  if public.shaam_person_for_entity(v_client, '111111118') is not null then raise exception 'FAIL map stranger'; end if;

  -- ⑦ באג ה-NULL: צילום של הנישום בלבד — פריט בן/בת הזוג (אם יש) לא נסגר.
  update public.onboarding_steps set payload = jsonb_set(payload, '{checklist}', (payload->'checklist') ||
    jsonb_build_array(jsonb_build_object('key', 'id_card_spouse', 'label', 'צילום - דנה', 'done', false)))
   where id = v_step;
  update public.representation_requests set identity_docs = jsonb_build_object('client', jsonb_build_array(
    jsonb_build_object('documentId', v_doc_client, 'docKind', 'idCard'))) where id = v_req;
  perform public.sync_identity_docs_to_client_documents(v_client);
  select payload->'checklist' into cl from public.onboarding_steps where id = v_step;
  if not coalesce((cl->0->>'done')::boolean, false) then raise exception 'FAIL client item not closed: %', cl; end if;
  if coalesce((cl->1->>'done')::boolean, false) then raise exception 'FAIL NULL-bug: spouse item closed by client photo: %', cl; end if;
  -- פריט בן/בת הזוג «הושלם» בלי מסמך (סימון ידני / באג ישן) — להמשך ②
  update public.onboarding_steps set payload = jsonb_set(payload, '{checklist,1,done}', 'true'::jsonb) where id = v_step;

  -- ② + ③ השידור קרא את המסך: הכותרת = בן/בת הזוג, שורה «תצלום ת.ז. או רישיון»
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_client, 'shaam.submit_poa',
          jsonb_build_object('submissionKey', 'person:spouse', 'role', 'spouse', 'entityId', v_sid, 'signedDocumentId', 'x'),
          'running', 'qa-w1', 1)
  returning id into v_job;
  update public.automation_jobs set progress = jsonb_build_object('shaamDocuments', jsonb_build_object(
      'observedAt', now(), 'entityId', v_sid, 'rows', jsonb_build_array(
        jsonb_build_object('slotId', 1, 'kind', 'poa', 'label', 'טופס ייפוי כוח'),
        jsonb_build_object('slotId', 2, 'kind', 'idOrLicense', 'label', 'תצלום תעודת זהות או רישיון נהיגה'))))
   where id = v_job;
  select execution #> '{shaam,person:spouse,requiredDocuments}' into j from public.representation_requests where id = v_req;
  if j->0->>'person' is distinct from 'spouse' or j->0->>'kind' is distinct from 'idOrLicense' or j->0->>'requiredBy' is distinct from 'shaam' then
    raise exception 'FAIL requiredDocuments: %', j; end if;
  -- ③ הצילום של הנישום לא סיפק את הדרישה של בן/בת הזוג
  if j->0->>'handling' not in ('requested') then raise exception 'FAIL handling (client doc must not satisfy spouse): %', j; end if;
  select payload->'checklist' into cl from public.onboarding_steps where id = v_step;
  select count(*) into v_n from jsonb_array_elements(cl) x where x->>'key' = 'id_card_spouse';
  if v_n <> 1 then raise exception 'FAIL duplicate item (reopen in place expected): %', cl; end if;
  if cl->1->>'requiredBy' is distinct from 'shaam' or coalesce((cl->1->>'done')::boolean, true) then
    raise exception 'FAIL reopened item not marked shaam/open: %', cl; end if;
  -- הרצה חוזרת של אותה קריאה ⇒ עדיין פריט אחד
  update public.automation_jobs set progress = progress || jsonb_build_object('shaamDocuments',
      (progress->'shaamDocuments') || jsonb_build_object('observedAt', now() + interval '1 second'))
   where id = v_job;
  select count(*) into v_n from public.onboarding_steps s, jsonb_array_elements(s.payload->'checklist') x
   where s.client_id = v_client and x->>'key' = 'id_card_spouse';
  if v_n <> 1 then raise exception 'FAIL duplicate item on re-read: %', v_n; end if;

  -- ⑨ המסמך לעובד: חסר ⇒ missing (לא נפילה לצילום של הנישום)
  j := public.automation_job_identity_document('qa-w1', v_job, v_sid, 'idOrLicense');
  if j->>'error' is distinct from 'missing' or j->>'person' is distinct from 'spouse' then raise exception 'FAIL worker selection missing: %', j; end if;
  j := public.automation_job_identity_document('other-worker', v_job, v_sid, 'idOrLicense');
  if j->>'error' is distinct from 'not_owner_or_finished' then raise exception 'FAIL worker boundary: %', j; end if;
  j := public.automation_job_identity_document('qa-w1', v_job, '111111118', 'idOrLicense');
  if j->>'error' is distinct from 'needs_document_assignment' then raise exception 'FAIL stranger entity: %', j; end if;

  -- ⑤ המשימה מסתיימת על המסמך ⇒ שער עמיד, והמקום מתפנה
  update public.automation_jobs set status = 'failed', error_code = 'awaiting_required_documents', finished_at = now()
   where id = v_job;
  select execution #> '{shaam,person:spouse,documentsGate}' into j from public.representation_requests where id = v_req;
  if j->>'state' is distinct from 'awaiting_required_documents' or j->>'person' is distinct from 'spouse' then
    raise exception 'FAIL gate: %', j; end if;

  -- ⑤ + ④ המסמך הנכון מגיע מהדף האישי: רישיון נהיגה של בן/בת הזוג
  update public.onboarding_steps set payload = jsonb_set(payload, '{checklist,1}',
      (payload->'checklist'->1) || jsonb_build_object('done', true, 'documentId', v_doc_lic, 'doneAt', now()))
   where id = v_step;
  select identity_docs->'spouse'->0->>'docKind' into v_txt from public.representation_requests where id = v_req;
  if v_txt is distinct from 'driverLicense' then raise exception 'FAIL docKind from category: %', v_txt; end if;
  select count(*) into v_n from public.automation_jobs
   where client_id = v_client and action_type = 'shaam.submit_poa' and status = 'queued'
     and input->>'resumedFromJobId' = v_job and input->>'submissionKey' = 'person:spouse';
  if v_n <> 1 then raise exception 'FAIL expected exactly one resume job, got %', v_n; end if;
  select id into v_job2 from public.automation_jobs where client_id = v_client and status = 'queued' and action_type = 'shaam.submit_poa';
  select execution #> '{shaam,person:spouse,documentsGate}' into j from public.representation_requests where id = v_req;
  if j->>'state' is distinct from 'resume_queued' or j->>'resumeJobId' is distinct from v_job2 then raise exception 'FAIL gate after resume: %', j; end if;

  -- ⑨ עכשיו העובד (של המשימה החדשה) מקבל את הרישיון של בן/בת הזוג
  update public.automation_jobs set status = 'running', claimed_by = 'qa-w1' where id = v_job2;
  j := public.automation_job_identity_document('qa-w1', v_job2, v_sid, 'idOrLicense');
  if (j->>'ok')::boolean is not true or j->>'docKind' is distinct from 'driverLicense'
     or j->'documents'->0->>'documentId' is distinct from v_doc_lic then raise exception 'FAIL worker selection: %', j; end if;
  j := public.automation_job_identity_document('qa-w1', v_job2, v_sid, 'passport');
  if j->>'error' is distinct from 'missing' then raise exception 'FAIL passport must not be satisfied by license: %', j; end if;
  update public.automation_jobs set status = 'queued', claimed_by = null where id = v_job2;

  -- ⑤ מסמך נוסף מגיע אחר כך (צד שני) ⇒ לא נוצרת משימה שנייה
  update public.representation_requests set identity_docs = jsonb_set(identity_docs, '{spouse}',
      (identity_docs->'spouse') || jsonb_build_array(jsonb_build_object('documentId', v_doc_extra, 'docKind', 'driverLicense')))
   where id = v_req;
  select count(*) into v_n from public.automation_jobs where client_id = v_client and action_type = 'shaam.submit_poa';
  if v_n <> 2 then raise exception 'FAIL second resume job created: % jobs', v_n; end if;
  -- ושני הצדדים יחד = אותו מסמך, לפי הסדר
  j := public.shaam_identity_documents_for(v_client, 'spouse', 'idOrLicense');
  if jsonb_array_length(j->'documents') <> 2 then raise exception 'FAIL both sides grouped: %', j; end if;

  -- ⑥ משימה שנגעה בשע״ם אינה בסיס להמשך
  update public.automation_jobs set status = 'cancelled' where id = v_job2;
  update public.automation_jobs set progress = progress || jsonb_build_object('externalAttempt', jsonb_build_object('at', now(), 'stage', 'upload_signed_form'))
   where id = v_job;
  update public.representation_requests set execution = jsonb_set(execution, '{shaam,person:spouse,documentsGate}',
      jsonb_build_object('state', 'awaiting_required_documents', 'jobId', v_job, 'person', 'spouse',
        'rows', jsonb_build_array(jsonb_build_object('slotId', 2, 'kind', 'idOrLicense'))))
   where id = v_req;
  update public.representation_requests set identity_docs = jsonb_set(identity_docs, '{spouse}',
      (identity_docs->'spouse') || jsonb_build_array(jsonb_build_object('documentId', v_doc_client || 'x', 'docKind', 'idCard')))
   where id = v_req;
  select count(*) into v_n from public.automation_jobs where client_id = v_client and action_type = 'shaam.submit_poa' and status = 'queued';
  if v_n <> 0 then raise exception 'FAIL resumed from a job that touched SHAAM'; end if;

  -- ⑪ בלי שיוך: ת.ז. בכותרת שאינה אדם בכרטיס ⇒ אין בקשת מסמך
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_client, 'shaam.submit_poa', jsonb_build_object('submissionKey', 'person:client', 'role', 'client'), 'running', 'qa-w1', 1)
  returning id into v_job2;
  update public.automation_jobs set progress = jsonb_build_object('shaamDocuments', jsonb_build_object(
      'entityId', '111111118', 'rows', jsonb_build_array(jsonb_build_object('slotId', 5, 'kind', 'passport', 'label', 'צילום דרכון'))))
   where id = v_job2;
  select execution #> '{shaam,person:client,requiredDocuments}' into j from public.representation_requests where id = v_req;
  if j->0->>'handling' is distinct from 'needs_document_assignment' or j->0->>'person' is not null then raise exception 'FAIL unassignable: %', j; end if;
  select count(*) into v_n from public.onboarding_steps s, jsonb_array_elements(s.payload->'checklist') x
   where s.client_id = v_client and x->>'key' like 'passport%';
  if v_n <> 0 then raise exception 'FAIL guessed a passport request'; end if;
  update public.automation_jobs set status = 'failed', error_code = 'needs_document_assignment' where id = v_job2;

  -- ⑧ צירוף במשרד (כבעלים): מסמך שרשום לבן/בת הזוג לא נרשם לנישום
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  j := public.office_attach_identity_doc(v_req, 'client', v_doc_lic, null);
  if j->>'reason' is distinct from 'document_belongs_to_other_person' then raise exception 'FAIL cross-person attach: %', j; end if;
  j := public.office_attach_identity_doc(v_req, 'client', v_doc_pass, 'passport');
  if (j->>'ok')::boolean is not true or j->>'docKind' is distinct from 'passport' then raise exception 'FAIL office passport attach: %', j; end if;
  -- ⑧ + המרה: דרכון HEIC ⇒ נבחר, אבל לא «בר-המרה» (העובד יעצור document_not_pdf_convertible)
  j := public.shaam_identity_documents_for(v_client, 'client', 'passport');
  if public._shaam_docs_convertible(j) then raise exception 'FAIL heic considered convertible'; end if;

  -- ⑩ הדף האישי: הערה רק על פריט של שע״ם
  j := public.build_client_portal(v_client, 'live');
  select x into cl from jsonb_array_elements(j->'items') x where x->>'key' = 'docs' limit 1;
  if cl is null then raise exception 'FAIL portal docs item missing: %', j->'items'; end if;
  select count(*) into v_n from jsonb_array_elements(cl->'checklist') x
   where x->>'note' = 'נדרש על ידי רשות המסים להשלמת הייצוג';
  if v_n <> 1 then raise exception 'FAIL portal note count %: %', v_n, cl->'checklist'; end if;
  if exists (select 1 from jsonb_array_elements(cl->'checklist') x where x->>'key' = 'id_card' and x ? 'note') then
    raise exception 'FAIL office-requested item got the SHAAM note'; end if;

  raise exception 'ALL_OK';
end
$t$;`;

try {
  await writeStaging(sql);
  console.error('✗ הבלוק הסתיים בלי ALL_OK — משהו לא רץ');
  process.exit(1);
} catch (e) {
  if (String(e.message).includes('ALL_OK')) {
    console.log('✓ 204: בעלים מהכותרת, בקשה אחת (גם בפתיחה מחדש), אדם≠אדם, רישיון מספק, שער עמיד, המשך אחד בלבד, לא אחרי נגיעה, NULL, צירוף, ודף אישי (הכול התגלגל לאחור)');
  } else {
    console.error('✗', e.message);
    process.exit(1);
  }
}
