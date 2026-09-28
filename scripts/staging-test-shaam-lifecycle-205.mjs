#!/usr/bin/env node
/**
 * staging-test-shaam-lifecycle-205.mjs — שער הרגרסיה של 205: מחזור החיים בשע״ם
 * לפי מה שנצפה במערכת החיה (28.09.2026).
 *
 * ‼ מה המבחן הזה שומר שלא יחזור:
 *   ① «ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק» (קוד 7) הוא אישור לקוח **רק**
 *      בתיק 91 — לא כל תיק שממתין לפתיחה. (גם לשורות ישנות בלי קודים.)
 *   ② «פעיל לפי רשות» (הכרעת גיא): מ"ה+מע"מ נקלטו, ניכויים ממתין לתיק שלא קיים
 *      ⇒ הבקשה פעילה; מ"ה ומע"מ active; ניכויים נשאר in_process + awaitingFileOpening
 *      (גם אחרי apply_client_representation).
 *   ③ מע"מ של שני בני הזוג לא «נגמר» מקליטה של אחד.
 *   ④ drop_shaam_authority: מסיר רשות שלא נקלטה, מסיים את הבקשה כשכל השאר פעילות,
 *      ומסרב לפעילה / לאחרונה / למשתמש זר.
 *
 * הכול בבלוק DO אחד שמסתיים ב-raise 'ALL_OK' — שום דבר לא נשאר ב-staging.
 * הרצה: node scripts/staging-test-shaam-lifecycle-205.mjs   (דורש 205 על staging)
 */
import { writeStaging } from './staging-lib.mjs';

const sql = `
do $t$
declare
  v_owner uuid;
  v_c1 text := 'qa205-' || substr(md5(random()::text), 1, 8);
  v_r1 text := v_c1 || '-req';
  v_c2 text := v_c1 || '-b';
  v_r2 text := v_c1 || '-breq';
  v_job text;
  j jsonb;
  v_status text;
  v_reps jsonb;
  v_txt text;
  rows_settled jsonb := '[
    {"systemLabel":"מס הכנסה","rawRequestState":"מסמכים אושרו","rawSystemState":"נקלט בהצלחה","fileNumber":"500011127","requestNumber":"2026900007","requestStateCode":3,"systemStateCode":5,"systemCode":1,"entityId":"500011127"},
    {"systemLabel":"מעמ","rawRequestState":"מסמכים אושרו","rawSystemState":"נקלט בהצלחה","fileNumber":"500011127","requestNumber":"2026900007","requestStateCode":3,"systemStateCode":5,"systemCode":2,"entityId":"500011127"},
    {"systemLabel":"ניכויים","rawRequestState":"מסמכים אושרו","rawSystemState":"ממתין לפתיחת התיק","fileNumber":"לא קיים תיק","requestNumber":"2026900007","requestStateCode":3,"systemStateCode":1,"systemCode":5,"entityId":"500011127","noFile":true}]';
  row_dan jsonb := '{"systemLabel":"מס הכנסה","rawRequestState":"התקבלו המסמכים","rawSystemState":"ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק","fileNumber":"500033345","requestNumber":"2026900021","requestStateCode":2,"systemStateCode":7,"systemCode":1,"suspensionEndsRaw":"ממתין לאישור לקוח","tik91":true}';
  row_7_open jsonb := '{"systemLabel":"מס הכנסה","rawSystemState":"ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק","fileNumber":"לא קיים תיק","systemStateCode":7,"systemCode":1,"suspensionEndsRaw":"לא בהשהייה","noFile":true}';
begin
  select user_id into v_owner from public.representation_requests limit 1;

  -- ① טבלת אמת
  if not public.shaam_row_awaits_client(row_dan) then raise exception 'FAIL dan (code 7 + evidence) must await client'; end if;
  if public.shaam_row_awaits_client(row_7_open) then raise exception 'FAIL code 7 without 91 evidence is NOT client approval'; end if;
  if not public.shaam_row_awaits_missing_file(row_7_open) then raise exception 'FAIL code 7 non-91 + no file = awaiting missing file'; end if;
  -- שורות ישנות (בלי קודים, מהעובד הישן)
  if public.shaam_row_awaits_client('{"rawSystemState":"ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק","suspensionEndsRaw":""}') then
    raise exception 'FAIL old combined text without evidence'; end if;
  if not public.shaam_row_awaits_client('{"rawSystemState":"ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק","suspensionEndsRaw":"ממתין לאישור לקוח"}') then
    raise exception 'FAIL old combined text with evidence'; end if;
  if not public.shaam_row_awaits_client('{"rawSystemState":"ממתין לאישור לקוח"}') then raise exception 'FAIL plain client-approval text'; end if;
  if not public.shaam_rows_settled(rows_settled) then raise exception 'FAIL settled'; end if;
  if public.shaam_rows_settled(jsonb_build_array(rows_settled -> 0, row_dan)) then raise exception 'FAIL not settled with client approval'; end if;
  if public.shaam_rows_settled('[]') or public.shaam_rows_settled(jsonb_build_array(rows_settled -> 2)) then
    raise exception 'FAIL settled needs at least one accepted'; end if;
  if public.shaam_rows_settled(jsonb_build_array(rows_settled -> 0, (rows_settled -> 2) - 'noFile' || '{"fileNumber":"500011127"}'::jsonb)) then
    raise exception 'FAIL awaiting opening of an EXISTING file is not settled'; end if;
  if public.shaam_row_authority('{"systemLabel":"מע\\"מ"}') is distinct from 'vat' then raise exception 'FAIL vat label'; end if;

  -- ② לקוח «לזימי»: מ"ה+מע"מ נקלטו, ניכויים בלי תיק
  insert into public.clients (id, user_id, first_name, last_name, family_status, id_number, representation_status, authority_representations)
  values (v_c1, v_owner, 'בדיקה', 'מאתיים-וחמש', 'single', '500011127', 'awaiting_authorities',
          '{"incomeTax":{"status":"in_process","level":"primary"},"vat":{"status":"in_process","level":"primary","targets":["client"]},"withholding":{"status":"in_process","level":"primary","targets":["client"]},"nationalInsurance":{"status":"in_process","targets":["client"]}}');
  insert into public.representation_requests (id, user_id, linked_client_id, status, authorities, execution)
  values (v_r1, v_owner, v_c1, 'awaiting_authorities', array['incomeTax','vat','withholding'],
          jsonb_build_object('shaam', jsonb_build_object('person:client', jsonb_build_object('requestNumber','2026900007','submittedAt','2026-08-27T10:00:00Z'))));
  update public.clients set representation_request_id = v_r1 where id = v_c1;
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_c1, 'shaam.check_representation', '{"submissionKey":"person:client","role":"client"}', 'running', 'qa205', 3)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
    result = jsonb_build_object('submissionKey','person:client','role','client','found',true,
      'observedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'rows', rows_settled, 'allAccepted', false, 'settled', true)
   where id = v_job;
  select status into v_status from public.representation_requests where id = v_r1;
  if v_status <> 'active' then raise exception 'FAIL settled request must become active, got %', v_status; end if;
  select authority_representations into v_reps from public.clients where id = v_c1;
  if v_reps -> 'incomeTax' ->> 'status' <> 'active' or v_reps -> 'vat' ->> 'status' <> 'active' then
    raise exception 'FAIL accepted authorities active: %', v_reps; end if;
  if v_reps -> 'withholding' ->> 'status' <> 'in_process' or not coalesce((v_reps -> 'withholding' ->> 'awaitingFileOpening')::boolean, false) then
    raise exception 'FAIL withholding must stay in_process + awaitingFileOpening (apply_client_representation): %', v_reps; end if;
  if v_reps -> 'nationalInsurance' ->> 'status' <> 'in_process' then raise exception 'FAIL NI untouched: %', v_reps; end if;

  -- ④ «לא צריך ייצוג בניכויים» — על הלקוח הזה (הבקשה כבר פעילה): הסרה מותרת (לא פעילה)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  j := public.drop_shaam_authority(v_c1, 'incomeTax');
  if j ->> 'reason' is distinct from 'already_active' then raise exception 'FAIL drop active: %', j; end if;
  j := public.drop_shaam_authority(v_c1, 'withholding');
  if (j ->> 'ok')::boolean is not true then raise exception 'FAIL drop withholding: %', j; end if;
  select authority_representations into v_reps from public.clients where id = v_c1;
  if v_reps ? 'withholding' then raise exception 'FAIL withholding removed from registry'; end if;
  select array_to_string(authorities, ',') into v_txt from public.representation_requests where id = v_r1;
  if v_txt <> 'incomeTax,vat' then raise exception 'FAIL request authorities: %', v_txt; end if;

  -- ③ + ① זוג; דן: מ"ה קוד 7 בתיק 91 ⇒ אישור לקוח; מע"מ של שניהם — לא נגמר מאחד
  insert into public.clients (id, user_id, first_name, last_name, family_status, id_number, spouse_id_number, representation_status, authority_representations)
  values (v_c2, v_owner, 'בדיקה', 'זוג-205', 'married', '500033345', '500044458', 'awaiting_authorities',
          '{"incomeTax":{"status":"in_process"},"vat":{"status":"in_process","targets":["client","spouse"]}}');
  insert into public.representation_requests (id, user_id, linked_client_id, status, authorities, execution)
  values (v_r2, v_owner, v_c2, 'awaiting_authorities', array['incomeTax','vat'], '{}'::jsonb);
  update public.clients set representation_request_id = v_r2 where id = v_c2;
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_c2, 'shaam.check_representation', '{"submissionKey":"person:client","role":"client"}', 'running', 'qa205', 3)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
    result = jsonb_build_object('submissionKey','person:client','role','client','found',true,
      'observedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'requestNumber', '2026900021',
      'rows', jsonb_build_array(row_dan, '{"systemLabel":"מעמ","rawSystemState":"נקלט בהצלחה","systemStateCode":5,"systemCode":2,"fileNumber":"500033345"}'::jsonb),
      'allAccepted', false)
   where id = v_job;
  select execution #> '{shaam,person:client}' into j from public.representation_requests where id = v_r2;
  if j ->> 'requestNumber' is distinct from '2026900021' then raise exception 'FAIL manual request linked by number: %', j; end if;
  if j ->> 'clientApprovalRequiredAt' is null then raise exception 'FAIL dan client approval required: %', j; end if;
  select status into v_status from public.representation_requests where id = v_r2;
  if v_status <> 'awaiting_authorities' then raise exception 'FAIL dan must not become active: %', v_status; end if;
  select authority_representations into v_reps from public.clients where id = v_c2;
  if v_reps -> 'vat' ->> 'status' = 'active' then raise exception 'FAIL couple VAT must not be active from one person: %', v_reps; end if;

  -- ① הכיוון ההפוך: קוד 7 בלי ראיה לתיק 91 ⇒ לא «אישור לקוח»
  update public.representation_requests set execution = '{}'::jsonb where id = v_r2;
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_c2, 'shaam.check_representation', '{"submissionKey":"person:spouse","role":"spouse"}', 'running', 'qa205', 3)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
    result = jsonb_build_object('submissionKey','person:spouse','role','spouse','found',true,
      'observedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'rows', jsonb_build_array(row_7_open), 'allAccepted', false)
   where id = v_job;
  select execution #> '{shaam,person:spouse}' into j from public.representation_requests where id = v_r2;
  if j ->> 'clientApprovalRequiredAt' is not null then raise exception 'FAIL code 7 non-91 marked client approval: %', j; end if;

  -- ④ סירובים
  j := public.drop_shaam_authority(v_c2, 'withholding');
  if j ->> 'reason' is distinct from 'not_requested' then raise exception 'FAIL not_requested: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  j := public.drop_shaam_authority(v_c2, 'vat');
  if j ->> 'reason' is distinct from 'forbidden' then raise exception 'FAIL forbidden: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  j := public.drop_shaam_authority(v_c2, 'vat');
  if (j ->> 'ok')::boolean is not true then raise exception 'FAIL drop couple vat: %', j; end if;
  j := public.drop_shaam_authority(v_c2, 'incomeTax');
  if j ->> 'reason' is distinct from 'last_authority' then raise exception 'FAIL last_authority: %', j; end if;

  -- ⑤ «לידיעתך» של שלב 2 נשמר כראיה על ההגשה (יצירה)
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, claimed_by, max_attempts)
  values (v_owner, v_c2, 'shaam.create_representation', '{"submissionKey":"person:spouse","role":"spouse"}', 'running', 'qa205', 1)
  returning id into v_job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
    result = '{"submissionKey":"person:spouse","role":"spouse","requestNumber":"2026900099","formDocumentId":"f205","creationNotice":"לידיעתך: יש לצרף טופס ייפוי כוח חתום וצילום תעודת זהות"}'::jsonb
   where id = v_job;
  select execution #> '{shaam,person:spouse}' into j from public.representation_requests where id = v_r2;
  if j #>> '{creationNotice,text}' is distinct from 'לידיעתך: יש לצרף טופס ייפוי כוח חתום וצילום תעודת זהות' then
    raise exception 'FAIL creationNotice: %', j; end if;

  perform public.assert_domain_function_invariants();
  raise exception 'ALL_OK';
end
$t$;`;

try {
  await writeStaging(sql);
  console.error('✗ הבלוק הסתיים בלי ALL_OK');
  process.exit(1);
} catch (e) {
  if (String(e.message).includes('ALL_OK')) {
    console.log('✓ 205: קוד 7 = אישור לקוח רק בתיק 91 · «פעיל לפי רשות» · ניכויים בלי תיק לא הופך פעיל · מע"מ זוגי · «הסר מהבקשה» (הכול התגלגל לאחור)');
  } else {
    console.error('✗', e.message);
    process.exit(1);
  }
}
