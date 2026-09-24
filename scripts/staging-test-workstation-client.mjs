#!/usr/bin/env node
/**
 * staging-test-workstation-client.mjs — קוד העובד האמיתי (register.mjs +
 * apiClient.mjs) מול automation-worker של סביבת הבדיקות: רישום בקוד צימוד,
 * תפיסה והשלמה של משימת dev בלבד עם האסימון, ומופע שני של אותה זהות חסום.
 * ‼ לא מריץ את לולאת העובד (הצופה שלה נוגע בחלונות Chrome של העובד החי).
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, STAGING_REF, writeStaging } from './staging-lib.mjs';

const USER = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN_URL = `https://${STAGING_REF}.supabase.co/functions/v1/automation-worker`;
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

const code = 'FXC' + Math.random().toString(36).slice(2, 9).toUpperCase();
await writeStaging(`delete from public.automation_jobs where id like 'fx-203c-%';
  insert into public.automation_workstation_pairings (code_hash, user_id, label, expires_at)
  values ('${createHash('sha256').update(code).digest('hex')}', '${USER}', 'fx-203', now() + interval '5 minutes')`);

// register.mjs כותב worker/.env — מריצים אותו על עותק זמני של התיקייה.
const tmp = mkdtempSync(join(tmpdir(), 'pivo-ws-'));
const wsWorker = join(tmp, 'worker');
execFileSync('cmd', ['/c', 'xcopy', '/E', '/I', '/Q', resolve(ROOT, 'worker', 'src'), join(wsWorker, 'src')]);
writeFileSync(join(wsWorker, 'package.json'), readFileSync(resolve(ROOT, 'worker', 'package.json')));
writeFileSync(join(wsWorker, '.env'), `PIVO_FUNCTION_URL=${FN_URL}\nPIVO_WORKER_SECRET=legacy-should-be-removed\n`);
let workerId = null;
try {
  const out = execFileSync('node', [join(wsWorker, 'src', 'register.mjs'), '--code', code, '--label', 'fx-203'], { encoding: 'utf8' });
  const env = readFileSync(join(wsWorker, '.env'), 'utf8');
  workerId = env.match(/^PIVO_WORKER_ID=(.+)$/m)?.[1];
  ok('register.mjs ⇒ נרשם', /נרשם/.test(out) && /^ws-/.test(workerId ?? ''), out);
  ok('.env: אסימון נכתב, הסוד המשותף ירד', /^PIVO_WORKER_TOKEN=.{30,}$/m.test(env) && !env.includes('PIVO_WORKER_SECRET'));

  await writeStaging(`insert into public.automation_jobs (id, user_id, client_id, action_type, input, status, max_attempts)
    values ('fx-203c-1', '${USER}', null, 'dev.test_automation', '{}'::jsonb, 'queued', 3)`);

  // תהליך 1: תופס ומשלים. תהליך 2 (אותה זהות, מופע אחר): חסום.
  const probe = (label) => execFileSync('node', ['--input-type=module', '-e', `
    const api = await import(${JSON.stringify('file:///' + join(wsWorker, 'src', 'apiClient.mjs').replace(/\\/g, '/'))});
    const cfg = await import(${JSON.stringify('file:///' + join(wsWorker, 'src', 'config.mjs').replace(/\\/g, '/'))});
    const r = await api.claim(cfg.USER_ID, cfg.WORKER_ID, ['dev.test_automation'], 60);
    let done = null;
    if (r?.job) done = await api.complete(cfg.WORKER_ID, r.job.id, { via: ${JSON.stringify(label)} }, []);
    const hb = await api.heartbeat(cfg.USER_ID, cfg.WORKER_ID, null, 60, 'test');
    console.log(JSON.stringify({ job: r?.job?.id ?? null, blocked: r?.blocked ?? null, done: done?.ok ?? null, hb }));
    await new Promise(r => setTimeout(r, ${label === 'p1' ? 0 : 0}));
  `], { encoding: 'utf8', cwd: wsWorker }).trim().split('\n').pop();

  const p1 = JSON.parse(probe('p1'));
  ok('תהליך 1 תפס והשלים עם האסימון', p1.job === 'fx-203c-1' && p1.done === true, JSON.stringify(p1));
  const p2 = JSON.parse(probe('p2'));
  ok('תהליך 2 עם אותה זהות (מופע אחר, מיד אחרי) ⇒ חסום', p2.blocked === 'instance_conflict' && p2.hb?.error === 'instance_conflict', JSON.stringify(p2));
  const row = (await writeStaging(`select status, claimed_by, result from public.automation_jobs where id = 'fx-203c-1'`))[0];
  ok('המשימה הושלמה פעם אחת, בידי הזהות הרשומה', row.status === 'succeeded' && row.claimed_by === workerId && row.result?.via === 'p1', JSON.stringify(row));
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await writeStaging(`delete from public.automation_jobs where id like 'fx-203c-%';
    delete from public.automation_workers where label = 'fx-203';
    delete from public.automation_workstation_pairings where label = 'fx-203';`);
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
