#!/usr/bin/env node
/**
 * staging-test-document-security.mjs — בעלות והרשאות על מבני המסמכים של M3.
 *
 * ‼ למה סקריפט נפרד: עד עכשיו הראיה לאבטחת המסמכים הייתה עקיפה (חבילת יישור
 * הקו). הטבלאות שנוספו במיגרציה 95 — document_labels, document_clients,
 * ועמודות המטא על document_folders — לא נבדקו ישירות מול משתמש שני.
 *
 * ‼ המלכודת שהסקריפט הזה נזהר ממנה: על כל הטבלאות יושבת מדיניות מגבילה
 * (require_authorized) שחוסמת כל משתמש שאינו ברשימת המורשים. משתמש בדיקה
 * טרי אינו מורשה — ולכן "לא הצליח לקרוא" היה מתקבל גם אילו לא הייתה שום
 * בדיקת בעלות. לכן: S0 מוכיח שהשער קיים, S1 פותח אותו, וכל השאר נבדק
 * כשהשער פתוח — כך שמה שחוסם הוא הבעלות עצמה ולא הרשימה.
 *
 * המשתמש השני, הלקוחות והמסמכים שלו נמחקים בסוף — בהצלחה או בכישלון.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const A = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const AS = (uid) => `select set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, false);`;
// ‼ SET ROLE authenticated חובה: התפקיד postgres הוא BYPASSRLS, ובלעדיו
// set_config לבדו לא מפעיל RLS כלל — הבדיקה הייתה "עוברת" בלי לבדוק דבר.
const asUser = (uid, sql) => writeStaging(`${AS(uid)} set role authenticated; ${sql}`);
/** מריץ ומחזיר {blocked, rows}. חריגת RLS/הרשאה נספרת כחסימה. */
async function attempt(uid, sql) {
  try { return { blocked: false, rows: await asUser(uid, sql) }; }
  catch (e) { return { blocked: true, err: String(e.message || e).slice(0, 160) }; }
}
const jrpcAs = async (uid, expr) => {
  const r = await asUser(uid, `select (${expr})::text as out;`);
  return JSON.parse(r[0].out);
};

const EMAIL_B = 'docsec-second-user@test.local';
console.log(`סביבה: ${STAGING_REF}\n`);

// ── ניקוי משאריות ──────────────────────────────────────────────────────────
async function cleanup() {
  await writeStaging(`delete from public.document_clients where document_id in (select id from public.documents where file_name like 'DOCSEC-%');`);
  await writeStaging(`delete from public.document_task_links where document_id in (select id from public.documents where file_name like 'DOCSEC-%');`);
  await writeStaging(`delete from public.tasks where title like 'DOCSEC-%';`);
  await writeStaging(`delete from public.documents where file_name like 'DOCSEC-%';`);
  await writeStaging(`delete from public.document_folders where name like 'DOCSEC-%';`);
  await writeStaging(`delete from public.document_labels where name like 'DOCSEC-%';`);
  await writeStaging(`delete from public.clients where last_name = 'DOCSEC';`);
  await writeStaging(`delete from public.authorized_users where email = '${EMAIL_B}';`);
  await writeStaging(`delete from auth.users where email = '${EMAIL_B}';`);
}
await cleanup();

let B;
try {
  // ── זריעה: משתמש A (הקיים) ומשתמש B (חדש) ────────────────────────────────
  B = (await one(`
    insert into auth.users (id, aud, role, email, is_sso_user, is_anonymous)
    values (gen_random_uuid(), 'authenticated', 'authenticated', '${EMAIL_B}', false, false)
    returning id;`)).id;

  const mkClient = async (uid, first) => (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email)
    values (replace(gen_random_uuid()::text,'-',''), '${uid}', '${first}', 'DOCSEC', 'delivered@resend.dev')
    returning id;`)).id;
  const clientA = await mkClient(A, 'לקוח-א');
  const clientA2 = await mkClient(A, 'לקוח-א2');
  const clientB = await mkClient(B, 'לקוח-ב');

  const mkLabel = async (uid, name, reserved = false) => (await one(`
    insert into public.document_labels (user_id, name, is_reserved)
    values ('${uid}', '${name}', ${reserved}) returning id;`)).id;
  const labelA = await mkLabel(A, 'DOCSEC-תווית-א');
  const labelAReserved = await mkLabel(A, 'DOCSEC-לבדיקה-א', true);
  const labelB = await mkLabel(B, 'DOCSEC-תווית-ב');

  const mkDoc = async (uid, cid, name, lid) => (await one(`
    insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, label_id)
    values (replace(gen_random_uuid()::text,'-',''), '${uid}', '${cid}', '${uid}/${cid}/x', '${name}', 'application/pdf', 100, 'other', '2025', '${lid}')
    returning id;`)).id;
  const docA = await mkDoc(A, clientA, 'DOCSEC-של-א.pdf', labelA);
  const docB = await mkDoc(B, clientB, 'DOCSEC-של-ב.pdf', labelB);

  const folderA = (await one(`
    insert into public.document_folders (id, user_id, client_id, parent_id, name, label_id, year)
    values (replace(gen_random_uuid()::text,'-',''), '${A}', '${clientA}', null, 'DOCSEC-תיקייה-א', '${labelA}', '2025')
    returning id;`)).id;

  // ─── S0 · שכבת ההרשאה קיימת (משתמש לא מורשה חסום לגמרי) ─────────────────
  console.log('— שכבת ההרשאה מול שכבת הבעלות —');
  {
    const r = await attempt(B, `select count(*)::int as n from public.document_labels where id = '${labelB}';`);
    ok('S0 משתמש שאינו ברשימת המורשים אינו רואה אפילו את התוויות של עצמו',
      r.blocked || r.rows[0].n === 0, JSON.stringify(r.rows ?? r.err));
  }

  // מכניסים את B לרשימת המורשים — מכאן והלאה מה שחוסם הוא הבעלות בלבד.
  await writeStaging(`insert into public.authorized_users (email, role, active) values ('${EMAIL_B}', 'employee', true);`);

  {
    const r = await attempt(B, `select count(*)::int as n from public.document_labels where id = '${labelB}';`);
    ok('S1 אחרי אישור — B כן רואה את התווית של עצמו (השער פתוח, הבדיקות הבאות הן בעלות)',
      !r.blocked && r.rows[0].n === 1, JSON.stringify(r.rows ?? r.err));
  }

  // ─── 1 · קריאת תוויות של אחר ─────────────────────────────────────────────
  console.log('\n— 1 · קריאה —');
  {
    const r = await attempt(B, `select count(*)::int as n from public.document_labels where id = '${labelA}';`);
    ok('1 B אינו רואה את התוויות הפרטיות של A', !r.blocked && r.rows[0].n === 0, JSON.stringify(r.rows ?? r.err));
    const all = await attempt(B, `select count(*)::int as n from public.document_labels;`);
    ok('1b B רואה בדיוק תווית אחת בסך הכול — שלו', !all.blocked && all.rows[0].n === 1, JSON.stringify(all.rows ?? all.err));
    const d = await attempt(B, `select count(*)::int as n from public.documents where id = '${docA}';`);
    ok('1c B אינו רואה את המסמך של A', !d.blocked && d.rows[0].n === 0, JSON.stringify(d.rows ?? d.err));
    const f = await attempt(B, `select count(*)::int as n from public.document_folders where id = '${folderA}';`);
    ok('1d B אינו רואה את התיקייה של A', !f.blocked && f.rows[0].n === 0, JSON.stringify(f.rows ?? f.err));
  }

  // ─── 2+3 · קישור רב-לקוחי על מסמך זר ─────────────────────────────────────
  console.log('\n— 2+3 · קישור מסמך זר —');
  // ‼ כל ניסיון נמדד בנפרד ומנוקה אחריו — אחרת שורה שנוצרה בניסיון אחד
  // נספרת בניסיון הבא ומטשטשת איזו מדיניות בדיוק נכשלה.
  const linkCount = async () => (await one(
    `select count(*)::int as n from public.document_clients where document_id = '${docA}';`)).n;
  const tryLink = async (uid, ownerId, cid) => {
    await attempt(uid, `insert into public.document_clients (user_id, document_id, client_id)
      values ('${ownerId}', '${docA}', '${cid}');`);
    const n = await linkCount();
    await writeStaging(`delete from public.document_clients where document_id = '${docA}';`);
    return n;
  };
  {
    ok('2 B אינו יוצר קישור רב-לקוחי למסמך של A (ללקוח של עצמו)',
      (await tryLink(B, B, clientB)) === 0, 'הקישור נוצר');
    ok('3 B אינו יוצר קישור בשם A (התחזות ל-user_id)',
      (await tryLink(B, A, clientA2)) === 0, 'הקישור נוצר');
    ok('3b B אינו מקשר מסמך של A ללקוח של A',
      (await tryLink(B, B, clientA2)) === 0, 'הקישור נוצר');
    ok('3c הבעלים כן מצליח לקשר מסמך שלו ללקוח שלו',
      (await tryLink(A, A, clientA2)) === 1, 'הקישור לא נוצר לבעלים');
  }

  // ─── 3d · אותה שאלה על קישור מסמך↔משימה ──────────────────────────────────
  {
    const taskA = (await one(`
      insert into public.tasks (id, user_id, client_id, category, title, ball_with, status, priority)
      values (replace(gen_random_uuid()::text,'-',''), '${A}', '${clientA}', 'not_selected', 'DOCSEC-משימה', 'me', 'open', 'normal')
      returning id;`)).id;
    await attempt(B, `insert into public.document_task_links (user_id, document_id, task_id)
      values ('${B}', '${docA}', '${taskA}');`);
    const n = await one(`select count(*)::int as n from public.document_task_links where document_id = '${docA}';`);
    ok('3d B אינו מקשר מסמך של A למשימה של A', n.n === 0, `נוצרו ${n.n} קישורים`);
    await asUser(A, `insert into public.document_task_links (user_id, document_id, task_id)
      values ('${A}', '${docA}', '${taskA}');`);
    const n2 = await one(`select count(*)::int as n from public.document_task_links where document_id = '${docA}';`);
    ok('3e הבעלים כן מקשר מסמך שלו למשימה שלו', n2.n === 1, `נוצרו ${n2.n}`);
    await writeStaging(`delete from public.document_task_links where document_id = '${docA}';`);
    await writeStaging(`delete from public.tasks where id = '${taskA}';`);
  }

  // ─── 4 · ביטול קישור של אחר ──────────────────────────────────────────────
  console.log('\n— 4 · ביטול קישור זר —');
  const linkA = (await one(`
    insert into public.document_clients (user_id, document_id, client_id)
    values ('${A}', '${docA}', '${clientA2}') returning id;`)).id;
  {
    const sees = await attempt(B, `select count(*)::int as n from public.document_clients where id = '${linkA}';`);
    ok('4a B אינו רואה את הקישור של A', !sees.blocked && sees.rows[0].n === 0, JSON.stringify(sees.rows ?? sees.err));
    await attempt(B, `delete from public.document_clients where id = '${linkA}';`);
    const still = await one(`select count(*)::int as n from public.document_clients where id = '${linkA}';`);
    ok('4b B אינו מבטל את הקישור של A', still.n === 1, `נשארו ${still.n}`);
  }

  // ─── 5 · הקישור אינו משנה בעלות פיזית ────────────────────────────────────
  console.log('\n— 5+6 · הקישור אינו נוגע בקובץ —');
  {
    const d = await one(`select user_id, client_id, storage_path from public.documents where id = '${docA}';`);
    ok('5 קישור לקוח נוסף אינו משנה בעלות/אחסון של המסמך',
      d.user_id === A && d.client_id === clientA && d.storage_path === `${A}/${clientA}/x`,
      JSON.stringify(d));
    const copies = await one(`select count(*)::int as n from public.documents where storage_path = '${A}/${clientA}/x';`);
    ok('5b הקובץ לא שוכפל — שורת מסמך אחת בלבד לאותו נתיב אחסון', copies.n === 1, `${copies.n} שורות`);
  }

  // ─── 6 · ביטול קישור אינו מוחק את המסמך ──────────────────────────────────
  {
    await asUser(A, `delete from public.document_clients where id = '${linkA}';`);
    const gone = await one(`select count(*)::int as n from public.document_clients where id = '${linkA}';`);
    const doc = await one(`select count(*)::int as n from public.documents where id = '${docA}';`);
    ok('6 ביטול הקישור הצליח לבעלים', gone.n === 0, `נשארו ${gone.n}`);
    ok('6b ביטול הקישור אינו מוחק את המסמך עצמו', doc.n === 1, `${doc.n} מסמכים`);
  }

  // ─── 7 · כתיבה על מטא-דאטה של אחר ────────────────────────────────────────
  console.log('\n— 7 · כתיבה על מטא זר —');
  {
    await attempt(B, `update public.documents set label_id = '${labelB}' where id = '${docA}';`);
    const d = await one(`select label_id from public.documents where id = '${docA}';`);
    ok('7a B אינו משנה את התווית של מסמך של A', d.label_id === labelA, JSON.stringify(d));
    await attempt(B, `update public.document_folders set label_id = '${labelB}', year = '1999' where id = '${folderA}';`);
    const f = await one(`select label_id, year from public.document_folders where id = '${folderA}';`);
    ok('7b B אינו משנה תווית/שנה של תיקייה של A', f.label_id === labelA && f.year === '2025', JSON.stringify(f));
    await attempt(B, `update public.document_labels set name = 'נחטף' where id = '${labelA}';`);
    const l = await one(`select name from public.document_labels where id = '${labelA}';`);
    ok('7c B אינו משנה שם של תווית של A', l.name === 'DOCSEC-תווית-א', JSON.stringify(l));
  }

  // ─── 8 · ה-RPC למחיקת תווית (SECURITY DEFINER) ───────────────────────────
  console.log('\n— 8 · delete_document_label —');
  {
    const foreign = await jrpcAs(B, `public.delete_document_label('${labelA}')`);
    ok('8a B אינו מוחק תווית של A', foreign.ok === false && foreign.error === 'forbidden', JSON.stringify(foreign));
    const stillThere = await one(`select count(*)::int as n from public.document_labels where id = '${labelA}';`);
    ok('8b התווית של A שרדה', stillThere.n === 1);

    const reserved = await jrpcAs(A, `public.delete_document_label('${labelAReserved}')`);
    ok('8c תווית שמורה אינה נמחקת גם לבעלים', reserved.ok === false && reserved.error === 'reserved_label', JSON.stringify(reserved));

    const mine = await jrpcAs(A, `public.delete_document_label('${labelA}')`);
    ok('8d הבעלים מוחק תווית רגילה', mine.ok === true, JSON.stringify(mine));
    const moved = await one(`select label_id from public.documents where id = '${docA}';`);
    ok('8e המסמך הועבר לתווית השמורה ולא נשאר בלי תווית',
      moved.label_id === labelAReserved, JSON.stringify(moved));
    const folderMoved = await one(`select label_id from public.document_folders where id = '${folderA}';`);
    ok('8f גם התיקייה הועברה לתווית השמורה', folderMoved.label_id === labelAReserved, JSON.stringify(folderMoved));
    const docSurvives = await one(`select count(*)::int as n from public.documents where id = '${docA}';`);
    ok('8g מחיקת תווית אינה מוחקת מסמכים', docSurvives.n === 1);

    // מחיקה ישירה (בלי ה-RPC) חייבת להיחסם — גם לבעלים.
    await attempt(A, `delete from public.document_labels where id = '${labelAReserved}';`);
    const direct = await one(`select count(*)::int as n from public.document_labels where id = '${labelAReserved}';`);
    ok('8h DELETE ישיר על תוויות חסום גם לבעלים (רק דרך ה-RPC)', direct.n === 1, `נשארו ${direct.n}`);
  }
} finally {
  await cleanup();
  const leftovers = await one(`select
    (select count(*) from public.documents where file_name like 'DOCSEC-%')
    + (select count(*) from public.document_labels where name like 'DOCSEC-%')
    + (select count(*) from public.clients where last_name = 'DOCSEC') as n;`);
  ok('ניקוי מלא', Number(leftovers.n) === 0, `נשארו ${leftovers.n}`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
