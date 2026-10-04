#!/usr/bin/env node
/**
 * staging-e2e-ni-reminder-pause.mjs — עצירת מסלול הקליטה עוצרת בפועל את תזכורת אישור
 * ייפוי הכוח בביטוח לאומי, וחידוש מחזיר אותה — דרך הפונקציה האמיתית (representation-reminders)
 * וספק הדואר המדומה של staging (test_captured_emails). ‼ staging בלבד; שום מייל לא יוצא לאיש.
 *
 * דורש: 212 + 216 מוחלות ב-staging, והספק המדומה (scripts/staging-fake-email.mjs).
 * ההגדרה של המשרד (תזכורת ב"ל ללקוח) מופעלת לזמן הבדיקה ומוחזרת למה שהייתה בסוף.
 *
 *   שימוש:  node scripts/staging-e2e-ni-reminder-pause.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging, sql } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const SUPA = env.VITE_SUPABASE_URL;
const UID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const q = (s) => sql(STAGING_REF, s);
const tag = 'qani' + Math.random().toString(36).slice(2, 8);
const CID = `${tag}c`, ENG = `${tag}e`, RQ = `${tag}r`;
const EMAIL = `ni-pause-${tag}@example.test`;
const results = [];
const ok = (name, cond, got) => { results.push({ ok: !!cond, name, got }); console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + JSON.stringify(got).slice(0, 400)}`); };

// ‼ כמו ה-cron האמיתי: x-cron-secret מהכספת של staging (189).
const [{ secret: CRON }] = await sql(STAGING_REF, `select decrypted_secret secret from vault.decrypted_secrets where name = 'representation_reminder_cron_secret'`);
async function runReminders() {
  const r = await fetch(`${SUPA}/functions/v1/representation-reminders`, {
    method: 'POST', headers: { 'x-cron-secret': CRON, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const captured = async () => (await q(`select count(*)::int n, max(subject) s from public.test_captured_emails where to_emails::text ilike '%${EMAIL}%'`))[0];

const [{ settings: origSettings }] = await q(`select settings from public.profiles where id = '${UID}'`);
try {
  // ── הכנה: לקוח שההוראות לב"ל נשלחו אליו לפני חודש ולא אושרו; ריצת קליטה בעצירה ──
  await writeStaging(`
    update public.profiles set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('representation',
      coalesce(settings->'representation', '{}'::jsonb) || jsonb_build_object('reminders',
        coalesce(settings->'representation'->'reminders', '{}'::jsonb)
        || '{"niClient":{"enabled":true,"afterDays":7,"maxReminders":2}}'::jsonb)) where id = '${UID}';
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, authority_representations)
    values ('${CID}', '${UID}', 'בדיקה', 'QA-NI', '${EMAIL}', 'onboarding', 'single', 'licensed', '{"nationalInsurance":{"targets":["client"]}}');
    insert into public.engagements (id, user_id, client_id, status, process_published_at) values ('${ENG}', '${UID}', '${CID}', 'onboarding', now());
    insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, status, onboarding_token, execution)
    values ('${RQ}', '${UID}', '${CID}', 'QA-NI', '${EMAIL}', 'awaiting_authorities', '${tag}-tok',
            jsonb_build_object('nationalInsurance', jsonb_build_object('instructionsSentAt', now() - interval '30 days', 'referenceNumber', '1234567')));
  `);
  const [{ id: runId }] = await q(`
    insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, status, engagement_id, paused_at)
    values ('${UID}', '${CID}', public.ensure_onboarding_flow((select office_id from public.profiles where id = '${UID}')), 1, '${ENG}',
            'quote_approved', 'paused', '${ENG}', now()) returning id`);
  const rep = await q(`select id from public.onboarding_steps where client_id = '${CID}' and step_type = 'representation' and status <> 'cancelled' limit 1`);
  if (rep.length) {
    await writeStaging(`update public.onboarding_steps set flow_run_id = '${runId}', flow_stage_key = 's1', flow_item_key = 'representation' where id = '${rep[0].id}'`);
  } else {
    await writeStaging(`insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, flow_run_id, flow_stage_key, flow_item_key)
      values ('${UID}', '${ENG}', '${CID}', 'representation', 'authorities', 'person', 'in_progress', 'me', '{"representationRequestId":"${RQ}"}', now(), '${runId}', 's1', 'representation')`);
  }

  // ── 1 · בעצירה: הפונקציה רצה, ולא יוצאת תזכורת ──
  const r1 = await runReminders();
  ok('1.1 הפונקציה האמיתית רצה (200)', r1.status === 200, r1);
  console.log('  תשובת הפונקציה:', JSON.stringify(r1.body).slice(0, 600));
  const c1 = await captured();
  const [{ rem: rem1 }] = await q(`select execution->'reminders' rem from public.representation_requests where id = '${RQ}'`);
  ok('1.2 המסלול בעצירה ⇒ לא נקלט שום מייל ללקוח, והמונה לא זז', c1.n === 0 && rem1 == null, { c1, rem1 });

  // ── 2 · חידוש: אותה הרצה — יוצאת תזכורת אחת ──
  await writeStaging(`update public.flow_runs set status = 'active', paused_at = null where id = '${runId}'`);
  const r2 = await runReminders();
  ok('2.1 הפונקציה רצה שוב (200)', r2.status === 200, r2);
  console.log('  תשובת הפונקציה:', JSON.stringify(r2.body).slice(0, 600));
  await new Promise(r => setTimeout(r, 2000));
  const c2 = await captured();
  const [{ rem: rem2 }] = await q(`select execution->'reminders' rem from public.representation_requests where id = '${RQ}'`);
  ok('2.2 אחרי החידוש ⇒ תזכורת אישור ב"ל אחת נקלטה אצל הספק המדומה, והמונה 1', c2.n === 1 && /ביטוח הלאומי/.test(c2.s || '') && rem2?.niClient?.count === 1, { c2, rem2 });

  // ── 3 · הרצה נוספת מיד — לא כפולה (טרם הגיע הזמן לתזכורת הבאה) ──
  await runReminders();
  const c3 = await captured();
  ok('3.1 הרצה חוזרת מיד ⇒ לא נשלחה תזכורת שנייה', c3.n === 1, c3);
} finally {
  await writeStaging(`
    update public.profiles set settings = '${JSON.stringify(origSettings ?? {}).replace(/'/g, "''")}'::jsonb where id = '${UID}';
    delete from public.email_messages where client_id = '${CID}';
    delete from public.onboarding_events where engagement_id = '${ENG}' or step_id in (select id from public.onboarding_steps where client_id = '${CID}');
    delete from public.onboarding_step_dependencies where step_id in (select id from public.onboarding_steps where client_id = '${CID}');
    delete from public.onboarding_steps where client_id = '${CID}';
    delete from public.flow_runs where client_id = '${CID}';
    delete from public.representation_requests where id = '${RQ}';
    delete from public.engagements where id = '${ENG}';
    delete from public.clients where id = '${CID}';
  `).catch(e => console.error('ניקוי:', e.message));
  console.log('ההגדרה של המשרד הוחזרה; נתוני הבדיקה נמחקו.');
}
const fail = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fail} עברו · ${fail} נכשלו`);
process.exitCode = fail ? 1 : 0;
