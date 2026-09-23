#!/usr/bin/env node
/**
 * staging-test-representation-joint.mjs — שני הטריגרים שכותבים לאותה שורה.
 *
 * ‼ למה הבדיקה הזאת קיימת: sync_shaam_representation_from_job (194) ו-
 * sync_btl_representation_from_job (187/190/195) כותבים שניהם לתוך
 * `representation_requests.execution` של **אותה בקשה** — כל אחד למפתח משלו
 * (`shaam` מול `nationalInsurance`/`nationalInsuranceSpouse`). כל אחת משתי
 * חבילות הבדיקה הקיימות בודקת טריגר אחד בלבד, ובודדת. מה שאף אחת לא
 * בודקת: שמשימה של רשות אחת לא מוחקת/דורסת את מה שהרשות השנייה כתבה.
 *
 * ‼ סביבת הבדיקות בלבד (staging-lib חוסם פרודקשן). משחזרת בסיום את
 * ה-execution ואת שלב הרשות של הלקוח שבו השתמשה.
 *
 * הרצה:  node scripts/staging-test-representation-joint.mjs
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

// ── אותו לקוח-בדיקה כמו staging-test-btl-representation (שלב ב"ל פתוח) ─────
const subject = await one(`
  select c.id, c.representation_request_id as req, r.execution, s.id as step_id,
         s.status as step_status0, s.ball as step_ball0, s.payload as step_payload0,
         s.completion_method as step_method0, s.completed_at as step_completed0,
         s.needs_attention as step_attention0
    from public.clients c
    join public.representation_requests r on r.id = c.representation_request_id
    join public.onboarding_steps s
      on s.client_id = c.id and s.step_type = 'authority_representation'
     and s.payload->>'authority' = 'national_insurance'
     and s.payload->>'subjectRole' = 'client'
     and s.status <> 'cancelled'
   order by c.created_at
   limit 1`);
if (!subject?.id) {
  console.error('✋ אין ב-staging לקוח עם בקשת ייצוג ושלב ייצוג ב"ל. הרץ seed-staging.mjs.');
  process.exit(1);
}
const CID = subject.id;
const REQ = subject.req;
const STEP = subject.step_id;
const ORIGINAL_EXECUTION = JSON.stringify(subject.execution ?? {});
const SHAAM_JOB = 'fx-joint-shaam';
const BTL_JOB = 'fx-joint-btl';

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
  return (await one(`select coalesce(execution, '{}'::jsonb) as ex from public.representation_requests where id = '${REQ}'`)).ex;
}

// תוצאת «בדוק קבלת הייצוג» בשע״ם — בצורה שנקראה בפועל (23.09.2026): שלוש
// שורות של הלקוחה בלבד, אחרי שיוך.
const SHAAM_RESULT = {
  submissionKey: 'person:client', role: 'client', requestNumber: '', found: true, allAccepted: false,
  rows: ['מס הכנסה', 'מעמ'].map((systemLabel) => ({
    systemLabel, clientName: 'סלע הדסה', rawRequestState: 'המתנה למסמכים', rawSystemState: '',
    fileNumber: '034605212', repType: 'ראשי', enteredAt: '23/09/2026',
  })),
};
const BTL_RESULT = {
  role: 'client', referenceNumber: '75165449', deadline: '2026-11-22',
  found: true, status: 'pending', rawStatus: 'ממתין לאישור', foundExternally: true,
};

await writeStaging(`update public.representation_requests set execution = '{}'::jsonb where id = '${REQ}';`);

// ══ 1 · שע״ם ואז ב"ל ═════════════════════════════════════════════════════
console.log('1 · משימת שע״ם, ואחריה משימת ב"ל — הראשונה שורדת');
{
  const a = await runJob(SHAAM_JOB, 'shaam.check_representation', SHAAM_RESULT);
  eq('שע״ם נכתב', a.shaam?.['person:client']?.systems?.length, 2);
  eq('‼ שע״ם לא נגע ב-nationalInsurance', a.nationalInsurance, undefined);

  const b = await runJob(BTL_JOB, 'btl.check_representation', BTL_RESULT);
  eq('ב"ל נכתב', b.nationalInsurance?.externalState, 'pending');
  eq('‼ ב"ל לא מחק את שע״ם', b.shaam?.['person:client']?.systems?.length, 2);
  eq('‼ ב"ל לא שינה את תוכן שע״ם', b.shaam?.['person:client']?.systems?.[0]?.clientName, 'סלע הדסה');
  eq('‼ «ממתין» בב"ל אינו אישור', b.nationalInsurance?.confirmedAt, undefined);
}

// ══ 2 · ב"ל ואז שע״ם ═════════════════════════════════════════════════════
console.log('\n2 · סדר הפוך — משימת שע״ם נוספת לא מוחקת את הראיה מב"ל');
{
  const c = await runJob(SHAAM_JOB, 'shaam.check_representation', SHAAM_RESULT);
  eq('‼ ראיית ב"ל שרדה', c.nationalInsurance?.externalState, 'pending');
  eq('‼ האסמכתא שרדה', c.nationalInsurance?.referenceNumber, '75165449');
  eq('‼ foundExternally שרד', c.nationalInsurance?.foundExternally, true);
  eq('שע״ם עדיין שם', c.shaam?.['person:client']?.systems?.length, 2);
}

// ══ 3 · הפרדת מפתחות ═════════════════════════════════════════════════════
console.log('\n3 · אף טריגר לא כותב מחוץ למפתח שלו');
{
  const d = await one(`select coalesce(execution, '{}'::jsonb) as ex from public.representation_requests where id = '${REQ}'`);
  const keys = Object.keys(d.ex).sort();
  eq('רק שני המפתחות הצפויים', keys, ['nationalInsurance', 'shaam']);
  eq('‼ אין מספר בקשה בדוי בשע״ם', d.ex.shaam?.['person:client']?.requestNumber, '');
}

// ── ניקוי ושחזור ───────────────────────────────────────────────────────────
await writeStaging(`
  delete from public.automation_jobs where id in ('${SHAAM_JOB}', '${BTL_JOB}');
  update public.onboarding_steps
     set status = '${q(subject.step_status0)}', ball = '${q(subject.step_ball0)}',
         completion_method = '${q(subject.step_method0)}',
         completed_at = ${subject.step_completed0 ? `'${q(subject.step_completed0)}'::timestamptz` : 'null'},
         needs_attention = ${subject.step_attention0 ? 'true' : 'false'},
         payload = '${q(JSON.stringify(subject.step_payload0 ?? {}))}'::jsonb
   where id = '${STEP}';
  update public.representation_requests set execution = '${q(ORIGINAL_EXECUTION)}'::jsonb where id = '${REQ}';`);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail > 0 ? 1 : 0);
