#!/usr/bin/env node
/**
 * staging-test-ni-cancel.mjs — ביטול בקשת ייצוג בביטוח לאומי לאדם (212).
 *
 * ‼ שום דבר לא נשמר: המיגרציה, הנתונים והבדיקות רצים בבקשה אחת, והבלוק
 * האחרון זורק חריגה שנושאת את התוצאות — כך שכל הטרנזקציה מתגלגלת אחורה.
 * לכן אפשר להריץ את זה על staging גם לפני שהמיגרציה הוחלה שם, ושוב ושוב.
 *
 * מה נבדק (גיא, 1.10.2026):
 *   · לפני שנשלח — מחיקה. אחרי שנשלח — רק עם אישור מפורש. מאושר — לא זמין.
 *   · גם האדם היחיד/האחרון, בלי שהמערכת «תחזיר» אותו כברירת מחדל.
 *   · האדם השני והרשויות האחרות לא זזים; האסמכתא וההיסטוריה נשמרות.
 *   · תזכורת לא נתבעת, משימה בתור מתבטלת, משימה שרצה חוסמת, משימה חדשה נדחית.
 *   · «אושר» שמגיע אחרי הביטול נדחה בגלוי; עותק ישן של הכרטיס לא מחזיר אדם.
 *   · «בטל» הכללי של שלב מופנה לנתיב הנכון.
 *
 * הרצה:  node scripts/staging-test-ni-cancel.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const MIGRATION = readFileSync(resolve(ROOT, 'supabase/212-cancel-ni-representation-subject.sql'), 'utf8');

const TEST = String.raw`
do $test$
declare
  uid      uuid := '${USER_ID}';
  cid      text;
  rid      text;
  res      jsonb;
  out      jsonb := '[]'::jsonb;
  rec      jsonb;
  files    jsonb;
  others0  jsonb;
  othfile0 jsonb;
  step_c   text;
  step_s   text;
  step_s2  text;
  v        text;
  n        int;
  ok       boolean;
  job_q    text;
  link_id  text;
begin
  -- ── לקוח בדיקה: נשוי, עם בקשת ייצוג, בלי שלבי ב"ל פתוחים ──────────────────
  select c.id, c.representation_request_id into cid, rid
    from public.clients c
    join public.representation_requests r on r.id = c.representation_request_id
   where c.user_id = uid
   order by c.created_at limit 1;
  if cid is null then raise exception 'no staging client with a representation request'; end if;

  update public.onboarding_steps set status = 'cancelled'
   where client_id = cid and step_type = 'authority_representation' and status not in ('completed','verified','skipped','cancelled');
  delete from public.automation_jobs where client_id = cid;
  update public.clients
     set family_status = 'married', spouse_client_id = null, spouse_represented_elsewhere = false,
         first_name = 'רונית', last_name = 'בדיקה-ארוכה-מאוד', spouse_first_name = 'אבנר', spouse_last_name = 'בדיקה',
         authority_representations = (coalesce(authority_representations, '{}'::jsonb) - 'nationalInsurance'),
         tax_files = coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(tax_files,'[]'::jsonb)) f
                                where f->>'authority' <> 'national_insurance'), '[]'::jsonb)
                     || '[{"id":"tf-x-c","authority":"national_insurance","owner":"client","repStatus":"none"},
                          {"id":"tf-x-s","authority":"national_insurance","owner":"spouse","repStatus":"none"}]'::jsonb
   where id = cid;
  update public.representation_requests
     set execution = (coalesce(execution, '{}'::jsonb) - 'nationalInsurance' - 'nationalInsuranceSpouse' - 'reminders')
   where id = rid;

  select authority_representations - 'nationalInsurance' into others0 from public.clients where id = cid;
  select coalesce(jsonb_agg(f), '[]'::jsonb) into othfile0
    from public.clients c, jsonb_array_elements(c.tax_files) f where c.id = cid and f->>'authority' <> 'national_insurance';

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- ══ 1 · שני האנשים מבוקשים ══════════════════════════════════════════════
  res := public.request_authority_representation(cid, 'national_insurance', 'client', 'test');
  out := out || jsonb_build_object('t', '1 בקשה ללקוח', 'pass', (res->>'ok')::boolean, 'got', res);
  step_c := res->>'stepId';
  res := public.request_authority_representation(cid, 'national_insurance', 'spouse', 'test');
  out := out || jsonb_build_object('t', '1 בקשה לבן הזוג', 'pass', (res->>'ok')::boolean, 'got', res);
  step_s := res->>'stepId';
  perform set_config('pivo.ni_rerequest', '', true);
  select authority_representations->'nationalInsurance' into rec from public.clients where id = cid;
  out := out || jsonb_build_object('t', '1 שניהם ברשימה', 'pass', rec->'targets' = '["client","spouse"]'::jsonb, 'got', rec);

  -- קישור השלמת פרטים פתוח על השלב של בן הזוג
  insert into public.request_participant_links
    (user_id, step_id, client_id, participant_role, recipient_role, requirement_key, field_keys, token, expires_at)
  values (uid, step_s, cid, 'spouse', 'spouse', 'ni_poa', array['spouseIdNumber'], 'tok-212-' || md5(random()::text), now() + interval '7 days')
  returning id into link_id;

  -- ══ 2 · לפני שליחה: מחיקה של בן הזוג ════════════════════════════════════
  res := public.cancel_authority_representation(cid, 'national_insurance', 'spouse');
  out := out || jsonb_build_object('t', '2 מחיקה לפני שליחה מצליחה', 'pass', (res->>'ok')::boolean and res->>'stage' = 'not_sent', 'got', res);
  select authority_representations->'nationalInsurance', tax_files into rec, files from public.clients where id = cid;
  out := out || jsonb_build_object('t', '2 בן הזוג יצא מהרשימה, הלקוח נשאר', 'pass', rec->'targets' = '["client"]'::jsonb, 'got', rec);
  out := out || jsonb_build_object('t', '2 סמן ביטול לבן הזוג', 'pass', (rec->'cancelled'->'spouse'->>'stage') = 'not_sent', 'got', rec->'cancelled');
  out := out || jsonb_build_object('t', '2 הרשות עדיין בתהליך', 'pass', rec->>'status' = 'in_process', 'got', rec->>'status');
  select f->>'repStatus' into v from jsonb_array_elements(files) f where f->>'authority'='national_insurance' and f->>'owner'='spouse';
  out := out || jsonb_build_object('t', '2 שורת התיק של בן הזוג חזרה ל«אין»', 'pass', v = 'none', 'got', v);
  select status into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '2 השלב של בן הזוג מבוטל', 'pass', v = 'cancelled', 'got', v);
  select status into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '2 השלב של הלקוח לא זז', 'pass', v = 'pending', 'got', v);
  select count(*) into n from public.onboarding_events where step_id = step_s and meta->>'reason' = 'deleted_before_sent';
  out := out || jsonb_build_object('t', '2 נרשם אירוע «נמחקה לפני שנשלחה»', 'pass', n = 1, 'got', n);
  select revoked_at is not null into ok from public.request_participant_links where id = link_id;
  out := out || jsonb_build_object('t', '2 קישור השלמת הפרטים בוטל', 'pass', ok, 'got', ok);

  -- ══ 3 · נשלח ללקוח: בלי אישור מפורש — לא קורה כלום ═════════════════════════
  update public.representation_requests
     set execution = execution || jsonb_build_object('nationalInsurance', jsonb_build_object(
           'enteredAt', '2026-09-20T08:00:00.000Z', 'referenceNumber', '75160001', 'deadline', '2026-12-01',
           'instructionsSentAt', '2026-09-21T08:00:00.000Z', 'instructionsSentWith', 'standalone'))
   where id = rid;
  select status into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '3 השלב נגזר ל«ממתין ללקוח»', 'pass', v = 'waiting_client', 'got', v);
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client');
  out := out || jsonb_build_object('t', '3 בלי אישור ⇒ confirm_required', 'pass', not (res->>'ok')::boolean and res->>'reason' = 'confirm_required', 'got', res);
  res := public.drop_authority_representation(cid, 'national_insurance', 'client');
  out := out || jsonb_build_object('t', '3 גם השם הישן לא מבטל בשקט', 'pass', res->>'reason' = 'confirm_required', 'got', res);
  select authority_representations->'nationalInsurance' into rec from public.clients where id = cid;
  select status into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '3 ושום דבר לא השתנה', 'pass', rec->'targets' = '["client"]'::jsonb and v = 'waiting_client', 'got', jsonb_build_object('rec', rec, 'step', v));

  -- ══ 4 · אוטומציה שרצה לאדם — חוסמת ════════════════════════════════════════
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, lease_until)
  values (uid, cid, 'btl.create_representation', '{"role":"client"}'::jsonb, 'running', now() + interval '2 minutes');
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client', true);
  out := out || jsonb_build_object('t', '4 משימה רצה ⇒ automation_running', 'pass', res->>'reason' = 'automation_running', 'got', res);
  update public.automation_jobs set lease_until = now() - interval '1 minute'
   where client_id = cid and action_type = 'btl.create_representation';
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client', true);
  out := out || jsonb_build_object('t', '4 גם כשהחכירה פגה (אולי כבר בוצע בב"ל) — חוסמת', 'pass', res->>'reason' = 'automation_running', 'got', res);
  update public.automation_jobs set status = 'needs_human', lease_until = null
   where client_id = cid and action_type = 'btl.create_representation';
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client', true);
  out := out || jsonb_build_object('t', '4 משימה שממתינה לאדם — חוסמת', 'pass', res->>'reason' = 'automation_running', 'got', res);
  update public.automation_jobs set status = 'failed', finished_at = now()
   where client_id = cid and action_type = 'btl.create_representation';

  -- משימת בדיקה בתור — תבוטל יחד עם הביטול
  insert into public.automation_jobs (user_id, client_id, action_type, input, status)
  values (uid, cid, 'btl.check_representation', '{"role":"client","referenceNumber":"75160001"}'::jsonb, 'queued')
  returning id into job_q;

  -- ══ 5 · נשלח + אישור מפורש: ביטול של האדם האחרון ═══════════════════════════
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client', true);
  out := out || jsonb_build_object('t', '5 ביטול אחרי שליחה מצליח', 'pass', (res->>'ok')::boolean and res->>'stage' = 'sent', 'got', res);
  out := out || jsonb_build_object('t', '5 מדווח שהרשות התרוקנה', 'pass', (res->>'emptied')::boolean, 'got', res);
  out := out || jsonb_build_object('t', '5 משימה אחת בתור בוטלה', 'pass', (res->>'cancelledJobs')::int = 1, 'got', res);
  select status || '/' || coalesce(error_code,'') into v from public.automation_jobs where id = job_q;
  out := out || jsonb_build_object('t', '5 המשימה בתור מסומנת subject_cancelled', 'pass', v = 'cancelled/subject_cancelled', 'got', v);
  select authority_representations->'nationalInsurance', tax_files into rec, files from public.clients where id = cid;
  out := out || jsonb_build_object('t', '5 ‼ הרשימה ריקה — הלקוח לא «חוזר» כברירת מחדל', 'pass', rec->'targets' = '[]'::jsonb and public.ni_targets_of(rec) = '[]'::jsonb, 'got', rec);
  out := out || jsonb_build_object('t', '5 הרשות כבויה (none)', 'pass', rec->>'status' = 'none', 'got', rec->>'status');
  out := out || jsonb_build_object('t', '5 שני הסמנים קיימים', 'pass', (rec->'cancelled') ? 'client' and (rec->'cancelled') ? 'spouse' and rec->'cancelled'->'client'->>'stage' = 'sent', 'got', rec->'cancelled');
  select f->>'repStatus' into v from jsonb_array_elements(files) f where f->>'authority'='national_insurance' and f->>'owner'='client';
  out := out || jsonb_build_object('t', '5 שורת התיק של הלקוח חזרה ל«אין»', 'pass', v = 'none', 'got', v);
  select execution->'nationalInsurance'->>'referenceNumber' into v from public.representation_requests where id = rid;
  out := out || jsonb_build_object('t', '5 האסמכתא נשמרה במסלול', 'pass', v = '75160001', 'got', v);
  select status || '|' || coalesce(payload->'cancelled'->>'referenceNumber','') || '|' || coalesce(payload->'cancelled'->>'stage','') into v
    from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '5 השלב מבוטל ונושא את האסמכתא', 'pass', v = 'cancelled|75160001|sent', 'got', v);
  select count(*) into n from public.onboarding_events where step_id = step_c and meta->>'reason' = 'cancelled_after_sent'
     and note like '%אינו מבטל את הבקשה בביטוח לאומי%';
  out := out || jsonb_build_object('t', '5 האירוע אומר שב"ל לא בוטל', 'pass', n = 1, 'got', n);

  -- ══ 6 · תזכורת לא נתבעת לאדם שבוטל ═══════════════════════════════════════
  out := out || jsonb_build_object('t', '6 תזכורת ללקוח שבוטל — לא נתבעת', 'pass', not public.claim_representation_reminder(rid, 'niClient', 0), 'got', null);
  out := out || jsonb_build_object('t', '6 תזכורת לבן הזוג שבוטל — לא נתבעת', 'pass', not public.claim_representation_reminder(rid, 'niSpouse', 0), 'got', null);
  select coalesce(execution->'reminders', 'null'::jsonb)::text into v from public.representation_requests where id = rid;
  out := out || jsonb_build_object('t', '6 ומונה התזכורות לא זז', 'pass', v = 'null', 'got', v);

  -- ══ 7 · «אושר» שמגיע אחרי הביטול — נדחה בגלוי ═══════════════════════════
  begin
    update public.representation_requests
       set execution = jsonb_set(execution, '{nationalInsurance,confirmedAt}', '"2026-10-01T10:00:00.000Z"')
     where id = rid;
    out := out || jsonb_build_object('t', '7 אישור ידני אחרי ביטול נדחה', 'pass', false, 'got', 'update succeeded');
  exception when others then
    out := out || jsonb_build_object('t', '7 אישור ידני אחרי ביטול נדחה', 'pass', sqlerrm = 'ni_subject_cancelled', 'got', sqlerrm);
  end;

  -- ══ 8 · משימה חדשה בב"ל לאדם שבוטל — נדחית ═════════════════════════════
  begin
    res := public.create_automation_job(cid, 'btl.check_representation', '{"role":"client","referenceNumber":"75160001"}'::jsonb);
    out := out || jsonb_build_object('t', '8 יצירת משימת בדיקה לאדם שבוטל נדחית', 'pass', false, 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', '8 יצירת משימת בדיקה לאדם שבוטל נדחית', 'pass', sqlerrm = 'ni_subject_cancelled', 'got', sqlerrm);
  end;

  -- ══ 9 · עותק ישן של הכרטיס לא מחזיר אדם ═══════════════════════════════════
  update public.clients
     set authority_representations = jsonb_set(authority_representations, '{nationalInsurance}',
           '{"status":"in_process","targets":["client","spouse"]}'::jsonb),
         tax_files = (select jsonb_agg(case when f->>'authority'='national_insurance' then f || '{"repStatus":"pending"}'::jsonb else f end)
                        from jsonb_array_elements(tax_files) f)
   where id = cid;
  select authority_representations->'nationalInsurance', tax_files into rec, files from public.clients where id = cid;
  out := out || jsonb_build_object('t', '9 כתיבה ישנה: הרשימה נשארה ריקה', 'pass', rec->'targets' = '[]'::jsonb and rec->>'status' = 'none', 'got', rec);
  out := out || jsonb_build_object('t', '9 כתיבה ישנה: הסמנים שוחזרו', 'pass', (rec->'cancelled') ? 'client' and (rec->'cancelled') ? 'spouse', 'got', rec->'cancelled');
  select count(*) into n from jsonb_array_elements(files) f where f->>'authority'='national_insurance' and f->>'repStatus' = 'pending';
  out := out || jsonb_build_object('t', '9 כתיבה ישנה: שורות התיק לא חזרו ל«בתהליך»', 'pass', n = 0, 'got', n);

  -- ══ 10 · בקשה חוזרת מפורשת לבן הזוג — הלקוח לא נגרר איתו ════════════════════
  res := public.request_authority_representation(cid, 'national_insurance', 'spouse', 'test');
  out := out || jsonb_build_object('t', '10 בקשה חוזרת לבן הזוג', 'pass', (res->>'ok')::boolean and (res->>'created')::boolean, 'got', res);
  step_s2 := res->>'stepId';
  perform set_config('pivo.ni_rerequest', '', true);
  select authority_representations->'nationalInsurance', tax_files into rec, files from public.clients where id = cid;
  out := out || jsonb_build_object('t', '10 ‼ רק בן הזוג ברשימה', 'pass', rec->'targets' = '["spouse"]'::jsonb, 'got', rec);
  out := out || jsonb_build_object('t', '10 הרשות חזרה ל«בתהליך»', 'pass', rec->>'status' = 'in_process', 'got', rec->>'status');
  out := out || jsonb_build_object('t', '10 הסמן של בן הזוג ירד, של הלקוח נשאר', 'pass', not ((rec->'cancelled') ? 'spouse') and (rec->'cancelled') ? 'client', 'got', rec->'cancelled');
  select string_agg(f->>'owner' || ':' || (f->>'repStatus'), ',' order by f->>'owner') into v
    from jsonb_array_elements(files) f where f->>'authority'='national_insurance';
  out := out || jsonb_build_object('t', '10 התיק: בן הזוג בתהליך, הלקוח לא', 'pass', v = 'client:none,spouse:pending', 'got', v);
  select status into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '10 השלב הישן נשאר מבוטל (היסטוריה)', 'pass', v = 'cancelled', 'got', v);

  -- ══ 11 · «בטל» הכללי על שלב ייצוג — מופנה ═══════════════════════════════
  res := public.advance_onboarding_step(step_s2, 'cancel', '{}'::jsonb);
  out := out || jsonb_build_object('t', '11 ביטול כללי של שלב ייצוג נדחה', 'pass', res->>'error' = 'use_representation_cancel', 'got', res);
  select status into v from public.onboarding_steps where id = step_s2;
  out := out || jsonb_build_object('t', '11 והשלב נשאר פתוח', 'pass', v not in ('cancelled'), 'got', v);
  res := public.advance_onboarding_step(step_s2, 'note', '{"note":"בדיקה"}'::jsonb);
  out := out || jsonb_build_object('t', '11 הערה עדיין עובדת', 'pass', coalesce((res->>'ok')::boolean, false), 'got', res);

  -- ══ 12 · מאושר — לא זמין, גם בשורת התיק וגם במסלול ════════════════════════
  update public.representation_requests
     set execution = execution || jsonb_build_object('nationalInsuranceSpouse', jsonb_build_object(
           'referenceNumber', '75160002', 'instructionsSentAt', '2026-09-22T08:00:00.000Z',
           'confirmedAt', '2026-09-25T08:00:00.000Z'))
   where id = rid;
  res := public.cancel_authority_representation(cid, 'national_insurance', 'spouse', true);
  out := out || jsonb_build_object('t', '12 מאושר ⇒ already_active', 'pass', res->>'reason' = 'already_active', 'got', res);
  update public.representation_requests set execution = execution #- '{nationalInsuranceSpouse,confirmedAt}' where id = rid;
  update public.clients
     set tax_files = (select jsonb_agg(case when f->>'authority'='national_insurance' and f->>'owner'='spouse'
                                             then f || '{"repStatus":"active"}'::jsonb else f end)
                        from jsonb_array_elements(tax_files) f)
   where id = cid;
  res := public.cancel_authority_representation(cid, 'national_insurance', 'spouse', true);
  out := out || jsonb_build_object('t', '12 שורת תיק «פעיל» ⇒ already_active', 'pass', res->>'reason' = 'already_active', 'got', res);

  -- ══ 13 · מי שנשאר כבר אושר כולו ⇒ הרשות «פעיל» ═══════════════════════════
  update public.clients
     set tax_files = (select jsonb_agg(case when f->>'authority'='national_insurance' and f->>'owner'='spouse'
                                             then f || '{"repStatus":"pending"}'::jsonb else f end)
                        from jsonb_array_elements(tax_files) f)
   where id = cid;
  update public.representation_requests
     set execution = jsonb_set(execution, '{nationalInsuranceSpouse,confirmedAt}', '"2026-09-25T08:00:00.000Z"')
   where id = rid;
  res := public.request_authority_representation(cid, 'national_insurance', 'client', 'test');
  perform set_config('pivo.ni_rerequest', '', true);
  out := out || jsonb_build_object('t', '13 בקשה חוזרת ללקוח', 'pass', (res->>'ok')::boolean, 'got', res);
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client');
  out := out || jsonb_build_object('t', '13 המסלול הישן (נשלח) עדיין דורש אישור', 'pass', res->>'reason' = 'confirm_required', 'got', res);
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client', true);
  out := out || jsonb_build_object('t', '13 ביטול הלקוח ⇒ הרשות הושלמה', 'pass', (res->>'ok')::boolean and (res->>'completed')::boolean, 'got', res);
  select authority_representations->'nationalInsurance' into rec from public.clients where id = cid;
  out := out || jsonb_build_object('t', '13 הסטטוס active והרשימה רק בן הזוג', 'pass', rec->>'status' = 'active' and rec->'targets' = '["spouse"]'::jsonb, 'got', rec);

  -- ══ 14 · רשויות אחרות ושורות תיק אחרות לא זזו ═══════════════════════════
  select authority_representations - 'nationalInsurance' into rec from public.clients where id = cid;
  out := out || jsonb_build_object('t', '14 רשויות אחרות זהות', 'pass', rec = others0, 'got', rec);
  select coalesce(jsonb_agg(f), '[]'::jsonb) into files
    from public.clients c, jsonb_array_elements(c.tax_files) f where c.id = cid and f->>'authority' <> 'national_insurance';
  out := out || jsonb_build_object('t', '14 שורות תיק אחרות זהות', 'pass', files = othfile0, 'got', files);

  -- ══ 15 · שגיאות שאסור שייראו כהצלחה ═══════════════════════════════════════
  res := public.cancel_authority_representation(cid, 'national_insurance', 'client', true);
  out := out || jsonb_build_object('t', '15 מי שכבר לא ברשימה ⇒ not_requested', 'pass', res->>'reason' = 'not_requested', 'got', res);
  res := public.cancel_authority_representation(cid, 'vat', 'client', true);
  out := out || jsonb_build_object('t', '15 רשות אחרת ⇒ bad_authority', 'pass', res->>'reason' = 'bad_authority', 'got', res);
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  res := public.cancel_authority_representation(cid, 'national_insurance', 'spouse', true);
  out := out || jsonb_build_object('t', '15 משתמש אחר ⇒ forbidden', 'pass', res->>'reason' = 'forbidden', 'got', res);

  -- ══ 16 · הרשאות ═══════════════════════════════════════════════════════════
  out := out || jsonb_build_object('t', '16 anon לא מריץ', 'pass',
    not has_function_privilege('anon', 'public.cancel_authority_representation(text,text,text,boolean)', 'EXECUTE'), 'got', null);
  out := out || jsonb_build_object('t', '16 authenticated מריץ', 'pass',
    has_function_privilege('authenticated', 'public.cancel_authority_representation(text,text,text,boolean)', 'EXECUTE'), 'got', null);
  out := out || jsonb_build_object('t', '16 תביעת תזכורת — רק service_role', 'pass',
    not has_function_privilege('authenticated', 'public.claim_representation_reminder(text,text,int)', 'EXECUTE'), 'got', null);

  raise exception 'RESULTS:%', out::text;
end;
$test$;
`;

// ‼ לא דרך writeStaging: היא חותכת שגיאות ל-600 תווים, והתוצאות כאן יושבות
// בתוך השגיאה. אותו פרויקט קבוע (STAGING_REF) — אין כאן נתיב לפרודקשן.
const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: MIGRATION + '\n' + TEST }),
});
const message = await r.text();
if (r.ok) {
  console.error('✋ הבקשה הסתיימה בלי לזרוק — משהו לא רץ (ואולי נשמר!). בדוק את staging.');
  process.exit(1);
}
let decoded = message;
try { decoded = JSON.parse(message).message ?? message; } catch { /* כבר טקסט */ }
const m = decoded.match(/RESULTS:(\[.*\])/s);
if (!m) {
  console.error('✋ המיגרציה או הבדיקה נכשלו לפני הסוף:\n' + decoded);
  process.exit(1);
}
// ‼ ההודעה נחתכת אחרי השורה הראשונה של CONTEXT — לוקחים עד הסוגר האחרון.
const results = JSON.parse(m[1].slice(0, m[1].lastIndexOf("]") + 1));
let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`  ✓ ${r.t}`); }
  else { fail++; console.log(`  ✗ ${r.t} — ${JSON.stringify(r.got)}`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו · הכול התגלגל אחורה (שום דבר לא נשמר ב-staging)`);
process.exit(fail ? 1 : 0);
