#!/usr/bin/env node
/**
 * staging-test-document-copy-independence.mjs — שער הרגרסיה של הכרעת מוצר D3.
 *
 * ‼ מה נבדק — משכפל בדיוק את הרצף של duplicateDocToClient
 * (src/hooks/useDocumentStore.ts): storage.copy ואז insert של שורה חדשה.
 *  1  לעותק יש id ונתיב-אחסון עצמאיים לגמרי — לא רק שורה שמצביעה לאותו קובץ.
 *  2  מיד אחרי השכפול, הבייטים בעותק זהים למקור.
 *  3  עריכת מטא-דאטה בעותק (label/category/שם) אינה נוגעת בשורת המקור.
 *  4  מחיקת שורת המקור + הקובץ שלו באחסון אינה משפיעה על העותק — הוא ממשיך
 *     להתקיים ולהוריד בהצלחה גם כשהמקור נעלם. זה בדיוק ההבדל בין "עותק
 *     אמיתי" ל"מצביע שני לאותו אובייקט באחסון".
 *  5  מחיקת העותק בלבד אינה נוגעת במקור.
 *  6  הדרך ה"נכונה" ליצור נראות אצל לקוח נוסף היא שכפול, לא קישור: אין כאן
 *     ולא נוצרת אף שורת document_clients — הכרעת המוצר אוסרת קישור חדש.
 *
 * הרצה:  node scripts/staging-test-document-copy-independence.mjs
 * לא דורש seed-staging; קידומת: doccopy.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging as writeStagingRaw, assertTriggersEnabled } from './staging-lib.mjs';

async function writeStaging(query) {
  for (let attempt = 0; ; attempt++) {
    try { return await writeStagingRaw(query); }
    catch (e) { if (e.http !== 429 || attempt >= 6) throw e; await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); }
  }
}
await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const BUCKET = 'client-documents';
const PFX = 'doccopy';

const login = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await login.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  const rows = await writeStaging(`select storage_path from public.documents where id like '${PFX}-%'`);
  const paths = (rows ?? []).map(r => r.storage_path).filter(Boolean);
  if (paths.length) await user.storage.from(BUCKET).remove(paths);
  await writeStaging(`
    delete from public.document_clients where document_id like '${PFX}-%';
    delete from public.documents where id like '${PFX}-%';
    delete from public.clients where last_name = 'DOCCOPY';`);
}
await cleanup();

try {
  const clientA = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values ('${PFX}-ca', '${U}', 'א', 'DOCCOPY', 'delivered@resend.dev') returning id;`)).id;
  const clientB = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values ('${PFX}-cb', '${U}', 'ב', 'DOCCOPY', 'delivered@resend.dev') returning id;`)).id;

  const srcId = `${PFX}-src`;
  const srcPath = `${U}/${clientA}/${srcId}`;
  const originalBytes = `original content ${Date.now()}`;
  { const { error } = await user.storage.from(BUCKET).upload(srcPath, new Blob([originalBytes], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' }); ok('הכנה: הקובץ המקורי הועלה', !error, error?.message); }
  await writeStaging(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, label_id)
    values ('${srcId}', '${U}', '${clientA}', '${srcPath}', 'original.txt', 'text/plain', ${originalBytes.length}, 'other', '2025', null);`);

  // ── שכפול: אותו רצף בדיוק כמו duplicateDocToClient ──
  const dupId = `${PFX}-dup`;
  const dupPath = `${U}/${clientB}/${dupId}`;
  { const { error } = await user.storage.from(BUCKET).copy(srcPath, dupPath); ok('הכנה: storage.copy הצליח', !error, error?.message); }
  await writeStaging(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, label_id)
    select '${dupId}', user_id, '${clientB}', '${dupPath}', file_name, file_type, file_size, category, year, label_id
      from public.documents where id = '${srcId}';`);

  // 1 · id ונתיב עצמאיים
  const rows12 = await writeStaging(`select id, client_id, storage_path from public.documents where id in ('${srcId}','${dupId}') order by id`);
  ok('1 לעותק יש id ונתיב אחסון עצמאיים משלו', rows12.length === 2 && rows12[0].storage_path !== rows12[1].storage_path, JSON.stringify(rows12));

  // 2 · הבייטים זהים מיד אחרי השכפול
  const dl2 = await user.storage.from(BUCKET).download(dupPath);
  const dupText = dl2.data ? await dl2.data.text() : null;
  ok('2 הבייטים בעותק זהים למקור מיד אחרי השכפול', dupText === originalBytes, String(dupText));

  // 3 · עריכת מטא-דאטה בעותק אינה נוגעת במקור
  await writeStaging(`update public.documents set file_name = 'renamed-copy.txt', category = 'contract' where id = '${dupId}';`);
  const srcAfterEdit = await one(`select file_name, category from public.documents where id = '${srcId}'`);
  ok('3 עריכת שם/קטגוריה בעותק אינה נוגעת במקור', srcAfterEdit.file_name === 'original.txt' && srcAfterEdit.category === 'other', JSON.stringify(srcAfterEdit));

  // 4 · מחיקת המקור (שורה + קובץ) אינה פוגעת בעותק — עצמאות אמיתית באחסון
  { const { error } = await user.storage.from(BUCKET).remove([srcPath]); ok('4a הקובץ המקורי נמחק מהאחסון', !error, error?.message); }
  await writeStaging(`delete from public.documents where id = '${srcId}';`);
  const dl4 = await user.storage.from(BUCKET).download(dupPath);
  const dupTextAfterSrcGone = dl4.data ? await dl4.data.text() : null;
  ok('4b העותק ממשיך להוריד בהצלחה אחרי שהמקור נמחק — אינו תלוי בקיומו',
    !dl4.error && dupTextAfterSrcGone === originalBytes, JSON.stringify({ error: dl4.error?.message, text: dupTextAfterSrcGone }));
  const dupRowStill = await one(`select id from public.documents where id = '${dupId}'`);
  ok('4c שורת העותק שרדה במסד', dupRowStill?.id === dupId);

  // 5 · מחיקת העותק (כבר קרתה חלקית — נוודא סימטריה: מחיקתו לא הייתה משפיעה
  //    על המקור, אילו הוא עדיין קיים; כאן בודקים שהיא לא זורקת ולא נשארת יתומה)
  { const { error } = await user.storage.from(BUCKET).remove([dupPath]); ok('5a הקובץ של העותק נמחק', !error, error?.message); }
  await writeStaging(`delete from public.documents where id = '${dupId}';`);
  const bothGone = (await one(`select count(*)::int as n from public.documents where id in ('${srcId}','${dupId}')`)).n;
  ok('5b שתי השורות נעלמו נקי, בלי שגיאה מהצד השני', bothGone === 0);

  // 6 · שכפול אינו יוצר אף שורת document_clients — הדרך היחידה ליצור נראות
  //    ללקוח נוסף מעכשיו היא עותק עצמאי, לא קישור.
  const linkRows = (await one(`select count(*)::int as n from public.document_clients where document_id in ('${srcId}','${dupId}')`)).n;
  ok('6 השכפול לא יצר אף קישור document_clients', linkRows === 0, String(linkRows));
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
