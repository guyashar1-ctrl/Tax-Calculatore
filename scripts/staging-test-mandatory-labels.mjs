#!/usr/bin/env node
/**
 * staging-test-mandatory-labels.mjs — שער הרגרסיה של מיגרציה 179 (הכרעת מוצר D4).
 *
 *  1  documents.label_id הוא NOT NULL — הכנסה ישירה בלי תווית נכשלת בכל
 *     כניסה (SQL ישיר, לא רק דרך RPC כלשהו — זו בדיוק הדרישה "בכל דלת").
 *  2  ensure_reserved_document_label יוצרת/מוצאת את תווית ה"לבדיקה" של
 *     המשתמש — אידמפוטנטית, ומחזירה את אותה תווית פעם שנייה.
 *  3  delete_document_label ממשיכה לעבוד בדיוק כפי שהייתה (מיגרציה 95) —
 *     קוראת לפונקציה המשותפת החדשה בלי לשנות התנהגות.
 *  4  אין אף מסמך בלי תווית אחרי היישור — כל התיעוד הישן קיבל "לבדיקה".
 *
 * הרצה:  node scripts/staging-test-mandatory-labels.mjs
 * לא דורש seed-staging; קידומת: mndlbl.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const fails = async (sql) => { try { await writeStaging(sql); return null; } catch (e) { return String(e.message).slice(0, 250); } };

console.log(`סביבה: ${STAGING_REF}\n`);
const cleanup = () => writeStaging(`
  delete from public.documents where id like 'mndlbl-%';
  delete from public.clients where last_name = 'MNDLBL';`);
await cleanup();

try {
  const c = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values ('mndlbl-c1', '${U}', 'תווית', 'MNDLBL', 'delivered@resend.dev') returning id;`)).id;

  // 1 · NOT NULL בכל דלת — הכנסה ישירה, בלי RPC כלשהו
  const err1 = await fails(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year)
    values ('mndlbl-nolabel', '${U}', '${c}', 'x/y', 'no-label.pdf', 'application/pdf', 10, 'other', '2025');`);
  ok('1 הכנסת מסמך בלי label_id נכשלת ישירות ב-SQL — לא רק ב-RPC',
    err1 !== null && /null value in column "label_id"|violates not-null/.test(err1), err1);
  const gone1 = (await one(`select count(*)::int as n from public.documents where id='mndlbl-nolabel'`)).n;
  ok('1 שום שורה לא נכתבה', gone1 === 0);

  // הכנסה תקינה עם תווית אמיתית — מוודאים שהערוץ הרגיל לא נשבר
  const lbl = (await one(`
    insert into public.document_labels (user_id, name) values ('${U}', 'MNDLBL-תווית-בדיקה')
    on conflict (user_id, name) do update set name=excluded.name returning id;`)).id;
  await writeStaging(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, label_id)
    values ('mndlbl-ok', '${U}', '${c}', 'x/y2', 'labeled.pdf', 'application/pdf', 10, 'other', '2025', '${lbl}');`);
  const ok1b = (await one(`select label_id from public.documents where id='mndlbl-ok'`)).label_id;
  ok('1b הכנסה עם תווית אמיתית מצליחה כרגיל', ok1b === lbl);

  // 2 · ensure_reserved_document_label אידמפוטנטית
  const r1 = (await one(`select public.ensure_reserved_document_label('${U}') as id`)).id;
  const r2 = (await one(`select public.ensure_reserved_document_label('${U}') as id`)).id;
  ok('2 ensure_reserved_document_label מחזירה את אותה תווית פעמיים', r1 === r2, `${r1} vs ${r2}`);
  const reservedRow = await one(`select is_reserved, name from public.document_labels where id = '${r1}'`);
  ok('2 התווית שמורה ונקראת "לבדיקה"', reservedRow.is_reserved === true && reservedRow.name === 'לבדיקה', JSON.stringify(reservedRow));

  // 3 · delete_document_label ממשיכה לעבוד — reassign ל"לבדיקה" ולא שבירה
  const lbl2 = (await one(`insert into public.document_labels (user_id, name) values ('${U}', 'MNDLBL-למחיקה') returning id;`)).id;
  await writeStaging(`update public.documents set label_id = '${lbl2}' where id = 'mndlbl-ok';`);
  const asOwner = `select set_config('request.jwt.claims', json_build_object('sub','${U}','role','authenticated')::text, false); set role authenticated;`;
  const delRes = (await one(`${asOwner} select public.delete_document_label('${lbl2}') as r`)).r;
  ok('3 delete_document_label מצליחה ומחזירה reassignedTo', delRes?.ok === true && delRes?.reassignedTo === r1, JSON.stringify(delRes));
  const afterDel = (await one(`select label_id from public.documents where id='mndlbl-ok'`)).label_id;
  ok('3 המסמך שהחזיק את התווית שנמחקה עבר ל"לבדיקה"', afterDel === r1, afterDel);

  // 4 · שום מסמך בלי תווית בכל הסביבה (אחרי היישור והבדיקות שלמעלה)
  const anyNull = (await one(`select count(*)::int as n from public.documents where label_id is null`)).n;
  ok('4 אין אף מסמך בלי תווית בסביבה', anyNull === 0, String(anyNull));
} finally {
  await writeStaging(`delete from public.document_labels where name in ('MNDLBL-תווית-בדיקה','MNDLBL-למחיקה');`);
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
