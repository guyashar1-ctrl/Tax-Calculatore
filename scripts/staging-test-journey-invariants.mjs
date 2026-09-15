#!/usr/bin/env node
/**
 * staging-test-journey-invariants.mjs — שער הרגרסיה של מיגרציה 167 (אשכול C
 * בספר הפערים): תלויות, ביטול, נתיב הסטטוס האחד, תבניות, סדר תצוגה, ומכתב
 * השחרור.
 *
 *  JF6   ביטול הורה פותח את התלויים בו, מנקה את סיבת הנעילה ונרשם ביומן.
 *  JF11  האינדקס (התקשרות, סוג) מפנה מקום לשורה מבוטלת — המחולל רץ שוב.
 *  JF7   טבלת הקשתות היא המקור; העמודה מראה — אפס פערים.
 *  JF10  השלמת הייצוג (טריגר) פותחת תלויים ונרשמת ביומן.
 *  JF15  «עדכן תבנית» על מובנית מצליח, ופעם שנייה מעדכן את העותק.
 *  JF16  תבנית של המשרד מוחלת לפי היקף המשרד, של משרד אחר — לא.
 *  JF17  שמירת מסע כתבנית קובעת office_id.
 *  JF13  תלות קדימה בתבנית נשמרת והשלב נולד נעול.
 *  JF20  פרסום מעתיק pending_sort_order ⇒ sort_order.
 *  JF27  התנגדות מפורשת חוסמת סגירה גם אחרי החלון; הדף קורא due_date.
 *  JF24  המחולל אינו מוליד excel_ledger.
 *  JF32  «לא רלוונטי» מדלג על החיבור לרשות המסים, וחזרה מחזירה אותו.
 *
 * ‼ לקוחות דמה בלבד (שם משפחה JRNY, הצעות jrny-*), נמחקים בסוף.
 * הרצה:  node scripts/staging-test-journey-invariants.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: sess, error: authErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } } });
/** לקוח שמעולם לא התחבר — האישור הציבורי רץ בדיוק כמו בדפדפן של הלקוח. */
const pure = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
/** ‼ ה-Management API מגביל קצב (429) כשכמה סוכנים בודקים במקביל — מנסים שוב בהמתנה. */
async function sqlq(query) {
  for (let attempt = 0; ; attempt++) {
    try { return await writeStaging(query); }
    catch (e) {
      if (e.http !== 429 || attempt >= 10) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
}
const one = async (q) => (await sqlq(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const step = async (cid, type) => await one(
  `select id, status, ball, due_date, depends_on_step_id, payload, engagement_id, sort_order, pending_sort_order
     from public.onboarding_steps
    where client_id = ${q(cid)} and step_type = ${q(type)} and status <> 'cancelled'
    order by created_at desc limit 1`);
const stepById = async (id) => await one(
  `select id, status, ball, due_date, depends_on_step_id, payload, sort_order, pending_sort_order
     from public.onboarding_steps where id = ${q(id)}`);
const advance = (id, action, payload = {}) =>
  user.rpc('advance_onboarding_step', { p_step_id: id, p_action: action, p_payload: payload });
const OFFICE = (await one(`select office_id from public.profiles where id = '${USER_ID}'`)).office_id;

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  await sqlq(`
    delete from public.onboarding_events where engagement_id in
      (select id from public.engagements where quotation_id like 'jrny-%');
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in
        (select id from public.clients where last_name = 'JRNY'));
    delete from public.onboarding_steps where client_id in
      (select id from public.clients where last_name = 'JRNY');
    delete from public.journey_stages where client_id in
      (select id from public.clients where last_name = 'JRNY');
    delete from public.engagements where quotation_id like 'jrny-%';
    delete from public.additional_charges where source_quotation_id like 'jrny-%';
    delete from public.tax_fact_changes where client_id in
      (select id from public.clients where last_name = 'JRNY');
    delete from public.representation_requests where linked_client_id in
      (select id from public.clients where last_name = 'JRNY');
    delete from public.email_messages where client_id in
      (select id from public.clients where last_name = 'JRNY');
    delete from public.clients where last_name = 'JRNY';
    delete from public.quotations where id like 'jrny-%';
    delete from public.leads where id like 'jrny-lead-%';
    delete from public.journey_templates where name like 'JRNY %';
    delete from public.journey_templates where office_id = '${OFFICE}' and seed_key = 'client_documents';`);
}
await cleanup();

/**
 * הצעה עם הנהלת חשבונות (⇒ פייפרלס + הרשאת תשלום), ייצוג, ורו"ח קודם —
 * המסלול המלא שהמחולל יודע לבנות. אישור דרך לקוח anon אמיתי.
 */
async function makeApprovedClient(key, { licensed = false, hasPrev = true } = {}) {
  const token = randomBytes(16).toString('hex');
  const items = [{ id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly',
    billingType: 'monthly', catalogPrice: 1200, clientPrice: 1200, quantity: 1, vatFlag: true }];
  await sqlq(`
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values (${q('jrny-lead-' + key)}, '${USER_ID}', 'מסע JRNY', 'delivered@resend.dev', '050-0000${key}', 'new', ${hasPrev});
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, sent_at)
    values (${q('jrny-' + key)}, '${USER_ID}', ${q('jrny-lead-' + key)}, ${q('JRNY-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb,
            '{"enabled":true,"areas":{"incomeTax":true},"spouse":null,"prefill":{"firstName":"מסע","lastName":"JRNY","email":"delivered@resend.dev","phone":"050-0000001"}}'::jsonb,
            18, now());`);
  const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'jrny-' + key });
  if (ens?.ok === false) throw new Error(`ensure_client: ${JSON.stringify(ens)}`);
  const cid = (await one(`select client_id from public.quotations where id = ${q('jrny-' + key)}`)).client_id;
  await sqlq(`update public.clients set last_name = 'JRNY'
                        ${licensed ? ", dealer_type = 'licensed'" : ''} where id = ${q(cid)};`);
  const { error } = await pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: 'JRNY' });
  if (error) throw new Error(`approve: ${error.message}`);
  const eng = (await one(`select id from public.engagements where client_id = ${q(cid)} order by created_at desc limit 1`)).id;
  return { cid, eng, quoteId: 'jrny-' + key };
}

const mismatch = async (cid) => (await one(`
  select count(*)::int as n from public.onboarding_steps s
   where s.client_id = ${q(cid)}
     and (
       (s.depends_on_step_id is not null and not exists (
          select 1 from public.onboarding_step_dependencies d
           where d.step_id = s.id and d.depends_on_step_id = s.depends_on_step_id))
       or (s.depends_on_step_id is null and exists (
          select 1 from public.onboarding_step_dependencies d where d.step_id = s.id))
       or (s.depends_on_step_id is distinct from (
          select d.depends_on_step_id from public.onboarding_step_dependencies d
            join public.onboarding_steps p on p.id = d.depends_on_step_id
           where d.step_id = s.id
           order by coalesce(p.sort_order, 0), p.created_at, p.id limit 1)))`)).n;

try {
  // ═══ A · המסלול המלא: ביטול, אינדקס, מראה, ייצוג ═════════════════════════
  console.log('— A · לקוח מלא (ייצוג + רו"ח קודם + פייפרלס) —');
  const A = await makeApprovedClient('a1', { licensed: true });

  // JF24 · המחולל
  const mats = await step(A.cid, 'materials_received');
  const keys = (mats?.payload?.checklist ?? []).map((x) => x.key);
  ok('JF24 · המחולל מוליד את הקטלוג של היום (בלי excel_ledger)',
    keys.length === 9 && !keys.includes('excel_ledger')
    && keys.includes('uniform_file_prev') && keys.includes('pnl_prev'), keys.join(','));

  // JF7 · מראה העמודה אחרי המחולל (כולל opening_call עם שלושה הורים בטבלה בלבד)
  const call = await step(A.cid, 'opening_call');
  ok('JF7 · opening_call נולד עם שלוש קשתות והעמודה משקפת את הראשונה',
    !!call && call.depends_on_step_id !== null
    && (await one(`select count(*)::int as n from public.onboarding_step_dependencies where step_id = ${q(call.id)}`)).n === 3,
    `col=${call?.depends_on_step_id}`);
  ok('JF7 · אפס פערים עמודה↔טבלה אחרי המחולל', (await mismatch(A.cid)) === 0);

  // JF6 · ביטול הורה פותח את התלוי
  const prevDet = await step(A.cid, 'prev_accountant_details');
  const rel0 = await step(A.cid, 'release_letter');
  ok('מכתב השחרור נעול על פרטי הרו"ח הקודם', rel0?.status === 'locked' && rel0?.depends_on_step_id === prevDet?.id,
    `${rel0?.status} dep=${rel0?.depends_on_step_id}`);
  const evBefore = (await one(`select count(*)::int as n from public.onboarding_events where step_id = ${q(rel0.id)}`)).n;
  const cancel = await advance(prevDet.id, 'cancel', { note: 'JRNY ביטול' });
  ok('JF6 · הביטול מתקבל', cancel.data?.ok === true, JSON.stringify(cancel.data ?? cancel.error?.message));
  const rel1 = await stepById(rel0.id);
  ok('JF6 · התלוי נפתח (pending)', rel1?.status === 'pending', String(rel1?.status));
  ok('JF6 · אין עוד סיבת נעילה בדף האישי',
    (await one(`select public.portal_lock_reason(${q(rel0.id)}) as r`)).r === null);
  ok('JF6 · נרשם אירוע פתיחה על התלוי',
    (await one(`select count(*)::int as n from public.onboarding_events
                 where step_id = ${q(rel0.id)} and type = 'status_changed'
                   and meta->>'from' = 'locked' and meta->>'to' = 'pending'`)).n === 1
    && (await one(`select count(*)::int as n from public.onboarding_events where step_id = ${q(rel0.id)}`)).n > evBefore);
  ok('JF6 · onboarding_dependency_met רואה הורה מבוטל כמסופק',
    (await one(`select public.onboarding_dependency_met(${q(rel0.id)}) as m`)).m === true);

  // JF11 · המחולל רץ שוב אחרי ביטול של שלב שהוא מוליד
  const docs0 = await step(A.cid, 'client_documents');
  await advance(docs0.id, 'cancel', {});
  const idx = (await one(`select indexdef from pg_indexes where indexname = 'onboarding_steps_engagement_type_idx'`)).indexdef;
  ok('JF11 · האינדקס מסנן שורות מבוטלות', /status <> 'cancelled'/.test(idx), idx);
  let regen;
  try {
    regen = await one(`select public.generate_onboarding_steps(${q(A.eng)}, false) as r`);
    ok('JF11 · הרצה חוזרת של המחולל אחרי ביטול אינה נופלת', regen?.r?.ok === true, JSON.stringify(regen?.r));
  } catch (e) {
    ok('JF11 · הרצה חוזרת של המחולל אחרי ביטול אינה נופלת', false, e.message);
  }
  const docsRows = await sqlq(`select status from public.onboarding_steps
    where client_id = ${q(A.cid)} and step_type = 'client_documents' order by created_at`);
  // ‼ 173 (JF12): 'cancelled' = המשרד הסיר, והמחולל אינו מחזיר את מה שהוסר —
  // הכלל של 117 לכל סוג. הרצה חוזרת אינה נופלת (האינדקס מסנן) ואינה מולידה.
  ok('JF11 · הרצה חוזרת אינה מחזירה את מה שהמשרד הסיר', docsRows.length === 1 && docsRows[0].status === 'cancelled',
    JSON.stringify(docsRows));
  // חזרה = הוספה ידנית מ«+ בקשה» (173) — הסעיפים הבאים צריכים שורה חיה.
  const readd = (await user.rpc('create_onboarding_request', {
    p_client_id: A.cid, p_step_type: 'client_documents', p_payload: { checklist: [{ key: 'id', label: 'ת"ז', done: false }] },
    p_due_date: null, p_depends_on: null, p_published: true, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  ok('JF12 · הוספה ידנית אחרי הסרה מחזירה את הבקשה', readd?.ok === true, JSON.stringify(readd));

  // JF7 · set_onboarding_step_dependencies — שני הורים, העמודה = הראשון בסדר
  const inv = await step(A.cid, 'paperless_invite');
  const conn = await step(A.cid, 'paperless_connection');
  const custom = (await user.rpc('create_onboarding_request', {
    p_client_id: A.cid, p_step_type: 'custom_request',
    p_payload: { title: 'JRNY תלויה', clientTitle: 'JRNY תלויה', requirements: [{ key: 'r1', kind: 'confirm', label: 'אישור', done: false }] },
    p_due_date: null, p_depends_on: null, p_published: false, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  await sqlq(`update public.onboarding_steps set sort_order = 900 where id = ${q(inv.id)};
                      update public.onboarding_steps set sort_order = 100 where id = ${q(conn.id)};`);
  const setDeps = (await user.rpc('set_onboarding_step_dependencies', { p_step_id: custom.stepId, p_depends_on: [inv.id, conn.id] })).data;
  const cust1 = await stepById(custom.stepId);
  ok('JF7 · העמודה משקפת את ההורה הראשון לפי סדר (החיבור, sort 100)',
    setDeps?.ok === true && cust1.depends_on_step_id === conn.id, `dep=${cust1.depends_on_step_id} conn=${conn.id}`);
  ok('JF7 · והשלב ננעל כי ההורים פתוחים', cust1.status === 'locked', cust1.status);
  await sqlq(`delete from public.onboarding_step_dependencies where step_id = ${q(custom.stepId)} and depends_on_step_id = ${q(conn.id)};`);
  const cust2 = await stepById(custom.stepId);
  ok('JF7 · מחיקת קשת מזיזה את המראה להורה הבא', cust2.depends_on_step_id === inv.id, `dep=${cust2.depends_on_step_id}`);
  await sqlq(`update public.onboarding_steps set depends_on_step_id = null where id = ${q(custom.stepId)};`);
  ok('JF7 · איפוס העמודה (ממשק ישן) מוחק את הקשת שלה',
    (await one(`select count(*)::int as n from public.onboarding_step_dependencies where step_id = ${q(custom.stepId)}`)).n === 0);
  ok('JF7 · אפס פערים עמודה↔טבלה בסוף התרגיל', (await mismatch(A.cid)) === 0);

  // JF10 · השלמת הייצוג בטריגר פותחת תלויים ונרשמת ביומן
  const rep = await step(A.cid, 'representation');
  ok('שלב הייצוג קיים', !!rep?.id);
  const repDep = (await user.rpc('create_onboarding_request', {
    p_client_id: A.cid, p_step_type: 'custom_request',
    p_payload: { title: 'JRNY אחרי ייצוג', clientTitle: 'JRNY אחרי ייצוג', requirements: [{ key: 'r1', kind: 'confirm', label: 'אישור', done: false }] },
    p_due_date: null, p_depends_on: rep.id, p_published: false, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  ok('בקשה תלויה בייצוג נולדה נעולה', repDep?.ok === true && repDep?.status === 'locked', JSON.stringify(repDep));
  const rqId = (await one(`select representation_request_id as id from public.quotations where id = ${q(A.quoteId)}`)).id;
  await sqlq(`update public.representation_requests set status = 'awaiting_authorities' where id = ${q(rqId)};`);
  ok('JF10 · שלב הייצוג עוקב אחרי הבקשה (הוגש לרשויות ⇒ בטיפול, הכדור אצל הרשות)',
    (await stepById(rep.id)).status === 'in_progress' && (await stepById(rep.id)).ball === 'authority');
  await sqlq(`update public.representation_requests set status = 'active' where id = ${q(rqId)};`);
  const rep1 = await stepById(rep.id);
  ok('JF10 · הייצוג הושלם מהטריגר', rep1.status === 'completed', rep1.status);
  ok('JF10 · התלוי בייצוג נפתח', (await stepById(repDep.stepId)).status === 'pending');
  ok('JF10 · השלמת הייצוג נרשמה ביומן',
    (await one(`select count(*)::int as n from public.onboarding_events
                 where step_id = ${q(rep.id)} and type = 'status_changed' and meta->>'to' = 'completed'`)).n === 1);
  const approval = await step(A.cid, 'rep_client_approval');
  ok('JF10 · הזירוז נסגר יחד עם הייצוג ונרשם', approval?.status === 'completed'
    && (await one(`select count(*)::int as n from public.onboarding_events where step_id = ${q(approval.id)} and meta->>'to' = 'completed'`)).n === 1,
    String(approval?.status));

  // JF32 · פייפרלס «לא רלוונטי» ⇒ החיבור לרשות המסים מדולג; חזרה מחזירה אותו
  const pta0 = await step(A.cid, 'paperless_tax_authority');
  ok('החיבור לרשות המסים נולד (עוסק מורשה)', pta0?.status === 'locked', String(pta0?.status));
  const na = (await user.rpc('set_paperless_path', { p_client_id: A.cid, p_paperless_status: 'not_applicable', p_data_source: 'none', p_software_name: null })).data;
  ok('set_paperless_path(לא רלוונטי)', na?.ok === true, JSON.stringify(na));
  const pta1 = await stepById(pta0.id);
  ok('JF32 · החיבור לרשות המסים דולג עם סיבה', pta1.status === 'skipped' && pta1.payload?.skipReason === 'not_applicable',
    `${pta1.status}/${pta1.payload?.skipReason}`);
  ok('JF29/JF6 · הרשאת התשלום נפתחה בלי תלות', (await step(A.cid, 'retainer_authorization')).status === 'pending'
    && (await one(`select count(*)::int as n from public.onboarding_step_dependencies where step_id = ${q((await step(A.cid, 'retainer_authorization')).id)}`)).n === 0);
  const back = (await user.rpc('set_paperless_path', { p_client_id: A.cid, p_paperless_status: 'self', p_data_source: 'paperless', p_software_name: null })).data;
  const pta2 = await stepById(pta0.id);
  ok('JF32 · חזרה למסלול פייפרלס מחזירה את החיבור לרשות המסים (נעול עד החיבור)',
    back?.ok === true && pta2.status === 'locked' && !pta2.payload?.skipReason, `${pta2.status}/${pta2.payload?.skipReason}`);
  const ret2 = await step(A.cid, 'retainer_authorization');
  ok('הרשאת התשלום חזרה להיתלות בחיבור ונעולה', ret2.status === 'locked' && ret2.depends_on_step_id === conn.id,
    `${ret2.status} dep=${ret2.depends_on_step_id}`);
  ok('JF7 · אפס פערים אחרי מסלול הפייפרלס', (await mismatch(A.cid)) === 0);

  // JF6 · הסרה ממתינה בפרסום פותחת תלויים
  const parent = (await user.rpc('create_onboarding_request', {
    p_client_id: A.cid, p_step_type: 'custom_request',
    p_payload: { title: 'JRNY הורה', clientTitle: 'JRNY הורה', requirements: [{ key: 'r1', kind: 'confirm', label: 'אישור', done: false }] },
    p_due_date: null, p_depends_on: null, p_published: true, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  const child = (await user.rpc('create_onboarding_request', {
    p_client_id: A.cid, p_step_type: 'custom_request',
    p_payload: { title: 'JRNY ילד', clientTitle: 'JRNY ילד', requirements: [{ key: 'r1', kind: 'confirm', label: 'אישור', done: false }] },
    p_due_date: null, p_depends_on: parent.stepId, p_published: true, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  await sqlq(`update public.onboarding_steps set pending_cancel = true where id = ${q(parent.stepId)};`);
  // JF20 · סידור ממתין
  const openIds = (await sqlq(`select id from public.onboarding_steps where client_id = ${q(A.cid)}
     and status not in ('cancelled','completed','verified','skipped') order by sort_order, created_at`)).map((r) => r.id);
  const reversed = [...openIds].reverse();
  await user.rpc('stage_onboarding_steps_order', { p_client_id: A.cid, p_ids: reversed });
  ok('JF20 · הגרירה כותבת pending_sort_order ולא נוגעת ב-sort_order',
    (await stepById(reversed[0])).pending_sort_order === 10 && (await stepById(reversed[0])).sort_order !== 10);
  const pub = (await user.rpc('publish_case_changes', { p_client_id: A.cid })).data;
  ok('publish_case_changes', pub?.ok === true, JSON.stringify(pub));
  ok('JF20 · הפרסום מעתיק pending ⇒ sort_order ומאפס',
    (await stepById(reversed[0])).sort_order === 10 && (await stepById(reversed[0])).pending_sort_order === null
    && (await one(`select count(*)::int as n from public.onboarding_steps where client_id = ${q(A.cid)} and pending_sort_order is not null`)).n === 0);
  ok('JF6 · הסרה בפרסום ביטלה את ההורה', (await stepById(parent.stepId)).status === 'cancelled');
  ok('JF6 · והילד נפתח', (await stepById(child.stepId)).status === 'pending');
  ok('JF34 · הביטול בפרסום נרשם ביומן',
    (await one(`select count(*)::int as n from public.onboarding_events where step_id = ${q(parent.stepId)} and meta->>'to' = 'cancelled'`)).n === 1);

  // ═══ B · מכתב השחרור ═══════════════════════════════════════════════════
  console.log('\n— B · מכתב השחרור —');
  const relToken = randomBytes(12).toString('hex');
  await sqlq(`
    update public.onboarding_steps
       set status = 'waiting_client', ball = 'prev_accountant', due_date = current_date - 3,
           payload = payload || jsonb_build_object('releaseToken', ${q(relToken)}, 'releaseSentAt', now()::text,
                                                    'objectionDueDate', '2099-01-01')
     where id = ${q(rel0.id)};`);
  const portal = (await pure.rpc('get_release_portal', { p_token: relToken })).data;
  ok('JF27 · דף הרו"ח הקודם קורא את החלון מ-due_date ולא מהמראה הישנה',
    portal?.ok === true && portal.objectionDueDate === (await stepById(rel0.id)).due_date && portal.objectionWindowPassed === true,
    JSON.stringify({ d: portal?.objectionDueDate, p: portal?.objectionWindowPassed }));
  const blockers = (b) => (b?.blocking ?? []).map((x) => x.stepType);
  const rd1 = (await one(`select public.onboarding_close_readiness(${q(A.eng)}) as r`)).r;
  ok('JF27 · שתיקה אחרי החלון — המכתב אינו חוסם', !blockers(rd1).includes('release_letter'), JSON.stringify(blockers(rd1)));
  const resp = (await pure.rpc('release_portal_respond', { p_token: relToken, p_note: 'JRNY מתנגד להעברה', p_name: 'רו"ח קודם' })).data;
  ok('הרו"ח הקודם השיב', resp?.ok === true, JSON.stringify(resp));
  const rd2 = (await one(`select public.onboarding_close_readiness(${q(A.eng)}) as r`)).r;
  ok('JF27 · התנגדות מפורשת חוסמת סגירה גם אחרי החלון', blockers(rd2).includes('release_letter'), JSON.stringify(blockers(rd2)));
  const setDue = await advance(rel0.id, 'set_due', { dueDate: '2030-06-01' });
  const rel3 = await stepById(rel0.id);
  ok('JF27 · set_due מזיז את העמודה והמראה יחד', setDue.data?.ok === true && rel3.due_date === '2030-06-01' && rel3.payload?.objectionDueDate === '2030-06-01',
    `${rel3.due_date}/${rel3.payload?.objectionDueDate}`);

  // ═══ C · תבניות ═════════════════════════════════════════════════════════
  console.log('\n— C · תבניות —');
  const seed = (await one(`select id from public.journey_templates where seed_key = 'client_documents' and office_id is null`))?.id;
  ok('תבנית מובנית «מסמכים מהלקוח» קיימת', !!seed);
  const docs1 = await step(A.cid, 'client_documents');
  const upd1 = (await user.rpc('update_request_template', { p_template_id: seed, p_step_id: docs1.id })).data;
  ok('JF15 · «עדכן תבנית» על מובנית מצליח', upd1?.ok === true && upd1?.copiedFromSeed === true, JSON.stringify(upd1));
  const upd2 = (await user.rpc('update_request_template', { p_template_id: seed, p_step_id: docs1.id })).data;
  const copies = (await one(`select count(*)::int as n from public.journey_templates where office_id = '${OFFICE}' and seed_key = 'client_documents'`)).n;
  ok('JF15 · לחיצה שנייה מעדכנת את העותק ולא מכפילה', upd2?.ok === true && upd2?.updatedCopy === true && copies === 1,
    `${JSON.stringify(upd2)} copies=${copies}`);

  const saved = (await user.rpc('save_journey_template', { p_client_id: A.cid, p_name: 'JRNY מסע', p_description: null })).data;
  ok('JF17 · שמירת מסע כתבנית', saved?.ok === true, JSON.stringify(saved));
  const savedRow = await one(`select office_id, kind from public.journey_templates where id = ${q(saved.templateId)}`);
  ok('JF17 · התבנית שנשמרה שייכת למשרד', savedRow?.office_id === OFFICE && savedRow?.kind === 'journey', JSON.stringify(savedRow));

  // JF16 · תבנית של עמית באותו משרד (user_id אחר) מוחלת; של משרד אחר — לא. JF13 · תלות קדימה.
  const B = await makeApprovedClient('b1', { hasPrev: false });
  const colleagueTpl = (await one(`
    insert into public.journey_templates (user_id, office_id, kind, name, entries)
    values (null, '${OFFICE}', 'journey', 'JRNY עמית', '[
      {"key":"first","stepType":"custom_request","owner":"client","dependsOn":["second","docs"],
       "payload":{"title":"JRNY ראשונה","clientTitle":"JRNY ראשונה","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}},
      {"key":"second","stepType":"custom_request","owner":"client",
       "payload":{"title":"JRNY שנייה","clientTitle":"JRNY שנייה","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}},
      {"key":"docs","stepType":"client_documents","owner":"client",
       "payload":{"checklist":[{"key":"id_card","label":"צילום תעודת זהות","done":false}]}}
    ]'::jsonb) returning id;`)).id;
  const applied = (await user.rpc('apply_journey_template', { p_client_id: B.cid, p_template_id: colleagueTpl })).data;
  ok('JF16 · תבנית של המשרד (לא שלי אישית) מוחלת', applied?.ok === true && applied.added === 2 && applied.skipped === 1, JSON.stringify(applied));
  const first = await one(`select id, status, depends_on_step_id from public.onboarding_steps where client_id = ${q(B.cid)} and payload->>'title' = 'JRNY ראשונה'`);
  const second = await one(`select id, status from public.onboarding_steps where client_id = ${q(B.cid)} and payload->>'title' = 'JRNY שנייה'`);
  const docsB = await step(B.cid, 'client_documents');
  const firstEdges = (await sqlq(`select depends_on_step_id as p from public.onboarding_step_dependencies where step_id = ${q(first?.id)}`)).map((r) => r.p);
  ok('JF13 · תלות קדימה נשמרה והשלב נולד נעול', first?.status === 'locked' && firstEdges.includes(second?.id),
    `${first?.status} edges=${firstEdges.join(',')} second=${second?.id}`);
  ok('JF13 · תלות ברשומה שדולגה (הבקשה כבר הייתה קיימת אצל הלקוח) — הקשת נוצרת על הקיימת',
    firstEdges.includes(docsB?.id) && firstEdges.length === 2, `edges=${firstEdges.join(',')} docs=${docsB?.id}`);
  ok('JF7 · העמודה משקפת את ההורה הראשון לפי סדר גם כאן',
    [second?.id, docsB?.id].includes(first?.depends_on_step_id), String(first?.depends_on_step_id));
  const foreignTpl = (await one(`
    insert into public.journey_templates (user_id, office_id, kind, name, entries)
    values (null, gen_random_uuid(), 'journey', 'JRNY זר', '[{"key":"x","stepType":"custom_request","owner":"client",
      "payload":{"title":"JRNY זר","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}}]'::jsonb) returning id;`)).id;
  const foreign = (await user.rpc('apply_journey_template', { p_client_id: B.cid, p_template_id: foreignTpl })).data;
  ok('JF16 · תבנית של משרד אחר אינה מוחלת', foreign?.ok === false && foreign?.error === 'template_not_found', JSON.stringify(foreign));
  ok('JF7 · אפס פערים אצל הלקוח השני', (await mismatch(B.cid)) === 0);

  // ═══ D · הכל-בכל: אין שורה במסד עם פער עמודה↔טבלה ═════════════════════
  const globalMismatch = (await one(`
    select count(*)::int as n from public.onboarding_steps s
     where s.depends_on_step_id is distinct from (
       select d.depends_on_step_id from public.onboarding_step_dependencies d
         join public.onboarding_steps p on p.id = d.depends_on_step_id
        where d.step_id = s.id order by coalesce(p.sort_order, 0), p.created_at, p.id limit 1)`)).n;
  // ‼ אבחון בלבד: סוכנים מקבילים טוענים נתונים עם טריגרים מנוטרלים לרגע, ולכן
  // פער זמני כאן אינו רגרסיה של 167. הקבועים על הלקוחות שלנו נבדקו למעלה.
  console.log(globalMismatch === 0
    ? '✓ (אבחון) אפס פערים עמודה↔טבלה בכל סביבת הבדיקות'
    : `⚠ (אבחון) ${globalMismatch} פערים עמודה↔טבלה בסביבת הבדיקות — לא מהלקוחות של JRNY`);
} catch (e) {
  // ‼ בלי זה process.exit שב-finally בולע את החריגה והמבחן נראה כאילו נגמר.
  fail++;
  console.error('✋ המבחן נעצר בחריגה:', e?.message ?? e, e?.stack ?? '');
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
