#!/usr/bin/env node
/**
 * staging-e2e-scheduled.mjs — שליחה מתוזמנת, תזכורות והודעות למשרד, מקצה לקצה.
 *
 * ‼ המנגנון האמיתי: kick_due_client_notices() (מה שה-cron מריץ בייצור כל 5 דקות) ⇒
 *   pg_net ⇒ send-process-open-email / notify-accountant ⇒ ספק הדואר. ב-staging הספק
 *   הוא fake-email-provider שקולט ל-test_captured_emails (scripts/staging-fake-email.mjs) —
 *   שום מייל לא יוצא לאדם. הזמן מדומה בהזזת תאריכים (due_at, announced_at), לא בהמתנה.
 *
 * תרחישים: «לבד» אחרי פתיחה · שתי הפעלות במקביל · אירוע חוזר · תוספת לפני השליחה
 * (מתאחדת) ואחריה (מייל נפרד, רק החדש) · עצירה וחידוש לפני השליחה · ביטול לפני
 * השליחה · כשל מהספק וניסיון חוזר באותו מפתח · תזכורות ומגבלת הפעמים · הודעה למשרד
 * כששלב הושלם, בלי כפילות.
 * הנתונים מסומנים QAE2E ונמחקים לפני ואחרי.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging as raw } from './staging-lib.mjs';

async function sqlq(query) {
  for (let a = 0; ; a++) {
    try { return await raw(query); } catch (e) {
      if (e.http !== 429 || a >= 10) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * 2 ** a)));
    }
  }
}
const one = async (q) => (await sqlq(q))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN = (n) => `${env.VITE_SUPABASE_URL}/functions/v1/${n}`;
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error } = await db.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (error) { console.error('✋ כניסה למשתמש הבדיקות נכשלה — עוצרים (לא מנסים שוב):', error.message); process.exit(1); }
const JWT = s.session.access_token;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const rpc = async (fn, args) => {
  const { data, error: e } = await db.rpc(fn, args);
  if (e) throw new Error(`${fn}: ${e.message}`);
  return data;
};
const kick = () => sqlq('select public.kick_due_client_notices() r');
const TAG = 'QAE2E';
const R = Math.random().toString(36).slice(2, 8);
const mail = (who) => `${who}-${R}@example.test`;
// מה שהספק המדומה «שלח» לכתובת — רק delivered נחשב מייל שיצא.
const delivered = async (addr) => (await one(`select count(*)::int n from public.test_captured_emails
  where mode = 'delivered' and '${addr}' = any (to_emails)`)).n;
const lastHtml = async (addr) => (await one(`select html, subject from public.test_captured_emails
  where mode = 'delivered' and '${addr}' = any (to_emails) order by created_at desc limit 1`)) ?? {};
async function waitFor(pred, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await pred()) return true; await sleep(2_000); }
  return false;
}
const dueNow = (cid) => sqlq(`update public.client_notices set due_at = now() - interval '1 second', last_kicked_at = null
  where client_id = '${cid}' and status = 'queued'`);
const noticeStatus = async (cid) => (await sqlq(`select kind, status, origin from public.client_notices where client_id = '${cid}' order by created_at`));

async function cleanup() {
  await sqlq(`
    delete from public.test_captured_emails
     where exists (select 1 from unnest(to_emails) t where t like any (array['a-%@example.test','b-%@example.test','fail-once-%@example.test']))
        or idem_key in (select 'acct-' || id from public.accountant_notifications
                         where client_id in (select id from public.clients where last_name = '${TAG}'));
    delete from public.accountant_notifications where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.email_messages where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.client_notices where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${TAG}'));
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.flow_runs where client_id in (select id from public.clients where last_name = '${TAG}');
    delete from public.clients where last_name = '${TAG}';
    delete from public.office_flows where name like '${TAG}%';
    delete from public.journey_templates where name like '${TAG}%';`);
}

console.log(`סביבה: ${STAGING_REF} · ספק מדומה · ריצה ${R}\n`);
await cleanup();
try {
  // ── הכנה: ארבע בקשות בספרייה ומסלול ידני «לבד» + תזכורת + הודעה למשרד ──
  const office = (await one(`select office_id from public.profiles where id = '${USER_ID}'`)).office_id;
  const tpl = async (name) => (await one(`insert into public.journey_templates (user_id, office_id, kind, name, entries)
    values ('${USER_ID}', '${office}', 'request', '${TAG} ${name}', jsonb_build_array(jsonb_build_object('key','e1','stepType','custom_request','owner','client',
      'payload', jsonb_build_object('title','${name}','clientTitle','${name}','requirements',
        jsonb_build_array(jsonb_build_object('key','r1','kind','file','label','${name}','done',false,'required',true)))))) returning id`)).id;
  const tA = await tpl('תלושי שכר'), tB = await tpl('אישור בנק');
  const flow = await rpc('create_office_flow', { p_name: `${TAG} אוטומטי`, p_trigger: 'manual', p_definition: { stages: [
    { key: 's1', name: 'איסוף', opens: { after: 'start' }, delivery: 'auto', reminder: { afterDays: 1, max: 2 }, notifyOffice: true,
      items: [{ key: 'a', ref: { kind: 'template', templateId: tA } }, { key: 'b', ref: { kind: 'template', templateId: tB } }] },
  ] } });
  if (!flow?.flowId) throw new Error('create_office_flow: ' + JSON.stringify(flow));
  const client = async (who, email) => (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
    values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', '${who}', '${TAG}', '${email}', 'active') returning id`)).id;
  const addLate = async (cid, runId, title) => {
    const r = await rpc('create_onboarding_request', { p_client_id: cid, p_step_type: 'custom_request',
      p_payload: { title, clientTitle: title, requirements: [{ key: 'r1', kind: 'file', label: title, done: false, required: true }] },
      p_published: true });
    if (!r?.ok) throw new Error('create_onboarding_request: ' + JSON.stringify(r));
    const at = await rpc('attach_step_to_flow_stage', { p_step_id: r.stepId, p_run_id: runId, p_stage_key: 's1' });
    if (at?.ok === false) throw new Error('attach: ' + JSON.stringify(at));
    return r.stepId;
  };

  // ── 1 · «לבד» + תוספת לפני השליחה + שתי הפעלות במקביל ──
  const eA = mail('a');
  const A = await client('אלף', eA);
  const runA = (await rpc('start_flow_run', { p_client_id: A, p_flow_id: flow.flowId, p_cycle_key: null, p_allow_auto_actions: false })).runId;
  let q = await noticeStatus(A);
  ok('1.1 פתיחה בשלב «לבד» ⇒ מייל אחד בתור (לא נשלח מיד)', q.length === 1 && q[0].status === 'queued' && q[0].origin === 'auto', JSON.stringify(q));
  await addLate(A, runA, 'מאוחר א');
  q = await noticeStatus(A);
  ok('1.2 תוספת לפני השליחה ⇒ אותו מייל בתור (לא שני)', q.filter((n) => n.status === 'queued').length === 1, JSON.stringify(q));
  await dueNow(A);
  await Promise.all([kick(), kick()]);
  ok('1.3 שתי הפעלות במקביל ⇒ מייל אחד יצא', await waitFor(async () => (await delivered(eA)) >= 1) && (await sleep(6_000), (await delivered(eA)) === 1),
    `delivered=${await delivered(eA)}`);
  let h = await lastHtml(eA);
  ok('1.4 המייל המרוכז כולל את שלוש הבקשות, כולל התוספת', ['תלושי שכר', 'אישור בנק', 'מאוחר א'].every((t) => (h.html ?? '').includes(t)), h.subject);
  q = await noticeStatus(A);
  ok('1.5 ההודעה «נשלחה» ונרשמה ביומן', q.some((n) => n.status === 'sent')
    && (await one(`select count(*)::int n from public.email_messages where client_id = '${A}' and status = 'sent'`)).n === 1, JSON.stringify(q));

  // ── 2 · אירוע חוזר ──
  await rpc('flow_run_add_items', { p_run_id: runA, p_item_keys: ['a', 'b'], p_roles: null });
  await Promise.all([kick(), kick()]);
  await sleep(8_000);
  ok('2.1 אירוע חוזר והפעלות נוספות ⇒ אין מייל שני', (await delivered(eA)) === 1, `delivered=${await delivered(eA)}`);

  // ── 3 · תוספת אחרי השליחה ⇒ מייל נפרד, רק החדש ──
  await addLate(A, runA, 'מאוחר ב');
  await dueNow(A);
  await kick();
  ok('3.1 תוספת אחרי השליחה ⇒ מייל שני', await waitFor(async () => (await delivered(eA)) === 2), `delivered=${await delivered(eA)}`);
  const items3 = await sqlq(`select s.payload->>'title' t from public.client_notice_items i join public.onboarding_steps s on s.id = i.step_id
    where i.notice_id = (select id from public.client_notices where client_id = '${A}' and status = 'sent' order by created_at desc limit 1)`);
  ok('3.2 המייל השני מודיע רק על מה שחדש', items3.length === 1 && items3[0].t === 'מאוחר ב', JSON.stringify(items3));

  // ── 4 · עצירה לפני השליחה, ואז חידוש ──
  await addLate(A, runA, 'מאוחר ג');
  await rpc('pause_flow_run', { p_run_id: runA });
  await dueNow(A);
  await kick();
  await sleep(10_000);
  ok('4.1 בעצירה ⇒ שום מייל לא יוצא לבד', (await delivered(eA)) === 2, `delivered=${await delivered(eA)}`);
  await rpc('resume_flow_run', { p_run_id: runA });
  await dueNow(A);
  await kick();
  ok('4.2 חידוש ⇒ מה שהתעכב יוצא, במייל אחד', await waitFor(async () => (await delivered(eA)) === 3)
    && ((await lastHtml(eA)).html ?? '').includes('מאוחר ג'), `delivered=${await delivered(eA)}`);

  // ── 5 · ביטול לפני השליחה ──
  const eB = mail('b');
  const B = await client('בית', eB);
  const runB = (await rpc('start_flow_run', { p_client_id: B, p_flow_id: flow.flowId, p_cycle_key: null, p_allow_auto_actions: false })).runId;
  await rpc('cancel_flow_run', { p_run_id: runB });
  await dueNow(B);
  await kick();
  await sleep(10_000);
  ok('5.1 ביטול לפני השליחה ⇒ אין מייל', (await delivered(eB)) === 0, `delivered=${await delivered(eB)}`);

  // ── 6 · כשל מהספק וניסיון חוזר באותו מפתח ──
  const eC = mail('fail-once');
  const C = await client('גימל', eC);
  await rpc('start_flow_run', { p_client_id: C, p_flow_id: flow.flowId, p_cycle_key: null, p_allow_auto_actions: false });
  await dueNow(C);
  await kick();
  await waitFor(async () => (await one(`select count(*)::int n from public.test_captured_emails where mode = 'rejected' and '${eC}' = any (to_emails)`)).n >= 1);
  await sleep(4_000);
  q = await noticeStatus(C);
  ok('6.1 כשל 5xx ⇒ «לא ידוע» (לא «נשלח», לא משוחרר לבד)', (await delivered(eC)) === 0 && q.some((n) => n.status === 'unknown'), JSON.stringify(q));
  const unknownId = (await one(`select id from public.client_notices where client_id = '${C}' and status = 'unknown'`))?.id;
  const retry = async () => {
    const r = await fetch(FN('send-process-open-email'), { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${JWT}` },
      body: JSON.stringify({ clientId: C, noticeId: unknownId, retry: true }) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const r1 = await retry();
  ok('6.2 «שלח שוב (אותו מייל)» ⇒ יצא, פעם אחת', r1.status === 200 && (await delivered(eC)) === 1, JSON.stringify(r1));
  const keys = await sqlq(`select distinct idem_key from public.test_captured_emails where '${eC}' = any (to_emails)`);
  ok('6.3 הניסיון החוזר באותו מפתח אצל הספק', keys.length === 1 && !!keys[0].idem_key, JSON.stringify(keys));
  const r2 = await retry();
  ok('6.4 לחיצה נוספת ⇒ לא נשלח שוב', (await delivered(eC)) === 1, JSON.stringify(r2));

  // ── 7 · תזכורות: אחרי יום, לכל היותר פעמיים ──
  // «עבר יום»: התאריכים זזים אחורה — וגם מפתח התזכורת היומי (אחת ביום ללקוח, לפי תאריך)
  // של התזכורת הקודמת, כאילו נשלחה ביום אחר.
  const remind = () => sqlq(`update public.client_step_notice_state ns set announced_at = now() - interval '2 days',
      last_reminded_at = case when last_reminded_at is null then null else now() - interval '2 days' end
    where step_id in (select id from public.onboarding_steps where client_id = '${A}');
    update public.client_notices set idempotency_key = idempotency_key || ':past-' || substr(md5(random()::text), 1, 6)
     where client_id = '${A}' and kind = 'reminder';`);
  const before7 = await delivered(eA);
  await remind();
  await kick();
  ok('7.1 עבר יום ⇒ תזכורת אחת', await waitFor(async () => (await delivered(eA)) === before7 + 1), `delivered=${await delivered(eA)}`);
  q = await noticeStatus(A);
  ok('7.2 התזכורת נפרדת מ«חדש»', q.some((n) => n.kind === 'reminder' && n.status === 'sent'), JSON.stringify(q.slice(-2)));
  await kick();
  await sleep(8_000);
  ok('7.3 באותו יום ⇒ אין תזכורת שנייה', (await delivered(eA)) === before7 + 1, `delivered=${await delivered(eA)}`);
  await remind(); await kick();
  ok('7.4 עוד יום ⇒ תזכורת שנייה', await waitFor(async () => (await delivered(eA)) === before7 + 2), `delivered=${await delivered(eA)}`);
  await remind(); await kick(); await sleep(10_000);
  ok('7.5 מגבלת «עד פעמיים» ⇒ אין שלישית', (await delivered(eA)) === before7 + 2, `delivered=${await delivered(eA)}`);

  // ── 8 · הודעה למשרד כשהשלב הושלם ──
  const open = await sqlq(`select id from public.onboarding_steps where client_id = '${A}' and flow_run_id = '${runA}'
    and status not in ('completed','verified','skipped','cancelled')`);
  for (const st of open) await rpc('advance_onboarding_step', { p_step_id: st.id, p_action: 'complete', p_payload: {} });
  const an = await one(`select id, sent_at from public.accountant_notifications where client_id = '${A}' and kind = 'flow_stage_done'`);
  ok('8.1 השלב הושלם ⇒ הודעה למשרד ממתינה', !!an?.id, JSON.stringify(an));
  await Promise.all([kick(), kick()]);
  ok('8.2 ההודעה יצאה (לספק המדומה)', await waitFor(async () => !!(await one(`select sent_at from public.accountant_notifications where id = '${an?.id}'`))?.sent_at));
  await kick(); await sleep(8_000);
  const accDelivered = (await one(`select count(*)::int n from public.test_captured_emails where mode = 'delivered' and idem_key = 'acct-${an?.id}'`)).n;
  ok('8.3 הודעה אחת למשרד, גם אחרי הפעלות חוזרות', accDelivered === 1, `n=${accDelivered}`);
} catch (e) { fail++; console.error('✋', e?.message ?? e); }
finally { await cleanup(); console.log(`\n${pass} עברו · ${fail} נכשלו`); process.exitCode = fail ? 1 : 0; }
