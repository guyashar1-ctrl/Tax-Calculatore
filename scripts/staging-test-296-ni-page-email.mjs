#!/usr/bin/env node
/**
 * staging-test-296-ni-page-email.mjs — 296 מקצה לקצה דרך מייל הדף (send-process-open-email).
 *
 * בן זוג בלי מייל: אישור ב"ל שלו נכלל במייל הדף לבעלת הכרטיס, עם האסמכתא שלו, ורק
 * שליחה שהצליחה רושמת «ההוראות נשלחו» אצלו. ‼ שום מייל לא יוצא לאדם: מסלול הבדיקה
 * (x-pivo-test-transport: log) והנמען delivered@resend.dev. נתוני דמה, QA296E, נמחקים.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadEnv, writeStaging as sqlq, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const login = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const { data: s, error } = await login.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (error) { console.error('✋ כניסה למשתמש הבדיקות נכשלה — עוצרים (לא מנסים שוב):', error.message); process.exit(1); }
const JWT = s.session.access_token;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await sqlq(q))[0];
const call = async (body) => {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-process-open-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${JWT}`,
               'x-pivo-test-transport': 'log' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, json, text };
};

const LAST = 'QA296E';
async function cleanup() {
  await sqlq(`
    delete from public.email_messages where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.client_notices where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${LAST}'));
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${LAST}');
    update public.clients set representation_request_id = null where last_name = '${LAST}';
    delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.clients where last_name = '${LAST}';`);
}

await cleanup();
try {
  const cid = `qa296e-${Date.now()}`;
  const rid = `qa296e${Date.now()}`;
  const dl = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  await sqlq(`
    insert into public.clients(id, user_id, first_name, last_name, email, family_status, spouse_first_name, spouse_last_name,
                               lifecycle_stage, authority_representations)
      values ('${cid}', '${USER_ID}', 'ישראלה', '${LAST}', 'delivered@resend.dev', 'married', 'ישראל', '${LAST}', 'onboarding',
              '{"nationalInsurance":{"status":"in_process","targets":["client","spouse"]}}');
    insert into public.representation_requests(id, user_id, linked_client_id, client_name, status, execution)
      values ('${rid}', '${USER_ID}', '${cid}', 'ישראלה ${LAST}', 'awaiting_stamp', '{}');
    update public.clients set representation_request_id = '${rid}' where id = '${cid}';
    update public.representation_requests
       set execution = jsonb_build_object(
             'nationalInsurance', jsonb_build_object('referenceNumber', '70000001', 'deadline', '${dl}', 'instructionsSentAt', now()::text),
             'nationalInsuranceSpouse', jsonb_build_object('referenceNumber', '70000002', 'deadline', '${dl}'))
     where id = '${rid}';`);

  const sp = await one(`select id, status from public.onboarding_steps where client_id = '${cid}' and payload->>'subjectRole' = 'spouse'`);
  ok('spouse NI step opened from the reference number', !!sp?.id && sp.status === 'in_progress', JSON.stringify(sp));

  const pv = await call({ clientId: cid, kind: 'new', preview: true });
  const html = pv.json?.html ?? pv.json?.preview?.html ?? '';
  ok('preview succeeds', pv.status === 200, pv.text.slice(0, 300));
  ok('preview carries the spouse card with his reference number', html.includes('70000002') && html.includes('מה צריך מישראל'), html.slice(0, 200));
  const before = await one(`select execution->'nationalInsuranceSpouse'->>'instructionsSentAt' as at from public.representation_requests where id = '${rid}'`);
  ok('preview writes nothing', !before?.at);

  const sent = await call({ clientId: cid, kind: 'new', idempotencyKey: crypto.randomUUID(), expectedFingerprint: pv.json?.fingerprint });
  ok('page email sent (test transport) and logged', sent.status === 200 && sent.json?.ok === true && sent.json?.logged === true, sent.text.slice(0, 300));

  const after = await one(`select execution->'nationalInsuranceSpouse'->>'instructionsSentWith' as w,
                                  (select status from public.onboarding_steps where id = '${sp?.id}') as st
                             from public.representation_requests where id = '${rid}'`);
  ok('instructions recorded as sent with the page', after?.w === 'page', JSON.stringify(after));
  ok('spouse step now waits for him', after?.st === 'waiting_client', JSON.stringify(after));
  const owner = await one(`select execution->'nationalInsurance'->>'instructionsSentWith' as w from public.representation_requests where id = '${rid}'`);
  ok('owner NI record untouched', owner?.w == null, JSON.stringify(owner));
} finally {
  await cleanup();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
