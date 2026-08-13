#!/usr/bin/env node
/**
 * staging-test-tax-fact-atomicity.mjs — שער הרגרסיה של המהלך המתקן (91).
 *
 * A1  אישור כותב clients+status יחד, בקריאת RPC אחת (בלי עדכון clients נפרד
 *     מהצד הקורא — הבדיקה עצמה לא כותבת ל-clients בין ה-propose ל-accept).
 * A2  כשל מאולץ (מפתח שדה לא מוכר בתוך אותה הצעה) לא משאיר כתיבה חלקית:
 *     לא ב-clients, לא בסטטוס — הכל נשאר בדיוק כמו לפני הקריאה.
 * A3  עריכה ידנית: אותה קריאה כותבת clients+field_meta+היסטוריה יחד.
 * A4  כשל מאולץ בעריכה ידנית לא משאיר כתיבה חלקית וגם לא שורת היסטוריה.
 * A5  הצעה "מיושנת" (old_value.patch לא תואם את הערך המקובל הנוכחי — כי מישהו
 *     שינה אותו בינתיים) נדחית כ-stale_conflict ולא דורסת את הערך העדכני.
 * A6  דחייה לא נוגעת בכלל ב-clients.
 * A7  התנגשות שאלון אחרי עריכה ידנית: ההצעה המתחרה נשארת pending, ואם
 *     מנסים לאשר אותה (מבלי לרענן) היא נדחית כ-stale — לא נדרסת בשקט.
 * A8  allowlist: כל 32 המפתחות הנתמכים מתקבלים; מפתח לא ברשימה נדחה.
 * A9  בעלות אמיתית מול משתמש שני (auth.users חדש, לצורך הבדיקה בלבד):
 *     לא ניתן לקרוא/להציע/לאשר/לדחות/לערוך ידנית על לקוח של המשתמש האחר.
 *
 * ‼ הכול על לקוח דמה בסביבת הבדיקות בלבד; משתמש הבדיקה השני והלקוח שלו
 * נמחקים בסוף הריצה, בהצלחה או בכישלון.
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
// ‼ writeStaging מתחבר כ-postgres (BYPASSRLS=true) — set_config לבדו לא מספיק
// כדי לבדוק RLS בפועל, כי התפקיד עצמו עוקף אותה בלי קשר ל-JWT. כדי לבדוק
// RLS אמיתי צריך גם SET ROLE authenticated (בדיוק כמו PostgREST בפרודקשן).
// כל קריאה ל-writeStaging היא חיבור טרי משלה, ולכן אין צורך ב-RESET בסוף —
// והשאילתה עצמה חייבת להישאר ההוראה האחרונה (writeStaging מחזירה רק את
// תוצאת ההוראה האחרונה בקבוצה).
const asUser = async (uid, sql) => writeStaging(`${AS_USER(uid)} set role authenticated; ${sql}`);

console.log(`סביבה: ${STAGING_REF}\n`);

// ── ניקוי משאריות ריצה קודמת ────────────────────────────────────────────────
await writeStaging(`delete from public.clients where last_name in ('TFA-לקוח', 'TFA-לקוח-זר');`);
await writeStaging(`delete from auth.users where email = 'tfa-second-user@test.local';`);

const client = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, donations_annual, has_academic_degree)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'אטומיות', 'TFA-לקוח', 'delivered@resend.dev', 1000, false)
  returning id;`)).id;

// ─── A1 · אישור כותב clients+status יחד, בקריאה אחת ─────────────────────────
await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'a1', '[
  {"field_key":"donationsAnnual","label":"תרומות שנתיות",
   "old_value":{"display":"1,000 ₪","patch":{"donationsAnnual":1000}},
   "new_value":{"display":"4,500 ₪","patch":{"donationsAnnual":4500}}}
]'::jsonb)`);
const a1Pending = await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnual' and status='pending';`);
const a1Accept = await jrpc(`public.accept_tax_fact_change('${a1Pending.id}')`);
ok('A1a accept ok', a1Accept.ok === true, JSON.stringify(a1Accept));
ok('A1b clients נכתב בתוך אותה קריאה (בלי UPDATE נפרד מהבדיקה)', Number(a1Accept.client?.donations_annual) === 4500, JSON.stringify(a1Accept.client?.donations_annual));
const a1Row = await one(`select donations_annual, field_meta->'donationsAnnual'->>'source' as src from public.clients where id='${client}';`);
ok('A1c clients בפועל = 4500', Number(a1Row.donations_annual) === 4500);
ok('A1d field_meta עודכן עם המקור הנכון', a1Row.src === 'questionnaire', a1Row.src);
const a1Change = await one(`select status, decided_by, decided_at from public.tax_fact_changes where id='${a1Pending.id}';`);
ok('A1e status=accepted עם decided_by/at', a1Change.status === 'accepted' && !!a1Change.decided_by && !!a1Change.decided_at);

// ─── A2 · כשל מאולץ באישור לא משאיר כתיבה חלקית ─────────────────────────────
await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'a2', '[
  {"field_key":"forcedFailureTest","label":"בדיקת כשל מאולץ",
   "old_value":{"display":"—"},
   "new_value":{"display":"—","patch":{"donationsAnnual":9999,"notARealClientField":"x"}}}
]'::jsonb)`);
const a2Pending = await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='forcedFailureTest' and status='pending';`);
const beforeA2 = await one(`select donations_annual from public.clients where id='${client}';`);
const a2Accept = await jrpc(`public.accept_tax_fact_change('${a2Pending.id}')`);
ok('A2a accept נכשל בבירור', a2Accept.ok === false, JSON.stringify(a2Accept));
const afterA2 = await one(`select donations_annual from public.clients where id='${client}';`);
ok('A2b clients.donationsAnnual לא זז (המפתח התקין באותה הצעה התגלגל אחורה)', Number(afterA2.donations_annual) === Number(beforeA2.donations_annual), `${beforeA2.donations_annual} → ${afterA2.donations_annual}`);
const a2Row = await one(`select status from public.tax_fact_changes where id='${a2Pending.id}';`);
ok('A2c ההצעה נשארה pending (לא accepted חלקי)', a2Row.status === 'pending');

// ─── A3 · עריכה ידנית כותבת הכל יחד ─────────────────────────────────────────
const a3Manual = await jrpc(`public.record_manual_fact_change('${client}', 'donationsAnnual', 'תרומות שנתיות',
  '{"display":"4,500 ₪"}'::jsonb, '{"display":"6,000 ₪","patch":{"donationsAnnual":6000}}'::jsonb, null)`);
ok('A3a manual edit ok', a3Manual.ok === true, JSON.stringify(a3Manual));
ok('A3b clients נכתב בתוך אותה קריאה', Number(a3Manual.client?.donations_annual) === 6000);
const a3Hist = await one(`select status, source from public.tax_fact_changes where id='${a3Manual.id}';`);
ok('A3c שורת היסטוריה accepted/manual נוצרה', a3Hist.status === 'accepted' && a3Hist.source === 'manual');

// ─── A4 · כשל מאולץ בעריכה ידנית ─────────────────────────────────────────────
const beforeA4 = await one(`select donations_annual from public.clients where id='${client}';`);
const histCountBefore = (await one(`select count(*)::int as n from public.tax_fact_changes where client_id='${client}';`)).n;
const a4Manual = await jrpc(`public.record_manual_fact_change('${client}', 'x', 'x',
  null, '{"display":"x","patch":{"donationsAnnual":123456,"notARealClientField":"x"}}'::jsonb, null)`);
ok('A4a manual edit עם מפתח לא מוכר נכשל', a4Manual.ok === false, JSON.stringify(a4Manual));
const afterA4 = await one(`select donations_annual from public.clients where id='${client}';`);
ok('A4b clients לא זז', Number(afterA4.donations_annual) === Number(beforeA4.donations_annual));
const histCountAfter = (await one(`select count(*)::int as n from public.tax_fact_changes where client_id='${client}';`)).n;
ok('A4c לא נוספה שורת היסטוריה (ה-INSERT התגלגל אחורה)', histCountAfter === histCountBefore, `${histCountBefore} → ${histCountAfter}`);

// ─── A5 · הצעה מיושנת נדחית — לא דורסת ערך עדכני יותר ───────────────────────
// יוצרים הצעה עם תמונת מצב ישנה (donationsAnnual=1000), בזמן שהערך המקובל
// כבר 6000 (מ-A3) — מדמה הצעה שנוצרה *לפני* עריכה ידנית שקרתה בינתיים.
await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'a5', '[
  {"field_key":"donationsAnnualStale","label":"תרומות שנתיות (מיושן)",
   "old_value":{"display":"1,000 ₪","patch":{"donationsAnnual":1000}},
   "new_value":{"display":"2,000 ₪","patch":{"donationsAnnual":2000}}}
]'::jsonb)`);
const a5Pending = await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnualStale' and status='pending';`);
const a5Accept = await jrpc(`public.accept_tax_fact_change('${a5Pending.id}')`);
ok('A5a accept נדחה כ-stale_conflict', a5Accept.ok === false && a5Accept.error === 'stale_conflict', JSON.stringify(a5Accept));
ok('A5b staleFields כולל donationsAnnual', Array.isArray(a5Accept.staleFields) && a5Accept.staleFields.includes('donationsAnnual'), JSON.stringify(a5Accept.staleFields));
const afterA5 = await one(`select donations_annual from public.clients where id='${client}';`);
ok('A5c clients עדיין 6000 — לא נדרס בערך המיושן', Number(afterA5.donations_annual) === 6000);
const a5Row = await one(`select status from public.tax_fact_changes where id='${a5Pending.id}';`);
ok('A5d ההצעה המיושנת נשארה pending לבדיקה חוזרת', a5Row.status === 'pending');

// ─── A6 · דחייה לא נוגעת ב-clients ───────────────────────────────────────────
const beforeA6 = await one(`select donations_annual from public.clients where id='${client}';`);
const a6Reject = await jrpc(`public.reject_tax_fact_change('${a5Pending.id}', 'מיושן — נבדק שוב ידנית')`);
ok('A6a reject ok', a6Reject.ok === true && a6Reject.change?.status === 'rejected');
const afterA6 = await one(`select donations_annual from public.clients where id='${client}';`);
ok('A6b clients לא זז', Number(afterA6.donations_annual) === Number(beforeA6.donations_annual));

// ─── A7 · שם: כבר מכוסה ב-A5 (התנגשות שאלון אחרי עריכה ידנית = בדיוק אותו
// תרחיש) — כאן רק מוודאים שההצעה שנדחתה כ-stale לא "נעלמה" אלא נשארת בת-החלטה.
const a7Row = await one(`select status, note from public.tax_fact_changes where id='${a5Pending.id}';`);
ok('A7 ההצעה המיושנת מסומנת כהחלטה (rejected) ולא נמחקה', a7Row.status === 'rejected' && a7Row.note?.includes('מיושן'));

// ─── A8 · allowlist — כל השדות הנתמכים מתקבלים, מפתח לא מוכר נדחה ───────────
const GOVERNED = [
  ['familyStatus', '"single"'], ['isNewImmigrant', 'true'], ['aliyahYear', '2015'],
  ['isReturningResident', 'false'], ['disabilityPercentage', '0'],
  ['hasAcademicDegree', 'true'], ['academicDegreeYear', '2010'],
  ['completedIdf', 'true'], ['idfReleaseYear', '2005'],
  ['completedNationalService', 'false'], ['nationalServiceYear', '0'],
  ['donationsAnnual', '500'], ['lifeInsuranceAnnual', '0'], ['hasLifeInsurance', 'false'],
  ['isFamilyCompanyMember', 'false'], ['isForeignControllingShareholder', 'false'],
  ['isKibbutzMember', 'false'], ['isSubstantialShareholder', 'false'],
  ['hasResidentialProperty', 'false'], ['numberOfProperties', '0'],
  ['hasCapitalIncome', 'false'], ['hasGamblingIncome', 'false'], ['hasForeignAssets', 'false'],
  ['spouseWorking', 'false'], ['rentalTaxTrack', '"exempt"'], ['hasInvestments', 'false'],
  ['hasPension', 'false'], ['taxFiles', '[]'], ['bankAccounts', '[]'],
  ['investmentAccounts', '[]'], ['children', '[]'], ['employers', '[]'], ['pensionFunds', '[]'],
];
let allowlistOk = true;
for (const [key, val] of GOVERNED) {
  const r = await jrpc(`public.record_manual_fact_change('${client}', '${key}', '${key}', null, '{"display":"x","patch":{"${key}":${val}}}'::jsonb, null)`);
  if (!r.ok) { allowlistOk = false; console.log(`   ✗ מפתח נדחה בטעות: ${key} — ${r.error}`); }
}
ok(`A8a כל ${GOVERNED.length} השדות הנתמכים התקבלו`, allowlistOk);

const badKey = await jrpc(`public.record_manual_fact_change('${client}', 'bad', 'bad', null, '{"display":"x","patch":{"totallyUnknownField":1}}'::jsonb, null)`);
ok('A8b מפתח לא ברשימה נדחה (fail-closed)', badKey.ok === false, JSON.stringify(badKey));

// ─── A9 · בעלות אמיתית מול משתמש שני ────────────────────────────────────────
const secondUser = (await one(`
  insert into auth.users (id, aud, role, email, is_sso_user, is_anonymous)
  values (gen_random_uuid(), 'authenticated', 'authenticated', 'tfa-second-user@test.local', false, false)
  returning id;`)).id;
const otherClient = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${secondUser}', 'זר', 'TFA-לקוח-זר', 'delivered@resend.dev')
  returning id;`)).id;

// א. לא ניתן להציע על לקוח של מישהו אחר
const foreignPropose = await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'x', '[]'::jsonb)`, secondUser);
ok('A9a הצעה על לקוח זר נדחית', foreignPropose.ok === false && foreignPropose.error === 'forbidden', JSON.stringify(foreignPropose));

// ב. לא ניתן לאשר/לדחות הצעה ממתינה של המשתמש הראשון
await jrpc(`public.propose_tax_facts('${client}', 'questionnaire', 'a9', '[
  {"field_key":"donationsAnnual","label":"x","old_value":{"display":"x"},"new_value":{"display":"x","patch":{"donationsAnnual":1}}}
]'::jsonb)`);
const a9Pending = await one(`select id from public.tax_fact_changes where client_id='${client}' and field_key='donationsAnnual' and status='pending';`);
const foreignAccept = await jrpc(`public.accept_tax_fact_change('${a9Pending.id}')`, secondUser);
ok('A9b אישור הצעה זרה נדחה', foreignAccept.ok === false && foreignAccept.error === 'not_pending_or_not_found');
const foreignReject = await jrpc(`public.reject_tax_fact_change('${a9Pending.id}')`, secondUser);
ok('A9c דחיית הצעה זרה נדחית', foreignReject.ok === false && foreignReject.error === 'not_pending_or_not_found');
const a9StillPending = await one(`select status from public.tax_fact_changes where id='${a9Pending.id}';`);
ok('A9d ההצעה הזרה-בניסיון עדיין pending בפועל (לא הושפעה)', a9StillPending.status === 'pending');

// ג. לא ניתן לבצע עריכה ידנית על לקוח של מישהו אחר
const foreignManual = await jrpc(`public.record_manual_fact_change('${client}', 'donationsAnnual', 'x', null, '{"display":"x","patch":{"donationsAnnual":1}}'::jsonb, null)`, secondUser);
ok('A9e עריכה ידנית על לקוח זר נדחית', foreignManual.ok === false && foreignManual.error === 'forbidden');

// ד. לא ניתן לקרוא (RLS) tax_fact_changes/clients של המשתמש הראשון
const foreignRead = await asUser(secondUser, `select count(*)::int as n from public.tax_fact_changes where client_id='${client}';`);
ok('A9f RLS: לא רואה שורות tax_fact_changes של המשתמש הראשון', foreignRead[0].n === 0, JSON.stringify(foreignRead));
const foreignClientRead = await asUser(secondUser, `select count(*)::int as n from public.clients where id='${client}';`);
ok('A9g RLS: לא רואה את הלקוח של המשתמש הראשון', foreignClientRead[0].n === 0, JSON.stringify(foreignClientRead));

// ה. ולבדוק שהבעלים האמיתי כן מצליח על ההצעה הזו — מוודא שהדחיות למעלה הן
// אכיפת בעלות אמיתית ולא תקלה כללית בפונקציה.
const realAccept = await jrpc(`public.accept_tax_fact_change('${a9Pending.id}')`);
ok('A9h הבעלים האמיתי כן מצליח לאשר את אותה הצעה', realAccept.ok === true, JSON.stringify(realAccept));

// ── ניקוי ────────────────────────────────────────────────────────────────
await writeStaging(`delete from public.clients where id in ('${client}', '${otherClient}');`);
await writeStaging(`delete from auth.users where id = '${secondUser}';`);
const leftovers = await one(`select count(*)::int as n from public.tax_fact_changes where client_id in ('${client}', '${otherClient}');`);
ok('ניקוי מלא — cascade מחק את כל ההיסטוריה, כולל המשתמש השני', leftovers.n === 0);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
