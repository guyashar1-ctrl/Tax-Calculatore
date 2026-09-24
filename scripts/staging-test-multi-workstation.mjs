#!/usr/bin/env node
/**
 * staging-test-multi-workstation.mjs — מיגרציה 203 + automation-worker: כמה
 * מחשבי עבודה, בלי ביצוע כפול. מול המסד והפונקציה האמיתיים של סביבת הבדיקות.
 * שום פעולה אינה פונה לשע״ם או לב״ל — משימות הבדיקה נכתבות ונתפסות בלבד.
 *
 * הרצה:  node scripts/staging-test-multi-workstation.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ROOT, STAGING_REF, writeStaging } from './staging-lib.mjs';

const USER = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN_URL = `https://${STAGING_REF}.supabase.co/functions/v1/automation-worker`;
const OTHER_USER = randomUUID();   // חשבון שלא קיים — מספיק כדי להוכיח שזהות לא «עוברת» חשבון

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const all = async (s) => (await writeStaging(s)) ?? [];
const one = async (s) => (await all(s))[0];
const q = (s) => String(s).replace(/'/g, "''");
const lit = (v) => v === null || v === undefined ? 'null' : `'${q(v)}'`;
const arr = (a) => a ? `array[${a.map(lit).join(',')}]::text[]` : 'null::text[]';

const claim = async (worker, instance, types = null, user = USER) =>
  (await one(`select public.claim_next_automation_job('${user}'::uuid, ${lit(worker)}, ${arr(types)}, 60${instance === undefined ? '' : `, ${lit(instance)}`}) as r`))?.r;
const status = (worker, instance, st) =>
  one(`select public.report_worker_status('${USER}'::uuid, ${lit(worker)}, '${q(JSON.stringify(st))}'::jsonb, ${lit(instance)}) as r`);
const job = (id) => one(`select id, status, claimed_by, error_code, attempts from public.automation_jobs where id = ${lit(id)}`);
const addJob = (id, action, extra = '') => writeStaging(`
  insert into public.automation_jobs (id, user_id, client_id, action_type, input, status, max_attempts${extra ? ', progress' : ''})
  values (${lit(id)}, '${USER}', null, ${lit(action)}, '{}'::jsonb, 'queued', ${action.includes('create') || action.includes('submit') ? 1 : 3}${extra ? `, '${q(extra)}'::jsonb` : ''});`);
const done = (worker, id) => writeStaging(`select public.complete_automation_job(${lit(worker)}, ${lit(id)}, '{}'::jsonb, '[]'::jsonb)`);
const clean = () => writeStaging(`
  delete from public.automation_jobs where id like 'fx-203-%';
  delete from public.automation_workers where worker_id like 'fx-203-%' or worker_id like 'ws-%' and label = 'fx-203';
  delete from public.automation_workstation_pairings where label = 'fx-203';`);
// ‼ לא להפריע למשימות אמיתיות בסביבת הבדיקות: כל ריצה מוגבלת לסוגים ייעודיים.
const T = ['dev.test_automation', 'shaam.create_representation', 'shaam.check_representation', 'shaam.connect', 'btl.create_representation', 'btl.check_representation'];
const hostOf = (idle) => ({ host: { idleSeconds: idle, reportedAt: new Date().toISOString() } });

await clean();
try {
  // ── 1 · מחשב אחד ⇒ תופס ────────────────────────────────────────────────
  console.log('1 · מחשב אחד');
  await status('fx-203-A', 'a1', { shaam: { connected: true }, btl: { connected: true }, ...hostOf(10) });
  await addJob('fx-203-j1', 'dev.test_automation');
  let r = await claim('fx-203-A', 'a1', T);
  ok('נתפסה', r?.id === 'fx-203-j1', JSON.stringify(r));

  // ── 3 · A מחזיק ⇒ B לא משלים/נכשל/מאריך/כותב התקדמות ──────────────────
  console.log('3 · משימה של A');
  const cB = await one(`select public.complete_automation_job('fx-203-B', 'fx-203-j1', '{}'::jsonb, '[]'::jsonb) as r`);
  ok('B לא משלים', cB?.r?.ok === false);
  const hB = await one(`select public.heartbeat_automation_job('${USER}'::uuid, 'fx-203-B', 'fx-203-j1', 60, null, 'b1') as r`);
  ok('B לא מאריך חכירה', hB?.r?.ok === false);
  const pB = await one(`select public.update_automation_job_progress('fx-203-B', 'fx-203-j1', 0, '{"externalAttempt":{}}'::jsonb) as r`);
  ok('B לא כותב התקדמות', pB?.r?.ok === false);
  ok('עדיין של A', (await job('fx-203-j1')).claimed_by === 'fx-203-A');
  await done('fx-203-A', 'fx-203-j1');

  // ── 2 · שני מחשבים באותו רגע ⇒ תופס אחד בלבד ───────────────────────────
  console.log('2 · תפיסה מקבילית');
  await status('fx-203-B', 'b1', { shaam: { connected: true }, btl: { connected: true }, ...hostOf(20) });
  await addJob('fx-203-j2', 'dev.test_automation');
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    claim(i % 2 ? 'fx-203-B' : 'fx-203-A', i % 2 ? 'b1' : 'a1', ['dev.test_automation']).catch(e => ({ err: String(e) }))));
  const winners = results.filter(x => x?.id === 'fx-203-j2');
  ok('בדיוק תופס אחד מתוך 12 בקשות מקבילות', winners.length === 1, `${winners.length} · ${JSON.stringify(results.map(x => x?.id ?? x?.blocked ?? x?.err ?? null))}`);
  ok('ניסיון אחד נרשם', (await job('fx-203-j2')).attempts === 1);
  await done((await job('fx-203-j2')).claimed_by, 'fx-203-j2');

  // ── 12 · תהליך כפול עם אותה זהות ⇒ לא תופס ──────────────────────────────
  console.log('12 · מופע כפול');
  await addJob('fx-203-j3', 'dev.test_automation');
  r = await claim('fx-203-A', 'a2', ['dev.test_automation']);
  ok('מופע שני של A חסום', r?.blocked === 'instance_conflict', JSON.stringify(r));
  ok('המשימה לא נתפסה', (await job('fx-203-j3')).status === 'queued');
  const hb = await one(`select public.heartbeat_automation_job('${USER}'::uuid, 'fx-203-A', null, 60, null, 'a2') as r`);
  ok('גם פעימת לב של המופע השני נדחית', hb?.r?.error === 'instance_conflict');
  await writeStaging(`update public.automation_workers set instance_seen_at = now() - interval '5 minutes' where worker_id = 'fx-203-A'`);
  r = await claim('fx-203-A', 'a2', ['dev.test_automation']);
  ok('מופע ותיק שמת ⇒ המופע החדש מחליף (הפעלה מחדש)', r?.id === 'fx-203-j3', JSON.stringify(r));
  await done('fx-203-A', 'fx-203-j3');

  // ── 11 · חשבון אחר ⇒ לא תופס ─────────────────────────────────────────────
  console.log('11 · חשבון אחר');
  r = await claim('fx-203-A', 'a2', T, OTHER_USER);
  ok('זהות של חשבון אחר חסומה (wrong_account)', r?.blocked === 'wrong_account', JSON.stringify(r));
  const owner = await one(`select user_id from public.automation_workers where worker_id = 'fx-203-A'`);
  ok('הבעלות על הזהות לא נדרסה', owner.user_id === USER);

  // ── 4 · נפל לפני נגיעה ברשות ⇒ לא נתפס אוטומטית, «אפשר להריץ שוב» ──────
  console.log('4 · נפל לפני נגיעה');
  await addJob('fx-203-m1', 'shaam.create_representation');
  r = await claim('fx-203-A', 'a2', ['shaam.create_representation']);
  ok('A תפס פעולה משנה', r?.id === 'fx-203-m1');
  await writeStaging(`update public.automation_jobs set lease_until = now() - interval '1 minute' where id = 'fx-203-m1'`);
  r = await claim('fx-203-B', 'b1', ['shaam.create_representation']);
  let m = await job('fx-203-m1');
  ok('B לא תפס', r === null || r?.id !== 'fx-203-m1');
  ok('needs_human · worker_stopped_before_external', m.status === 'needs_human' && m.error_code === 'worker_stopped_before_external', JSON.stringify(m));

  // ── 5 · נפל אחרי externalAttempt ⇒ לעולם לא ניסיון שני אוטומטי ─────────
  console.log('5 · נפל אחרי נגיעה');
  await addJob('fx-203-m2', 'btl.create_representation');
  r = await claim('fx-203-B', 'b1', ['btl.create_representation']);
  ok('B תפס הזנה בב״ל', r?.id === 'fx-203-m2');
  await writeStaging(`update public.automation_jobs set progress = '{"externalAttempt":{"stage":"btl_add_poa"},"submitted":true}'::jsonb, lease_until = now() - interval '1 minute' where id = 'fx-203-m2'`);
  r = await claim('fx-203-A', 'a2', ['btl.create_representation']);
  m = await job('fx-203-m2');
  ok('A לא תפס', r === null || r?.id !== 'fx-203-m2');
  ok('needs_human · external_outcome_unknown', m.status === 'needs_human' && m.error_code === 'external_outcome_unknown', JSON.stringify(m));
  // אפילו אם מישהו מחזיר אותה ל-queued ביד — לא נתפסת.
  await writeStaging(`update public.automation_jobs set status = 'queued', attempts = 0 where id = 'fx-203-m2'`);
  r = await claim('fx-203-A', 'a2', ['btl.create_representation']);
  ok('גם אחרי החזרה ידנית ל-queued — לא נתפסת', r === null || r?.id !== 'fx-203-m2');
  await writeStaging(`update public.automation_jobs set status = 'needs_human', error_code = 'awaiting_btl_auth' where id = 'fx-203-m2'`);
  const st = await status('fx-203-B', 'b1', { btl: { connected: true }, shaam: { connected: true }, ...hostOf(20) });
  ok('חיבור שחזר לא מחדש משימה שכבר נגעה ברשות', !(st?.r?.resumed ?? []).includes('fx-203-m2'), JSON.stringify(st?.r));
  const res = await one(`select public.resolve_needs_human_job('fx-203-B', 'fx-203-m2', 60) as r`);
  ok('resolve_needs_human מסרב', res?.r?.error === 'external_attempt_requires_human');

  // ── 10 · ב״ל תחת אותם כללים ──────────────────────────────────────────────
  console.log('10 · ב״ל');
  ok('btl.create_representation היא פעולה משנה', (await one(`select public.is_external_mutation_action('btl.create_representation') as r`)).r === true);
  ok('btl.check_representation קוראת בלבד', (await one(`select public.is_external_mutation_action('btl.check_representation') as r`)).r === false);

  // ── 14 · יישוב קורא בלבד כשהמשנה תקועה ──────────────────────────────────
  console.log('14 · יישוב קורא-בלבד');
  await addJob('fx-203-c1', 'btl.check_representation');
  r = await claim('fx-203-B', 'b1', ['btl.check_representation', 'btl.create_representation']);
  ok('הבדיקה נתפסת', r?.id === 'fx-203-c1', JSON.stringify(r));
  ok('ההזנה עדיין needs_human', (await job('fx-203-m2')).status === 'needs_human');
  await writeStaging(`update public.automation_jobs set lease_until = now() - interval '1 minute' where id = 'fx-203-c1'`);
  r = await claim('fx-203-A', 'a2', ['btl.check_representation']);
  ok('בדיקה שמחשבה נפל — מחשב אחר ממשיך אותה (קריאה בלבד)', r?.id === 'fx-203-c1', JSON.stringify(r));
  await done('fx-203-A', 'fx-203-c1');

  // ── 9 · יכולת: שע״ם אינה ב״ל ─────────────────────────────────────────────
  console.log('9 · יכולות');
  await writeStaging(`update public.automation_workers set capabilities = array['shaam'] where worker_id = 'fx-203-A';
                      update public.automation_workers set instance_seen_at = now() - interval '5 minutes' where worker_id = 'fx-203-B'`);
  await writeStaging(`update public.automation_workers set last_seen_at = now() - interval '10 minutes' where worker_id = 'fx-203-B'`);
  await addJob('fx-203-b2', 'btl.check_representation');
  r = await claim('fx-203-A', 'a2', ['btl.check_representation']);
  ok('מחשב בלי יכולת ב״ל לא תופס משימת ב״ל', r === null || r?.id !== 'fx-203-b2', JSON.stringify(r));

  // ── 6/7 · מחשב אחד כבוי + אחר חי ⇒ החי תופס ─────────────────────────────
  console.log('6/7 · אחד כבוי, אחד חי');
  await writeStaging(`update public.automation_workers set capabilities = array['shaam','btl'] where worker_id = 'fx-203-A'`);
  r = await claim('fx-203-A', 'a2', ['btl.check_representation']);
  ok('B כבוי (פעימה ישנה) ⇒ A תופס', r?.id === 'fx-203-b2', JSON.stringify(r));
  await done('fx-203-A', 'fx-203-b2');

  // ── בחירה: משימה שצריכה סשן הולכת למחשב שהסשן פתוח בו ────────────────────
  console.log('בחירה · סשן');
  await status('fx-203-B', 'b2', { shaam: { connected: false }, btl: { connected: false }, ...hostOf(5) });
  await status('fx-203-A', 'a2', { shaam: { connected: true }, btl: { connected: true }, ...hostOf(900) });
  // שני המחשבים מתשאלים (אין עבודה בתור) — כך המערכת יודעת מי לוקח מה.
  await claim('fx-203-A', 'a2', T); await claim('fx-203-B', 'b2', T);
  await addJob('fx-203-s1', 'shaam.check_representation');
  r = await claim('fx-203-B', 'b2', ['shaam.check_representation']);
  ok('B בלי סשן שע״ם לא לוקח כש-A מחובר', r === null || r?.id !== 'fx-203-s1', JSON.stringify(r));
  r = await claim('fx-203-A', 'a2', ['shaam.check_representation']);
  ok('A (מחובר) לוקח', r?.id === 'fx-203-s1', JSON.stringify(r));
  await done('fx-203-A', 'fx-203-s1');

  // ── בחירה: התחברות הולכת למחשב שבו עובדים עכשיו ─────────────────────────
  console.log('בחירה · התחברות');
  await claim('fx-203-A', 'a2', T); await claim('fx-203-B', 'b2', T);
  await addJob('fx-203-i1', 'shaam.connect');
  r = await claim('fx-203-A', 'a2', ['shaam.connect']);
  ok('A (לא נגעו בו 15 דק׳) לא לוקח התחברות', r === null || r?.id !== 'fx-203-i1', JSON.stringify(r));
  r = await claim('fx-203-B', 'b2', ['shaam.connect']);
  ok('B (נגעו בו לפני 5 שנ׳) לוקח', r?.id === 'fx-203-i1', JSON.stringify(r));

  // ── העדפה אינה חסימה: מחשב «מחובר» שלא מתשאל את הסוג הזה לא חוסם ─────
  console.log('בחירה · לא נחסמים');
  await claim('fx-203-A', 'a2', ['btl.check_representation']);   // A מחובר, אבל מתשאל רק ב״ל
  await addJob('fx-203-s2', 'shaam.check_representation');
  r = await claim('fx-203-B', 'b2', ['shaam.check_representation']);
  ok('B (בלי סשן) לוקח כש-A המחובר לא מבקש את הסוג הזה', r?.id === 'fx-203-s2', JSON.stringify(r));

  // ── 13 · עובד ישן (בלי מופע, חתימה ישנה) ממשיך לעבוד ────────────────────
  console.log('13 · תאימות');
  await addJob('fx-203-l1', 'dev.test_automation');
  r = await claim('fx-203-legacy', undefined, ['dev.test_automation']);
  ok('תפיסה בחתימה הישנה (4 פרמטרים)', r?.id === 'fx-203-l1', JSON.stringify(r));
  const legacyHb = await one(`select public.heartbeat_automation_job('${USER}'::uuid, 'fx-203-legacy', null, 60, '0.1.0') as r`);
  ok('פעימת לב בחתימה הישנה', legacyHb?.r?.ok === true);

  // ── 15 · רענון/קריאה חוזרת לא משנה בעלות ─────────────────────────────────
  console.log('15 · בעלות יציבה');
  await claim('fx-203-A', 'a2', ['dev.test_automation']);
  ok('תפיסה נוספת לא גונבת משימה רצה', (await job('fx-203-l1')).claimed_by === 'fx-203-legacy');

  // ── רישום + אסימון דרך הפונקציה האמיתית ─────────────────────────────────
  console.log('רישום · אסימון · סוד ישן');
  const code = 'FX203' + Math.random().toString(36).slice(2, 7).toUpperCase();
  await writeStaging(`insert into public.automation_workstation_pairings (code_hash, user_id, label, expires_at)
    values ('${createHash('sha256').update(code).digest('hex')}', '${USER}', 'fx-203', now() + interval '5 minutes')`);
  const call = (headers, body) => fetch(FN_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    .then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));
  const reg = await call({}, { op: 'register', code, label: 'fx-203' });
  ok('קוד צימוד ⇒ זהות + אסימון', reg.body?.ok && /^ws-/.test(reg.body.workerId) && reg.body.token?.length > 30, JSON.stringify(reg.body));
  const again = await call({}, { op: 'register', code, label: 'fx-203' });
  ok('אותו קוד פעם שנייה ⇒ נדחה', again.body?.ok === false && again.body?.error === 'invalid_or_expired_code');
  const stored = await one(`select token_hash, user_id from public.automation_workers where worker_id = ${lit(reg.body?.workerId)}`);
  ok('במסד נשמר רק hash של האסימון', stored?.token_hash === createHash('sha256').update(reg.body?.token ?? '').digest('hex') && stored?.token_hash !== reg.body?.token);
  const tokenHeaders = { 'x-worker-id': reg.body?.workerId, 'x-worker-token': reg.body?.token, 'x-worker-instance': 'tok-1' };
  const hbTok = await call(tokenHeaders, { op: 'heartbeat', userId: OTHER_USER, workerId: 'fx-203-A' });
  ok('אסימון ⇒ פעימת לב נרשמת לזהות של האסימון (מה שהגוף אומר לא משנה)', hbTok.body?.ok === true, JSON.stringify(hbTok.body));
  const seen = await one(`select user_id, instance_id from public.automation_workers where worker_id = ${lit(reg.body?.workerId)}`);
  ok('החשבון נגזר מהאסימון, לא מהגוף', seen?.user_id === USER && seen?.instance_id === 'tok-1');
  const bad = await call({ ...tokenHeaders, 'x-worker-token': 'wrong' }, { op: 'heartbeat' });
  ok('אסימון שגוי ⇒ 401', bad.status === 401);
  const legacy = await call({ 'x-worker-secret': 'not-the-secret' }, { op: 'heartbeat', userId: USER, workerId: reg.body?.workerId });
  ok('סוד שגוי ⇒ 401', legacy.status === 401);
  ok('זהות רשומה דורשת אסימון (הסוד המשותף לא מספיק לה)',
    (await one(`select public.workstation_requires_token(${lit(reg.body?.workerId)}) as r`)).r === true);
  await writeStaging(`update public.automation_workers set revoked_at = now() where worker_id = ${lit(reg.body?.workerId)}`);
  const revoked = await call(tokenHeaders, { op: 'heartbeat' });
  ok('מחשב שבוטל ⇒ 401', revoked.status === 401);
} finally {
  await clean();
  const left = await one(`select count(*)::int as n from public.automation_jobs where id like 'fx-203-%'`);
  ok('ניקוי', left.n === 0);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
