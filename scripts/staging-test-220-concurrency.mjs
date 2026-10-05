#!/usr/bin/env node
/**
 * staging-test-220-concurrency.mjs — עדכונים בו־זמניים אמיתיים מול 220 (staging בלבד).
 *
 * ‼ דורש ש-220 מוחלת על staging (אושר ע״י גיא, 05.10.2026). יוצר לקוחות QA220C, מריץ שתי
 *   טרנזקציות נפרדות במקביל (שתי בקשות HTTP — כל אחת טרנזקציה משלה, בחיבור נפרד), ומוחק
 *   את כל מה שיצר בסוף (גם בכישלון). שום מייל לא נשלח: ההודעה למשרד נכנסת לתור ונמחקת.
 *
 *   A · שם העסק: המשרד שומר שם (update_client_fields) ומחזיק את הטרנזקציה 4 שניות; הדף
 *       האישי שולח שם אחר עם «השם שראיתי» הישן ⇒ חייב לחכות, לראות את שם המשרד ולהחזיר stale.
 *   B · אישור מול תשובות חדשות: המשרד שומר תשובות חדשות ומחזיק; אישור לתשובות הקודמות
 *       שמתחיל באמצע ⇒ חייב לחכות ולהחזיר answers_changed (לא «הצלחה» על תשובות שהוחלפו).
 *   C · «הוזן בפייפרלס» מול תשובות חדשות ⇒ approval_not_current.
 *
 *   הרצה: node scripts/staging-test-220-concurrency.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
const UID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const rnd = Math.random().toString(36).slice(2, 10);
const C1 = `qa220c1${rnd}`, C2 = `qa220c2${rnd}`, TOK1 = `qa220tok${rnd}`;
const claims = JSON.stringify({ sub: UID, role: 'authenticated' });

async function q(query) {
  const t0 = Date.now();
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(body.slice(0, 600));
  return { rows: JSON.parse(body), ms: Date.now() - t0 };
}
const asOffice = (stmt) => `begin; select set_config('request.jwt.claims', '${claims}', true), set_config('request.jwt.claim.sub', '${UID}', true); ${stmt}; commit;`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (t, pass, got) => { results.push({ t, pass }); console.log(`${pass ? '✓' : '✗'} ${t}${pass ? '' : ' — ' + JSON.stringify(got).slice(0, 400)}`); };

try {
  // ── הכנה (נשמרת עד הניקוי) ──
  await q(`
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, portal_token, business_name)
    values ('${C1}', '${UID}', 'בו-זמני', 'QA220C', 'delivered@resend.dev', 'onboarding', 'single', '${TOK1}', null),
           ('${C2}', '${UID}', 'אישור', 'QA220C', 'delivered@resend.dev', 'onboarding', 'single', null, 'עסק QA');
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${UID}', '${C1}', 'business_details', 'tools', 'person', 'pending', 'client', '{}', now());`);
  const bd1 = (await q(`select id from public.onboarding_steps where client_id = '${C1}' and step_type = 'business_details'`)).rows[0].id;

  // ── A · שם העסק ──
  const office = q(asOffice(`select public.update_client_fields('${C1}', '{"business_name":"שם מהמשרד"}'::jsonb, null, null, null); select pg_sleep(4)`));
  await sleep(1200);
  const portal = q(`select public.portal_submit_business_details('${TOK1}', '${bd1}',
    '{"businessName":"שם מהדף","expectedBusinessName":"","homeOffice":{"hasDedicatedRoom":false}}'::jsonb) r`);
  const [, pr] = await Promise.all([office, portal]);
  const res = pr.rows[0].r;
  ok('A.1 הדף חיכה לטרנזקציה של המשרד (≥ 2.0 שניות)', pr.ms >= 2000, pr.ms);
  ok('A.2 הדף קיבל stale עם השם של המשרד', res.error === 'stale' && res.businessName === 'שם מהמשרד', res);
  const nm = (await q(`select business_name from public.clients where id = '${C1}'`)).rows[0].business_name;
  ok('A.3 השם של המשרד לא נדרס', nm === 'שם מהמשרד', nm);
  const nAns = (await q(`select count(*)::int n from public.client_home_office_answers where client_id = '${C1}'`)).rows[0].n;
  ok('A.4 ושום תשובה לא נשמרה מהשליחה שנדחתה', nAns === 0, nAns);

  // ── B · אישור מול תשובות שמוחלפות במקביל ──
  const a1 = (await q(asOffice(`select (public.save_home_office_answers('${C2}', '{"hasDedicatedRoom":true,"totalRooms":4,"businessRooms":1}'::jsonb))->>'answersId' id`))).rows[0].id;
  const save2 = q(asOffice(`select public.save_home_office_answers('${C2}', '{"hasDedicatedRoom":true,"totalRooms":3,"businessRooms":2}'::jsonb); select pg_sleep(4)`));
  await sleep(1200);
  const appr = q(asOffice(`select public.approve_home_office('${C2}', '${a1}', 25, current_date, null) r`));
  const [, ar] = await Promise.all([save2, appr]);
  const ares = ar.rows[0].r;
  ok('B.1 האישור חיכה לשמירה המקבילה (≥ 2.0 שניות)', ar.ms >= 2000, ar.ms);
  ok('B.2 אישור לתשובות שהוחלפו ⇒ answers_changed', ares.error === 'answers_changed', ares);
  const nAppr = (await q(`select count(*)::int n from public.client_home_office_approvals where client_id = '${C2}'`)).rows[0].n;
  ok('B.3 לא נוצר אישור', nAppr === 0, nAppr);

  // ── C · «הוזן בפייפרלס» מול תשובות שמוחלפות במקביל ──
  const latest = (await q(`select id from public.client_home_office_answers where client_id = '${C2}' order by seq desc limit 1`)).rows[0].id;
  const apprId = (await q(asOffice(`select (public.approve_home_office('${C2}', '${latest}', 20, current_date, null))->>'approvalId' id`))).rows[0].id;
  const save3 = q(asOffice(`select public.save_home_office_answers('${C2}', '{"hasDedicatedRoom":true,"totalRooms":5,"businessRooms":1}'::jsonb); select pg_sleep(4)`));
  await sleep(1200);
  const conf = q(asOffice(`select public.confirm_home_office_in_paperless('${apprId}') r`));
  const [, cr] = await Promise.all([save3, conf]);
  const cres = cr.rows[0].r;
  ok('C.1 «הוזן בפייפרלס» חיכה לשמירה המקבילה', cr.ms >= 2000, cr.ms);
  ok('C.2 ⇒ approval_not_current, והאישור לא סומן', cres.error === 'approval_not_current', cres);
  const ent = (await q(`select paperless_entered_at from public.client_home_office_approvals where id = '${apprId}'`)).rows[0].paperless_entered_at;
  ok('C.3 paperless_entered_at נשאר ריק', ent === null, ent);
} finally {
  // ── ניקוי — הכול, גם בכישלון ──
  await q(`
    delete from public.accountant_notifications where client_id in ('${C1}', '${C2}');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in ('${C1}', '${C2}'));
    delete from public.tax_fact_changes where client_id in ('${C1}', '${C2}');
    delete from public.clients where id in ('${C1}', '${C2}');`);
  const left = (await q(`select (select count(*) from public.clients where id in ('${C1}','${C2}'))
    + (select count(*) from public.onboarding_steps where client_id in ('${C1}','${C2}'))
    + (select count(*) from public.client_home_office_answers where client_id in ('${C1}','${C2}')) n`)).rows[0].n;
  console.log(`ניקוי: ${Number(left) === 0 ? 'נמחק הכול' : `נשארו ${left} שורות!`}`);
  const fail = results.filter(r => !r.pass).length;
  console.log(`${results.length - fail} עברו · ${fail} נכשלו`);
  process.exitCode = fail ? 1 : 0;
}
