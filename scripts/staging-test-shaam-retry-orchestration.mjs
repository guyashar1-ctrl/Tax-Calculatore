#!/usr/bin/env node
/**
 * staging-test-shaam-retry-orchestration.mjs — «בכל זאת לנסות שוב» מקצה לקצה, מול השרת.
 *
 * ‼ האירוע (23.09.2026): משימת shaam.submit_poa נעצרה אחרי שנגעה בשע״ם
 * (progress.externalAttempt). שש לחיצות ביקשו ביטול בלי אישור, השרת סירב,
 * ולא נוצר ניסיון חדש. נבדק כאן, בדיוק בסדר שהמסך מבצע (startAutomationJob):
 *   1. ביטול בלי אישור ⇒ external_attempt_requires_acknowledgement, הקודמת לא זזה.
 *   2. ביטול עם אישור ⇒ הקודמת cancelled (נשארת בהיסטוריה).
 *   3. יצירה ⇒ בדיוק משימה פתוחה אחת, queued.
 *   4. יצירה שנייה ⇒ אותה משימה (created=false) — לא שתיים.
 *   5. העובד יכול לתפוס אותה (claim_next_automation_job).
 * ‼ staging בלבד. בסיום: המשימות של הבדיקה מבוטלות, והלקוח חוזר למצבו.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ROOT, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const env = loadEnv('.env.staging');
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
});

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const ACTION = 'shaam.submit_poa';

const client = await one(`select id from public.clients where user_id = '${USER_ID}' order by created_at limit 1`);
if (!client?.id) { console.error('✋ אין לקוח ב-staging.'); process.exit(1); }
const CID = client.id;
const openJobs = async () => (await writeStaging(`select id, status from public.automation_jobs where client_id = '${CID}' and action_type = '${ACTION}' and status in ('queued','running','needs_human')`));

// ניקוי: אם נשארה משימה פתוחה מהרצה קודמת — סוגרים (כמנהל).
await writeStaging(`update public.automation_jobs set status = 'cancelled', finished_at = now() where client_id = '${CID}' and action_type = '${ACTION}' and status in ('queued','running','needs_human')`);
const created = [];

try {
  console.log('— הכנה: משימה שנעצרה אחרי שנגעה בשע״ם —');
  const c0 = await user.rpc('create_automation_job', { p_client_id: CID, p_action_type: ACTION, p_input: { submissionKey: 'person:client', role: 'client' } });
  const oldId = c0.data?.job?.id;
  created.push(oldId);
  await writeStaging(`update public.automation_jobs set status = 'needs_human', error_code = 'ambiguous_submit_result', attempts = 1,
      progress = '{"externalAttempt":{"at":"2026-09-23T19:54:08.219Z","stage":"upload_signed_form"}}'::jsonb where id = '${oldId}'`);
  ok('המשימה «לא ידוע אם נקלט» קיימת', !!oldId);

  console.log('— 1. הכפתור הראשי (בלי אישור) —');
  const r1 = await user.rpc('cancel_automation_job', { p_job_id: oldId, p_acknowledge_external: false });
  ok('השרת מסרב: דורש אישור', r1.data?.ok === false && r1.data?.error === 'external_attempt_requires_acknowledgement', JSON.stringify(r1.data));
  ok('הקודמת לא זזה', (await one(`select status from public.automation_jobs where id = '${oldId}'`)).status === 'needs_human');

  console.log('— 2. «כן, נסה שוב» (עם אישור) —');
  const r2 = await user.rpc('cancel_automation_job', { p_job_id: oldId, p_acknowledge_external: true });
  ok('הקודמת בוטלה', r2.data?.ok === true, JSON.stringify(r2.data));
  const old = await one(`select status, progress from public.automation_jobs where id = '${oldId}'`);
  ok('הקודמת נשארת בהיסטוריה כ-cancelled, עם סימן הנגיעה', old.status === 'cancelled' && !!old.progress?.externalAttempt);

  console.log('— 3. יצירת הניסיון החדש —');
  const r3 = await user.rpc('create_automation_job', { p_client_id: CID, p_action_type: ACTION, p_input: { submissionKey: 'person:client', role: 'client' } });
  const newId = r3.data?.job?.id;
  created.push(newId);
  ok('נוצרה משימה חדשה', r3.data?.ok === true && r3.data?.created === true && newId && newId !== oldId, JSON.stringify(r3.data));
  const open1 = await openJobs();
  ok('בדיוק משימה פתוחה אחת, queued', open1.length === 1 && open1[0].id === newId && open1[0].status === 'queued', JSON.stringify(open1));

  console.log('— 4. לחיצה נוספת —');
  const r4 = await user.rpc('create_automation_job', { p_client_id: CID, p_action_type: ACTION, p_input: { submissionKey: 'person:client', role: 'client' } });
  ok('לא נוצרה שנייה (created=false, אותה משימה)', r4.data?.created === false && r4.data?.job?.id === newId, JSON.stringify(r4.data));
  ok('עדיין משימה פתוחה אחת', (await openJobs()).length === 1);

  console.log('— 5. העובד תופס —');
  const claim = await one(`select public.claim_next_automation_job('${USER_ID}'::uuid, 'staging-test-worker', array['${ACTION}'], 60) as j`);
  ok('העובד תפס את המשימה החדשה', claim.j?.id === newId, JSON.stringify(claim.j)?.slice(0, 200));
  const after = await one(`select status, claimed_by, attempts from public.automation_jobs where id = '${newId}'`);
  ok('running, attempts=1, בידי העובד', after.status === 'running' && after.claimed_by === 'staging-test-worker' && after.attempts === 1, JSON.stringify(after));
} finally {
  const ids = created.filter(Boolean).map((x) => `'${x}'`).join(',');
  if (ids) await writeStaging(`update public.automation_jobs set status = 'cancelled', finished_at = now() where id in (${ids}) and status <> 'cancelled'`);
  ok('ניקוי: אין משימות פתוחות של הבדיקה', (await openJobs()).length === 0);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
