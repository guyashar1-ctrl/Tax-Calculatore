#!/usr/bin/env node
/**
 * staging-test-onboarding-resume.mjs — שער הרגרסיה של 191: קליטת הייצוג
 * ניתנת להמשך, צילום תעודה נדחה, והתכנסות עם «מסמכים מהלקוח».
 *
 * מה נבדק:
 *  1. שמירה במעבר שלב — הטיוטה חוזרת מ-get_onboarding (שלב, ערכים, זמן).
 *  2. אימות בשרת — ת.ז. שגויה / מפתח זר / שלב לא חוקי נדחים ולא כותבים.
 *  3. גבול הטוקן — טוקן שגוי אינו קורא ואינו כותב; טוקן של בקשה א' אינו
 *     נוגע בבקשה ב'.
 *  4. הגשה עם צילום נדחה — הבקשה עוברת ל-awaiting_accountant, הטיוטה נמחקת,
 *     identityDeferred נרשם, ובקשת «מסמכים מהלקוח» נפתחת עם פריט id_card.
 *  5. אחרי ההגשה — שמירה/פתיחה נדחות (הקישור אינו ערוץ כתיבה).
 *  6. העלאה מהדף האישי (סימולציה של מה ש-portal-upload-document כותב) ⇒
 *     identity_docs מתעדכן מעצמו.
 *  7. צילום בקליטה (onboarding_identity_doc_append) ⇒ פריט id_card בבקשת
 *     המסמכים נסגר מעצמו; כשזה הפריט האחרון — הבקשה מושלמת.
 *  8. בקשה ישנה בלי טיוטה — get_onboarding מחזירה draft ריק ועובדת.
 *  9. זיכרון הקישור של בן/בת הזוג חוזר ב-spouse_fill.
 *
 * הרצה: node scripts/staging-test-onboarding-resume.mjs   (דורש 191 על staging)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const row = (r) => (Array.isArray(r) ? r[0] : r);

const CLIENT_A = 'resume-client-a';
const CLIENT_B = 'resume-client-b';
const CLIENT_C = 'resume-client-c';
const REQ_A = 'resume-req-a';
const REQ_B = 'resume-req-b';
const REQ_C = 'resume-req-c';
const TOK_A = 'resume-tok-a-' + Math.random().toString(36).slice(2, 10);
const TOK_B = 'resume-tok-b-' + Math.random().toString(36).slice(2, 10);
const TOK_C = 'resume-tok-c-' + Math.random().toString(36).slice(2, 10);

async function cleanup() {
  await writeStaging(`
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in ('${CLIENT_A}','${CLIENT_B}','${CLIENT_C}'));
    delete from public.onboarding_steps where client_id in ('${CLIENT_A}','${CLIENT_B}','${CLIENT_C}');
    delete from public.documents where client_id in ('${CLIENT_A}','${CLIENT_B}','${CLIENT_C}');
    delete from public.representation_requests where id in ('${REQ_A}','${REQ_B}','${REQ_C}');
    delete from public.clients where id in ('${CLIENT_A}','${CLIENT_B}','${CLIENT_C}');`);
}

await cleanup();
await writeStaging(`
  insert into public.clients (id, user_id, first_name, last_name, email, representation_status, lifecycle_stage)
  values ('${CLIENT_A}', '${U}', 'ממתין', 'RESUME', 'delivered@resend.dev', 'pending_fill', 'onboarding'),
         ('${CLIENT_B}', '${U}', 'ממתין', 'RESUME', 'delivered@resend.dev', 'pending_fill', 'onboarding'),
         ('${CLIENT_C}', '${U}', 'ותיק', 'RESUME', 'delivered@resend.dev', 'pending_fill', 'onboarding');
  insert into public.representation_requests
    (id, user_id, linked_client_id, client_name, client_email, authorities, status, onboarding_token, onboarding_status, signers, scope, prefill)
  values
    ('${REQ_A}', '${U}', '${CLIENT_A}', 'ממתין RESUME', 'delivered@resend.dev', '{incomeTax}', 'pending_fill', '${TOK_A}', 'pending',
     '[{"id":"client","role":"client","signStatus":"pending","signToken":"resume-sign-a"}]'::jsonb,
     '{"incomeTax":{"status":"primary"}}'::jsonb, '{"firstName":"ישראל"}'::jsonb),
    ('${REQ_B}', '${U}', '${CLIENT_B}', 'ממתין RESUME', 'delivered@resend.dev', '{incomeTax}', 'pending_fill', '${TOK_B}', 'pending',
     '[{"id":"client","role":"client","signStatus":"pending","signToken":"resume-sign-b"}]'::jsonb,
     '{"incomeTax":{"status":"primary"}}'::jsonb, '{}'::jsonb),
    ('${REQ_C}', '${U}', '${CLIENT_C}', 'ותיק RESUME', 'delivered@resend.dev', '{incomeTax}', 'pending_fill', '${TOK_C}', 'pending',
     '[]'::jsonb, null, '{}'::jsonb);`);
// ‼ טריגר 109 יצר שלב representation לכל אחד. לבקשה C אין טיוטה ואין scope — «שורה ישנה».

console.log(`סביבה: ${STAGING_REF}\n`);

// ── 8 · שורה ישנה — get_onboarding עובדת ומחזירה draft ריק ─────────────────
{
  const { data, error } = await anon.rpc('get_onboarding', { p_token: TOK_C });
  const r = row(data);
  ok('8 בקשה ישנה נפתחת', !error && !!r && r.status === 'pending_fill', error?.message);
  ok('8 draft ריק בשורה ישנה', r && JSON.stringify(r.draft) === '{}', JSON.stringify(r?.draft));
  ok('8 spouse_fill ריק בשורה ישנה', r && JSON.stringify(r.spouse_fill) === '{}', JSON.stringify(r?.spouse_fill));
}

// ── 2/3 · «הקישור נפתח» + טוקן שגוי ─────────────────────────────────────────
{
  const { data: t } = await anon.rpc('touch_onboarding', { p_token: TOK_A });
  ok('2 touch על טוקן תקף מחזיר true', t === true, String(t));
  const { data: tBad } = await anon.rpc('touch_onboarding', { p_token: 'no-such-token' });
  ok('3 touch על טוקן שגוי מחזיר false', tBad === false, String(tBad));
  const r = await one(`select identification->'draft' as d from public.representation_requests where id = '${REQ_A}'`);
  ok('2 openedAt נרשם', !!r.d?.openedAt, JSON.stringify(r.d));
  const { data: g } = await anon.rpc('get_onboarding', { p_token: 'no-such-token' });
  ok('3 get_onboarding על טוקן שגוי ריק', !row(g), JSON.stringify(g));
}

// ── 1 · שמירת שלב 1 ומעבר ────────────────────────────────────────────────
{
  const { data, error } = await anon.rpc('save_onboarding_step', {
    p_token: TOK_A, p_step: 1,
    p_values: { firstName: 'ישראל', lastName: 'ישראלי', idNumber: '000000018', birthDate: '1990-05-05', secondaryType: 'driverLicense', secondaryValue: '1234567' },
  });
  ok('1 שמירת שלב 1 מצליחה', !error && data?.ok === true && data.step === 1, error?.message || JSON.stringify(data));
  const { data: g } = await anon.rpc('get_onboarding', { p_token: TOK_A });
  const r = row(g);
  ok('1 הטיוטה חוזרת עם שלב 1 והערכים', r?.draft?.step === 1 && r.draft.values?.lastName === 'ישראלי' && r.draft.values?.secondaryType === 'driverLicense',
    JSON.stringify(r?.draft));
  ok('1 identification עצמה לא קיבלה שדות הגשה', (await one(`select identification ? 'firstName' as f from public.representation_requests where id='${REQ_A}'`)).f === false);
}

// ── 1 · שלב 2 ואז חזרה לשלב 1 עם ערך שנמחק ───────────────────────────────
{
  const { data } = await anon.rpc('save_onboarding_step', {
    p_token: TOK_A, p_step: 2, p_values: { phone: '050-1234567', email: 'delivered@resend.dev', city: 'תל אביב', address: 'הרצל 1' },
  });
  ok('1 שמירת שלב 2 מעלה את השלב ל-2', data?.ok === true && data.step === 2, JSON.stringify(data));
  const { data: d2 } = await anon.rpc('save_onboarding_step', {
    p_token: TOK_A, p_step: 1, p_values: { firstName: 'ישראל', lastName: 'ישראלי', idNumber: '000000018', birthDate: '1990-05-05', secondaryType: 'passport', secondaryValue: '' },
  });
  const r = row((await anon.rpc('get_onboarding', { p_token: TOK_A })).data);
  ok('1 שמירה חוזרת של שלב 1 אינה מורידה את השלב', d2?.step === 2 && r?.draft?.step === 2, JSON.stringify(d2));
  ok('1 שדה שנמחק בשלב 1 יורד מהטיוטה, שלב 2 נשאר', r?.draft?.values?.secondaryValue === undefined
    && r.draft.values.secondaryType === 'passport' && r.draft.values.city === 'תל אביב', JSON.stringify(r?.draft?.values));
}

// ── 2 · אימות בשרת ───────────────────────────────────────────────────────
{
  const before = (await one(`select identification->'draft' as d from public.representation_requests where id = '${REQ_A}'`)).d;
  const { data: bad1 } = await anon.rpc('save_onboarding_step', { p_token: TOK_A, p_step: 1, p_values: { idNumber: '123456789' } });
  ok('2 ת.ז. בלי ספרת ביקורת נדחית', bad1?.ok === false && bad1.field === 'idNumber', JSON.stringify(bad1));
  const { data: bad2 } = await anon.rpc('save_onboarding_step', { p_token: TOK_A, p_step: 1, p_values: { representationStatus: 'active' } });
  ok('2 מפתח זר נדחה', bad2?.ok === false && bad2.error === 'field_not_allowed', JSON.stringify(bad2));
  const { data: bad3 } = await anon.rpc('save_onboarding_step', { p_token: TOK_A, p_step: 4, p_values: {} });
  ok('2 שלב 4 אינו נשמר כטיוטה', bad3?.ok === false && bad3.error === 'bad_step', JSON.stringify(bad3));
  const { data: bad4 } = await anon.rpc('save_onboarding_step', { p_token: TOK_A, p_step: 2, p_values: { email: 'לא-מייל' } });
  ok('2 מייל לא תקין נדחה', bad4?.ok === false && bad4.field === 'email', JSON.stringify(bad4));
  const { data: bad5 } = await anon.rpc('save_onboarding_step', { p_token: TOK_A, p_step: 1, p_values: { birthDate: '2999-01-01' } });
  ok('2 תאריך לידה עתידי נדחה', bad5?.ok === false && bad5.field === 'birthDate', JSON.stringify(bad5));
  const after = (await one(`select identification->'draft' as d from public.representation_requests where id = '${REQ_A}'`)).d;
  ok('2 שמירה שנדחתה לא כתבה דבר', JSON.stringify(before) === JSON.stringify(after));
}

// ── 3 · גבול הטוקן — B אינו נוגע ב-A ─────────────────────────────────────
{
  const { data } = await anon.rpc('save_onboarding_step', { p_token: TOK_B, p_step: 1, p_values: { firstName: 'פולש' } });
  ok('3 שמירה עם טוקן B מצליחה על B בלבד', data?.ok === true);
  const a = (await one(`select identification->'draft'->'values'->>'firstName' as f from public.representation_requests where id = '${REQ_A}'`)).f;
  const b = (await one(`select identification->'draft'->'values'->>'firstName' as f from public.representation_requests where id = '${REQ_B}'`)).f;
  ok('3 הטיוטה של A לא השתנתה', a === 'ישראל' && b === 'פולש', `${a} / ${b}`);
  const { data: bad } = await anon.rpc('save_onboarding_step', { p_token: 'no-such-token', p_step: 1, p_values: { firstName: 'x' } });
  ok('3 טוקן שגוי אינו כותב', bad?.ok === false && bad.error === 'invalid_token', JSON.stringify(bad));
}

// ── 9 · זיכרון הקישור של בן/בת הזוג ──────────────────────────────────────
{
  const { data } = await anon.rpc('request_spouse_onboarding', { p_token: TOK_A, p_spouse_email: null });
  const tok = row(data)?.spouse_token;
  ok('9 קישור לבן/בת הזוג נוצר', !!tok);
  const r = row((await anon.rpc('get_onboarding', { p_token: TOK_A })).data);
  ok('9 spouse_fill חוזר עם הטוקן ו-requestedAt', r?.spouse_fill?.token === tok && !!r.spouse_fill.requestedAt, JSON.stringify(r?.spouse_fill));
}

// ── 4 · הגשה עם צילום נדחה ────────────────────────────────────────────────
{
  const { data, error } = await anon.rpc('submit_onboarding_full', {
    p_token: TOK_A, p_first_name: 'ישראל', p_last_name: 'ישראלי', p_id_number: '000000018', p_birth_date: '1990-05-05',
    p_secondary_type: 'passport', p_secondary_value: 'P123', p_phone: '050-1234567', p_email: 'delivered@resend.dev',
    p_city: 'תל אביב', p_address: 'הרצל 1', p_family_status: 'single', p_family_status_year: null,
    p_spouse_name: null, p_spouse_email: null, p_spouse_id_number: null,
    p_identity_deferred: ['client'],
  });
  ok('4 הגשה עם צילום נדחה מתקבלת', !error && data === true, error?.message || String(data));
  const r = await one(`select status, onboarding_status, identification from public.representation_requests where id = '${REQ_A}'`);
  ok('4 הבקשה עברה ל-awaiting_accountant', r.status === 'awaiting_accountant' && r.onboarding_status === 'submitted', `${r.status}/${r.onboarding_status}`);
  ok('4 הטיוטה נמחקה, ההגשה נכתבה', !r.identification.draft && r.identification.firstName === 'ישראל', JSON.stringify(r.identification).slice(0, 160));
  ok('4 identityDeferred נרשם', JSON.stringify(r.identification.identityDeferred) === '["client"]' && !!r.identification.identityDeferredAt,
    JSON.stringify(r.identification.identityDeferred));
  const s = await one(`select id, status, ball, published_at, payload from public.onboarding_steps where client_id = '${CLIENT_A}' and step_type = 'client_documents'`);
  ok('4 נפתחה בקשת «מסמכים מהלקוח» מפורסמת', !!s?.id && s.published_at != null && s.ball === 'client', JSON.stringify(s?.payload).slice(0, 160));
  const item = (s?.payload?.checklist ?? []).find(x => x.key === 'id_card');
  ok('4 פריט id_card עם ניסוח לפי דרכון', !!item && item.done === false && item.label === 'צילום דרכון', JSON.stringify(item));
  const { data: g } = await anon.rpc('get_onboarding', { p_token: TOK_A });
  ok('4 אחרי ההגשה get_onboarding מחזירה draft ריק ו-already_submitted', row(g)?.already_submitted === true && JSON.stringify(row(g)?.draft) === '{}');
}

// ── 5 · אחרי ההגשה הקישור אינו ערוץ כתיבה ────────────────────────────────
{
  const { data } = await anon.rpc('save_onboarding_step', { p_token: TOK_A, p_step: 1, p_values: { firstName: 'מתחזה' } });
  ok('5 שמירה אחרי הגשה נדחית', data?.ok === false && data.error === 'already_submitted', JSON.stringify(data));
  const f = (await one(`select identification->>'firstName' as f from public.representation_requests where id = '${REQ_A}'`)).f;
  ok('5 ההגשה לא נדרסה', f === 'ישראל', f);
}

// ── 6 · העלאה מהדף האישי ⇒ identity_docs ─────────────────────────────────
{
  const s = await one(`select id, payload from public.onboarding_steps where client_id = '${CLIENT_A}' and step_type = 'client_documents'`);
  await writeStaging(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, uploaded_at, status, label_id)
    values ('resume-doc-portal', '${U}', '${CLIENT_A}', '${U}/${CLIENT_A}/resume-doc-portal', 'tz-portal.jpg', 'image/jpeg', 10, 'id_card', 'general', now(), 'received',
            public.ensure_reserved_document_label('${U}'));`);
  // בדיוק מה ש-portal-upload-document כותב על הפריט
  const list = s.payload.checklist.map(x => x.key === 'id_card' ? { ...x, done: true, documentId: 'resume-doc-portal', doneAt: new Date().toISOString() } : x);
  const remaining = list.filter(x => !x.done).length;
  await writeStaging(`
    update public.onboarding_steps
       set payload = payload || jsonb_build_object('checklist', '${JSON.stringify(list).replace(/'/g, "''")}'::jsonb)
           ${remaining === 0 ? ", status = 'completed', ball = 'me', completed_at = now()" : ''}
     where id = '${s.id}';`);
  const r = await one(`select identity_docs from public.representation_requests where id = '${REQ_A}'`);
  ok('6 הצילום מהדף האישי נרשם ב-identity_docs של הבקשה',
    Array.isArray(r.identity_docs?.client) && r.identity_docs.client[0]?.documentId === 'resume-doc-portal' && r.identity_docs.client[0]?.via === 'client_documents',
    JSON.stringify(r.identity_docs));
  // אידמפוטנטי — עדכון נוסף של אותו payload לא מכפיל
  await writeStaging(`update public.onboarding_steps set payload = payload || '{"touched":true}'::jsonb where id = '${s.id}'`);
  const r2 = await one(`select identity_docs from public.representation_requests where id = '${REQ_A}'`);
  ok('6 עדכון חוזר אינו מכפיל את הרישום', r2.identity_docs.client.length === 1, String(r2.identity_docs.client.length));
}

// ── 7 · צילום בקליטה ⇒ הפריט ב«מסמכים מהלקוח» נסגר ───────────────────────
{
  // בקשה B: מקבלת בקשת מסמכים רגילה (כמו שהמחולל יוצר) ואז צילום מגיע בקליטה
  await writeStaging(`
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values ('${U}', '${CLIENT_B}', 'client_documents', 'tools', 'person', 'pending', 'client', now(),
      '{"checklist":[{"key":"id_card","label":"צילום תעודת זהות","done":false},{"key":"bank_confirm","label":"אישור ניהול חשבון בנק","done":false}],"clientTitle":"להעלות 2 מסמכים"}'::jsonb);
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, uploaded_at, status, label_id)
    values ('resume-doc-onb', '${U}', '${CLIENT_B}', '${U}/${CLIENT_B}/resume-doc-onb', 'tz-onb.jpg', 'image/jpeg', 10, 'id_card', 'general', now(), 'received',
            public.ensure_reserved_document_label('${U}'));`);
  const { data, error } = await admin.rpc('onboarding_identity_doc_append', {
    p_request_id: REQ_B, p_person: 'client', p_entry: { documentId: 'resume-doc-onb', docKind: 'idCard', fileName: 'tz-onb.jpg', at: new Date().toISOString() },
  });
  ok('7 onboarding_identity_doc_append עובד', !error && data?.ok === true, error?.message || JSON.stringify(data));
  const s = await one(`select status, payload from public.onboarding_steps where client_id = '${CLIENT_B}' and step_type = 'client_documents'`);
  const item = s.payload.checklist.find(x => x.key === 'id_card');
  ok('7 פריט id_card נסגר עם documentId', item?.done === true && item.documentId === 'resume-doc-onb', JSON.stringify(item));
  ok('7 הבקשה עברה ל-in_progress (נשאר פריט אחד)', s.status === 'in_progress', s.status);
  ok('7 אין הכפלה ב-identity_docs מהטריגר ההפוך',
    (await one(`select jsonb_array_length(identity_docs->'client') as n from public.representation_requests where id = '${REQ_B}'`)).n === 1);
  // הגשה בלי דחייה כשהצילום כבר קיים — לא נפתח פריט נוסף
  const { data: sub } = await anon.rpc('submit_onboarding_full', {
    p_token: TOK_B, p_first_name: 'ישראלה', p_last_name: 'ישראלי', p_id_number: '000000000', p_birth_date: '1991-01-01',
    p_secondary_type: 'parentId', p_secondary_value: '000000018', p_phone: '050-1234567', p_email: 'delivered@resend.dev',
    p_city: 'חיפה', p_address: 'הרצל 2', p_family_status: 'single', p_family_status_year: null,
    p_spouse_name: null, p_spouse_email: null, p_spouse_id_number: null, p_identity_deferred: [],
  });
  ok('5 הגשה בלי דחייה (מערך ריק) מתקבלת', sub === true, String(sub));
  const s2 = await one(`select payload from public.onboarding_steps where client_id = '${CLIENT_B}' and step_type = 'client_documents'`);
  ok('5 לא נוסף פריט תעודה כפול', s2.payload.checklist.filter(x => x.key === 'id_card').length === 1 && s2.payload.checklist.length === 2);
  const r = await one(`select identification ? 'identityDeferred' as d from public.representation_requests where id = '${REQ_B}'`);
  ok('5 identityDeferred לא נכתב כשלא נדחה', r.d === false);
}

// ── 7ב · צילום בקליטה שהוא הפריט האחרון ⇒ הבקשה מושלמת ─────────────────
{
  await writeStaging(`
    insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values ('${U}', '${CLIENT_C}', 'client_documents', 'tools', 'person', 'pending', 'client', now(),
      '{"checklist":[{"key":"id_card","label":"צילום תעודת זהות","done":false}]}'::jsonb);
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, uploaded_at, status, label_id)
    values ('resume-doc-c', '${U}', '${CLIENT_C}', '${U}/${CLIENT_C}/resume-doc-c', 'tz-c.jpg', 'image/jpeg', 10, 'id_card', 'general', now(), 'received',
            public.ensure_reserved_document_label('${U}'));`);
  await admin.rpc('onboarding_identity_doc_append', {
    p_request_id: REQ_C, p_person: 'client', p_entry: { documentId: 'resume-doc-c', docKind: 'idCard', fileName: 'tz-c.jpg' },
  });
  const s = await one(`select status, ball, completed_at from public.onboarding_steps where client_id = '${CLIENT_C}' and step_type = 'client_documents'`);
  ok('7ב הפריט האחרון נסגר ⇒ הבקשה הושלמה והכדור אצלי', s.status === 'completed' && s.ball === 'me' && !!s.completed_at, `${s.status}/${s.ball}`);
}

// ── שומר הקבועים ─────────────────────────────────────────────────────────
{
  const r = await one(`select public.assert_domain_function_invariants() as r`);
  ok('שומר הקבועים תקין אחרי 191', r.r === 'ok', JSON.stringify(r));
}

await cleanup();
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
