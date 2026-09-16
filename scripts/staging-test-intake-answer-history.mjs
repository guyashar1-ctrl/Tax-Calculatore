#!/usr/bin/env node
/**
 * staging-test-intake-answer-history.mjs — שער הרגרסיה של מיגרציה 181 (H7).
 *
 *  1  שינוי ערך תשובה (save_intake_answer, מסלול הלקוח) משאיר את התשובה
 *     הקודמת עם superseded_by, ולא דורס אותה.
 *  2  שמירה חוזרת של אותו ערך בדיוק אינה יוצרת שורת היסטוריה מיותרת.
 *  3  אותה התנהגות ב-save_intake_answers (מסלול המשרד, ריבוי שאלות).
 *  4  answered_by ממשיך להיכתב נכון בכל שורה (לא נסחף מהשינוי).
 *
 * הרצה:  node scripts/staging-test-intake-answer-history.mjs
 * לא דורש seed-staging; קידומת: iah.
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
  delete from public.annual_report_answers where session_id in (select id from public.annual_report_sessions where client_id = 'iah-c1');
  delete from public.annual_report_sessions where client_id = 'iah-c1';
  delete from public.clients where id = 'iah-c1';`);
await cleanup();

try {
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, email, intake_token)
    values ('iah-c1', '${U}', 'היסטוריה', 'IAH', 'delivered@resend.dev', 'iah-token-1');`);
  const sess = (await one(`
    insert into public.annual_report_sessions (id, user_id, client_id, tax_year, status, model, current_question_id)
    values (gen_random_uuid(), '${U}', 'iah-c1', 2025, 'in_progress', '{}'::jsonb, 'q1')
    returning id;`)).id;

  // 1 · שינוי ערך אמיתי
  const r1 = (await one(`select public.save_intake_answer('iah-token-1', '${sess}', 'q1', '"A"'::jsonb, '{}'::jsonb, 'q1', false) as r`)).r;
  ok('1a תשובה ראשונה נשמרה', r1 === true);
  const r2 = (await one(`select public.save_intake_answer('iah-token-1', '${sess}', 'q1', '"B"'::jsonb, '{}'::jsonb, 'q1', false) as r`)).r;
  ok('1b שינוי הערך הצליח', r2 === true);
  const rows1 = await writeStaging(`select answer_value, superseded_by, answered_by from public.annual_report_answers
    where session_id='${sess}' and question_id='q1' order by answered_at`);
  ok('1c שתי שורות: הישנה (A, עם superseded_by) והחדשה (B, בלי)',
    rows1.length === 2 && rows1[0].answer_value === 'A' && rows1[0].superseded_by !== null
      && rows1[1].answer_value === 'B' && rows1[1].superseded_by === null,
    JSON.stringify(rows1));
  ok('1d superseded_by מצביע בדיוק לשורה החדשה', rows1[0].superseded_by === (await one(
    `select id from public.annual_report_answers where session_id='${sess}' and question_id='q1' and superseded_by is null`)).id);

  // 2 · שמירה חוזרת של אותו ערך — לא יוצרת שורה שלישית
  await writeStaging(`select public.save_intake_answer('iah-token-1', '${sess}', 'q1', '"B"'::jsonb, '{}'::jsonb, 'q1', false);`);
  const count2 = (await one(`select count(*)::int as n from public.annual_report_answers where session_id='${sess}' and question_id='q1'`)).n;
  ok('2 שמירה חוזרת של אותו ערך אינה מוסיפה שורה', count2 === 2, String(count2));

  // 3 · אותה בדיקה במסלול המשרד (save_intake_answers)
  const r3a = (await asUser(U, `select public.save_intake_answers('${sess}', '{"q2":"X"}'::jsonb, '{}'::jsonb, null, null) as r`))[0].r;
  ok('3a תשובה ראשונה (משרד) נשמרה', !!r3a);
  await asUser(U, `select public.save_intake_answers('${sess}', '{"q2":"Y"}'::jsonb, '{}'::jsonb, null, null) as r`);
  const rows3 = await writeStaging(`select answer_value, superseded_by, answered_by from public.annual_report_answers
    where session_id='${sess}' and question_id='q2' order by answered_at`);
  ok('3b אותה היסטוריה במסלול המשרד, answered_by=office', rows3.length === 2
    && rows3[0].answer_value === 'X' && rows3[0].superseded_by !== null && rows3[0].answered_by === 'office'
    && rows3[1].answer_value === 'Y' && rows3[1].superseded_by === null && rows3[1].answered_by === 'office',
    JSON.stringify(rows3));
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
