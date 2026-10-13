#!/usr/bin/env node
/**
 * staging-test-236-intake.mjs — קליטה והשלמת תיק המס (236) מקצה לקצה על staging, על לקוחות בדיקה בלבד.
 *
 * ‼ בלי סיסמאות ובלי ממשק: פעולות המשרד ב-SQL בזהות משתמש הבדיקה (role authenticated + request.jwt.claims), פעולות
 *   הלקוח ב-HTTP עם המפתח הציבורי וטוקן הדף האישי, וההעלאה דרך portal-upload-document. אין שליחת מיילים.
 * ‼ מה נבדק: פתיחה אחת ללקוח, שאלות קליטה (ולא שנה/הון), «נכון ליום הקליטה», ישות זמנית (מעסיק חדש: פרטים + תלוש),
 *   העלאה, «אין לי עדיין» והכדור חוזר למשרד, «החזר לתיקון», אישור, הוספה לכרטיס **עם אותו מזהה** (apply_tax_facts),
 *   «עדכן בתיק» לשדה כן/לא, בידוד בין לקוחות, ושהדוח השנתי של אותו לקוח לא נפגע.
 * ‼ בסוף: ניקוי מלא וסריקת שאריות (גם אם בדיקה נכשלה).
 *
 *   שימוש (מתיקייה שיש בה .env.local עם SUPABASE_ACCESS_TOKEN, ו-.env.staging): node scripts/staging-test-236-intake.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, PROD_REF, writeStaging } from './staging-lib.mjs';

const envStaging = Object.fromEntries(readFileSync(resolve(ROOT, '.env.staging'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const URL = envStaging.VITE_SUPABASE_URL, ANON = envStaging.VITE_SUPABASE_ANON_KEY, SERVICE = envStaging.SUPABASE_SERVICE_ROLE_KEY;
if (!URL?.includes(STAGING_REF) || URL.includes(PROD_REF)) { console.error('✋ .env.staging אינו staging'); process.exit(1); }

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // משרד אחר
const RUN = `QAIN${Date.now().toString(36).toUpperCase()}`;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const lit = (v) => `$q$${typeof v === 'string' ? v : JSON.stringify(v)}$q$`;
const rows = async (q) => (await writeStaging(q)) ?? [];
const one = async (q) => (await rows(q))[0];
const pause = () => new Promise(r => setTimeout(r, 150));
async function asUser(uid, expr) {
  try {
    await pause();
    const r = await one(`begin; set local role authenticated;
      select set_config('request.jwt.claims', ${lit({ sub: uid, role: 'authenticated' })}, true);
      select (${expr}) as r; commit;`);
    return r?.r;
  } catch (e) { await writeStaging('rollback;').catch(() => {}); return { thrown: e.message }; }
}
const office = (expr) => asUser(OFFICE, expr);
const other = (expr) => asUser(OTHER, expr);
async function anonRpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
async function upload({ token, stepId, itemKey, name = 'תלוש.pdf', bytes }) {
  const fd = new FormData();
  fd.set('token', token); fd.set('tokenKind', 'portal'); fd.set('stepId', stepId); fd.set('itemKey', itemKey);
  fd.set('file', new File([bytes], name, { type: 'application/pdf' }));
  const r = await fetch(`${URL}/functions/v1/portal-upload-document`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, body: fd });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { status: r.status, body: j };
}
const pdf = (s) => new TextEncoder().encode(`%PDF-1.4\n% ${s}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

const clients = [];
async function newClient(last, married = true) {
  const id = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, spouse_first_name, city)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'נועה', '${last}', 'delivered@resend.dev', 'active', '${married ? 'married' : 'single'}', 'licensed', ${married ? "'יאיר'" : 'null'}, 'חיפה') returning id`)).id;
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
    delete from public.annual_report_answers where session_id in (select id from public.annual_report_sessions where client_id in (${ids}));
    delete from public.annual_report_sessions where client_id in (${ids});
    delete from public.onboarding_steps where client_id in (${ids});
    delete from public.engagements where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
  const paths = docs.map(d => d.storage_path).filter(Boolean);
  if (paths.length && SERVICE) {
    const r = await fetch(`${URL}/storage/v1/object/client-documents`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
    ok(r.ok, `קובצי הבדיקה נמחקו מהאחסון (${paths.length})`);
  }
  const tables = await rows(`select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('client_id','linked_client_id') and table_name not like 'v\\_%'`);
  let left = 0;
  for (const t of tables) {
    await pause();
    const n = (await one(`select count(*)::int n from public."${t.table_name}" where "${t.column_name}" in (${ids})`).catch(() => ({ n: 0 })))?.n ?? 0;
    if (n) { left += n; console.log(`    שארית: ${t.table_name}.${t.column_name} = ${n}`); }
  }
  ok(left === 0, `ניקוי: אין שאריות של לקוחות הבדיקה (${tables.length} עמודות נסרקו)`);
}

try {
  console.log(`יעד: ${STAGING_REF} · ריצה ${RUN}`);
  const has = await one(`select to_regprocedure('public.ensure_tax_file_intake(text)') is not null as x`);
  if (!has.x) { console.error('✋ 236 לא הוחלה על staging'); process.exit(1); }
  const preEmails = (await one(`select count(*)::int n from public.email_messages`)).n;
  const A = await newClient(`${RUN}-A`), B = await newClient(`${RUN}-B`, false);
  const tokA = await office(`public.mint_portal_token('${A}')`), tokB = await office(`public.mint_portal_token('${B}')`);
  ok(typeof tokA === 'string' && tokA !== tokB, 'טוקן דף אישי לכל לקוח');

  // שאלון הקליטה הישן — פתוח ומפורסם, כמו אצל לקוח שהמחולל יצר לו אותו
  const legacyId = (await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${A}', 'intake_questionnaire', 'internal', 'person', 'waiting_client', 'client', '{}'::jsonb, now()) returning id`)).id;
  const portal0 = JSON.stringify((await anonRpc('get_client_portal', { p_token: tokA })).body);
  ok(portal0.includes('עדכון סטטוס מיסויי'), 'לפני: השאלון הישן בדף האישי', portal0.slice(0, 200));

  // ── 1. פתיחה ──
  const i1 = await office(`public.ensure_tax_file_intake('${A}')`);
  const i1b = await office(`public.ensure_tax_file_intake('${A}')`);
  ok(i1?.ok && i1.created && !i1b.created && i1.stepId === i1b.stepId, 'פתיחה; לחיצה כפולה → אותה קליטה', JSON.stringify([i1, i1b]));
  const s1 = await one(`select payload from public.onboarding_steps where id = '${i1.stepId}'`);
  const today = (await one(`select current_date::text d`)).d;
  ok(s1.payload.purpose === 'intake' && s1.payload.asOfDate === today, 'נכון ליום הקליטה', JSON.stringify(s1.payload));
  ok((await other(`public.ensure_tax_file_intake('${A}')`))?.thrown, 'משרד אחר — אסור');
  ok((await anonRpc('ensure_tax_file_intake', { p_client_id: A })).status >= 400, 'אנונימי — אסור');

  // ── 1ב. השאלון הישן מול הקליטה: בחירת המשרד, בלי כפילות ──
  ok(s1.payload.legacyStepId === legacyId, 'הקליטה מקושרת לשאלון הישן הפתוח', JSON.stringify(s1.payload));
  ok((await one(`select status from public.onboarding_steps where id = '${legacyId}'`)).status === 'waiting_client', 'פתיחת הקליטה לא נגעה בשאלון הישן');
  ok((await other(`public.replace_legacy_intake('${i1.stepId}')`))?.thrown, 'משרד אחר — אסור להחליף');
  ok((await anonRpc('replace_legacy_intake', { p_intake_step_id: i1.stepId })).status >= 400, 'אנונימי — אסור להחליף');
  // ── 6 · הקישור הישן, כמו הלקוח (מפתח אנונימי): לפני ההחלפה — נפתח ושומר; זו גם «הלשונית שכבר פתוחה» ──
  const itokA = (await one(`select intake_token from public.clients where id = '${A}'`)).intake_token;
  ok(typeof itokA === 'string' && itokA.length > 10, 'לשאלון הישן יש קישור (טוקן נטבע בפרסום)');
  const st0 = await anonRpc('start_intake', { p_token: itokA });
  const sess0 = Array.isArray(st0.body) ? st0.body[0] : null;
  ok(st0.status === 200 && !!sess0?.session_id, 'לפני ההחלפה: הקישור הישן נפתח (start_intake)', JSON.stringify(st0).slice(0, 200));
  const save = (q, done = false) => anonRpc('save_intake_answer', { p_token: itokA, p_session_id: sess0?.session_id, p_question_id: q,
    p_answer: { values: ['salary'] }, p_model: { taxYear: sess0?.tax_year, meta: { flow: 'onboarding' }, marker: q }, p_current_question_id: 'next_' + q, p_done: done });
  ok((await save('year_map')).body === true, 'לפני ההחלפה: תשובה נשמרה');
  ok((await anonRpc('intake_replaced_state', { p_token: itokA })).body?.replaced === false, 'לפני ההחלפה: «לא הוחלף»');
  const rep1 = await office(`public.replace_legacy_intake('${i1.stepId}')`);
  const leg1 = await one(`select status, payload from public.onboarding_steps where id = '${legacyId}'`);
  const s1r = await one(`select payload from public.onboarding_steps where id = '${i1.stepId}'`);
  ok(rep1?.ok && rep1.replaced && leg1.status === 'cancelled' && leg1.payload.replacedBy === i1.stepId && s1r.payload.legacyReplaced?.stepId === legacyId,
    '«החלף בקליטה»: השאלון הישן מבוטל עם «הוחלף», והקליטה רושמת זאת', JSON.stringify([rep1, leg1.status, s1r.payload.legacyReplaced]));
  const evLeg = await one(`select count(*)::int n from public.onboarding_events where step_id = '${legacyId}'`);
  ok(evLeg.n >= 1, 'הביטול נרשם ביומן הבקשה (כמו «הסר»)', JSON.stringify(evLeg));
  const portal1 = JSON.stringify((await anonRpc('get_client_portal', { p_token: tokA })).body);
  ok(!portal1.includes('עדכון סטטוס מיסויי'), 'אחרי: השאלון הישן ירד מהדף האישי');
  ok((await office(`public.replace_legacy_intake('${i1.stepId}')`))?.replaced === false, 'שוב — אין מה להחליף');
  // ── 6 · אחרי ההחלפה: «הוחלף» + הפניה לדף האישי; כל כתיבה נחסמת בשרת; התשובות וההיסטוריה נשמרות ──
  const stA = (await anonRpc('intake_replaced_state', { p_token: itokA })).body;
  ok(stA?.ok && stA.replaced === true && stA.portalToken === tokA && !!stA.at, 'הקישור הישן: «הוחלף», עם הקישור לדף האישי של הלקוח', JSON.stringify(stA));
  const st1 = await anonRpc('start_intake', { p_token: itokA });
  ok(st1.status >= 400 && JSON.stringify(st1.body).includes('intake_replaced'), 'פתיחת השאלון שהוחלף — נחסמת בשרת (intake_replaced)', JSON.stringify(st1).slice(0, 200));
  ok((await save('marital')).body === false, 'הלשונית שהייתה פתוחה: שמירת תשובה — נדחית בשרת');
  ok((await anonRpc('reopen_intake', { p_token: itokA })).body === false, 'פתיחה מחדש («משהו השתנה?») — נדחית בשרת');
  const kept = await one(`select count(*)::int n, string_agg(question_id, ',') q from public.annual_report_answers where session_id = '${sess0.session_id}'`);
  const sessA = await one(`select model->>'marker' marker, current_question_id, superseded_by, status from public.annual_report_sessions where id = '${sess0.session_id}'`);
  ok(kept.n === 1 && kept.q === 'year_map' && sessA.marker === 'year_map' && sessA.current_question_id === 'next_year_map' && !sessA.superseded_by,
    'התשובה שניתנה לפני ההחלפה וההיסטוריה — נשמרו בלי שינוי; שום תשובה חדשה לא נכנסה', JSON.stringify([kept, sessA]));
  ok((await anonRpc('intake_replaced_state', { p_token: 'no-such-token-' + RUN })).body?.ok === false, 'קישור לא קיים — «לא תקין», בלי מידע');
  // ── 6 · שאלון ישן שלא הוחלף (לקוח אחר) — עובד כרגיל ──
  await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${B}', 'intake_questionnaire', 'internal', 'person', 'waiting_client', 'client', '{}'::jsonb, now()) returning id`);
  const itokB = (await one(`select intake_token from public.clients where id = '${B}'`)).intake_token;
  const stB = await anonRpc('start_intake', { p_token: itokB });
  const sessB = Array.isArray(stB.body) ? stB.body[0] : null;
  const svB = await anonRpc('save_intake_answer', { p_token: itokB, p_session_id: sessB?.session_id, p_question_id: 'year_map', p_answer: { values: ['salary'] },
    p_model: { taxYear: sessB?.tax_year, meta: { flow: 'onboarding' } }, p_current_question_id: 'next', p_done: false });
  ok((await anonRpc('intake_replaced_state', { p_token: itokB })).body?.replaced === false && !!sessB?.session_id && svB.body === true,
    'שאלון ישן שלא הוחלף (לקוח אחר) — נפתח ושומר כרגיל', JSON.stringify([stB.status, svB]).slice(0, 200));
  // התקשרות פעילה שהתהליך שלה נפתח ללקוח — כמו לקוח אמיתי (אחרת הדף האישי סגור כולו: client_step_gate_open)
  const eng = (await one(`insert into public.engagements (user_id, client_id, status, process_published_at) values ('${OFFICE}', '${A}', 'active', now()) returning id`)).id;
  const gen = (await one(`select public.add_intake_questionnaire_step('${eng}') r`)).r;
  ok(gen?.skipped === 'covered_by_tax_file_intake', 'המחולל: קליטה פתוחה ⇒ לא נוצר שאלון ישן חדש', JSON.stringify(gen));
  ok((await one(`select count(*)::int n from public.onboarding_steps where client_id = '${A}' and step_type = 'intake_questionnaire' and status <> 'cancelled'`)).n === 0, 'אין שאלון ישן פתוח ללקוח');

  // ── 2. שאלות: מעסיק חדש (זמני) — פרטים ותלוש, ושאלת כן/לא שנכנסת לכרטיס ──
  const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra }, templateVersion: 'qa' });
  const REF = 'emp-new-client-intake';
  const asks = [
    { itemKey: 'intake.employed', subjectRole: 'client', prompt: P('עובדת כשכירה?', 'yesno') },
    { itemKey: 'intake.employerDetails', subjectRole: 'client', entityKind: 'employer', entityRef: REF, prompt: P('שם המעסיק', 'text') },
    { itemKey: 'intake.payslip', subjectRole: 'client', entityKind: 'employer', entityRef: REF, prompt: P('תלוש', 'file', { docKind: 'payslipToDate' }) },
    { itemKey: 'intake.idCard', subjectRole: 'spouse', prompt: P('ת.ז. של יאיר', 'file', { docKind: 'idCard' }) },
    { itemKey: 'intake.crypto', subjectRole: 'couple', prompt: P('קריפטו?', 'yesno') },
  ];
  const add = await office(`public.add_tax_info_asks('${i1.stepId}', ${lit(asks)}::jsonb)`);
  ok(add?.ok && add.added === 5, 'שאלות קליטה נוספו', JSON.stringify(add));
  ok((await office(`public.add_tax_info_asks('${i1.stepId}', ${lit([{ itemKey: 'salary.worked', subjectRole: 'client', prompt: P('x', 'yesno') }])}::jsonb)`))?.error === 'item_purpose_mismatch', 'פריט שנה בקליטה — נדחה');
  const pub = await office(`public.publish_tax_info('${add.infoStepId}')`);
  ok(pub?.ok && pub.published === 5, 'פרסום');
  const portal = JSON.stringify((await anonRpc('get_client_portal', { p_token: tokA })).body);
  ok(portal.includes(`taxinfo_${add.infoStepId}`) && portal.includes('השלמת פרטים לתיק המס'), 'בדף האישי: «השלמת פרטים לתיק המס»');
  const v = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: add.infoStepId })).body;
  const askId = (k) => v.asks.find(a => a.itemKey === k)?.id;
  ok((await anonRpc('portal_tax_info', { p_token: tokB, p_step_id: add.infoStepId })).body?.ok === false, 'לקוח אחר לא רואה');

  // ── 3. הלקוחה עונה, מעלה ו«אין לי עדיין» ──
  for (const [k, a] of [['intake.employed', { kind: 'yes' }], ['intake.employerDetails', { kind: 'text', text: 'אינטל, מ-2024, מהנדסת' }], ['intake.crypto', { kind: 'yes' }]])
    ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId(k), p_answer: a })).body?.ok, `תשובה: ${k}`);
  const up = await upload({ token: tokA, stepId: add.infoStepId, itemKey: askId('intake.payslip'), bytes: pdf(RUN) });
  ok(up.status === 200 && up.body.ok, 'העלאת תלוש על המעסיק החדש', JSON.stringify(up));
  const ev = await one(`select entity_ref, tax_year, review from public.tax_evidence where client_id = '${A}' and doc_kind = 'payslipToDate'`);
  ok(ev?.entity_ref === REF && ev.review === 'needs_review', 'הראיה על הישות הזמנית, ממתינה לבדיקה', JSON.stringify(ev));
  const un = (await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: askId('intake.idCard'), p_answer: { kind: 'unavailable', reason: 'אצל יאיר' } })).body;
  ok(un?.ok && un.state === 'unavailable', '«אין לי עדיין» לת.ז. של בן הזוג');
  const st = await one(`select status, ball from public.onboarding_steps where id = '${add.infoStepId}'`);
  ok(st.ball === 'me', 'הפריט האחרון «אין לי עדיין» — הכדור חזר למשרד (תיקון 12.10)', JSON.stringify(st));
  const f = await one(`select period_kind, period_to::text pt, status from public.tax_year_facts where client_id = '${A}' and item_key = 'intake.employed'`);
  ok(f.period_kind === 'as_of' && f.pt === today && f.status === 'pending', 'תשובה «נכון ליום הקליטה», ממתינה', JSON.stringify(f));

  // ── 4. המשרד: «החזר לתיקון», אישור, הוספה לכרטיס עם אותו מזהה, «עדכן בתיק» ──
  const det = await one(`select id from public.tax_year_facts where client_id = '${A}' and item_key = 'intake.employerDetails'`);
  await office(`public.decide_tax_year_facts(array['${det.id}']::uuid[], 'reject', 'הוחזר ללקוח: חסר ממתי')`);
  const back = await office(`public.add_tax_info_asks('${i1.stepId}', ${lit([{ ...asks[1], prompt: { ...asks[1].prompt, correction: 'חסר ממתי' } }])}::jsonb)`);
  ok(back?.added === 1 && back.infoStepId === add.infoStepId, '«החזר לתיקון» — אותה שאלה חזרה, עם ההערה');
  await office(`public.publish_tax_info('${add.infoStepId}')`);
  const v2 = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: add.infoStepId })).body;
  const corr = v2.asks.find(a => a.itemKey === 'intake.employerDetails' && a.state === 'published');
  ok(corr?.prompt?.correction === 'חסר ממתי', 'הלקוחה רואה מה לתקן');
  ok((await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: corr.id, p_answer: { kind: 'text', text: 'אינטל, מ-01.03.2024' } })).body?.ok, 'תיקון נשלח');
  const pend = (await rows(`select id from public.tax_year_facts where client_id = '${A}' and status = 'pending'`)).map(r => `'${r.id}'`).join(',');
  const dec = await office(`public.decide_tax_year_facts(array[${pend}]::uuid[], 'accept', null)`);
  ok(dec?.decided === 3, 'אישור מרוכז (עובד, פרטים מתוקנים, קריפטו)', JSON.stringify(dec));
  const evid = await one(`select id from public.tax_evidence where client_id = '${A}' and doc_kind = 'payslipToDate'`);
  ok((await office(`public.review_tax_evidence('${evid.id}', 'match', 'match', 'accepted', null)`))?.ok, 'התלוש אושר');
  // «הוסף לתיק»: הצעה שמוחלת מיד, המעסיק עם המזהה הזמני — כמו newEntityProposal(…, fixedId)
  const cur = (await one(`select employers from public.clients where id = '${A}'`)).employers ?? [];
  const applyEmp = await office(`public.apply_tax_facts('${A}', 'questionnaire', 'tax_year_fact:qa', ${lit([{ field_key: 'employers', label: 'מעסיק חדש מהשאלון', old_value: { patch: { employers: cur } }, new_value: { patch: { employers: [...cur, { id: REF, name: 'אינטל', startDate: '2024-03-01' }] } } }])}::jsonb)`);
  ok(applyEmp?.ok && applyEmp.applied === 1, '«הוסף לתיק» — המעסיק נכנס לכרטיס', JSON.stringify(applyEmp));
  const emp = (await one(`select employers from public.clients where id = '${A}'`)).employers;
  ok(Array.isArray(emp) && emp.some(e => e.id === REF), 'בכרטיס — עם אותו מזהה, והתלוש שהועלה כבר משויך אליו', JSON.stringify(emp));
  const hist = await one(`select status, source, source_ref from public.tax_fact_changes where client_id = '${A}' and field_key = 'employers' order by created_at desc limit 1`);
  ok(hist?.status === 'accepted' && hist.source === 'questionnaire', 'ההיסטוריה נשמרה (tax_fact_changes, מקור: שאלון)', JSON.stringify(hist));
  const curC = (await one(`select has_crypto from public.clients where id = '${A}'`)).has_crypto;
  const applyFlag = await office(`public.apply_tax_facts('${A}', 'questionnaire', 'tax_year_fact:qa2', ${lit([{ field_key: 'hasCrypto', label: 'מטבעות דיגיטליים — מהקליטה', old_value: { patch: { hasCrypto: curC ?? null } }, new_value: { patch: { hasCrypto: true } } }])}::jsonb)`);
  ok(applyFlag?.ok && (await one(`select has_crypto from public.clients where id = '${A}'`)).has_crypto === true, '«עדכן בתיק» — שדה כן/לא נכנס לכרטיס', JSON.stringify(applyFlag));
  // הכרטיס השתנה בינתיים ⇒ לא נדרס: נשאר הצעה ממתינה
  const stale = await office(`public.apply_tax_facts('${A}', 'questionnaire', 'tax_year_fact:qa3', ${lit([{ field_key: 'hasCrypto', label: 'x', old_value: { patch: { hasCrypto: false } }, new_value: { patch: { hasCrypto: false } } }])}::jsonb)`);
  ok(stale?.ok && stale.pending === 1 && (await one(`select has_crypto from public.clients where id = '${A}'`)).has_crypto === true, 'הכרטיס השתנה מאז — ההצעה ממתינה, לא נדרסת', JSON.stringify(stale));

  // ── 5. הדוח השנתי של אותו לקוח לא נפגע, ולקוח אחר נקי ──
  const an = await office(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
  const anAdd = await office(`public.add_tax_info_asks('${an.stepId}', ${lit([{ itemKey: 'salary.form106', subjectRole: 'client', entityKind: 'employer', entityRef: REF, prompt: P('106', 'file', { docKind: 'form106' }) }])}::jsonb)`);
  ok(anAdd?.ok && anAdd.added === 1, 'דוח שנתי: 106 מהמעסיק שנוסף בקליטה (אותו מזהה)');
  ok((await one(`select count(*)::int n from public.onboarding_steps where client_id = '${B}' and step_type <> 'intake_questionnaire'`)).n === 0, 'ללקוח האחר אין בקשות (מלבד השאלון הישן שנוצר לו בבדיקה)');
  ok((await one(`select count(*)::int n from public.email_messages`)).n === preEmails, 'לא נשלח שום מייל');
} catch (e) {
  ok(false, 'הבדיקה נעצרה', e.stack ?? e);
} finally {
  await cleanup().catch(e => ok(false, 'ניקוי נכשל', e.message));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
