#!/usr/bin/env node
/**
 * staging-test-smart-form-mappings.mjs — גרסאות המיפוי (210) מול המסד. הכול בבלוק אחד שמתגלגל לאחור.
 *
 *   node scripts/staging-test-smart-form-mappings.mjs
 *
 * ‼ נגמר ב-raise 'ALL_OK' — שום טיוטה/פרסום/לקוח/הגשה לא נשארים, והגרסה הפעילה ב-staging לא זזה.
 * נבדק: קריאה, פתיחת טיוטה (אידמפוטנטית), ולידציה, שמירה ישנה, פרסום בלי בדיקה / בדיקה לגרסה אחרת /
 * בדיקה ישנה, פרסום תקין ⇒ פעיל + הקודם «הוחלף», נעילה אחרי פרסום רושמת את החדש, דף החתימה
 * הציבורי מקבל את תיקוני הגרסה, משתמש לא מורשה נדחה, ו-anon בלי הרשאת הרצה.
 */
import { loadEnv, STAGING_REF } from './staging-lib.mjs';

const owner = loadEnv('.env.staging').VITE_DEV_USER_EMAIL;
const TOKEN = loadEnv('.env.local').SUPABASE_ACCESS_TOKEN;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(4);

const sql = `do $t$
declare
  v_owner uuid; v_client text := 'mapt-' || substr(md5(random()::text), 1, 10);
  r jsonb; v_draft int; v_upd text; v_active0 int; v_f text; v_h text; v_tok text; v_map int;
  v_ok text[] := '{}';
  ok_field jsonb := '{"p1.marital.married": {"box": {"x": 495.5, "y": 527, "w": 7.38, "h": 7.38}}}';
begin
  select u.id into v_owner from auth.users u join public.authorized_users a on lower(a.email) = lower(u.email)
   where lower(u.email) = lower(${q(owner)}) and a.active;
  if v_owner is null then raise exception 'FAIL owner'; end if;
  v_active0 := (public._smart_form_template('btl-6101')->>'mappingVersion')::int;

  -- הרשאות: anon לא מריץ את פונקציות העריכה
  if has_function_privilege('anon', 'public.get_smart_form_mapping(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.smart_form_mapping_publish(text,int,jsonb,text)', 'EXECUTE') then
    raise exception 'FAIL anon can execute mapping functions'; end if;
  v_ok := array_append(v_ok, 'anon-no-exec');

  insert into public.clients (id, user_id, first_name, last_name, id_number, family_status, phone, email, city, address, lifecycle_stage)
  values (v_client, v_owner, 'בדיקת', 'מיפוי 210', '012345674', 'single', '0524491120', 'mapt@example.test', 'חיפה', 'הנביאים 5', 'active');

  -- משתמש מחובר שאינו מורשה ⇒ forbidden
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.get_smart_form_mapping('btl-6101');
  if r->>'error' is distinct from 'forbidden' then raise exception 'FAIL unauthorized read: %', r; end if;
  r := public.smart_form_mapping_draft_start('btl-6101');
  if r->>'error' is distinct from 'forbidden' then raise exception 'FAIL unauthorized draft: %', r; end if;
  execute 'set local role postgres';
  v_ok := array_append(v_ok, 'unauthorized-forbidden');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  r := public.get_smart_form_mapping('btl-6101');
  if (r->>'ok')::boolean is not true or (r->'active'->>'version')::int <> v_active0 then raise exception 'FAIL read: %', r; end if;
  v_ok := array_append(v_ok, 'read');

  -- טיוטה: נפתחת מהפעילה, ופתיחה שנייה מחזירה אותה
  r := public.smart_form_mapping_draft_start('btl-6101');
  if (r->>'ok')::boolean is not true then raise exception 'FAIL draft start: %', r; end if;
  v_draft := (r->>'version')::int; v_upd := r->>'updatedAt';
  if v_draft <= v_active0 then raise exception 'FAIL draft version % <= active %', v_draft, v_active0; end if;
  r := public.smart_form_mapping_draft_start('btl-6101');
  if (r->>'existing')::boolean is not true or (r->>'version')::int <> v_draft then raise exception 'FAIL draft idempotent: %', r; end if;
  v_ok := array_append(v_ok, 'draft-idempotent');

  -- ולידציה
  r := public.smart_form_mapping_draft_save('btl-6101', v_draft, '{"p1.marital.married": {"box": {"x": 600, "y": 527, "w": 20, "h": 7}}}'::jsonb, v_upd::timestamptz);
  if r->>'error' is distinct from 'invalid' then raise exception 'FAIL outside page accepted: %', r; end if;
  r := public.smart_form_mapping_draft_save('btl-6101', v_draft, '{"x.bad key": {"box": {"x": 1, "y": 1, "w": 5, "h": 5}}}'::jsonb, v_upd::timestamptz);
  if r->>'error' is distinct from 'invalid' then raise exception 'FAIL bad key accepted: %', r; end if;
  r := public.smart_form_mapping_draft_save('btl-6101', v_draft, '{"p1.applicant.idNumber": {"cells": [60, 50, 70]}}'::jsonb, v_upd::timestamptz);
  if r->>'error' is distinct from 'invalid' then raise exception 'FAIL decreasing cells accepted: %', r; end if;
  r := public.smart_form_mapping_draft_save('btl-6101', v_draft, '{"p1.marital.married": {"box": {"x": 495.5, "y": 527, "w": 7.38, "h": 7.38}, "evil": 1}}'::jsonb, v_upd::timestamptz);
  if r->>'error' is distinct from 'invalid' then raise exception 'FAIL unknown property accepted: %', r; end if;
  v_ok := array_append(v_ok, 'validation');

  -- שמירה ישנה
  r := public.smart_form_mapping_draft_save('btl-6101', v_draft, ok_field, '2000-01-01T00:00:00Z'::timestamptz);
  if r->>'error' is distinct from 'stale' then raise exception 'FAIL stale accepted: %', r; end if;
  r := public.smart_form_mapping_draft_save('btl-6101', v_draft, ok_field, v_upd::timestamptz);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL save: %', r; end if;
  v_upd := r->>'updatedAt';
  v_ok := array_append(v_ok, 'stale-and-save');

  -- פרסום: בלי בדיקה / בדיקה שנכשלה / לגרסה אחרת / ישנה ⇒ נדחה
  r := public.smart_form_mapping_publish('btl-6101', v_draft, null, '');
  if r->>'error' is distinct from 'audit_required' then raise exception 'FAIL publish w/o audit: %', r; end if;
  r := public.smart_form_mapping_publish('btl-6101', v_draft, jsonb_build_object('passed', false, 'version', v_draft, 'draftUpdatedAt', v_upd), '');
  if r->>'error' is distinct from 'audit_required' then raise exception 'FAIL publish failed audit: %', r; end if;
  r := public.smart_form_mapping_publish('btl-6101', v_draft, jsonb_build_object('passed', true, 'version', v_draft + 1, 'draftUpdatedAt', v_upd), '');
  if r->>'error' is distinct from 'audit_required' then raise exception 'FAIL publish other version: %', r; end if;
  r := public.smart_form_mapping_publish('btl-6101', v_draft, jsonb_build_object('passed', true, 'version', v_draft, 'draftUpdatedAt', '2000-01-01T00:00:00Z'), '');
  if r->>'error' is distinct from 'audit_stale' then raise exception 'FAIL publish stale audit: %', r; end if;
  v_ok := array_append(v_ok, 'publish-guards');

  -- פרסום תקין ⇒ פעיל; הקודם «הוחלף»
  r := public.smart_form_mapping_publish('btl-6101', v_draft, jsonb_build_object('passed', true, 'version', v_draft, 'draftUpdatedAt', v_upd, 'summary', '{}'::jsonb), 'בדיקה');
  if (r->>'ok')::boolean is not true then raise exception 'FAIL publish: %', r; end if;
  execute 'set local role postgres';
  if (public._smart_form_template('btl-6101')->>'mappingVersion')::int <> v_draft then raise exception 'FAIL active after publish'; end if;
  if v_active0 > 2 and (select status from public.smart_form_mappings where template_key = 'btl-6101' and version = v_active0) <> 'retired' then
    raise exception 'FAIL previous not retired'; end if;
  execute 'set local role authenticated';
  v_ok := array_append(v_ok, 'publish');

  -- נעילה אחרי פרסום רושמת את החדש; דף החתימה מקבל את תיקוני הגרסה
  r := public.smart_form_start(v_client, 'btl-6101', 'client', array['update_details']);
  v_f := r->>'filingId';
  r := public.smart_form_lock(v_f, 1, jsonb_build_object('data', jsonb_build_object('idNumber', '012345674'), 'blockers', '[]'::jsonb,
         'template', jsonb_build_object('mappingVersion', v_draft)), '[{"role":"client","name":"בדיקת מיפוי","idNumber":"012345674"}]'::jsonb);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL lock after publish: %', r; end if;
  select mapping_version into v_map from public.smart_form_revisions where filing_id = v_f and revision = 1;
  if v_map <> v_draft then raise exception 'FAIL lock recorded % not %', v_map, v_draft; end if;
  r := public.smart_form_issue_sign_link(v_f, 1, 'client', 7);
  v_tok := r->>'token';
  if v_tok is null then raise exception 'FAIL sign link: %', r; end if;
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_smart_form_signing(v_tok);
  if (r->>'ok')::boolean is not true or (r->>'mappingVersion')::int <> v_draft or (r->>'activeMappingVersion')::int <> v_draft
     or (r->'mapping'->'p1.marital.married'->'box'->>'x')::numeric <> 495.5 then raise exception 'FAIL signing page mapping: %', r; end if;
  execute 'set local role postgres';
  v_ok := array_append(v_ok, 'lock-and-signing-page');

  -- ביטול טיוטה
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.smart_form_mapping_draft_start('btl-6101');
  r := public.smart_form_mapping_draft_discard('btl-6101', (r->>'version')::int);
  if (r->>'ok')::boolean is not true then raise exception 'FAIL discard: %', r; end if;
  execute 'set local role postgres';
  v_ok := array_append(v_ok, 'discard');

  raise exception 'ALL_OK %', array_to_string(v_ok, ',');
end;
$t$;`;

const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
});
const body = await res.text();
const m = /ALL_OK ([a-z,-]+)/.exec(body);
if (m) for (const s of m[1].split(',')) console.log(`✓ ${s}`);
console.log(m ? `\n${m[1].split(',').length} עברו, 0 נכשלו (הכול התגלגל לאחור)` : `✗ ${res.status} ${body.slice(0, 800)}`);
process.exitCode = m ? 0 : 1;
