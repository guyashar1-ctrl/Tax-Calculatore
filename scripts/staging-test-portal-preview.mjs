#!/usr/bin/env node
/**
 * staging-test-portal-preview.mjs — שער הרגרסיה של מיגרציה 172.
 *
 *  1  תצוגה מקדימה מציגה את הטיוטה (draft_payload); הדף החי מציג את המפורסם (JF1).
 *  2  שאלון קליטה שפורסם בלי מייל מקבל intake_token ומופיע בדף האישי (B7).
 *  3  add_intake_questionnaire_step אינה כותבת payload.published (JF3).
 *  4  public_link_health אינה מטביעה "נצפה לאחרונה" על הלקוחות (P1, מיגרציה 175).
 *  5  פרסום בקשה ללקוח בלי קישור קבוע טובע לו אחד (P7, מיגרציה 175).
 *  6  «פתח מחדש» מנקה completed_at על בקשה (J-P2, מיגרציה 175).
 *
 * הרצה:  node scripts/staging-test-portal-preview.mjs
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
const asAnon = (sql) => writeStaging(`set role anon; ${sql}`);

console.log(`סביבה: ${STAGING_REF}\n`);
const cleanup = () => writeStaging(`
  delete from public.onboarding_steps where client_id in (select id from public.clients where last_name='PREVIEW172');
  delete from public.engagements where client_id in (select id from public.clients where last_name='PREVIEW172');
  delete from public.clients where last_name='PREVIEW172';`);
await cleanup();

try {
  const c = await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'תצוגה', 'PREVIEW172', 'delivered@resend.dev',
            replace(gen_random_uuid()::text,'-',''))
    returning id, portal_token;`);
  const eng = (await one(`
    insert into public.engagements (id, user_id, client_id, status, effective_from)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${c.id}', 'onboarding', current_date) returning id;`)).id;
  await writeStaging(`update public.engagements set process_published_at = now() where id = '${eng}';`);

  // 1 · טיוטה מעל פרסום
  await writeStaging(`
    insert into public.onboarding_steps (id, user_id, client_id, engagement_id, step_type, track, scope, status, ball, published_at, payload, draft_payload)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${c.id}', '${eng}', 'custom_request', 'custom', 'person', 'pending', 'client', now(),
            '{"title":"בקשה ישנה 172","clientTitle":"כותרת ישנה 172","requirements":[]}'::jsonb,
            '{"clientTitle":"כותרת חדשה 172"}'::jsonb);`);
  const preview = JSON.stringify((await asUser(U, `select public.get_client_portal_preview('${c.id}', 'preview') as r;`))[0].r);
  const live = JSON.stringify((await asAnon(`select public.get_client_portal('${c.portal_token}') as r;`))[0].r);
  ok('1 התצוגה המקדימה מציגה את הטיוטה', preview.includes('כותרת חדשה 172'), preview.slice(0, 200));
  ok('1 הדף החי מציג את המפורסם', live.includes('כותרת ישנה 172') && !live.includes('כותרת חדשה 172'), live.slice(0, 200));

  // 2 · פרסום שאלון בלי מייל ⇒ טוקן
  const before = (await one(`select intake_token from public.clients where id='${c.id}'`)).intake_token;
  const step = await one(`
    insert into public.onboarding_steps (id, user_id, client_id, engagement_id, step_type, track, scope, status, ball, published_at, payload)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', '${c.id}', '${eng}', 'intake_questionnaire', 'internal', 'person', 'waiting_client', 'client', null, '{}'::jsonb)
    returning id;`);
  await writeStaging(`update public.onboarding_steps set published_at = now() where id = '${step.id}';`);
  const after = (await one(`select intake_token from public.clients where id='${c.id}'`)).intake_token;
  ok('2 לפני הפרסום אין טוקן', before === null);
  ok('2 הפרסום טבע intake_token', typeof after === 'string' && after.length === 32, String(after));
  const live2 = JSON.stringify((await asAnon(`select public.get_client_portal('${c.portal_token}') as r;`))[0].r);
  ok('2 והשאלון מופיע בדף האישי', live2.includes(after), live2.slice(0, 200));
  await writeStaging(`update public.onboarding_steps set published_at = null where id = '${step.id}'; update public.onboarding_steps set published_at = now() where id = '${step.id}';`);
  const again = (await one(`select intake_token from public.clients where id='${c.id}'`)).intake_token;
  ok('2 פרסום חוזר לא מחליף טוקן קיים', again === after);

  // 3 · add_intake_questionnaire_step בלי payload.published
  await writeStaging(`delete from public.onboarding_steps where id='${step.id}';`);
  const added = (await one(`select public.add_intake_questionnaire_step('${eng}') as r;`)).r;
  const row = await one(`select payload, published_at from public.onboarding_steps where id='${added.stepId}'`);
  ok('3 השאלון נולד כטיוטה: published_at ריק ובלי payload.published', row.published_at === null && !('published' in (row.payload || {})), JSON.stringify(row));

  // 4 · בדיקת הבריאות אינה משאירה עקבות
  await writeStaging(`update public.clients set portal_token_last_used_at = null where id='${c.id}';`);
  const health = (await one(`select public.public_link_health() as h`)).h;
  const seen = (await one(`select portal_token_last_used_at as t from public.clients where id='${c.id}'`)).t;
  ok('4 public_link_health רצה וספרה את הדף האישי', typeof health?.portal?.total === 'number' && health.portal.total >= 1, JSON.stringify(health?.portal));
  ok('4 ולא הטביעה "נצפה לאחרונה" על הלקוח', seen === null, String(seen));

  // 5 · פרסום ⇒ קישור קבוע
  await writeStaging(`update public.clients set portal_token = null where id='${c.id}';`);
  await writeStaging(`update public.onboarding_steps set published_at = null where id='${added.stepId}'; update public.onboarding_steps set published_at = now() where id='${added.stepId}';`);
  const minted = (await one(`select portal_token from public.clients where id='${c.id}'`)).portal_token;
  ok('5 פרסום בלי קישור קבוע טבע אחד', typeof minted === 'string' && minted.length === 32, String(minted));
  await writeStaging(`update public.onboarding_steps set published_at = null where id='${added.stepId}'; update public.onboarding_steps set published_at = now() where id='${added.stepId}';`);
  ok('5 פרסום חוזר אינו מחליף קישור קיים', (await one(`select portal_token from public.clients where id='${c.id}'`)).portal_token === minted);

  // 6 · פתיחה מחדש מנקה את חותמת ההשלמה
  const done = (await asUser(U, `select public.advance_onboarding_step('${added.stepId}', 'complete', '{}'::jsonb) as r`))[0].r;
  const doneAt = (await one(`select completed_at from public.onboarding_steps where id='${added.stepId}'`)).completed_at;
  ok('6 השלמה כותבת completed_at', done?.ok === true && doneAt !== null, JSON.stringify({ done, doneAt }));
  const reopened = (await asUser(U, `select public.advance_onboarding_step('${added.stepId}', 'reopen', '{}'::jsonb) as r`))[0].r;
  const after6 = await one(`select status, completed_at from public.onboarding_steps where id='${added.stepId}'`);
  ok('6 פתיחה מחדש מנקה completed_at', reopened?.ok === true && after6.status === 'pending' && after6.completed_at === null, JSON.stringify({ reopened, after6 }));
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
