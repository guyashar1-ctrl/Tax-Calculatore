#!/usr/bin/env node
/**
 * staging-test-requests-v2.mjs — שער הרגרסיה של מסך הבקשות המאושר (2026-08-15).
 *
 * המהלך: הדף האישי מציג מעכשיו גם שלב **שפורסם ועדיין נעול**, עם השם האמיתי
 * ועם המשפט שאומר מה יפתח אותו. הגבול שאסור שיזוז הוא בין "טיוטה" ל"נעול":
 *   טיוטה        → הלקוח לא רואה בכלל
 *   פורסם + נעול → רואה כשלב עתידי, בלי יכולת לפעול
 *   פורסם + פתוח → יכול לפעול
 *
 * RV-1  טיוטה אינה מגיעה לדף האישי בכלל.
 * RV-2  בקשה שפורסמה ופתוחה — action, עם פעולה.
 * RV-3  בקשה שפורסמה ונעולה — future, בלי שום אחיזה לפעולה.
 * RV-4  השלב הנעול אומר מה יפתח אותו, בשם שהלקוח מכיר.
 * RV-5  השלמת ההורה פותחת את הילד מעצמה — בלי שליחה ובלי פעולה נוספת.
 * RV-6  תלות מרובת-הורים: נשאר נעול עד שכל ההורים הושלמו.
 * RV-7  השרת חוסם פעולה על שלב נעול (לא רק ה-UI).
 * RV-8  בקשה לגורם חיצוני עם תנאי שליחה — נעולה עד שהתנאי מתקיים.
 * RV-9  תבנית משחזרת גם את הבקשות וגם את התלות ביניהן, אצל לקוח אחר.
 * RV-10 פתיחה מחדש מחזירה את הבקשה לאזור הפעיל עם מצב תלות נכון.
 * RV-11 תאימות לאחור: בקשה בלי נוסח מייל שמור ממשיכה לעבוד כרגיל.
 * RV-12 טיוטה נעולה — עדיין בלתי נראית (שני התנאים יחד).
 * RV-13 נוסח המייל של בקשה חיצונית נשמר על הבקשה ושורד עריכה.
 *
 * ‼ הכול על לקוחות דמה בסביבת הבדיקות בלבד, ונמחק בסוף.
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
/** פונקציות שמחזירות סקלר (mint_portal_token מחזיר טוקן, לא jsonb). */
const srpc = async (expr) => (await one(`${AS_USER} select (${expr})::text as out;`)).out;

console.log(`סביבה: ${STAGING_REF}\n`);

const NAMES = ['RV-מקור', 'RV-יעד'];
const cleanup = async () => {
  await writeStaging(`
    delete from public.clients where last_name in (${NAMES.map(n => `'${n}'`).join(',')});
    delete from public.journey_templates where name = 'RV · רצף פייפרלס';`);
};
await cleanup();

// ── תיק המקור ───────────────────────────────────────────────────────────────
const src = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'דנה', 'RV-מקור', 'delivered@resend.dev', 'active')
  returning id;`)).id;

/** payload עם ניסוח ללקוח — clientTitle הוא מה שהדף האישי מראה. */
const mk = async (title, { published = true, dependsOn = null, owner = 'client', extra = '' } = {}) => {
  const payload = `{"title":"${title}","clientTitle":"${title}",` +
    `"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]${extra}}`;
  const r = await jrpc(`public.create_onboarding_request('${src}', 'custom_request', '${payload}'::jsonb,
      null, ${dependsOn ? `'${dependsOn}'` : 'null'}, ${published}, true, '${owner}', null)`);
  return r.stepId;
};

const token = await srpc(`public.mint_portal_token('${src}')`);
const portal = async () => (await jrpc(`public.get_client_portal('${token}')`));
const itemOf = (p, label) => (p.items || []).find(i => i.label === label);

// ── RV-1 · RV-2 · RV-3 · RV-4 ───────────────────────────────────────────────
const paperless = await mk('פתיחת חשבון פייפרלס');
const retainer = await mk('הרשאה לחיוב חודשי', { dependsOn: paperless });
const draft = await mk('בקשה שלא פורסמה', { published: false });

let p = await portal();
ok('RV-1 טיוטה אינה מופיעה בדף האישי', !itemOf(p, 'בקשה שלא פורסמה'),
  JSON.stringify((p.items || []).map(i => i.label)));

const a = itemOf(p, 'פתיחת חשבון פייפרלס');
ok('RV-2 בקשה שפורסמה ופתוחה — action עם פעולה',
  a && a.bucket === 'action' && !!a.actionKind, JSON.stringify(a));

const f = itemOf(p, 'הרשאה לחיוב חודשי');
ok('RV-3 בקשה שפורסמה ונעולה — future, בלי אחיזה לפעולה',
  f && f.bucket === 'future' && !f.actionKind && !f.actionValue && !f.requirements,
  JSON.stringify(f));
ok('RV-4 השלב הנעול אומר מה יפתח אותו',
  f && typeof f.sub === 'string' && f.sub.includes('פתיחת חשבון פייפרלס'),
  JSON.stringify(f && f.sub));

// ── RV-7 · השרת חוסם, לא רק המסך ────────────────────────────────────────────
const blocked = await jrpc(
  `public.portal_submit_step('${token}', '${retainer}', '{"r1":true}'::jsonb)`);
ok('RV-7 השרת דוחה פעולה על שלב נעול', blocked.ok === false && blocked.error === 'locked',
  JSON.stringify(blocked));

// ── RV-5 · השלמת ההורה פותחת את הילד מעצמה ──────────────────────────────────
await jrpc(`public.advance_onboarding_step('${paperless}', 'complete', '{}'::jsonb)`);
const childStatus = (await one(
  `select status from public.onboarding_steps where id = '${retainer}';`)).status;
ok('RV-5 הילד נפתח אוטומטית עם השלמת ההורה', childStatus === 'pending', childStatus);

p = await portal();
const nowOpen = itemOf(p, 'הרשאה לחיוב חודשי');
ok('RV-5b ואז הוא מוצג כפעולה בדף האישי, בלי שנשלח דבר',
  nowOpen && nowOpen.bucket === 'action' && !!nowOpen.actionKind, JSON.stringify(nowOpen));

// ── RV-6 · תלות מרובת-הורים ─────────────────────────────────────────────────
const gateA = await mk('תנאי א');
const gateB = await mk('תנאי ב');
const multi = await mk('בקשה עם שני תנאים', { dependsOn: gateA });
await jrpc(`public.set_onboarding_step_dependencies('${multi}', array['${gateA}','${gateB}'])`);

await jrpc(`public.advance_onboarding_step('${gateA}', 'complete', '{}'::jsonb)`);
let st = (await one(`select status from public.onboarding_steps where id = '${multi}';`)).status;
ok('RV-6 הורה אחד מתוך שניים — עדיין נעול', st === 'locked', st);

p = await portal();
const multiItem = itemOf(p, 'בקשה עם שני תנאים');
ok('RV-6b והמשפט מזכיר רק את מה שעדיין חוסם',
  multiItem && multiItem.sub && multiItem.sub.includes('תנאי ב') && !multiItem.sub.includes('תנאי א'),
  JSON.stringify(multiItem && multiItem.sub));

await jrpc(`public.advance_onboarding_step('${gateB}', 'complete', '{}'::jsonb)`);
st = (await one(`select status from public.onboarding_steps where id = '${multi}';`)).status;
ok('RV-6c כל ההורים הושלמו — נפתח', st === 'pending', st);

// ── RV-8 · גורם חיצוני עם תנאי שליחה ────────────────────────────────────────
const release = await mk('מכתב שחרור');
const extReq = (await jrpc(`public.create_onboarding_request('${src}', 'custom_request',
  '{"title":"חומרים מרו״ח קודם","clientTitle":"חומרים מרו״ח קודם",
    "externalParty":{"kind":"other","contact":{"name":"רו״ח יעקב לוי","email":"delivered@resend.dev"}},
    "emailSubject":"העברת חומרים — דנה","emailBody":"שלום יעקב, נודה להעברת החומרים.",
    "internalNote":"לוודא כרטסות 2024"}'::jsonb,
  null, '${release}', true, true, 'external', null)`)).stepId;

st = (await one(`select status from public.onboarding_steps where id = '${extReq}';`)).status;
ok('RV-8 בקשה חיצונית עם תנאי שליחה נולדת נעולה', st === 'locked', st);

const extBlocked = await jrpc(`public.advance_onboarding_step('${extReq}', 'start', '{}'::jsonb)`);
ok('RV-8b ואי אפשר להתקדם בה לפני שהתנאי התקיים',
  extBlocked.ok === false && extBlocked.error === 'locked', JSON.stringify(extBlocked));

p = await portal();
ok('RV-8c בקשה לגורם חיצוני אינה נכנסת לרשימת הפעולות של הלקוח',
  !(p.items || []).some(i => i.label === 'חומרים מרו״ח קודם' && i.bucket === 'action'),
  JSON.stringify((p.items || []).filter(i => i.bucket === 'action').map(i => i.label)));

// ── RV-13 · נוסח המייל נשמר על הבקשה ────────────────────────────────────────
const extPayload = JSON.parse((await one(
  `select payload::text as out from public.onboarding_steps where id = '${extReq}';`)).out);
ok('RV-13 נושא וגוף המייל נשמרו על הבקשה',
  extPayload.emailSubject === 'העברת חומרים — דנה'
  && String(extPayload.emailBody || '').includes('נודה להעברת החומרים'),
  JSON.stringify({ s: extPayload.emailSubject, b: extPayload.emailBody }));

const upd = await jrpc(`public.update_onboarding_request('${extReq}',
  '{"title":"חומרים מרו״ח קודם","clientTitle":"חומרים מרו״ח קודם",
    "externalParty":{"kind":"other","contact":{"name":"רו״ח יעקב לוי","email":"delivered@resend.dev"}},
    "emailSubject":"נוסח מעודכן","emailBody":"גוף מעודכן","internalNote":"הערה"}'::jsonb, null, false)`);
const extPayload2 = JSON.parse((await one(
  `select coalesce(draft_payload, payload)::text as out from public.onboarding_steps where id = '${extReq}';`)).out);
ok('RV-13b ועריכה שלהם נשמרת (update_onboarding_request אינו מסנן אותם)',
  upd.ok === true && extPayload2.emailSubject === 'נוסח מעודכן',
  JSON.stringify({ upd, s: extPayload2.emailSubject }));

// ── RV-11 · תאימות לאחור ────────────────────────────────────────────────────
const plain = await mk('בקשה בלי נוסח מייל');
const plainPayload = JSON.parse((await one(
  `select payload::text as out from public.onboarding_steps where id = '${plain}';`)).out);
p = await portal();
ok('RV-11 בקשה בלי emailSubject/emailBody עובדת כרגיל',
  plainPayload.emailSubject === undefined && !!itemOf(p, 'בקשה בלי נוסח מייל'),
  JSON.stringify(plainPayload));

// ── RV-12 · טיוטה נעולה ─────────────────────────────────────────────────────
const gate2 = await mk('תנאי לטיוטה');
const draftLocked = await mk('טיוטה נעולה', { published: false, dependsOn: gate2 });
p = await portal();
ok('RV-12 טיוטה נעולה אינה מופיעה גם לא כשלב עתידי',
  !itemOf(p, 'טיוטה נעולה'),
  JSON.stringify((p.items || []).map(i => `${i.bucket}:${i.label}`)));

// ── RV-10 · פתיחה מחדש ──────────────────────────────────────────────────────
await jrpc(`public.advance_onboarding_step('${plain}', 'complete', '{}'::jsonb)`);
let plainStatus = (await one(`select status from public.onboarding_steps where id = '${plain}';`)).status;
ok('RV-10 בקשה שהושלמה יוצאת מהאזור הפעיל',
  ['completed', 'verified'].includes(plainStatus), plainStatus);
await jrpc(`public.advance_onboarding_step('${plain}', 'reopen', '{}'::jsonb)`);
plainStatus = (await one(`select status from public.onboarding_steps where id = '${plain}';`)).status;
p = await portal();
ok('RV-10b פתיחה מחדש מחזירה אותה לפעילה ולדף האישי',
  !['completed', 'verified', 'skipped', 'cancelled'].includes(plainStatus)
  && (itemOf(p, 'בקשה בלי נוסח מייל') || {}).bucket === 'action',
  `${plainStatus} · ${JSON.stringify(itemOf(p, 'בקשה בלי נוסח מייל'))}`);

// ── RV-9 · תבנית שומרת ומשחזרת את התלות ─────────────────────────────────────
const saved = await jrpc(
  `public.save_journey_template('${src}', 'RV · רצף פייפרלס', 'רצף עם תלות')`);
ok('RV-9 שמירת תבנית הצליחה', saved.ok === true, JSON.stringify(saved));

const tplId = (await one(
  `select id from public.journey_templates where name = 'RV · רצף פייפרלס' limit 1;`)).id;
const dst = (await one(`
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'יעד', 'RV-יעד', 'delivered@resend.dev', 'active')
  returning id;`)).id;
const applied = await jrpc(`public.apply_journey_template('${dst}', '${tplId}')`);
ok('RV-9b החלה על לקוח אחר הצליחה', applied.ok === true, JSON.stringify(applied));

const chain = await one(`
  select count(*)::int as edges
    from public.onboarding_step_dependencies d
    join public.onboarding_steps c on c.id = d.step_id
    join public.onboarding_steps pa on pa.id = d.depends_on_step_id
   where c.client_id = '${dst}'
     and c.payload->>'clientTitle' = 'הרשאה לחיוב חודשי'
     and pa.payload->>'clientTitle' = 'פתיחת חשבון פייפרלס';`);
ok('RV-9c והתלות פייפרלס → הרשאה שוחזרה אצל היעד', chain.edges === 1, `edges=${chain.edges}`);

const dstChild = await one(`
  select status from public.onboarding_steps
   where client_id = '${dst}' and payload->>'clientTitle' = 'הרשאה לחיוב חודשי' limit 1;`);
ok('RV-9d והבקשה התלויה נולדה נעולה אצל היעד',
  dstChild && dstChild.status === 'locked', dstChild && dstChild.status);

const dstDrafts = await one(`
  select count(*) filter (where published_at is null)::int as drafts, count(*)::int as total
    from public.onboarding_steps where client_id = '${dst}';`);
ok('RV-9e וכל מה שהתבנית יצרה נולד כטיוטה (כלום לא נשלח)',
  dstDrafts.total > 0 && dstDrafts.drafts === dstDrafts.total,
  JSON.stringify(dstDrafts));

// ── ניקוי ───────────────────────────────────────────────────────────────────
void draft; void draftLocked; void multi; void retainer;
await cleanup();
const left = await one(`
  select count(*)::int as n from public.clients where last_name in (${NAMES.map(n => `'${n}'`).join(',')});`);
ok('ניקוי מלא אחרי הבדיקה', left.n === 0, `נשארו ${left.n}`);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);
