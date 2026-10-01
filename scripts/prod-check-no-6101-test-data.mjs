#!/usr/bin/env node
/**
 * prod-check-no-6101-test-data.mjs — אין בפרודקשן שום נתון של לקוחות הבדיקה של 6101 / «מה ב"ל רושם».
 *
 *   node scripts/prod-check-no-6101-test-data.mjs                 ← לפני פריסה: הטבלאות אסור שיהיו
 *   node scripts/prod-check-no-6101-test-data.mjs --after-deploy  ← אחרי: חייבות להיות, בלי שורות בדיקה
 *
 * ‼ קריאה בלבד (readProd, SELECT בלבד). מדפיס ספירות — לא ערכים אישיים.
 * מה נבדק: טבלאות ופונקציות 206/207/209 (לפני פריסה — אסור שיהיו), לקוחות הבדיקה
 * (qa6101-*, sf6101-*, fx-6101-*), מסמכים/בקשות/משימות/משימות אוטומציה/מיילים/קבצים
 * באחסון שלהם, המשתמש הזמני של בדיקת הבידוד, והזהויות הסינתטיות שבקוד (fixtures.ts).
 */
import { readProd, PROD_REF } from './staging-lib.mjs';

const AFTER = process.argv.includes('--after-deploy');
let bad = 0;
const row = async (label, query, expectZero = true) => {
  const r = await readProd(query);
  const n = Number(Object.values(r?.[0] ?? { n: 0 })[0] ?? 0);
  const okv = expectZero ? n === 0 : n > 0;
  if (!okv) bad++;
  console.log(`${okv ? '✓' : '✗'} ${label}: ${n}`);
  return n;
};
const exists = async (rel) => (await readProd(`select to_regclass('public.${rel}') is not null as e`))[0].e;

console.log(`פרודקשן ${PROD_REF} · קריאה בלבד\n`);

// ── סכימה: לפני פריסה — 206/207/209 עוד לא הוחלו; אחרי — הטבלאות קיימות ואין בהן שורות בדיקה ──
const TABLES = ['smart_form_filings', 'smart_form_revisions', 'smart_form_events', 'btl_portal_facts', 'btl_portal_documents'];
for (const t of TABLES) {
  const e = await exists(t);
  if (e !== AFTER) bad++;
  console.log(`${e === AFTER ? '✓' : '✗'} טבלה ${t} ${e ? 'קיימת' : 'לא קיימת'}`);
}
if (AFTER) {
  await row('הגשות 6101 של לקוחות בדיקה / עשן', `select count(*) from public.smart_form_filings where client_id like 'qa6101%' or client_id like 'sf6101-%' or client_id like 'smoke6101-%'`);
  await row('רשומות «מה ב"ל רושם» של לקוחות בדיקה', `select count(*) from public.btl_portal_facts where client_id like 'qa6101%' or client_id like 'sf6101-%' or client_id like 'smoke6101-%'`);
  await row('לקוחות עשן (smoke6101-*) שנשארו', `select count(*) from public.clients where id like 'smoke6101-%'`);
  const total = await readProd(`select (select count(*) from public.smart_form_filings)::int f, (select count(*) from public.btl_portal_facts)::int b`);
  console.log(`ℹ סה"כ בטבלאות החדשות: הגשות 6101 ${total[0].f} · עובדות ב"ל ${total[0].b} (אמיתיות בלבד)`);
}
if (!AFTER) await row('פונקציות smart_form_* / _btl_portal_* / get_btl_portal_record',
  `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and (p.proname like 'smart_form%' or p.proname like '_smart_form%' or p.proname like '_btl_portal%' or p.proname = 'get_btl_portal_record'
          or p.proname like 'submit_smart_form%' or p.proname like 'get_smart_form%')`);

// ── לקוחות הבדיקה ושובליהם ──
const TEST_IDS = `(c.id like 'qa6101%' or c.id like 'sf6101-%' or c.id like 'fx-6101%')`;
await row('לקוחות בדיקה (qa6101-*, sf6101-*, fx-6101-*)', `select count(*) from public.clients c where ${TEST_IDS}`);
await row('לקוחות ששמם מסומן «בדיקת 6101» / «בדיקת 207»',
  `select count(*) from public.clients where last_name like '%בדיקת 6101%' or last_name like '%בדיקת 207%' or last_name like '%שש-אפס-אחת%'`);
await row('מסמכים של לקוחות הבדיקה או 6101 חתום (sf6101-*)',
  `select count(*) from public.documents where client_id like 'qa6101%' or client_id like 'sf6101-%' or id like 'sf6101-%'`);
await row('בקשות (onboarding_steps) של לקוחות הבדיקה או עם טופס חכם',
  `select count(*) from public.onboarding_steps where client_id like 'qa6101%' or client_id like 'sf6101-%' or payload ? 'smartForm'`);
if (await exists('tasks')) await row('משימות של לקוחות הבדיקה', `select count(*) from public.tasks where client_id like 'qa6101%' or client_id like 'sf6101-%'`);
if (await exists('automation_jobs')) await row('משימות אוטומציה של לקוחות הבדיקה', `select count(*) from public.automation_jobs where client_id like 'qa6101%' or client_id like 'sf6101-%'`);
if (await exists('email_messages')) await row('מיילים של לקוחות הבדיקה', `select count(*) from public.email_messages where client_id like 'qa6101%' or client_id like 'sf6101-%'`);
await row('קבצים באחסון עם sf6101 / qa6101 בנתיב',
  `select count(*) from storage.objects where name like '%sf6101%' or name like '%qa6101%'`);

// ── משתמשים זמניים של בדיקת הבידוד ──
await row('משתמשים מורשים זמניים (sf6101-other-*@pivo.test)', `select count(*) from public.authorized_users where email like 'sf6101-%'`);
await row('חשבונות התחברות זמניים (sf6101-*@pivo.test)', `select count(*) from auth.users where email like 'sf6101-%'`);

// ── הזהויות הסינתטיות שבקוד (fixtures.ts) ──
await row('כתובות המייל הסינתטיות של הבדיקות',
  `select count(*) from public.clients where email in ('noa.almog-83@mail.example.co.il', 'qa-6101@example.test', 'avi@example') or email like 'delivered+btlrec%'`);

console.log(bad ? `\n✗ ${bad} ממצאים` : '\n✓ אין בפרודקשן שום נתון של בדיקות 6101');
process.exitCode = bad ? 1 : 0;
