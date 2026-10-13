#!/usr/bin/env node
/**
 * staging-test-229-tax-year.mjs — מסלול שנת מס (229) מקצה לקצה על staging, על לקוחות בדיקה בלבד.
 *
 * ‼ בלי סיסמאות ובלי ממשק: פעולות המשרד רצות ב-SQL בזהות משתמש הבדיקה (role authenticated +
 *   request.jwt.claims), ופעולות הלקוח — ב-HTTP עם המפתח הציבורי וטוקן הדף האישי, כמו הדפדפן.
 *   ההעלאה עוברת בפונקציה portal-upload-document שנפרסה ל-staging. אין שליחת מיילים.
 * ‼ בסוף: ניקוי מלא של לקוחות הבדיקה וסריקת שאריות (גם אם בדיקה נכשלה).
 *
 *   שימוש (מתיקייה שיש בה .env.local עם SUPABASE_ACCESS_TOKEN, ו-.env.staging):
 *     node scripts/staging-test-229-tax-year.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, PROD_REF, writeStaging } from './staging-lib.mjs';

const envStaging = Object.fromEntries(readFileSync(resolve(ROOT, '.env.staging'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const URL = envStaging.VITE_SUPABASE_URL, ANON = envStaging.VITE_SUPABASE_ANON_KEY;
if (!URL?.includes(STAGING_REF) || URL.includes(PROD_REF)) { console.error('✋ .env.staging אינו staging'); process.exit(1); }

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // qa-meetings@pivo.test — משרד אחר
const RUN = `QATY${Date.now().toString(36).toUpperCase()}`;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const rows = async (q) => (await writeStaging(q)) ?? [];
const one = async (q) => (await rows(q))[0];
/** קריאה לפונקציה בזהות משתמש (כמו האפליקציה). מחזיר את הערך, או {thrown}. */
async function asUser(uid, expr) {
  try {
    const r = await one(`begin; set local role authenticated;
      select set_config('request.jwt.claims', ${lit({ sub: uid, role: 'authenticated' })}, true);
      select (${expr}) as r; commit;`);
    return r?.r;
  } catch (e) { await writeStaging('rollback;').catch(() => {}); return { thrown: e.message }; }
}
const office = (expr) => asUser(OFFICE, expr);
const other = (expr) => asUser(OTHER, expr);
/** קריאה ציבורית כמו הדף האישי (anon). */
async function anonRpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
async function upload({ token, stepId, itemKey, name = 'ט867.pdf', bytes, type = 'application/pdf' }) {
  const fd = new FormData();
  fd.set('token', token); fd.set('tokenKind', 'portal'); fd.set('stepId', stepId); fd.set('itemKey', itemKey);
  fd.set('file', new File([bytes], name, { type }));
  const r = await fetch(`${URL}/functions/v1/portal-upload-document`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, body: fd });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { status: r.status, body: j };
}
const pdf = (s) => new TextEncoder().encode(`%PDF-1.4\n% ${s}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

const clients = [];
async function newClient(last) {
  const id = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${last}', 'delivered@resend.dev', 'active', 'single', 'licensed') returning id`)).id;
  clients.push(id);
  return id;
}

async function cleanup() {
  if (!clients.length) return;
  const ids = clients.map(c => `'${c}'`).join(',');
  const docs = await rows(`select storage_path from public.documents where client_id in (${ids})`);
  await writeStaging(`
    delete from public.tax_evidence where client_id in (${ids});
    delete from public.tax_card_transfers where client_id in (${ids});
    delete from public.tax_year_facts where client_id in (${ids});
    delete from public.tax_info_asks where client_id in (${ids});
    delete from public.accountant_notifications where client_id in (${ids});
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notices where client_id in (${ids});
    delete from public.email_messages where client_id in (${ids});
    delete from public.documents where client_id in (${ids});
    delete from public.onboarding_steps where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
  // קובצי האחסון: מחיקה דרך SQL חסומה ב-Supabase — מדווחים מה נשאר, לא מסתירים.
  let storageLeft = 0;
  for (const d of docs) {
    try { await writeStaging(`delete from storage.objects where bucket_id = 'client-documents' and name = ${lit(d.storage_path)}`); }
    catch { storageLeft++; }
  }
  const tables = await rows(`select table_name from information_schema.columns where table_schema='public' and column_name in ('client_id','linked_client_id') and table_name not like 'v\\_%'`);
  let left = 0;
  for (const t of tables) {
    const col = (await rows(`select column_name from information_schema.columns where table_schema='public' and table_name='${t.table_name}' and column_name in ('client_id','linked_client_id')`)).map(c => c.column_name);
    for (const c of col) {
      const n = (await one(`select count(*)::int n from public."${t.table_name}" where "${c}" in (${ids})`).catch(() => ({ n: 0 })))?.n ?? 0;
      if (n) { left += n; console.log(`    שארית: ${t.table_name}.${c} = ${n}`); }
    }
  }
  ok(left === 0, `ניקוי: אין שאריות של לקוחות הבדיקה (${tables.length} טבלאות נסרקו)`);
  console.log(storageLeft ? `  ‼ ${storageLeft} קובצי בדיקה נשארו באחסון staging (מחיקה מ-SQL חסומה): ${docs.map(d => d.storage_path).join(', ')}` : '  ✓ קובצי האחסון נמחקו');
}

try {
  console.log(`יעד: ${STAGING_REF} · ריצה ${RUN}`);
  const preEmails = (await one(`select count(*)::int n from public.email_messages`)).n;
  const A = await newClient(`${RUN}-A`), B = await newClient(`${RUN}-B`);
  const tokA = await office(`public.mint_portal_token('${A}')`), tokB = await office(`public.mint_portal_token('${B}')`);
  ok(typeof tokA === 'string' && tokA.length > 10 && tokA !== tokB, 'טוקן דף אישי לכל לקוח');

  // ── 1. פתיחת בקשה ──
  const e1 = await office(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
  const e2 = await office(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
  ok(e1?.ok && e1.created && e2?.ok && !e2.created && e1.stepId === e2.stepId, 'פתיחה: לחיצה כפולה → אותה בקשה', JSON.stringify([e1, e2]));
  const xo = await other(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
  ok(xo?.thrown || xo?.ok === false, 'משרד אחר לא יכול לפתוח בקשה ללקוח שאינו שלו', JSON.stringify(xo));
  const an = await anonRpc('ensure_tax_year_request', { p_client_id: A, p_purpose: 'annual', p_tax_year: 2025, p_cutoff_month: null });
  ok(an.status >= 400, `אנונימי לא יכול לפתוח בקשה (${an.status})`);

  // ── 2. שאלות ──
  const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra }, templateVersion: 'qa' });
  const asks = [
    { itemKey: 'donations.given', subjectRole: 'client', prompt: P('תרמת השנה?', 'yesno') },
    { itemKey: 'household.creditChanges', subjectRole: 'client', prompt: P('סיימת תואר / שוחררת / עברת יישוב?', 'yesno') },
    { itemKey: 'donations.amount', subjectRole: 'client', prompt: P('כמה תרמת?', 'amount') },
    { itemKey: 'capital.form867', subjectRole: 'couple', entityKind: 'account', entityRef: 'a1', prompt: P('טופס 867', 'file', { docKind: 'form867' }) },
    { itemKey: 'salary.form106', subjectRole: 'client', entityKind: 'employer', entityRef: 'e1', prompt: P('טופס 106', 'file', { docKind: 'form106' }) },
  ];
  const add1 = await office(`public.add_tax_info_asks('${e1.stepId}', ${lit(asks)}::jsonb)`);
  const add2 = await office(`public.add_tax_info_asks('${e1.stepId}', ${lit(asks.slice(0, 2))}::jsonb)`);
  ok(add1?.ok && add1.added === 5 && add2?.added === 0 && add2.skipped === 2, 'שאלות: הוספה חוזרת לא מכפילה', JSON.stringify([add1, add2]));
  const info = add1.infoStepId;
  ok((await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: info })).body?.asks?.length === 0, 'טיוטה אינה מוצגת בדף האישי');
  const rtsBefore = await office(`public.client_ready_to_send('${A}')`);
  ok(!(rtsBefore?.owner?.items ?? []).some(i => i.stepId === info), '«שלח בקשות»: טיוטה לא נספרת');

  // ── 3. פרסום ו«שלח בקשות» ──
  const pub = await office(`public.publish_tax_info('${info}')`);
  ok(pub?.ok && pub.published === 5, 'פרסום בדף האישי', JSON.stringify(pub));
  const st = await one(`select status, ball, published_at is not null as pub from public.onboarding_steps where id = '${info}'`);
  ok(st.status === 'waiting_client' && st.ball === 'client' && st.pub, 'אחרי פרסום: הכדור אצל הלקוח', JSON.stringify(st));
  const rts = await office(`public.client_ready_to_send('${A}')`);
  const rtsItem = (rts?.owner?.items ?? []).find(i => i.stepId === info);
  ok(!!rtsItem, '«שלח בקשות» מונה את «השלמת מידע» שפורסמה', JSON.stringify(rts?.owner?.items));
  ok((await other(`public.client_ready_to_send('${A}')`))?.error === 'forbidden', '«שלח בקשות» של משרד אחר — אסור');
  const portal = await anonRpc('get_client_portal', { p_token: tokA });
  const portalTxt = JSON.stringify(portal.body);
  ok(portal.status === 200 && portalTxt.includes(`taxinfo_${info}`), 'הדף האישי מציג את «השלמת מידע» כפריט פעולה', portalTxt.slice(0, 200));

  // ── 4. הלקוח: קריאה, הרשאות, טיוטה וחזרה ──
  const view = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: info })).body;
  ok(view?.ok && view.asks.length === 5 && view.taxYear === 2025, 'הלקוח רואה את 5 השאלות', JSON.stringify(view).slice(0, 200));
  const askId = (k) => view.asks.find(a => a.itemKey === k)?.id;
  { const xb = (await anonRpc('portal_tax_info', { p_token: tokB, p_step_id: info })).body; ok(xb?.ok === false && !xb.asks, `לקוח אחר (טוקן B) לא רואה שאלות של A (${xb?.error})`); }
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokB, p_ask_id: askId('donations.given'), p_answer: { kind: 'yes' } })).body?.ok !== true, 'לקוח אחר לא יכול לענות במקום A');
  ok((await anonRpc('portal_save_tax_info_draft', { p_token: tokA, p_ask_id: askId('donations.amount'), p_draft: { amount: '18' } })).body?.ok, 'טיוטה נשמרת בשרת');
  const back = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: info })).body;
  ok(back.asks.find(a => a.itemKey === 'donations.amount')?.savedDraft?.amount === '18', 'חזרה לדף — הטיוטה שם');

  // ── 5. תשובות ושליחה חוזרת ──
  const r1 = (await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('donations.given'), p_answer: { kind: 'yes' } })).body;
  const r1b = (await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('donations.given'), p_answer: { kind: 'yes' } })).body;
  ok(r1?.ok && r1b?.already, 'שליחה כפולה לא כותבת שוב', JSON.stringify([r1, r1b]));
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('household.creditChanges'), p_answer: { kind: 'yes' } })).body?.ok, 'השאלה החדשה (תואר/שחרור/יישוב) נענית');
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('donations.amount'), p_answer: { kind: 'amount', amount: -5 } })).body?.error === 'bad_amount', 'סכום שלילי נדחה');
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('donations.amount'), p_answer: { kind: 'amount', amount: 1800 } })).body?.ok, 'סכום נשמר');
  const un = (await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('salary.form106'), p_answer: { kind: 'unavailable', reason: 'המעסיק עוד לא שלח' } })).body;
  ok(un?.ok && un.state === 'unavailable', 'מסמך «אין לי עדיין» — מועד מעקב', JSON.stringify(un));
  const facts = await rows(`select item_key, status, answer, source from public.tax_year_facts where client_id = '${A}' order by item_key`);
  ok(facts.length === 3 && facts.every(f => f.status === 'pending' && f.source === 'portal'), 'תשובות לקוח נשמרו כממתינות לבדיקה', JSON.stringify(facts));

  // ── 6. העלאת מסמך ──
  const badTok = await upload({ token: 'not-a-token', stepId: info, itemKey: askId('capital.form867'), bytes: pdf('x') });
  ok(badTok.status === 403 && badTok.body.error === 'invalid_token', 'העלאה עם טוקן שגוי — נדחית');
  const cross = await upload({ token: tokB, stepId: info, itemKey: askId('capital.form867'), bytes: pdf('x') });
  ok(cross.status === 404 && cross.body.error === 'step_not_found', 'העלאה של לקוח B לבקשה של A — נדחית', JSON.stringify(cross));
  const notFile = await upload({ token: tokA, stepId: info, itemKey: askId('donations.given'), bytes: pdf('x') });
  ok(notFile.status >= 400, `העלאה לשאלה שנענתה/שאינה מסמך — נדחית (${notFile.body.error})`);
  const up = await upload({ token: tokA, stepId: info, itemKey: askId('capital.form867'), bytes: pdf(RUN) });
  ok(up.status === 200 && up.body.ok && up.body.documentId, 'העלאת 867 מהדף האישי', JSON.stringify(up));
  const up2 = await upload({ token: tokA, stepId: info, itemKey: askId('capital.form867'), bytes: pdf(RUN) });
  ok(up2.status === 409 && up2.body.error === 'item_closed', 'העלאה חוזרת לאותה שאלה — נדחית, בלי כפילות', JSON.stringify(up2));
  const ndocs = (await one(`select count(*)::int n from public.documents where client_id = '${A}'`)).n;
  ok(ndocs === 1, `מסמך אחד בתיק (${ndocs})`);
  const ev = await one(`select id, review, identity_match, document_id from public.tax_evidence where client_id = '${A}'`);
  ok(ev && ev.review === 'needs_review' && ev.document_id === up.body.documentId, 'הקובץ נרשם כראיה «ממתין לבדיקה» ומקושר למסמך', JSON.stringify(ev));
  const st2 = await one(`select status, ball from public.onboarding_steps where id = '${info}'`);
  ok(st2.ball === 'me', 'כשהכול נענה (106 «אין עדיין») — הכדור חוזר למשרד', JSON.stringify(st2));

  // ── 7. כשל חלקי: הקובץ נשמר, הרישום כראיה נכשל → ניסיון חוזר לא שומר עותק שני ──
  const e26 = await office(`public.ensure_tax_year_request('${A}', 'estimate', 2026, 9)`);
  const addX = await office(`public.add_tax_info_asks('${e26.stepId}', ${lit([{ itemKey: 'capital.form867', subjectRole: 'couple', entityKind: 'account', entityRef: 'a2', prompt: P('867 (2)', 'file', { docKind: 'form867' }) }])}::jsonb)`);
  await office(`public.publish_tax_info('${addX.infoStepId}')`);
  const v2 = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: addX.infoStepId })).body;
  const ask2 = v2.asks[0].id;
  // מדמים כשל ברישום: השאלה במצב שהשרת דוחה בשליחה, אבל הפונקציה מקבלת להעלאה
  await writeStaging(`update public.tax_info_asks set prompt = jsonb_set(prompt, '{input,kind}', '"file"') where id = '${ask2}'`);
  await writeStaging(`alter table public.tax_evidence add constraint qa_force_fail check (false) not valid`);
  const pf = await upload({ token: tokA, stepId: addX.infoStepId, itemKey: ask2, bytes: pdf(`${RUN}-2`) });
  await writeStaging(`alter table public.tax_evidence drop constraint if exists qa_force_fail`);
  ok(pf.status === 500 && pf.body.error === 'evidence_failed' && pf.body.documentId, 'כשל חלקי: הקובץ נשמר, השגיאה מדווחת עם המסמך', JSON.stringify(pf));
  const retry = await upload({ token: tokA, stepId: addX.infoStepId, itemKey: ask2, bytes: pdf(`${RUN}-2`) });
  ok(retry.status === 200 && retry.body.documentId === pf.body.documentId, 'ניסיון חוזר: אותו מסמך, בלי עותק שני', JSON.stringify(retry));
  ok((await one(`select count(*)::int n from public.documents where client_id = '${A}'`)).n === 2, 'בתיק שני מסמכים בדיוק (אחד לכל שאלה)');

  // ── 8. המשרד: בדיקה ואישור; משרד אחר ──
  const pend = (await rows(`select id from public.tax_year_facts where client_id = '${A}' and status = 'pending' and tax_year = 2025`)).map(r => r.id);
  const xdec = await other(`public.decide_tax_year_facts(${lit(`{${pend.join(',')}}`)}::uuid[], 'accept', null)`);
  ok(xdec?.thrown || xdec?.ok === false || xdec?.decided === 0, 'משרד אחר לא יכול לאשר עובדות של A', JSON.stringify(xdec));
  const dec = await office(`public.decide_tax_year_facts(${lit(`{${pend.join(',')}}`)}::uuid[], 'accept', null)`);
  ok(dec?.decided === pend.length, `אישור מרוכז של ${pend.length} עובדות`, JSON.stringify(dec));
  ok((await office(`public.review_tax_evidence('${ev.id}', 'match', 'match', 'accepted', null)`))?.ok, 'המסמך נבדק ואושר');
  const after = await one(`select count(*) filter (where status='accepted')::int a, count(*) filter (where status='pending')::int p from public.tax_year_facts where client_id = '${A}' and tax_year = 2025`);
  ok(after.a === 3 && after.p === 0, 'העובדות מאושרות, עם המקור', JSON.stringify(after));

  // ── 9. אין מיילים ──
  const postEmails = (await one(`select count(*)::int n from public.email_messages`)).n;
  ok(postEmails === preEmails && (await one(`select count(*)::int n from public.email_messages where client_id in ('${A}','${B}')`)).n === 0, 'לא נשלח שום מייל במהלך הבדיקה');
} catch (e) {
  fail++; console.error('✗ תקלה בהרצה:', e.message);
} finally {
  await cleanup().catch(e => { fail++; console.error('✗ ניקוי נכשל:', e.message); });
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
