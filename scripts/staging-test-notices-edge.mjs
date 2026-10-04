#!/usr/bin/env node
/**
 * staging-test-notices-edge.mjs — 214 מקצה לקצה דרך פונקציית השליחה (send-process-open-email).
 *
 * דורש: 214–216 מוחלות על staging, והפונקציות send-process-open-email ו-notify-accountant
 * פרוסות שם. ‼ שום מייל לא יוצא לאדם:
 *   · «הצלחה» נבדקת במסלול הבדיקה — כותרת x-pivo-test-transport: log, שהפונקציה מכבדת רק
 *     כשמוגדר EMAIL_TRANSPORT=log ורק מחוץ לייצור (_shared/resendResult.ts). הדפדפן לא שולח אותה.
 *   · «כשל ודאי» — הספק ב-staging מדומה (fake-email-provider, scripts/staging-fake-email.mjs)
 *     ודוחה כתובת עם fail-always. שליחה בלי כותרת הבדיקה נקלטת אצלו ולא יוצאת לאדם.
 *   · כל הנמענים delivered@resend.dev.
 * הנתונים מסומנים QAEDGE ונמחקים לפני ואחרי.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging as raw, assertTriggersEnabled } from './staging-lib.mjs';

async function sqlq(query) {
  for (let a = 0; ; a++) {
    try { return await raw(query); } catch (e) {
      if (e.http !== 429 || a >= 10) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * 2 ** a)));
    }
  }
}
await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN = (n) => `${env.VITE_SUPABASE_URL}/functions/v1/${n}`;
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const login = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const { data: s, error } = await login.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (error) { console.error('✋ כניסה למשתמש הבדיקות נכשלה — עוצרים (לא מנסים שוב):', error.message); process.exit(1); }
const JWT = s.session.access_token;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await sqlq(q))[0];
const call = async (body, { test = true, headers = {} } = {}) => {
  const r = await fetch(FN('send-process-open-email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${JWT}`,
               ...(test ? { 'x-pivo-test-transport': 'log' } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, json, text };
};

const LAST = 'QAEDGE';
async function cleanup() {
  await sqlq(`
    delete from public.email_messages where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.client_notices where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${LAST}'));
    delete from public.onboarding_events where engagement_id in (select id from public.engagements where client_id in (select id from public.clients where last_name = '${LAST}'));
    delete from public.clients where last_name = '${LAST}';`);
}
console.log(`סביבה: ${STAGING_REF}\n`);
await cleanup();
try {
  const cid = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
    values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'קצה', '${LAST}', 'delivered@resend.dev', 'onboarding') returning id`)).id;
  await sqlq(`insert into public.engagements (user_id, client_id, status, process_published_at) values ('${USER_ID}', '${cid}', 'onboarding', now());
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${USER_ID}', '${cid}', 'custom_request', 'custom', 'person', 'pending', 'client',
            '{"title":"אישור א","clientTitle":"אישור א","clientSub":"צילום אחד","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}', now()),
           ('${USER_ID}', '${cid}', 'custom_request', 'custom', 'person', 'pending', 'client',
            '{"title":"אישור ב","clientTitle":"אישור ב","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now());`);

  // תצוגה מקדימה — לא כותבת
  const pv = await call({ clientId: cid, kind: 'new', preview: true });
  ok('1 תצוגה מקדימה: שתי בקשות חדשות + טביעה', pv.status === 200 && pv.json?.items?.length === 2 && !!pv.json?.fingerprint, pv.text.slice(0, 200));
  ok('1b תצוגה מקדימה לא יצרה הודעה', (await one(`select count(*)::int n from public.client_notices where client_id = '${cid}'`)).n === 0);
  ok('1c הנוסח: «מה חדש עבורכם» ובשמות של הדף', /מה חדש עבורכם/.test(pv.json?.bodyText ?? '') || /מה חדש/.test(pv.json?.html ?? ''), '');

  // שתי לחיצות במקביל — אותו מפתח
  const key = 'qaedge-' + Date.now();
  const [a, b] = await Promise.all([
    call({ clientId: cid, kind: 'new', idempotencyKey: key, expectedFingerprint: pv.json.fingerprint }),
    call({ clientId: cid, kind: 'new', idempotencyKey: key, expectedFingerprint: pv.json.fingerprint }),
  ]);
  const statuses = [a.status, b.status].sort();
  ok('2 לחיצה כפולה ⇒ מייל אחד', (a.json?.ok || b.json?.ok) && !(a.json?.id && b.json?.id && a.json.id !== b.json.id),
     JSON.stringify([a.json, b.json]).slice(0, 300));
  const sent = await one(`select count(*)::int n from public.email_messages where client_id = '${cid}' and status = 'sent'`);
  ok('2b שורה אחת «נשלח» ביומן', sent.n === 1, `n=${sent.n} statuses=${statuses}`);
  const ann = await one(`select count(*)::int n from public.client_step_notice_state ns join public.onboarding_steps s on s.id = ns.step_id
                          where s.client_id = '${cid}' and ns.announced_version >= 1`);
  ok('2c שתי הבקשות «נמסרו»', ann.n === 2, `n=${ann.n}`);
  const again = await call({ clientId: cid, kind: 'new', idempotencyKey: key });
  ok('3 אותו מפתח אחרי ההצלחה ⇒ alreadySent', again.status === 200 && again.json?.alreadySent === true, again.text.slice(0, 200));
  const nothing = await call({ clientId: cid, kind: 'new', idempotencyKey: key + '-2' });
  ok('4 בלי חדש ⇒ nothing_to_announce', nothing.status === 400 && nothing.json?.error === 'nothing_to_announce', nothing.text.slice(0, 200));

  // תוספת מאוחרת + טביעה ישנה
  await sqlq(`update public.onboarding_steps set payload = jsonb_set(payload, '{requirements}', payload->'requirements'
      || '[{"key":"r2","kind":"file","label":"עוד קובץ","done":false,"required":true}]'::jsonb)
     where client_id = '${cid}' and payload->>'title' = 'אישור א'`);
  const stale = await call({ clientId: cid, kind: 'new', idempotencyKey: key + '-3', expectedFingerprint: pv.json.fingerprint });
  ok('5 התווסף משהו מאז התצוגה ⇒ items_changed', stale.status === 409 && stale.json?.error === 'items_changed', stale.text.slice(0, 200));
  const late = await call({ clientId: cid, kind: 'new', idempotencyKey: key + '-4' });
  ok('6 תוספת מאוחרת נשלחת לבדה', late.status === 200 && late.json?.ok, late.text.slice(0, 200));
  const lateMeta = await one(`select meta from public.email_messages where client_id = '${cid}' and status = 'sent' order by sent_at desc limit 1`);
  ok('6b המייל המאוחר כולל רק את הבקשה שהשתנתה', (lateMeta.meta?.items ?? []).length === 1, JSON.stringify(lateMeta.meta));

  // תזכורת
  const rem = await call({ clientId: cid, kind: 'reminder', idempotencyKey: key + '-r' });
  ok('7 תזכורת יוצאת', rem.status === 200 && rem.json?.ok, rem.text.slice(0, 200));
  const remRow = await one(`select kind from public.email_messages where client_id = '${cid}' and status = 'sent' order by sent_at desc limit 1`);
  ok('7b נרשמה כתזכורת ולא כ«חדש»', remRow.kind === 'portal_reminder', remRow.kind);
  const remState = await one(`select max(ns.reminder_count)::int c from public.client_step_notice_state ns join public.onboarding_steps s on s.id = ns.step_id where s.client_id = '${cid}'`);
  ok('7c ספירת התזכורות עלתה', remState.c === 1, `c=${remState.c}`);

  // הקישור לדף כשאין חדש
  const upd = await call({ clientId: cid, kind: 'update', idempotencyKey: key + '-u' });
  ok('8 «שליחת הקישור לדף» כשאין חדש', upd.status === 200 && upd.json?.ok, upd.text.slice(0, 200));

  // כשל ודאי מהספק: ב-staging הספק מדומה (fake-email-provider) ודוחה כתובת עם fail-always.
  await sqlq(`update public.clients set email = 'fail-always@example.test' where id = '${cid}'`);
  await sqlq(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${USER_ID}', '${cid}', 'custom_request', 'custom', 'person', 'pending', 'client',
            '{"title":"אישור ג","clientTitle":"אישור ג","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())`);
  const real = await call({ clientId: cid, kind: 'new', idempotencyKey: key + '-real' }, { test: false });
  ok('9 הספק דוחה ⇒ resend_failed', real.status === 502 && real.json?.error === 'resend_failed', real.text.slice(0, 200));
  await sqlq(`update public.clients set email = 'delivered@resend.dev' where id = '${cid}'`);
  const failedRow = await one(`select count(*)::int n from public.email_messages where client_id = '${cid}' and status = 'failed'`);
  ok('9b הכשל גלוי ביומן', failedRow.n === 1, `n=${failedRow.n}`);
  const freed = await one(`select public.client_ready_to_send('${cid}') r`);
  ok('9c הבקשה חוזרת להיות «חדש» במגש', (freed.r?.owner?.items ?? []).length === 1, JSON.stringify(freed.r?.owner).slice(0, 200));

  // המסלול האוטומטי: הודעה בתור ⇒ הפונקציה עם הסוד
  const secret = (await one(`select decrypted_secret s from vault.decrypted_secrets where name = 'client_notice_secret'`)).s;
  await sqlq(`update public.onboarding_steps set payload = payload || '{"delivery":"auto"}' where client_id = '${cid}' and payload->>'title' = 'אישור ג'`);
  const nid = (await one(`select public.enqueue_client_notice('${cid}', 'new', now()) id`)).id;
  const auto = await fetch(FN('send-process-open-email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-notice-secret': secret, 'x-pivo-test-transport': 'log' },
    body: JSON.stringify({ noticeId: nid }),
  });
  const autoJson = await auto.json().catch(() => null);
  ok('10 הודעה אוטומטית מהתור נשלחת', auto.status === 200 && autoJson?.ok, JSON.stringify(autoJson).slice(0, 200));
  const bad = await fetch(FN('send-process-open-email'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-client-notice-secret': 'wrong' },
    body: JSON.stringify({ noticeId: nid }),
  });
  ok('10b סוד שגוי ⇒ 401', bad.status === 401, String(bad.status));
  const noAuth = await fetch(FN('send-process-open-email'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: cid }),
  });
  ok('10c בלי כניסה ⇒ 401', noAuth.status === 401, String(noAuth.status));

  ok('invariants', (await one(`select public.assert_domain_function_invariants() r`)).r === 'ok');
} catch (e) { fail++; console.error('✋', e?.message ?? e); }
finally { await cleanup(); console.log(`\n${pass} עברו · ${fail} נכשלו`); process.exitCode = fail ? 1 : 0; }
