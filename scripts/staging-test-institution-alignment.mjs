#!/usr/bin/env node
/**
 * staging-test-institution-alignment.mjs — שער הרגרסיה של יישור קו מול הרשויות (M2).
 *
 * T1  קליטה חדשה: create_engagement_for_quotation יוצר 3 שלבי מוסד + opening_call נעול, תלוי בשלושתם.
 * T2  לקוח ותיק במשרד: ensure_institution_alignment_steps(client,null,false) — בלי opening_call, בלי engagement.
 * T3  לקוח פעיל: reopen_institution_alignment מאפס לסטטוס pending ושומר תמונת מצב ב-history.
 * T4  התקדמות נכונה: advance_onboarding_step('complete') מעביר סטטוס בפועל.
 * T5  עובדה מקצועית: propose_tax_facts+accept_tax_fact_change כותב שדה M2 מנוהל ל-clients.
 * T6  קונפליקט עם ערך שנערך ידנית: oldValue לא תואם ⇒ stale_conflict, clients לא נדרס.
 * T7  הבהרה מתועדת על שיחת הפתיחה: advance(openingCallId,'note',{clarifications}) ממזג ל-payload.
 * T8  בקשת לקוח טיוטה בלבד: create_onboarding_request עם p_published=false לא מתפרסמת.
 * T9  אחרי פרסום: publish_onboarding_request קובע published_at.
 * T10 הרשאות חיוב מע״מ ומס הכנסה עצמאיות זו מזו — כתיבה לאחת לא נוגעת בשנייה.
 * T11 ריצה מחדש שומרת checkedAt/history — לא מאפסת אותם.
 * T12 בעלות: RPC-ים דוחים משתמש שאינו הבעלים.
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

await writeStaging(`delete from public.clients where last_name = 'IAL-לקוח';`);

const OTHER_USER_ROW = (await writeStaging(
  `select id from auth.users where id <> '${USER_ID}' limit 1;`
))[0];
const OTHER_USER = OTHER_USER_ROW ? OTHER_USER_ROW.id : null;

// ─── T1 · קליטה חדשה — auto-trigger מ-create_engagement_for_quotation ───────
const client1 = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'קליטה', 'IAL-לקוח', 'delivered@resend.dev')
  returning id;`)).id;

const quote1 = (await one(`
  insert into public.quotations (id, user_id, client_id, status, items, snapshot, quotation_number, approved_at)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', '${client1}', 'approved',
    '[]'::jsonb, '{"items":[]}'::jsonb, 'IAL-T1', now())
  returning id;`)).id;

const createRes = await jrpc(`public.create_engagement_for_quotation('${quote1}', false)`);
ok('T1a create_engagement_for_quotation ok', createRes.ok === true, JSON.stringify(createRes));

const instSteps1 = await writeStaging(`
  select step_type, status, stage_id from public.onboarding_steps
   where client_id='${client1}' and step_type like 'institution_alignment_%' order by step_type;`);
ok('T1b שלושת שלבי המוסדות נוצרו', instSteps1.length === 3, `נמצאו ${instSteps1.length}`);
ok('T1c כולם pending ומקובצים תחת אותו stage_id', instSteps1.every(s => s.status === 'pending')
  && new Set(instSteps1.map(s => s.stage_id)).size === 1);

const call1 = await writeStaging(`
  select id, status from public.onboarding_steps where client_id='${client1}' and step_type='opening_call';`);
ok('T1d opening_call נוצר נעול', call1.length === 1 && call1[0].status === 'locked', JSON.stringify(call1));

const deps1 = await writeStaging(`
  select depends_on_step_id from public.onboarding_step_dependencies where step_id='${call1[0]?.id}';`);
ok('T1e opening_call תלוי בשלושת המוסדות (multi-parent)', deps1.length === 3, `נמצאו ${deps1.length}`);

// ─── T2 · לקוח ותיק במשרד — בלי engagement, בלי opening_call ────────────────
const client2 = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'ותיק', 'IAL-לקוח', 'delivered@resend.dev')
  returning id;`)).id;

const ensureRes = await jrpc(`public.ensure_institution_alignment_steps('${client2}', null, false)`);
ok('T2a ensure_institution_alignment_steps ok, created=3', ensureRes.ok === true && ensureRes.created === 3, JSON.stringify(ensureRes));

const eng2 = await writeStaging(`select id from public.engagements where client_id='${client2}';`);
ok('T2b לא נוצרה התקשרות (בלי קליטה מזויפת)', eng2.length === 0, `נמצאו ${eng2.length}`);

const call2 = await writeStaging(`select id from public.onboarding_steps where client_id='${client2}' and step_type='opening_call';`);
ok('T2c אין opening_call ללקוח ותיק', call2.length === 0, `נמצאו ${call2.length}`);

const idempotent = await jrpc(`public.ensure_institution_alignment_steps('${client2}', null, false)`);
ok('T2d אידמפוטנטי — קריאה שנייה לא יוצרת שוב', idempotent.ok === true && idempotent.created === 0, JSON.stringify(idempotent));

// ─── T4 · התקדמות — complete על שלב מוסד ────────────────────────────────────
const btlStep2 = (await writeStaging(`
  select id from public.onboarding_steps where client_id='${client2}' and step_type='institution_alignment_btl';`))[0];
const completeRes = await jrpc(`public.advance_onboarding_step('${btlStep2.id}', 'complete',
  '{"collected":{"niBalance":100},"exceptions":{},"checkedAt":"2026-08-13T10:00:00Z"}'::jsonb)`);
ok('T4a advance complete ok', completeRes.ok === true, JSON.stringify(completeRes));
const afterComplete = (await writeStaging(`select status, payload from public.onboarding_steps where id='${btlStep2.id}';`))[0];
ok('T4b סטטוס completed, checkedAt נשמר', afterComplete.status === 'completed' && afterComplete.payload.checkedAt === '2026-08-13T10:00:00Z');

// ─── T3+T11 · ריצה מחדש — reopen_institution_alignment ──────────────────────
const reopenRes = await jrpc(`public.reopen_institution_alignment('${btlStep2.id}')`);
ok('T3a reopen_institution_alignment ok', reopenRes.ok === true, JSON.stringify(reopenRes));
const afterReopen = (await writeStaging(`select status, payload from public.onboarding_steps where id='${btlStep2.id}';`))[0];
ok('T3b סטטוס חוזר ל-pending', afterReopen.status === 'pending', afterReopen.status);
ok('T11a history נוסף עם checkedAt+collected הקודמים',
  Array.isArray(afterReopen.payload.history) && afterReopen.payload.history.length === 1
  && afterReopen.payload.history[0].checkedAt === '2026-08-13T10:00:00Z'
  && afterReopen.payload.history[0].collected.niBalance === 100,
  JSON.stringify(afterReopen.payload.history));
ok('T11b checkedAt/collected הנוכחיים לא נמחקו (merge שטוח)',
  afterReopen.payload.checkedAt === '2026-08-13T10:00:00Z' && afterReopen.payload.collected.niBalance === 100);

// ─── T5+T6 · עובדה מקצועית דרך M1 — הצעה+אישור, וקונפליקט לא נדרס ──────────
// ‼ בסיס לא-null בכוונה: NULL בפועל מול jsonb 'null' בהצעה הם ערכים שונים
// עבור "is distinct from" — אותה מלכודת קיימת גם מחוץ ל-M2 (ראה 91-tax-fact-transactions.sql).
await writeStaging(`update public.clients set ni_advance_monthly = 1900 where id='${client2}';`);
const proposeRes = await jrpc(`public.propose_tax_facts('${client2}', 'institution_alignment', '${btlStep2.id}', '[
  {"field_key":"niAdvanceMonthly","label":"מקדמה חודשית בביטוח לאומי",
   "old_value":{"display":"1,900 ₪","patch":{"niAdvanceMonthly":1900}},
   "new_value":{"display":"2,150 ₪","patch":{"niAdvanceMonthly":2150}}}
]'::jsonb)`);
const pendingRow5 = await one(`select id from public.tax_fact_changes where client_id='${client2}' and field_key='niAdvanceMonthly' and status='pending';`);
const acceptRes5 = await jrpc(`public.accept_tax_fact_change('${pendingRow5.id}')`);
ok('T5a propose+accept כותב שדה M2 מנוהל', proposeRes.ok === true && acceptRes5.ok === true, JSON.stringify(acceptRes5));
const afterAccept5 = await one(`select ni_advance_monthly from public.clients where id='${client2}';`);
ok('T5b clients מעודכן', Number(afterAccept5.ni_advance_monthly) === 2150, afterAccept5.ni_advance_monthly);

// ‼ עריכה ידנית "מתחרה" — משנה את הערך המקובל אחרי שההצעה הוכנה
await writeStaging(`update public.clients set ni_advance_monthly = 3000 where id='${client2}';`);
const proposeRes6 = await jrpc(`public.propose_tax_facts('${client2}', 'institution_alignment', '${btlStep2.id}', '[
  {"field_key":"niAdvanceMonthly","label":"מקדמה חודשית בביטוח לאומי",
   "old_value":{"display":"2,150 ₪","patch":{"niAdvanceMonthly":2150}},
   "new_value":{"display":"2,200 ₪","patch":{"niAdvanceMonthly":2200}}}
]'::jsonb)`);
const pendingRow6 = await one(`select id from public.tax_fact_changes where client_id='${client2}' and field_key='niAdvanceMonthly' and status='pending';`);
const acceptRes6 = await jrpc(`public.accept_tax_fact_change('${pendingRow6.id}')`);
ok('T6a קונפליקט מזוהה — stale_conflict', acceptRes6.ok === false && acceptRes6.error === 'stale_conflict', JSON.stringify(acceptRes6));
const afterConflict = await one(`select ni_advance_monthly from public.clients where id='${client2}';`);
ok('T6b clients נשאר עם הערך שנערך ידנית — לא נדרס', Number(afterConflict.ni_advance_monthly) === 3000, afterConflict.ni_advance_monthly);

// ─── T10 · מע״מ ומס הכנסה — הרשאות חיוב עצמאיות זו מזו ─────────────────────
await writeStaging(`update public.clients set vat_debit_authorization = null, income_tax_debit_authorization = null where id='${client2}';`);
const proposeVat = await jrpc(`public.propose_tax_facts('${client2}', 'institution_alignment', 'vat-step', '[
  {"field_key":"vatDebitAuthorization","label":"הרשאת חיוב — מע״מ",
   "new_value":{"display":"אין הרשאה","patch":{"vatDebitAuthorization":false}}}
]'::jsonb)`);
const pendingVat = await one(`select id from public.tax_fact_changes where client_id='${client2}' and field_key='vatDebitAuthorization' and status='pending';`);
await jrpc(`public.accept_tax_fact_change('${pendingVat.id}')`);
const afterVat = await one(`select vat_debit_authorization, income_tax_debit_authorization from public.clients where id='${client2}';`);
ok('T10 כתיבה למע״מ לא נוגעת במס הכנסה', afterVat.vat_debit_authorization === false && afterVat.income_tax_debit_authorization === null,
  JSON.stringify(afterVat));

// ─── T8+T9 · טיוטת בקשת לקוח — לא גלויה לפני פרסום, גלויה אחרי ─────────────
const draftRes = await jrpc(`public.create_onboarding_request('${client2}', 'custom_request',
  '{"title":"הקמת הרשאה לחיוב במע״מ","clientTitle":"הקמת הרשאה לחיוב במע״מ",
    "requirements":[{"key":"debit_auth_confirm","kind":"confirm","label":"הקמתי את הרשאת החיוב","done":false}]}'::jsonb,
  null, null, false, false, 'client', null)`);
ok('T8a create_onboarding_request (טיוטה) ok', draftRes.ok === true && !!draftRes.stepId, JSON.stringify(draftRes));
const draftRow = (await writeStaging(`select published_at from public.onboarding_steps where id='${draftRes.stepId}';`))[0];
ok('T8b טיוטה — published_at ריק', draftRow.published_at === null);

const publishRes = await jrpc(`public.publish_onboarding_request('${draftRes.stepId}')`);
ok('T9a publish_onboarding_request ok', publishRes.ok === true, JSON.stringify(publishRes));
const publishedRow = (await writeStaging(`select published_at from public.onboarding_steps where id='${draftRes.stepId}';`))[0];
ok('T9b אחרי פרסום — published_at מלא', !!publishedRow.published_at);

// ─── T7 · הבהרה על שיחת הפתיחה — merge לתוך payload.clarifications ──────────
const call1Row = (await writeStaging(`select id, payload from public.onboarding_steps where id='${call1[0]?.id}';`))[0];
const noteRes = await jrpc(`public.advance_onboarding_step('${call1Row.id}', 'note',
  '{"note":"יישור קו · מע״מ: נקודה לבירור","clarifications":[{"text":"נראה שחסר דיווח מע״מ","institution":"vat","at":"2026-08-13T10:05:00Z"}]}'::jsonb)`);
ok('T7a advance note ok', noteRes.ok === true, JSON.stringify(noteRes));
const afterNote = (await writeStaging(`select payload from public.onboarding_steps where id='${call1Row.id}';`))[0];
ok('T7b clarifications נשמר ב-payload', Array.isArray(afterNote.payload.clarifications) && afterNote.payload.clarifications.length === 1
  && afterNote.payload.clarifications[0].text === 'נראה שחסר דיווח מע״מ', JSON.stringify(afterNote.payload));

// ─── T16+T17 · תיקון נאמנות (94): שני השדות שהיו payload-בלבד עכשיו מנוהלים ──
// ‼ בסיס לא-null בכוונה (ראה הערה למעלה על SQL NULL מול jsonb 'null').
await writeStaging(`update public.clients set ni_income_basis_monthly = 15000, income_tax_reporting_status = null where id='${client2}';`);
const proposeBasis = await jrpc(`public.propose_tax_facts('${client2}', 'institution_alignment', '${btlStep2.id}', '[
  {"field_key":"niIncomeBasisMonthly","label":"בסיס הכנסה למקדמות — ביטוח לאומי",
   "old_value":{"display":"15,000 ₪","patch":{"niIncomeBasisMonthly":15000}},
   "new_value":{"display":"18,000 ₪","patch":{"niIncomeBasisMonthly":18000}}}
]'::jsonb)`);
const pendingBasis = await one(`select id from public.tax_fact_changes where client_id='${client2}' and field_key='niIncomeBasisMonthly' and status='pending';`);
const acceptBasis = await jrpc(`public.accept_tax_fact_change('${pendingBasis.id}')`);
ok('T16a בסיס הכנסה למקדמות (ביטוח לאומי) עובר דרך M1', proposeBasis.ok === true && acceptBasis.ok === true, JSON.stringify(acceptBasis));
const afterBasis = await one(`select ni_income_basis_monthly from public.clients where id='${client2}';`);
ok('T16b clients מעודכן', Number(afterBasis.ni_income_basis_monthly) === 18000, afterBasis.ni_income_basis_monthly);

await writeStaging(`update public.clients set income_tax_reporting_status = 'לא נבדק' where id='${client2}';`);
const proposeReporting = await jrpc(`public.propose_tax_facts('${client2}', 'institution_alignment', '${btlStep2.id}', '[
  {"field_key":"incomeTaxReportingStatus","label":"מצב דיווחים",
   "old_value":{"display":"לא נבדק","patch":{"incomeTaxReportingStatus":"לא נבדק"}},
   "new_value":{"display":"אין דיווחים חסרים","patch":{"incomeTaxReportingStatus":"אין דיווחים חסרים"}}}
]'::jsonb)`);
const pendingReporting = await one(`select id from public.tax_fact_changes where client_id='${client2}' and field_key='incomeTaxReportingStatus' and status='pending';`);
const acceptReporting = await jrpc(`public.accept_tax_fact_change('${pendingReporting.id}')`);
ok('T17a מצב דיווחים (מס הכנסה) עובר דרך M1', proposeReporting.ok === true && acceptReporting.ok === true, JSON.stringify(acceptReporting));
const afterReporting = await one(`select income_tax_reporting_status from public.clients where id='${client2}';`);
ok('T17b clients מעודכן', afterReporting.income_tax_reporting_status === 'אין דיווחים חסרים', afterReporting.income_tax_reporting_status);

// קונפליקט על אחד השדות החדשים — לא נדרס, כמו כל שדה מנוהל אחר (T6 המקורית)
await writeStaging(`update public.clients set income_tax_reporting_status = 'חסר דיווח' where id='${client2}';`);
const proposeReportingStale = await jrpc(`public.propose_tax_facts('${client2}', 'institution_alignment', '${btlStep2.id}', '[
  {"field_key":"incomeTaxReportingStatus","label":"מצב דיווחים",
   "old_value":{"display":"אין דיווחים חסרים","patch":{"incomeTaxReportingStatus":"אין דיווחים חסרים"}},
   "new_value":{"display":"מצב אחר","patch":{"incomeTaxReportingStatus":"מצב אחר"}}}
]'::jsonb)`);
const pendingReportingStale = await one(`select id from public.tax_fact_changes where client_id='${client2}' and field_key='incomeTaxReportingStatus' and status='pending' order by created_at desc limit 1;`);
const acceptReportingStale = await jrpc(`public.accept_tax_fact_change('${pendingReportingStale.id}')`);
ok('T17c קונפליקט מזוהה — stale_conflict', acceptReportingStale.ok === false && acceptReportingStale.error === 'stale_conflict', JSON.stringify(acceptReportingStale));
const afterReportingStale = await one(`select income_tax_reporting_status from public.clients where id='${client2}';`);
ok('T17d clients נשאר עם הערך שנערך ידנית — לא נדרס', afterReportingStale.income_tax_reporting_status === 'חסר דיווח', afterReportingStale.income_tax_reporting_status);

// ─── T12 · בעלות — משתמש אחר נדחה ───────────────────────────────────────────
if (OTHER_USER) {
  const otherEnsure = await jrpc(`public.ensure_institution_alignment_steps('${client2}', null, false)`, OTHER_USER);
  ok('T12a ensure_institution_alignment_steps דוחה משתמש אחר', otherEnsure.ok === false && otherEnsure.error === 'forbidden', JSON.stringify(otherEnsure));
  const otherReopen = await jrpc(`public.reopen_institution_alignment('${btlStep2.id}')`, OTHER_USER);
  ok('T12b reopen_institution_alignment דוחה משתמש אחר', otherReopen.ok === false && otherReopen.error === 'forbidden', JSON.stringify(otherReopen));
} else {
  console.log('… T12 דולג — אין משתמש שני בסביבה');
}

// ─── ניקוי ───────────────────────────────────────────────────────────────────
await writeStaging(`delete from public.clients where last_name = 'IAL-לקוח';`);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail > 0 ? 1 : 0);
