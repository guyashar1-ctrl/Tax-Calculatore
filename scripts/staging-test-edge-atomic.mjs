#!/usr/bin/env node
/**
 * staging-test-edge-atomic.mjs — שער הרגרסיה של 174: כתיבות אטומיות מפונקציות
 * Edge ומהדוח השנתי.
 *
 * ‼ מה המבחן הזה שומר שלא יחזור:
 *
 *  PF12  חדר החתימה: שני חותמים בשני מכשירים באותה שנייה — מי שכתב שני דרס את
 *        החתימה של הראשון, ו-allSigned חושב ממערך ישן. עכשיו המיזוג בשרת
 *        (signing_session_apply) תחת נעילת שורה; אותו דפוס ב-identity_docs
 *        (onboarding_identity_doc_append).
 *  PF20  signing-session כתבה גם ל-clients.representation_status בקריאה
 *        נפרדת — הטריגר rep_requests_sync_client כבר גוזר את זה מהבקשה.
 *  N-P2  resend-webhook: חתימה בלי חותמת זמן = שידור חוזר. email.failed לא טופל.
 *  N-P2  weekly-backup: קובץ אחד לכל המשרדים, ודיווח לכולם. עכשיו לכל פרופיל.
 *  B6    שאלון המשרד: עד 200 כתיבות רופפות ואז המודל. עכשיו save_intake_answers.
 *  H6/B5 "התחל מחדש" רוקן מודל והשאיר תשובות. עכשיו restart_intake_session.
 *  B8    answered_by על כל תשובה.
 *
 * הרצה:  node scripts/staging-test-edge-atomic.mjs
 * דורש: מיגרציה 174 על staging, והפונקציות signing-session / onboarding-upload-id /
 *       resend-webhook / weekly-backup פרוסות שם (scripts/deploy-edge-function.mjs).
 * לא דורש seed-staging.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN = (name) => `${env.VITE_SUPABASE_URL}/functions/v1/${name}`;

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
// ‼ לקוח אנונימי באמת — לעולם לא מתחבר (ה-anon למעלה מחובר אחרי signIn).
const trulyAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

console.log(`סביבה: ${STAGING_REF}\n`);

const LAST = 'EDGEAT';
const CLIENT_A = 'edgeat-client-a';
const CLIENT_B = 'edgeat-client-b';
const REQ_SIGN = 'edgeat-req-sign';
const REQ_UPLOAD = 'edgeat-req-upload';
const RESEND_ID = 'edgeat-resend-1';
const INTAKE_TOKEN = 'edgeat-intake-' + randomBytes(8).toString('hex');
const today = new Date().toISOString().slice(0, 10);

async function cleanup() {
  // קבצים שהועלו בבדיקת צילום התעודה
  const { data: objs } = await admin.storage.from('client-documents').list(`${USER_ID}/${CLIENT_B}`);
  if (objs?.length) await admin.storage.from('client-documents').remove(objs.map((o) => `${USER_ID}/${CLIENT_B}/${o.name}`));
  await admin.storage.from('backups').remove([`${USER_ID}/backup-${today}.json`]);
  await writeStaging(`
    delete from public.email_messages where resend_id = ${q(RESEND_ID)} or kind = 'edgeat';
    delete from public.documents where client_id in (${q(CLIENT_A)}, ${q(CLIENT_B)});
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in (${q(CLIENT_A)}, ${q(CLIENT_B)}));
    delete from public.onboarding_steps where client_id in (${q(CLIENT_A)}, ${q(CLIENT_B)});
    delete from public.journey_stages where client_id in (${q(CLIENT_A)}, ${q(CLIENT_B)});
    delete from public.representation_requests where id in (${q(REQ_SIGN)}, ${q(REQ_UPLOAD)});
    delete from public.annual_report_sessions where client_id in (${q(CLIENT_A)}, ${q(CLIENT_B)});
    delete from public.clients where last_name = ${q(LAST)};`);
}
await cleanup();

try {
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values (${q(CLIENT_A)}, '${USER_ID}', 'חתימה', ${q(LAST)}, 'delivered@resend.dev'),
           (${q(CLIENT_B)}, '${USER_ID}', 'קליטה', ${q(LAST)}, 'delivered@resend.dev');`);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('— A · חדר החתימה: שני חותמים במקביל (PF12) ומצב הכרטיס נגזר (PF20) —');
  {
    const T1 = 'edgeat-sign-' + randomBytes(8).toString('hex');
    const T2 = 'edgeat-sign-' + randomBytes(8).toString('hex');
    const signers = [
      { id: 'client', role: 'client', name: 'הנישום', email: 'delivered@resend.dev', signStatus: 'pending', signToken: T1 },
      { id: 'spouse', role: 'spouse', name: 'בן הזוג', email: '', signStatus: 'pending', signToken: T2 },
    ];
    const docs = [{ key: 'incomeTax', title: 'ייפוי כוח', pdfDocId: 'edgeat-no-doc',
      fields: [{ id: 'f_client', signerId: 'client', kind: 'signature' }, { id: 'f_spouse', signerId: 'spouse', kind: 'signature' }] }];
    await writeStaging(`
      insert into public.representation_requests (id, user_id, linked_client_id, client_name, status, signers, signature_documents, signature_values)
      values (${q(REQ_SIGN)}, '${USER_ID}', ${q(CLIENT_A)}, 'חתימה EDGEAT', 'pending_signature',
              ${q(JSON.stringify(signers))}::jsonb, ${q(JSON.stringify(docs))}::jsonb, '{}'::jsonb);`);

    const submit = (token, fieldId) => fetch(FN('signing-session'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', token, values: { [fieldId]: { text: 'חתום ' + fieldId } } }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

    // ‼ שתי הבקשות יוצאות באותו רגע — בדיוק התרחיש של שני מכשירים.
    const [r1, r2] = await Promise.all([submit(T1, 'f_client'), submit(T2, 'f_spouse')]);
    ok('A1 שתי החתימות התקבלו (200)', r1.status === 200 && r2.status === 200,
      `${r1.status} ${JSON.stringify(r1.body)} / ${r2.status} ${JSON.stringify(r2.body)}`);
    ok('A2 בדיוק אחת מהן ראתה allSigned=true', (r1.body.allSigned === true) !== (r2.body.allSigned === true),
      `${r1.body.allSigned} / ${r2.body.allSigned}`);

    const row = await one(`
      select status, signers, signature_values,
             (select representation_status from public.clients where id = ${q(CLIENT_A)}) as client_status
        from public.representation_requests where id = ${q(REQ_SIGN)};`);
    const signed = (row.signers || []).filter((x) => x.signStatus === 'signed').map((x) => x.id).sort();
    ok('A3 שני החותמים מסומנים signed — אף חתימה לא אבדה', signed.join(',') === 'client,spouse', JSON.stringify(row.signers));
    ok('A4 ערכי החתימה של שניהם נשמרו', !!row.signature_values?.f_client && !!row.signature_values?.f_spouse, JSON.stringify(row.signature_values));
    ok('A5 הבקשה עברה ל-awaiting_stamp', row.status === 'awaiting_stamp', row.status);
    ok('A6 מצב הייצוג בכרטיס נגזר מהטריגר (בלי כתיבה מהפונקציה)', row.client_status === 'awaiting_stamp', String(row.client_status));

    const again = await submit(T1, 'f_client');
    ok('A7 חתימה חוזרת נדחית (409)', again.status === 409, `${again.status} ${JSON.stringify(again.body)}`);

    // ה-RPC עצמו: חותם לא קיים / בקשה לא קיימת / בקשה שלא ממתינה לחתימה
    const rpc = async (rid, sid, patch) => (await one(`select public.signing_session_apply(${q(rid)}, ${q(sid)}, ${q(JSON.stringify(patch))}::jsonb) as r;`)).r;
    ok('A8 RPC: בקשה לא קיימת → not_found', (await rpc('edgeat-nope', 'client', { sign: true })).error === 'not_found');
    ok('A9 RPC: בקשה שכבר לא ממתינה לחתימה → wrong_status', (await rpc(REQ_SIGN, 'client', { sign: true })).error === 'wrong_status');
    const anonRpc = await trulyAnon.rpc('signing_session_apply', { p_request_id: REQ_SIGN, p_signer_id: 'client', p_patch: {} });
    ok('A10 RPC סגור ל-anon', !!anonRpc.error, JSON.stringify(anonRpc.data));
    const userRpc = await user.rpc('signing_session_apply', { p_request_id: REQ_SIGN, p_signer_id: 'client', p_patch: {} });
    ok('A11 RPC סגור גם ל-authenticated (service_role בלבד)', !!userRpc.error, JSON.stringify(userRpc.data));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— B · צילום תעודה: הוספה למערך במקביל (PF12) —');
  {
    const ONB = 'edgeat-onb-' + randomBytes(8).toString('hex');
    await writeStaging(`
      insert into public.representation_requests (id, user_id, linked_client_id, client_name, status, onboarding_token, onboarding_status, identity_docs)
      values (${q(REQ_UPLOAD)}, '${USER_ID}', ${q(CLIENT_B)}, 'קליטה EDGEAT', 'pending_fill', ${q(ONB)}, 'pending', '{}'::jsonb);`);

    // שתי הוספות במקביל דרך ה-RPC (שני חיבורים נפרדים) — שתיהן חייבות לשרוד.
    const append = (person, n) => writeStaging(`select public.onboarding_identity_doc_append(${q(REQ_UPLOAD)}, ${q(person)},
      ${q(JSON.stringify({ documentId: 'edgeat-doc-' + n, docKind: 'idCard', at: new Date().toISOString() }))}::jsonb) as r;`);
    const [b1, b2] = await Promise.all([append('client', 1), append('client', 2)]);
    ok('B1 שתי ההוספות הצליחו', b1[0].r.ok === true && b2[0].r.ok === true, JSON.stringify([b1[0].r, b2[0].r]));
    const docsRow = await one(`select identity_docs from public.representation_requests where id = ${q(REQ_UPLOAD)};`);
    const ids = (docsRow.identity_docs?.client || []).map((d) => d.documentId).sort();
    ok('B2 שני הרישומים במערך — אף אחד לא נדרס', ids.join(',') === 'edgeat-doc-1,edgeat-doc-2', JSON.stringify(docsRow.identity_docs));
    ok('B3 המונה המוחזר משקף את המערך אחרי העדכון', Math.max(b1[0].r.count, b2[0].r.count) === 2);
    const bad = (await one(`select public.onboarding_identity_doc_append(${q(REQ_UPLOAD)}, 'other', '{}'::jsonb) as r;`)).r;
    ok('B4 אדם לא מוכר → bad_input', bad.error === 'bad_input');

    // מקצה לקצה דרך הפונקציה הפרוסה: קובץ קטן של "בן/בת הזוג"
    const form = new FormData();
    form.append('token', ONB);
    form.append('person', 'spouse');
    form.append('docKind', 'idCard');
    form.append('file', new File([Buffer.from('89504e470d0a1a0a', 'hex')], 'id.png', { type: 'image/png' }));
    const up = await fetch(FN('onboarding-upload-id'), { method: 'POST', body: form });
    const upBody = await up.json().catch(() => ({}));
    ok('B5 העלאה מקצה לקצה הצליחה', up.status === 200 && upBody.ok === true && upBody.count === 1, `${up.status} ${JSON.stringify(upBody)}`);
    const after = await one(`
      select identity_docs->'spouse' as sp,
             (select count(*)::int from public.documents where client_id = ${q(CLIENT_B)} and category = 'id_card') as docs
        from public.representation_requests where id = ${q(REQ_UPLOAD)};`);
    ok('B6 הרישום של בן/בת הזוג נוסף בלי לגעת ברישומי הלקוח', after.sp?.length === 1 && after.sp[0].documentId === upBody.documentId && after.docs === 1,
      JSON.stringify(after));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— C · resend-webhook: חותמת זמן, חתימה, ו-email.failed (N-P2) —');
  {
    // ‼ מריצים את אותו קוד שנפרס (webhook.ts) — node 24 מוריד טיפוסים בעצמו.
    const wh = await import(pathToFileURL(resolve(ROOT, 'supabase/functions/resend-webhook/webhook.ts')).href);
    const nowSec = Math.floor(Date.now() / 1000);
    ok('C1 חותמת זמן טרייה מתקבלת', wh.isFreshTimestamp(String(nowSec)) === true);
    ok('C2 חותמת זמן בת 4 דקות מתקבלת', wh.isFreshTimestamp(String(nowSec - 240), nowSec) === true);
    ok('C3 חותמת זמן בת 6 דקות נדחית (שידור חוזר)', wh.isFreshTimestamp(String(nowSec - 360), nowSec) === false);
    ok('C4 חותמת זמן מהעתיד (6 דקות) נדחית', wh.isFreshTimestamp(String(nowSec + 360), nowSec) === false);
    ok('C5 חותמת זמן לא-מספרית נדחית', wh.isFreshTimestamp('abc', nowSec) === false && wh.isFreshTimestamp('', nowSec) === false);

    const secretRaw = randomBytes(24);
    const secret = 'whsec_' + secretRaw.toString('base64');
    const payload = JSON.stringify({ type: 'email.failed', data: { email_id: RESEND_ID, failed: { reason: 'edgeat: mailbox unavailable' } } });
    const msgId = 'msg_edgeat';
    const ts = String(nowSec);
    const sig = 'v1,' + createHmac('sha256', secretRaw).update(`${msgId}.${ts}.${payload}`).digest('base64');
    ok('C6 חתימת Svix תקפה מאומתת', await wh.verifySvix(secret, msgId, ts, sig, payload) === true);
    ok('C7 גוף שהשתנה נדחה', await wh.verifySvix(secret, msgId, ts, sig, payload + ' ') === false);
    ok('C8 חותמת זמן שהשתנתה נדחית (החתימה מכסה אותה)', await wh.verifySvix(secret, msgId, String(nowSec - 1), sig, payload) === false);

    const failedPatches = wh.patchesForEvent('email.failed', '2026-01-01T00:00:00.000Z', JSON.parse(payload));
    ok('C9 email.failed → status=failed עם הסיבה', failedPatches.length === 1 && failedPatches[0].set.status === 'failed'
      && failedPatches[0].set.error === 'edgeat: mailbox unavailable', JSON.stringify(failedPatches));
    ok('C10 אירוע לא מוכר → בלי עדכון', wh.patchesForEvent('email.whatever', 'x', {}).length === 0);
    ok('C11 email.delivered לא דורס "נפתח"', wh.patchesForEvent('email.delivered', 'x', {})[0].where.some(([op, col, val]) => op === 'in' && col === 'status' && !val.includes('opened')));

    // אותם עדכונים מול המסד — בדיוק הלולאה של index.ts — על שורה שנשלחה
    await writeStaging(`
      insert into public.email_messages (user_id, client_id, to_email, subject, kind, status, resend_id, html)
      values ('${USER_ID}', ${q(CLIENT_A)}, 'delivered@resend.dev', 'EDGEAT', 'edgeat', 'sent', ${q(RESEND_ID)}, '<p>x</p>');`);
    for (const p of failedPatches) {
      let qb = admin.from('email_messages').update(p.set).eq('resend_id', RESEND_ID);
      for (const [op, col, val] of p.where) qb = op === 'eq' ? qb.eq(col, val) : op === 'in' ? qb.in(col, val) : qb.is(col, val);
      const { error } = await qb;
      if (error) throw error;
    }
    const em = await one(`select status, error from public.email_messages where resend_id = ${q(RESEND_ID)};`);
    ok('C12 השורה סומנה failed עם הסיבה', em.status === 'failed' && em.error === 'edgeat: mailbox unavailable', JSON.stringify(em));

    // הפונקציה הפרוסה: בלי סוד/עם חותמת ישנה — 401, לעולם לא 200
    const stale = await fetch(FN('resend-webhook'), { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'svix-id': msgId, 'svix-timestamp': String(nowSec - 3600), 'svix-signature': sig },
      body: payload });
    ok('C13 הפונקציה הפרוסה דוחה בקשה עם חותמת ישנה (401)', stale.status === 401, String(stale.status));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— D · save_intake_answers: הכל או כלום (B6), answered_by (B8) —');
  let oldSessionId;
  {
    const sess = await one(`
      insert into public.annual_report_sessions (user_id, client_id, tax_year, status, model, current_question_id)
      values ('${USER_ID}', ${q(CLIENT_A)}, 2025, 'in_progress', '{"taxYear":2025}'::jsonb, 'year_map')
      returning id;`);
    oldSessionId = sess.id;

    const m1 = { taxYear: 2025, identity: { maritalStatus: 'married' } };
    const r1 = await user.rpc('save_intake_answers', {
      p_session_id: oldSessionId, p_answers: { year_map: ['income'], marital_status: 'married' },
      p_model: m1, p_current_question_id: 'has_spouse', p_done: false });
    ok('D1 שמירת שתי תשובות + מודל מצליחה ומחזירה את הסשן', !r1.error && r1.data?.id === oldSessionId
      && r1.data?.current_question_id === 'has_spouse' && r1.data?.status === 'in_progress', r1.error?.message);
    const a1 = await one(`select count(*)::int as n, bool_and(answered_by = 'office') as office
                            from public.annual_report_answers where session_id = '${oldSessionId}' and superseded_by is null;`);
    ok('D2 שתי תשובות נכתבו עם answered_by=office', a1.n === 2 && a1.office === true, JSON.stringify(a1));

    // תשובה פסולה בתוך קבוצה — שום דבר לא נכתב, גם לא המודל
    const r2 = await user.rpc('save_intake_answers', {
      p_session_id: oldSessionId, p_answers: { has_spouse: true, '': false },
      p_model: { taxYear: 2025, poisoned: true }, p_current_question_id: 'x', p_done: false });
    ok('D3 מזהה שאלה ריק → שגיאה', !!r2.error && /bad_question_id/.test(r2.error.message), r2.error?.message);
    const r3 = await user.rpc('save_intake_answers', {
      p_session_id: oldSessionId, p_answers: { has_spouse: null },
      p_model: { taxYear: 2025, poisoned: true }, p_current_question_id: 'x', p_done: false });
    ok('D4 תשובה null → שגיאה', !!r3.error && /bad_answer/.test(r3.error.message), r3.error?.message);
    const st = await one(`
      select s.model, s.current_question_id,
             (select count(*)::int from public.annual_report_answers a where a.session_id = s.id and a.superseded_by is null) as n
        from public.annual_report_sessions s where s.id = '${oldSessionId}';`);
    ok('D5 אחרי הכשל: לא נכתבה אף תשובה ולא המודל (נשאר של D1)', st.n === 2 && !st.model.poisoned && st.model.identity?.maritalStatus === 'married'
      && st.current_question_id === 'has_spouse', JSON.stringify(st));

    // עדכון תשובה קיימת — לא שורה שנייה
    const r4 = await user.rpc('save_intake_answers', {
      p_session_id: oldSessionId, p_answers: { marital_status: 'single' },
      p_model: m1, p_current_question_id: 'has_spouse', p_done: null });
    const a4 = await one(`select count(*)::int as n, (select answer_value from public.annual_report_answers where session_id = '${oldSessionId}' and question_id = 'marital_status' and superseded_by is null) as v
                            from public.annual_report_answers where session_id = '${oldSessionId}' and superseded_by is null;`);
    ok('D6 תשובה חוזרת מעדכנת את הקיימת', !r4.error && a4.n === 2 && a4.v === 'single', JSON.stringify(a4));
    ok('D7 done=null לא נוגע בסטטוס ובשאלה הנוכחית', r4.data?.status === 'in_progress' && r4.data?.current_question_id === 'has_spouse', JSON.stringify(r4.data));

    // סיום
    const r5 = await user.rpc('save_intake_answers', {
      p_session_id: oldSessionId, p_answers: { has_spouse: false },
      p_model: m1, p_current_question_id: null, p_done: true });
    ok('D8 done=true → review עם completed_at', r5.data?.status === 'review' && !!r5.data?.completed_at, JSON.stringify(r5.data));

    const anonR = await trulyAnon.rpc('save_intake_answers', { p_session_id: oldSessionId, p_answers: { a: 1 }, p_model: {}, p_current_question_id: null, p_done: false });
    ok('D9 anon לא יכול לקרוא ל-save_intake_answers', !!anonR.error, JSON.stringify(anonR.data));
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— E · restart_intake_session: סשן חדש, הישן נשמר (H6/B5) —');
  {
    const r = await user.rpc('restart_intake_session', { p_session_id: oldSessionId, p_root_question_id: 'year_map', p_model: { taxYear: 2025 } });
    ok('E1 "התחל מחדש" מחזיר סשן חדש וריק', !r.error && r.data?.id && r.data.id !== oldSessionId && r.data.status === 'in_progress'
      && r.data.current_question_id === 'year_map' && r.data.client_id === CLIENT_A && r.data.tax_year === 2025, r.error?.message || JSON.stringify(r.data));
    const newId = r.data?.id;
    const st = await one(`
      select o.superseded_by = ${q(newId)}::uuid as linked, o.status as old_status,
             -- 181: תשובה שהשתנתה יוצרת שורת היסטוריה (superseded_by) — סופרים
             -- רק את החי, לא את כל מה שאי-פעם נכתב לסשן הזה.
             (select count(*)::int from public.annual_report_answers where session_id = o.id and superseded_by is null) as old_answers,
             (select count(*)::int from public.annual_report_answers where session_id = ${q(newId)}::uuid and superseded_by is null) as new_answers,
             (select count(*)::int from public.annual_report_sessions where client_id = ${q(CLIENT_A)} and tax_year = 2025 and superseded_by is null) as live
        from public.annual_report_sessions o where o.id = '${oldSessionId}';`);
    ok('E2 הישן מצביע לחדש (superseded_by) ושומר את הסטטוס שלו', st.linked === true && st.old_status === 'review', JSON.stringify(st));
    ok('E3 התשובות של הישן לא נגעו (3) והחדש ריק (0)', st.old_answers === 3 && st.new_answers === 0, JSON.stringify(st));
    ok('E4 בדיוק סשן חי אחד ללקוח+שנה', st.live === 1, String(st.live));

    // הקוראים של המסך רואים רק את החי
    const { data: found } = await user.from('annual_report_sessions').select('id').eq('client_id', CLIENT_A).eq('tax_year', 2025).is('superseded_by', null).maybeSingle();
    ok('E5 findSession (לקוח+שנה+חי) מחזיר את החדש בלבד', found?.id === newId);

    const again = await user.rpc('restart_intake_session', { p_session_id: oldSessionId });
    ok('E6 "התחל מחדש" על סשן שכבר הוחלף → שגיאה', !!again.error && /session_superseded/.test(again.error.message), again.error?.message);
    const dup = await writeStaging(`
      insert into public.annual_report_sessions (user_id, client_id, tax_year) values ('${USER_ID}', ${q(CLIENT_A)}, 2025)`).catch((e) => e);
    ok('E7 סשן חי שני לאותו לקוח+שנה נחסם (ייחודיות חלקית)', dup instanceof Error && /ars_live_client_year_uq/.test(dup.message), String(dup?.message).slice(0, 120));

    // הדף הציבורי: save_intake_answer דוחה סשן שהוחלף ומסמן answered_by=client בחי
    await writeStaging(`update public.clients set intake_token = ${q(INTAKE_TOKEN)}, intake_token_expires_at = now() + interval '1 day' where id = ${q(CLIENT_A)};`);
    const pubOld = (await one(`select public.save_intake_answer(${q(INTAKE_TOKEN)}, '${oldSessionId}', 'year_map', '["income"]'::jsonb, '{"taxYear":2025}'::jsonb, 'q2', false) as r;`)).r;
    const pubNew = (await one(`select public.save_intake_answer(${q(INTAKE_TOKEN)}, ${q(newId)}::uuid, 'year_map', '["income"]'::jsonb, '{"taxYear":2025}'::jsonb, 'q2', false) as r;`)).r;
    const by = await one(`select answered_by from public.annual_report_answers where session_id = ${q(newId)}::uuid and question_id = 'year_map';`);
    ok('E8 save_intake_answer: הסשן הישן נדחה, החי מתקבל, answered_by=client', pubOld === false && pubNew === true && by?.answered_by === 'client',
      JSON.stringify({ pubOld, pubNew, by }));
    const gi = (await one(`select session_id from public.get_intake(${q(INTAKE_TOKEN)});`));
    ok('E9 get_intake מחזיר את הסשן החי', gi?.session_id === newId || gi?.session_id == null,
      // ‼ get_intake מצטרף לשנת המס של המשרד (current_tax_year) — אם היא אינה 2025 אין סשן, וזה תקין.
      JSON.stringify(gi));
    const removed = (await one(`select public.reopen_intake(${q(INTAKE_TOKEN)}) as r;`)).r;
    const oldAfter = await one(`select status from public.annual_report_sessions where id = '${oldSessionId}';`);
    ok('E10 reopen_intake לא נוגע בסשן שהוחלף', oldAfter.status === 'review', `reopen=${removed} old=${oldAfter.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n— F · weekly-backup: קובץ לכל פרופיל (N-P2) —');
  {
    const sc = await import(pathToFileURL(resolve(ROOT, 'supabase/functions/weekly-backup/scope.ts')).href);
    ok('F1 שם האובייקט מתחיל במזהה המשתמש', sc.backupObjectName(USER_ID, '2026-09-15') === `${USER_ID}/backup-2026-09-15.json`);
    ok('F2 מזהה משתמש פסול נדחה', (() => { try { sc.backupObjectName('../x', '2026-09-15'); return false; } catch { return true; } })());
    ok('F3 כל 18 הטבלאות מתוחמות', sc.TABLES.length === 18 && sc.TABLES.every((t) => sc.TABLE_SCOPES[t]?.kind));
    ok('F4 authorized_users מתוחמת לכתובת של הפרופיל בלבד', sc.TABLE_SCOPES.authorized_users.kind === 'own_email');
    ok('F5 chunk מפצל רשימות ארוכות', sc.chunk([1, 2, 3, 4, 5], 2).length === 3);

    // ריצה יבשה על הפונקציה הפרוסה: מעלה לדלי, לא שולחת מייל.
    // ‼ דרך x-cron-secret, בדיוק כמו המתזמן בפרודקשן (כמו ב-staging-test-email-policy).
    const cronSecret = (await one(`select decrypted_secret as s from vault.decrypted_secrets
                                   where name = 'quotation_reminder_cron_secret' limit 1;`))?.s;
    const r = await fetch(FN('weekly-backup'), { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret || '' },
      body: JSON.stringify({ dryRun: true }) });
    const body = await r.json().catch(() => ({}));
    const mine = (body.backups || []).find((b) => b.userId === USER_ID);
    ok('F6 ריצה יבשה מחזירה גיבוי לכל פרופיל, כולל שלנו', r.status === 200 && Array.isArray(body.backups) && !!mine, `${r.status} ${JSON.stringify(body).slice(0, 300)}`);
    ok('F7 שם הקובץ בתיקיית המשתמש', mine?.filename === `${USER_ID}/backup-${today}.json` && mine?.uploadError == null, JSON.stringify(mine));
    ok('F8 בלי מייל בריצה יבשה', (body.backups || []).every((b) => b.notified == null));
    const expect = await one(`
      select (select count(*)::int from public.clients where user_id = '${USER_ID}') as clients,
             (select count(*)::int from public.email_messages where user_id = '${USER_ID}') as emails,
             (select count(*)::int from public.annual_report_answers a join public.annual_report_sessions s on s.id = a.session_id where s.user_id = '${USER_ID}') as answers,
             (select count(*)::int from public.profiles) as profiles;`);
    ok('F9 הספירות הן של המשתמש בלבד (לקוחות, מיילים, תשובות דרך הסשן)',
      mine?.counts?.clients === expect.clients && mine?.counts?.email_messages === expect.emails
      && mine?.counts?.annual_report_answers === expect.answers && mine?.counts?.profiles === 1,
      JSON.stringify({ got: mine?.counts, expect }));

    // תוכן הקובץ שהועלה: כל שורה עם user_id היא של המשתמש הזה
    const dl = await admin.storage.from('backups').download(`${USER_ID}/backup-${today}.json`);
    const dump = dl.data ? JSON.parse(await dl.data.text()) : null;
    const foreign = dump ? Object.entries(dump.tables).flatMap(([t, rows]) => rows.filter((row) => 'user_id' in row && row.user_id !== USER_ID).map(() => t)) : ['no dump'];
    ok('F10 הקובץ שהועלה מכיל רק שורות של המשתמש', dump?.userId === USER_ID && foreign.length === 0, JSON.stringify(foreign).slice(0, 200));

    const unauth = await fetch(FN('weekly-backup'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: true }) });
    ok('F11 בלי סוד/מפתח — 401', unauth.status === 401, String(unauth.status));
  }
} catch (e) {
  fail++;
  console.error('✗ חריגה:', e?.message || e);
} finally {
  await cleanup();
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
