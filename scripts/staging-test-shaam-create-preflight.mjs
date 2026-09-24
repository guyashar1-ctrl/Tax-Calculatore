#!/usr/bin/env node
/**
 * staging-test-shaam-create-preflight.mjs — מיגרציה 202: «הזן ייפוי כוח בשע״ם»
 * שמצא בקשה קיימת מעודכן כבדיקה, ולעולם לא כ«נוצר».
 *
 * נבדק מול הטריגר האמיתי (המשימה נכתבת ל-automation_jobs כמו שהעובד כותב):
 *   · create עם result.preflight='existing_found' ⇒ שורות, מספר בקשה, observedAt,
 *     foundBeforeCreateAt — ובלי createdAt ובלי formDocumentId.
 *   · אותה תוצאה כש«כל המערכים נקלטו» והבקשה ממתינה לרשויות ⇒ פעיל (ענף הבדיקה).
 *   · create רגיל (נוצרה בקשה) ⇒ createdAt + הטופס, בלי foundBeforeCreateAt.
 *
 * ‼ סביבת הבדיקות בלבד. משחזרת בסיום את הבקשה.
 * הרצה:  node scripts/staging-test-shaam-create-preflight.mjs
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
const all = async (s) => (await writeStaging(s)) ?? [];
const one = async (s) => (await all(s))[0];
const q = (s) => String(s).replace(/'/g, "''");

await writeStaging("delete from public.automation_jobs where id like 'fx-202-%';");

const subject = await one(`
  select c.id, c.representation_request_id as req, r.execution, r.status
    from public.clients c
    join public.representation_requests r on r.id = c.representation_request_id
   order by c.created_at limit 1`);
if (!subject?.id) { console.error('✋ אין ב-staging לקוח עם בקשת ייצוג.'); process.exit(1); }
const CID = subject.id, REQ = subject.req;
const ORIGINAL = { execution: JSON.stringify(subject.execution ?? {}), status: subject.status };
console.log(`לקוח הבדיקה: ${CID} · בקשה: ${REQ}\n`);

const INPUT = { role: 'client', submissionKey: 'person:client', entityId: '039999998', personName: 'עידן רוקח' };
const row = (systemLabel, rawSystemState) => ({
  systemLabel, clientName: 'רוקח עידן', rawRequestState: 'המתנה למסמכים', rawSystemState,
  fileNumber: '039999998', repType: 'ראשי', enteredAt: '20/09/2026', requestNumber: '2026500001',
});

async function reset(status) {
  await writeStaging(`
    set session_replication_role = replica;
    update public.representation_requests set status = '${status}', execution = '{}'::jsonb where id = '${REQ}';
    set session_replication_role = origin;`);
}
async function finishCreate(id, result) {
  await writeStaging(`
    delete from public.automation_jobs where client_id = '${CID}' and action_type = 'shaam.create_representation'
       and status in ('queued','running','needs_human');
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status, claimed_at)
    values ('${id}', '${USER_ID}', '${CID}', 'shaam.create_representation', '${q(JSON.stringify(INPUT))}'::jsonb, 'running', now());
    update public.automation_jobs
       set status = 'succeeded', result = '${q(JSON.stringify(result))}'::jsonb, finished_at = now()
     where id = '${id}';`);
  const r = await one(`select coalesce(execution, '{}'::jsonb) as ex, status from public.representation_requests where id = '${REQ}'`);
  return { t: r.ex?.shaam?.['person:client'] ?? {}, status: r.status };
}

try {
  console.log('1 · נמצאה בקשה קיימת לפני היצירה');
  await reset('pending_signature');
  const rows = [row('מס הכנסה', 'בטיפול'), row('מעמ', 'בטיפול')];
  let s = await finishCreate('fx-202-a', {
    submissionKey: 'person:client', role: 'client', preflight: 'existing_found', found: true,
    observedAt: new Date().toISOString(), rows, allAccepted: false, requestNumber: '2026500001',
  });
  ok('השורות נשמרו כמו בבדיקה', s.t.systems?.length === 2, JSON.stringify(s.t));
  ok('מספר הבקשה נשמר', s.t.requestNumber === '2026500001');
  ok('observedAt + syncedAt נכתבו', !!s.t.observedAt && !!s.t.syncedAt);
  ok('foundBeforeCreateAt נכתב', !!s.t.foundBeforeCreateAt);
  ok('אין createdAt — לא נוצר כלום', !('createdAt' in s.t), JSON.stringify(s.t));
  ok('אין formDocumentId', !('formDocumentId' in s.t));
  ok('הסטטוס לא זז', s.status === 'pending_signature', s.status);

  console.log('\n2 · נמצאה, וכל המערכים נקלטו, כשהבקשה ממתינה לרשויות ⇒ פעיל');
  await reset('awaiting_authorities');
  s = await finishCreate('fx-202-b', {
    submissionKey: 'person:client', role: 'client', preflight: 'existing_found', found: true,
    observedAt: new Date().toISOString(), rows: [row('מס הכנסה', 'נקלט בהצלחה')], allAccepted: true,
    requestNumber: '2026500001',
  });
  ok('הבקשה עברה לפעיל (אותו ענף כמו בדיקה)', s.status === 'active', s.status);

  console.log('\n3 · יצירה רגילה — לא השתנתה');
  await reset('pending_signature');
  s = await finishCreate('fx-202-c', {
    submissionKey: 'person:client', role: 'client', requestNumber: '2026599999',
    formDocumentId: 'poa-pdf-x', formFileName: 'x.pdf',
  });
  ok('createdAt נכתב', !!s.t.createdAt);
  ok('מספר הבקשה החדשה נשמר', s.t.requestNumber === '2026599999');
  ok('הטופס נרשם', s.t.formDocumentId === 'poa-pdf-x' && !!s.t.formFetchedAt);
  ok('אין foundBeforeCreateAt', !('foundBeforeCreateAt' in s.t));
  ok('אין שורות בדיקה', !('systems' in s.t));
} finally {
  await writeStaging(`
    set session_replication_role = replica;
    delete from public.automation_jobs where id like 'fx-202-%';
    update public.representation_requests
       set execution = '${q(ORIGINAL.execution)}'::jsonb, status = '${q(ORIGINAL.status)}'
     where id = '${REQ}';
    set session_replication_role = origin;`);
  const back = await one(`select execution, status from public.representation_requests where id = '${REQ}'`);
  ok('הבקשה שוחזרה', JSON.stringify(back.execution ?? {}) === ORIGINAL.execution && back.status === ORIGINAL.status);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
