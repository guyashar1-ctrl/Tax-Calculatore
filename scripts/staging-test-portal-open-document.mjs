#!/usr/bin/env node
/**
 * staging-test-portal-open-document.mjs — שער האבטחה של פתיחת מסמך פרטי (144).
 *
 * הקובץ יושב ב-bucket פרטי, והפונקציה היא הדבר היחיד שעומד בינו לבין העולם.
 * לכן הבדיקה כאן אינה "האם זה עובד" אלא **מה נדחה**:
 *
 * PO-1  מסלול תקין → 302 לקישור חתום.
 * PO-2  טוקן של לקוח אחר → נדחה.
 * PO-3  מסמך שלא נשלח בבקשה הזאת → נדחה (גם כשהוא של אותו לקוח!).
 * PO-4  בקשה שעדיין לא פורסמה → נדחה.
 * PO-5  בקשה מבוטלת → נדחה.
 * PO-6  מסמך של לקוח אחר שנשתל בבקשה → נדחה.
 * PO-7  פרמטרים חסרים → נדחה.
 * PO-8  טוקן מומצא → נדחה.
 * PO-9  הקישור החתום באמת מחזיר את הקובץ.
 *
 * ‼ הכול על לקוחות דמה בסביבת הבדיקות בלבד, ונמחק בסוף.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
if (!env.VITE_SUPABASE_URL.includes(STAGING_REF)) {
  console.error('✋ .env.staging אינו מצביע לסביבת הבדיקות.'); process.exit(1);
}
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN = `${env.VITE_SUPABASE_URL}/functions/v1/portal-open-document`;

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const AS_USER = `select set_config('request.jwt.claims', json_build_object('sub','${USER_ID}','role','authenticated')::text, false);`;
const jrpc = async (expr) => JSON.parse((await one(`${AS_USER} select (${expr})::text as out;`)).out);

console.log(`סביבה: ${STAGING_REF}\n`);

const LAST = 'PO-אבטחה';
const cleanup = async () => {
  await writeStaging(`delete from public.clients where last_name = '${LAST}';`);
};
await cleanup();

const mkClient = async (first) => (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, portal_token)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', '${first}', '${LAST}',
          'delivered@resend.dev', '${randomBytes(16).toString('hex')}')
  returning id, portal_token;`));

const A = await mkClient('אלף');
const B = await mkClient('בית');

/** מסמך אמיתי: קובץ ב-Storage + שורה בטבלה, בדיוק כמו העלאה רגילה. */
const mkDoc = async (clientId, name, body) => {
  const id = randomUUID();
  const path = `${USER_ID}/${clientId}/${id}`;
  const { error } = await admin.storage.from('client-documents')
    .upload(path, new Blob([body], { type: 'text/plain' }), { contentType: 'text/plain', upsert: true });
  if (error) throw new Error(`העלאה נכשלה: ${error.message}`);
  await writeStaging(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year)
    values ('${id}', '${USER_ID}', '${clientId}', '${path}', '${name}', 'text/plain', ${body.length}, 'other', 'general');`);
  return { id, path };
};

const docA = await mkDoc(A.id, 'שומה של אלף.txt', 'MARKER-ALEF');
const docA2 = await mkDoc(A.id, 'מסמך שלא נשלח.txt', 'MARKER-SECRET');
const docB = await mkDoc(B.id, 'של בית.txt', 'MARKER-BET');

const mkRequest = async (clientId, resources, { published = true } = {}) => {
  const payload = {
    title: 'מסמכים מהמשרד', clientTitle: 'מסמכים מהמשרד',
    clientResources: resources,
    requirements: resources.map(r => ({ key: r.key, kind: 'confirm', label: `פתיחת ${r.label}`, done: false, required: true })),
  };
  const r = await jrpc(`public.create_onboarding_request('${clientId}', 'custom_request',
    $pl$${JSON.stringify(payload)}$pl$::jsonb, null, null, ${published}, false, 'client', null)`);
  if (!r.ok) throw new Error(`create נכשל: ${r.error}`);
  return r.stepId;
};

const res = (doc, key = 'a1') => ({ key, source: 'client', documentId: doc.id, label: 'מסמך', fileName: 'x.txt' });

const stepA = await mkRequest(A.id, [res(docA)]);
const draftA = await mkRequest(A.id, [res(docA)], { published: false });

const call = (params) => fetch(`${FN}?${new URLSearchParams(params)}`, { redirect: 'manual' });

// ── PO-1 · המסלול התקין ─────────────────────────────────────────────────────
let r = await call({ token: A.portal_token, stepId: stepA, docId: docA.id });
ok('PO-1 מסלול תקין מחזיר 302', r.status === 302, `status=${r.status}`);
const signed = r.headers.get('location');
ok('PO-1b הקישור החתום מצביע לקובץ הנכון',
  !!signed && signed.includes(docA.id) && signed.includes('token='), signed?.slice(0, 120));

// ── PO-9 · הקישור באמת עובד ─────────────────────────────────────────────────
if (signed) {
  const body = await (await fetch(signed)).text();
  ok('PO-9 הקישור החתום מחזיר את תוכן הקובץ', body === 'MARKER-ALEF', body.slice(0, 40));
} else { ok('PO-9 הקישור החתום מחזיר את תוכן הקובץ', false, 'אין Location'); }

// ── PO-2 · טוקן של לקוח אחר ─────────────────────────────────────────────────
r = await call({ token: B.portal_token, stepId: stepA, docId: docA.id });
ok('PO-2 טוקן של לקוח אחר נדחה', r.status !== 302 && r.status >= 400, `status=${r.status}`);

// ── PO-3 · מסמך של אותו לקוח שלא נשלח בבקשה ─────────────────────────────────
r = await call({ token: A.portal_token, stepId: stepA, docId: docA2.id });
ok('PO-3 מסמך שלא נשלח בבקשה נדחה', r.status === 403, `status=${r.status}`);

// ── PO-4 · בקשה שלא פורסמה ──────────────────────────────────────────────────
r = await call({ token: A.portal_token, stepId: draftA, docId: docA.id });
ok('PO-4 טיוטה נדחית', r.status === 403, `status=${r.status}`);

// ── PO-5 · בקשה מבוטלת ──────────────────────────────────────────────────────
await writeStaging(`update public.onboarding_steps set status='cancelled' where id='${stepA}';`);
r = await call({ token: A.portal_token, stepId: stepA, docId: docA.id });
ok('PO-5 בקשה מבוטלת נדחית', r.status === 409, `status=${r.status}`);
await writeStaging(`update public.onboarding_steps set status='waiting_client' where id='${stepA}';`);

// ── PO-6 · מסמך של לקוח אחר שנשתל בבקשה ─────────────────────────────────────
// ‼ הבדיקה החשובה: גם אם ה-payload מצהיר שהמסמך שייך לבקשה, הוא נבדק שוב מול
// הלקוח. בלי זה עריכה שגויה של בקשה הייתה חושפת תיק של לקוח אחר.
const stepCross = await mkRequest(A.id, [res(docB)]);
r = await call({ token: A.portal_token, stepId: stepCross, docId: docB.id });
ok('PO-6 מסמך של לקוח אחר נדחה גם כשהוא ברשימה', r.status === 404, `status=${r.status}`);

// ── PO-7 · פרמטרים חסרים ────────────────────────────────────────────────────
r = await call({ token: A.portal_token, stepId: stepA });
ok('PO-7 בלי docId נדחה', r.status === 400, `status=${r.status}`);

// ── PO-8 · טוקן מומצא ───────────────────────────────────────────────────────
r = await call({ token: 'deadbeef'.repeat(4), stepId: stepA, docId: docA.id });
ok('PO-8 טוקן מומצא נדחה', r.status === 403, `status=${r.status}`);

// ── ניקוי ───────────────────────────────────────────────────────────────────
await admin.storage.from('client-documents').remove([docA.path, docA2.path, docB.path]);
await cleanup();

console.log(`\n${fail === 0 ? '✓ הכול עבר' : '✗ נכשלו ' + fail}  ·  ${pass} עברו`);
process.exit(fail === 0 ? 0 : 1);
