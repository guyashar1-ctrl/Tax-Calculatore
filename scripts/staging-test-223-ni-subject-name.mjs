#!/usr/bin/env node
/**
 * staging-test-223-ni-subject-name.mjs — שם הנושא בבקשת «ייצוג בביטוח לאומי — X»
 * נגזר מהכרטיס (223).
 *
 * ‼ שום דבר לא נשמר: המיגרציה, הנתונים והבדיקות רצים בבקשה אחת, והבלוק
 * האחרון זורק חריגה שנושאת את התוצאות — כל הטרנזקציה מתגלגלת אחורה.
 *
 * מה נבדק (גיא, 6.10.2026 — «למה לא מופיע השם יאיר, רק בן הזוג?»):
 *   · בקשה שנוצרה כשבכרטיס אין שם לבן הזוג ⇐ «בן/בת הזוג»; השם מוזן ⇐ הכותרת
 *     והנושא מתעדכנים, גם בדף האישי של הלקוח.
 *   · תיקון שם נוסף ⇐ מתעדכן שוב. שינוי שם הלקוח ⇐ הבקשה שלו מתעדכנת.
 *   · כותרת שנערכה ביד נשארת. בקשה שהושלמה — היסטוריה, חוץ מממלא-מקום.
 *     בקשה מבוטלת — לא נוגעים. עדכון שלא נוגע בשם — לא נוגע בבקשה.
 *   · הפונקציה אינה חשופה ל-anon/authenticated.
 *
 * הרצה:  node scripts/staging-test-223-ni-subject-name.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const MIGRATION = readFileSync(resolve(ROOT, 'supabase/223-ni-subject-name-from-card.sql'), 'utf8');

const TEST = String.raw`
do $test$
declare
  uid     uuid := '${USER_ID}';
  cid     text;
  rid     text;
  res     jsonb;
  out     jsonb := '[]'::jsonb;
  pay     jsonb;
  step_c  text;
  step_s  text;
  v       text;
  ver0    int;
  ver1    int;
  upd0    timestamptz;
  upd1    timestamptz;
  portal  text;
begin
  -- ── לקוח בדיקה: נשוי, עם בקשת ייצוג, בלי שם לבן הזוג ───────────────────────
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
         first_name = 'הדסה', last_name = 'בדיקה', spouse_first_name = null, spouse_last_name = null, spouse_name = null,
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
  out := out || jsonb_build_object('t', '0 שתי הבקשות נוצרו', 'pass', step_c is not null and step_s is not null, 'got', res);

  -- ══ 1 · נוצרה בלי שם — כמו אצל הדסה ב-9.9 ════════════════════════════════
  select payload into pay from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '1 בלי שם בכרטיס ⇐ «בן/בת הזוג» (המצב שגיא ראה)', 'pass',
    pay->>'title' = 'ייצוג בביטוח לאומי — בן/בת הזוג', 'got', pay->>'title');
  select client_content_version, updated_at into ver0, upd0 from public.onboarding_steps where id = step_s;

  -- ══ 2 · השם מוזן בכרטיס ⇐ הבקשה מתעדכנת ═════════════════════════════════
  update public.clients set spouse_first_name = 'יאיר', spouse_last_name = 'בדיקה' where id = cid;
  select payload into pay from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '2 הכותרת נושאת את השם', 'pass',
    pay->>'title' = 'ייצוג בביטוח לאומי — יאיר בדיקה', 'got', pay->>'title');
  out := out || jsonb_build_object('t', '2 הנושא נושא את השם', 'pass', pay->>'subjectName' = 'יאיר בדיקה', 'got', pay->>'subjectName');
  out := out || jsonb_build_object('t', '2 התפקיד נשאר spouse', 'pass', pay->>'subjectRole' = 'spouse', 'got', pay->>'subjectRole');
  select client_content_version into ver1 from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '2 גרסת התוכן ללקוח עלתה (הטקסט שהוא רואה השתנה)', 'pass', ver1 = ver0 + 1, 'got', jsonb_build_array(ver0, ver1));

  -- ══ 3 · הדף האישי מציג את השם ══════════════════════════════════════════════
  portal := public.build_client_portal(cid, 'live')::text;
  out := out || jsonb_build_object('t', '3 בדף האישי — «ייצוג בביטוח לאומי — יאיר בדיקה»', 'pass',
    position('ייצוג בביטוח לאומי — יאיר בדיקה' in portal) > 0, 'got', left(portal, 300));
  out := out || jsonb_build_object('t', '3 בדף האישי — אין «בן/בת הזוג»', 'pass',
    position('ייצוג בביטוח לאומי — בן/בת הזוג' in portal) = 0, 'got', null);

  -- ══ 4 · תיקון שם נוסף, ושם הלקוח עצמו ═════════════════════════════════════
  update public.clients set spouse_first_name = 'יאיר-מאיר' where id = cid;
  select payload->>'title' into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '4 תיקון שני — הכותרת עוקבת', 'pass', v = 'ייצוג בביטוח לאומי — יאיר-מאיר בדיקה', 'got', v);
  update public.clients set last_name = 'בדיקה-חדש' where id = cid;
  select payload->>'title' into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '4 שם הלקוח השתנה — הבקשה שלו עוקבת', 'pass', v = 'ייצוג בביטוח לאומי — הדסה בדיקה-חדש', 'got', v);

  -- ══ 5 · עדכון שלא נוגע בשם — לא נוגע בבקשה ═══════════════════════════════
  select updated_at into upd0 from public.onboarding_steps where id = step_s;
  update public.clients set phone = coalesce(phone, '') || '' , notes = coalesce(notes,'') || ' ' where id = cid;
  select updated_at into upd1 from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '5 עדכון טלפון/הערות — הבקשה לא זזה', 'pass', upd1 = upd0, 'got', jsonb_build_array(upd0, upd1));

  -- ══ 6 · כותרת שנערכה ביד נשארת ═════════════════════════════════════════════
  update public.onboarding_steps set payload = payload || '{"title":"ביטוח לאומי של יאיר — כותרת ידנית"}'::jsonb where id = step_s;
  update public.clients set spouse_first_name = 'יאיר' where id = cid;
  select payload into pay from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '6 כותרת ידנית לא נדרסת', 'pass', pay->>'title' = 'ביטוח לאומי של יאיר — כותרת ידנית', 'got', pay->>'title');
  out := out || jsonb_build_object('t', '6 …אבל הנושא כן מתעדכן', 'pass', pay->>'subjectName' = 'יאיר בדיקה', 'got', pay->>'subjectName');

  -- ══ 7 · בקשה שהושלמה — היסטוריה; ממלא-מקום כן מתמלא ═══════════════════════
  update public.onboarding_steps set status = 'completed',
         payload = payload || '{"title":"ייצוג בביטוח לאומי — יאיר בדיקה"}'::jsonb where id = step_s;
  update public.clients set spouse_first_name = 'שם-אחר' where id = cid;
  select payload->>'title' into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '7 הושלמה עם שם אמיתי — לא משוכתבת', 'pass', v = 'ייצוג בביטוח לאומי — יאיר בדיקה', 'got', v);
  update public.onboarding_steps
     set payload = payload || '{"title":"ייצוג בביטוח לאומי — בן/בת הזוג","subjectName":"בן/בת הזוג"}'::jsonb where id = step_s;
  update public.clients set spouse_first_name = 'יאיר' where id = cid;
  select payload->>'title' into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '7 הושלמה עם «בן/בת הזוג» — השם ממולא', 'pass', v = 'ייצוג בביטוח לאומי — יאיר בדיקה', 'got', v);

  -- ══ 8 · בקשה מבוטלת — לא נוגעים ════════════════════════════════════════════
  update public.onboarding_steps set status = 'cancelled' where id = step_c;
  update public.clients set first_name = 'הדס' where id = cid;
  select payload->>'title' into v from public.onboarding_steps where id = step_c;
  out := out || jsonb_build_object('t', '8 מבוטלת — הכותרת לא זזה', 'pass', v = 'ייצוג בביטוח לאומי — הדסה בדיקה-חדש', 'got', v);

  -- ══ 9 · השם נמחק מהכרטיס — לא חוזרים לממלא-מקום ═══════════════════════════
  update public.onboarding_steps set status = 'pending' where id = step_s;
  update public.clients set spouse_first_name = null, spouse_last_name = null, spouse_name = null where id = cid;
  select payload->>'title' into v from public.onboarding_steps where id = step_s;
  out := out || jsonb_build_object('t', '9 שם שנמחק — השם האחרון הידוע נשאר', 'pass', v = 'ייצוג בביטוח לאומי — יאיר בדיקה', 'got', v);

  -- ══ 10 · הרשאות ═══════════════════════════════════════════════════════════
  out := out || jsonb_build_object('t', '10 anon לא מריץ', 'pass',
    not has_function_privilege('anon', 'public.refresh_authority_rep_subject_names(text)', 'EXECUTE'), 'got', null);
  out := out || jsonb_build_object('t', '10 authenticated לא מריץ', 'pass',
    not has_function_privilege('authenticated', 'public.refresh_authority_rep_subject_names(text)', 'EXECUTE'), 'got', null);

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
const results = JSON.parse(m[1].slice(0, m[1].lastIndexOf(']') + 1));
let pass = 0, fail = 0;
for (const x of results) {
  if (x.pass) { pass++; console.log(`  ✓ ${x.t}`); }
  else { fail++; console.log(`  ✗ ${x.t} — ${JSON.stringify(x.got)}`); }
}
console.log(`\n${pass} עברו · ${fail} נכשלו · הכול התגלגל אחורה (שום דבר לא נשמר ב-staging)`);
process.exit(fail ? 1 : 0);
