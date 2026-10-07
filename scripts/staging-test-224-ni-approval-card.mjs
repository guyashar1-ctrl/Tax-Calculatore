#!/usr/bin/env node
/**
 * staging-test-224-ni-approval-card.mjs — אישור ייפוי הכוח בב"ל בדף האישי (224).
 *
 * ‼ שום דבר לא נשמר: 223 + 224 + הנתונים + הבדיקות רצים בבקשה אחת, והבלוק
 * האחרון זורק חריגה שנושאת את התוצאות — הכול מתגלגל אחורה.
 *
 * מה נבדק (גיא, 7.10.2026 — «מהתמונה לא ברור שיאיר צריך לעשות את הפעולה»):
 *   · בן/בת הזוג ⇒ פעולה (לא הודעה), forPerson = השם, הכותרת והאסמכתא בשמו,
 *     ו«האישור של הדסה כבר התקבל» רק כשהשלב שלה באמת הושלם.
 *   · בעל הדף ⇒ פעולה שלו, «שלך», ו«לכל אחד מבני הזוג…» כשהשני עוד בתהליך.
 *   · לקוח יחיד ⇒ בלי משפט על בן/בת זוג.
 *   · שאר המצבים (בטיפול/הושלם) לא זזו. הנוסח המבלבל לא נשאר.
 *
 * הרצה:  node scripts/staging-test-224-ni-approval-card.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const M223 = readFileSync(resolve(ROOT, 'supabase/223-ni-subject-name-from-card.sql'), 'utf8');
const M224 = readFileSync(resolve(ROOT, 'supabase/224-ni-approval-portal-card.sql'), 'utf8');

const TEST = String.raw`
do $test$
declare
  uid     uuid := '${USER_ID}';
  cid     text;
  rid     text;
  res     jsonb;
  out     jsonb := '[]'::jsonb;
  step_c  text;
  step_s  text;
  portal  jsonb;
  it      jsonb;
  v       text;
begin
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
         first_name = 'הדסה', last_name = 'בדיקה', spouse_first_name = 'יאיר', spouse_last_name = 'בדיקה', spouse_name = null,
         authority_representations = (coalesce(authority_representations, '{}'::jsonb) - 'nationalInsurance'),
         tax_files = coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(tax_files,'[]'::jsonb)) f
                                where f->>'authority' <> 'national_insurance'), '[]'::jsonb)
   where id = cid;
  update public.representation_requests
     set execution = (coalesce(execution, '{}'::jsonb) - 'nationalInsurance' - 'nationalInsuranceSpouse' - 'reminders')
   where id = rid;

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.request_authority_representation(cid, 'national_insurance', 'client', 'test');
  step_c := res->>'stepId';
  res := public.request_authority_representation(cid, 'national_insurance', 'spouse', 'test');
  step_s := res->>'stepId';

  -- ══ 1 · כמו אצל הדסה: היא אישרה, יאיר ממתין ══════════════════════════════
  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb)
       || jsonb_build_object('nationalInsurance', jsonb_build_object('enteredAt', now(), 'referenceNumber', '75165449',
            'instructionsSentAt', now(), 'confirmedAt', now()))
       || jsonb_build_object('nationalInsuranceSpouse', jsonb_build_object('enteredAt', now(), 'referenceNumber', '75074203',
            'deadline', '2026-11-15', 'instructionsSentAt', now()))
   where id = rid;
  select status into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '0 השלב של הדסה הושלם', 'pass', v = 'completed', 'got', v);
  select status into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '0 השלב של יאיר ממתין', 'pass', v = 'waiting_client', 'got', v);

  portal := public.build_client_portal(cid, 'live');
  select x into it from jsonb_array_elements(portal->'items') x where x->>'key' = 'authrep_' || step_s;
  out := out || jsonb_build_object('t', '1 יאיר — פעולה, לא הודעה', 'pass', it->>'bucket' = 'action' and it->>'kind' = 'ni_approval', 'got', it);
  out := out || jsonb_build_object('t', '1 forPerson = יאיר', 'pass', it->>'forPerson' = 'יאיר', 'got', it->>'forPerson');
  out := out || jsonb_build_object('t', '1 הכותרת בשמו', 'pass', it->>'label' = 'יאיר — אישור ייפוי הכוח בביטוח הלאומי', 'got', it->>'label');
  out := out || jsonb_build_object('t', '1 «האישור של הדסה כבר התקבל»', 'pass',
    it->>'assurance' = 'האישור של הדסה כבר התקבל. האישור הזה הוא של יאיר, במספר נפרד.', 'got', it->>'assurance');
  out := out || jsonb_build_object('t', '1 האסמכתא של יאיר — המספר שלו', 'pass',
    it->'refs'->0->>'label' = 'מספר האסמכתא של יאיר' and it->'refs'->0->>'value' = '75074203', 'got', it->'refs');
  out := out || jsonb_build_object('t', '1 לאשר עד 15.11.2026', 'pass',
    it->'refs'->1->>'label' = 'לאשר עד' and it->'refs'->1->>'value' = '15.11.2026', 'got', it->'refs');
  out := out || jsonb_build_object('t', '1 איך מאשרים — בשמו', 'pass',
    position('תעודת הזהות של יאיר' in it->>'noteAfter') > 0 and position('כרטיס אשראי של יאיר' in it->>'noteAfter') > 0, 'got', it->>'noteAfter');
  out := out || jsonb_build_object('t', '1 הטלפון מבודד ולא נשבר', 'pass',
    position(chr(8294) || '02' || chr(8209) || '5393740' || chr(8297) in it->>'noteAfter') > 0, 'got', it->>'noteAfter');
  out := out || jsonb_build_object('t', '1 הקישור והתווית', 'pass',
    it->>'linkUrl' like 'https://b2b.btl.gov.il/%' and it->>'linkLabel' = 'לאישור באתר הביטוח הלאומי', 'got', it->>'linkLabel');
  out := out || jsonb_build_object('t', '1 אין «אם ההודעה לא הגיעה» בדף', 'pass',
    position('אם ההודעה לא הגיעה' in portal::text) = 0, 'got', null);
  out := out || jsonb_build_object('t', '1 אין «הודעה» ב"ל בדף', 'pass',
    not exists (select 1 from jsonb_array_elements(portal->'items') x where x->>'key' like 'authrep_%' and x->>'kind' = 'message'), 'got', null);
  select x into it from jsonb_array_elements(portal->'items') x where x->>'key' = 'authrep_' || step_c;
  out := out || jsonb_build_object('t', '1 של הדסה — «הושלם» כמו קודם', 'pass',
    it->>'bucket' = 'done' and it->>'label' = 'ייצוג בביטוח לאומי — הדסה בדיקה · אושר', 'got', it);

  -- ══ 2 · הפוך: הדסה ממתינה, יאיר עוד בטיפול המשרד ══════════════════════════
  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb)
       || jsonb_build_object('nationalInsurance', jsonb_build_object('enteredAt', now(), 'referenceNumber', '75165449',
            'deadline', '2026-11-20', 'instructionsSentAt', now()))
       || jsonb_build_object('nationalInsuranceSpouse', jsonb_build_object('enteredAt', now()))
   where id = rid;
  update public.clients set tax_files = coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(tax_files,'[]'::jsonb)) f
                                where f->>'authority' <> 'national_insurance'), '[]'::jsonb)
                                || '[{"id":"tf-224-c","authority":"national_insurance","owner":"client","repStatus":"pending"},
                                     {"id":"tf-224-s","authority":"national_insurance","owner":"spouse","repStatus":"pending"}]'::jsonb
   where id = cid;
  update public.onboarding_steps set status = 'waiting_client', completed_at = null where id = step_c;
  perform public.sync_authority_representation_steps(cid);
  select status into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '2 הדסה ממתינה', 'pass', v = 'waiting_client', 'got', v);
  portal := public.build_client_portal(cid, 'live');
  select x into it from jsonb_array_elements(portal->'items') x where x->>'key' = 'authrep_' || step_c;
  out := out || jsonb_build_object('t', '2 הדסה — פעולה שלה, בלי forPerson', 'pass',
    it->>'bucket' = 'action' and it->>'kind' = 'ni_approval' and not (it ? 'forPerson'), 'got', it);
  out := out || jsonb_build_object('t', '2 הכותרת בלי שם', 'pass', it->>'label' = 'אישור ייפוי הכוח בביטוח הלאומי', 'got', it->>'label');
  out := out || jsonb_build_object('t', '2 «מספר האסמכתא שלך»', 'pass',
    it->'refs'->0->>'label' = 'מספר האסמכתא שלך' and it->'refs'->0->>'value' = '75165449', 'got', it->'refs');
  out := out || jsonb_build_object('t', '2 «לכל אחד מבני הזוג…» כשהשני בתהליך', 'pass',
    it->>'assurance' = 'לכל אחד מבני הזוג מספר אסמכתא נפרד ואישור נפרד.', 'got', it->>'assurance');
  out := out || jsonb_build_object('t', '2 איך מאשרים — «שלך»', 'pass',
    position('תעודת הזהות שלך' in it->>'noteAfter') > 0, 'got', it->>'noteAfter');
  select x into it from jsonb_array_elements(portal->'items') x where x->>'key' = 'authrep_' || step_s;
  out := out || jsonb_build_object('t', '2 יאיר בטיפול המשרד — כמו קודם', 'pass',
    it->>'bucket' = 'office' and it->>'label' = 'ייצוג בביטוח לאומי — יאיר בדיקה', 'got', it);

  -- ══ 3 · לקוח יחיד — בלי משפט על בן/בת זוג ═════════════════════════════════
  update public.onboarding_steps set status = 'cancelled' where id = step_s;
  portal := public.build_client_portal(cid, 'live');
  select x into it from jsonb_array_elements(portal->'items') x where x->>'key' = 'authrep_' || step_c;
  out := out || jsonb_build_object('t', '3 בלי בן/בת זוג — בלי assurance', 'pass',
    it->>'kind' = 'ni_approval' and not (it ? 'assurance'), 'got', it);

  -- ══ 4 · בלי מועד — רק שורת האסמכתא ═══════════════════════════════════════
  update public.representation_requests
     set execution = jsonb_set(execution, '{nationalInsurance}', (execution->'nationalInsurance') - 'deadline')
   where id = rid;
  portal := public.build_client_portal(cid, 'live');
  select x into it from jsonb_array_elements(portal->'items') x where x->>'key' = 'authrep_' || step_c;
  out := out || jsonb_build_object('t', '4 בלי מועד — שורה אחת', 'pass', jsonb_array_length(it->'refs') = 1, 'got', it->'refs');

  raise exception 'RESULTS:%', out::text;
end;
$test$;
`;

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: M223 + '\n' + M224 + '\n' + TEST }),
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
const results = JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1));
let pass = 0, fail = 0;
for (const x of results) {
  if (x.pass) { pass++; console.log(`  ✓ ${x.t}`); }
  else { fail++; console.log(`  ✗ ${x.t} — ${JSON.stringify(x.got)}`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו · הכול התגלגל אחורה (שום דבר לא נשמר ב-staging)`);
process.exit(fail ? 1 : 0);
