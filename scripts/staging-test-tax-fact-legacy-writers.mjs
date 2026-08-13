#!/usr/bin/env node
/**
 * staging-test-tax-fact-legacy-writers.mjs — סגירת הפער האחרון: מסכי העריכה
 * המלאה הישנים (ClientDossierTab/PersonalContactsTab/TaxNITab/TaxFilesSection).
 *
 * הם לא נכתבו מחדש — הם ממשיכים להשתמש ב-update()/patch() המקומיים של
 * ClientWorkspace. נקודת המעבר היחידה שלהם ל-DB היא כפתור "שמור" הראשי,
 * שקורא ל-handleSave() ב-ClientWorkspace.tsx. הבדיקות כאן מדמות בדיוק את
 * מה ש-handleSave() עושה עכשיו: שדה מנוהל (GOVERNED_FACT_KEYS) ששונה מאז
 * הטעינה עובר דרך record_manual_fact_change; כל השאר ממשיך ב-UPDATE רגיל.
 * ‼ זו בדיקת אינטגרציה על התוצאה בפועל — לא מוק של רכיב React (אין test
 * runner ל-JS בפרויקט הזה; המוסכמה הקיימת היא סקריפטי staging).
 *
 * B1  שמירה מעורבת: שדה מנוהל ↔ record_manual_fact_change, שדה לא-מנוהל ↔
 *     UPDATE רגיל. שניהם נוחתים, אף אחד לא הולך לאיבוד.
 * B2  שדה מנוהל שנערך מהתיק: מקבל שורת היסטוריה accepted/manual, ו-field_meta
 *     עם source='manual' (provenance).
 * B3  שדה לא-מנוהל: אין שום שורת tax_fact_changes בשמו — לא עובר בהתאמה.
 * B4  התנגשות שאלון אחרי עריכה מהתיק: הצעה מיושנת (מבוססת על הערך שהיה
 *     *לפני* השמירה מהתיק) נדחית כ-stale — לא דורסת את מה שהרו"ח שמר.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const AS_USER = (uid) => `select set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, false);`;
const jrpc = async (expr, uid = USER_ID) => JSON.parse((await one(`${AS_USER(uid)} select (${expr})::text as out;`)).out);

console.log(`סביבה: ${STAGING_REF}\n`);

await writeStaging(`delete from public.clients where last_name = 'TFL-לקוח';`);

const client = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, city, donations_annual)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'עורך', 'TFL-לקוח', 'delivered@resend.dev', 'תל אביב', 1000)
  returning id;`)).id;

// ─── B1/B2/B3 · שמירה מעורבת מהתיק ("שמור") ─────────────────────────────────
// שדה מנוהל (donationsAnnual) → record_manual_fact_change; שדה לא-מנוהל
// (city) → UPDATE רגיל. בדיוק כמו handleSave() אחרי הפאצ' — לא שתי קריאות
// שתלויות זו בזו, כל אחת עומדת בפני עצמה.
const manualRes = await jrpc(`public.record_manual_fact_change('${client}', 'dossier-edit', 'עדכון בתיק · תרומות שנתיות',
  '{"display":"לפני העדכון"}'::jsonb, '{"display":"עודכן בתיק","patch":{"donationsAnnual":5000}}'::jsonb, null)`);
ok('B1a כתיבת השדה המנוהל (RPC) הצליחה', manualRes.ok === true, JSON.stringify(manualRes));
await writeStaging(`update public.clients set city = 'חיפה' where id='${client}';`);

const afterMixed = await one(`select donations_annual, city, field_meta->'donationsAnnual'->>'source' as src from public.clients where id='${client}';`);
ok('B1b השדה המנוהל נחת (donationsAnnual=5000)', Number(afterMixed.donations_annual) === 5000, afterMixed.donations_annual);
ok('B1c השדה הלא-מנוהל נחת גם הוא (city=חיפה) — שמירה מעורבת לא איבדה כלום', afterMixed.city === 'חיפה', afterMixed.city);
ok('B2 field_meta.donationsAnnual.source=manual (provenance)', afterMixed.src === 'manual', afterMixed.src);

const historyRow = await one(`select status, source, field_key, old_value, new_value from public.tax_fact_changes where id='${manualRes.id}';`);
ok('B2 נוצרה שורת היסטוריה accepted/manual לשדה המנוהל', historyRow.status === 'accepted' && historyRow.source === 'manual');

const cityHistory = await one(`select count(*)::int as n from public.tax_fact_changes where client_id='${client}' and (field_key ilike '%city%' or new_value::text ilike '%חיפה%');`);
ok('B3 השדה הלא-מנוהל לא יצר שום שורת התאמה', cityHistory.n === 0, `נמצאו ${cityHistory.n}`);

// ─── B4 · שאלון מתחרה אחרי עריכה מהתיק — לא דורס ────────────────────────────
// ההצעה "חושבת" שהערך המקובל עדיין 1,000 (כפי שהיה *לפני* השמירה מהתיק) —
// בדיוק התרחיש: שאלון שנענה במקביל לעריכה ידנית מהתיק.
await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'b4', '[
  {"field_key":"donations","label":"תרומות שנתיות",
   "old_value":{"display":"1,000 ₪","patch":{"donationsAnnual":1000}},
   "new_value":{"display":"2,000 ₪","patch":{"donationsAnnual":2000}}}
]'::jsonb)`);
const b4Pending = await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='donations' and status='pending';`);
const b4Accept = await jrpc(`public.accept_tax_fact_change('${b4Pending.id}')`);
ok('B4a הצעת שאלון מיושנת (אחרי עריכה מהתיק) נדחית כ-stale_conflict', b4Accept.ok === false && b4Accept.error === 'stale_conflict', JSON.stringify(b4Accept));
const afterB4 = await one(`select donations_annual from public.clients where id='${client}';`);
ok('B4b הערך שנשמר מהתיק (5000) לא נדרס', Number(afterB4.donations_annual) === 5000, afterB4.donations_annual);

// ── ניקוי ────────────────────────────────────────────────────────────────
await writeStaging(`delete from public.clients where id='${client}';`);
const leftovers = await one(`select count(*)::int as n from public.tax_fact_changes where client_id='${client}';`);
ok('ניקוי מלא — cascade מחק את כל ההיסטוריה', leftovers.n === 0);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
