#!/usr/bin/env node
/**
 * staging-test-ni-cancel-concurrency.mjs — ביטול בקשת ב"ל מול פעולות שקורות
 * **באותו רגע** (212): אישור ידני, דיווח של עובד, תביעת משימה, וביטול כפול.
 *
 * ‼ למה לא בטרנזקציה שמתגלגלת אחורה כמו staging-test-ni-cancel: מקביליות
 * צריכה שני חיבורים אמיתיים, וחיבור שני אינו רואה פונקציות שלא הוחלו. לכן:
 *   1. צילום ההגדרות הנוכחיות של חמש הפונקציות ש-212 משנה (נשמר לקובץ).
 *   2. החלת 212 על staging.
 *   3. לקוח-בדיקה חדש (עותק, מזהה qa212-…) — לא נוגעים בלקוח קיים.
 *   4. מרוצים: שתי בקשות HTTP במקביל, הראשונה מחזיקה נעילות (pg_sleep).
 *   5. ניקוי: מחיקת כל נתוני הבדיקה, והחזרת staging בדיוק למה שהיה לפני
 *      (מחיקת מה ש-212 הוסיף + שחזור חמש הפונקציות + אימות תו-בתו).
 * הניקוי רץ ב-finally — גם כשבדיקה נכשלה.
 *
 * ‼ staging בלבד (STAGING_REF קבוע). שום מייל/רשות: אין שינוי סטטוס שמייצר
 * התראה, ואין משימה שמגיעה לעובד (staging אין לו עובד חי, והמשימות נמחקות).
 *
 * הרצה:  node scripts/staging-test-ni-cancel-concurrency.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const MIGRATION = readFileSync(resolve(ROOT, 'supabase/212-cancel-ni-representation-subject.sql'), 'utf8');
const TS = Date.now().toString(36);
const CID = `qa212c-${TS}`;
const RID = `qa212r-${TS}`;
const FNS = ['advance_onboarding_step', 'request_authority_representation', 'claim_representation_reminder',
  'drop_authority_representation', 'get_onboarding'];

async function q(query) {
  const t0 = Date.now();
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  const ms = Date.now() - t0;
  if (!r.ok) { let m = text; try { m = JSON.parse(text).message ?? text; } catch { /* */ } return { ok: false, error: m, ms }; }
  return { ok: true, rows: text ? JSON.parse(text) : [], ms };
}
async function must(query) { const r = await q(query); if (!r.ok) throw new Error(r.error); return r.rows; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lit = s => `'${String(s).replace(/'/g, "''")}'`;
const AS_USER = `select set_config('request.jwt.claims', json_build_object('sub', '${USER_ID}', 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', '${USER_ID}', true);`;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); }
};
const state = async () => (await must(`
  select c.authority_representations->'nationalInsurance' as ni,
         r.execution->'nationalInsurance' as t_client, r.execution->'nationalInsuranceSpouse' as t_spouse
    from public.clients c join public.representation_requests r on r.id = c.representation_request_id
   where c.id = ${lit(CID)}`))[0];
const inTargets = (ni, role) => Array.isArray(ni?.targets) && ni.targets.includes(role);

/** שתי בקשות במקביל: הראשונה מחזיקה נעילות `holdMs`, השנייה יוצאת `delayMs` אחריה. */
async function race(first, second, { delayMs = 1500 } = {}) {
  const p1 = q(first);
  await sleep(delayMs);
  const p2 = q(second);
  return Promise.all([p1, p2]);
}

// ── 0 · אסור לדרוס 212 שמישהו אחר כבר החיל ─────────────────────────────────
const pre = await must(`select count(*)::int n from pg_proc where proname = 'cancel_authority_representation'`);
if (pre[0].n > 0) { console.error('✋ 212 כבר קיימת ב-staging — לא מריצים (השחזור היה מוחק אותה).'); process.exit(1); }

const snapshot = {};
for (const fn of FNS) {
  const r = await must(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${lit(fn)}`);
  if (r.length !== 1) throw new Error(`expected one ${fn}, got ${r.length}`);
  snapshot[fn] = r[0].d;
}
const backupFile = resolve(ROOT, `scripts/.staging-212-backup-${TS}.json`);
writeFileSync(backupFile, JSON.stringify(snapshot, null, 2));
console.log(`גיבוי ההגדרות: ${backupFile}\n`);

try {
  // ── 1 · החלה ─────────────────────────────────────────────────────────────
  await must(MIGRATION);
  ok('212 הוחלה על staging', (await must(`select count(*)::int n from pg_proc where proname = 'cancel_authority_representation'`))[0].n === 1);

  // ── 2 · לקוח-בדיקה (עותק) ──────────────────────────────────────────────
  const src = (await must(`select c.id from public.clients c join public.representation_requests r on r.id = c.representation_request_id
                            where c.user_id = '${USER_ID}' order by c.created_at limit 1`))[0];
  if (!src) throw new Error('no source client on staging');
  await must(`
    insert into public.clients
    select (jsonb_populate_record(null::public.clients, to_jsonb(c) || jsonb_build_object(
      'id', ${lit(CID)}, 'portal_token', null, 'intake_token', null, 'representation_request_id', null,
      'merged_from_lead_id', null, 'spouse_client_id', null, 'first_name', 'בדיקה', 'last_name', 'מקביליות',
      'email', 'delivered@resend.dev', 'spouse_email', 'delivered@resend.dev',
      'family_status', 'married', 'spouse_first_name', 'בת', 'spouse_last_name', 'זוג',
      'spouse_represented_elsewhere', false,
      'authority_representations', '{"nationalInsurance":{"status":"in_process","targets":["client","spouse"]}}'::jsonb,
      'tax_files', '[]'::jsonb))).*
      from public.clients c where c.id = ${lit(src.id)};
    insert into public.representation_requests
    select (jsonb_populate_record(null::public.representation_requests, to_jsonb(r) || jsonb_build_object(
      'id', ${lit(RID)}, 'linked_client_id', ${lit(CID)}, 'onboarding_token', md5(random()::text),
      'spouse_onboarding_token', null, 'execution', '{}'::jsonb, 'client_email', 'delivered@resend.dev'))).*
      from public.representation_requests r join public.clients c on c.representation_request_id = r.id
     where c.id = ${lit(src.id)};
    update public.clients set representation_request_id = ${lit(RID)} where id = ${lit(CID)};`);
  for (const role of ['client', 'spouse']) {
    const r = await must(`${AS_USER} select public.request_authority_representation(${lit(CID)}, 'national_insurance', '${role}', 'qa212') as r;`);
    ok(`נפתחה בקשת ב"ל ל-${role}`, r.at(-1).r.ok === true, JSON.stringify(r.at(-1).r));
  }
  await must(`update public.representation_requests set execution = execution
      || jsonb_build_object('nationalInsurance', jsonb_build_object('referenceNumber', '7500001', 'deadline', '2026-12-01', 'instructionsSentAt', '2026-09-30T08:00:00.000Z'))
      || jsonb_build_object('nationalInsuranceSpouse', jsonb_build_object('referenceNumber', '7500002', 'deadline', '2026-12-01', 'instructionsSentAt', '2026-09-30T08:00:00.000Z'))
     where id = ${lit(RID)}`);

  // ── A · ביטול מחזיק את הנעילה, «אושר» ידני נכנס באמצע ⇒ האישור נדחה ──────
  console.log('\nA · ביטול קודם, אישור ממתין לו');
  {
    const [c, a] = await race(
      `${AS_USER} select x.r, pg_sleep(4) from (select public.cancel_authority_representation(${lit(CID)}, 'national_insurance', 'client', true) as r) x;`,
      `update public.representation_requests set execution = jsonb_set(execution, '{nationalInsurance,confirmedAt}', '"2026-10-01T12:00:00.000Z"') where id = ${lit(RID)};`);
    ok('הביטול הצליח', c.ok && c.rows.at(-1)?.r?.ok === true, JSON.stringify(c));
    ok('האישור המתין לביטול (נעילה אמיתית)', a.ms > 2000, `${a.ms}ms`);
    ok('‼ האישור נדחה בגלוי — ni_subject_cancelled', !a.ok && /ni_subject_cancelled/.test(a.error), a.error ?? 'succeeded');
    const s = await state();
    ok('אין confirmedAt ללקוח', !s.t_client?.confirmedAt, JSON.stringify(s.t_client));
    ok('הלקוח מחוץ לרשימה, בת הזוג נשארה', !inTargets(s.ni, 'client') && inTargets(s.ni, 'spouse'), JSON.stringify(s.ni));
  }

  // ── B · אישור מחזיק את הנעילה, ביטול נכנס באמצע ⇒ הביטול נדחה ─────────────
  console.log('\nB · אישור קודם, ביטול ממתין לו');
  {
    const [a, c] = await race(
      `update public.representation_requests set execution = jsonb_set(execution, '{nationalInsuranceSpouse,confirmedAt}', '"2026-10-01T12:00:00.000Z"') where id = ${lit(RID)}; select pg_sleep(4);`,
      `${AS_USER} select public.cancel_authority_representation(${lit(CID)}, 'national_insurance', 'spouse', true) as r;`);
    ok('האישור נשמר', a.ok, a.error);
    ok('הביטול המתין לאישור', c.ms > 2000, `${c.ms}ms`);
    const res = c.ok ? c.rows.at(-1)?.r : null;
    ok('‼ הביטול נדחה — already_active (לא «הצלחה»)', res?.ok === false && res?.reason === 'already_active', JSON.stringify(c));
    const s = await state();
    ok('בת הזוג נשארה ברשימה ומאושרת', inTargets(s.ni, 'spouse') && !!s.t_spouse?.confirmedAt, JSON.stringify(s));
  }

  // ── C · משימת בדיקה בתור: ביטול ותביעת עובד באותו רגע ⇒ המשימה לא רצה ──────
  console.log('\nC · ביטול מול תביעת משימה בתור');
  {
    const rr = await must(`${AS_USER} select public.request_authority_representation(${lit(CID)}, 'national_insurance', 'client', 'qa212') as r;`);
    ok('בקשה חוזרת ללקוח (מפורשת)', rr.at(-1).r.ok === true, JSON.stringify(rr.at(-1).r));
    const job = (await must(`insert into public.automation_jobs (user_id, client_id, action_type, input, status)
      values ('${USER_ID}', ${lit(CID)}, 'btl.check_representation', '{"role":"client","referenceNumber":"7500001"}'::jsonb, 'queued') returning id`))[0].id;
    const [c, w] = await race(
      `${AS_USER} select x.r, pg_sleep(4) from (select public.cancel_authority_representation(${lit(CID)}, 'national_insurance', 'client', true) as r) x;`,
      `update public.automation_jobs set status = 'running', lease_until = now() + interval '2 minutes' where id = ${lit(job)} and status = 'queued' returning id;`);
    ok('הביטול הצליח וביטל משימה אחת', c.ok && c.rows.at(-1)?.r?.ok === true && c.rows.at(-1)?.r?.cancelledJobs === 1, JSON.stringify(c));
    ok('‼ העובד לא תבע את המשימה', w.ok && w.rows.length === 0, JSON.stringify(w));
    const j = (await must(`select status, error_code from public.automation_jobs where id = ${lit(job)}`))[0];
    ok('המשימה cancelled / subject_cancelled', j.status === 'cancelled' && j.error_code === 'subject_cancelled', JSON.stringify(j));
  }

  // ── D · עובד מדווח «אושר» בזמן שמבטלים ⇒ הביטול מחכה ונדחה, הראיה נשמרת ──
  console.log('\nD · דיווח עובד (אושר) מול ביטול');
  {
    await must(`${AS_USER} select public.request_authority_representation(${lit(CID)}, 'national_insurance', 'client', 'qa212');`);
    const job = (await must(`insert into public.automation_jobs (user_id, client_id, action_type, input, status, lease_until)
      values ('${USER_ID}', ${lit(CID)}, 'btl.check_representation', '{"role":"client","referenceNumber":"7500001"}'::jsonb, 'running', now() + interval '2 minutes') returning id`))[0].id;
    const [w, c] = await race(
      `update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = '{"role":"client","found":true,"status":"approved","referenceNumber":"7500001","deadline":"2026-12-01"}'::jsonb
       where id = ${lit(job)}; select pg_sleep(4);`,
      `${AS_USER} select public.cancel_authority_representation(${lit(CID)}, 'national_insurance', 'client', true) as r;`);
    ok('דיווח העובד נשמר (לא נחסם בגלל הביטול)', w.ok, w.error);
    ok('הביטול המתין לדיווח', c.ms > 2000, `${c.ms}ms`);
    const res = c.ok ? c.rows.at(-1)?.r : null;
    ok('‼ הביטול נדחה — already_active', res?.ok === false && res?.reason === 'already_active', JSON.stringify(c));
    const s = await state();
    ok('confirmedAt מהרשות נשמר, הלקוח ברשימה', !!s.t_client?.confirmedAt && inTargets(s.ni, 'client'), JSON.stringify(s));
  }

  // ── E · ביטול כפול באותו רגע (שתי לשוניות) ⇒ אחד מצליח, השני «כבר לא פעילה» ─
  console.log('\nE · שני ביטולים במקביל');
  {
    // בת הזוג מאושרת (B) ⇒ פותחים בקשה חדשה? לא — מאושרת. מבטלים את בקשת
    // הלקוח החדשה: מחזירים אותו לבקשה פתוחה בלי אישור.
    await must(`update public.representation_requests set execution = execution #- '{nationalInsurance,confirmedAt}' where id = ${lit(RID)}`);
    const countEv = async () => (await must(`select count(*)::int n from public.onboarding_events e join public.onboarding_steps s on s.id = e.step_id
      where s.client_id = ${lit(CID)} and e.meta->>'reason' = 'cancelled_after_sent'`))[0].n;
    const evBefore = await countEv();
    const [x, y] = await race(
      `${AS_USER} select x.r, pg_sleep(3) from (select public.cancel_authority_representation(${lit(CID)}, 'national_insurance', 'client', true) as r) x;`,
      `${AS_USER} select public.cancel_authority_representation(${lit(CID)}, 'national_insurance', 'client', true) as r;`, { delayMs: 1000 });
    const rx = x.ok ? x.rows.at(-1)?.r : null;
    const ry = y.ok ? y.rows.at(-1)?.r : null;
    ok('הראשון הצליח', rx?.ok === true, JSON.stringify(x));
    ok('‼ השני המתין ואז not_requested (לא הצלחה כפולה)', y.ms > 1500 && ry?.ok === false && ry?.reason === 'not_requested', JSON.stringify(y));
    const evAfter = await countEv();
    ok('הביטול הכפול לא רשם שני אירועים', evAfter - evBefore <= 1, `before=${evBefore} after=${evAfter}`);
    const s = await state();
    ok('הלקוח מחוץ לרשימה, בת הזוג המאושרת לא זזה', !inTargets(s.ni, 'client') && inTargets(s.ni, 'spouse') && !!s.t_spouse?.confirmedAt, JSON.stringify(s));
  }
} finally {
  // ── ניקוי — תמיד ────────────────────────────────────────────────────────
  console.log('\nניקוי ושחזור staging');
  const steps = `select id from public.onboarding_steps where client_id = ${lit(CID)}`;
  const del = await q(`
    delete from public.automation_jobs where client_id = ${lit(CID)};
    delete from public.request_participant_links where client_id = ${lit(CID)};
    delete from public.onboarding_events where step_id in (${steps});
    delete from public.onboarding_steps where client_id = ${lit(CID)};
    delete from public.accountant_notifications where client_id = ${lit(CID)};
    update public.clients set representation_request_id = null where id = ${lit(CID)};
    delete from public.representation_requests where id = ${lit(RID)};
    delete from public.clients where id = ${lit(CID)};`);
  ok('נתוני הבדיקה נמחקו', del.ok, del.error);
  const restore = await q(`
    drop trigger if exists clients_guard_ni_cancelled on public.clients;
    drop trigger if exists rep_requests_guard_ni_cancelled on public.representation_requests;
    drop trigger if exists automation_jobs_guard_ni_cancelled on public.automation_jobs;
    drop function if exists public.guard_ni_cancelled_subjects();
    drop function if exists public.guard_ni_confirm_after_cancel();
    drop function if exists public.guard_btl_job_for_cancelled_subject();
    drop function if exists public.cancel_authority_representation(text, text, text, boolean);
    drop function if exists public.ni_subject_stage(jsonb, jsonb);
    ${FNS.map(fn => snapshot[fn] + ';').join('\n')}
    drop function if exists public.ni_targets_of(jsonb);
    revoke all on function public.claim_representation_reminder(text, text, int) from public, anon, authenticated;
    grant execute on function public.claim_representation_reminder(text, text, int) to service_role;`);
  ok('ההגדרות הקודמות שוחזרו', restore.ok, restore.error);
  let same = true;
  for (const fn of FNS) {
    const r = await must(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${lit(fn)}`);
    if (r.length !== 1 || r[0].d !== snapshot[fn]) { same = false; console.log(`    ✗ ${fn} שונה מהגיבוי`); }
  }
  ok('אימות: חמש הפונקציות זהות תו-בתו לגיבוי', same);
  const left = await must(`select (select count(*) from pg_proc where proname in ('cancel_authority_representation','ni_targets_of','ni_subject_stage','guard_ni_cancelled_subjects','guard_ni_confirm_after_cancel','guard_btl_job_for_cancelled_subject'))::int fns,
    (select count(*) from pg_trigger where tgname like '%ni_cancelled%')::int trg,
    (select count(*) from public.clients where id like 'qa212c-%')::int clients`);
  ok('אימות: לא נשאר דבר מ-212 ומהלקוח', left[0].fns === 0 && left[0].trg === 0 && left[0].clients === 0, JSON.stringify(left[0]));
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
