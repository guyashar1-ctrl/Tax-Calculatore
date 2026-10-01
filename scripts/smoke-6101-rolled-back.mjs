#!/usr/bin/env node
/**
 * smoke-6101-rolled-back.mjs — בדיקת עשן של 6101 ו«מה ב"ל רושם» מול המסד, שמתגלגלת לאחור כולה.
 *
 *   node scripts/smoke-6101-rolled-back.mjs            ← staging (ברירת מחדל)
 *   node scripts/smoke-6101-rolled-back.mjs --prod     ← פרודקשן
 *
 * ‼ הכול רץ בבלוק DO אחד שמסתיים ב-raise 'ALL_OK' — כלומר **כל** מה שנוצר בו (לקוח סינתטי,
 *   הגשה, שורה ב«בקשות», חתימה, אירועים, התראות בתור pg_net) מתבטל. שום לקוח אמיתי לא נגע,
 *   שום דבר לא נשלח החוצה (pg_net שולח רק אחרי commit; אין הרחבת http סינכרונית).
 * הבעלים: המשתמש המורשה הפעיל (בפרודקשן — רק הוא עובר את require_authorized / is_authorized).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROD_REF, STAGING_REF, loadEnv } from './staging-lib.mjs';

const PROD = process.argv.includes('--prod');
const REF = PROD ? PROD_REF : STAGING_REF;
const ownerEmail = PROD ? 'guyashar1@gmail.com' : loadEnv('.env.staging').VITE_DEV_USER_EMAIL;
const TOKEN = loadEnv('.env.local').SUPABASE_ACCESS_TOKEN;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(4);

const sql = `do $t$
declare
  v_owner uuid;
  v_client text := 'smoke6101-' || substr(md5(random()::text), 1, 10);
  r jsonb; v_f text; v_h text; v_map int; v_expect int; v_steps int;
  v_snap jsonb;
begin
  select u.id into v_owner from auth.users u join public.authorized_users a on lower(a.email) = lower(u.email)
   where lower(u.email) = lower(${q(ownerEmail)}) and a.active;
  if v_owner is null then raise exception 'FAIL owner: no active authorized owner'; end if;

  -- לקוח סינתטי (בתוך הבלוק בלבד)
  insert into public.clients (id, user_id, first_name, last_name, id_number, family_status, phone, email, city, address, lifecycle_stage)
  values (v_client, v_owner, 'בדיקת', 'עשן 6101', '012345674', 'single', '0524491120', 'smoke-6101@example.test', 'חיפה', 'הנביאים 5', 'active');

  -- המיפוי הנוכחי (פונקציה פנימית — סגורה למשתמשים, ולכן נקראת לפני המעבר)
  v_expect := (public._smart_form_template('btl-6101')->>'mappingVersion')::int;

  -- מכאן — כמו הדפדפן של הבעלים
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'email', ${q(ownerEmail)})::text, true);
  execute 'set local role authenticated';

  -- 1. רשומת ב"ל (207): אין עדיין קריאה ⇒ ok ובלי אנשים
  r := public.get_btl_portal_record(v_client);
  if coalesce((r->>'ok')::boolean, false) is not true then raise exception 'FAIL 207 get_btl_portal_record: %', r; end if;

  -- 2. פתיחה ⇒ הגשה + שורה ב«בקשות»; פתיחה שנייה ⇒ אותה הגשה
  r := public.smart_form_start(v_client, 'btl-6101', 'client', array['change']);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL start: %', r; end if;
  v_f := r->>'filingId';
  r := public.smart_form_start(v_client, 'btl-6101', 'client', array[]::text[]);
  if r->>'filingId' is distinct from v_f or (r->>'existing')::boolean is not true then raise exception 'FAIL start idempotent: %', r; end if;
  select count(*) into v_steps from public.onboarding_steps where client_id = v_client and payload ? 'smartForm';
  if v_steps <> 1 then raise exception 'FAIL requests row: % rows', v_steps; end if;

  -- 3. טיוטה במיפוי הנוכחי (209)
  select mapping_version into v_map from public.smart_form_revisions where filing_id = v_f and revision = 1;
  if v_map is distinct from v_expect then raise exception 'FAIL draft mapping: %', v_map; end if;

  -- 4. שמירה ונעילה (צילום ממסך במיפוי 1 ⇒ נדחה; במיפוי הנוכחי ⇒ ננעל)
  r := public.smart_form_save(v_f, 1, array['change'], '{}'::jsonb,
         '{"entered":{"changeToDate":"2026-10-01","hoursBefore":"25","hoursAfter":"12","incomeAfter":"7000"},"confirmed":{}}'::jsonb);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL save: %', r; end if;
  v_snap := jsonb_build_object('data', jsonb_build_object('idNumber','012345674','changeToDate','2026-10-01','hoursAfter','12','incomeAfter','7000'),
                               'blockers', '[]'::jsonb, 'template', jsonb_build_object('mappingVersion', 1));
  r := public.smart_form_lock(v_f, 1, v_snap, '[{"role":"client","name":"בדיקת עשן","idNumber":"012345674"}]'::jsonb);
  if r->>'error' is distinct from 'mapping_outdated' then raise exception 'FAIL lock old mapping not refused: %', r; end if;
  v_snap := jsonb_set(v_snap, '{template,mappingVersion}', to_jsonb(v_map));
  r := public.smart_form_lock(v_f, 1, v_snap, '[{"role":"client","name":"בדיקת עשן","idNumber":"012345674"}]'::jsonb);
  if (r->>'ok')::boolean is not true or (r->>'contentSha256') !~ '^[0-9a-f]{64}$' then raise exception 'FAIL lock: %', r; end if;
  v_h := r->>'contentSha256';

  -- 5. חתימה במשרד על התוכן שננעל (טביעה אחרת ⇒ נדחה)
  r := public.smart_form_capture_signature(v_f, 1, 'client', ${q(PNG)}, repeat('0', 64), 'נכח/ה');
  if r->>'error' is distinct from 'content_changed' then raise exception 'FAIL capture wrong hash not refused: %', r; end if;
  r := public.smart_form_capture_signature(v_f, 1, 'client', ${q(PNG)}, v_h, 'בדיקת עשן — נכח/ה וחתם/ה');
  if (r->>'ok')::boolean is not true then raise exception 'FAIL capture: %', r; end if;

  -- 6. שמירת קובץ חתום: עוברת את בדיקת המיפוי (209) ונעצרת רק כי אין מסמך כזה
  r := public.smart_form_attach_signed_pdf(v_f, 1, 'no-such-doc', repeat('a', 64));
  if r->>'error' is distinct from 'document_not_found' then raise exception 'FAIL attach guard path: %', r; end if;

  -- 7. דף החתימה הציבורי (anon): טוקן לא קיים ⇒ תשובה מסודרת, לא שגיאת הרשאה
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_smart_form_signing('not-a-real-token');
  if coalesce((r->>'ok')::boolean, true) is not false then raise exception 'FAIL anon signing page: %', r; end if;
  execute 'set local role postgres';

  -- 8. השערה הכללית של הפונקציות (מי פתוח ל-anon, search_path וכו')
  perform public.assert_domain_function_invariants();

  raise exception 'ALL_OK filing=% client=%', left(v_f, 8), v_client;
end;
$t$;`;

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await r.text();
const ok = body.includes('ALL_OK');
console.log(`${PROD ? 'פרודקשן' : 'staging'} (${REF}) · בעלים: ${ownerEmail.replace(/^(.).*@/, '$1…@')}`);
console.log(ok ? `✓ כל 8 השלבים עברו, והכול התגלגל לאחור (${(body.match(/ALL_OK[^"\\]*/) ?? [''])[0]})` : `✗ ${r.status} ${body.slice(0, 700)}`);
// ‼ ודא שבאמת לא נשאר כלום
const left = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select count(*)::int n from public.clients where id like 'smoke6101-%'` }),
}).then(x => x.json());
console.log(`לקוחות עשן שנשארו במסד: ${left?.[0]?.n}`);
process.exitCode = ok && left?.[0]?.n === 0 ? 0 : 1;
