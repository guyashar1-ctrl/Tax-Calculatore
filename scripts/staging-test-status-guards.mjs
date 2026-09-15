#!/usr/bin/env node
/**
 * staging-test-status-guards.mjs — שער הרגרסיה של מיגרציה 171.
 *
 *  1  ביטול הצעה שאושרה מוחזר כ-not_cancellable ואינו נוגע בשורה (C3/C4).
 *  2  UPDATE ישיר approved→cancelled נחסם בטריגר — מכל דלת, לא רק מה-RPC.
 *  3  ביטול הצעה שנשלחה מצליח ורושם אירוע.
 *  4  מצב הצעה/ליד מחוץ לרשימה נדחה ב-CHECK (C8).
 *  5  has_exempt_from_withholding נגזר מ-withholding_status (T5).
 *  6  הפונקציות המתות אינן קיימות עוד.
 *
 * הרצה:  node scripts/staging-test-status-guards.mjs
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
const fails = async (sql) => { try { await writeStaging(sql); return null; } catch (e) { return String(e.message).slice(0, 200); } };

console.log(`סביבה: ${STAGING_REF}\n`);
const cleanup = () => writeStaging(`
  delete from public.quotations where id like 'sg-%';
  delete from public.leads where id like 'sg-lead-%';
  delete from public.clients where last_name = 'STATUSGUARD';`);
await cleanup();

try {
  const mk = (id, status) => writeStaging(`
    insert into public.quotations (id, user_id, quotation_number, status, public_token, items, vat_rate)
    values ('${id}', '${U}', 'SG-${id}', '${status}', replace(gen_random_uuid()::text,'-',''), '[]'::jsonb, 18);`);
  await mk('sg-approved', 'approved');
  await mk('sg-sent', 'sent');

  // 1
  const r1 = await asUser(U, `select public.cancel_quotation('sg-approved') as r;`);
  const st1 = (await one(`select status from public.quotations where id='sg-approved'`)).status;
  ok('1 ביטול הצעה מאושרת מוחזר כ-not_cancellable', r1[0].r?.ok === false && r1[0].r?.error === 'not_cancellable', JSON.stringify(r1[0].r));
  ok('1 והשורה נשארה approved', st1 === 'approved', st1);

  // 2
  const e2 = await fails(`update public.quotations set status='cancelled' where id='sg-approved';`);
  ok('2 UPDATE ישיר approved→cancelled נחסם', !!e2 && /approved/.test(e2), e2 ?? 'עבר!');

  // 3
  const r3 = await asUser(U, `select public.cancel_quotation('sg-sent', 'הלקוח התחרט') as r;`);
  const row3 = await one(`select status, (select count(*) from jsonb_array_elements(events) e where e->>'type'='cancelled')::int ev from public.quotations where id='sg-sent'`);
  ok('3 ביטול הצעה שנשלחה מצליח', r3[0].r?.ok === true && row3.status === 'cancelled' && row3.ev === 1, JSON.stringify({ r: r3[0].r, row3 }));

  // 4
  const e4 = await fails(`update public.quotations set status='bogus' where id='sg-sent';`);
  ok('4 מצב הצעה לא מוכר נדחה', !!e4 && /check/i.test(e4), e4 ?? 'עבר!');
  const e4b = await fails(`insert into public.leads (id, user_id, full_name, status) values ('sg-lead-1','${U}','x','weird');`);
  ok('4 מצב ליד לא מוכר נדחה', !!e4b && /check/i.test(e4b), e4b ?? 'עבר!');

  // 5
  const c = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, withholding_status, has_exempt_from_withholding)
    values (replace(gen_random_uuid()::text,'-',''), '${U}', 'ניכוי', 'STATUSGUARD', 'exempt', false)
    returning id, has_exempt_from_withholding;`));
  ok('5 מצב exempt ⇒ הדגל נגזר true גם כשנשלח false', c.has_exempt_from_withholding === true);
  const c2 = await one(`update public.clients set withholding_status='rates' where id='${c.id}' returning has_exempt_from_withholding;`);
  ok('5 מצב rates ⇒ הדגל false', c2.has_exempt_from_withholding === false);
  const c3 = await one(`update public.clients set withholding_status=null, has_exempt_from_withholding=true where id='${c.id}' returning has_exempt_from_withholding;`);
  ok('5 מצב לא ידוע ⇒ הדגל נשאר כפי שנכתב', c3.has_exempt_from_withholding === true);

  // 6
  const dead = (await one(`select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname in ('create_deferred_collection_tasks','submit_onboarding')`)).n;
  ok('6 הפונקציות המתות הוסרו', dead === 0, `נותרו ${dead}`);
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
