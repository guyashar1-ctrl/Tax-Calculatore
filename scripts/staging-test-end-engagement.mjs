#!/usr/bin/env node
/**
 * staging-test-end-engagement.mjs — שער הרגרסיה של מיגרציה 178 (הכרעת מוצר C7).
 *
 *  1  end_engagement מסיימת התקשרות 'active'/'onboarding' בלבד, עם reason+by.
 *  2  התקשרות שכבר 'ended'/'cancelled'/'scheduled' מוחזרת כ-not_endable, בלי כתיבה.
 *  3  משתמש זר נדחה (not_found — לא חושף קיום).
 *  4  סיום התקשרות אינו נוגע ב-representation_status של הכרטיס בשום צורה.
 *  5  cancel_quotation על הצעה מאושרת עדיין מסרבת (not_cancellable) — אין
 *     נתיב עוקף דרך ביטול ההצעה כדי "לסיים" את ההתקשרות.
 *  6  apply_due_engagement_transitions מסמנת reason='superseded' על ההתקשרות
 *     שהוחלפה בחידוש, ו-ended_by נשאר null (פעולת מערכת, לא מפורשת).
 *
 * הרצה:  node scripts/staging-test-end-engagement.mjs
 * לא דורש seed-staging; קידומת הנתונים: ENDENG.
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

console.log(`סביבה: ${STAGING_REF}\n`);
const cleanup = () => writeStaging(`
  delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name='ENDENG');
  delete from public.engagements where client_id in (select id from public.clients where last_name='ENDENG');
  delete from public.clients where last_name='ENDENG';
  delete from public.quotations where id like 'endeng-%';`);
await cleanup();

try {
  const c = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage,
                                representation_status, authority_representations)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'סיום', 'ENDENG', 'delivered@resend.dev', 'active',
            'active', '{"incomeTax":{"level":"primary","status":"active"}}'::jsonb)
    returning id;`)).id;

  const mkEng = async (id, status) => writeStaging(`
    insert into public.engagements (id, user_id, client_id, status, monthly_total, effective_from)
    values ('${id}', '${U}', '${c}', '${status}', 500, current_date - interval '30 day');`);
  await mkEng('endeng-active', 'active');

  // 1 · סיום התקשרות פעילה
  const r1 = (await asUser(U, `select public.end_engagement('endeng-active', 'הלקוח עבר למשרד אחר') as r`))[0].r;
  ok('1 end_engagement הצליחה', r1?.ok === true, JSON.stringify(r1));
  const e1 = await one(`select status, ended_at, ended_reason, ended_by from public.engagements where id='endeng-active'`);
  ok('1 status=ended, ended_at/reason/by נכתבו', e1.status === 'ended' && e1.ended_at !== null
    && e1.ended_reason === 'הלקוח עבר למשרד אחר' && e1.ended_by === U, JSON.stringify(e1));
  const ev1 = (await one(`select count(*)::int as n from public.onboarding_events
    where engagement_id='endeng-active' and type='status_changed' and meta->>'to'='ended'`)).n;
  ok('1 נרשם אירוע ביומן', ev1 === 1, String(ev1));

  // 2 · לא ניתן לסיים שוב, ולא לסיים 'scheduled'
  const r1again = (await asUser(U, `select public.end_engagement('endeng-active') as r`))[0].r;
  ok('2 סיום חוזר מוחזר כ-not_endable', r1again?.ok === false && r1again?.error === 'not_endable', JSON.stringify(r1again));
  await mkEng('endeng-sched', 'scheduled');
  const r2 = (await asUser(U, `select public.end_engagement('endeng-sched') as r`))[0].r;
  ok('2 scheduled אינה ניתנת לסיום', r2?.ok === false && r2?.error === 'not_endable', JSON.stringify(r2));
  const stillSched = (await one(`select status from public.engagements where id='endeng-sched'`)).status;
  ok('2 scheduled לא נגעה', stillSched === 'scheduled');

  // 3 · משתמש זר
  const other = (await one(`select id from auth.users where id <> '${U}' limit 1`))?.id;
  if (other) {
    await mkEng('endeng-foreign', 'active');
    const r3 = (await asUser(other, `select public.end_engagement('endeng-foreign') as r`))[0].r;
    ok('3 משתמש זר מקבל not_found', r3?.ok === false && r3?.error === 'not_found', JSON.stringify(r3));
    const stillActive = (await one(`select status from public.engagements where id='endeng-foreign'`)).status;
    ok('3 ולא נגע בהתקשרות', stillActive === 'active');
  } else {
    ok('3 (דולג — אין משתמש נוסף בסביבה)', true);
  }

  // 4 · ייצוג לא מושפע
  const repBefore = (await one(`select representation_status, authority_representations from public.clients where id='${c}'`)).representation_status;
  ok('4 representation_status ללא שינוי אחרי סיום ההתקשרות', repBefore === 'active', repBefore);

  // 5 · cancel_quotation על הצעה מאושרת עדיין חסום — אין נתיב עוקף
  await writeStaging(`
    insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, vat_rate, approved_at)
    values ('endeng-q1', '${U}', '${c}', 'ENDENG-1', 'approved', replace(gen_random_uuid()::text,'-',''), '[]'::jsonb, 18, now());`);
  const r5 = (await asUser(U, `select public.cancel_quotation('endeng-q1') as r`))[0].r;
  ok('5 cancel_quotation מסרבת על הצעה מאושרת — אין נתיב עוקף לסיום דרך ההצעה',
    r5?.ok === false && r5?.error === 'not_cancellable', JSON.stringify(r5));

  // 6 · חידוש דרך apply_due_engagement_transitions מסמן superseded
  await writeStaging(`
    update public.engagements set status='active' where id='endeng-foreign';
    insert into public.engagements (id, user_id, client_id, status, monthly_total, effective_from, supersedes_engagement_id)
    values ('endeng-renewal', '${U}', '${c}', 'scheduled', 700, current_date - interval '1 day', 'endeng-foreign');`);
  await writeStaging(`select public.apply_due_engagement_transitions();`);
  const old6 = await one(`select status, ended_reason, ended_by from public.engagements where id='endeng-foreign'`);
  ok('6 ההתקשרות הישנה סומנה ended עם reason=superseded ובלי ended_by',
    old6.status === 'ended' && old6.ended_reason === 'superseded' && old6.ended_by === null, JSON.stringify(old6));
  const new6 = (await one(`select status from public.engagements where id='endeng-renewal'`)).status;
  ok('6 החידוש נכנס לתוקף (active)', new6 === 'active', new6);
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
