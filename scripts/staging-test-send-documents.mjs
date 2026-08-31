#!/usr/bin/env node
/**
 * staging-test-send-documents.mjs — שער הרגרסיה של «שליחת מסמכים ללקוח» (144).
 *
 * המהלך: בקשה אחת נושאת כמה קבצים, משני מקורות, ואפשר גם רק מלל.
 *
 * SD-1  הודעת מלל — כרטיס בלי פעולה, ו**אינה נספרת** במונה ההתקדמות.
 * SD-2  שני קבצים מספריית המשרד — פריט אחד עם שתי שורות, לכל אחת URL.
 * SD-3  פתיחת קובץ אחד מסמנת אותו בלבד; הבקשה נשארת פתוחה.
 * SD-4  פתיחת כל הקבצים סוגרת את הבקשה — והיא ממשיכה לשאת אותם.
 * SD-5  קובץ מהתיק של הלקוח נמסר כמזהה בלבד, בלי URL (הוא פרטי).
 * SD-6  תאימות לאחור: בקשת מדריך ותיקה (clientResource יחיד) לא השתנתה.
 * SD-7  בקשת מסמכים נעולה — future, בלי אחיזה לפעולה.
 * SD-8  הודעה שנסגרה יורדת מהדף לגמרי.
 *
 * ‼ הכול על לקוח דמה בסביבת הבדיקות בלבד, ונמחק בסוף. הגדרות המשרד
 *   (ספריית המסמכים) נשמרות ומוחזרות כפי שהיו.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const AS_USER = `select set_config('request.jwt.claims', json_build_object('sub','${USER_ID}','role','authenticated')::text, false);`;
const jrpc = async (expr) => JSON.parse((await one(`${AS_USER} select (${expr})::text as out;`)).out);
const srpc = async (expr) => (await one(`${AS_USER} select (${expr})::text as out;`)).out;

console.log(`סביבה: ${STAGING_REF}\n`);

const LAST = 'SD-מסמכים';
const cleanup = async () => {
  await writeStaging(`delete from public.clients where last_name = '${LAST}';`);
};
await cleanup();

// ── ספריית המשרד: שני קבצים, ומחזירים את ההגדרות כפי שהיו בסוף ──────────────
const before = (await one(
  `select coalesce(settings, '{}'::jsonb)::text as s from public.profiles where id = '${USER_ID}';`)).s;
await writeStaging(`
  update public.profiles set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object(
    'client_documents', jsonb_build_array(
      jsonb_build_object('id','doc_a','label','מדריך הוצאות מוכרות','url','https://example.com/a.pdf','path','x/a.pdf','fileName','a.pdf','at', now()),
      jsonb_build_object('id','doc_b','label','נוהל העבודה במשרד','url','https://example.com/b.pdf','path','x/b.pdf','fileName','b.pdf','at', now())))
  where id = '${USER_ID}';`);

const cid = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'רותם', '${LAST}', 'delivered@resend.dev')
  returning id;`)).id;

// מסמך אמיתי בתיק של הלקוח — build_client_portal מעביר את המזהה בלבד, ולכן
// אין צורך בקובץ ב-Storage כדי לבדוק את הרינדור.
const docId = (await one(`
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year)
  values (gen_random_uuid(), '${USER_ID}', '${cid}', '${USER_ID}/${cid}/x', 'שומה 2024.pdf', 'application/pdf', 1234, 'other', 'general')
  returning id::text as id;`)).id;

const create = async (payload, { published = true, owner = 'client', dependsOn = null, required = true } = {}) => {
  const r = await jrpc(`public.create_onboarding_request('${cid}', 'custom_request',
    $pl$${JSON.stringify(payload)}$pl$::jsonb, null,
    ${dependsOn ? `'${dependsOn}'` : 'null'}, ${published}, ${required}, '${owner}', null)`);
  if (!r.ok) throw new Error(`create נכשל: ${r.error}`);
  return r.stepId;
};

const token = await srpc(`public.mint_portal_token('${cid}')`);
const portal = async () => await jrpc(`public.get_client_portal('${token}')`);
const byKey = (p, stepId) => (p.items || []).find(i => i.key === `custom_${stepId}`);

// ── SD-1 · הודעת מלל ────────────────────────────────────────────────────────
const msgId = await create({
  title: 'הודעה מהמשרד', clientTitle: 'הודעה מהמשרד',
  message: 'שלחנו לרשות המסים את הבקשה. נעדכן כשתתקבל תשובה.',
  messageOnly: true, requirements: [],
}, { owner: 'me', required: false });

let p = await portal();
const msg = byKey(p, msgId);
ok('SD-1a הודעת המלל מופיעה בדף', !!msg, JSON.stringify((p.items || []).map(i => i.key)));
ok('SD-1b בלי שום פעולה', !!msg && !msg.actionKind && !msg.cta && !msg.requirements,
  JSON.stringify(msg));
ok('SD-1c המלל עצמו עובר ללקוח', msg?.note?.includes('נעדכן כשתתקבל תשובה'), msg?.note);
ok('SD-1d אינה נספרת במונה', p.total === 0 && p.done === 0, `done=${p.done} total=${p.total}`);

// ── SD-2 · שני קבצים מספריית המשרד ──────────────────────────────────────────
const twoId = await create({
  title: '2 מסמכים מהמשרד', clientTitle: '2 מסמכים מהמשרד', clientSub: '2 קבצים',
  message: 'שני הקבצים שדיברנו עליהם.',
  clientResources: [
    { key: 'a1', source: 'office', officeId: 'doc_a', label: 'מדריך הוצאות מוכרות' },
    { key: 'a2', source: 'office', officeId: 'doc_b', label: 'נוהל העבודה במשרד' },
  ],
  requirements: [
    { key: 'a1', kind: 'confirm', label: 'פתיחת מדריך הוצאות מוכרות', done: false, required: true },
    { key: 'a2', kind: 'confirm', label: 'פתיחת נוהל העבודה במשרד', done: false, required: true },
  ],
}, { required: false });

p = await portal();
let two = byKey(p, twoId);
ok('SD-2a פריט אחד, סוג guide', two?.kind === 'guide' && two?.bucket === 'action', JSON.stringify(two));
ok('SD-2b שתי שורות קבצים', two?.resources?.length === 2, JSON.stringify(two?.resources));
ok('SD-2c לכל שורה URL מהספרייה',
  two?.resources?.[0]?.url === 'https://example.com/a.pdf' &&
  two?.resources?.[1]?.url === 'https://example.com/b.pdf', JSON.stringify(two?.resources));
ok('SD-2d המלל נלווה לקבצים', two?.note === 'שני הקבצים שדיברנו עליהם.', two?.note);
ok('SD-2e שום שורה לא מסומנת עדיין', two?.resources?.every(r => r.done === false), JSON.stringify(two?.resources));

// ── SD-3 · פתיחת קובץ אחד ───────────────────────────────────────────────────
let r = await jrpc(`public.portal_submit_step('${token}', '${twoId}', '{"key":"a1"}'::jsonb)`);
ok('SD-3a הסימון נרשם והבקשה נשארה פתוחה', r.ok === true && r.completed === false, JSON.stringify(r));
p = await portal();
two = byKey(p, twoId);
ok('SD-3b רק הקובץ שנפתח מסומן',
  two?.resources?.[0]?.done === true && two?.resources?.[1]?.done === false, JSON.stringify(two?.resources));
ok('SD-3c הבקשה עדיין תחת «מה צריך ממך»', two?.bucket === 'action', two?.bucket);

// ── SD-4 · פתיחת השני סוגרת ─────────────────────────────────────────────────
r = await jrpc(`public.portal_submit_step('${token}', '${twoId}', '{"key":"a2"}'::jsonb)`);
ok('SD-4a הבקשה נסגרה בפתיחה האחרונה', r.completed === true, JSON.stringify(r));
p = await portal();
two = byKey(p, twoId);
ok('SD-4b עברה ל«הושלמו»', two?.bucket === 'done', two?.bucket);
ok('SD-4c הקבצים נשארו זמינים', two?.resources?.length === 2 && !!two?.resources?.[0]?.url,
  JSON.stringify(two?.resources));
ok('SD-4d גם אחרי הסגירה יש stepId — אחרת קובץ פרטי אינו נגיש', two?.stepId === twoId, two?.stepId);
// ‼ 147: המלל חי באותו קטע כמו הקבצים, ואסור שייעלם בפתיחה האחרונה.
ok('SD-4e והמלל שצורף לקבצים שרד את הסגירה', two?.note === 'שני הקבצים שדיברנו עליהם.', two?.note);

// ── SD-5 · קובץ מהתיק של הלקוח ──────────────────────────────────────────────
const privId = await create({
  title: 'שומה 2024.pdf', clientTitle: 'שומה 2024.pdf', clientSub: 'מסמך מהמשרד',
  clientCta: 'לפתיחת המסמך',
  clientResources: [
    { key: 'a1', source: 'client', documentId: docId, label: 'שומה 2024', fileName: 'שומה 2024.pdf' },
  ],
  requirements: [{ key: 'a1', kind: 'confirm', label: 'פתיחת שומה 2024', done: false, required: true }],
}, { required: false });

p = await portal();
const priv = byKey(p, privId);
ok('SD-5a נמסר מזהה המסמך', priv?.resources?.[0]?.documentId === docId, JSON.stringify(priv?.resources));
ok('SD-5b בלי URL — הקובץ פרטי', priv?.resources?.[0]?.url === undefined, JSON.stringify(priv?.resources));

// ── SD-6 · תאימות לאחור: בקשת מדריך ותיקה ───────────────────────────────────
const oldId = await create({
  title: 'מדריך הוצאות מוכרות', clientTitle: 'מדריך הוצאות מוכרות',
  clientSub: 'מסמך מהמשרד - כמה דקות קריאה', clientCta: 'לפתיחת המסמך',
  clientResource: 'doc_a',
  requirements: [
    { key: 'opened', kind: 'confirm', label: 'פתיחת המדריך', done: false, required: false },
    { key: 'reviewed', kind: 'confirm', label: 'עברתי על המדריך', done: false, required: true },
  ],
}, { required: false });

p = await portal();
const old = byKey(p, oldId);
ok('SD-6a עדיין guide עם resourceUrl',
  old?.kind === 'guide' && old?.resourceUrl === 'https://example.com/a.pdf', JSON.stringify(old));
ok('SD-6b בלי resources — הענף הישן לא נגע', old?.resources === undefined, JSON.stringify(old?.resources));
ok('SD-6c הדרישות הישנות עוברות כמו שהן', old?.requirements?.length === 2, JSON.stringify(old?.requirements));
r = await jrpc(`public.portal_submit_step('${token}', '${oldId}', '{"key":"opened"}'::jsonb)`);
ok('SD-6d פתיחה לבדה אינה סוגרת בקשה ותיקה', r.completed === false, JSON.stringify(r));
r = await jrpc(`public.portal_submit_step('${token}', '${oldId}', '{"key":"reviewed"}'::jsonb)`);
ok('SD-6e ההצהרה היא שסוגרת אותה', r.completed === true, JSON.stringify(r));

// ── SD-7 · בקשת מסמכים נעולה ────────────────────────────────────────────────
const gateId = await create({
  title: 'שער', clientTitle: 'שער',
  requirements: [{ key: 'r1', kind: 'confirm', label: 'אישור', done: false }],
});
const lockedId = await create({
  title: 'מסמך שייפתח אחר כך', clientTitle: 'מסמך שייפתח אחר כך',
  clientResources: [{ key: 'a1', source: 'office', officeId: 'doc_a', label: 'מדריך הוצאות מוכרות' }],
  requirements: [{ key: 'a1', kind: 'confirm', label: 'פתיחת המדריך', done: false, required: true }],
}, { dependsOn: gateId, required: false });

p = await portal();
const locked = byKey(p, lockedId);
ok('SD-7a נעולה ⇒ «בהמשך»', locked?.bucket === 'future', JSON.stringify(locked));
ok('SD-7b בלי אחיזה לפעולה ובלי קבצים',
  !locked?.actionKind && !locked?.resources, JSON.stringify(locked));

// ── SD-8 · הודעה שנסגרה יורדת מהדף ──────────────────────────────────────────
await writeStaging(`update public.onboarding_steps set status = 'completed', completed_at = now() where id = '${msgId}';`);
p = await portal();
ok('SD-8 הודעה סגורה נעלמת לגמרי', !byKey(p, msgId),
  JSON.stringify((p.items || []).map(i => i.key)));

// ── ניקוי ───────────────────────────────────────────────────────────────────
await writeStaging(`update public.profiles set settings = $s$${before}$s$::jsonb where id = '${USER_ID}';`);
await cleanup();

console.log(`\n${fail === 0 ? '✓ הכול עבר' : '✗ נכשלו ' + fail}  ·  ${pass} עברו`);
process.exit(fail === 0 ? 0 : 1);
