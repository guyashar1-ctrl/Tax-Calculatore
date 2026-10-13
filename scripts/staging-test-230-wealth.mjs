#!/usr/bin/env node
/**
 * staging-test-230-wealth.mjs — הכנה להצהרת הון (230) מקצה לקצה על staging, על לקוחות בדיקה בלבד.
 *
 * ‼ כמו staging-test-229: פעולות המשרד ב-SQL בזהות משתמש הבדיקה (role authenticated + claims), פעולות
 *   הלקוח ב-HTTP עם המפתח הציבורי וטוקן הדף האישי, וההעלאה דרך portal-upload-document. אין מיילים.
 * ‼ בסוף: ניקוי מלא (גם קובצי האחסון, דרך Storage API — מחיקה מ-SQL חסומה) וסריקת שאריות.
 *
 *   שימוש (מתיקייה שיש בה .env.local עם SUPABASE_ACCESS_TOKEN, ו-.env.staging):
 *     node scripts/staging-test-230-wealth.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, PROD_REF, writeStaging as writeStagingOnce, api } from './staging-lib.mjs';
// ‼ 12.10.2026: ה-Management API מגביל קצב (ThrottlerException) — בעיקר בניקוי, שמריץ עשרות שאילתות. ניסיון חוזר עם המתנה
//   במקום «ניקוי נכשל» ושאריות. שאילתה שנכשלה מסיבה אחרת — נזרקת כרגיל.
async function writeStaging(q, n = 0) {
  try { return await writeStagingOnce(q); } catch (e) {
    if (/Throttler|Too Many Requests/.test(String(e?.message)) && n < 6) { await new Promise(r => setTimeout(r, 10_000 * (n + 1))); return writeStaging(q, n + 1); }
    throw e;
  }
}

const envStaging = Object.fromEntries(readFileSync(resolve(ROOT, '.env.staging'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const URL = envStaging.VITE_SUPABASE_URL, ANON = envStaging.VITE_SUPABASE_ANON_KEY;
if (!URL?.includes(STAGING_REF) || URL.includes(PROD_REF)) { console.error('✋ .env.staging אינו staging'); process.exit(1); }

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // qa-meetings@pivo.test — משרד אחר
const RUN = `QAWD${Date.now().toString(36).toUpperCase()}`;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const rows = async (q) => (await writeStaging(q)) ?? [];
const one = async (q) => (await rows(q))[0];
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
const upd = (stepId, patch, note = null) => office(`public.update_wealth_declaration('${stepId}', ${lit(patch)}::jsonb, ${note ? lit(note) : 'null'})`);
const payloadOf = async (id) => (await one(`select payload from public.onboarding_steps where id = '${id}'`)).payload;
async function anonRpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
async function upload({ token, stepId, itemKey, name = 'יתרות.pdf', bytes, type = 'application/pdf' }) {
  const fd = new FormData();
  fd.set('token', token); fd.set('tokenKind', 'portal'); fd.set('stepId', stepId); fd.set('itemKey', itemKey);
  fd.set('file', new File([bytes], name, { type }));
  const r = await fetch(`${URL}/functions/v1/portal-upload-document`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, body: fd });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { status: r.status, body: j };
}
const pdf = (s) => new TextEncoder().encode(`%PDF-1.4\n% ${s}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

// ── אחסון: מפתח השירות נקרא מה-Management API לזמן הריצה בלבד, לא מודפס ולא נשמר ──
let SERVICE = null;
async function serviceKey() {
  if (SERVICE) return SERVICE;
  const keys = await api(`/projects/${STAGING_REF}/api-keys?reveal=true`);
  SERVICE = (keys ?? []).find(k => k.name === 'service_role')?.api_key ?? null;
  return SERVICE;
}
async function storageRemove(paths) {
  if (!paths.length) return { ok: true, removed: 0 };
  const key = await serviceKey();
  if (!key) return { ok: false, error: 'no service key' };
  const r = await fetch(`${URL}/storage/v1/object/client-documents`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
  const j = await r.json().catch(() => []);
  return { ok: r.ok, removed: Array.isArray(j) ? j.length : 0 };
}
async function storageText(path) {
  const key = await serviceKey();
  const r = await fetch(`${URL}/storage/v1/object/client-documents/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return r.ok ? await r.text() : null;
}

const clients = [];
async function newClient(last, extra = '') {
  const id = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type${extra ? ', spouse_first_name' : ''})
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'דוד', '${last}', 'delivered@resend.dev', 'active', '${extra ? 'married' : 'single'}', 'licensed'${extra ? `, '${extra}'` : ''}) returning id`)).id;
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
    delete from public.tax_fact_changes where client_id in (${ids});
    delete from public.accountant_notifications where client_id in (${ids});
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${ids}));
    delete from public.client_notices where client_id in (${ids});
    delete from public.email_messages where client_id in (${ids});
    delete from public.documents where client_id in (${ids});
    delete from public.onboarding_steps where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
  const real = docs.map(d => d.storage_path).filter(p => p && !p.startsWith('qa-none/'));
  const rm = await storageRemove(real);
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
  const objLeft = (await one(`select count(*)::int n from storage.objects where bucket_id = 'client-documents' and name in (${real.map(lit).join(',') || "''"})`)).n;
  ok(rm.ok && objLeft === 0, `קובצי האחסון של הריצה נמחקו (${real.length})`, JSON.stringify(rm));
}

/** שמונת הקבצים מהסבב הקודם: רק קבצים של משתמש הבדיקה, ללקוח שכבר לא קיים, זעירים, מ-11.10, ושהתוכן שלהם הוא ה-PDF המלאכותי (QATY…). */
async function cleanupLeftovers() {
  const cand = await rows(`select o.name, (o.metadata->>'size')::int size, o.created_at::date d from storage.objects o
    where o.bucket_id = 'client-documents' and o.name like '${OFFICE}/%' and o.created_at >= '2026-10-11' and o.created_at < '2026-10-12'
      and (o.metadata->>'size')::int < 300
      and not exists (select 1 from public.clients c where c.id = split_part(o.name, '/', 2))
      and not exists (select 1 from public.documents d where d.storage_path = o.name)`);
  const sure = [];
  for (const c of cand) {
    const t = await storageText(c.name);
    if (t && /^%PDF-1\.4\n% QATY[0-9A-Z]+(-2)?\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n$/.test(t)) sure.push(c.name);
  }
  console.log(`  שאריות מהסבב הקודם: ${cand.length} מועמדים, ${sure.length} זוהו בוודאות כקובצי בדיקה`);
  const rm = await storageRemove(sure);
  const still = sure.length ? (await one(`select count(*)::int n from storage.objects where bucket_id = 'client-documents' and name in (${sure.map(lit).join(',')})`)).n : 0;
  ok(rm.ok && still === 0, `שאריות מהסבב הקודם נמחקו (${sure.length})`, JSON.stringify(rm));
}

try {
  console.log(`יעד: ${STAGING_REF} · ריצה ${RUN}`);
  const preEmails = (await one(`select count(*)::int n from public.email_messages`)).n;
  const A = await newClient(`${RUN}-A`, 'מיכל'), B = await newClient(`${RUN}-B`);
  const tokA = await office(`public.mint_portal_token('${A}')`), tokB = await office(`public.mint_portal_token('${B}')`);
  ok(typeof tokA === 'string' && tokA !== tokB, 'טוקן דף אישי לכל לקוח');
  // אסמכתאות בתיק: מכתב דרישה (A), מסמך של B, ורשומה מאושרת מיישור קו (A). בלי קובץ באחסון.
  await writeStaging(`insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year, description, label_id)
    values ('${RUN}-dA', '${OFFICE}', '${A}', 'qa-none/${RUN}-dA', 'מכתב דרישה.pdf', 'application/pdf', 100, 'other', '2026', 'מכתב דרישה להצהרת הון', public.ensure_reserved_document_label('${OFFICE}')),
           ('${RUN}-dB', '${OFFICE}', '${B}', 'qa-none/${RUN}-dB', 'של B.pdf', 'application/pdf', 100, 'other', '2026', 'מסמך של לקוח אחר', public.ensure_reserved_document_label('${OFFICE}'));
    insert into public.tax_fact_changes (id, user_id, client_id, field_key, label, new_value, source, status, decided_by, decided_at)
    values ('${RUN}-tfA', '${OFFICE}', '${A}', 'capitalDeclarationRequired', 'דרישת הצהרת הון', '{"display":"דרישה פתוחה"}', 'institution_alignment', 'accepted', '${OFFICE}', now()),
           ('${RUN}-tfM', '${OFFICE}', '${A}', 'capitalDeclarationRequired', 'דרישת הצהרת הון', '{"display":"דרישה פתוחה"}', 'manual', 'accepted', '${OFFICE}', now());`);

  // ── 1. הצהרה ראשונה בלי דרישה ──
  const w1 = await office(`public.ensure_wealth_declaration('${A}', '2025-12-31', null)`);
  const w1b = await office(`public.ensure_wealth_declaration('${A}', '2025-12-31', null)`);
  ok(w1?.ok && w1.created && w1.kind === 'first' && !w1b.created && w1b.stepId === w1.stepId, 'פתיחה בלי דרישה: ראשונה; לחיצה כפולה → אותה הכנה', JSON.stringify([w1, w1b]));
  let p = await payloadOf(w1.stepId);
  ok(!p.demand && !p.internalTarget, 'הכנה בלי דרישה: אין מועד ואין יעד שנקבעו מעצמם', JSON.stringify(p));
  ok((await other(`public.ensure_wealth_declaration('${A}', '2025-12-31', null)`))?.thrown, 'משרד אחר לא יכול לפתוח הכנה');
  ok((await anonRpc('ensure_wealth_declaration', { p_client_id: A, p_as_of: '2025-12-31', p_kind: null })).status >= 400, 'אנונימי לא יכול לפתוח הכנה');

  // ── 2. דרישה: מידע לא מאומת → אימות מול אסמכתה → ארכה → שינוי מבטל אימות ──
  ok((await upd(w1.stepId, { demand: { source: 'client', note: 'הלקוח סיפר בטלפון' } }))?.ok, 'מידע חלקי על דרישה נשמר');
  p = await payloadOf(w1.stepId);
  ok(p.demand.status === 'reported' && !p.demand.computedDue, '«טרם אומתה», בלי מועד', JSON.stringify(p.demand));
  await upd(w1.stepId, { demand: { source: 'letter', letterDate: '2026-09-14', receivedOn: '2026-09-20', dueInLetter: '2027-01-31' } });
  p = await payloadOf(w1.stepId);
  ok(p.demand.status === 'reported' && p.demand.computedDue === '2027-01-12' && p.demand.dueInLetter === '2027-01-31', 'רצפה חוקית מתאריך המכתב (14.09.2026 ⇒ 12.01.2027), נפרד מהמועד שבמכתב', JSON.stringify(p.demand));
  ok((await upd(w1.stepId, { demandVerify: { kind: 'document', documentId: `${RUN}-dB` } }))?.error === 'evidence_not_found', 'אימות מול מסמך של לקוח אחר — נדחה');
  ok((await upd(w1.stepId, { demandVerify: { kind: 'authority_record', recordId: `${RUN}-tfM` } }))?.error === 'evidence_not_found', 'אימות מול עריכה ידנית — אינו רשומה מהרשות');
  ok((await upd(w1.stepId, { demandVerify: { kind: 'document', documentId: `${RUN}-dA`, label: 'מכתב דרישה' } }))?.ok, 'אימות מול מכתב בתיק');
  p = await payloadOf(w1.stepId);
  ok(p.demand.status === 'verified' && p.demand.verifiedBy === OFFICE && p.demand.verifiedAt && p.demand.evidence?.documentId === `${RUN}-dA`, 'דרישה מאומתת: אסמכתה, מי ומתי', JSON.stringify(p.demand));
  ok((await upd(w1.stepId, { demandExtension: { until: '2027-03-31', kind: 'personal', documentId: `${RUN}-dA` } }))?.ok, 'ארכה מתועדת נרשמה');
  p = await payloadOf(w1.stepId);
  ok(p.demand.extension?.until === '2027-03-31' && p.demand.dueInLetter === '2027-01-31' && p.demand.status === 'verified', 'הארכה נפרדת — המועד שבמכתב לא נדרס', JSON.stringify(p.demand));
  await upd(w1.stepId, { demand: { source: 'letter', letterDate: '2026-09-14', receivedOn: '2026-09-20', dueInLetter: '2027-02-28' } });
  p = await payloadOf(w1.stepId);
  ok(p.demand.status === 'reported' && p.demand.unverifiedFrom, 'שינוי בדרישה מאומתת מבטל את האימות', JSON.stringify(p.demand));
  ok((await upd(w1.stepId, { demandVerify: { kind: 'authority_record', recordId: `${RUN}-tfA` } }))?.ok, 'אימות מחדש מול רשומה מיישור קו');
  ok((await other(`public.update_wealth_declaration('${w1.stepId}', '{"internalTarget":"2026-12-01"}'::jsonb, null)`))?.thrown, 'משרד אחר לא יכול לעדכן');

  // ── 3. שאלות, פרסום, דף אישי ו«שלח בקשות» ──
  const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra }, templateVersion: 'qa' });
  const asks = [
    { itemKey: 'wealth.cash', subjectRole: 'couple', prompt: P('מזומן ביום ההצהרה', 'amount') },
    { itemKey: 'wealth.realEstate.has', subjectRole: 'spouse', prompt: P('האם למיכל יש נדל״ן?', 'yesno') },
    { itemKey: 'wealth.realEstate.has', subjectRole: 'client', prompt: P('האם לדוד יש נדל״ן?', 'yesno') },
    { itemKey: 'wealth.bank.certs', subjectRole: 'couple', prompt: P('אישורי יתרות', 'file', { docKind: 'bankBalanceCert' }) },
    { itemKey: 'wealth.funds.certs', subjectRole: 'couple', prompt: P('אישורים מהקופות', 'file', { docKind: 'fundWealthCert' }) },
  ];
  const ann = await office(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
  ok((await office(`public.add_tax_info_asks('${ann.stepId}', ${lit([asks[0]])}::jsonb)`))?.error === 'item_purpose_mismatch', 'שאלת הון בתוך הדוח השנתי — נדחית');
  ok((await office(`public.add_tax_info_asks('${w1.stepId}', ${lit([{ itemKey: 'donations.given', subjectRole: 'client', prompt: P('תרמת?', 'yesno') }])}::jsonb)`))?.error === 'item_purpose_mismatch', 'שאלת שנת מס בתוך הצהרת הון — נדחית');
  ok((await one(`select count(*)::int n from public.onboarding_steps where client_id = '${A}' and step_type = 'info_collection'`)).n === 0, 'הדחיות לא השאירו «השלמת מידע» ריקה');
  const add1 = await office(`public.add_tax_info_asks('${w1.stepId}', ${lit(asks)}::jsonb)`);
  const add2 = await office(`public.add_tax_info_asks('${w1.stepId}', ${lit(asks.slice(0, 2))}::jsonb)`);
  ok(add1?.ok && add1.added === 5 && add2?.added === 0, 'שאלות הון: הוספה חוזרת לא מכפילה', JSON.stringify([add1, add2]));
  const info = add1.infoStepId;
  const infoP = await payloadOf(info);
  ok(infoP.title === 'השלמת מידע להצהרת הון' && infoP.asOfDate === '2025-12-31', 'בקשת־הבת: כותרת ויום ההצהרה', JSON.stringify(infoP));
  ok(!((await office(`public.client_ready_to_send('${A}')`))?.owner?.items ?? []).some(i => i.stepId === info), '«שלח בקשות»: טיוטה לא נספרת');
  ok((await office(`public.publish_tax_info('${info}')`))?.published === 5, 'פרסום בדף האישי');
  ok(((await office(`public.client_ready_to_send('${A}')`))?.owner?.items ?? []).some(i => i.stepId === info), '«שלח בקשות» מונה את «השלמת מידע להצהרת הון»');
  const portalTxt = JSON.stringify((await anonRpc('get_client_portal', { p_token: tokA })).body);
  ok(portalTxt.includes(`taxinfo_${info}`) && !portalTxt.includes(w1.stepId), 'הדף האישי: «השלמת מידע» כפריט פעולה; ההכנה הפנימית לא מוצגת ללקוח');
  const view = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: info })).body;
  ok(view?.ok && view.asks.length === 5, 'הלקוח רואה 5 שאלות', JSON.stringify(view).slice(0, 200));
  const askId = (k, role) => view.asks.find(a => a.itemKey === k && (!role || a.subjectRole === role))?.id;
  ok((await anonRpc('portal_tax_info', { p_token: tokB, p_step_id: info })).body?.ok === false, 'לקוח B לא רואה את השאלות של A');
  ok((await anonRpc('portal_save_tax_info_draft', { p_token: tokA, p_ask_id: askId('wealth.cash'), p_draft: { amount: '3' } })).body?.ok, 'טיוטה נשמרת');
  ok((await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: info })).body.asks.find(a => a.itemKey === 'wealth.cash')?.savedDraft?.amount === '3', 'חזרה לדף — הטיוטה שם');
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('wealth.cash'), p_answer: { kind: 'amount', amount: 3500 } })).body?.ok, 'מזומן נשמר');
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('wealth.realEstate.has', 'spouse'), p_answer: { kind: 'no' } })).body?.ok, 'בת הזוג: אין נדל״ן');
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('wealth.realEstate.has', 'client'), p_answer: { kind: 'yes' } })).body?.ok, 'הלקוח: יש נדל״ן');
  const f1 = await rows(`select item_key, subject_role, period_kind, period_to::text t, basis, status from public.tax_year_facts where client_id = '${A}' order by item_key, subject_role`);
  ok(f1.length === 3 && f1.every(f => f.period_kind === 'as_of' && f.t === '2025-12-31' && f.status === 'pending'), 'תשובות: «נכון ליום ההצהרה», ממתינות', JSON.stringify(f1));
  ok(f1.some(f => f.subject_role === 'spouse') && f1.some(f => f.subject_role === 'client'), 'הנושא נשמר לכל אחד מבני הזוג');

  // ── 4. מסמכים: העלאה, חוזרת, לקוח אחר, כשל חלקי ──
  const up = await upload({ token: tokA, stepId: info, itemKey: askId('wealth.bank.certs'), bytes: pdf(RUN) });
  ok(up.status === 200 && up.body.documentId, 'העלאת אישור יתרות מהדף האישי', JSON.stringify(up));
  ok((await upload({ token: tokA, stepId: info, itemKey: askId('wealth.bank.certs'), bytes: pdf(RUN) })).status === 409, 'העלאה חוזרת לאותה שאלה — נדחית');
  ok((await upload({ token: tokB, stepId: info, itemKey: askId('wealth.funds.certs'), bytes: pdf(RUN) })).status === 404, 'לקוח B לא יכול להעלות לבקשה של A');
  const ev = await one(`select id, review, doc_kind, document_id from public.tax_evidence where client_id = '${A}' and doc_kind = 'bankBalanceCert'`);
  ok(ev?.review === 'needs_review' && ev.document_id === up.body.documentId, 'הקובץ נרשם כראיה «ממתין לבדיקה»', JSON.stringify(ev));
  await writeStaging(`alter table public.tax_evidence add constraint qa_force_fail check (false) not valid`);
  const pf = await upload({ token: tokA, stepId: info, itemKey: askId('wealth.funds.certs'), bytes: pdf(`${RUN}-2`) });
  await writeStaging(`alter table public.tax_evidence drop constraint if exists qa_force_fail`);
  ok(pf.status === 500 && pf.body.documentId, 'כשל חלקי: הקובץ נשמר, השגיאה מדווחת', JSON.stringify(pf));
  const retry = await upload({ token: tokA, stepId: info, itemKey: askId('wealth.funds.certs'), bytes: pdf(`${RUN}-2`) });
  ok(retry.status === 200 && retry.body.documentId === pf.body.documentId, 'ניסיון חוזר: אותו מסמך, בלי עותק שני', JSON.stringify(retry));
  ok((await one(`select count(*)::int n from public.documents where client_id = '${A}' and id not like '${RUN}-%'`)).n === 2, 'בתיק שני מסמכים שהועלו (אחד לכל שאלה)');

  // ── 5. אישור המשרד ──
  const pend = (await rows(`select id from public.tax_year_facts where client_id = '${A}' and status = 'pending'`)).map(r => r.id);
  ok((await other(`public.decide_tax_year_facts(${lit(`{${pend.join(',')}}`)}::uuid[], 'accept', null)`))?.thrown, 'משרד אחר לא יכול לאשר');
  ok((await office(`public.decide_tax_year_facts(${lit(`{${pend.join(',')}}`)}::uuid[], 'accept', null)`))?.decided === pend.length, `אישור ${pend.length} עובדות`);
  ok((await office(`public.review_tax_evidence('${ev.id}', 'match', 'match', 'accepted', null)`))?.ok, 'אישור יתרות נבדק ואושר');

  // ── 6. שתי הצהרות באותה שנה, ודוח שנתי — בלי ערבוב ──
  const w2 = await office(`public.ensure_wealth_declaration('${A}', '2025-06-30', null)`);
  ok(w2?.ok && w2.created && w2.stepId !== w1.stepId, 'הצהרה שנייה באותה שנה (30.06.2025) — הכנה נפרדת');
  const add3 = await office(`public.add_tax_info_asks('${w2.stepId}', ${lit([asks[0]])}::jsonb)`);
  ok(add3?.infoStepId && add3.infoStepId !== info, 'לכל הצהרה «השלמת מידע» משלה');
  await office(`public.publish_tax_info('${add3.infoStepId}')`);
  const v2 = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: add3.infoStepId })).body;
  await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: v2.asks[0].id, p_answer: { kind: 'amount', amount: 900 } });
  const cash = await rows(`select period_to::text t, value from public.tax_year_facts where client_id = '${A}' and item_key = 'wealth.cash' order by period_to`);
  ok(cash.length === 2 && cash[0].t === '2025-06-30' && Number(cash[0].value) === 900 && cash[1].t === '2025-12-31' && Number(cash[1].value) === 3500, 'מזומן לכל יום הצהרה בנפרד', JSON.stringify(cash));
  const addAnn = await office(`public.add_tax_info_asks('${ann.stepId}', ${lit([{ itemKey: 'donations.given', subjectRole: 'client', prompt: P('תרמת?', 'yesno') }])}::jsonb)`);
  await office(`public.publish_tax_info('${addAnn.infoStepId}')`);
  const v3 = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: addAnn.infoStepId })).body;
  await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: v3.asks[0].id, p_answer: { kind: 'yes' } });
  const mix = await one(`select count(*) filter (where item_key like 'wealth.%' and period_kind <> 'as_of')::int a, count(*) filter (where item_key not like 'wealth.%' and period_kind = 'as_of')::int b from public.tax_year_facts where client_id = '${A}'`);
  ok(mix.a === 0 && mix.b === 0, 'הדוח השנתי והצהרות ההון לא מערבבים עובדות (תקופה לפי תכלית)', JSON.stringify(mix));
  ok((await one(`select count(*)::int n from public.tax_year_facts where client_id = '${B}'`)).n === 0, 'ללקוח B אין שום עובדה');

  // ── 7. הצהרת המשך: הצהרה קודמת כפי שהוגשה, שינוי בסיס, ביסוס, השמטה ──
  const w3 = await office(`public.ensure_wealth_declaration('${A}', '2026-12-31', null)`);
  p = await payloadOf(w3.stepId);
  ok(w3.kind === 'followup' && p.previous?.fromStepId === w1.stepId, 'יום מאוחר ⇒ הצהרת המשך, מקושרת להכנה הקודמת', JSON.stringify(p.previous));
  ok((await upd(w3.stepId, { previous: { asOfDate: '2025-12-31', netWorth: 1200000, sections: { wFunds: 200000 }, basis: { funds: 'employeeOnly', securities: 'marketValueOldForm' } } }))?.ok, 'ההצהרה הקודמת נקלטה כפי שהוגשה');
  ok((await upd(w3.stepId, { basis: { funds: 'employeeOnly' } }))?.error === 'basis_needs_justification', 'המשך «רק חלק העובד» בלי ביסוס — נדחה (לא ממשיכים שיטה מעצמה)');
  ok((await upd(w3.stepId, { basis: { funds: 'allDeposits' } }))?.error === 'basis_change_needs_explanation', 'שינוי בסיס בלי הסבר — נדחה');
  ok((await upd(w3.stepId, { basis: { funds: 'allDeposits', securities: 'cost' }, basisChange: { explanation: 'לשון הטופס; גישור בהשוואה' } }))?.basisChanges === 2, 'שינוי בסיס מתועד (2 סעיפים)');
  p = await payloadOf(w3.stepId);
  ok(p.previous.netWorth === 1200000 && p.previous.basis.funds === 'employeeOnly' && p.basis.funds === 'allDeposits' && p.basisChanges.every(c => c.approvedBy === OFFICE), 'ההצהרה הקודמת נשארה כפי שהוגשה; הבסיס החדש והאישור בנפרד', JSON.stringify(p));
  ok((await upd(w3.stepId, { omission: { add: { area: 'wBank', description: 'חשבון בחו״ל שהיה פתוח ב-31.12.2025 ולא הוצהר' } } }))?.ok, 'השמטה נרשמה כממצא פתוח');
  let blocked = false;
  try { await writeStaging(`update public.onboarding_steps set status = 'completed' where id = '${w3.stepId}'`); } catch (e) { blocked = /wealth_omission_open/.test(e.message); }
  ok(blocked, 'סגירה עם ממצא השמטה פתוח — נחסמת בשרת');
  const om = (await payloadOf(w3.stepId)).omissions[0];
  ok((await upd(w3.stepId, { omission: { resolve: { id: om.id, resolution: 'הועבר לבירור רו״ח' } } }))?.ok, 'הממצא הוכרע עם נימוק');

  // ── 8. שורות בבקשות ──
  const st = await rows(`select step_type, track, status from public.onboarding_steps where client_id = '${A}' and step_type in ('wealth_declaration','info_collection') order by step_type`);
  ok(st.filter(s => s.step_type === 'wealth_declaration').length === 3 && st.filter(s => s.step_type === 'info_collection').length === 3, 'בבקשות: 3 הכנות להצהרת הון ו-3 «השלמת מידע» (כולל הדוח השנתי)', JSON.stringify(st));

  // ── 9. אין מיילים ──
  const postEmails = (await one(`select count(*)::int n from public.email_messages`)).n;
  ok(postEmails === preEmails, 'לא נשלח שום מייל במהלך הבדיקה');
} catch (e) {
  fail++; console.error('✗ תקלה בהרצה:', e.message);
} finally {
  await cleanup().catch(e => { fail++; console.error('✗ ניקוי נכשל:', e.message); });
  if (process.argv.includes('--leftovers')) await cleanupLeftovers().catch(e => { fail++; console.error('✗ ניקוי שאריות נכשל:', e.message); });
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
