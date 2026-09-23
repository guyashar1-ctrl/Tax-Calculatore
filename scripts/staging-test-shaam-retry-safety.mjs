#!/usr/bin/env node
/**
 * staging-test-shaam-retry-safety.mjs — ההוכחה שפנייה חיצונית לשע״ם נעשית
 * פעם אחת, ושאין שום מסלול אוטומטי שמייצר פנייה שנייה (מיגרציה 196).
 *
 * ‼ למה מול המסד האמיתי ולא בבדיקת יחידה: שלושת מסלולי הניסיון-החוזר אינם
 * בקוד ה-handler אלא **בתשתית** — תפיסה מחדש אחרי פקיעת חכירה, מונה
 * max_attempts, וחידוש needs_human אחרי דיווח חיבור. אפשר לבדוק אותם רק
 * מול הפונקציות עצמן.
 *
 * ‼ רץ על שורות automation_jobs סינתטיות בלבד (claimed_by = 'rt-…'),
 * ומנקה אחריו. אינו נוגע בבקשות, בלקוחות או בנתוני עבודה.
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, writeStaging, STAGING_REF } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr || !s?.session) { console.error('✗ התחברות ל-staging נכשלה:', authErr?.message); process.exit(1); }
const USER = s.session.user.id;
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
});

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

const TAG = 'rt-' + Date.now().toString(36);
// ‼ מנקה גם שאריות מריצות ידניות קודמות: האינדקס הייחודי על משימת מערכת
// פתוחה (user_id, action_type) חוסם יצירה חדשה כל עוד שורה ישנה פתוחה.
const cleanup = () => writeStaging(`delete from public.automation_jobs
  where claimed_by like 'rt-%' or claimed_by like 'w-safety%';`);
await cleanup();

/** שורת job סינתטית — במצב שבו עובד מת באמצע. */
async function deadJob(actionType, { touched, attempts = 1, max = 1, status = 'running' } = {}) {
  const progress = touched ? `'{"externalAttempt":{"at":"2026-01-01T00:00:00Z","stage":"x"}}'` : `'{}'`;
  const r = await one(`
    insert into public.automation_jobs
      (user_id, client_id, action_type, input, status, claimed_by, lease_until,
       attempts, max_attempts, progress)
    values (${q(USER)}, null, ${q(actionType)}, '{}'::jsonb, ${q(status)}, ${q(TAG)},
            now() - interval '5 minutes', ${attempts}, ${max}, ${progress}::jsonb)
    returning id;`);
  return r.id;
}
const readJob = (id) => one(`select status, error_code, attempts, needs_human
  from public.automation_jobs where id = ${q(id)};`);
const claim = () => one(`select public.claim_next_automation_job(${q(USER)}, ${q(TAG + '-w2')},
  array['shaam.create_representation','shaam.submit_poa','shaam.check_representation'], 60) as j;`);

console.log(`\n── בטיחות ניסיון חוזר · שע״ם · ${STAGING_REF}\n`);

// ── 1+5. כשל אימות אינו מנוסה אוטומטית; התשתית אינה חוזרת על מוטציה ────────
{
  const id = await deadJob('shaam.submit_poa', { touched: true });
  const c = await claim();
  const j = await readJob(id);
  ok('5 · שידור שנגע בשע״ם אינו נתפס מחדש אחרי פקיעת חכירה',
    (c.j?.action_type ?? null) !== 'shaam.submit_poa' && j.attempts === 1, JSON.stringify(j));
  ok('6/7 · תוצאה לא ידועה מסומנת במפורש ולא מנוסה שוב',
    j.status === 'needs_human' && j.error_code === 'external_outcome_unknown', j.error_code);
  ok('6/7 · ההודעה מפנה לבדיקה, לא לשידור נוסף',
    /בדוק קבלת הייצוג/.test(j.needs_human ?? ''), j.needs_human);
  await cleanup();
}

// ── כשל מקומי לפני נגיעה בשע״ם — מצב נפרד, ועדיין בלי ניסיון אוטומטי ───────
{
  const id = await deadJob('shaam.create_representation', { touched: false });
  const c = await claim();
  const j = await readJob(id);
  ok('כשל מקומי לפני פנייה מסומן בנפרד',
    j.status === 'needs_human' && j.error_code === 'worker_stopped_before_external', j.error_code);
  ok('גם כשל מקומי אינו נתפס מחדש לבדו',
    (c.j?.action_type ?? null) !== 'shaam.create_representation' && j.attempts === 1);
  ok('ההודעה אומרת שלא בוצעה פנייה לרשות',
    /לא בוצעה שום פנייה/.test(j.needs_human ?? ''), j.needs_human);
  await cleanup();
}

// ── פעולה קוראת-בלבד כן ניתנת לתפיסה מחדש ─────────────────────────────────
{
  const id = await deadJob('shaam.check_representation', { touched: false, max: 3 });
  const c = await claim();
  const j = await readJob(id);
  ok('11 · בדיקת מצב (קריאה בלבד) כן נתפסת מחדש — היא הדרך הבטוחה ליישב חוסר ודאות',
    c.j?.action_type === 'shaam.check_representation' && j.status === 'running', JSON.stringify(j));
  await cleanup();
}

// ── 1+2. חידוש אוטומטי אחרי דיווח חיבור — לא לפעולות הייצוג ────────────────
{
  const ids = {
    create: await deadJob('shaam.create_representation', { touched: false, status: 'needs_human' }),
    submit: await deadJob('shaam.submit_poa', { touched: true, status: 'needs_human' }),
    check: await deadJob('shaam.check_representation', { touched: false, status: 'needs_human', max: 3 }),
  };
  await writeStaging(`update public.automation_jobs
    set error_code='awaiting_shaam_auth', needs_human='אין חיבור'
    where claimed_by = ${q(TAG)};`);
  await one(`select public.report_worker_status(${q(USER)}, ${q(TAG)},
    '{"shaam":{"connected":true,"bootstrapped":true}}'::jsonb) as r;`);
  for (const [name, id] of Object.entries(ids)) {
    const j = await readJob(id);
    ok(`1/2 · כשל אימות ב-${name} אינו מתחדש מעצמו כשהחיבור חוזר`,
      j.status === 'needs_human', j.status);
  }
  await cleanup();
}

// ── 10. ניסיון נוסף דורש פעולה אנושית מפורשת ──────────────────────────────
{
  const touched = await deadJob('shaam.submit_poa', { touched: true, status: 'needs_human' });
  const clean = await deadJob('shaam.create_representation', { touched: false, status: 'needs_human' });

  const r1 = await user.rpc('cancel_automation_job', { p_job_id: touched });
  ok('10 · ביטול שקט של פעולה שנגעה בשע״ם נדחה',
    r1.data?.ok === false && r1.data?.error === 'external_attempt_requires_acknowledgement',
    JSON.stringify(r1.data ?? r1.error));

  const r2 = await user.rpc('cancel_automation_job', { p_job_id: clean });
  ok('10 · פעולה שלא נגעה בשע״ם מתבטלת כרגיל', r2.data?.ok === true,
    JSON.stringify(r2.data ?? r2.error));

  const r3 = await user.rpc('cancel_automation_job',
    { p_job_id: touched, p_acknowledge_external: true });
  ok('10 · עם אישור מפורש — הביטול עובר', r3.data?.ok === true,
    JSON.stringify(r3.data ?? r3.error));
  await cleanup();
}

// ── חידוש יזום של העובד חסום אף הוא ───────────────────────────────────────
{
  const id = await deadJob('shaam.submit_poa', { touched: true, status: 'needs_human' });
  const r = await one(`select public.resolve_needs_human_job(${q(TAG)}, ${q(id)}, 60) as r;`);
  ok('5 · גם חידוש יזום של העובד אינו יכול לחזור על מוטציה',
    r.r?.ok === false && r.r?.error === 'external_attempt_requires_human', JSON.stringify(r.r));
  await cleanup();
}

// ── ניסיון אחד ביצירה ─────────────────────────────────────────────────────
{
  const r = await user.rpc('create_automation_job', {
    p_client_id: null, p_action_type: 'shaam.create_representation', p_input: {},
  });
  const created = r.data?.job;
  ok('4 · פעולה משנה נולדת עם ניסיון אחד בלבד', created?.max_attempts === 1,
    `max_attempts=${created?.max_attempts}`);
  if (created?.id) {
    await writeStaging(`delete from public.automation_jobs where id = ${q(created.id)};`);
  }
}

await cleanup();
console.log(`\n${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
