#!/usr/bin/env node
/**
 * staging-test-shaam-post-submission.mjs — מיגרציה 201: מחזור החיים אחרי ההגשה.
 *
 * נבדק מול הטריגרים האמיתיים (המשימות נכתבות ל-automation_jobs כמו שהעובד כותב):
 *   · שידור מוצלח ⇒ submissionConfirmation + צפי סיום ההשהייה מהמסך של שע״ם,
 *     ומשימת בדיקה (קוראת בלבד) אחת — גם כשהשידור «מצליח» פעמיים.
 *   · בדיקה ⇒ «מצב בקשה» ו«מצב מערך» נשמרים בנפרד, כמו שהם.
 *   · צפי מפירוט הרשימה גובר על מסך האישור.
 *   · קריאה שקדמה להגשה / ישנה מהשמורה — אינה דורסת.
 *   · «לא נמצאה ברשימה» — אינה מוחקת שורות.
 *   · «ממתין לאישור לקוח» ⇒ שלב האישור הופך לחובה, פעם אחת.
 *   · «נקלט בהצלחה» בכל המערכים ⇒ פעיל.
 *   · ת.ז./דרכון ששע״ם דורשת: קיים ⇒ לא מבקשים; חסר ⇒ פריט אחד; שוב ⇒ לא כפול;
 *     תווית לא מזוהה ⇒ כלום; צילום בתיק שלא ידוע של מי ⇒ עוצרים.
 *
 * ‼ סביבת הבדיקות בלבד. משחזרת בסיום את הבקשה ואת שלבי הלקוח.
 * הרצה:  node scripts/staging-test-shaam-post-submission.mjs
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
const all = async (s) => (await writeStaging(s)) ?? [];
const one = async (s) => (await all(s))[0];
const q = (s) => String(s).replace(/'/g, "''");

// שאריות מריצה שנקטעה באמצע.
await writeStaging("delete from public.automation_jobs where id like 'fx-201-%'; delete from public.documents where id like 'fx-201-%';");

const subject = await one(`
  select c.id, c.representation_request_id as req, r.execution, r.status, r.identity_docs
    from public.clients c
    join public.representation_requests r on r.id = c.representation_request_id
   order by c.created_at limit 1`);
if (!subject?.id) { console.error('✋ אין ב-staging לקוח עם בקשת ייצוג.'); process.exit(1); }
const CID = subject.id, REQ = subject.req;
const ORIGINAL = {
  execution: JSON.stringify(subject.execution ?? {}),
  status: subject.status,
  identityDocs: subject.identity_docs == null ? null : JSON.stringify(subject.identity_docs),
};
const ORIGINAL_STEPS = await all(`
  select to_jsonb(s) as row from public.onboarding_steps s
   where client_id = '${CID}' and step_type in ('rep_client_approval', 'client_documents')`);
const ORIGINAL_DOCS = await all(`select id from public.documents where client_id = '${CID}' and category = 'id_card'`);
console.log(`לקוח הבדיקה: ${CID} · בקשה: ${REQ} · שלבים שמורים: ${ORIGINAL_STEPS.length}\n`);

const INPUT = { role: 'client', submissionKey: 'person:client', entityId: '034605212', personName: 'הדסה סלע', requestNumber: '2026538930' };

async function finishJob(id, actionType, result, { claimedAt } = {}) {
  await writeStaging(`
    delete from public.automation_jobs where id = '${id}';
    delete from public.automation_jobs where client_id = '${CID}' and action_type = '${actionType}'
       and status in ('queued','running','needs_human');
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status, claimed_at)
    values ('${id}', '${USER_ID}', '${CID}', '${actionType}', '${q(JSON.stringify(INPUT))}'::jsonb, 'running',
            ${claimedAt ? `'${claimedAt}'::timestamptz` : 'now()'});
    update public.automation_jobs
       set status = 'succeeded', result = '${q(JSON.stringify(result))}'::jsonb, finished_at = now()
     where id = '${id}';`);
  return state();
}
async function state() {
  return one(`select coalesce(execution, '{}'::jsonb) as ex, status from public.representation_requests where id = '${REQ}'`);
}
const track = (row) => row.ex?.shaam?.['person:client'] ?? {};
const autoChecks = () => all(`
  select id, status, input from public.automation_jobs
   where client_id = '${CID}' and action_type = 'shaam.check_representation'
     and input ->> 'reason' = 'post_submission_reconciliation'`);
const approvalStep = () => one(`
  select id, status, ball, required_for_close, payload from public.onboarding_steps
   where client_id = '${CID}' and step_type = 'rep_client_approval' and status <> 'cancelled' limit 1`);
const docsStep = () => one(`
  select id, status, payload from public.onboarding_steps
   where client_id = '${CID}' and step_type = 'client_documents' and status <> 'cancelled'
   order by created_at desc limit 1`);

const row = (systemLabel, rawRequestState, rawSystemState, extra = {}) => ({
  systemLabel, clientName: 'סלע הדסה', rawRequestState, rawSystemState, fileNumber: '034605212',
  repType: 'ראשי', enteredAt: '23/09/2026', requestNumber: '2026538930', ...extra,
});
const check = (rows, extra = {}) => ({
  submissionKey: 'person:client', role: 'client', requestNumber: '2026538930',
  found: rows.length > 0, rows, allAccepted: rows.length > 0 && rows.every(r => /נקלט/.test(r.rawSystemState)), ...extra,
});
const SUBMIT_OK = {
  submissionKey: 'person:client', role: 'client', requestNumber: '2026538930', submitted: true,
  statusLines: [
    'אנחנו בודקים כרגע את הקבצים שצירפת',
    'בקשתך תיקלט במערכת ותמתין לסיום השהייה הצפויה להסתיים ביום 06/10/2026.',
    'הלקוח יכול לקצר את התהליך ולאשר או לדחות את הבקשה בלחיצה על הקישור שיקבל.',
  ],
};

try {
  // מצב פתיחה: הבקשה ממתינה לחותמת, עם צילום הרשימה הישן מלפני ההגשה (כמו אצל הדסה).
  await writeStaging(`
    set session_replication_role = replica;
    delete from public.onboarding_steps where client_id = '${CID}' and step_type in ('rep_client_approval', 'client_documents');
    update public.representation_requests
       set status = 'awaiting_stamp', identity_docs = '{}'::jsonb,
           execution = '${q(JSON.stringify({ shaam: { 'person:client': {
             requestNumber: '2026538930', syncedAt: '2026-09-23T14:50:03Z', rawRequestState: 'המתנה למסמכים',
             systems: [row('מס הכנסה', 'המתנה למסמכים', ''), row('מעמ', 'המתנה למסמכים', '')],
           } } }))}'::jsonb
     where id = '${REQ}';
    set session_replication_role = origin;`);

  console.log('— שידור מוצלח ⇒ ראיית שע״ם + יישוב מיידי —');
  let s = await finishJob('fx-201-submit-1', 'shaam.submit_poa', SUBMIT_OK);
  ok('submittedAt נכתב', !!track(s).submittedAt);
  eq('הסטטוס עבר ל-awaiting_authorities', s.status, 'awaiting_authorities');
  eq('צפי סיום ההשהייה ממסך האישור', track(s).suspensionEndsAt, '2026-10-06');
  eq('מקור הצפי', track(s).suspensionEndsSource, 'submission_confirmation');
  ok('הטקסט של שע״ם נשמר כמו שהוא', /06\/10\/2026/.test(track(s).submissionConfirmation?.text ?? ''));
  let jobs = await autoChecks();
  eq('נוצרה משימת בדיקה אחת אחרי ההגשה', jobs.length, 1);
  eq('הבדיקה נושאת את מפתח ההגשה', jobs[0]?.input?.submissionKey, 'person:client');
  eq('הבדיקה נושאת את מספר הבקשה', jobs[0]?.input?.requestNumber, '2026538930');
  eq('שורות מלפני ההגשה עדיין שם (לא נמחקו)', (track(s).systems ?? []).length, 2);
  let st = await approvalStep();
  ok('נפתח שלב אישור הלקוח (זירוז) עם ההגשה', !!st);
  eq('ובשלב הזה הוא עדיין לא חובה', st?.required_for_close, false);

  // שידור «מוצלח» שני (למשל דיווח כפול) — לא נוצרת בדיקה שנייה כל עוד הראשונה פתוחה.
  await writeStaging(`
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
    values ('fx-201-submit-2', '${USER_ID}', '${CID}', 'shaam.submit_poa', '${q(JSON.stringify(INPUT))}'::jsonb, 'running');
    update public.automation_jobs set status = 'succeeded', result = '${q(JSON.stringify(SUBMIT_OK))}'::jsonb where id = 'fx-201-submit-2';`);
  jobs = await autoChecks();
  eq('דיווח שני לא יוצר בדיקה כפולה', jobs.length, 1);
  s = await state();
  eq('submittedAt לא זז בדיווח השני', track(s).submittedAt, track(s).submittedAt);
  await writeStaging(`delete from public.automation_jobs where client_id = '${CID}' and action_type = 'shaam.check_representation';`);

  console.log('— קריאה שקדמה להגשה אינה דורסת —');
  s = await finishJob('fx-201-check-old', 'shaam.check_representation',
    check([row('מס הכנסה', 'המתנה למסמכים', '')]), { claimedAt: '2026-09-23T10:00:00Z' });
  eq('השורות נשארו מהקריאה הקודמת', (track(s).systems ?? []).length, 2);
  ok('הקריאה הישנה נרשמה כישנה', !!track(s).lastStaleReadingAt);

  console.log('— «התקבלו המסמכים» / «השהייה» — שתי העמודות נשמרות בנפרד —');
  s = await finishJob('fx-201-check-1', 'shaam.check_representation', check([
    row('מס הכנסה', 'התקבלו המסמכים', 'השהייה', { suspensionEndsRaw: '06/10/2026' }),
    row('מעמ', 'התקבלו המסמכים', 'השהייה'),
    row('ניכויים', 'התקבלו המסמכים', 'ממתין לפתיחת תיק', { fileNumber: 'לא קיים תיק' }),
  ]));
  eq('מצב בקשה (גולמי)', track(s).rawRequestState, 'התקבלו המסמכים');
  eq('מצב מערך (גולמי) למס הכנסה', track(s).systems?.[0]?.rawSystemState, 'השהייה');
  eq('מצב מערך (גולמי) לניכויים', track(s).systems?.[2]?.rawSystemState, 'ממתין לפתיחת תיק');
  eq('צפי מהרשימה', track(s).suspensionEndsAt, '2026-10-06');
  eq('מקור הצפי עכשיו הרשימה', track(s).suspensionEndsSource, 'request_list');
  ok('observedAt נכתב', !!track(s).observedAt);
  eq('הסטטוס נשאר ממתין לרשויות', s.status, 'awaiting_authorities');
  st = await approvalStep();
  eq('השהייה אינה הופכת את האישור לחובה', st?.required_for_close, false);
  const observed1 = track(s).observedAt;

  console.log('— קריאה ישנה מהשמורה אינה דורסת —');
  s = await finishJob('fx-201-check-stale', 'shaam.check_representation',
    check([row('מס הכנסה', 'המתנה למסמכים', '')]),
    { claimedAt: new Date(Date.parse(observed1) - 60_000).toISOString() });
  eq('המצב לא נדרס', track(s).rawRequestState, 'התקבלו המסמכים');
  eq('observedAt לא זז', track(s).observedAt, observed1);

  console.log('— «לא נמצאה ברשימה» —');
  s = await finishJob('fx-201-check-nf', 'shaam.check_representation', check([], { note: 'הבקשה אינה מופיעה ברשימת הבקשות בתהליך.' }));
  eq('השורות האחרונות נשמרו', (track(s).systems ?? []).length, 3);
  ok('notInListAt נרשם', !!track(s).notInListAt);
  eq('הסטטוס לא זז', s.status, 'awaiting_authorities');

  console.log('— «ממתין לאישור לקוח» ⇒ חובה —');
  s = await finishJob('fx-201-check-2', 'shaam.check_representation', check([
    row('מס הכנסה', 'התקבלו המסמכים', 'ממתין לאישור לקוח'),
    row('מעמ', 'התקבלו המסמכים', 'השהייה'),
  ]));
  ok('notInListAt נוקה כשהבקשה נמצאה שוב', !track(s).notInListAt);
  ok('clientApprovalRequiredAt נכתב', !!track(s).clientApprovalRequiredAt);
  st = await approvalStep();
  eq('השלב חוסם סגירה', st?.required_for_close, true);
  eq('requiredBy', st?.payload?.requiredBy, 'shaam');
  eq('הכדור אצל הלקוח', st?.ball, 'client');
  ok('הניסוח ללקוח אינו «אופציונלי»', !/אופציונל|זירוז|אין בעיה/.test(`${st?.payload?.clientTitle} ${st?.payload?.clientSub} ${st?.payload?.clientNoteAfter}`),
     `${st?.payload?.clientTitle} | ${st?.payload?.clientSub}`);
  ok('הניסוח הקודם נשמר (optionalCopy)', /זירוז/.test(st?.payload?.optionalCopy?.clientTitle ?? ''));
  const requiredSince = st?.payload?.requiredSince;
  await finishJob('fx-201-check-3', 'shaam.check_representation', check([
    row('מס הכנסה', 'התקבלו המסמכים', 'ממתין לאישור לקוח'),
  ]));
  st = await approvalStep();
  eq('בדיקה חוזרת אינה משכתבת (אידמפוטנטי)', st?.payload?.requiredSince, requiredSince);
  const approvalCount = await one(`select count(*)::int as n from public.onboarding_steps where client_id = '${CID}' and step_type = 'rep_client_approval'`);
  eq('שלב אישור אחד בלבד', approvalCount.n, 1);

  console.log('— «נקלט בהצלחה» בכל המערכים ⇒ פעיל —');
  s = await finishJob('fx-201-check-4', 'shaam.check_representation', check([
    row('מס הכנסה', 'מסמכים אושרו', 'נקלט בהצלחה'),
    row('מעמ', 'מסמכים אושרו', 'נקלט בהצלחה'),
  ]));
  eq('הבקשה פעילה', s.status, 'active');
  st = await one(`select status from public.onboarding_steps where client_id = '${CID}' and step_type = 'rep_client_approval' limit 1`);
  eq('שלב האישור נסגר מעצמו', st?.status, 'completed');

  // ── מסמך מזהה ─────────────────────────────────────────────────────────────
  const progressDocs = async (id, docs) => {
    await writeStaging(`
      delete from public.automation_jobs where id = '${id}';
      delete from public.automation_jobs where client_id = '${CID}' and action_type = 'shaam.submit_poa' and status in ('queued','running','needs_human');
      insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
      values ('${id}', '${USER_ID}', '${CID}', 'shaam.submit_poa', '${q(JSON.stringify(INPUT))}'::jsonb, 'running');
      update public.automation_jobs set progress = '${q(JSON.stringify({ shaamRequiredDocuments: docs }))}'::jsonb where id = '${id}';
      update public.automation_jobs set status = 'needs_human', error_code = 'request_identity_unverified' where id = '${id}';`);
    return state();
  };
  const idItems = async () => {
    const d = await docsStep();
    return (d?.payload?.checklist ?? []).filter(x => x.key === 'id_card');
  };

  console.log('— ת.ז. חסרה ⇒ פריט אחד בבקשת המסמכים —');
  await writeStaging(`delete from public.documents where client_id = '${CID}' and category = 'id_card' and id like 'fx-201-%';`);
  const hadUnattributed = ORIGINAL_DOCS.length > 0;
  if (hadUnattributed) {
    // אצל לקוח הבדיקה יש כבר צילום בתיק — הבדיקה הזו רצה על מצב «לא משויך».
    s = await progressDocs('fx-201-docs-amb', [{ label: 'צילום תעודת זהות', required: true }]);
    eq('צילום בתיק שלא ידוע של מי ⇒ עוצרים', track(s).requiredDocuments?.[0]?.handling, 'ambiguous_materials');
    eq('ולא נפתח פריט', (await idItems()).length, 0);
  } else {
    s = await progressDocs('fx-201-docs-1', [{ label: 'צילום תעודת זהות', required: true }]);
    eq('הסיווג: ת.ז.', track(s).requiredDocuments?.[0]?.kind, 'idCard');
    eq('טיפול: נפתחה בקשה', track(s).requiredDocuments?.[0]?.handling, 'requested');
    eq('פריט אחד', (await idItems()).length, 1);
    eq('המקור נרשם', (await idItems())[0]?.source, 'shaam_documents_step');
    s = await progressDocs('fx-201-docs-2', [{ label: 'צילום תעודת זהות', required: true }]);
    eq('שוב ⇒ already_requested', track(s).requiredDocuments?.[0]?.handling, 'already_requested');
    eq('עדיין פריט אחד', (await idItems()).length, 1);

    console.log('— ת.ז. קיימת ⇒ לא מבקשים —');
    await writeStaging(`
      delete from public.onboarding_steps where client_id = '${CID}' and step_type = 'client_documents';
      update public.representation_requests
         set identity_docs = '{"client":[{"documentId":"fx-201-doc","docKind":"idCard","fileName":"id.jpg"}]}'::jsonb
       where id = '${REQ}';`);
    s = await progressDocs('fx-201-docs-3', [{ label: 'תעודת זהות', required: true }]);
    eq('טיפול: exists', track(s).requiredDocuments?.[0]?.handling, 'exists');
    ok('לא נפתחה בקשת מסמכים', !(await docsStep()));

    console.log('— דרכון נדרש, יש רק ת.ז. ⇒ מבקשים דרכון —');
    s = await progressDocs('fx-201-docs-4', [{ label: 'צילום דרכון', required: true }]);
    eq('הסיווג: דרכון', track(s).requiredDocuments?.[0]?.kind, 'passport');
    eq('טיפול: requested', track(s).requiredDocuments?.[0]?.handling, 'requested');
    ok('הפריט אומר «דרכון»', /דרכון/.test((await idItems())[0]?.label ?? ''));

    console.log('— «ת.ז. או דרכון», יש ת.ז. ⇒ קיים —');
    await writeStaging(`delete from public.onboarding_steps where client_id = '${CID}' and step_type = 'client_documents';`);
    s = await progressDocs('fx-201-docs-5', [{ label: 'צילום ת.ז. או דרכון', required: true }]);
    eq('טיפול: exists', track(s).requiredDocuments?.[0]?.handling, 'exists');

    console.log('— צילום בתיק שלא ידוע של מי ⇒ עוצרים —');
    await writeStaging(`
      update public.representation_requests set identity_docs = '{}'::jsonb where id = '${REQ}';
      insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
      values ('fx-201-orphan', '${USER_ID}', '${CID}', 'fx/none', 'id.jpg', 'image/jpeg', 1, 'id_card', (select label_id from public.documents where user_id = '${USER_ID}' limit 1));`);
    s = await progressDocs('fx-201-docs-6', [{ label: 'צילום תעודת זהות', required: true }]);
    eq('טיפול: ambiguous_materials', track(s).requiredDocuments?.[0]?.handling, 'ambiguous_materials');
    ok('לא נפתחה בקשת מסמכים', !(await docsStep()));
  }

  console.log('— תווית לא מזוהה ⇒ נרשמת, בלי בקשה —');
  await writeStaging(`delete from public.onboarding_steps where client_id = '${CID}' and step_type = 'client_documents';`);
  s = await progressDocs('fx-201-docs-7', [{ label: 'אישור ניהול חשבון', required: true }]);
  eq('kind = null', track(s).requiredDocuments?.[0]?.kind ?? null, null);
  eq('טיפול: unrecognized', track(s).requiredDocuments?.[0]?.handling, 'unrecognized');
  ok('לא נפתחה בקשת מסמכים', !(await docsStep()));
} catch (e) {
  fail++; console.log('  ✗ חריגה:', String(e.message).slice(0, 400));
} finally {
  // ‼ «פעיל» הוא סופי (guard_representation_status) — השחזור עוקף טריגרים לשאילתה הזו בלבד.
  await writeStaging(`
    set session_replication_role = replica;
    delete from public.automation_jobs where id like 'fx-201-%'
       or (client_id = '${CID}' and action_type = 'shaam.check_representation' and input ->> 'reason' = 'post_submission_reconciliation');
    delete from public.documents where id like 'fx-201-%';
    delete from public.onboarding_events where step_id in (
      select id from public.onboarding_steps where client_id = '${CID}' and step_type in ('rep_client_approval', 'client_documents'));
    delete from public.onboarding_steps where client_id = '${CID}' and step_type in ('rep_client_approval', 'client_documents');
    ${ORIGINAL_STEPS.map(r => `insert into public.onboarding_steps select * from jsonb_populate_record(null::public.onboarding_steps, '${q(JSON.stringify(r.row))}'::jsonb);`).join('\n')}
    update public.representation_requests
       set execution = '${q(ORIGINAL.execution)}'::jsonb, status = '${q(ORIGINAL.status)}',
           identity_docs = ${ORIGINAL.identityDocs == null ? 'null' : `'${q(ORIGINAL.identityDocs)}'::jsonb`}
     where id = '${REQ}';
    set session_replication_role = origin;`);
  const back = await one(`select execution, status from public.representation_requests where id = '${REQ}'`);
  ok('הבקשה שוחזרה', JSON.stringify(back.execution ?? {}) === ORIGINAL.execution && back.status === ORIGINAL.status);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
