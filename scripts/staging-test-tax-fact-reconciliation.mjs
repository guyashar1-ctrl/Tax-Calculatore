#!/usr/bin/env node
/**
 * staging-test-tax-fact-reconciliation.mjs — שער הרגרסיה של תיק המס (M1).
 *
 * T1  הצעה לא כותבת ל-clients — הערך המקובל לא זז לפני אישור.
 * T2  אישור: שורת ההיסטוריה עוברת ל-accepted, decided_by/at נרשמים.
 * T3  דחייה: לא כותבת ל-clients, נשמרת כהחלטה (rejected, לא נמחקת).
 * T4  עריכה ידנית: נכנסת ישר כ-accepted (record_manual_fact_change).
 * T5  מקור מתחרה אחרי עריכה ידנית: הצעה חדשה לאותו שדה נופלת ל-pending —
 *     לא דורסת את הערך שנערך ידנית.
 * T6  אידמפוטנטיות: הצעה חוזרת לאותו שדה מרעננת שורה קיימת, לא כופלת.
 * T7  בעלות: לא ניתן להציע/לאשר/לדחות על לקוח של משתמש אחר.
 * T8  אישור/דחייה כפולים: הפעם השנייה נכשלת בבירור (כבר לא pending).
 *
 * ‼ הכול על לקוח דמה בסביבת הבדיקות בלבד, ונמחק בסוף.
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

// ── ניקוי משאריות ריצה קודמת ────────────────────────────────────────────────
await writeStaging(`delete from public.clients where last_name = 'TFC-לקוח';`);

// לקוח שני (משתמש אחר) — לבדיקת בעלות. משתמשים בפרופיל הראשי הקיים
// (guyashar1@gmail.com) כ"משתמש אחר" ביחס למשתמש הבדיקה.
const OTHER_USER_ROW = (await writeStaging(
  `select id from auth.users where id <> '${USER_ID}' limit 1;`
))[0];
const OTHER_USER = OTHER_USER_ROW ? OTHER_USER_ROW.id : null;

const client = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, donations_annual)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'תיק', 'TFC-לקוח', 'delivered@resend.dev', 1000)
  returning id;`)).id;

// ─── T1 · הצעה לא כותבת ל-clients ──────────────────────────────────────────
const proposeRes = await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'sess-1', '[
  {"field_key":"donationsAnnual","label":"תרומות שנתיות",
   "old_value":{"display":"1,000 ₪"},
   "new_value":{"display":"4,500 ₪","patch":{"donationsAnnual":4500}}}
]'::jsonb)`);
ok('T1a propose_tax_facts ok', proposeRes.ok === true && proposeRes.proposed === 1, JSON.stringify(proposeRes));

const afterPropose = await one(`select donations_annual from public.clients where id='${client}';`);
ok('T1b clients לא זז אחרי הצעה', Number(afterPropose.donations_annual) === 1000, `היה ${afterPropose.donations_annual}`);

const pendingRow = await one(`
  select id, status, field_key, new_value from public.tax_fact_changes
   where client_id='${client}' and field_key='donationsAnnual' and status='pending';`);
ok('T1c נוצרה שורה pending אחת', !!pendingRow, 'לא נמצאה שורה');

// ─── T2 · אישור ─────────────────────────────────────────────────────────────
const acceptRes = await jrpc(`public.accept_tax_fact_change('${pendingRow.id}')`);
ok('T2a accept_tax_fact_change ok', acceptRes.ok === true, JSON.stringify(acceptRes));
ok('T2b התוצאה מכילה change.status=accepted', acceptRes.change?.status === 'accepted');
ok('T2c decided_by/decided_at נרשמו', !!acceptRes.change?.decided_by && !!acceptRes.change?.decided_at);

// הצד הקורא כותב בפועל ל-clients (מדמה את updateClient() בפרונט)
await writeStaging(`update public.clients set donations_annual = 4500 where id='${client}';`);
const afterAccept = await one(`select donations_annual from public.clients where id='${client}';`);
ok('T2d clients מעודכן אחרי אישור', Number(afterAccept.donations_annual) === 4500);

// ─── T8a · אישור כפול נכשל בבירור ───────────────────────────────────────────
const doubleAccept = await jrpc(`public.accept_tax_fact_change('${pendingRow.id}')`);
ok('T8a אישור שני נכשל (כבר לא pending)', doubleAccept.ok === false && doubleAccept.error === 'not_pending_or_not_found');

// ─── T3 · דחייה ─────────────────────────────────────────────────────────────
const proposeRes2 = await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'sess-2', '[
  {"field_key":"hasAcademicDegree","label":"תואר אקדמי",
   "old_value":{"display":"לא"},
   "new_value":{"display":"כן","patch":{"hasAcademicDegree":true}}}
]'::jsonb)`);
const pending2 = await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='hasAcademicDegree' and status='pending';`);
const rejectRes = await jrpc(`public.reject_tax_fact_change('${pending2.id}', 'לא רלוונטי')`);
ok('T3a reject_tax_fact_change ok', rejectRes.ok === true && rejectRes.change?.status === 'rejected', JSON.stringify(rejectRes));

const afterReject = await one(`select has_academic_degree from public.clients where id='${client}';`);
ok('T3b clients לא זז אחרי דחייה', afterReject.has_academic_degree === false || afterReject.has_academic_degree === null);

const rejectedRow = await one(`select status, note from public.tax_fact_changes where id='${pending2.id}';`);
ok('T3c נשמרה כ-rejected (לא נמחקה)', rejectedRow.status === 'rejected' && rejectedRow.note === 'לא רלוונטי');

// ─── T8b · דחייה כפולה נכשלת ────────────────────────────────────────────────
const doubleReject = await jrpc(`public.reject_tax_fact_change('${pending2.id}')`);
ok('T8b דחייה שנייה נכשלת (כבר לא pending)', doubleReject.ok === false);

// ─── T4 · עריכה ידנית ───────────────────────────────────────────────────────
const manualRes = await jrpc(`public.record_manual_fact_change('${client}', 'donationsAnnual', 'תרומות שנתיות',
  '{"display":"4,500 ₪"}'::jsonb, '{"display":"6,000 ₪","patch":{"donationsAnnual":6000}}'::jsonb, null)`);
ok('T4a record_manual_fact_change ok', manualRes.ok === true, JSON.stringify(manualRes));

const manualRow = await one(`select status, source, decided_by from public.tax_fact_changes where id='${manualRes.id}';`);
ok('T4b נכנס ישר כ-accepted', manualRow.status === 'accepted');
ok('T4c source=manual, decided_by נרשם', manualRow.source === 'manual' && !!manualRow.decided_by);

await writeStaging(`update public.clients set donations_annual = 6000, field_meta = jsonb_set(coalesce(field_meta,'{}'::jsonb), '{donationsAnnual}', '{"source":"manual"}'::jsonb) where id='${client}';`);

// ─── T5 · מקור מתחרה אחרי עריכה ידנית — לא דורס ─────────────────────────────
const proposeAfterManual = await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'sess-3', '[
  {"field_key":"donationsAnnual","label":"תרומות שנתיות",
   "old_value":{"display":"6,000 ₪"},
   "new_value":{"display":"2,000 ₪","patch":{"donationsAnnual":2000}}}
]'::jsonb)`);
ok('T5a הצעה מתחרה מתקבלת (לא נחסמת)', proposeAfterManual.ok === true);

const stillManual = await one(`select donations_annual from public.clients where id='${client}';`);
ok('T5b clients עדיין מציג את הערך הידני (6000)', Number(stillManual.donations_annual) === 6000);

const competingPending = await one(`select status, source from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnual' and status='pending';`);
ok('T5c ההצעה החדשה יושבת כ-pending, לא דרסה', !!competingPending && competingPending.source === 'questionnaire');

// ─── T6 · אידמפוטנטיות — הצעה חוזרת מרעננת, לא כופלת ────────────────────────
await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'sess-4', '[
  {"field_key":"donationsAnnual","label":"תרומות שנתיות",
   "old_value":{"display":"6,000 ₪"},
   "new_value":{"display":"2,200 ₪","patch":{"donationsAnnual":2200}}}
]'::jsonb)`);
const pendingCount = await one(`select count(*)::int as n from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnual' and status='pending';`);
ok('T6a עדיין שורה pending אחת בדיוק', pendingCount.n === 1, `נמצאו ${pendingCount.n}`);
const refreshed = await one(`select new_value from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnual' and status='pending';`);
ok('T6b הערך התעדכן לגרסה האחרונה (2200)', refreshed.new_value?.patch?.donationsAnnual === 2200, JSON.stringify(refreshed.new_value));

// ─── T7 · בעלות ─────────────────────────────────────────────────────────────
if (OTHER_USER) {
  const foreignPropose = await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'x', '[]'::jsonb)`, OTHER_USER);
  ok('T7a הצעה על לקוח זר נדחית', foreignPropose.ok === false && foreignPropose.error === 'forbidden', JSON.stringify(foreignPropose));

  const stillPendingId = (await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnual' and status='pending';`)).id;
  const foreignAccept = await jrpc(`public.accept_tax_fact_change('${stillPendingId}')`, OTHER_USER);
  ok('T7b אישור על שורה זרה נדחה', foreignAccept.ok === false && foreignAccept.error === 'not_pending_or_not_found');

  const foreignManual = await jrpc(`public.record_manual_fact_change('${client}', 'x', 'x', null, '{}'::jsonb, null)`, OTHER_USER);
  ok('T7c עריכה ידנית על לקוח זר נדחית', foreignManual.ok === false && foreignManual.error === 'forbidden');
} else {
  console.log('… T7 דולג — לא נמצא משתמש שני בסביבת הבדיקות');
}

// ── ניקוי ────────────────────────────────────────────────────────────────
await writeStaging(`delete from public.clients where id='${client}';`);
const leftovers = await one(`select count(*)::int as n from public.tax_fact_changes where client_id='${client}';`);
ok('ניקוי מלא — cascade מחק את כל ההיסטוריה', leftovers.n === 0);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
