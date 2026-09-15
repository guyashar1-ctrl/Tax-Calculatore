#!/usr/bin/env node
/**
 * staging-test-send-record.mjs — שער הרגרסיה של אשכול F (מיגרציה 170):
 * "המסך אומר שזה קרה, המסד לא מסכים" — מיילים, התראות, משימות אוטומציה.
 *
 * SR-1  record_email_sent כותבת שורת יומן + סימון על השלב + אירוע — בקריאה אחת.
 * SR-2  אותו מזהה ספק פעמיים ⇒ alreadyRecorded, שורה אחת, הסימון לא נדרס.
 * SR-3  מפתח קבוע (auto:step) ⇒ בדיוק פעם אחת גם עם מזהה ספק שונה.
 * SR-4  שלב של משרד אחר / בלי מזהה ספק ⇒ חריגה, ושום שורה לא נכתבת.
 * SR-5  send-step-email (אוטומטי): כשל אצל הספק משחרר את התביעה —
 *       autoExecutedAt ריק, autoError מלא, הסטטוס לא זז, אין שורת 'sent'.
 * SR-6  send-step-email (ידני): כשל אצל הספק ⇒ 502, הסטטוס לא זז, שורת
 *       'failed' בלי מפתח ייחודי.
 * SR-7  cancel_automation_job: running שהחכירה פקעה ⇒ בוטל; running חי ⇒
 *       not_cancellable; needs_human ⇒ בוטל.
 * SR-8  queue_accountant_notification: כפילות זהה בתור נבלעת; אחרי שליחה —
 *       אירוע חוזר מקבל שורה חדשה.
 * SR-9  representation_link_missing: מתקבל בתור, ו-notify-accountant בונה לו
 *       מייל (הכשל הוא של הספק, לא "לא נמצאו הנתונים").
 * SR-10 record_email_sent עם p_notification_id ⇒ sent_at על ההתראה + שורה.
 * SR-11 send-release-email: כשל אצל הספק ⇒ 502 ו-releaseSentAt נשאר ריק.
 * SR-12 record_email_sent עם p_quotation_id + p_request_track ⇒ representation_sent_at
 *       ו-execution.<track>.instructionsSentAt נכתבים פעם אחת ולא נדרסים.
 *
 * ‼ בסביבת הבדיקות אין מפתח Resend תקף, ולכן כל שליחה אמיתית נכשלת אצל
 *   הספק — וזה בדיוק מה שמאפשר לבדוק שכשל אינו משאיר סימון. מסלול ההצלחה
 *   נבדק ברמת ה-RPC (SR-1..3, SR-10).
 * ‼ דורש פריסה של send-step-email, send-release-email ו-notify-accountant
 *   ל-staging (scripts/deploy-edge-function.mjs staging <name>).
 *
 * הרצה:  node scripts/staging-test-send-record.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging as writeStagingRaw, assertTriggersEnabled } from './staging-lib.mjs';

// ‼ ה-Management API מגביל קצב (429). הבדיקה עושה עשרות שאילתות קצרות ברצף,
// ולכן ניסיון חוזר קצר על 429 בלבד — כל שגיאה אחרת עולה כמו שהיא.
async function writeStaging(query) {
  for (let attempt = 0; ; attempt++) {
    try { return await writeStagingRaw(query); }
    catch (e) {
      if (e.http !== 429 || attempt >= 10) throw e;
      await new Promise(r => setTimeout(r, Math.min(30_000, 2_000 * 2 ** attempt)));
    }
  }
}

for (let attempt = 0; ; attempt++) {
  try { await assertTriggersEnabled(); break; }
  catch (e) {
    if (e.http !== 429 || attempt >= 10) throw e;
    await new Promise(r => setTimeout(r, Math.min(30_000, 2_000 * 2 ** attempt)));
  }
}
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN = (name) => `${env.VITE_SUPABASE_URL}/functions/v1/${name}`;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const AS_USER = `select set_config('request.jwt.claims', json_build_object('sub','${USER_ID}','role','authenticated')::text, false);`;
const jrpc = async (expr, asUser = false) => JSON.parse((await one(`${asUser ? AS_USER : ''} select (${expr})::text as out;`)).out);

console.log(`סביבה: ${STAGING_REF}\n`);

const LAST = 'SENDREC';
async function cleanup() {
  await writeStaging(`
    delete from public.email_messages where client_id in (select id from public.clients where last_name = '${LAST}')
       or idempotency_key like 'sendrec:%' or resend_id like 'sendrec-%';
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${LAST}'));
    delete from public.accountant_notifications where client_id in (select id from public.clients where last_name = '${LAST}')
       or payload->>'quotationId' like 'sendrec-%';
    delete from public.automation_jobs where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.journey_stages where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.engagements where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.clients where last_name = '${LAST}';
    delete from public.quotations where id like 'sendrec-%';
    delete from public.representation_requests where id like 'sendrec-%';`);
}
await cleanup();

// ── התחברות כרו"ח (JWT אמיתי — כמו הדפדפן) ──────────────────────────────────
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const JWT = s.session.access_token;
async function callFn(name, body, { internal = false } = {}) {
  const r = await fetch(FN(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      ...(internal ? {} : { Authorization: `Bearer ${JWT}` }),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* לא JSON */ }
  return { status: r.status, json, text };
}

try {
  // ── לקוח + שלבים ──────────────────────────────────────────────────────────
  const cid = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'רשומה', '${LAST}', 'delivered@resend.dev',
            replace(gen_random_uuid()::text,'-',''))
    returning id;`)).id;
  const releaseStep = (await one(`
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values ('${USER_ID}', '${cid}', 'release_letter', 'prev_accountant', 'person', 'pending', 'me', now(),
            '{"title":"מכתב העברה SENDREC"}'::jsonb)
    returning id;`)).id;
  const autoStep = (await one(`
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values ('${USER_ID}', '${cid}', 'custom_request', 'custom', 'person', 'pending', 'me', now(),
            '{"title":"בקשה אוטומטית SENDREC","clientTitle":"בקשה SENDREC","autoAction":{"kind":"email"},
              "requirements":[{"key":"a1","kind":"confirm","label":"אישור","done":false,"required":true}]}'::jsonb)
    returning id;`)).id;
  const manualStep = (await one(`
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values ('${USER_ID}', '${cid}', 'custom_request', 'custom', 'person', 'pending', 'me', now(),
            '{"title":"בקשה ידנית SENDREC","clientTitle":"בקשה SENDREC",
              "requirements":[{"key":"a1","kind":"confirm","label":"אישור","done":false,"required":true}]}'::jsonb)
    returning id;`)).id;

  // ── SR-1 · שורה + סימון + אירוע בקריאה אחת ──────────────────────────────
  const rec1 = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'release', 'prev@example.com', 'מכתב SENDREC', 'sendrec-r1',
    p_html => '<p>x</p>', p_client_id => '${cid}', p_step_id => '${releaseStep}',
    p_step_patch => '{"releaseSentAt":"2026-09-15T10:00:00Z","releaseSentTo":"prev@example.com"}'::jsonb,
    p_event_actor => 'accountant', p_event_note => 'נשלח SENDREC', p_event_meta => '{"kind":"release"}'::jsonb)`);
  const row1 = await one(`select status, idempotency_key, step_id::text as step_id, client_id, html
                            from public.email_messages where resend_id = 'sendrec-r1'`);
  const step1 = await one(`select status, payload from public.onboarding_steps where id = '${releaseStep}'`);
  const ev1 = await one(`select count(*)::int as n from public.onboarding_events
                          where step_id = '${releaseStep}' and type = 'email_sent'`);
  ok('SR-1 ה-RPC מחזירה ok עם מזהה שורה', rec1?.ok === true && !rec1.alreadyRecorded && !!rec1.emailId, JSON.stringify(rec1));
  ok('SR-1 שורת היומן: sent, מפתח resend:, מקושרת לשלב וללקוח',
    row1?.status === 'sent' && row1?.idempotency_key === 'resend:sendrec-r1'
      && row1?.step_id?.replace(/-/g, '') === releaseStep && row1?.client_id === cid && row1?.html === '<p>x</p>',
    JSON.stringify(row1));
  ok('SR-1 הסימון על השלב נכתב (releaseSentAt) והסטטוס לא זז',
    step1?.payload?.releaseSentAt === '2026-09-15T10:00:00Z' && step1?.payload?.releaseSentTo === 'prev@example.com'
      && step1?.payload?.title === 'מכתב העברה SENDREC' && step1?.status === 'pending',
    JSON.stringify(step1));
  ok('SR-1 אירוע email_sent נרשם ביומן', ev1?.n === 1, JSON.stringify(ev1));

  // ── SR-2 · אותו מזהה ספק פעמיים ─────────────────────────────────────────
  const rec2 = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'release', 'prev@example.com', 'מכתב SENDREC', 'sendrec-r1',
    p_client_id => '${cid}', p_step_id => '${releaseStep}',
    p_step_patch => '{"releaseSentAt":"2099-01-01T00:00:00Z"}'::jsonb,
    p_event_note => 'שוב')`);
  const cnt2 = await one(`select count(*)::int as n from public.email_messages where resend_id = 'sendrec-r1'`);
  const step2 = await one(`select payload->>'releaseSentAt' as at from public.onboarding_steps where id = '${releaseStep}'`);
  const ev2 = await one(`select count(*)::int as n from public.onboarding_events where step_id = '${releaseStep}' and type = 'email_sent'`);
  ok('SR-2 רישום חוזר ⇒ alreadyRecorded עם אותו מזהה שורה',
    rec2?.ok === true && rec2.alreadyRecorded === true && rec2.emailId === rec1.emailId, JSON.stringify(rec2));
  ok('SR-2 שורה אחת בלבד, הסימון לא נדרס, אין אירוע שני',
    cnt2?.n === 1 && step2?.at === '2026-09-15T10:00:00Z' && ev2?.n === 1, JSON.stringify({ cnt2, step2, ev2 }));

  // ── SR-3 · מפתח קבוע — בדיוק פעם אחת ────────────────────────────────────
  const keyStep = (await one(`
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values ('${USER_ID}', '${cid}', 'custom_request', 'custom', 'person', 'pending', 'me', now(), '{"title":"מפתח קבוע SENDREC"}'::jsonb)
    returning id;`)).id;
  const rec3a = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'step_reminder', 'delivered@resend.dev', 'אוטומטי SENDREC', 'sendrec-a1',
    p_client_id => '${cid}', p_step_id => '${keyStep}', p_idempotency_key => 'sendrec:auto:${keyStep}',
    p_step_status => 'waiting_client', p_step_ball => 'client',
    p_event_actor => 'system', p_event_note => 'בוצע אוטומטית SENDREC')`);
  const rec3b = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'step_reminder', 'delivered@resend.dev', 'אוטומטי SENDREC', 'sendrec-a2',
    p_client_id => '${cid}', p_step_id => '${keyStep}', p_idempotency_key => 'sendrec:auto:${keyStep}',
    p_step_status => 'completed')`);
  const cnt3 = await one(`select count(*)::int as n from public.email_messages where idempotency_key = 'sendrec:auto:${keyStep}'`);
  const step3 = await one(`select status, ball from public.onboarding_steps where id = '${keyStep}'`);
  ok('SR-3 מפתח קבוע: הראשון נרשם ומזיז את השלב ל-waiting_client/client',
    rec3a?.ok === true && !rec3a.alreadyRecorded && step3?.status === 'waiting_client' && step3?.ball === 'client',
    JSON.stringify({ rec3a, step3 }));
  ok('SR-3 השני (מזהה ספק אחר, אותו מפתח) ⇒ alreadyRecorded, שורה אחת, הסטטוס לא זז',
    rec3b?.alreadyRecorded === true && cnt3?.n === 1 && step3?.status === 'waiting_client', JSON.stringify({ rec3b, cnt3 }));

  // ── SR-4 · כשל ⇒ חריגה ושום כתיבה ──────────────────────────────────────
  let err4a = null;
  try {
    await jrpc(`public.record_email_sent('00000000-0000-0000-0000-000000000001'::uuid, 'release', 'x@y.z', 's', 'sendrec-x1',
      p_step_id => '${releaseStep}')`);
  } catch (e) { err4a = String(e.message || e); }
  let err4b = null;
  try {
    await jrpc(`public.record_email_sent('${USER_ID}'::uuid, 'release', 'x@y.z', 's', '')`);
  } catch (e) { err4b = String(e.message || e); }
  const cnt4 = await one(`select count(*)::int as n from public.email_messages where resend_id = 'sendrec-x1'`);
  ok('SR-4 שלב של משרד אחר ⇒ חריגה, ובלי שורה', !!err4a && /another office/.test(err4a) && cnt4?.n === 0, err4a ?? '');
  ok('SR-4 בלי מזהה ספק ⇒ חריגה', !!err4b && /provider id/.test(err4b), err4b ?? '');

  // ── SR-5 · send-step-email אוטומטי: כשל אצל הספק משחרר את התביעה ─────────
  const secret = (await one(`select decrypted_secret as v from vault.decrypted_secrets where name = 'internal_send_secret'`)).v;
  const r5 = await callFn('send-step-email', { internalSecret: secret, stepId: autoStep, kind: 'step_reminder' }, { internal: true });
  const step5 = await one(`select status, ball, payload->>'autoExecutedAt' as executed, payload->>'autoError' as err
                             from public.onboarding_steps where id = '${autoStep}'`);
  const sent5 = await one(`select count(*)::int as n from public.email_messages where step_id::text = ('${autoStep}')::uuid::text and status = 'sent'`);
  const failed5 = await one(`select count(*)::int as n, bool_and(idempotency_key is null) as nokey
                               from public.email_messages where step_id::text = ('${autoStep}')::uuid::text and status = 'failed'`);
  ok('SR-5 הספק נכשל ⇒ 502 resend_failed (לא 500, לא ok)',
    r5.status === 502 && r5.json?.error === 'resend_failed', `${r5.status} ${r5.text.slice(0, 200)}`);
  ok('SR-5 התביעה שוחררה: autoExecutedAt ריק, autoError מלא, הסטטוס לא זז',
    step5?.executed == null && !!step5?.err && step5?.status === 'pending' && step5?.ball === 'me', JSON.stringify(step5));
  ok('SR-5 אין שורת sent; שורת failed בלי מפתח ייחודי',
    sent5?.n === 0 && failed5?.n === 1 && failed5?.nokey === true, JSON.stringify({ sent5, failed5 }));

  // ── SR-6 · send-step-email ידני: כשל ⇒ 502 והסטטוס לא זז ───────────────
  const r6 = await callFn('send-step-email', { stepId: manualStep, kind: 'step_reminder' });
  const step6 = await one(`select status, ball from public.onboarding_steps where id = '${manualStep}'`);
  const rows6 = await one(`select count(*) filter (where status = 'sent')::int as sent,
                                  count(*) filter (where status = 'failed')::int as failed
                             from public.email_messages where step_id::text = ('${manualStep}')::uuid::text`);
  ok('SR-6 שליחה ידנית: 502 resend_failed', r6.status === 502 && r6.json?.error === 'resend_failed', `${r6.status} ${r6.text.slice(0, 200)}`);
  ok('SR-6 הסטטוס לא זז, אין שורת sent, יש שורת failed',
    step6?.status === 'pending' && rows6?.sent === 0 && rows6?.failed === 1, JSON.stringify({ step6, rows6 }));

  // ── SR-7 · cancel_automation_job ─────────────────────────────────────────
  const mkJob = async (status, lease) => (await one(`
    insert into public.automation_jobs (user_id, client_id, action_type, status, claimed_by, claimed_at, lease_until)
    values ('${USER_ID}', '${cid}', 'dev.sendrec_${status}_${lease === null ? 'nolease' : lease}', '${status}',
            ${status === 'running' ? "'worker-dead'" : 'null'}, ${status === 'running' ? 'now()' : 'null'},
            ${lease === null ? 'null' : `now() + interval '${lease}'`})
    returning id;`)).id;
  const stale = await mkJob('running', '-5 minutes');
  const live = await mkJob('running', '+5 minutes');
  const human = await mkJob('needs_human', null);
  const c7a = await jrpc(`public.cancel_automation_job('${stale}')`, true);
  const c7b = await jrpc(`public.cancel_automation_job('${live}')`, true);
  const c7c = await jrpc(`public.cancel_automation_job('${human}')`, true);
  const st7 = await writeStaging(`select id, status from public.automation_jobs where id in ('${stale}','${live}','${human}')`);
  const by7 = Object.fromEntries(st7.map(r => [r.id, r.status]));
  ok('SR-7 running שהחכירה פקעה ⇒ בוטל', c7a?.ok === true && c7a.job?.status === 'cancelled' && by7[stale] === 'cancelled', JSON.stringify(c7a));
  ok('SR-7 running חי ⇒ not_cancellable ונשאר running', c7b?.ok === false && c7b.error === 'not_cancellable' && by7[live] === 'running', JSON.stringify(c7b));
  ok('SR-7 needs_human ⇒ בוטל', c7c?.ok === true && by7[human] === 'cancelled', JSON.stringify(c7c));
  // עובד שחזר לחיים ומדווח על המשימה שבוטלה — לא כותב על הביטול
  const done7 = await jrpc(`public.complete_automation_job('worker-dead', '${stale}', '{}'::jsonb)`);
  ok('SR-7 עובד שחזר לחיים לא דורס ביטול', done7?.ok === false && (await one(`select status from public.automation_jobs where id = '${stale}'`)).status === 'cancelled', JSON.stringify(done7));

  // ── SR-8 · dedupe בתור ההתראות ──────────────────────────────────────────
  const qn = `public.queue_accountant_notification('${USER_ID}'::uuid, 'client_request_completed', '${cid}', '${manualStep}', null, null,
    '{"clientName":"רשומה SENDREC","requestTitle":"בקשה SENDREC"}'::jsonb)`;
  await writeStaging(`select ${qn}; select ${qn};`);
  const n8a = await one(`select count(*)::int as n from public.accountant_notifications where step_id = '${manualStep}' and kind = 'client_request_completed'`);
  await writeStaging(`update public.accountant_notifications set sent_at = now() where step_id = '${manualStep}' and kind = 'client_request_completed';`);
  await writeStaging(`select ${qn};`);
  const n8b = await one(`select count(*)::int as n from public.accountant_notifications where step_id = '${manualStep}' and kind = 'client_request_completed'`);
  ok('SR-8 שתי קריאות זהות ⇒ התראה אחת בתור', n8a?.n === 1, JSON.stringify(n8a));
  ok('SR-8 אחרי שליחה — אירוע חוזר מקבל שורה חדשה', n8b?.n === 2, JSON.stringify(n8b));

  // ── SR-9 · representation_link_missing מתקבל ונבנה לו מייל ─────────────
  await writeStaging(`
    insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, approved_at)
    values ('sendrec-q1', '${USER_ID}', '${cid}', 'SENDREC-1', 'approved', replace(gen_random_uuid()::text,'-',''),
            '[]'::jsonb, '{}'::jsonb, 18, now() - interval '2 days');
    select public.queue_accountant_notification('${USER_ID}'::uuid, 'representation_link_missing', '${cid}', null, null, null,
      '{"quotationId":"sendrec-q1","quotationNumber":"SENDREC-1"}'::jsonb);`);
  const n9 = await one(`select id, attempts, error from public.accountant_notifications
                          where kind = 'representation_link_missing' and payload->>'quotationId' = 'sendrec-q1'`);
  ok('SR-9 ההתראה התקבלה בתור', !!n9?.id && n9.attempts === 0, JSON.stringify(n9));
  // המשרד חייב כתובת מייל כדי שהתור ייפתח בכלל
  const prof9 = await one(`select email from public.profiles where id = '${USER_ID}'`);
  const r9 = await callFn('notify-accountant', {});
  const n9b = await one(`select attempts, error, sent_at from public.accountant_notifications where id = '${n9.id}'`);
  ok('SR-9 notify-accountant ניסה לשלוח (attempts=1) — הבונה החזיר מייל, הכשל הוא של הספק ולא "לא נמצאו הנתונים"',
    r9.status === 200 && n9b?.attempts === 1 && !!n9b?.error && !/לא נמצאו הנתונים/.test(n9b.error) && n9b?.sent_at == null,
    JSON.stringify({ r9: r9.json, n9b, profileEmail: prof9?.email }));

  // ── SR-10 · sent_at על ההתראה + שורה בקריאה אחת ─────────────────────────
  const rec10 = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'notify_representation_link_missing', 'office@example.com', 'התראה SENDREC', 'sendrec-n1',
    p_client_id => '${cid}', p_notification_id => '${n9.id}')`);
  const n10 = await one(`select sent_at, error from public.accountant_notifications where id = '${n9.id}'`);
  const row10 = await one(`select status from public.email_messages where resend_id = 'sendrec-n1'`);
  ok('SR-10 ההתראה סומנה כנשלחה והשגיאה נוקתה, ושורת היומן קיימת',
    rec10?.ok === true && !!n10?.sent_at && n10?.error == null && row10?.status === 'sent', JSON.stringify({ rec10, n10, row10 }));

  // ── SR-11 · send-release-email: כשל ⇒ אין releaseSentAt ─────────────────
  // (מכתב העברה אחד ללקוח — אינדקס ייחודי; מנקים את הסימון מ-SR-1 במקום ליצור שני)
  const releaseStep2 = releaseStep;
  await writeStaging(`update public.onboarding_steps set payload = payload - 'releaseSentAt' - 'releaseSentTo' where id = '${releaseStep2}';`);
  const r11 = await callFn('send-release-email', {
    clientId: cid, to: 'prev@example.com', subject: 'מכתב SENDREC', html: '<p>x</p>', stepId: releaseStep2, markSent: true,
  });
  const step11 = await one(`select payload->>'releaseSentAt' as at, status from public.onboarding_steps where id = '${releaseStep2}'`);
  ok('SR-11 הספק נכשל ⇒ 502 resend_failed', r11.status === 502 && r11.json?.error === 'resend_failed', `${r11.status} ${r11.text.slice(0, 200)}`);
  ok('SR-11 releaseSentAt נשאר ריק אחרי כשל', step11?.at == null && step11?.status === 'pending', JSON.stringify(step11));
  const r11b = await callFn('send-release-email', {
    clientId: cid, to: 'prev@example.com', subject: 'מכתב SENDREC', html: '<p>x</p>', stepId: 'no-such-step',
  });
  ok('SR-11 מזהה שלב זר נדחה לפני השליחה (404 step_not_found)', r11b.status === 404 && r11b.json?.error === 'step_not_found', `${r11b.status} ${r11b.text.slice(0, 120)}`);

  // ── SR-12 · הסימונים על ההצעה ועל בקשת הייצוג (מייל קישור הייצוג / ב"ל) ──
  await writeStaging(`
    insert into public.representation_requests (id, user_id, client_name, status, onboarding_status, linked_client_id, execution)
    values ('sendrec-rep1', '${USER_ID}', 'רשומה SENDREC', 'pending_fill', 'pending', '${cid}', '{"nationalInsurance":{"referenceNumber":"123"}}'::jsonb);
    update public.quotations set representation_request_id = 'sendrec-rep1', representation_sent_at = null where id = 'sendrec-q1';`);
  const rec12a = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'ni_approve', 'delivered@resend.dev', 'הוראות ב"ל SENDREC', 'sendrec-ni1',
    p_client_id => '${cid}', p_request_id => 'sendrec-rep1', p_quotation_id => 'sendrec-q1',
    p_idempotency_key => 'sendrec:ni_approve:sendrec-rep1:client',
    p_request_track => 'nationalInsurance',
    p_request_track_patch => '{"instructionsSentAt":"2026-09-15T11:00:00Z","instructionsSentWith":"standalone"}'::jsonb)`);
  const rec12b = await jrpc(`public.record_email_sent(
    '${USER_ID}'::uuid, 'ni_approve', 'delivered@resend.dev', 'הוראות ב"ל SENDREC', 'sendrec-ni2',
    p_client_id => '${cid}', p_request_id => 'sendrec-rep1', p_quotation_id => 'sendrec-q1',
    p_request_track => 'nationalInsurance',
    p_request_track_patch => '{"instructionsSentAt":"2099-01-01T00:00:00Z"}'::jsonb)`);
  const rep12 = await one(`select execution, (select representation_sent_at is not null from public.quotations where id = 'sendrec-q1') as qsent
                             from public.representation_requests where id = 'sendrec-rep1'`);
  const rows12 = await one(`select count(*)::int as n from public.email_messages where request_id = 'sendrec-rep1' and status = 'sent'`);
  ok('SR-12 הסימון על המסלול נכתב עם האסמכתא הקיימת, וההצעה סומנה representation_sent_at',
    rec12a?.ok === true && rep12?.execution?.nationalInsurance?.instructionsSentAt === '2026-09-15T11:00:00Z'
      && rep12?.execution?.nationalInsurance?.referenceNumber === '123'
      && rep12?.execution?.nationalInsurance?.instructionsSentWith === 'standalone' && rep12?.qsent === true,
    JSON.stringify({ rec12a, rep12 }));
  ok('SR-12 שליחה חוזרת (מזהה ספק אחר, בלי מפתח קבוע) מקבלת שורה משלה אך לא דורסת את החותמת',
    rec12b?.ok === true && !rec12b.alreadyRecorded && rows12?.n === 2
      && rep12?.execution?.nationalInsurance?.instructionsSentAt === '2026-09-15T11:00:00Z',
    JSON.stringify({ rec12b, rows12 }));
} finally {
  await cleanup();
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
