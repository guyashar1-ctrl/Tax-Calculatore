#!/usr/bin/env node
/**
 * staging-test-shaam-request-number.mjs — מיגרציה 198: מספר הבקשה בשע״ם.
 *
 * ‼ המקרה האמיתי (הדסה סלע, 23.09.2026): הבדיקה שמרה requestNumber = ""
 * (הרשימה לא מציגה מספר), והשידור קורא את המספר מהבקשה שנפתחה. נבדק:
 *   · "" אינו חוסם — המספר מהשידור נשמר.
 *   · מספר קיים לא נדרס לעולם (לא ע"י שידור ולא ע"י בדיקה).
 *   · שידור בלי submitted=true אינו כותב submittedAt ואינו מזיז סטטוס.
 *   · שידור מוצלח כותב submittedAt ומעביר ל-awaiting_authorities.
 *
 * ‼ סביבת הבדיקות בלבד. משחזרת בסיום את ה-execution ואת סטטוס הבקשה.
 * הרצה:  node scripts/staging-test-shaam-request-number.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
     `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const one = async (q) => (await writeStaging(q))[0];
const q = (s) => String(s).replace(/'/g, "''");

// ‼ לקוח ובקשה משלנו. קודם נלקח "הלקוח הראשון עם בקשה" ב-staging — וכשחבילה
// אחרת הביאה אותו ל-active (סופי, guard_representation_status) הבדיקה נפלה
// עוד לפני הבדיקה הראשונה. נמחקים בסוף, גם בכישלון.
const MARK = 'REQNUM198';
const CID = `qa-reqnum198-client`, REQ = `qa-reqnum198-req`;
async function cleanupFixture() {
  await writeStaging(`
    delete from public.automation_jobs where client_id = '${CID}' or id like 'fx-198-%' or id like 'fx-199-%';
    delete from public.email_messages where request_id = '${REQ}' or client_id = '${CID}';
    delete from public.tasks where client_id = '${CID}';
    update public.clients set representation_request_id = null where id = '${CID}';
    delete from public.representation_requests where id = '${REQ}';
    delete from public.clients where id = '${CID}' and last_name = '${MARK}';`);
}
await cleanupFixture();
await writeStaging(`
  insert into public.clients (id, user_id, first_name, last_name, family_status, id_number, email)
  values ('${CID}', '${USER_ID}', 'הדסה', '${MARK}', 'single', '034605212', 'delivered+reqnum198@resend.dev');
  insert into public.representation_requests (id, user_id, linked_client_id, status, authorities, execution)
  values ('${REQ}', '${USER_ID}', '${CID}', 'awaiting_stamp', array['incomeTax','vat','withholding'], '{}'::jsonb);
  update public.clients set representation_request_id = '${REQ}' where id = '${CID}';`);
console.log(`לקוח הבדיקה: ${CID} · בקשה: ${REQ}\n`);

async function runJob(id, actionType, result) {
  await writeStaging(`
    delete from public.automation_jobs where id = '${id}';
    -- ‼ 201: שידור מוצלח יוצר משימת בדיקה פתוחה (יישוב אחרי ההגשה), ואותה
    -- (client_id, action_type) יכולה להיות פתוחה פעם אחת בלבד.
    delete from public.automation_jobs where client_id = '${CID}' and action_type = '${actionType}'
       and status in ('queued', 'running', 'needs_human');
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
    values ('${id}', '${USER_ID}', '${CID}', '${actionType}',
            '${q(JSON.stringify({ role: 'client', submissionKey: 'person:client' }))}'::jsonb, 'queued');
    update public.automation_jobs
       set status = 'succeeded', result = '${q(JSON.stringify(result))}'::jsonb, finished_at = now()
     where id = '${id}';`);
  return one(`select coalesce(execution, '{}'::jsonb) as ex, status from public.representation_requests where id = '${REQ}'`);
}
const track = (row) => row.ex?.shaam?.['person:client'] ?? {};

const CHECK_NO_NUMBER = {
  submissionKey: 'person:client', role: 'client', requestNumber: '', found: true, allAccepted: false,
  rows: ['מס הכנסה', 'מעמ', 'ניכויים'].map((systemLabel) => ({
    systemLabel, clientName: 'סלע הדסה', rawRequestState: 'המתנה למסמכים', rawSystemState: '',
    fileNumber: '034605212', repType: 'ראשי', enteredAt: '23/09/2026', requestNumber: '',
  })),
};

try {
  await writeStaging(`update public.representation_requests set execution = '{}'::jsonb, status = 'awaiting_stamp' where id = '${REQ}';`);

  console.log('— הבדיקה שומרת "" (המספר לא מוצג ברשימה) —');
  let row = await runJob('fx-198-check-1', 'shaam.check_representation', CHECK_NO_NUMBER);
  eq('בדיקה בלי מספר אינה כותבת "" חדש (198)', track(row).requestNumber ?? null, null);
  // ‼ המצב בפרודקשן היום: "" כבר שמור (נכתב לפני 198). מדמים אותו במפורש.
  await writeStaging(`update public.representation_requests set execution = jsonb_set(execution, '{shaam,person:client,requestNumber}', '""'::jsonb) where id = '${REQ}';`);
  row = await one(`select coalesce(execution, '{}'::jsonb) as ex, status from public.representation_requests where id = '${REQ}'`);
  eq('"" שמור כמו בפרודקשן', track(row).requestNumber, '');

  console.log('— שידור שנעצר (submitted חסר) —');
  row = await runJob('fx-198-submit-0', 'shaam.submit_poa',
    { submissionKey: 'person:client', role: 'client', requestNumber: '2026538930' });
  eq('אין submittedAt בלי submitted=true', track(row).submittedAt ?? null, null);
  eq('הסטטוס לא זז', row.status, 'awaiting_stamp');

  console.log('— שידור מוצלח עם המספר מהבקשה שנפתחה —');
  row = await runJob('fx-198-submit-1', 'shaam.submit_poa',
    { submissionKey: 'person:client', role: 'client', requestNumber: '2026538930', submitted: true });
  eq('המספר נשמר במקום ""', track(row).requestNumber, '2026538930');
  ok('submittedAt נכתב', !!track(row).submittedAt);
  eq('הסטטוס עבר ל-awaiting_authorities', row.status, 'awaiting_authorities');
  eq('השורות מהבדיקה נשמרו', (track(row).systems ?? []).length, 3);

  console.log('— מספר קיים לא נדרס —');
  row = await runJob('fx-198-check-2', 'shaam.check_representation', { ...CHECK_NO_NUMBER, requestNumber: '2026999999' });
  eq('בדיקה עם מספר אחר לא דורסת', track(row).requestNumber, '2026538930');
  row = await runJob('fx-198-submit-2', 'shaam.submit_poa',
    { submissionKey: 'person:client', role: 'client', requestNumber: '2026999999', submitted: true });
  eq('שידור עם מספר אחר לא דורס', track(row).requestNumber, '2026538930');

  console.log('— בדיקה עם "" אחרי שיש מספר —');
  row = await runJob('fx-198-check-3', 'shaam.check_representation', CHECK_NO_NUMBER);
  eq('"" מהבדיקה לא מוחק מספר קיים', track(row).requestNumber, '2026538930');

  // ── 199: המספר נשמר ברגע שהעובד כתב אותו ל-progress, גם אם המשימה נעצרה ──
  console.log('— 199: progress.requestNumber ⇒ execution, בלי לחכות להצלחה —');
  // מתחילים נקי: "" כמו בפרודקשן, בלי submittedAt מהסעיף הקודם, וחזרה ל-awaiting_stamp.
  await writeStaging(`update public.representation_requests set execution = '{"shaam":{"person:client":{"requestNumber":""}}}'::jsonb, status = 'awaiting_stamp' where id = '${REQ}';`);
  const progressJob = async (id, actionType, progress) => {
    await writeStaging(`
      delete from public.automation_jobs where id like 'fx-199-%';
      insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
      values ('${id}', '${USER_ID}', '${CID}', '${actionType}',
              '${q(JSON.stringify({ role: 'client', submissionKey: 'person:client' }))}'::jsonb, 'queued');
      update public.automation_jobs set progress = '${q(JSON.stringify(progress))}'::jsonb where id = '${id}';
      update public.automation_jobs set status = 'needs_human', error_code = 'shaam_unexpected_screen' where id = '${id}';`);
    return one(`select coalesce(execution, '{}'::jsonb) as ex, status from public.representation_requests where id = '${REQ}'`);
  };
  row = await progressJob('fx-199-a', 'shaam.submit_poa', { requestNumber: '2026538930' });
  eq('המספר מה-progress נכתב במקום "" (משימה שנעצרה)', track(row).requestNumber, '2026538930');
  eq('בלי submittedAt', track(row).submittedAt ?? null, null);
  eq('הסטטוס לא זז', row.status, 'awaiting_stamp');
  row = await progressJob('fx-199-b', 'shaam.submit_poa', { requestNumber: '2026111111' });
  eq('progress עם מספר אחר לא דורס', track(row).requestNumber, '2026538930');
  await writeStaging(`update public.representation_requests set execution = jsonb_set(execution, '{shaam,person:client,requestNumber}', '""'::jsonb) where id = '${REQ}';`);
  row = await progressJob('fx-199-c', 'btl.create_representation', { requestNumber: '2026222222' });
  eq('משימה שאינה shaam.* לא כותבת', track(row).requestNumber, '');
  row = await progressJob('fx-199-d', 'shaam.submit_poa', { requestNumber: '12' });
  eq('מספר קצר מדי לא נכתב', track(row).requestNumber, '');
} finally {
  await cleanupFixture();
  const left = await one(`select (select count(*) from public.clients where id = '${CID}')
                               + (select count(*) from public.representation_requests where id = '${REQ}')
                               + (select count(*) from public.automation_jobs where client_id = '${CID}') as n`);
  ok('הלקוח והבקשה של הבדיקה נמחקו', Number(left.n) === 0, `נשארו ${left.n}`);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
