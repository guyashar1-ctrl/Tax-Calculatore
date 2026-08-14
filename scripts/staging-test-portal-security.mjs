#!/usr/bin/env node
/**
 * staging-test-portal-security.mjs — הדף המרכזי של הלקוח: אבטחה וסינון.
 *
 * מכסה את רשימת הבדיקות שנדרשה במזכר האבטחה של איחוד תהליך/בקשות/דף לקוח:
 * רוטציה, בידוד בין לקוחות, טיוטה מוסתרת, הושלם לא מוצג כפעיל, בעלות של
 * רו"ח קודם לא נחשפת ללקוח, שלב נעול לא נחשף, טוקן חתימה של רק החותם
 * הנכון, הצעת מחיר שפגה/בוטלה לא ניתנת לאישור.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const AS = (uid) => `select set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, false);`;
const asUser = (uid, sql) => writeStaging(`${AS(uid)} set role authenticated; ${sql}`);
const portal = async (tok) => (await one(`select public.get_client_portal('${tok}') as r;`)).r;

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  // ‼ סדר מחייב: טריגר חוסם מחיקת הצעה כל עוד היא מקושרת לכרטיס לקוח קיים.
  await writeStaging(`delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'PORTALSEC');`);
  await writeStaging(`delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name = 'PORTALSEC');`);
  await writeStaging(`delete from public.clients where last_name = 'PORTALSEC';`);
  await writeStaging(`delete from public.quotations where quotation_number like 'PORTALSEC-%';`);
}
await cleanup();

try {
  const mk = async (first) => (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${first}', 'PORTALSEC', 'delivered@resend.dev', replace(gen_random_uuid()::text,'-',''))
    returning id, portal_token;`)).id ? (await one(`select id, portal_token from public.clients where user_id='${U}' and last_name='PORTALSEC' and first_name='${first}';`)) : null;

  const A = await mk('א');
  const B = await mk('ב');

  const step = async (clientId, opts) => (await one(`
    insert into public.onboarding_steps (id, user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${clientId}', '${opts.type}', 'custom', 'person',
            '${opts.status}', '${opts.ball}', ${opts.published ? 'now()' : 'null'}, '${JSON.stringify(opts.payload || {}).replace(/'/g, "''")}'::jsonb)
    returning id;`)).id;

  // ─── 1-2 · רוטציה ─────────────────────────────────────────────────────────
  {
    const before = A.portal_token;
    const rot = await asUser(U, `select public.rotate_portal_token('${A.id}') as t;`);
    const newTok = rot[0].t;
    ok('1 טוקן ישן אחרי רוטציה — לא תקף עוד', (await portal(before)).ok === false);
    ok('2 טוקן חדש עובד', (await portal(newTok)).ok === true);
    A.portal_token = newTok;
  }

  // ─── 3 · בידוד בין לקוחות ───────────────────────────────────────────────────
  {
    const rA = await portal(A.portal_token);
    const rB = await portal(B.portal_token);
    ok('3 טוקן של לקוח א׳ לא חושף מידע של לקוח ב׳',
      JSON.stringify(rA) !== JSON.stringify(rB) && !JSON.stringify(rA).includes(B.id));
  }

  // ─── 4 · טיוטה מוסתרת ───────────────────────────────────────────────────────
  {
    await step(A.id, { type: 'custom_request', status: 'waiting_client', ball: 'client', published: false,
      payload: { clientTitle: 'PORTALSEC-טיוטה', requirements: [{ key: 'a', kind: 'confirm', label: 'x', done: false }] } });
    const r = await portal(A.portal_token);
    const actions = (r.items || []).filter(i => i.bucket === 'action');
    ok('4 שלב שלא פורסם אינו מופיע כפעולת לקוח', !actions.some(i => i.label?.includes('PORTALSEC-טיוטה')));
  }

  // ─── 5 · הושלם אינו מוצג כפעיל ──────────────────────────────────────────────
  {
    await step(A.id, { type: 'custom_request', status: 'completed', ball: 'me', published: true,
      payload: { clientTitle: 'PORTALSEC-הושלם', requirements: [{ key: 'a', kind: 'confirm', label: 'x', done: true }] } });
    const r = await portal(A.portal_token);
    const actions = (r.items || []).filter(i => i.bucket === 'action');
    ok('5 שלב שהושלם אינו מופיע כפעולה נוכחית', !actions.some(i => i.label?.includes('PORTALSEC-הושלם')));
  }

  // ─── 6 · רו"ח קודם אינו נחשף כבעלות לקוח ────────────────────────────────────
  {
    // ‼ materials_received (חומרים שמגיעים *מ*הרו"ח הקודם) — לא prev_accountant_details
    // (שם/מייל/טלפון שהלקוח *עצמו* מוסר עלינו — זו כן פעולת לקוח לגיטימית).
    await step(A.id, { type: 'materials_received', status: 'waiting_client', ball: 'prev_accountant', published: true });
    const r = await portal(A.portal_token);
    const actions = (r.items || []).filter(i => i.bucket === 'action');
    const hit = actions.find(i => /רו.ח הקודם|prev_accountant/i.test(i.key + i.label));
    ok('6 חומרים ממתינים לרו״ח קודם אינם מופיעים כפעולת לקוח (bucket=action)', !hit, hit ? JSON.stringify(hit) : '');
  }

  // ─── 7 · שלב נעול אינו נחשף ─────────────────────────────────────────────────
  {
    const dep = await step(A.id, { type: 'custom_request', status: 'waiting_client', ball: 'client', published: true,
      payload: { clientTitle: 'PORTALSEC-תלוי', requirements: [{ key: 'a', kind: 'confirm', label: 'x', done: false }] } });
    await writeStaging(`insert into public.onboarding_step_dependencies (user_id, step_id, depends_on_step_id)
      values ('${U}', '${dep}', (select id from public.onboarding_steps where client_id='${A.id}' and payload->>'clientTitle'='PORTALSEC-הושלם' limit 1))
      on conflict do nothing;`);
    await writeStaging(`update public.onboarding_steps set status='locked' where id='${dep}';`);
    const r = await portal(A.portal_token);
    const actions = (r.items || []).filter(i => i.bucket === 'action');
    ok('7 שלב נעול אינו מופיע כפעולת לקוח זמינה', !actions.some(i => i.label?.includes('PORTALSEC-תלוי')));
  }

  // ─── 8 · טוקן חתימה — רק החותם הנכון ────────────────────────────────────────
  {
    const clientTok = 'sigA-' + Math.random().toString(36).slice(2);
    const spouseTok = 'sigB-' + Math.random().toString(36).slice(2);
    const req = (await one(`
      insert into public.representation_requests (id, user_id, linked_client_id, client_name, status, signers)
      values (replace(gen_random_uuid()::text,'-',''), '${U}', '${A.id}', 'PORTALSEC', 'pending_signature',
        '[{"role":"client","signStatus":"pending","signToken":"${clientTok}"},{"role":"spouse","signStatus":"pending","signToken":"${spouseTok}"}]'::jsonb)
      returning id;`)).id;
    const r = await portal(A.portal_token);
    const dump = JSON.stringify(r);
    ok('8a הדף חושף את טוקן החתימה של הלקוח עצמו', dump.includes(clientTok));
    ok('8b הדף אינו חושף את טוקן החתימה של בן/בת הזוג', !dump.includes(spouseTok));
    await writeStaging(`delete from public.representation_requests where id='${req}';`);
  }

  // ─── 9 · הצעת מחיר שפגה/בוטלה ───────────────────────────────────────────────
  {
    const expired = (await one(`
      insert into public.quotations (id, user_id, client_id, quotation_number, status, items, expires_at, public_token)
      values (replace(gen_random_uuid()::text,'-',''), '${U}', '${A.id}', 'PORTALSEC-EXP', 'sent', '[]'::jsonb, now() - interval '1 day', replace(gen_random_uuid()::text,'-',''))
      returning public_token as tok, id;`));
    const rExp = await one(`select public.approve_quotation('${expired.tok}') as r;`);
    ok('9a הצעה שפגה — אישור מוחזר כ-expired ולא approved', rExp.r.status === 'expired', JSON.stringify(rExp.r));

    const cancelled = (await one(`
      insert into public.quotations (id, user_id, client_id, quotation_number, status, items, public_token)
      values (replace(gen_random_uuid()::text,'-',''), '${U}', '${A.id}', 'PORTALSEC-CANC', 'cancelled', '[]'::jsonb, replace(gen_random_uuid()::text,'-',''))
      returning public_token as tok;`));
    const rCanc = await one(`select public.approve_quotation('${cancelled.tok}') as r;`);
    ok('9b הצעה שבוטלה — אישור מוחזר כ-cancelled ולא approved', rCanc.r.status === 'cancelled', JSON.stringify(rCanc.r));
  }

  // ─── 12 · הרשאה ברמת פעולה עדיין נאכפת (הפרעה על שלב סגור) ──────────────────
  {
    const closedStep = await step(A.id, { type: 'custom_request', status: 'completed', ball: 'me', published: true,
      payload: { clientTitle: 'PORTALSEC-סגור', requirements: [{ key: 'a', kind: 'confirm', label: 'x', done: true }] } });
    const r = await one(`select public.portal_submit_step('${A.portal_token}', '${closedStep}', '{"key":"a"}'::jsonb) as r;`);
    ok('12 לא ניתן לשלוח נתון לשלב שכבר הושלם/סגור (noop, לא נכתב מחדש)', r.r.ok === true && r.r.noop === true);
  }
} finally {
  await cleanup();
  const B2 = await one(`select count(*)::int as n from public.clients where last_name='PORTALSEC';`);
  ok('ניקוי מלא', B2.n === 0, `נשארו ${B2.n}`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
