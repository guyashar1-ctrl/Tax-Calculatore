#!/usr/bin/env node
/**
 * smoke-247-rolled-back.mjs — עשן לטפסי הלקוח (247) על המסד האמיתי, בלי להשאיר כלום.
 *
 * ‼ הכול בבלוק DO אחד שמסתיים ב-raise 'ALL_OK' — כל מה שנוצר (לקוח סינתטי, בקשה, הגשה, כתיבות לכרטיס,
 *   היסטוריה, הודעה לרו"ח בתור) מתבטל. אין קריאה החוצה מהמסד בשום שלב (נבדק: אין net/http בפונקציות ובטריגרים).
 *   הבעלים: המשתמש המורשה הפעיל. שלבים: פתיחה (אידמפוטנטית) כבעלים ⇒ דף אישי כ-anon (קריאה, שמירה לכרטיס
 *   ולהגשה, הכנה, חתימה על טביעה שגויה ⇒ נדחית, חתימה) ⇒ «נחתם» בשורה ובדף ⇒ תצוגת משרד.
 *   node scripts/smoke-247-rolled-back.mjs [--prod]
 */
import { loadEnv, PROD_REF, STAGING_REF } from './staging-lib.mjs';

const PROD = process.argv.includes('--prod');
const REF = PROD ? PROD_REF : STAGING_REF;
const TOKEN = loadEnv('.env.local').SUPABASE_ACCESS_TOKEN;
const ownerEmail = PROD ? 'guyashar1@gmail.com' : loadEnv('.env.staging').VITE_DEV_USER_EMAIL;
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const TAG = Date.now().toString(36);
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(4);

const sql = `do $t$
declare
  v_owner uuid; v_client text := ${q('smoke247-' + TAG)}; v_tok text := ${q('smoke247tok' + TAG + '0'.repeat(30))};
  r jsonb; v_f text; v_s text; v_h text; c record; s record;
begin
  select u.id into v_owner from auth.users u join public.authorized_users a on lower(a.email) = lower(u.email)
   where lower(u.email) = lower(${q(ownerEmail)}) and a.active;
  if v_owner is null then raise exception 'FAIL owner'; end if;
  insert into public.clients (id, user_id, first_name, last_name, id_number, gender, family_status, phone, lifecycle_stage,
                              spouse_first_name, spouse_last_name, portal_token, type)
  values (v_client, v_owner, 'בדיקת', 'עשן 247', '012345674', 'male', 'married', '0524491120', 'active', 'רות', 'עשן 247', v_tok, 'individual');

  -- 1. פתיחה כבעלים (אידמפוטנטית)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'email', ${q(ownerEmail)})::text, true);
  execute 'set local role authenticated';
  r := public.smart_form_client_start(v_client, 'ita-4440', true);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL start: %', r; end if;
  v_f := r->>'filingId'; v_s := r->>'stepId';
  r := public.smart_form_client_start(v_client, 'ita-4440', true);
  if r->>'filingId' is distinct from v_f or (r->>'existing')::boolean is not true then raise exception 'FAIL idempotent: %', r; end if;
  execute 'set local role postgres';
  select * into s from public.onboarding_steps where id = v_s;
  if s.ball <> 'client' or s.status <> 'waiting_client' or s.payload #>> '{smartForm,clientFill}' <> 'true' then raise exception 'FAIL step: % %', s.ball, s.status; end if;

  -- 2. הדף האישי כ-anon
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_client_portal(v_tok);
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'kind' = 'smart_form' and i->>'bucket' = 'action') then raise exception 'FAIL portal item: %', r->'items'; end if;
  r := public.portal_smart_form_get(v_tok, v_s);
  if (r->>'ok')::boolean is not true or r#>>'{card,idNumber}' <> '012345674' then raise exception 'FAIL get: %', r; end if;
  r := public.portal_smart_form_save(v_tok, v_s, '{"idNumber":"000000018"}'::jsonb);
  if r->>'error' is distinct from 'identity_in_card' then raise exception 'FAIL identity guard: %', r; end if;
  r := public.portal_smart_form_save(v_tok, v_s, '{"homeStreet":"הנביאים","homeHouse":"5","homeCity":"חיפה","spouseIdNumber":"003456787","marriageDate":"2012-05-20","separationDate":"2025-02-01","spouseAddress":"הגפן 3, עכו","incSalary":"1","incomeYear":"2025"}'::jsonb);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL save: %', r; end if;
  r := public.portal_smart_form_prepare(v_tok, v_s);
  if (r->>'ok')::boolean is not true or (r->>'contentSha256') !~ '^[0-9a-f]{64}$' then raise exception 'FAIL prepare: %', r; end if;
  v_h := r->>'contentSha256';
  r := public.portal_smart_form_sign(v_tok, v_s, ${q(PNG)}, repeat('0', 64), true);
  if r->>'error' is distinct from 'content_changed' then raise exception 'FAIL wrong hash: %', r; end if;
  r := public.portal_smart_form_sign(v_tok, v_s, ${q(PNG)}, v_h, true);
  if (r->>'ok')::boolean is not true or (r->>'allSigned')::boolean is not true then raise exception 'FAIL sign: %', r; end if;
  begin
    r := public.smart_form_client_view(v_f);
    raise exception 'FAIL anon office view not refused: %', r;
  exception when insufficient_privilege then null; -- ‼ anon אינו רשאי בכלל להריץ את תצוגת המשרד
  end;

  -- 3. מה נכתב: כרטיס, הגשה, שורה
  execute 'set local role postgres';
  select * into c from public.clients where id = v_client;
  if c.address <> 'הנביאים 5' or c.city <> 'חיפה' or c.spouse_id_number <> '003456787' or c.marriage_year <> 2012 or c.field_meta#>>'{address,via}' <> 'ita-4440' then
    raise exception 'FAIL card: % % % %', c.address, c.city, c.spouse_id_number, c.marriage_year;
  end if;
  if not exists (select 1 from public.tax_fact_changes where client_id = v_client and field_key = 'smartForm:ita-4440') then raise exception 'FAIL history'; end if;
  if (select state from public.smart_form_filings where id = v_f) <> 'signed' then raise exception 'FAIL filing state'; end if;
  select * into s from public.onboarding_steps where id = v_s;
  if s.ball <> 'me' or s.payload #>> '{smartForm,stateLabel}' not like 'נחתם%' then raise exception 'FAIL step after sign: % %', s.ball, s.payload->'smartForm'; end if;

  -- 4. תצוגת משרד כבעלים
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'email', ${q(ownerEmail)})::text, true);
  execute 'set local role authenticated';
  r := public.smart_form_client_view(v_f);
  if (r->>'ok')::boolean is not true or r->>'revisionState' <> 'signed' or r#>>'{signatures,client}' is null then raise exception 'FAIL office view: %', r->>'error'; end if;
  execute 'set local role postgres';

  raise exception 'ALL_OK filing=% client=%', left(v_f, 8), v_client;
end;
$t$;`;

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
});
const body = await r.text();
const ok = body.includes('ALL_OK');
console.log(`${PROD ? 'פרודקשן' : 'staging'} (${REF})`);
console.log(ok ? '✓ כל השלבים עברו, והכול התגלגל לאחור' : `✗ ${r.status} ${body.slice(0, 700)}`);
const left = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select (select count(*) from public.clients where id like 'smoke247-%')::int c, (select count(*) from public.smart_form_filings where template_key <> 'btl-6101' and client_id like 'smoke247-%')::int f` }),
}).then(x => x.json());
console.log(`נשאר במסד: ${JSON.stringify(left?.[0])}`);
process.exitCode = ok && left?.[0]?.c === 0 ? 0 : 1;
