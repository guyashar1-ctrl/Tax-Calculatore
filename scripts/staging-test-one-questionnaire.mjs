#!/usr/bin/env node
/**
 * staging-test-one-questionnaire.mjs — 263 «לקוח אחד = שאלון אחד פתוח» על staging, על לקוחות בדיקה בלבד.
 *
 * ‼ פעולות המשרד ב-SQL בזהות משתמש הבדיקה (role authenticated + request.jwt.claims), כמו staging-test-236-intake;
 *   תשובות הלקוח ב-HTTP עם המפתח הציבורי וטוקן הדף האישי. אין מיילים.
 * ‼ מה נבדק:
 *   (i)   קליטה פתוחה בדף ⇒ פרסום שאלון של דוח שנתי מסורב (questionnaire_open), ושום דבר חדש לא נחשף;
 *         ולהפך — דוח פתוח ⇒ פתיחת קליטה עם שאלות מתגלגלת אחורה כולה (אין קליטה ריקה); שאלון ישן פתוח ⇒ חוסם.
 *   (ii)  הוספת שאלות לשאלון שכבר פתוח — ממשיכה לעבוד.
 *   (iii) «פרסם בדף» (publish_case_changes) עם טיוטת שאלון שמסורבת — מצליח לכל השאר ומדווח questionnaireOpen.
 *   (iv)  אחרי שהלקוח ענה על הכול (או שהשאלון נסגר) — השאלון השני מתפרסם.
 *   + open_questionnaire_of: בעלות (משרד אחר / אנונימי — אסור), «חוץ מ־» הבקשה עצמה, הפונקציה הפנימית חסומה.
 * ‼ בסוף: ניקוי מלא וסריקת שאריות (גם אם בדיקה נכשלה).
 *
 *   שימוש (מתיקייה שיש בה .env.local עם SUPABASE_ACCESS_TOKEN, ו-.env.staging): node scripts/staging-test-one-questionnaire.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, PROD_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const envStaging = Object.fromEntries(readFileSync(resolve(ROOT, '.env.staging'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const URL = envStaging.VITE_SUPABASE_URL, ANON = envStaging.VITE_SUPABASE_ANON_KEY;
if (!URL?.includes(STAGING_REF) || URL.includes(PROD_REF)) { console.error('✋ .env.staging אינו staging'); process.exit(1); }

const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';   // staging@pivo.test
const OTHER = 'e20269af-09f1-4cdf-bef9-63f12ee17554';    // משרד אחר
const RUN = `QA1Q${Date.now().toString(36).toUpperCase()}`;

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 400)}` : ''}`); };
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

const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra }, templateVersion: 'qa' });
const INTAKE_ASKS = [
  { itemKey: 'intake.employed', subjectRole: 'client', prompt: P('עובדת כשכירה?', 'yesno') },
  { itemKey: 'intake.crypto', subjectRole: 'client', prompt: P('קריפטו?', 'yesno') },
];
const ANNUAL_ASKS = [{ itemKey: 'salary.worked', subjectRole: 'client', prompt: P('עבדת ב-2025?', 'yesno') }];
const MORE_INTAKE = [{ itemKey: 'intake.idCard', subjectRole: 'client', prompt: P('ת.ז.', 'file', { docKind: 'idCard' }) }];

const clients = [];
async function newClient(last) {
  const id = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, city)
    values (replace(gen_random_uuid()::text,'-',''), '${OFFICE}', 'נועה', '${last}', 'delivered@resend.dev', 'active', 'single', 'licensed', 'חיפה') returning id`)).id;
  clients.push(id);
  return id;
}
const asksOf = (stepId) => rows(`select item_key, state from public.tax_info_asks where step_id = '${stepId}' order by item_key`);
const stepRow = (id) => one(`select id, status, published_at, ball from public.onboarding_steps where id = '${id}'`);

async function cleanup() {
  if (!clients.length) return;
  const ids = clients.map(c => `'${c}'`).join(',');
  await writeStaging(`
    delete from public.tax_evidence where client_id in (${ids});
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
    delete from public.engagements where client_id in (${ids});
    delete from public.clients where id in (${ids});`);
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
  const has = await one(`select to_regprocedure('public.open_questionnaire_of(text,text)') is not null as x,
    (select prosrc like '%263 · שאלון אחד פתוח%' from pg_proc where proname = 'publish_tax_info') as g`);
  if (!has.x || !has.g) { console.error('✋ 263 לא הוחלה על staging'); process.exit(1); }
  const preEmails = (await one(`select count(*)::int n from public.email_messages`)).n;

  // ── A: קליטה פתוחה בדף, ואז דוח שנתי ──
  console.log('— (i) קליטה פתוחה ⇒ שאלון הדוח מסורב —');
  const A = await newClient(`${RUN}-A`);
  const tokA = await office(`public.mint_portal_token('${A}')`);
  const in1 = await office(`public.ensure_tax_file_intake('${A}', ${lit(INTAKE_ASKS)}::jsonb)`);
  ok(in1?.ok && in1.created && in1.published === 2, 'קליטה נפתחה ופורסמה עם 2 שאלות', JSON.stringify(in1));
  const oq0 = await office(`public.open_questionnaire_of('${A}')`);
  ok(oq0?.stepId === in1.stepId && oq0.infoStepId === in1.infoStepId && oq0.stepType === 'tax_file_intake' && oq0.title === 'קליטה והשלמת תיק המס',
    'open_questionnaire_of: הקליטה, עם הכותרת שלה', JSON.stringify(oq0));
  ok((await office(`public.open_questionnaire_of('${A}', '${in1.stepId}')`)) === null, '«חוץ מ־» הבקשה עצמה ⇒ אין שאלון אחר');
  ok((await office(`public.open_questionnaire_of('${A}', '${in1.infoStepId}')`)) === null, '«חוץ מ־» השאלון עצמו ⇒ אין שאלון אחר');
  ok(!!(await other(`public.open_questionnaire_of('${A}')`))?.thrown, 'משרד אחר — אסור');
  ok((await anonRpc('open_questionnaire_of', { p_client_id: A })).status >= 400, 'אנונימי — אסור');
  ok((await anonRpc('_open_questionnaire_of', { p_client_id: A })).status >= 400, 'הפונקציה הפנימית — חסומה לאנונימי');
  ok(!!(await office(`public._open_questionnaire_of('${A}')`))?.thrown, 'הפונקציה הפנימית — חסומה גם למשרד');

  const an = await office(`public.ensure_tax_year_request('${A}', 'annual', 2025, null)`);
  const anAdd = await office(`public.add_tax_info_asks('${an.stepId}', ${lit(ANNUAL_ASKS)}::jsonb)`);
  ok(an?.ok && anAdd?.ok && anAdd.added === 1, 'דוח שנתי 2025: בקשה + טיוטת שאלה', JSON.stringify([an, anAdd]));
  const annInfo = anAdd.infoStepId;
  const portalBefore = JSON.stringify((await anonRpc('get_client_portal', { p_token: tokA })).body);
  const ref = await office(`public.publish_tax_info('${annInfo}')`);
  ok(ref?.ok === false && ref.error === 'questionnaire_open' && ref.openStepId === in1.stepId && ref.openTitle === 'קליטה והשלמת תיק המס' && ref.openInfoStepId === in1.infoStepId,
    'פרסום שאלון הדוח — מסורב, עם הבקשה והכותרת של השאלון הפתוח', JSON.stringify(ref));
  const annStep = await stepRow(annInfo);
  ok(annStep.published_at === null && annStep.status === 'pending', 'שאלון הדוח לא סומן כמפורסם (published_at ריק, pending)', JSON.stringify(annStep));
  ok((await asksOf(annInfo)).every(a => a.state === 'draft'), 'שאלות הדוח נשארו טיוטה');
  const portalAfter = JSON.stringify((await anonRpc('get_client_portal', { p_token: tokA })).body);
  ok(!portalAfter.includes(`taxinfo_${annInfo}`) && portalAfter.includes(`taxinfo_${in1.infoStepId}`), 'בדף האישי: רק הקליטה, בלי שאלון הדוח');
  ok(portalBefore.length > 0, 'הדף האישי נטען');
  // שאלה נוספת לשאלון הדוח שעוד לא יצא — עדיין מסורב (הוא עדיין «שני»)
  await office(`public.add_tax_info_asks('${an.stepId}', ${lit([{ itemKey: 'salary.form106', subjectRole: 'client', prompt: P('106', 'file', { docKind: 'form106' }) }])}::jsonb)`);
  ok((await office(`public.publish_tax_info('${annInfo}')`))?.error === 'questionnaire_open', 'הוספת טיוטה לשאלון השני לא עוקפת את הסירוב');

  // ── (ii) הוספה לשאלון שכבר פתוח ──
  console.log('— (ii) הוספה לאותו שאלון פתוח —');
  const in2 = await office(`public.ensure_tax_file_intake('${A}', ${lit(MORE_INTAKE)}::jsonb)`);
  ok(in2?.ok && !in2.created && in2.stepId === in1.stepId && in2.asked === 1 && in2.published === 1, 'קליטה קיימת: שאלה נוספת נוספה ופורסמה', JSON.stringify(in2));
  const add3 = await office(`public.add_tax_info_asks('${in1.stepId}', ${lit([{ itemKey: 'intake.selfEmployed', subjectRole: 'client', prompt: P('עצמאית?', 'yesno') }])}::jsonb)`);
  const pub3 = add3?.ok ? await office(`public.publish_tax_info('${in1.infoStepId}')`) : add3;
  ok(pub3?.ok && pub3.published === 1, 'add_tax_info_asks + publish_tax_info לשאלון הפתוח — עובד', JSON.stringify([add3, pub3]));

  // ── (iii) «פרסם בדף» עם טיוטה מסורבת ──
  console.log('— (iii) publish_case_changes —');
  const other1 = (await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${A}', 'custom_request', 'tools', 'person', 'pending', 'client', ${lit({ title: `בקשת בדיקה ${RUN}` })}::jsonb, null) returning id`)).id;
  const pcc = await office(`public.publish_case_changes('${A}')`);
  ok(pcc?.ok === true, 'publish_case_changes מצליח', JSON.stringify(pcc));
  ok(Array.isArray(pcc?.questionnaireOpen) && pcc.questionnaireOpen.length === 1 && pcc.questionnaireOpen[0].infoStepId === annInfo
    && pcc.questionnaireOpen[0].openStepId === in1.stepId && pcc.questionnaireOpen[0].openTitle === 'קליטה והשלמת תיק המס',
    'התשובה מדווחת questionnaireOpen על שאלון הדוח', JSON.stringify(pcc?.questionnaireOpen));
  ok((await stepRow(other1)).published_at !== null && pcc.draftsExposed >= 1, 'שאר הדף פורסם (הבקשה האחרת נחשפה)', JSON.stringify(pcc));
  ok((await stepRow(annInfo)).published_at === null && (await asksOf(annInfo)).every(a => a.state === 'draft'), 'שאלון הדוח נשאר טיוטה');
  const pccAgain = await office(`public.publish_case_changes('${A}')`);
  ok(pccAgain?.ok && pccAgain.questionnaireOpen?.length === 1, 'פרסום חוזר — אותו דיווח, בלי שגיאה', JSON.stringify(pccAgain));

  // ── (iv) הלקוחה עונה על הכול ⇒ השאלון השני יוצא ──
  console.log('— (iv) אחרי שהשאלון הפתוח נענה —');
  const v = (await anonRpc('portal_tax_info', { p_token: tokA, p_step_id: in1.infoStepId })).body;
  const open = (v?.asks ?? []).filter(a => a.state === 'published');
  ok(open.length === 4, 'לקליטה 4 שאלות פתוחות לענות', JSON.stringify(v).slice(0, 300));
  for (const a of open) {
    const answer = a.prompt?.input?.kind === 'file' ? { kind: 'unavailable', reason: 'אצל המעסיק' } : { kind: 'no' };
    const r = (await anonRpc('portal_submit_tax_info', { p_token: tokA, p_ask_id: a.id, p_answer: answer })).body;
    ok(r?.ok, `תשובה: ${a.itemKey}`, JSON.stringify(r));
  }
  const left = (await asksOf(in1.infoStepId)).filter(a => a.state === 'published');
  ok(left.length === 0, 'לקליטה אין יותר שאלה שמחכה ללקוחה', JSON.stringify(left));
  ok((await office(`public.open_questionnaire_of('${A}')`)) === null, 'open_questionnaire_of ⇒ null');
  const pubAnn = await office(`public.publish_tax_info('${annInfo}')`);
  ok(pubAnn?.ok && pubAnn.published === 2, 'שאלון הדוח מתפרסם עכשיו (2 שאלות)', JSON.stringify(pubAnn));
  const oqAfter = await office(`public.open_questionnaire_of('${A}')`);
  ok(oqAfter?.stepId === an.stepId && oqAfter.title === 'דוח שנתי 2025' && Number(oqAfter.taxYear) === 2025, 'עכשיו השאלון הפתוח הוא הדוח', JSON.stringify(oqAfter));
  // ועכשיו הקליטה היא ה«שנייה»: שאלה חדשה לקליטה (אין בה שאלה מפורסמת) — מסורבת
  const in3 = await office(`public.ensure_tax_file_intake('${A}', ${lit([{ itemKey: 'intake.rents', subjectRole: 'client', prompt: P('משכירה נכס?', 'yesno') }])}::jsonb)`);
  ok(!!in3?.thrown && /questionnaire_open/.test(in3.thrown), 'קליטה שנענתה כולה ושאלה חדשה בה — מסורבת (הדוח פתוח)', JSON.stringify(in3));
  ok((await rows(`select 1 from public.tax_info_asks where step_id = '${in1.infoStepId}' and item_key = 'intake.rents'`)).length === 0, 'הסירוב גלגל אחורה גם את הוספת השאלה');

  // ── B: דוח פתוח ⇒ פתיחת קליטה עם שאלות מתגלגלת כולה ──
  console.log('— (i ב) דוח פתוח ⇒ אין קליטה ריקה —');
  const B = await newClient(`${RUN}-B`);
  const bAn = await office(`public.ensure_tax_year_request('${B}', 'annual', 2025, null)`);
  const bAdd = await office(`public.add_tax_info_asks('${bAn.stepId}', ${lit(ANNUAL_ASKS)}::jsonb)`);
  ok((await office(`public.publish_tax_info('${bAdd.infoStepId}')`))?.ok, 'B: דוח שנתי פורסם');
  const bIn = await office(`public.ensure_tax_file_intake('${B}', ${lit(INTAKE_ASKS)}::jsonb)`);
  ok(!!bIn?.thrown && /questionnaire_open/.test(bIn.thrown), 'B: ensure_tax_file_intake עם שאלות — נכשל עם questionnaire_open', JSON.stringify(bIn));
  ok((await one(`select count(*)::int n from public.onboarding_steps where client_id = '${B}' and step_type in ('tax_file_intake','info_collection')
    and (step_type = 'tax_file_intake' or payload->>'parentStepId' <> '${bAn.stepId}')`)).n === 0, 'B: לא נשארה קליטה ולא שאלון ריק (הכול התגלגל אחורה)');
  const bOq = await office(`public.open_questionnaire_of('${B}')`);
  ok(bOq?.stepId === bAn.stepId && bOq.stepType === 'annual_return', 'B: הבדיקה המקדימה במסך רואה את הדוח', JSON.stringify(bOq));

  // ── C: שאלון הקליטה הישן שפורסם ⇒ חוסם; אחרי שנסגר — לא ──
  console.log('— (i ג) שאלון ישן —');
  const C = await newClient(`${RUN}-C`);
  const legacy = (await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values ('${OFFICE}', '${C}', 'intake_questionnaire', 'internal', 'person', 'waiting_client', 'client', '{}'::jsonb, now()) returning id`)).id;
  const cOq = await office(`public.open_questionnaire_of('${C}')`);
  ok(cOq?.stepId === legacy && cOq.stepType === 'intake_questionnaire' && cOq.title === 'עדכון סטטוס מס', 'C: השאלון הישן הוא השאלון הפתוח', JSON.stringify(cOq));
  const cAn = await office(`public.ensure_tax_year_request('${C}', 'annual', 2025, null)`);
  const cAdd = await office(`public.add_tax_info_asks('${cAn.stepId}', ${lit(ANNUAL_ASKS)}::jsonb)`);
  const cRef = await office(`public.publish_tax_info('${cAdd.infoStepId}')`);
  ok(cRef?.error === 'questionnaire_open' && cRef.openStepId === legacy, 'C: שאלון הדוח מסורב בגלל השאלון הישן', JSON.stringify(cRef));
  await writeStaging(`update public.onboarding_steps set status = 'completed' where id = '${legacy}'`);
  ok((await office(`public.publish_tax_info('${cAdd.infoStepId}')`))?.ok, 'C: השאלון הישן הושלם ⇒ הדוח מתפרסם');

  ok((await one(`select count(*)::int n from public.email_messages`)).n === preEmails, 'לא נשלח שום מייל');
} catch (e) {
  ok(false, 'הבדיקה נעצרה', e.stack ?? e);
} finally {
  await cleanup().catch(e => ok(false, 'ניקוי נכשל', e.message));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}
