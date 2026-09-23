#!/usr/bin/env node
/**
 * staging-test-btl-representation.mjs — השכבה שבה «קיימת בקשה» הופך (או לא
 * הופך) ל«הייצוג אושר»: הטריגר sync_btl_representation_from_job (187/190/195).
 *
 * הרקע — אירוע אמת, 23.09.2026, הדסה סלע (ת.ז. 34605212): ייפוי כוח נוצר
 * ידנית בפורטל ביטוח לאומי, PIVO מצאה אותו במסך המעקב, והעובד החזיר אסמכתא
 * ומועד **בלי הסטטוס שנקרא**. מסך המעקב אמר «ממתין לאישור» — ול-CRM לא
 * הייתה שום דרך לדעת זאת.
 *
 * הכלל שנבדק כאן, בנקודה שבה הוא נשמר בפועל:
 *   · רק status='approved' יוצר confirmedAt. שום ערך אחר, ושום ערך חסר.
 *   · אסמכתא ומועד מיושבים מכל קריאה שמצאה שורה — כולל בדיקה, כולל רישום
 *     שנוצר מחוץ ל-PIVO.
 *   · שלב «ייצוג בביטוח לאומי» אינו נסגר על בקשה שממתינה.
 *   · תוצאה ישנה שרצה באיחור לא דורסת ראיה חדשה יותר.
 *
 * ‼ סביבת הבדיקות בלבד (staging-lib חוסם פרודקשן). הבדיקה משחזרת את
 * ה-execution של הלקוח שבו השתמשה בסיום.
 *
 * הרצה:  node scripts/staging-test-btl-representation.mjs
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

// ── הלקוח שעליו רצות הבדיקות ───────────────────────────────────────────────
// ‼ בוחרים לקוח שכבר יש לו שלב «ייצוג בביטוח לאומי» לעצמו ומשתמשים בו:
// `onboarding_steps_authority_subject_open_idx` מונע שלב פתוח שני לאותה
// זהות (לקוח × רשות × נושא), וזה בדיוק הכלל שאסור לעקוף בבדיקה.
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
const JOB = 'fx-btl-job';

console.log(`לקוח הבדיקה: ${CID} · בקשה: ${REQ} · שלב: ${STEP}\n`);

/** מאפס את מסלול הביצוע ואת שלב הרשות לנקודת פתיחה ידועה. */
async function reset(track = {}) {
  await writeStaging(`
    delete from public.automation_jobs where id = '${JOB}';
    update public.onboarding_steps
       set status = 'pending', ball = 'me', completion_method = 'manual',
           completed_at = null, needs_attention = false
     where id = '${STEP}';
    update public.representation_requests
       set execution = jsonb_build_object('nationalInsurance', '${q(JSON.stringify(track))}'::jsonb)
     where id = '${REQ}';`);
}

/**
 * מריץ משימה שמסתיימת בהצלחה — בדיוק כמו העובד — ומחזיר את מסלול הביצוע
 * ואת שלב הרשות אחריה.
 * ‼ שני שלבים (queued ⇒ succeeded) כי הטריגר יושב על `after update`.
 */
async function runJob(actionType, result, { finishedAt = 'now()' } = {}) {
  await writeStaging(`
    delete from public.automation_jobs where id = '${JOB}';
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
    values ('${JOB}', '${USER_ID}', '${CID}', '${actionType}',
            '{"role":"client"}'::jsonb, 'queued');
    update public.automation_jobs
       set status = 'succeeded', result = '${q(JSON.stringify(result))}'::jsonb, finished_at = ${finishedAt}
     where id = '${JOB}';`);
  const r = await one(`
    select coalesce(r.execution -> 'nationalInsurance', '{}'::jsonb) as track,
           s.status as step_status, s.completed_at is not null as step_completed
      from public.representation_requests r
      left join public.onboarding_steps s on s.id = '${STEP}'
     where r.id = '${REQ}'`);
  return r;
}

// ══ 1 · האירוע עצמו: רישום קיים שממתין לאישור ═════════════════════════════
console.log('1 · «ממתין לאישור» — רישום שנוצר ידנית בפורטל ונמצא ביישוב');
{
  await reset();
  const r = await runJob('btl.create_representation', {
    role: 'client', referenceNumber: '75165449', deadline: '2026-11-22',
    found: true, status: 'pending', rawStatus: 'ממתין לאישור',
    reconciled: true, foundExternally: true,
  });
  eq('האסמכתא נשמרה', r.track.referenceNumber, '75165449');
  eq('המועד האחרון נשמר', r.track.deadline, '2026-11-22');
  eq('המצב החיצוני נשמר', r.track.externalState, 'pending');
  eq('הטקסט הגולמי נשמר לאבחון', r.track.rawExternalState, 'ממתין לאישור');
  ok('נרשם מתי נקרא', !!r.track.syncedAt);
  eq('מסומן שנוצר מחוץ ל-PIVO', r.track.foundExternally, true);
  eq('‼ אין אישור', r.track.confirmedAt, undefined);
  ok('ייפוי הכוח מסומן כקיים בב"ל', !!r.track.enteredAt);
  eq('‼ השלב לא נסגר', r.step_status, 'in_progress');
  eq('‼ ואין לו מועד השלמה', r.step_completed, false);
}

// ══ 2 · אישור אמיתי ═══════════════════════════════════════════════════════
console.log('\n2 · «מאושר» — הראיה החיובית היחידה');
{
  await reset({ enteredAt: '2026-09-01T00:00:00.000Z', referenceNumber: '75165449', deadline: '2026-11-22' });
  const r = await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', deadline: '2026-11-22',
    found: true, status: 'approved', rawStatus: 'מאושר',
  });
  ok('נכתב אישור', !!r.track.confirmedAt);
  eq('המצב החיצוני נשמר', r.track.externalState, 'approved');
  eq('המועד לא נזרק גם באישור', r.track.deadline, '2026-11-22');
  eq('השלב נסגר', r.step_status, 'completed');
  eq('ויש לו מועד השלמה', r.step_completed, true);
}

// ══ 3 · בדיקה שמיישבת רישום חיצוני ════════════════════════════════════════
console.log('\n3 · בדיקה מיישבת אסמכתא ומועד — גם בלעדיהם בכרטיס');
{
  await reset({ enteredAt: '2026-09-01T00:00:00.000Z' });
  const r = await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', deadline: '2026-11-22',
    found: true, status: 'pending', rawStatus: 'ממתין לאישור',
  });
  eq('האסמכתא יושבה מהבדיקה', r.track.referenceNumber, '75165449');
  eq('והמועד', r.track.deadline, '2026-11-22');
  eq('‼ עדיין בלי אישור', r.track.confirmedAt, undefined);
  eq('השלב התקדם ל«האסמכתא התקבלה», לא ל«הושלם»', r.step_status, 'in_progress');
}

// ══ 4 · אין רישום ═════════════════════════════════════════════════════════
console.log('\n4 · «לא נמצא» — אינו אישור ואינו מוחק את מה שידוע');
{
  await reset({ enteredAt: '2026-09-01T00:00:00.000Z', referenceNumber: '75165449', deadline: '2026-11-22' });
  const r = await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', found: false, status: 'not_found', reason: 'reference_not_found',
  });
  eq('המצב נרשם', r.track.externalState, 'not_found');
  eq('‼ אין אישור', r.track.confirmedAt, undefined);
  eq('האסמכתא השמורה לא נמחקה', r.track.referenceNumber, '75165449');
  eq('וגם לא המועד', r.track.deadline, '2026-11-22');
}

// ══ 5 · סטטוס חסר / לא צפוי ═══════════════════════════════════════════════
console.log('\n5 · סטטוס חסר או לא מוכר — לעולם לא אישור');
{
  await reset();
  const r = await runJob('btl.create_representation', {
    role: 'client', referenceNumber: '75165449', deadline: '2026-11-22', reconciled: true,
  });
  eq('בלי שדה status כלל ⇒ unknown', r.track.externalState, 'unknown');
  eq('‼ אין אישור', r.track.confirmedAt, undefined);
  eq('האסמכתא בכל זאת יושבה', r.track.referenceNumber, '75165449');
  eq('השלב לא נסגר', r.step_status, 'in_progress');
}
{
  await reset();
  const r = await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', found: true,
    status: 'APPROVED', rawStatus: 'משהו חדש שביטוח לאומי כתבה',
  });
  eq('ערך מחוץ לרשימה הסגורה מתנרמל ל-unknown', r.track.externalState, 'unknown');
  eq('‼ אין אישור', r.track.confirmedAt, undefined);
  eq('הטקסט הגולמי נשמר כדי שנוכל לזהות ניסוח חדש', r.track.rawExternalState, 'משהו חדש שביטוח לאומי כתבה');
}
{
  await reset();
  const r = await runJob('btl.check_representation', { role: 'client', referenceNumber: '75165449', found: true, status: null });
  eq('status=null ⇒ unknown', r.track.externalState, 'unknown');
  eq('‼ אין אישור', r.track.confirmedAt, undefined);
}

// ══ 6 · אסמכתא/מועד חסרים ═════════════════════════════════════════════════
console.log('\n6 · אסמכתא או מועד חסרים — לא מוחקים, לא ממציאים');
{
  await reset({ enteredAt: '2026-09-01T00:00:00.000Z', referenceNumber: '75165449', deadline: '2026-11-22' });
  const r = await runJob('btl.check_representation', {
    role: 'client', found: true, status: 'pending', rawStatus: 'ממתין לאישור',
  });
  eq('האסמכתא נשארה', r.track.referenceNumber, '75165449');
  eq('המועד נשאר', r.track.deadline, '2026-11-22');
  eq('‼ אין אישור', r.track.confirmedAt, undefined);
}

// ══ 7 · פג תוקף / בוטל ════════════════════════════════════════════════════
console.log('\n7 · «פג תוקף» ו«בוטל» — מצבים אמיתיים שאינם אישור');
for (const state of ['expired', 'cancelled']) {
  await reset({ enteredAt: '2026-09-01T00:00:00.000Z', referenceNumber: '75165449', deadline: '2026-11-22' });
  const r = await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', found: true, status: state, rawStatus: state,
  });
  eq(`${state} נרשם כמו שהוא`, r.track.externalState, state);
  eq(`${state} ‼ אינו אישור`, r.track.confirmedAt, undefined);
  eq(`${state} — השלב לא נסגר`, r.step_status, 'in_progress');
}

// ══ 8 · תוצאה ישנה שרצה באיחור ════════════════════════════════════════════
console.log('\n8 · משימה ישנה שהתעוררה מאוחר — לא דורסת ראיה חדשה יותר');
{
  await reset({ enteredAt: '2026-09-01T00:00:00.000Z', referenceNumber: '75165449' });
  await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', found: true, status: 'approved', rawStatus: 'מאושר',
  });
  const r = await runJob('btl.check_representation', {
    role: 'client', referenceNumber: '75165449', found: true, status: 'not_found',
  }, { finishedAt: `now() - interval '2 days'` });
  eq('המצב החדש יותר שרד', r.track.externalState, 'approved');
  ok('והאישור לא נמחק', !!r.track.confirmedAt);
}

// ══ 9 · נושא אחר ══════════════════════════════════════════════════════════
console.log('\n9 · נושא (role) לא תקין — שום כתיבה');
{
  await reset({ referenceNumber: '75165449' });
  await writeStaging(`
    delete from public.automation_jobs where id = '${JOB}';
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
    values ('${JOB}', '${USER_ID}', '${CID}', 'btl.check_representation', '{}'::jsonb, 'queued');
    update public.automation_jobs
       set status = 'succeeded', result = '{"status":"approved"}'::jsonb, finished_at = now()
     where id = '${JOB}';`);
  const r = await one(`select coalesce(execution -> 'nationalInsurance','{}'::jsonb) as track from public.representation_requests where id = '${REQ}'`);
  eq('‼ בלי role אין אישור — לא מנחשים "מי"', r.track.confirmedAt, undefined);
  eq('ולא נרשם מצב חיצוני', r.track.externalState, undefined);
}

// ── ניקוי ושחזור ───────────────────────────────────────────────────────────
await writeStaging(`
  delete from public.automation_jobs where id = '${JOB}';
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
