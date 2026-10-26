#!/usr/bin/env node
/**
 * staging-test-wealth-303.mjs — הצהרת הון עד הסוף (303; סימוני הגוף — 300), מול staging בלבד.
 *
 *   פריטי הסכום החדשים נשמרים כעובדה ליום ההצהרה ⇒ שליחה לחתימה של הצהרת הון ⇒ בדף «הצהרת ההון ליום … — לחתימה»
 *   ⇒ שני בני הזוג חותמים ⇒ «נחתמה» ⇒ הקובץ החתום: תווית «הצהרת הון», לא «טופס 1301» ⇒ סוג בקשה אחר נדחה
 *   ⇒ החתימה על הדוח השנתי לא נפגעה (298). בסוף — ניקוי.
 *
 *   node scripts/staging-test-wealth-303.mjs
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
const PNG = 'data:image/png;base64,' + 'iVBORw0KGgo'.padEnd(400, 'A');

const RUN = `QA300${Date.now().toString(36).toUpperCase()}`;
let clientId;
try {
  clientId = (await sql(`insert into public.clients (id, user_id, first_name, last_name, family_status, spouse_first_name, lifecycle_stage, portal_token)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${RUN}', 'married', 'רחל', 'active', '${RUN}-tok') returning id`))[0].id;
  const stepId = (await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload)
    values ('${OFFICE}', '${clientId}', 'wealth_declaration', 'tools', 'person', 'pending', '{"taxYear":2025,"purpose":"wealth","asOfDate":"2025-12-31","kind":"first","title":"הצהרת הון"}'::jsonb) returning id`))[0].id;

  // 1 · פריטי הסכום החדשים — מוכרים בשרת
  const items = (await sql(`select public._tax_year_items() ?& array['wealth.realEstateAbroad.total','wealth.crypto.total','wealth.loansGiven.total','wealth.vehicles.total','wealth.valuables.total','wealth.homeContents.total','wealth.other.total','wealth.loansReceived.total'] r`))[0].r;
  ok(items === true, 'שמונת פריטי הסכום החדשים — ב-_tax_year_items');
  const kinds = (await sql(`select public._tax_year_items()->>'wealth.bank.total' k, public._tax_year_items()->>'wealth.vehicles.total' v`))[0];
  ok(kinds.k === 'amount' && kinds.v === 'amount', 'פריט קיים לא השתנה, החדש — amount', kinds);

  // 2 · שליחה לחתימה של הצהרת הון
  const snap = { kind: 'wealth', year: 2025, asOf: '2025-12-31', names: { client: 'דוד', spouse: 'רחל' }, docs: [], sections: [{ code: '30', label: 'בנקים', kind: 'asset', amount: 80000, none: false }],
    assets: 80000, liabilities: 0, netPrivate: 80000, total: 80000, change: null };
  const signers = [{ role: 'client', name: 'דוד' }, { role: 'spouse', name: 'רחל' }];
  const s1 = await asOffice(`public.annual_return_send_for_signing('${stepId}', ${lit(snap)}::jsonb, ${lit(signers)}::jsonb)`);
  ok(s1?.ok && s1.version === 1, 'הצהרת הון — נשלחה לחתימה', s1);
  const items1 = JSON.stringify((await sql(`select public.build_client_portal('${clientId}', 'live') b`))[0].b);
  ok(/הצהרת ההון ליום 31\.12\.2025 — לחתימה/.test(items1) && /annualSign/.test(items1), 'בדף: «הצהרת ההון ליום 31.12.2025 — לחתימה»', items1.slice(0, 400));
  ok(/שניכם חותמים/.test(items1), 'בדף: «שניכם חותמים · כל אחד בנפרד»');
  const g = await asAnon(`public.portal_annual_return_get('${RUN}-tok', '${stepId}')`);
  ok(g?.ok && g.snapshot?.kind === 'wealth' && g.snapshot.asOf === '2025-12-31', 'הדף מקבל את הצילום של ההצהרה', g);

  // 3 · חותמים
  const sign = role => asAnon(`public.portal_annual_return_sign('${RUN}-tok', '${stepId}', '${role}', ${lit(PNG)}, '${s1.contentSha256}', true)`);
  ok((await sign('client'))?.allSigned === false, 'דוד חתם — עוד לא «נחתמה»');
  ok((await sign('spouse'))?.allSigned === true, 'רחל חתמה — «נחתמה»');
  const items2 = JSON.stringify((await sql(`select public.build_client_portal('${clientId}', 'live') b`))[0].b);
  ok(/הצהרת ההון ליום 31\.12\.2025 · נחתמה/.test(items2), 'בדף: «הצהרת ההון ליום 31.12.2025 · נחתמה»');

  // 4 · הקובץ החתום — תווית «הצהרת הון»
  const sid = (await sql(`select id from public.annual_return_signings where request_id='${stepId}' and version=1`))[0].id;
  const st = await asOffice(`public.annual_return_store_signed('${sid}', '${OFFICE}/${clientId}/wdsign-${sid}', 1000, '${'c'.repeat(64)}')`);
  ok(st?.ok && st.documentId, 'הקובץ החתום נשמר', st);
  const doc = (await sql(`select d.category, d.file_name, d.description, l.name label from public.documents d join public.document_labels l on l.id=d.label_id where d.id='${st.documentId}'`))[0];
  ok(doc?.label === 'הצהרת הון' && doc.category === 'other' && /הצהרת ההון ליום 31\.12\.2025/.test(doc.description) && /^הצהרת-הון-2025-12-31/.test(doc.file_name), 'מסמך «הצהרת הון» עם התאריך', doc);

  // 5 · סוג בקשה אחר — נדחה; הדוח השנתי — עדיין עובד
  const other = (await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload)
    values ('${OFFICE}', '${clientId}', 'tax_estimate', 'tools', 'person', 'pending', '{"taxYear":2026}'::jsonb) returning id`))[0].id;
  ok((await asOffice(`public.annual_return_send_for_signing('${other}', ${lit(snap)}::jsonb, ${lit(signers)}::jsonb)`))?.error === 'bad_request', 'הערכת מס — לא נשלחת לחתימה');
  const ann = (await sql(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload)
    values ('${OFFICE}', '${clientId}', 'annual_return', 'tools', 'person', 'pending', '{"taxYear":2025,"purpose":"annual"}'::jsonb) returning id`))[0].id;
  const a1 = await asOffice(`public.annual_return_send_for_signing('${ann}', ${lit({ year: 2025, names: { client: 'דוד' }, out: { fields: [] } })}::jsonb, ${lit([{ role: 'client', name: 'דוד' }])}::jsonb)`);
  ok(a1?.ok, 'הדוח השנתי — עדיין נשלח לחתימה (298 לא נפגע)', a1);
  const items3 = JSON.stringify((await sql(`select public.build_client_portal('${clientId}', 'live') b`))[0].b);
  ok(/הדוח השנתי 2025 — לחתימה/.test(items3), 'בדף: גם «הדוח השנתי 2025 — לחתימה»');
  const inv = (await sql(`select public.assert_domain_function_invariants() r`))[0].r;
  ok(inv === 'ok', 'כללי הפונקציות בשרת תקינים', inv);
} catch (e) {
  ok(false, 'הבדיקה נעצרה', e.message);
} finally {
  if (clientId) {
    await sql(`delete from public.annual_return_signings where client_id='${clientId}'; delete from public.documents where client_id='${clientId}'; delete from public.onboarding_steps where client_id='${clientId}'; delete from public.clients where id='${clientId}';`).catch(e => console.log('ניקוי נכשל', e.message));
    const left = (await sql(`select count(*)::int n from public.clients where last_name like 'QA300%'`))[0].n;
    ok(left === 0, 'ניקוי: לא נשארו לקוחות בדיקה');
  }
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
