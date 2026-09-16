#!/usr/bin/env node
/**
 * staging-test-representation-reminders-cas.mjs — שער הרגרסיה של 186/188/189:
 * התביעה האטומית של תזכורות הייצוג, והפעלה דרך אותו נתיב שה-cron האמיתי משתמש בו.
 *
 * ‼ מה המבחן הזה שומר שלא יחזור (188):
 *
 *  claim_representation_reminder / release_representation_reminder_claim כתבו
 *  execution = jsonb_set(coalesce(execution,'{}'), array['reminders', p_audience], ...).
 *  jsonb_set יוצר רק את המפתח האחרון בנתיב — כשexecution.reminders עצמו עוד לא
 *  קיים (המצב של כל שורה, כי 'reminders' הוא מפתח חדש), הקריאה מחזירה את
 *  האובייקט המקורי בלי שינוי, בשקט, בלי שגיאה. ה-WHERE עדיין תפס
 *  (coalesce(...,0) = p_expected_count) ולכן הפונקציה דיווחה claimed=true —
 *  אבל שום דבר לא נכתב. המשמעות: הטענה האטומית לא הגנה על כלום בפעם הראשונה
 *  שתזכורת נשלחת לבקשה נתונה, ותקרת maxReminders לא נאכפת לעולם. נמצא ידנית
 *  ב-staging ב-2026-09-16: claim על שורה טרייה החזיר true פעמיים ברציפות.
 *  186 תוקן ב-188 (מיזוג || במקום jsonb_set מקונן). המבחן הזה מדמה בדיוק את
 *  התרחיש: שורה טרייה, שני claim עם אותו expected_count, ובודק שהשני נדחה
 *  וש-execution באמת השתנה אחרי הראשון.
 *
 *  189 גם הוסיפה מסלול x-cron-secret (כמו quotation-reminders) —
 *  representation-reminders נפרסה (186) עם אימות Bearer service_role בלבד,
 *  בלי מסלול שני שה-cron האמיתי בפועל צריך (ראה docs/EMAIL-POLICY.md §5).
 *  בלעדיו אין דרך שמשימה מתוזמנת אמיתית תפעיל את הפונקציה בכלל.
 *
 * הרצה:  node scripts/staging-test-representation-reminders-cas.mjs
 * דורש: מיגרציות 186/188/189 על staging, ופונקציית representation-reminders
 *       פרוסה שם (עם x-cron-secret נתמך).
 * לא דורש seed-staging.
 */
import { randomBytes } from 'node:crypto';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN = (name) => `${env.VITE_SUPABASE_URL}/functions/v1/${name}`;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

console.log(`סביבה: ${STAGING_REF}\n`);

const RQ_A = 'rrcas-req-' + randomBytes(6).toString('hex');
const RQ_RACE = 'rrcas-race-' + randomBytes(6).toString('hex');
const RQ_SIGNDUE = 'rrcas-signdue-' + randomBytes(6).toString('hex');
const RQ_SIGNCAP = 'rrcas-signcap-' + randomBytes(6).toString('hex');
const RQ_NIDUE = 'rrcas-nidue-' + randomBytes(6).toString('hex');
const RQ_NISTOP = 'rrcas-nistop-' + randomBytes(6).toString('hex');
const CLIENT_A = 'rrcas-client-' + randomBytes(6).toString('hex');
const STEP_A = randomBytes(16).toString('hex'); // email_messages.step_id הוא uuid — חייב פורמט הקס תקין

async function cleanup() {
  await writeStaging(`
    delete from public.email_messages where request_id in (${q(RQ_A)},${q(RQ_RACE)},${q(RQ_SIGNDUE)},${q(RQ_SIGNCAP)},${q(RQ_NIDUE)},${q(RQ_NISTOP)})
      or step_id = ${q(STEP_A)};
    delete from public.onboarding_steps where id = ${q(STEP_A)};
    delete from public.representation_requests where id in (${q(RQ_A)},${q(RQ_RACE)},${q(RQ_SIGNDUE)},${q(RQ_SIGNCAP)},${q(RQ_NIDUE)},${q(RQ_NISTOP)});
    delete from public.clients where id = ${q(CLIENT_A)};
    update public.profiles set settings = settings #- '{representation,reminders}' where id = '${USER_ID}';`);
}
await cleanup();

try {
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, email, spouse_email, portal_token)
    values (${q(CLIENT_A)}, '${USER_ID}', 'תביעה', 'RRCAS', 'delivered+rrcas@resend.dev', 'delivered+rrcasspouse@resend.dev', ${q('tok-' + randomBytes(8).toString('hex'))});
    insert into public.representation_requests (id, user_id, status, client_email, execution, created_at, updated_at, onboarding_token)
    values (${q(RQ_A)}, '${USER_ID}', 'pending_signature', 'delivered+rrcas@resend.dev', '{}'::jsonb, now(), now(), ${q('onb-' + randomBytes(8).toString('hex'))});`);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('— A · claim על שורה טרייה: הפעם הראשונה חייבת להיכתב בפועל (188) —');
  {
    const c1 = (await one(`select public.claim_representation_reminder(${q(RQ_A)}, 'sign', 0) as r;`)).r;
    ok('A1 claim ראשון על שורה טרייה מצליח', c1 === true, String(c1));
    const s1 = await one(`select execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_A)};`);
    ok('A2 ‼ execution.reminders.sign באמת נכתב (לא נשאר ריק)', s1.sign?.count === 1 && !!s1.sign?.lastSentAt, JSON.stringify(s1));

    const c2 = (await one(`select public.claim_representation_reminder(${q(RQ_A)}, 'sign', 0) as r;`)).r;
    ok('A3 claim שני עם אותו expected_count (0) נדחה — לא כפילות', c2 === false, String(c2));
    const s2 = await one(`select execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_A)};`);
    ok('A4 המונה לא זז מ-claim שנדחה', s2.sign?.count === 1 && s2.sign?.lastSentAt === s1.sign?.lastSentAt, JSON.stringify(s2));

    const c3 = (await one(`select public.claim_representation_reminder(${q(RQ_A)}, 'sign', 1) as r;`)).r;
    ok('A5 claim לגיטימי הבא (expected_count=1) מצליח', c3 === true, String(c3));
    const s3 = await one(`select execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_A)};`);
    ok('A6 המונה התקדם ל-2', s3.sign?.count === 2, JSON.stringify(s3));

    await writeStaging(`select public.release_representation_reminder_claim(${q(RQ_A)}, 'sign', 2, ${q(s1.sign.lastSentAt)}::timestamptz);`);
    const s4 = await one(`select execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_A)};`);
    ok('A7 שחרור-בכשלון מחזיר את המונה ואת lastSentAt הקודם', s4.sign?.count === 1 && s4.sign?.lastSentAt === s1.sign?.lastSentAt, JSON.stringify(s4));

    await writeStaging(`select public.release_representation_reminder_claim(${q(RQ_A)}, 'sign', 1, null);`);
    const s5 = await one(`select execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_A)};`);
    ok('A8 שחרור ל"לא נשלח מעולם" לא כותב null מילולי (jsonb_strip_nulls)', s5.sign?.count === 0 && !('lastSentAt' in (s5.sign || {})), JSON.stringify(s5));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— B · אותו תיקון על niClient/niSpouse ועל הכרטיס בדף האישי —');
  {
    const cNi = (await one(`select public.claim_representation_reminder(${q(RQ_A)}, 'niClient', 0) as r;`)).r;
    const sNi = await one(`select execution->'reminders'->'niClient' as ni, execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_A)};`);
    ok('B1 claim על niClient נכתב בפועל, ושומר על sign הקיים לצדו', cNi === true && sNi.ni?.count === 1 && sNi.sign?.count === 0, JSON.stringify(sNi));

    await writeStaging(`
      insert into public.onboarding_steps (id, user_id, client_id, step_type, track, scope, status, ball, completion_method, payload, created_at, updated_at, published_at)
      values (${q(STEP_A)}, '${USER_ID}', ${q(CLIENT_A)}, 'rep_client_approval', 'authorities', 'person', 'pending', 'client', 'manual', '{}'::jsonb, now(), now(), now());`);
    const cP1 = (await one(`select public.claim_representation_portal_reminder(${q(STEP_A)}, 0) as r;`)).r;
    const pS1 = await one(`select payload->'reminder' as rem from public.onboarding_steps where id = ${q(STEP_A)};`);
    ok('B2 claim על הכרטיס בדף האישי נכתב (נתיב חד-רמתי — לא נפגע מהבאג)', cP1 === true && pS1.rem?.count === 1, JSON.stringify(pS1));
    const cP2 = (await one(`select public.claim_representation_portal_reminder(${q(STEP_A)}, 0) as r;`)).r;
    ok('B3 claim שני עם אותו expected_count על הכרטיס נדחה', cP2 === false, String(cP2));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— C · שתי תביעות במקביל על אותה שורה — אחת בלבד מצליחה —');
  {
    await writeStaging(`
      insert into public.representation_requests (id, user_id, status, client_email, execution, created_at, updated_at, onboarding_token)
      values (${q(RQ_RACE)}, '${USER_ID}', 'pending_signature', 'delivered+rrcasrace@resend.dev', '{}'::jsonb, now(), now(), ${q('onb-' + randomBytes(8).toString('hex'))});`);
    const [r1, r2] = await Promise.all([
      writeStaging(`select public.claim_representation_reminder(${q(RQ_RACE)}, 'sign', 0) as r;`),
      writeStaging(`select public.claim_representation_reminder(${q(RQ_RACE)}, 'sign', 0) as r;`),
    ]);
    const results = [r1[0].r, r2[0].r].sort();
    ok('C1 בדיוק תביעה אחת מתוך שתיים מקבילות הצליחה', JSON.stringify(results) === JSON.stringify([false, true]), JSON.stringify(results));
    const sr = await one(`select execution->'reminders'->'sign' as sign from public.representation_requests where id = ${q(RQ_RACE)};`);
    ok('C2 המונה בפועל = 1, לא 2 — אין הכפלה', sr.sign?.count === 1, JSON.stringify(sr));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— D · הפונקציה הפרוסה דרך x-cron-secret — בדיוק כמו שה-cron יפעיל אותה (189) —');
  {
    const cronSecret = (await one(`select decrypted_secret as s from vault.decrypted_secrets
                                   where name = 'representation_reminder_cron_secret' limit 1;`))?.s;
    ok('D0 סוד ה-cron הייעודי קיים ב-Vault', !!cronSecret);

    const unauth = await fetch(FN('representation-reminders'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok('D1 בלי סוד/מפתח — 401', unauth.status === 401, String(unauth.status));
    const wrong = await fetch(FN('representation-reminders'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': 'wrong' }, body: '{}' });
    ok('D2 סוד שגוי — 401', wrong.status === 401, String(wrong.status));

    // ברירות מחדל: תזכורות כבויות. שורה זכאית-לכאורה חייבת להידחות כ"כבוי" ולא להישלח.
    await writeStaging(`
      insert into public.representation_requests (id, user_id, status, client_email, execution, created_at, updated_at, onboarding_token)
      values (${q(RQ_SIGNDUE)}, '${USER_ID}', 'pending_signature', 'delivered+rrcassigndue@resend.dev', '{}'::jsonb, now() - interval '10 days', now() - interval '10 days', ${q('onb-' + randomBytes(8).toString('hex'))});`);
    const runOff = await fetch(FN('representation-reminders'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret }, body: JSON.stringify({ dryRun: true }) });
    const bodyOff = await runOff.json().catch(() => ({}));
    const rowIds = (bodyOff.results?.sign || []).map((r) => r.id);
    ok('D3 תזכורות כבויות כברירת מחדל — לא נשלח כלום לשורה שלנו', runOff.status === 200 && !rowIds.includes(RQ_SIGNDUE), `${runOff.status} ${JSON.stringify(bodyOff).slice(0, 200)}`);

    // מדליקים תזכורות ובודקים את המסלול המלא: זכאי נשלח, תקרה נחסמת, "הושלם" מדולג.
    await writeStaging(`
      update public.profiles set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object(
        'representation', coalesce(settings->'representation','{}'::jsonb) || jsonb_build_object(
          'reminders', jsonb_build_object(
            'sign', jsonb_build_object('enabled', true, 'afterDays', 7, 'maxReminders', 2),
            'niClient', jsonb_build_object('enabled', true, 'afterDays', 7, 'maxReminders', 2))))
      where id = '${USER_ID}';
      insert into public.representation_requests (id, user_id, status, client_email, execution, created_at, updated_at, onboarding_token)
      values (${q(RQ_SIGNCAP)}, '${USER_ID}', 'pending_signature', 'delivered+rrcassigncap@resend.dev',
        jsonb_build_object('reminders', jsonb_build_object('sign', jsonb_build_object('count', 2, 'lastSentAt', (now() - interval '10 days')::text))),
        now() - interval '20 days', now() - interval '10 days', ${q('onb-' + randomBytes(8).toString('hex'))});
      insert into public.representation_requests (id, user_id, status, linked_client_id, execution, created_at, updated_at)
      values (${q(RQ_NIDUE)}, '${USER_ID}', 'active', ${q(CLIENT_A)},
        jsonb_build_object('nationalInsurance', jsonb_build_object('instructionsSentAt', (now() - interval '10 days')::text, 'referenceNumber', '999')),
        now() - interval '10 days', now());
      insert into public.representation_requests (id, user_id, status, linked_client_id, execution, created_at, updated_at)
      values (${q(RQ_NISTOP)}, '${USER_ID}', 'active', ${q(CLIENT_A)},
        jsonb_build_object('nationalInsurance', jsonb_build_object('instructionsSentAt', (now() - interval '10 days')::text, 'confirmedAt', now()::text, 'referenceNumber', '888')),
        now() - interval '10 days', now());`);

    const run = await fetch(FN('representation-reminders'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret }, body: JSON.stringify({ dryRun: true }) });
    const body = await run.json().catch(() => ({}));
    const signSent = (body.results?.sign || []).filter((r) => r.id === RQ_SIGNDUE);
    const signCapped = (body.results?.sign || []).some((r) => r.id === RQ_SIGNCAP);
    const niSent = (body.results?.niClient || []).filter((r) => r.id === RQ_NIDUE);
    const niStopAppeared = ['sign', 'niClient', 'niSpouse', 'portal'].some((k) => (body.results?.[k] || []).some((r) => r.id === RQ_NISTOP));
    ok('D4 בקשה זכאית נבחרה ונשלחה (sign)', signSent.length === 1 && signSent[0].status === 'sent' && signSent[0].to === 'delivered+rrcassigndue@resend.dev', JSON.stringify(signSent));
    ok('D5 בקשה שהגיעה לתקרה לא הופיעה בתוצאות שנשלחו', !signCapped, JSON.stringify(body.results?.sign));
    ok('D6 סוג התזכורת הנכון נבחר (ב"ל, לא חתימה) עם הנמען הנכון', niSent.length === 1 && niSent[0].status === 'sent' && niSent[0].to === 'delivered+rrcas@resend.dev', JSON.stringify(niSent));
    ok('D7 בקשה שכבר אושרה (confirmedAt) לא הופיעה בכלל — לא "כבוי", לא "תקרה"', !niStopAppeared, JSON.stringify(body.results));

    const persisted = await one(`
      select (select execution->'reminders'->'sign'->'count' from public.representation_requests where id = ${q(RQ_SIGNDUE)}) as sign_due,
             (select execution->'reminders'->'sign'->'count' from public.representation_requests where id = ${q(RQ_SIGNCAP)}) as sign_cap,
             (select execution->'reminders'->'niClient'->'count' from public.representation_requests where id = ${q(RQ_NIDUE)}) as ni_due,
             (select execution->'reminders' from public.representation_requests where id = ${q(RQ_NISTOP)}) as ni_stop;`);
    ok('D8 המצב שנשמר תואם בדיוק את מה שבאמת קרה', persisted.sign_due === 1 && persisted.sign_cap === 2 && persisted.ni_due === 1 && persisted.ni_stop === null,
      JSON.stringify(persisted));
  }
} catch (e) {
  fail++;
  console.error('✗ חריגה:', e?.message || e);
} finally {
  await cleanup();
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
