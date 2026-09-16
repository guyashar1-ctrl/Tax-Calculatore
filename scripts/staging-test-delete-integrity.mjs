#!/usr/bin/env node
/**
 * staging-test-delete-integrity.mjs — שערי הרגרסיה של מיגרציה 169 (אשכול E).
 *
 * ‼ מה נבדק:
 *  D2   מחיקת מסמך מנקה את המזהה שלו מכל payload של שלב (checklist,
 *       requirements, clientResources, bulkUploads) ומעמודות ה-jsonb של בקשת
 *       הייצוג; פריט שכל הראיה שלו נמחקה חוזר ל-done=false. הקובץ באחסון
 *       נמחק דרך ה-API בלבד (Supabase חוסמת DELETE ב-SQL) — delete_client
 *       מחזירה את הנתיבים והקורא מוחק אותם, גם אחרי שהשורות ירדו.
 *  D1   העברת מסמך ללקוח אחר מזיזה את הקובץ (move) — הישן נעלם, החדש קיים.
 *  D-P2 העלאה שהרשומה שלה נכשלה (FK) — הקובץ מוסר ואינו נשאר יתום.
 *  A6/A10 קישור בני זוג הוא כתיבה אחת לשני הצדדים; מסרב לקישור שלישי; ניתוק
 *       מנקה את שניהם; מחיקת כרטיס מקושר מנקה את הצד השני.
 *  C5   delete_client מבטל הצעות שטרם אושרו (עם אירוע), מוחק בקשות ייצוג,
 *       מסרב כשיש התקשרות חיה בלי p_force, ומשאיר הצעה מאושרת כפי שהיא.
 *  אבטחה: anon אמיתי (לא מחובר) ומשתמש זר נדחים.
 *
 * ‼ הפעולות שהדפדפן עושה דרך ה-API (העלאה, move, מחיקה) נעשות כאן דרך
 * supabase-js כמשתמש מחובר — אותו מסלול ואותן מדיניות RLS כמו בפרודקשן.
 *
 * הרצה:  node scripts/staging-test-delete-integrity.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging as writeStagingRaw, assertTriggersEnabled } from './staging-lib.mjs';

/** ‼ ה-Management API מוגבל בקצב וכמה סוויטות רצות במקביל — 429 אינו כישלון של הבדיקה. */
async function writeStaging(query) {
  for (let attempt = 0; ; attempt++) {
    try { return await writeStagingRaw(query); }
    catch (e) {
      if (e.http !== 429 || attempt >= 6) throw e;
      await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}
for (let attempt = 0; ; attempt++) {
  try { await assertTriggersEnabled(); break; }
  catch (e) { if (attempt >= 6) throw e; await new Promise(r => setTimeout(r, 10000)); }
}
const env = loadEnv('.env.staging');
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const BUCKET = 'client-documents';
const PFX = 'delint';

const login = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await login.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
// ‼ לקוח anon אמיתי — לעולם לא מתחבר (ראה זיכרון: ה-anon "המשותף" בסקריפטים ישנים מחובר בפועל).
const trulyAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const uid = () => `${PFX}-${crypto.randomUUID()}`;
const AS = (u) => `select set_config('request.jwt.claims', json_build_object('sub','${u}','role','authenticated')::text, false);`;
const asUser = (u, sql) => writeStaging(`${AS(u)} set role authenticated; ${sql}`);

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  // ‼ קבצים נמחקים רק דרך ה-API (protect_objects_delete חוסם DELETE ב-SQL)
  const leftovers = await writeStaging(`select name from storage.objects where bucket_id = '${BUCKET}' and name like '%/${PFX}-%';`);
  if (leftovers?.length) await user.storage.from(BUCKET).remove(leftovers.map(r => r.name));
  await writeStaging(`
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'DELINT');
    delete from public.representation_requests where id like '${PFX}-%';
    delete from public.engagements where client_id in (select id from public.clients where last_name = 'DELINT');
    delete from public.clients where last_name = 'DELINT';
    delete from public.quotations where id like '${PFX}-%';
    delete from public.leads where id like '${PFX}-%';
    delete from auth.users where email = 'delint-other@test.local';`);
}
await cleanup();

// ‼ D4 (179): documents.label_id הוא NOT NULL — כל שורת בדיקה כאן צריכה תווית.
const TEST_LABEL_ID = (await one(`
  insert into public.document_labels (user_id, name) values ('${U}', 'DELINT-תווית-בדיקה')
  on conflict (user_id, name) do update set name = excluded.name
  returning id;`)).id;

async function mkClient(first, extra = '') {
  return (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email ${extra ? ',' + extra.split('=')[0] : ''})
    values (${q(uid())}, '${U}', ${q(first)}, 'DELINT', 'delivered@resend.dev' ${extra ? ',' + extra.split('=')[1] : ''})
    returning id;`)).id;
}

/** העלאה כמו saveDoc בדפדפן: קובץ ואז רשומה. */
async function uploadDoc(clientId, label) {
  const id = uid();
  const path = `${U}/${clientId}/${id}`;
  const { error: upErr } = await user.storage.from(BUCKET)
    .upload(path, new Blob([`delint ${label}`], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { error } = await user.from('documents').insert({
    id, user_id: U, client_id: clientId, storage_path: path, file_name: `${label}.txt`,
    file_type: 'text/plain', file_size: 10, category: 'other', year: 'general',
    label_id: TEST_LABEL_ID, description: label, notes: '', uploaded_at: new Date().toISOString(),
  });
  if (error) throw new Error(`documents insert: ${error.message}`);
  return { id, path };
}
const objectExists = async (path) =>
  (await one(`select exists(select 1 from storage.objects where bucket_id='${BUCKET}' and name=${q(path)}) as e;`)).e;
const docExists = async (id) =>
  (await one(`select exists(select 1 from public.documents where id=${q(id)}) as e;`)).e;

try {
  // ═══ 1 · מחיקת מסמך מנקה הפניות ═══════════════════════════════════════════
  console.log('— 1 · מסמך שנמחק נעלם מכל מקום —');
  const A = await mkClient('אלף');
  const D1 = await uploadDoc(A, 'd1');
  const D2 = await uploadDoc(A, 'd2');
  const D3 = await uploadDoc(A, 'd3');

  const payload = {
    checklist: [
      { key: 'c1', label: 'א', done: true, documentId: D1.id, doneAt: '2026-01-01' },
      { key: 'c2', label: 'ב', done: true, optional: true, documentIds: [D1.id, D2.id], lastUploadAt: '2026-01-01' },
      { key: 'c3', label: 'ג', done: true, doneAt: '2026-01-01' },
    ],
    requirements: [
      { key: 'r1', kind: 'file', label: 'קובץ', done: true, documentId: D1.id, doneAt: '2026-01-01' },
      { key: 'res1', kind: 'confirm', label: 'פתיחת מסמך', done: false, required: true },
      { key: 'res2', kind: 'confirm', label: 'פתיחת מסמך 2', done: false, required: true },
    ],
    clientResources: [
      { key: 'res1', source: 'client', documentId: D1.id, label: 'מסמך', fileName: 'd1.txt' },
      { key: 'res2', source: 'client', documentId: D2.id, label: 'מסמך 2', fileName: 'd2.txt' },
    ],
    bulkUploads: [{ documentId: D1.id, fileName: 'd1.txt', at: '2026-01-01' }],
    removedUploads: [],
  };
  const stepId = (await one(`
    insert into public.onboarding_steps (id, user_id, client_id, step_type, track, scope, status, ball, payload, draft_payload)
    values (${q(uid())}, '${U}', '${A}', 'materials_received', 'custom', 'person', 'pending', 'client',
            ${q(JSON.stringify(payload))}::jsonb, ${q(JSON.stringify({ requirements: payload.requirements }))}::jsonb)
    returning id;`)).id;

  const reqId = uid();
  await writeStaging(`
    insert into public.representation_requests (id, user_id, linked_client_id, client_name, status,
      submission, identity_docs, signature_documents, signature_setup, signed_pdf_path)
    values (${q(reqId)}, '${U}', '${A}', 'DELINT', 'awaiting_accountant',
      ${q(JSON.stringify({ firstName: 'א', uploadedDocs: [
        { docItemId: 'id_card', storedDocId: D1.id, fileName: 'd1.txt', fileSize: 10 },
        { docItemId: 'other', storedDocId: D2.id, fileName: 'd2.txt', fileSize: 10 }] }))}::jsonb,
      ${q(JSON.stringify({ client: [{ documentId: D1.id, docKind: 'id_card' }, { documentId: D3.id, docKind: 'license' }], spouse: [] }))}::jsonb,
      ${q(JSON.stringify([
        { key: 'person:client', title: 'מס הכנסה', pdfDocId: D3.id, pdfFileName: 'd3', fields: [], createdAt: '2026-01-01', signedPdfStoredId: D2.id },
        { key: 'person:spouse', title: 'מע"מ', pdfDocId: D1.id, pdfFileName: 'd1', fields: [], createdAt: '2026-01-01' }]))}::jsonb,
      ${q(JSON.stringify({ pdfDocId: D3.id, pdfFileName: 'd3', fields: [], createdAt: '2026-01-01' }))}::jsonb,
      ${q(D2.id)});`);

  // מחיקה כמו בדפדפן (deleteDoc): קובץ דרך ה-API ואז השורה
  {
    const { error: rmErr } = await user.storage.from(BUCKET).remove([D1.path]);
    ok('1.0 הקובץ נמחק דרך ה-API', !rmErr, rmErr?.message);
    const { error } = await user.from('documents').delete().eq('id', D1.id).eq('user_id', U);
    ok('1.0 השורה נמחקה', !error && !(await docExists(D1.id)), error?.message);
  }
  const st = (await one(`select payload, draft_payload from public.onboarding_steps where id=${q(stepId)};`));
  const cl = Object.fromEntries(st.payload.checklist.map(i => [i.key, i]));
  ok('1.1 checklist: הפריט שהראיה היחידה שלו נמחקה — בלי documentId ו-done=false',
    cl.c1.documentId === undefined && cl.c1.done === false && cl.c1.doneAt === undefined, JSON.stringify(cl.c1));
  ok('1.2 checklist: פריט עם כמה מסמכים — המזהה יורד, השאר נשארים, done לא זז',
    JSON.stringify(cl.c2.documentIds) === JSON.stringify([D2.id]) && cl.c2.done === true, JSON.stringify(cl.c2));
  ok('1.3 checklist: פריט שסומן ידנית אינו נוגע', cl.c3.done === true && cl.c3.doneAt === '2026-01-01', JSON.stringify(cl.c3));
  const rq = Object.fromEntries(st.payload.requirements.map(i => [i.key, i]));
  ok('1.4 requirements: דרישת קובץ חוזרת ל-done=false', rq.r1 && rq.r1.documentId === undefined && rq.r1.done === false, JSON.stringify(rq.r1));
  ok('1.5 clientResources: המשאב ודרישת הפתיחה שלו ירדו; השני נשאר',
    st.payload.clientResources.length === 1 && st.payload.clientResources[0].key === 'res2' && !rq.res1 && !!rq.res2,
    JSON.stringify({ res: st.payload.clientResources, keys: Object.keys(rq) }));
  ok('1.6 bulkUploads (124) התרוקן', Array.isArray(st.payload.bulkUploads) && st.payload.bulkUploads.length === 0, JSON.stringify(st.payload.bulkUploads));
  const dr = Object.fromEntries(st.draft_payload.requirements.map(i => [i.key, i]));
  ok('1.7 גם draft_payload נוקה', dr.r1 && dr.r1.documentId === undefined && dr.r1.done === false, JSON.stringify(dr.r1));

  const rr = await one(`select submission, identity_docs, signature_documents, signature_setup, signed_pdf_path
                          from public.representation_requests where id=${q(reqId)};`);
  ok('1.8 בקשה: uploadedDocs בלי המסמך שנמחק', rr.submission.uploadedDocs.length === 1 && rr.submission.uploadedDocs[0].storedDocId === D2.id,
    JSON.stringify(rr.submission.uploadedDocs));
  ok('1.9 בקשה: identity_docs בלי המסמך שנמחק, השאר נשאר',
    rr.identity_docs.client.length === 1 && rr.identity_docs.client[0].documentId === D3.id && Array.isArray(rr.identity_docs.spouse),
    JSON.stringify(rr.identity_docs));
  ok('1.10 בקשה: טופס החתימה שה-PDF שלו נמחק ירד; הראשון נשאר עם החתום שלו',
    rr.signature_documents.length === 1 && rr.signature_documents[0].pdfDocId === D3.id && rr.signature_documents[0].signedPdfStoredId === D2.id,
    JSON.stringify(rr.signature_documents));
  ok('1.11 בקשה: השדות הישנים משקפים את המסמך הראשון', rr.signature_setup?.pdfDocId === D3.id && rr.signed_pdf_path === D2.id,
    JSON.stringify({ setup: rr.signature_setup, signed: rr.signed_pdf_path }));

  // ‼ מחיקה ב-SQL בלבד (כמו CASCADE של מחיקת לקוח): Supabase חוסמת מחיקת
  // קבצים ב-SQL, ולכן הקובץ נשאר — וזה בדיוק למה delete_client מחזירה נתיבים
  // (נבדק ב-5.4). כאן מוודאים שהמסלול הזה לא נשבר (הטריגר לא נוגע באחסון).
  ok('1.12 לפני: הקובץ של d2 קיים באחסון', await objectExists(D2.path));
  await writeStaging(`delete from public.documents where id = ${q(D2.id)};`);
  ok('1.13 מחיקת שורה ב-SQL עוברת (הטריגר אינו נוגע ב-storage.objects)', !(await docExists(D2.id)));
  { const { error } = await user.storage.from(BUCKET).remove([D2.path]); ok('1.13b הקובץ נמחק דרך ה-API', !error && !(await objectExists(D2.path)), error?.message); }
  const rr2 = await one(`select signature_documents, signed_pdf_path, submission from public.representation_requests where id=${q(reqId)};`);
  ok('1.14 ה-PDF החתום שנמחק מתאפס בטופס ובשדה הישן',
    rr2.signature_documents[0].signedPdfStoredId === null && rr2.signed_pdf_path === null && rr2.submission.uploadedDocs.length === 0,
    JSON.stringify({ docs: rr2.signature_documents, signed: rr2.signed_pdf_path }));

  // ═══ 2 · העברה ללקוח אחר מזיזה את הקובץ ══════════════════════════════════
  console.log('\n— 2 · העברת מסמך ללקוח אחר (moveDocToClient) —');
  const B = await mkClient('בית');
  const D4 = await uploadDoc(A, 'd4');
  const to = `${U}/${B}/${D4.id}`;
  {
    const { error: mvErr } = await user.storage.from(BUCKET).move(D4.path, to);
    ok('2.1 move דרך ה-API מצליח', !mvErr, mvErr?.message);
    const { error } = await user.from('documents').update({ client_id: B, storage_path: to, folder_id: null })
      .eq('id', D4.id).eq('user_id', U);
    ok('2.2 הרשומה עודכנה', !error, error?.message);
    ok('2.3 הקובץ קיים בנתיב החדש ולא בישן', (await objectExists(to)) && !(await objectExists(D4.path)));
    const { data: dl, error: dlErr } = await user.storage.from(BUCKET).download(to);
    ok('2.4 והוא נפתח (אין 404)', !dlErr && dl && (await dl.text()) === 'delint d4', dlErr?.message);
  }

  // ═══ 3 · העלאה שהרשומה שלה נכשלה — אין קובץ יתום ═════════════════════════
  console.log('\n— 3 · העלאה בלי רשומה (FK נכשל) —');
  {
    const id = uid();
    const path = `${U}/${A}/${id}`;
    const { error: upErr } = await user.storage.from(BUCKET).upload(path, new Blob(['orphan']), { upsert: true });
    ok('3.1 הקובץ עלה', !upErr, upErr?.message);
    const { error } = await user.from('documents').insert({
      id, user_id: U, client_id: `req-${id}`, storage_path: path, file_name: 'x', file_type: 'text/plain', file_size: 6,
      category: 'other', year: 'general', label_id: TEST_LABEL_ID });
    ok('3.2 רשומה עם מזהה לקוח שאינו קיים נכשלת ב-FK (23503)', error?.code === '23503', JSON.stringify(error));
    // הפיצוי שהדפדפן עושה עכשיו ב-saveDoc
    const { error: rmErr } = await user.storage.from(BUCKET).remove([path]);
    ok('3.3 הפיצוי מסיר את הקובץ', !rmErr && !(await objectExists(path)), rmErr?.message);
  }

  // ═══ 4 · קישור בני זוג ═══════════════════════════════════════════════════
  console.log('\n— 4 · קישור וניתוק בני זוג —');
  const C = await mkClient('גימל');
  await writeStaging(`update public.clients set spouse_represented_elsewhere = true where id = ${q(A)};`);
  {
    const { data, error } = await user.rpc('link_spouse_clients', { p_a: A, p_b: B });
    ok('4.1 link מחזיר ok', !error && data?.ok === true, error?.message ?? JSON.stringify(data));
    const r = await one(`select a.spouse_client_id as a_to, b.spouse_client_id as b_to, a.spouse_represented_elsewhere as a_elsewhere
                           from public.clients a, public.clients b where a.id=${q(A)} and b.id=${q(B)};`);
    ok('4.2 שני הצדדים מקושרים, "מיוצג במקום אחר" ירד', r.a_to === B && r.b_to === A && r.a_elsewhere === false, JSON.stringify(r));
    const again = await user.rpc('link_spouse_clients', { p_a: B, p_b: A });
    ok('4.3 קישור חוזר של אותו זוג — אידמפוטנטי', again.data?.ok === true, JSON.stringify(again.data));
    const third = await user.rpc('link_spouse_clients', { p_a: A, p_b: C });
    ok('4.4 קישור לאדם שלישי נדחה (already_linked)', third.data?.ok === false && third.data?.error === 'already_linked', JSON.stringify(third.data));
    const same = await user.rpc('link_spouse_clients', { p_a: A, p_b: A });
    ok('4.5 קישור לעצמו נדחה', same.data?.ok === false, JSON.stringify(same.data));
    const un = await user.rpc('unlink_spouse_clients', { p_a: B });
    const r2 = await one(`select a.spouse_client_id as a_to, b.spouse_client_id as b_to from public.clients a, public.clients b where a.id=${q(A)} and b.id=${q(B)};`);
    ok('4.6 ניתוק מנקה את שני הצדדים', un.data?.ok === true && un.data?.partner === A && r2.a_to === null && r2.b_to === null, JSON.stringify({ un: un.data, r2 }));
    // שריד חד-כיווני (כמו שהקוד הישן היה משאיר) — הניתוק מנקה גם אותו
    await writeStaging(`update public.clients set spouse_client_id = ${q(A)} where id = ${q(C)};`);
    await user.rpc('unlink_spouse_clients', { p_a: A });
    const r3 = await one(`select spouse_client_id from public.clients where id=${q(C)};`);
    ok('4.7 ניתוק מנקה גם שריד חד-כיווני שמצביע אל הכרטיס', r3.spouse_client_id === null, JSON.stringify(r3));
  }

  // ═══ 5 · מחיקת כרטיס מקושר מנקה את הצד השני ═════════════════════════════
  console.log('\n— 5 · מחיקת בן/בת זוג מקושר/ת —');
  {
    await user.rpc('link_spouse_clients', { p_a: A, p_b: B });
    const pv = await user.rpc('delete_client_preview', { p_client_id: B });
    ok('5.1 התצוגה המקדימה מציגה את הקישור ואת המסמך', pv.data?.ok === true && pv.data?.spouse_client_id === A && pv.data?.documents === 1, JSON.stringify(pv.data));
    const del = await user.rpc('delete_client', { p_client_id: B, p_force: false });
    ok('5.2 delete_client מצליח', !del.error && del.data?.ok === true, del.error?.message ?? JSON.stringify(del.data));
    const r = await one(`select (select spouse_client_id from public.clients where id=${q(A)}) as a_to,
                                exists(select 1 from public.clients where id=${q(B)}) as b_exists;`);
    ok('5.3 הצד השני נוקה והכרטיס נמחק', r.a_to === null && r.b_exists === false, JSON.stringify(r));
    ok('5.4 השורה נמחקה בגרירה והשרת החזיר את נתיב הקובץ', !(await docExists(D4.id))
      && Array.isArray(del.data?.storage_paths) && del.data.storage_paths.includes(to), JSON.stringify(del.data?.storage_paths));
    // מה שהדפדפן עושה עם הרשימה (useClients.deleteClient): מחיקה דרך ה-API אחרי שהשורות ירדו
    const { error: rmErr } = await user.storage.from(BUCKET).remove(del.data.storage_paths);
    ok('5.5 הקבצים נמחקים דרך ה-API גם אחרי שהשורה והלקוח כבר לא קיימים', !rmErr && !(await objectExists(to)), rmErr?.message);
  }

  // ═══ 6 · delete_client: הצעות, בקשות ייצוג, התקשרות חיה ═════════════════
  console.log('\n— 6 · מחיקת לקוח עם הצעות ובקשות —');
  {
    const leadId = uid();
    const qSent = uid(), qDraft = uid(), qApproved = uid();
    await writeStaging(`
      insert into public.leads (id, user_id, full_name, email, status, converted_client_id)
      values (${q(leadId)}, '${U}', 'ליד DELINT', 'delivered@resend.dev', 'converted', ${q(C)});
      insert into public.quotations (id, user_id, lead_id, client_id, quotation_number, status, public_token, items, vat_rate, sent_at)
      values (${q(qSent)}, '${U}', ${q(leadId)}, ${q(C)}, 'DELINT-S', 'sent', ${q(uid())}, '[]'::jsonb, 18, now()),
             (${q(qDraft)}, '${U}', ${q(leadId)}, ${q(C)}, 'DELINT-D', 'draft', ${q(uid())}, '[]'::jsonb, 18, null);
      insert into public.representation_requests (id, user_id, linked_client_id, client_name, status)
      values (${q(reqId + '-c')}, '${U}', ${q(C)}, 'DELINT', 'pending_fill');
      update public.quotations set representation_request_id = ${q(reqId + '-c')} where id = ${q(qSent)};`);

    const pv = await user.rpc('delete_client_preview', { p_client_id: C });
    ok('6.1 תצוגה מקדימה: 2 הצעות פתוחות, בקשה אחת, ליד אחד',
      pv.data?.quotations_open === 2 && pv.data?.requests === 1 && pv.data?.leads === 1 && pv.data?.live_engagements === 0, JSON.stringify(pv.data));
    const del = await user.rpc('delete_client', { p_client_id: C, p_force: false });
    ok('6.2 המחיקה מצליחה ומדווחת', del.data?.ok === true && del.data?.quotations_cancelled === 2 && del.data?.requests_deleted === 1, JSON.stringify(del.data));
    const qs = await writeStaging(`select id, status, client_id, representation_request_id, events from public.quotations where id in (${q(qSent)}, ${q(qDraft)}) order by id;`);
    ok('6.3 ההצעות בוטלו עם אירוע client_deleted, בלי לקוח ובלי מצביע לבקשה',
      qs.length === 2 && qs.every(x => x.status === 'cancelled' && x.client_id === null && x.representation_request_id === null
        && x.events.some(e => e.type === 'client_deleted')), JSON.stringify(qs));
    ok('6.4 בקשת הייצוג נמחקה', !(await one(`select exists(select 1 from public.representation_requests where id=${q(reqId + '-c')}) as e;`)).e);
    ok('6.5 הכרטיס נמחק', !(await one(`select exists(select 1 from public.clients where id=${q(C)}) as e;`)).e);
    const lead = await one(`select status, converted_client_id from public.leads where id=${q(leadId)};`);
    ok('6.6 הליד נשאר, בלי מצביע ללקוח (השבת הסטטוס — טריגר של אשכול D)', lead && lead.converted_client_id === null, JSON.stringify(lead));

    // התקשרות חיה על הצעה מאושרת
    const D = await mkClient('דלת');
    const engId = uid();
    await writeStaging(`
      insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, vat_rate, approved_at)
      values (${q(qApproved)}, '${U}', ${q(D)}, 'DELINT-A', 'approved', ${q(uid())}, '[]'::jsonb, 18, now());
      insert into public.engagements (id, user_id, client_id, quotation_id, status, monthly_total)
      values (${q(engId)}, '${U}', ${q(D)}, ${q(qApproved)}, 'onboarding', 100);`);
    const pv2 = await user.rpc('delete_client_preview', { p_client_id: D });
    ok('6.7 תצוגה מקדימה: התקשרות חיה + הצעה מאושרת', pv2.data?.live_engagements === 1 && pv2.data?.quotations_approved === 1, JSON.stringify(pv2.data));
    const refused = await user.rpc('delete_client', { p_client_id: D, p_force: false });
    ok('6.8 בלי force — מסרב (active_engagement) ולא מוחק',
      refused.data?.ok === false && refused.data?.error === 'active_engagement'
        && (await one(`select exists(select 1 from public.clients where id=${q(D)}) as e;`)).e, JSON.stringify(refused.data));
    const forced = await user.rpc('delete_client', { p_client_id: D, p_force: true });
    const after = await one(`select (select status from public.quotations where id=${q(qApproved)}) as q_status,
                                    (select client_id from public.quotations where id=${q(qApproved)}) as q_client,
                                    exists(select 1 from public.engagements where id=${q(engId)}) as eng_exists,
                                    exists(select 1 from public.clients where id=${q(D)}) as c_exists;`);
    ok('6.9 עם force — נמחק; ההצעה המאושרת נשארת approved בלי לקוח (הכרעת מוצר פתוחה); ההתקשרות נמחקה בגרירה',
      forced.data?.ok === true && forced.data?.forced === true && after.q_status === 'approved' && after.q_client === null
        && after.eng_exists === false && after.c_exists === false, JSON.stringify({ forced: forced.data, after }));
  }

  // ═══ 7 · אבטחה ══════════════════════════════════════════════════════════
  console.log('\n— 7 · הרשאות —');
  {
    const E = await mkClient('הא');
    const other = (await one(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
              'delint-other@test.local', '', now(), now(), now()) returning id;`)).id;
    for (const [name, args] of [
      ['delete_client', { p_client_id: E, p_force: true }],
      ['delete_client_preview', { p_client_id: E }],
      ['link_spouse_clients', { p_a: E, p_b: A }],
      ['unlink_spouse_clients', { p_a: E }],
    ]) {
      const r = await trulyAnon.rpc(name, args);
      ok(`7.1 anon לא מחובר נדחה — ${name}`, !!r.error, JSON.stringify(r.data));
      let denied = false;
      try {
        const rr = await asUser(other, `select public.${name}(${Object.values(args).map(q).join(', ')}) as r;`);
        denied = rr?.[0]?.r?.ok === false && rr[0].r.error === 'forbidden';
      } catch (e) { denied = /forbidden|42501/.test(e.message); }
      ok(`7.2 משתמש זר נדחה — ${name}`, denied);
    }
    ok('7.3 הכרטיס עדיין קיים אחרי כל הניסיונות', (await one(`select exists(select 1 from public.clients where id=${q(E)}) as e;`)).e);
  }

  // ═══ 8 · שומר הקבועים ═══════════════════════════════════════════════════
  const inv = await one('select public.assert_domain_function_invariants() as r;');
  ok('8 assert_domain_function_invariants', inv.r === 'ok', JSON.stringify(inv));
} catch (e) {
  fail++;
  console.error('✗ חריגה:', e.message);
} finally {
  await cleanup();
}

console.log(`\nסיכום: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
