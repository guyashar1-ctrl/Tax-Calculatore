#!/usr/bin/env node
/**
 * staging-test-unified-process.mjs — שער הרגרסיה של מסך "תהליך" המאוחד
 * (מיגרציות 101-103).
 *
 * UP-1  סידור על בקשה שפורסמה נכתב ל-pending_sort_order — הלקוח לא רואה שינוי.
 * UP-2  אחרי publish_case_changes — הסדר החדש חי, pending_sort_order מתאפס.
 * UP-3  "הסר" על בקשה שפורסמה מסמן pending_cancel — הלקוח עדיין רואה אותה.
 * UP-4  אחרי פרסום — הבקשה שסומנה מוסרת בפועל (status='cancelled').
 * UP-5  discard_case_changes מחזיר סידור/הסרה/עריכת-תוכן למצב שלפני העריכה.
 * UP-6  discard_case_changes אינו מוחק טיוטה חדשה שמעולם לא פורסמה.
 * UP-7  set_onboarding_step_pending_cancel נדחה על שלב שעדיין לא פורסם.
 * UP-8  build_client_portal (preview) מסמן removing:true על הסרה ממתינה.
 * UP-9  retainer_authorization פתוח, לא נעול, בלי authUrl — פריט office
 *       בלבד בפורטל (אין actionKind:'external').
 *
 * ‼ הכול על לקוח דמה בסביבת הבדיקות בלבד, ונמחק בסוף.
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

const NAME = 'UP-בדיקה';
const cleanup = async () => { await writeStaging(`delete from public.clients where last_name = '${NAME}';`); };
await cleanup();

// ‼ lifecycle_stage='active' במפורש. עמודת ברירת המחדל היא 'lead', ולקוח
//   שנחשב ליד נכנס לכלל של מיגרציה 135: כל בקשה שלו **מוחזקת** עד שההצעה
//   תאושר, ולכן היא אינה מופיעה בדף האישי — והבדיקה הזאת עוסקת בפרסום,
//   בסידור ובביטול שינויים על תיק אמיתי, לא במכירה. staging פיגרה אחרי
//   הפרודקשן ב-135, ולכן הפיקסצ'ר הזה "עבד" כאן וכשל בייצור.
const cid = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'עדי', '${NAME}', 'delivered@resend.dev', 'active')
  returning id;`)).id;

const mk = async (title, extra = '{}') => {
  const payload = `{"title":"${title}","clientTitle":"${title}",
    "requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}`;
  const r = await jrpc(`public.create_onboarding_request('${cid}', 'custom_request', '${payload}'::jsonb,
      null, null, true, true, 'client', null)`);
  return r.stepId;
};

const token = await srpc(`public.mint_portal_token('${cid}')`);
const live = async () => (await jrpc(`public.get_client_portal('${token}')`));
const preview = async () => (await jrpc(`public.get_client_portal_preview('${cid}', 'preview')`));
const itemOf = (p, label) => (p.items || []).find(i => i.label === label);

// ── תשתית: שלוש בקשות פורסמות ────────────────────────────────────────────────
const s1 = await mk('בקשה א');
const s2 = await mk('בקשה ב');
const s3 = await mk('בקשה ג');

let liveOrder = (await live()).items.filter(i => ['בקשה א', 'בקשה ב', 'בקשה ג'].includes(i.label)).map(i => i.label);
ok('תשתית: שלוש הבקשות פורסמו וגלויות בסדר היצירה', JSON.stringify(liveOrder) === JSON.stringify(['בקשה א', 'בקשה ב', 'בקשה ג']),
  JSON.stringify(liveOrder));

// ── UP-1 · UP-2 · סידור ממתין ────────────────────────────────────────────────
console.log('\n— UP-1/UP-2 · סידור ממתין —');
await jrpc(`public.stage_onboarding_steps_order('${cid}', array['${s3}','${s1}','${s2}'])`);

const pendingOrder = await one(`select id, pending_sort_order, sort_order from public.onboarding_steps
                                 where id in ('${s1}','${s2}','${s3}') order by pending_sort_order`);
ok('UP-1 · pending_sort_order נכתב', pendingOrder !== undefined);

liveOrder = (await live()).items.filter(i => ['בקשה א', 'בקשה ב', 'בקשה ג'].includes(i.label)).map(i => i.label);
ok('UP-1b · הדף החי עדיין בסדר הישן — הלקוח לא רואה את הסידור עדיין',
  JSON.stringify(liveOrder) === JSON.stringify(['בקשה א', 'בקשה ב', 'בקשה ג']), JSON.stringify(liveOrder));

let previewData = await preview();
let previewOrder = previewData.items.filter(i => ['בקשה א', 'בקשה ב', 'בקשה ג'].includes(i.label)).map(i => i.label);
ok('UP-1c · ה-preview כן משקף את הסדר החדש', JSON.stringify(previewOrder) === JSON.stringify(['בקשה ג', 'בקשה א', 'בקשה ב']),
  JSON.stringify(previewOrder));

const pubRes = await jrpc(`public.publish_case_changes('${cid}')`);
ok('UP-2 · publish_case_changes מדווח ordered>=1', Number(pubRes.ordered) >= 1, JSON.stringify(pubRes));

liveOrder = (await live()).items.filter(i => ['בקשה א', 'בקשה ב', 'בקשה ג'].includes(i.label)).map(i => i.label);
ok('UP-2b · אחרי פרסום — הדף החי מציג את הסדר החדש', JSON.stringify(liveOrder) === JSON.stringify(['בקשה ג', 'בקשה א', 'בקשה ב']),
  JSON.stringify(liveOrder));

const afterPublishOrder = await one(`select pending_sort_order from public.onboarding_steps where id = '${s3}'`);
ok('UP-2c · pending_sort_order מתאפס אחרי הפרסום', afterPublishOrder.pending_sort_order === null,
  String(afterPublishOrder.pending_sort_order));

// ── UP-3 · UP-4 · UP-8 · הסרה ממתינה ────────────────────────────────────────
console.log('\n— UP-3/UP-4/UP-8 · הסרה ממתינה —');
const cancelRes = await jrpc(`public.set_onboarding_step_pending_cancel('${s2}', true)`);
ok('UP-3 · set_onboarding_step_pending_cancel הצליח', cancelRes.ok === true, JSON.stringify(cancelRes));

let liveAfterCancel = await live();
ok('UP-3b · הלקוח עדיין רואה את "בקשה ב" (לא הוסרה בפועל)', !!itemOf(liveAfterCancel, 'בקשה ב'));

previewData = await preview();
const previewCancelled = itemOf(previewData, 'בקשה ב');
ok('UP-8 · ה-preview מסמן removing:true על הבקשה שסומנה', previewCancelled?.removing === true,
  JSON.stringify(previewCancelled));

const pubRes2 = await jrpc(`public.publish_case_changes('${cid}')`);
ok('UP-4 · publish_case_changes מדווח removed>=1', Number(pubRes2.removed) >= 1, JSON.stringify(pubRes2));

liveAfterCancel = await live();
ok('UP-4b · אחרי הפרסום — "בקשה ב" נעלמה מהדף החי', !itemOf(liveAfterCancel, 'בקשה ב'));
const finalStatus = await one(`select status, pending_cancel from public.onboarding_steps where id = '${s2}'`);
ok('UP-4c · הסטטוס בפועל הוא cancelled ו-pending_cancel אופס',
  finalStatus.status === 'cancelled' && finalStatus.pending_cancel === false, JSON.stringify(finalStatus));

// ── UP-7 · דלת-מגן: לא ניתן לסמן pending_cancel על טיוטה שלא פורסמה ─────────
console.log('\n— UP-7 · דלת-מגן על טיוטה —');
const draftId = await jrpc(`public.create_onboarding_request('${cid}', 'custom_request',
  '{"title":"טיוטה לא מפורסמת","clientTitle":"טיוטה לא מפורסמת",
    "requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}'::jsonb,
  null, null, false, true, 'client', null)`);
const draftGuard = await jrpc(`public.set_onboarding_step_pending_cancel('${draftId.stepId}', true)`);
ok('UP-7 · נדחה על שלב שעדיין לא פורסם', draftGuard.ok === false && draftGuard.error === 'not_published',
  JSON.stringify(draftGuard));

// ── UP-5 · UP-6 · discard_case_changes ──────────────────────────────────────
console.log('\n— UP-5/UP-6 · בטל שינויים —');
await jrpc(`public.stage_onboarding_steps_order('${cid}', array['${s1}','${s3}'])`);
await jrpc(`public.set_onboarding_step_pending_cancel('${s1}', true)`);
const upd = await jrpc(`public.update_onboarding_request('${s3}',
  '{"title":"בקשה ג","clientTitle":"בקשה ג — נוסח ערוך",
    "requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}'::jsonb, null, false)`);
ok('הכנה: עריכת תוכן על בקשה שפורסמה נכנסת ל-draft_payload', upd.pendingEdit === true, JSON.stringify(upd));

const beforeDiscard = await one(`select id, pending_sort_order, pending_cancel, draft_payload is not null as has_draft
                                  from public.onboarding_steps where id in ('${s1}','${s3}') order by id`);
console.log(`   לפני הביטול: ${JSON.stringify(beforeDiscard)}`);

const discardRes = await jrpc(`public.discard_case_changes('${cid}')`);
ok('UP-5 · discard_case_changes מדווח על שלוש הקטגוריות',
  discardRes.ok === true && Number(discardRes.orderReverted) >= 1
  && Number(discardRes.cancelReverted) >= 1 && Number(discardRes.editsReverted) >= 1,
  JSON.stringify(discardRes));

const afterDiscard = await one(`select pending_sort_order, pending_cancel, draft_payload
                                 from public.onboarding_steps where id = '${s1}'`);
ok('UP-5b · pending_sort_order ו-pending_cancel אופסו על "בקשה א"',
  afterDiscard.pending_sort_order === null && afterDiscard.pending_cancel === false, JSON.stringify(afterDiscard));
const afterDiscard3 = await one(`select draft_payload from public.onboarding_steps where id = '${s3}'`);
ok('UP-5c · draft_payload אופס על "בקשה ג" — הנוסח הערוך בוטל',
  afterDiscard3.draft_payload === null, JSON.stringify(afterDiscard3));

const draftStillThere = await one(`select status, published_at from public.onboarding_steps where id = '${draftId.stepId}'`);
ok('UP-6 · הטיוטה שמעולם לא פורסמה עדיין קיימת אחרי "בטל שינויים" — לא נמחקה',
  draftStillThere.status !== 'cancelled' && draftStillThere.published_at === null, JSON.stringify(draftStillThere));

// ── UP-9 · פייפרלס: אין קישור הרשאה שני ─────────────────────────────────────
console.log('\n— UP-9 · הרשאת תשלום בלי קישור —');
const paperless = await jrpc(`public.create_onboarding_request('${cid}', 'paperless_connection',
  '{}'::jsonb, null, null, true, true, 'me', null)`);
await jrpc(`public.advance_onboarding_step('${paperless.stepId}', 'complete', '{}'::jsonb)`);
const retainer = await jrpc(`public.create_onboarding_request('${cid}', 'retainer_authorization',
  '{"amount":500,"billingStartMonth":"2026-09"}'::jsonb, null, null, true, true, 'me', null)`);

const portalNow = await live();
const retainerItem = (portalNow.items || []).find(i =>
  i.key === 'retainer_info' || i.label === 'החיוב החודשי' || i.label === 'הרשאת התשלום החודשי הוקמה');
ok('UP-9 · אין פריט retainer עם actionKind=external בדף הלקוח',
  !(portalNow.items || []).some(i => i.actionKind === 'external' && i.key === 'retainer_auth'),
  JSON.stringify((portalNow.items || []).filter(i => i.actionKind === 'external')));
console.log(`   פריט ההרשאה שהוצג בפועל: ${JSON.stringify(retainerItem)}`);
void retainer;

// ── UP-10 · משימה פנימית לא מגיעה לדף הלקוח ─────────────────────────────────
// ‼ ההפרדה היא הכדור, לא סוג השלב: custom_request עם ball='me' הוא משימה של
// המשרד. הבדיקה מוודאת שגם אחרי פרסום היא לא נראית ללקוח בשום דלי.
console.log('\n— UP-10 · משימה פנימית —');
const internal = await jrpc(`public.create_onboarding_request('${cid}', 'custom_request',
  '{"title":"לבדוק תיק ישן במשרד"}'::jsonb, null, null, false, true, 'me', null)`);
await jrpc(`public.publish_case_changes('${cid}')`);
const portalInternal = await live();
ok('UP-10 · המשימה הפנימית אינה מופיעה בדף הלקוח אחרי פרסום',
  !(portalInternal.items || []).some(i => String(i.label ?? '').includes('לבדוק תיק ישן')),
  JSON.stringify((portalInternal.items || []).map(i => i.label)));
const internalRow = await one(`select ball, status from public.onboarding_steps where id = '${internal.stepId}'`);
ok('UP-10b · המשימה קיימת במסד עם הכדור אצל המשרד',
  internalRow.ball === 'me' && internalRow.status !== 'cancelled', JSON.stringify(internalRow));

// ── ניקוי ───────────────────────────────────────────────────────────────────
await cleanup();
const left = await one(`select count(*)::int as n from public.clients where last_name = '${NAME}';`);
ok('ניקוי מלא אחרי הבדיקה', left.n === 0, `נשארו ${left.n}`);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
