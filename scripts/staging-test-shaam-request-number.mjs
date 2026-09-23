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

const subject = await one(`
  select c.id, c.representation_request_id as req, r.execution, r.status
    from public.clients c
    join public.representation_requests r on r.id = c.representation_request_id
   order by c.created_at limit 1`);
if (!subject?.id) { console.error('✋ אין ב-staging לקוח עם בקשת ייצוג. הרץ seed-staging.mjs.'); process.exit(1); }
const CID = subject.id, REQ = subject.req;
const ORIGINAL_EXECUTION = JSON.stringify(subject.execution ?? {});
const ORIGINAL_STATUS = subject.status;
console.log(`לקוח הבדיקה: ${CID} · בקשה: ${REQ}\n`);

async function runJob(id, actionType, result) {
  await writeStaging(`
    delete from public.automation_jobs where id = '${id}';
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
} finally {
  await writeStaging(`
    delete from public.automation_jobs where id like 'fx-198-%';
    update public.representation_requests
       set execution = '${q(ORIGINAL_EXECUTION)}'::jsonb, status = '${q(ORIGINAL_STATUS)}'
     where id = '${REQ}';`);
  const back = await one(`select execution, status from public.representation_requests where id = '${REQ}'`);
  ok('הבקשה שוחזרה', JSON.stringify(back.execution ?? {}) === ORIGINAL_EXECUTION && back.status === ORIGINAL_STATUS);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
