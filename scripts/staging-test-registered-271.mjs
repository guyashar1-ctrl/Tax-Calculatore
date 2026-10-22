#!/usr/bin/env node
/**
 * staging-test-registered-271.mjs — הרשום/ה נלמד/ת משע״ם, והחתימות לפיו/ה (271).
 *
 *  R1  זוג, מ"ה+מע"מ הוזנו על ת.ז. הנישום/ה, ושע״ם כתבה «הוחלף מספר התיק» ⇒ הכרטיס: תיק מ"ה
 *      של בן/בת הזוג (מספר = ת.ז. שלו/ה), registered_spouse_verified.
 *  R2  מקומות החתימה: בן/בת הזוג ב«בן זוג רשום» (x≈0.393), הנישום/ה במקום השני (x≈0.130).
 *  R3  בלי המשפט, ובלי הכרעה בכרטיס ⇒ כמו קודם: מי שהוזן ב«בן זוג רשום».
 *  R4  בלי המשפט, אבל הכרטיס מאומת שבן/בת הזוג רשום/ה ⇒ בן/בת הזוג ב«בן זוג רשום».
 *  R5  רווק/ה עם המשפט ⇒ לא לומדים כלום (הכרטיס לא משתנה).
 *  R6  (274) הלמידה נרשמת ב«פעילות» של בקשת הייצוג; כשהיא מחליפה הכרעה קודמת — עם «במקום».
 *  R7  (Fable #1) «מה מסמנים באזור האישי» אחרי ההגשה נשען על הבקשה שנפתחה בשע״ם (מ"ה+מע"מ אצל
 *      מי שהוזן/ה), לא על ההכרעה בכרטיס — אין פיצול בין הדף להגשה.
 *
 * ‼ הכול בטרנזקציה אחת שנגמרת ב-raise — staging חוזר בדיוק למה שהיה. נתוני דמה בלבד.
 * הרצה:  node scripts/staging-test-registered-271.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const SCRIPT = `
do $t$
declare
  v_out text := '';
  v_c   text; v_r text; f jsonb; v_files jsonb; v_ver boolean;
  v_notice text := 'לידיעתך, במס הכנסה הוחלף מספר התיק למספרו של בעל התיק. במע"מ הבקשה תקלט לאחר פתיחת התיק.';
  v_layout jsonb := '{"ok":true,"problems":[]}';
begin
  for i in 1..5 loop
    v_c := 'qa271c-' || i || '-' || replace(gen_random_uuid()::text, '-', '');
    v_r := 'qa271r-' || i || '-' || replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (id, user_id, first_name, last_name, id_number, family_status, spouse_name, spouse_first_name, spouse_last_name, spouse_id_number,
                                tax_files, registered_spouse_verified)
    values (v_c, '${USER_ID}', 'ישראלה', 'QA271', '000000018', case when i = 4 then 'single' else 'married' end,
            case when i = 4 then null else 'ישראל QA271' end, case when i = 4 then null else 'ישראל' end, 'QA271',
            case when i = 4 then null else '000000026' end,
            case when i = 3 then '[{"id":"t","authority":"income_tax","owner":"spouse","fileNumber":"000000026"}]'::jsonb
                 else '[{"id":"t","authority":"income_tax","owner":"client","fileNumber":"000000018"}]'::jsonb end,
            case when i in (3, 5) then true else null end);
    insert into public.representation_requests (id, user_id, linked_client_id, client_name, authorities, status, execution, signature_documents)
    values (v_r, '${USER_ID}', v_c, 'ישראלה QA271', array['incomeTax','vat'], 'awaiting_accountant',
            jsonb_build_object('shaam', jsonb_build_object('person:client', jsonb_build_object(
              'requestNumber', '2026000000', 'formDocumentId', 'qa271-doc', 'formFileName', 'f.pdf',
              'requestedSystems', '["מס הכנסה","מע\\"מ"]'::jsonb, 'formLayout', v_layout,
              'creationNotice', case when i in (1, 4, 5) then jsonb_build_object('text', v_notice) else jsonb_build_object('text', 'לידיעתך') end))),
            '[]'::jsonb);
    update public.clients set representation_request_id = v_r where id = v_c;

    perform public._rep_learn_registered_spouse(v_r, 'person:client');
    perform public._rep_prepare_signature_document(v_r, 'person:client');
    select c.tax_files, c.registered_spouse_verified into v_files, v_ver from public.clients c where c.id = v_c;
    select d -> 'fields' into f from public.representation_requests r, jsonb_array_elements(r.signature_documents) d where r.id = v_r;

    if i = 1 then
      v_out := v_out || format('R1 card_owner_spouse=%s|R1 card_file=%s|R1 verified=%s|',
        v_files -> 0 ->> 'owner' = 'spouse', v_files -> 0 ->> 'fileNumber' = '000000026', v_ver is true);
      v_out := v_out || format('R2 registered_slot_spouse=%s|R2 other_slot_client=%s|',
        exists (select 1 from jsonb_array_elements(f) x where x ->> 'kind' = 'signature' and x ->> 'signerId' = 'spouse' and (x ->> 'xPct')::numeric between 0.39 and 0.40),
        exists (select 1 from jsonb_array_elements(f) x where x ->> 'kind' = 'signature' and x ->> 'signerId' = 'client' and (x ->> 'xPct')::numeric between 0.12 and 0.14));
      v_out := v_out || format('R6 logged=%s|R6 no_instead_when_no_prior=%s|',
        exists (select 1 from public.onboarding_events e join public.onboarding_steps s on s.id = e.step_id
                 where s.client_id = v_c and e.note like '%סומן/ה בכרטיס כבן/בת הזוג הרשום/ה%'),
        not exists (select 1 from public.onboarding_events e join public.onboarding_steps s on s.id = e.step_id
                 where s.client_id = v_c and e.note like '%במקום%'));
      update public.representation_requests set status = 'awaiting_authorities' where id = v_r;
      v_out := v_out || format('R7 approval_locked_to_request=%s|',
        (select coalesce(jsonb_agg(x ->> 'person'), '[]'::jsonb) from jsonb_array_elements(public._rep_approval_people(v_c)) x) = '["client"]'::jsonb
        and (public._rep_approval_people(v_c) -> 0 -> 'systems') ? 'מס הכנסה');
    elsif i = 5 then
      v_out := v_out || format('R6 instead_of_prior=%s|R6 card_learned=%s|',
        exists (select 1 from public.onboarding_events e join public.onboarding_steps s on s.id = e.step_id
                 where s.client_id = v_c and e.note like '%במקום ישראלה%'),
        v_files -> 0 ->> 'owner' = 'spouse');
    elsif i = 2 then
      v_out := v_out || format('R3 card_unchanged=%s|R3 registered_slot_client=%s|',
        v_files -> 0 ->> 'owner' = 'client' and v_ver is null,
        exists (select 1 from jsonb_array_elements(f) x where x ->> 'kind' = 'signature' and x ->> 'signerId' = 'client' and (x ->> 'xPct')::numeric between 0.39 and 0.40));
    elsif i = 3 then
      v_out := v_out || format('R4 verified_card_wins=%s|',
        exists (select 1 from jsonb_array_elements(f) x where x ->> 'kind' = 'signature' and x ->> 'signerId' = 'spouse' and (x ->> 'xPct')::numeric between 0.39 and 0.40));
    else
      v_out := v_out || format('R5 single_untouched=%s|R5 one_signature=%s|',
        v_files -> 0 ->> 'owner' = 'client' and v_ver is null,
        (select count(*) from jsonb_array_elements(f) x where x ->> 'kind' = 'signature') = 1);
    end if;
  end loop;
  raise exception 'RESULTS:%', v_out;
end;
$t$;`;

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: SCRIPT }),
});
const text = await r.text();
const m = /RESULTS:([^"\\]*)/.exec(text);
if (!m) { console.error('✗ לא התקבלו תוצאות:', text.slice(0, 800)); process.exit(1); }
let pass = 0, fail = 0;
for (const part of m[1].split('|').filter(Boolean)) {
  const [name, val] = part.split('=');
  if (val === 'true' || val === 't') { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} (${val})`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו  (${STAGING_REF})`);
process.exitCode = fail ? 1 : 0;
