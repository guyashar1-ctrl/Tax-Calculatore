// בדיקה שיסוד האוטומציה (supabase/150-automation-jobs.sql) עומד בשלוש
// הערבויות שהוא נבנה עבורן: שני עובדים לא יכולים לתפוס את אותה משימה,
// עובד שמת לא תוקע אותה לצמיתות (תפוגת חכירה משחררת אותה מחדש), ותפיסת
// בעלות נבדקת בכל מעבר — לא רק בתפיסה הראשונית.
// הרצה:  node scripts/verify-automation-jobs.mjs
//
// רץ אך ורק מול סביבת הבדיקות (staging-lib.mjs חוסם כתיבה לפרודקשן).
// יוצר ומוחק שורות זמניות תחת action_type='__verify_150' על לקוח בדיקות קיים.

import { sql, STAGING_REF } from './staging-lib.mjs';
const q = (query) => sql(STAGING_REF, query);

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('  ok:', msg);
}

const [{ id: clientId, user_id: userId }] = await q(`select id, user_id from public.clients limit 1;`);
console.log('using client', clientId, 'user', userId);

// clean slate
await q(`delete from public.automation_jobs where action_type = '__verify_150';`);
await q(`delete from public.automation_workers where worker_id in ('__wA','__wB');`);

console.log('\n--- 1. insert a queued job directly ---');
const [job] = await q(`
  insert into public.automation_jobs (user_id, client_id, action_type, input, status)
  values ('${userId}', '${clientId}', '__verify_150', '{}'::jsonb, 'queued')
  returning id, status, attempts;
`);
console.log(job);
assert(job.status === 'queued' && job.attempts === 0, 'starts queued, attempts=0');
const jobId = job.id;

console.log('\n--- 2. unique-open-job constraint ---');
try {
  await q(`insert into public.automation_jobs (user_id, client_id, action_type, input, status)
            values ('${userId}', '${clientId}', '__verify_150', '{}'::jsonb, 'queued');`);
  throw new Error('FAIL: second queued job for same (client,action) should have been rejected');
} catch (e) {
  assert(String(e.message).includes('duplicate key') || String(e.message).includes('automation_jobs_open_unique'), 'second open job rejected by unique index: ' + e.message.slice(0, 120));
}

console.log('\n--- 3. workerA claims it ---');
const [claimA] = await q(`select public.claim_next_automation_job('${userId}'::uuid, '__wA', null, 5) as j;`);
const jA = claimA.j;
console.log(jA);
assert(jA && jA.status === 'running' && jA.claimed_by === '__wA' && jA.attempts === 1, 'workerA claimed, running, attempts=1');

console.log('\n--- 4. workerB tries immediately, must get nothing (lease not expired) ---');
const [claimB1] = await q(`select public.claim_next_automation_job('${userId}'::uuid, '__wB', null, 5) as j;`);
assert(claimB1.j === null, 'workerB got null while workerA lease is alive — no double-claim');

console.log('\n--- 5. wait for lease to expire (6s), then workerB reclaims (crash recovery) ---');
await new Promise(r => setTimeout(r, 6500));
const [claimB2] = await q(`select public.claim_next_automation_job('${userId}'::uuid, '__wB', null, 30) as j;`);
const jB = claimB2.j;
console.log(jB);
assert(jB && jB.status === 'running' && jB.claimed_by === '__wB' && jB.attempts === 2, 'workerB reclaimed expired lease, attempts=2 — dead worker did not wedge the job');

console.log('\n--- 6. heartbeat extends lease + upserts worker row ---');
const [hb] = await q(`select public.heartbeat_automation_job('${userId}'::uuid, '__wB', '${jobId}', 45, 'v0-test') as r;`);
console.log(hb.r);
assert(hb.r.ok === true, 'heartbeat ok');
const [[w]] = [await q(`select worker_id, last_seen_at, version from public.automation_workers where worker_id = '__wB';`)];
console.log(w);
assert(w.version === 'v0-test', 'worker last-seen row recorded');

console.log('\n--- 7. workerA (the dead one) can no longer complete it ---');
const [compA] = await q(`select public.complete_automation_job('__wA', '${jobId}', '{"x":1}'::jsonb) as r;`);
console.log(compA.r);
assert(compA.r.ok === false, 'stale workerA cannot complete a job it no longer owns');

console.log('\n--- 8. workerB completes it ---');
const [compB] = await q(`select public.complete_automation_job('__wB', '${jobId}', '{"x":1}'::jsonb) as r;`);
console.log(compB.r);
assert(compB.r.ok === true && compB.r.job.status === 'succeeded', 'workerB completed successfully');

console.log('\n--- 9. double-complete is rejected (already finished) ---');
const [compB2] = await q(`select public.complete_automation_job('__wB', '${jobId}', '{}'::jsonb) as r;`);
assert(compB2.r.ok === false, 'second complete on a finished job rejected');

console.log('\n--- 10. fail_automation_job with needs_human ---');
const [job2] = await q(`
  insert into public.automation_jobs (user_id, client_id, action_type, input, status)
  values ('${userId}', '${clientId}', '__verify_150', '{}'::jsonb, 'queued')
  returning id;
`);
const [claimC] = await q(`select public.claim_next_automation_job('${userId}'::uuid, '__wC', null, 30) as j;`);
assert(claimC.j.id === job2.id, 'claimed second test job');
const [failC] = await q(`select public.fail_automation_job('__wC', '${job2.id}', 'auth_required', 'need login', 'log in to SHAAM') as r;`);
console.log(failC.r);
assert(failC.r.ok === true && failC.r.job.status === 'needs_human' && failC.r.job.finished_at === null, 'needs_human is non-terminal');

console.log('\n--- cleanup ---');
await q(`delete from public.automation_jobs where action_type = '__verify_150';`);
await q(`delete from public.automation_workers where worker_id in ('__wA','__wB','__wC');`);
console.log('\nALL PASSED');
