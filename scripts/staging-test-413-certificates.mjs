#!/usr/bin/env node
/**
 * staging-test-413-certificates.mjs — 297: put_certificate ⇒ record_authority_certificate, מול המסד
 * והפונקציה האמיתיים של סביבת הבדיקות. שום פנייה לשע״ם — העובד מדומה (רישום מחשב + משימה רצה).
 *
 * נבדק: מסמך בתיקיית «אישורים ממס הכנסה» (וקובץ באחסון), השורות בכרטיס (withholding_status,
 * withholding_detail, withholding_valid_until, book_status), field_meta.<שדה>.cert עם מזהה המסמך,
 * שורות tax_fact_changes (shaam-413), קריאה חוזרת של אותה גרסה לא מכפילה, «אין אישור» לא כותב
 * «נפסל», ומשימה שאינה רצה ⇒ 403.
 *
 * הרצה:  node scripts/staging-test-413-certificates.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, STAGING_REF, writeStaging, loadEnv } from './staging-lib.mjs';

const USER = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const FN_URL = `https://${STAGING_REF}.supabase.co/functions/v1/automation-worker`;
const CLIENT = 'fx-297-client';
const JOB = 'fx-297-job';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const all = async (s) => (await writeStaging(s)) ?? [];
const one = async (s) => (await all(s))[0];
const q = (s) => String(s).replace(/'/g, "''");

// PDF מינימלי תקין (ללא נתוני לקוח).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const env = loadEnv('.env.staging');
const storage = (path) => fetch(`https://${STAGING_REF}.supabase.co/storage/v1/object/client-documents/${path}`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
});

const clean = () => writeStaging(`
  delete from public.tax_fact_changes where client_id = '${CLIENT}';
  delete from public.documents where client_id = '${CLIENT}';
  delete from public.document_folders where client_id = '${CLIENT}';
  delete from public.automation_jobs where id like 'fx-297-%';
  delete from public.clients where id = '${CLIENT}';
  delete from public.automation_workers where label = 'fx-297';
  delete from public.automation_workstation_pairings where label = 'fx-297';`);

const call = (headers, body) => fetch(FN_URL, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
}).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));

await clean();
let workerId = null;
try {
  await writeStaging(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
    values ('${CLIENT}', '${USER}', 'בדיקה', 'אישורים', 'fx297@example.invalid', 'active')`);

  // ── מחשב עבודה מדומה ──
  const code = 'FX297' + Math.random().toString(36).slice(2, 7).toUpperCase();
  await writeStaging(`insert into public.automation_workstation_pairings (code_hash, user_id, label, expires_at)
    values ('${createHash('sha256').update(code).digest('hex')}', '${USER}', 'fx-297', now() + interval '5 minutes')`);
  const reg = await call({}, { op: 'register', code, label: 'fx-297' });
  workerId = reg.body?.workerId;
  const H = { 'x-worker-id': workerId, 'x-worker-token': reg.body?.token, 'x-worker-instance': 'fx297-1' };
  ok('רישום מחשב מדומה', !!workerId && !!reg.body?.token, JSON.stringify(reg.body));

  await writeStaging(`insert into public.automation_jobs (id, user_id, client_id, action_type, input, status, claimed_by, claimed_at, lease_until, attempts, max_attempts)
    values ('${JOB}', '${USER}', '${CLIENT}', 'shaam.sync_income_tax_file', '{}'::jsonb, 'running', '${q(workerId)}', now(), now() + interval '5 minutes', 1, 3)`);

  const withholding = {
    kind: 'withholding', year: 2026, status: 'valid', statusText: 'יש אישור (יזום)',
    validFrom: '2026-10-25', validUntil: '2027-03-31', updatedOn: '2026-10-25',
    rates: [{ section: 'שירותים', rate: 5 }, { section: 'שכר', rate: 5 }, { section: 'שכירות', rate: 5 }],
    ratesText: '5% · שירותים, שכר, שכירות', newBusiness: true, issued: true, note: 'עסק חדש — 5% הוא השיעור הנמוך ביותר שמותר',
  };
  console.log('1 · אישור ניכוי בתוקף');
  const r1 = await call(H, { op: 'put_certificate', workerId, jobId: JOB, certificate: withholding, contentBase64: PDF.toString('base64') });
  ok('put_certificate הצליח', r1.status === 200 && r1.body?.ok && !!r1.body.documentId, JSON.stringify(r1.body));
  const docId = r1.body?.documentId;
  const doc = await one(`select d.id, d.file_name, d.year, d.storage_path, d.description, f.system_key, f.name as folder
    from public.documents d left join public.document_folders f on f.id = d.folder_id where d.id = '${q(docId)}'`);
  ok('מסמך בתיקיית «אישורים ממס הכנסה»', doc?.system_key === 'shaam-certificates' && doc?.folder === 'אישורים ממס הכנסה', JSON.stringify(doc));
  ok('שם וקובץ: «אישור ניכוי מס במקור 2026» · בתוקף עד', doc?.file_name === 'אישור ניכוי מס במקור 2026.pdf' && doc?.year === '2026' && doc?.description === 'בתוקף עד 31.03.2027', JSON.stringify(doc));
  const file = doc ? await storage(doc.storage_path) : null;
  ok('הקובץ באחסון', file?.status === 200 && (await file.arrayBuffer()).byteLength === PDF.length);
  let c = await one(`select withholding_status, withholding_detail, withholding_valid_until::text as until, field_meta->'withholdingStatus' as meta from public.clients where id = '${CLIENT}'`);
  ok('הכרטיס: שיעורים לפי פעילות + פירוט + תוקף', c?.withholding_status === 'rates' && c?.withholding_detail === withholding.ratesText && c?.until === '2027-03-31', JSON.stringify(c));
  ok('field_meta.cert עם מזהה המסמך והמקור', c?.meta?.cert?.documentId === docId && c?.meta?.cert?.status === 'valid' && c?.meta?.source === 'automation', JSON.stringify(c?.meta));
  const log = await all(`select field_key, status, source_ref from public.tax_fact_changes where client_id = '${CLIENT}' order by field_key`);
  ok('יומן: שתי שורות accepted · shaam-413', log.length === 2 && log.every(l => l.status === 'accepted' && l.source_ref === 'shaam-413'), JSON.stringify(log));

  console.log('2 · אותה גרסה שוב — לא מכפיל');
  const r2 = await call(H, { op: 'put_certificate', workerId, jobId: JOB, certificate: withholding, contentBase64: PDF.toString('base64') });
  const docs = await one(`select count(*)::int as n from public.documents where client_id = '${CLIENT}'`);
  const log2 = await one(`select count(*)::int as n from public.tax_fact_changes where client_id = '${CLIENT}'`);
  ok('אותו מסמך, בלי שורות יומן נוספות', r2.body?.documentId === docId && docs?.n === 1 && log2?.n === 2, JSON.stringify({ r2: r2.body, docs, log2 }));

  console.log('3 · ניהול ספרים: אין אישור ⇒ לא «נפסל»; בתוקף ⇒ תקין');
  await call(H, { op: 'put_certificate', workerId, jobId: JOB, certificate: { kind: 'bookkeeping', year: 2026, status: 'none', statusText: 'ממתין לייזום' } });
  c = await one(`select book_status, field_meta->'bookStatus'->'cert'->>'status' as st from public.clients where id = '${CLIENT}'`);
  ok('«אין אישור» נרשם, book_status לא נכתב', c?.book_status == null && c?.st === 'none', JSON.stringify(c));
  const r3 = await call(H, { op: 'put_certificate', workerId, jobId: JOB, contentBase64: PDF.toString('base64'),
    certificate: { kind: 'bookkeeping', year: 2026, status: 'valid', statusText: 'יש אישור (יזום)', validFrom: '2026-10-25', validUntil: '2027-03-31', updatedOn: '2026-10-25' } });
  c = await one(`select book_status, field_meta->'bookStatus'->'cert'->>'documentId' as d from public.clients where id = '${CLIENT}'`);
  ok('ניהול ספרים בתוקף ⇒ kosher + מסמך', c?.book_status === 'kosher' && c?.d === r3.body?.documentId && !!c?.d, JSON.stringify({ c, r3: r3.body }));

  console.log('4 · אין אישור ניכוי ⇒ none');
  await call(H, { op: 'put_certificate', workerId, jobId: JOB, certificate: { kind: 'withholding', year: 2026, status: 'none', statusText: 'ממתין לייזום' } });
  c = await one(`select withholding_status, withholding_valid_until from public.clients where id = '${CLIENT}'`);
  ok('withholding_status = none, התוקף נמחק', c?.withholding_status === 'none' && c?.withholding_valid_until == null, JSON.stringify(c));

  console.log('5 · גבול: משימה שאינה רצה');
  await writeStaging(`update public.automation_jobs set status = 'succeeded', finished_at = now() where id = '${JOB}'`);
  const r5 = await call(H, { op: 'put_certificate', workerId, jobId: JOB, certificate: withholding, contentBase64: PDF.toString('base64') });
  ok('403 not_owner_or_finished', r5.status === 403 && r5.body?.error === 'not_owner_or_finished', JSON.stringify(r5));
  const r6 = await call(H, { op: 'put_certificate', workerId, jobId: JOB, certificate: { kind: 'other' } });
  ok('סוג לא מוכר ⇒ 400', r6.status === 400);
} finally {
  // הקבצים באחסון
  const paths = await all(`select storage_path from public.documents where client_id = '${CLIENT}'`);
  if (paths.length) {
    await fetch(`https://${STAGING_REF}.supabase.co/storage/v1/object/client-documents`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: paths.map(p => p.storage_path) }),
    }).catch(() => {});
  }
  await clean();
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
