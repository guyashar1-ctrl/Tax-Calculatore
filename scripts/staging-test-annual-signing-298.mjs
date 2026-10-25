#!/usr/bin/env node
/**
 * staging-test-annual-signing-298.mjs — חתימת הלקוח על סט הדוח השנתי (298; סימוני הגוף — 297), מול staging בלבד.
 *
 *   שליחה לחתימה (המשרד) ⇒ הפריט בדף «לחתימה» ⇒ טוקן שגוי / טביעה שגויה / בלי הסכמה / חתימה לא תקינה / מי שאינו חותם — נדחים
 *   ⇒ הלקוח חותם (עוד לא «נחתם») ⇒ בן/בת הזוג חותם/ת ⇒ «נחתם» והפריט בדף «נחתם» ⇒ שליחה מחדש: גרסה חדשה, הקודמת «הוחלפה»,
 *   טביעה ישנה ⇒ content_changed ⇒ הקובץ החתום פעם אחת, בלי החלפה שקטה ⇒ anon לא שולח לחתימה. בסוף — ניקוי.
 *
 *   node scripts/staging-test-annual-signing-298.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = f => Object.fromEntries(readFileSync(resolve(ROOT, f), 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const STAGING = 'evdfxjqrkgugssfrdoxd';
const TOKEN = env('.env.local').SUPABASE_ACCESS_TOKEN;
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
if (!TOKEN) { console.error('✋ SUPABASE_ACCESS_TOKEN חסר'); process.exit(1); }

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : [];
}
const lit = v => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const asOffice = async expr => (await sql(`begin; set local role authenticated; select set_config('request.jwt.claims', ${lit({ sub: OFFICE, role: 'authenticated' })}, true); select (${expr}) as r; commit;`))[0]?.r;
const asAnon = async expr => (await sql(`begin; set local role anon; select (${expr}) as r; commit;`))[0]?.r;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 300)}` : ''}`); };
// PNG תקין לצורך הבדיקה (הבדיקה בשרת: קידומת, אורך 200–600000, base64)
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgo'.padEnd(400, 'A');

const RUN = `QA297${Date.now().toString(36).toUpperCase()}`;
let clientId;
try {
  clientId = (await sql(`insert into public.clients (id, user_id, first_name, last_name, family_status, spouse_first_name, lifecycle_stage, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${RUN}', 'married', 'רחל', 'active', '${RUN}-tok') returning id`))[0].id;
  const stepId = (await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload)
    values ('${OFFICE}', '${clientId}', 'annual_return', 'tools', 'person', 'pending', '{"taxYear":2025,"purpose":"annual","title":"דוח שנתי 2025"}'::jsonb) returning id`))[0].id;
  const snap = { year: 2025, names: { client: 'דוד', spouse: 'רחל' }, out: { fields: [{ code: '158', person: 'client', kind: 'amount', amount: 96400 }] } };
  const signers = [{ role: 'client', name: 'דוד' }, { role: 'spouse', name: 'רחל' }];

  // 1 · המשרד שולח
  const s1 = await asOffice(`public.annual_return_send_for_signing('${stepId}', ${lit(snap)}::jsonb, ${lit(signers)}::jsonb)`);
  ok(s1?.ok && s1.version === 1 && /^[0-9a-f]{64}$/.test(s1.contentSha256), 'שליחה לחתימה — גרסה 1 עם טביעה', s1);
  const pub = (await sql(`select published_at is not null p from public.onboarding_steps where id='${stepId}'`))[0].p;
  ok(pub, 'השלב פורסם בשליחה (נכנס לשער הדף)');
  const bad = await asOffice(`public.annual_return_send_for_signing('${stepId}', ${lit(snap)}::jsonb, ${lit([{ role: 'client', name: '' }])}::jsonb)`);
  ok(bad?.error === 'bad_signers', 'חותם בלי שם — נדחה', bad);

  // 2 · הדף
  ok((await asAnon(`public.portal_annual_return_get('nope', '${stepId}')`))?.error === 'invalid', 'טוקן שגוי — invalid');
  const g = await asAnon(`public.portal_annual_return_get('${RUN}-tok', '${stepId}')`);
  ok(g?.ok && g.state === 'awaiting' && g.contentSha256 === s1.contentSha256 && g.signers.length === 2 && g.signers.every(x => !x.signed) && g.snapshot?.year === 2025, 'הדף מקבל את הצילום, הטביעה והחותמים', g);
  const item = await sql(`select public.build_client_portal('${clientId}', 'live') b`).catch(() => null);
  const items = JSON.stringify(item?.[0]?.b ?? '');
  ok(/הדוח השנתי 2025 — לחתימה/.test(items) && /annualSign/.test(items), 'בדף: «הדוח השנתי 2025 — לחתימה»', items.slice(0, 300));

  // 3 · מה נדחה
  const sign = (role, sha, png = PNG, consent = true) => asAnon(`public.portal_annual_return_sign('${RUN}-tok', '${stepId}', '${role}', ${lit(png)}, '${sha}', ${consent})`);
  ok((await sign('client', 'x'.repeat(64)))?.error === 'content_changed', 'טביעה אחרת — content_changed');
  ok((await sign('client', s1.contentSha256, PNG, false))?.error === 'consent_required', 'בלי ההצהרה — consent_required');
  ok((await sign('client', s1.contentSha256, 'data:image/png;base64,AAA'))?.error === 'bad_signature', 'חתימה לא תקינה — bad_signature');
  ok((await sign('other', s1.contentSha256))?.error === 'not_a_signer', 'מי שאינו חותם — not_a_signer');

  // 4 · חותמים
  const c1 = await sign('client', s1.contentSha256);
  ok(c1?.ok && c1.allSigned === false, 'דוד חתם — עוד לא «נחתם»', c1);
  ok((await sign('client', s1.contentSha256))?.error === 'already_signed', 'חתימה שנייה של אותו אדם — already_signed');
  const items2 = JSON.stringify((await sql(`select public.build_client_portal('${clientId}', 'live') b`))[0].b);
  ok(/נשארה חתימה אחת/.test(items2), 'בדף: «נשארה חתימה אחת»');
  const c2 = await sign('spouse', s1.contentSha256);
  ok(c2?.ok && c2.allSigned === true, 'רחל חתמה — «נחתם»', c2);
  const row = (await sql(`select state, signed_at is not null s, signatures ? 'client' and signatures ? 'spouse' both from public.annual_return_signings where request_id='${stepId}' and version=1`))[0];
  ok(row.state === 'signed' && row.s && row.both, 'בשרת: signed עם שתי החתימות', row);
  const items3 = JSON.stringify((await sql(`select public.build_client_portal('${clientId}', 'live') b`))[0].b);
  ok(/הדוח השנתי 2025 · נחתם/.test(items3), 'בדף: «הדוח השנתי 2025 · נחתם»');

  // 5 · הקובץ החתום — רשומת המסמך נוצרת בשרת, פעם אחת
  const sid = (await sql(`select id from public.annual_return_signings where request_id='${stepId}' and version=1`))[0].id;
  const path = `${OFFICE}/${clientId}/arsign-${sid}`;
  const sha = 'a'.repeat(64);
  ok((await asOffice(`public.annual_return_store_signed('${sid}', 'elsewhere/x', 10, '${sha}')`))?.error === 'bad_path', 'נתיב מחוץ לתיקיית הלקוח — נדחה');
  const st1 = await asOffice(`public.annual_return_store_signed('${sid}', '${path}', 1234, '${sha}')`);
  ok(st1?.ok && st1.documentId, 'הקובץ החתום נשמר במסמכים של הלקוח', st1);
  const doc = (await sql(`select category, label_id is not null l, description from public.documents where id='${st1.documentId}'`))[0];
  ok(doc?.category === 'form_1301' && doc.l && /חתום בדף האישי/.test(doc.description), 'מסמך «טופס 1301» עם תיאור «חתום בדף האישי»', doc);
  const st2 = await asOffice(`public.annual_return_store_signed('${sid}', '${path}-2', 99, '${'b'.repeat(64)}')`);
  ok(st2?.ok && st2.already && st2.documentId === st1.documentId, 'שמירה שנייה — אותו מסמך, בלי החלפה שקטה', st2);

  // 6 · שליחה מחדש
  const s2 = await asOffice(`public.annual_return_send_for_signing('${stepId}', ${lit({ ...snap, changed: 1 })}::jsonb, ${lit(signers)}::jsonb)`);
  ok(s2?.ok && s2.version === 2 && s2.contentSha256 !== s1.contentSha256, 'שליחה מחדש — גרסה 2, טביעה חדשה', s2);
  const v1 = (await sql(`select state from public.annual_return_signings where request_id='${stepId}' and version=1`))[0].state;
  ok(v1 === 'superseded', 'גרסה 1 «הוחלפה» (החתימות שלה נשמרות)');
  ok((await sign('client', s1.contentSha256))?.error === 'content_changed', 'חתימה על הגרסה הישנה — content_changed');
  ok(JSON.stringify((await asAnon(`public.portal_annual_return_get('${RUN}-tok', '${stepId}')`))?.signers?.map(x => x.signed)) === '[false,false]', 'בגרסה החדשה — שניהם עוד לא חתמו');

  // 7 · הרשאות
  const anonSend = await sql(`begin; set local role anon; select public.annual_return_send_for_signing('${stepId}', '{}'::jsonb, '[]'::jsonb); commit;`).then(() => 'ran', e => String(e.message));
  ok(/permission denied|42501/.test(anonSend), 'anon לא יכול לשלוח לחתימה', anonSend);
  const inv = (await sql(`select public.assert_domain_function_invariants() r`))[0].r;
  ok(inv === 'ok' || inv?.ok !== false, 'כללי הפונקציות בשרת תקינים', inv);
} catch (e) {
  ok(false, 'הבדיקה נעצרה', e.message);
} finally {
  if (clientId) {
    await sql(`delete from public.annual_return_signings where client_id='${clientId}'; delete from public.documents where client_id='${clientId}'; delete from public.onboarding_steps where client_id='${clientId}'; delete from public.clients where id='${clientId}';`).catch(e => console.log('ניקוי נכשל', e.message));
    const left = (await sql(`select count(*)::int n from public.clients where last_name like 'QA297%'`))[0].n;
    ok(left === 0, 'ניקוי: לא נשארו לקוחות בדיקה');
  }
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
