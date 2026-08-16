#!/usr/bin/env node
/**
 * staging-test-lifecycle.mjs — מחזור החיים המלא, בהרצה אחת רציפה.
 *
 * ליד ⇢ הצעה ⇢ אישור ציבורי ⇢ ייצוג אוטומטי ⇢ השלמת ייצוג ⇢ רו"ח קודם ⇢
 * פייפרלס ⇢ הרשאת תשלום ⇢ שאלון ומסמכים ⇢ סגירה רגילה ⇢ לקוח פעיל.
 *
 * ‼ למה זה קיים בנפרד מהבדיקות האחרות: עד כה כל תחנה נבדקה — אבל על מצבים
 * שונים ובזמנים שונים. הרצה אחת רציפה על זריעה טרייה היא הראיה היחידה
 * ששרשרת שלמה עובדת מקצה לקצה, ולא שאוסף חלקים עבד כל אחד בתורו.
 *
 * ‼ לקוח דמה ייעודי (fx-q-life). אינו נוגע בעותק המבני של הנתונים האמיתיים
 * ואינו נוגע בלקוחות הדמה של שאר הבדיקות.
 *
 * הרצה:  node scripts/seed-staging.mjs && node scripts/staging-test-lifecycle.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const EMAIL = 'delivered+life@resend.dev';

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const step = async (cid, type) => await one(
  `select id, status, required_for_close, depends_on_step_id from public.onboarding_steps
    where client_id = ${q(cid)} and step_type = ${q(type)} limit 1`);

console.log(`סביבה: ${STAGING_REF}\n`);

// ── ניקוי הרצה קודמת ────────────────────────────────────────────────────────
await writeStaging(`
  create temp table if not exists lf as
    select distinct client_id as id from public.quotations where id = 'fx-q-life' and client_id is not null;
  delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from lf));
  delete from public.onboarding_steps where client_id in (select id from lf);
  delete from public.engagements where client_id in (select id from lf);
  delete from public.tasks where client_id in (select id from lf);
  delete from public.documents where client_id in (select id from lf);
  delete from public.representation_requests where linked_client_id in (select id from lf);
  delete from public.email_messages where client_id in (select id from lf);
  delete from public.clients where id in (select id from lf);
  delete from public.quotations where id = 'fx-q-life';
  delete from public.leads where id = 'fx-lead-life';`);

// ── 1 · ליד ─────────────────────────────────────────────────────────────────
console.log('— 1 · ליד —');
const token = randomBytes(16).toString('hex');
await writeStaging(`
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('fx-lead-life', '${USER_ID}', 'מחזור חיים דמה', ${q(EMAIL)}, '050-0000077', 'new', true);`);
ok('ליד נוצר', !!(await one(`select id from public.leads where id = 'fx-lead-life'`)));

// ── 2 · הצעה ────────────────────────────────────────────────────────────────
console.log('\n— 2 · הצעה —');
await writeStaging(`
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                 items, representation, vat_rate, expires_at, sent_at)
  values ('fx-q-life', '${USER_ID}', 'fx-lead-life', 'FX-LIFE', 'sent', ${q(token)},
    '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]'::jsonb,
    '{"enabled":true,"areas":{"incomeTax":true},"spouse":null,"prefill":{"firstName":"מחזור","lastName":"דמה","email":"${EMAIL}","phone":"050-0000077"}}'::jsonb,
    18, now() + interval '30 days', now());`);
const ens = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'fx-q-life' });
ok('כרטיס לקוח נולד עם שליחת ההצעה', ens.data?.ok !== false, JSON.stringify(ens.data));
const CID = (await one(`select client_id from public.quotations where id = 'fx-q-life'`)).client_id;
ok('להצעה יש כרטיס', !!CID);
const portalBefore = (await one(`select portal_token from public.clients where id = ${q(CID)}`)).portal_token;
ok('נטבע טוקן דף אישי', !!portalBefore);

// ‼ לקוחות קיימים אינם נרשמים ואינם מקבלים דבר בעקבות הזרימה הזאת.
const otherMailsBefore = (await one(
  `select count(*)::int as n from public.email_messages where client_id is distinct from ${q(CID)}`)).n;

// ── 3 · אישור ציבורי, בלי רו"ח מחובר ────────────────────────────────────────
console.log('\n— 3 · אישור ציבורי —');
const maxNet = (await one(`select coalesce(max(id),0)::bigint as m from net._http_response`)).m;
const appr = await anon.rpc('approve_quotation',
  { p_token: token, p_signature: null, p_signer_name: 'מחזור חיים דמה' });
ok('האישור עבר בלי משתמש מחובר', appr.data?.status === 'approved', JSON.stringify(appr.data ?? appr.error?.message));

// ── 4 · ייצוג אוטומטי מהשרת ─────────────────────────────────────────────────
console.log('\n— 4 · ייצוג אוטומטי —');
const rq = await one(`select representation_request_id from public.quotations where id = 'fx-q-life'`);
ok('נוצרה בקשת ייצוג', !!rq.representation_request_id);
const eng = await one(`select id, status from public.engagements where client_id = ${q(CID)}`);
ok('נוצרה התקשרות בקליטה', eng?.status === 'onboarding', String(eng?.status));
const nSteps = (await one(`select count(*)::int as n from public.onboarding_steps where client_id = ${q(CID)}`)).n;
ok('נוצרו שלבי קליטה', nSteps > 0, String(nSteps));
// ‼ הפוך מ-D1 המקורי (מיגרציה 102): המסד **אינו** שולח מייל ייצוג משלו.
// ההעברה לטופס הייצוג קורית בדפדפן של הלקוח, מיד אחרי האישור, דרך
// ה-onboardingToken שהפונקציה מחזירה. מייל שני היה כפילות מיותרת.
let dispatched = false;
for (let i = 0; i < 6 && !dispatched; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  dispatched = (await one(`select count(*)::int as n from net._http_response where id > ${maxNet}`)).n > 0;
}
ok('המסד אינו שולח מייל ייצוג משלו', dispatched === false);
ok('במקומו הוחזר onboardingToken שמעביר את הלקוח לטופס',
  typeof appr.data?.onboardingToken === 'string' && appr.data.onboardingToken.length > 0,
  JSON.stringify(Object.keys(appr.data ?? {})));
const repSent = await one(`select representation_sent_at from public.quotations where id = 'fx-q-life'`);
ok('representation_sent_at נשאר ריק — לא יצא מייל', repSent.representation_sent_at === null,
  String(repSent.representation_sent_at));

// ‼ מאז מיגרציה 102 אין שום מייל שיוצא מעצמו לאישור ההצעה. הבדיקה כאן
// מוודאת שגם לא נולד אחר במקומו — לא "כמעט אף אחד", אלא אף אחד.
const kinds = await writeStaging(
  `select distinct kind from public.email_messages where client_id = ${q(CID)}`);
ok('שום מייל ללקוח לא יצא מעצמו באישור ההצעה', kinds.length === 0,
  JSON.stringify(kinds.map((k) => k.kind)));
const otherMailsAfter = (await one(
  `select count(*)::int as n from public.email_messages where client_id is distinct from ${q(CID)}`)).n;
ok('לקוחות קיימים לא קיבלו דבר', otherMailsAfter === otherMailsBefore,
  `${otherMailsBefore} → ${otherMailsAfter}`);

// ── 5 · השלמת הייצוג ע"י הלקוח ──────────────────────────────────────────────
console.log('\n— 5 · השלמת ייצוג —');
await writeStaging(`update public.representation_requests set onboarding_status = 'submitted'
                     where id = ${q(rq.representation_request_id)};`);
ok('הייצוג סומן כמולא', (await one(
  `select onboarding_status from public.representation_requests where id = ${q(rq.representation_request_id)}`)
).onboarding_status === 'submitted');

// ── 6 · רו"ח קודם ───────────────────────────────────────────────────────────
console.log('\n— 6 · רו"ח קודם —');
const prevDet = await step(CID, 'prev_accountant_details');
const release0 = await step(CID, 'release_letter');
ok('מכתב השחרור נעול עד שיש פרטי רו"ח קודם',
  release0?.status === 'locked' && release0?.depends_on_step_id === prevDet?.id,
  `${release0?.status}`);
await writeStaging(`update public.clients set prev_accountant_name = 'רו״ח קודם דמה',
                      prev_accountant_email = 'delivered+prevlife@resend.dev' where id = ${q(CID)};`);
await user.rpc('advance_onboarding_step', { p_step_id: prevDet.id, p_action: 'complete', p_payload: {} });
const release1 = await step(CID, 'release_letter');
ok('אחרי הפרטים — מכתב השחרור נפתח', release1?.status === 'pending', String(release1?.status));

// ── 7 · פייפרלס לפני הרשאת תשלום ────────────────────────────────────────────
console.log('\n— 7 · פייפרלס לפני תשלום —');
const ret0 = await step(CID, 'retainer_authorization');
ok('הרשאת התשלום נעולה לפני הכרעת פייפרלס', ret0?.status === 'locked', String(ret0?.status));
const tryEarly = await user.rpc('advance_onboarding_step',
  { p_step_id: ret0.id, p_action: 'complete', p_payload: {} });
ok('אי אפשר להשלים תשלום לפני פייפרלס',
  tryEarly.data?.ok === false, JSON.stringify(tryEarly.data));
// ‼ אותם ארגומנטים בדיוק שהמסך שולח (OnboardingTab.submitTriage). קריאה עם
//   שם פרמטר אחר נכשלת בשקט ומשאירה את השלב נעול — נתפס בהרצה הראשונה.
const triage = await user.rpc('set_paperless_path', {
  p_client_id: CID,
  p_paperless_status: 'not_applicable',
  p_data_source: 'none',
  p_software_name: null,
});
ok('הכרעת הפייפרלס נשמרה', triage.data?.ok === true,
  JSON.stringify(triage.data ?? triage.error?.message));
const pap = await step(CID, 'paperless_connection');
ok('הדילוג נשמר עם סיבה',
  pap?.status === 'skipped' &&
  (await one(`select payload->>'skipReason' as r from public.onboarding_steps where id = ${q(pap.id)}`)).r === 'not_applicable');
ok('שדה הפייפרלס בכרטיס עודכן',
  (await one(`select paperless_status from public.clients where id = ${q(CID)}`)).paperless_status === 'not_applicable');

// ── 8 · הרשאת תשלום ─────────────────────────────────────────────────────────
console.log('\n— 8 · הרשאת תשלום —');
const ret1 = await step(CID, 'retainer_authorization');
ok('אחרי פייפרלס — הרשאת התשלום נפתחה', ret1?.status === 'pending', String(ret1?.status));
const payDone = await user.rpc('advance_onboarding_step',
  { p_step_id: ret1.id, p_action: 'complete', p_payload: { method: 'manual_arrangement' } });
ok('הרשאת התשלום הושלמה', payDone.data?.ok === true, JSON.stringify(payDone.data));

// ── 9 · שאלון ומסמכים ───────────────────────────────────────────────────────
console.log('\n— 9 · שאלון ומסמכים —');
const intake = await step(CID, 'intake_questionnaire');
ok('השאלון נוצר אוטומטית', !!intake?.id);
ok('השאלון רשות ואינו חוסם', intake?.required_for_close === false, String(intake?.required_for_close));
ok('השאלון נולד כטיוטה שאינה מפורסמת',
  (await one(`select payload->>'published' as p from public.onboarding_steps where id = ${q(intake.id)}`)).p === 'false');
await writeStaging(`insert into public.documents (id, user_id, client_id, file_name, file_type, file_size,
                      category, year, uploaded_at, storage_path)
                    values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', ${q(CID)},
                      'מסמך מחזור חיים.pdf', 'application/pdf', 1024, 'other', 'general', now(), 'x/y.pdf');`);
ok('מסמך נשמר', (await one(`select count(*)::int as n from public.documents where client_id = ${q(CID)}`)).n === 1);

// ── 10 · סגירה רגילה, בלי כפייה ─────────────────────────────────────────────
console.log('\n— 10 · סגירה רגילה —');
for (let round = 0; round < 6; round++) {
  const open = await writeStaging(
    `select id, step_type from public.onboarding_steps where client_id = ${q(CID)}
       and required_for_close and status not in ('completed','verified','skipped','cancelled')`);
  if (!open.length) break;
  for (const st of open) {
    let r = await user.rpc('advance_onboarding_step', { p_step_id: st.id, p_action: 'complete', p_payload: {} });
    if (r.data?.ok !== true) {
      r = await user.rpc('advance_onboarding_step',
        { p_step_id: st.id, p_action: 'skip', p_payload: { skipReason: 'בדיקת מחזור חיים' } });
    }
  }
}
const optionalOpen = await writeStaging(
  `select step_type from public.onboarding_steps where client_id = ${q(CID)}
     and status not in ('completed','verified','skipped','cancelled')`);
ok('נשארו שלבים אופציונליים פתוחים', optionalOpen.length > 0,
  JSON.stringify(optionalOpen.map((x) => x.step_type)));
const rdy = (await one(`select public.onboarding_close_readiness(${q(eng.id)}) as r`)).r;
ok('שלבים אופציונליים אינם חוסמים — ready=true', rdy.ready === true && rdy.blocking.length === 0,
  `ready=${rdy.ready} blocking=${rdy.blocking.length}`);
const closed = await user.rpc('close_onboarding',
  { p_engagement_id: eng.id, p_force: false, p_reason: null });
ok('הסגירה הרגילה מצליחה בלי כפייה', closed.data?.ok === true, JSON.stringify(closed.data));
const forced = (await one(
  `select count(*)::int as n from public.onboarding_events
    where engagement_id = ${q(eng.id)} and meta->>'forced' = 'true'`)).n;
ok('לא נרשמה כפייה', forced === 0, String(forced));

// ── 11 · לקוח פעיל — והכול שרד ──────────────────────────────────────────────
console.log('\n— 11 · לקוח פעיל —');
ok('ההתקשרות פעילה',
  (await one(`select status from public.engagements where id = ${q(eng.id)}`)).status === 'active');
ok('הלקוח פעיל',
  (await one(`select lifecycle_stage from public.clients where id = ${q(CID)}`)).lifecycle_stage === 'active');
ok('הבקשות האופציונליות שרדו כבקשות פתוחות',
  (await one(`select count(*)::int as n from public.onboarding_steps where client_id = ${q(CID)}
                and status not in ('completed','verified','skipped','cancelled')`)).n > 0);
ok('טוקן הדף האישי לא השתנה',
  (await one(`select portal_token from public.clients where id = ${q(CID)}`)).portal_token === portalBefore);
ok('המסמך שרד', (await one(`select count(*)::int as n from public.documents where client_id = ${q(CID)}`)).n === 1);
ok('היסטוריית ההצעה שרדה',
  (await one(`select count(*)::int as n from public.quotations where client_id = ${q(CID)}`)).n === 1);
ok('פרטי הרו"ח הקודם שרדו',
  !!(await one(`select prev_accountant_email from public.clients where id = ${q(CID)}`)).prev_accountant_email);
ok('כל הקישורים הציבוריים תקינים',
  (await one(`select public.public_link_health() as h`)).h.allHealthy === true);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
