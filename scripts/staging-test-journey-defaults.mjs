#!/usr/bin/env node
/**
 * staging-test-journey-defaults.mjs — שער הרגרסיה של מיגרציה 173 (אשכול H
 * בספר הפערים): ברירת המחדל של המשרד מכובדת, צילום תמיד, רשימת החומרים,
 * «בטל שינויים», תבניות, ו«דורש טיפול».
 *
 *  JF18  המחולל מכבד הסרה, יעד (dueInDays), חובה/רשות, תלות ומקום מהצילום —
 *        גם ל«עדכון סטטוס מס» (intake_questionnaire).
 *  JF19  סוג לקוח שאינו ניתן להכרעה ⇒ עדיין יש צילום (kindFallback).
 *  JF4   «מוחזק עד אישור» — פרדיקט אחד: לקוח quoted מוחזק, לקוח בקליטה לא.
 *  JF25  «קבלת חומרים» שנוצרת מ«+ בקשה» בלי רשימה מקבלת את 9 הפריטים.
 *  JF12  בקשה שהמשרד הסיר אינה נולדת מחדש בהרצה חוזרת של המחולל.
 *  JF2   «בטל שינויים» מנקה draft_payload גם על בקשה שטרם פורסמה.
 *  JF14  תבנית: הנוסח האפקטיבי, סוג לא-ניתן-ליצירה מדווח, ההחלה מדווחת דילוגים.
 *  JF22  דגל ידני שורד את המשימה הלילית; כיבוי ידני אינו מודלק שוב עד שינוי.
 *
 * ‼ לקוחות דמה בלבד (שם משפחה JDEF, הצעות jdef-*), נמחקים בסוף. ברירת המחדל
 *   של המשרד משתנה במהלך הבדיקה ומשוחזרת ב-finally.
 * הרצה:  node scripts/staging-test-journey-defaults.mjs
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
  `select id, status, ball, due_date, depends_on_step_id, payload, engagement_id, sort_order,
          required_for_close, published_at, needs_attention, draft_payload
     from public.onboarding_steps
    where client_id = ${q(cid)} and step_type = ${q(type)} and status <> 'cancelled'
    order by created_at desc limit 1`);
const stepById = async (id) => await one(
  `select id, status, ball, due_date, depends_on_step_id, payload, sort_order, required_for_close,
          published_at, needs_attention, draft_payload, updated_at
     from public.onboarding_steps where id = ${q(id)}`);
const advance = (id, action, payload = {}) =>
  user.rpc('advance_onboarding_step', { p_step_id: id, p_action: action, p_payload: payload });
const OFFICE = (await one(`select office_id from public.profiles where id = '${USER_ID}'`)).office_id;
const today = new Date().toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

console.log(`סביבה: ${STAGING_REF}\n`);

// ‼ ברירת המחדל של המשרד נשמרת לפני שנוגעים בה, ומשוחזרת ב-finally.
const savedDefaults = await sqlq(`select client_kind, entries::text as entries
  from public.office_journey_defaults where office_id = '${OFFICE}'`);
async function restoreDefaults() {
  for (const r of savedDefaults) {
    await sqlq(`update public.office_journey_defaults set entries = ${q(r.entries)}::jsonb
                 where office_id = '${OFFICE}' and client_kind = ${q(r.client_kind)}`);
  }
}
async function setDefaults(kind, entries) {
  await sqlq(`update public.office_journey_defaults set entries = ${q(JSON.stringify(entries))}::jsonb
               where office_id = '${OFFICE}' and client_kind = ${q(kind)}`);
}

async function cleanup() {
  await sqlq(`
    delete from public.onboarding_events where engagement_id in
      (select id from public.engagements where quotation_id like 'jdef-%');
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in
        (select id from public.clients where last_name = 'JDEF'));
    delete from public.onboarding_steps where client_id in
      (select id from public.clients where last_name = 'JDEF');
    delete from public.journey_stages where client_id in
      (select id from public.clients where last_name = 'JDEF');
    delete from public.engagements where quotation_id like 'jdef-%';
    delete from public.engagements where client_id in
      (select id from public.clients where last_name = 'JDEF');
    delete from public.additional_charges where source_quotation_id like 'jdef-%';
    delete from public.tax_fact_changes where client_id in
      (select id from public.clients where last_name = 'JDEF');
    delete from public.representation_requests where linked_client_id in
      (select id from public.clients where last_name = 'JDEF');
    delete from public.email_messages where client_id in
      (select id from public.clients where last_name = 'JDEF');
    delete from public.clients where last_name = 'JDEF';
    delete from public.quotations where id like 'jdef-%';
    delete from public.leads where id like 'jdef-lead-%';
    delete from public.journey_templates where name like 'JDEF %';`);
}
await cleanup();

/**
 * הצעה עם הנהלת חשבונות (⇒ פייפרלס + הרשאת תשלום) ורו"ח קודם — בלי ייצוג,
 * כדי שהבדיקה תישאר על המסלול ולא על מכונת המצב של הייצוג. אישור דרך לקוח
 * anon אמיתי (בדיוק מה שהדפדפן של הלקוח שולח).
 */
async function makeApprovedClient(key, { dealer = 'licensed', hasPrev = true, approve = true } = {}) {
  const token = randomBytes(16).toString('hex');
  const items = [{ id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly',
    billingType: 'monthly', catalogPrice: 1200, clientPrice: 1200, quantity: 1, vatFlag: true }];
  await sqlq(`
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values (${q('jdef-lead-' + key)}, '${USER_ID}', 'מסע JDEF', 'delivered@resend.dev', '050-0001${key}', 'new', ${hasPrev});
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, sent_at)
    values (${q('jdef-' + key)}, '${USER_ID}', ${q('jdef-lead-' + key)}, ${q('JDEF-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb,
            '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"מסע","lastName":"JDEF","email":"delivered@resend.dev","phone":"050-0000001"}}'::jsonb,
            18, now());`);
  const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'jdef-' + key });
  if (ens?.ok === false) throw new Error(`ensure_client: ${JSON.stringify(ens)}`);
  const cid = (await one(`select client_id from public.quotations where id = ${q('jdef-' + key)}`)).client_id;
  await sqlq(`update public.clients set last_name = 'JDEF'
                        ${dealer ? `, dealer_type = ${q(dealer)}` : ''} where id = ${q(cid)};`);
  if (!approve) return { cid, eng: null, quoteId: 'jdef-' + key, token };
  const { error } = await pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: 'JDEF' });
  if (error) throw new Error(`approve: ${error.message}`);
  const eng = (await one(`select id from public.engagements where client_id = ${q(cid)} order by created_at desc limit 1`)).id;
  return { cid, eng, quoteId: 'jdef-' + key, token };
}

/** לקוח פעיל שנוצר ידנית (בלי הצעה) — הבסיס לבדיקות שאינן תלויות במחולל. */
async function makeManualClient(key) {
  const id = randomBytes(16).toString('hex');
  await sqlq(`insert into public.clients (id, user_id, first_name, last_name, lifecycle_stage, representation_status)
              values (${q(id)}, '${USER_ID}', ${q('ידני ' + key)}, 'JDEF', 'active', 'active')`);
  return id;
}

const licensedSeed = JSON.parse(savedDefaults.find((r) => r.client_kind === 'licensed_dealer').entries);
const companySeed = JSON.parse(savedDefaults.find((r) => r.client_kind === 'company').entries);

try {
  // ═══ JF18 · ברירת המחדל של המשרד מכובדת בכל בקשת קטלוג ═══════════════════
  console.log('— JF18 · ברירת מחדל ערוכה: הסרה, יעד, רשות, תלות, מקום —');
  const edited = licensedSeed
    .filter((e) => e.stepType !== 'paperless_tax_authority')            // הוסרה מהרשימה (138)
    .map((e) => {
      if (e.stepType === 'client_documents') return { ...e, dueInDays: 5, requiredForClose: false };
      if (e.stepType === 'retainer_authorization') return { ...e, dependsOn: null };   // בלי תלות
      if (e.stepType === 'intake_questionnaire') return { ...e, sortIndex: 95, requiredForClose: true };
      return e;
    })
    .concat([{
      key: 'fee_terms', stepType: 'custom_request', enabled: true, sortIndex: 100, source: 'office',
      requiredForClose: null, dueInDays: 3, dependsOn: null, variants: [],
      payload: { title: 'JDEF אישור תנאים', clientTitle: 'JDEF אישור תנאים', clientSub: 'בדיקה', clientCta: 'לאישור',
        requirements: [{ key: 'i1', kind: 'confirm', label: 'אישור', done: false, required: true }] },
    }]);
  await setDefaults('licensed_dealer', edited);

  const A = await makeApprovedClient('a1');
  const snap = await one(`select journey_default_snapshot is not null as has_snap,
                                 journey_default_facts->>'kindFallback' as kf,
                                 journey_default_facts->>'kind' as kind
                            from public.engagements where id = ${q(A.eng)}`);
  ok('צילום נשמר על ההתקשרות, סוג הלקוח הוכרע (licensed_dealer)',
    snap.has_snap === true && snap.kf === 'false' && snap.kind === 'licensed_dealer', JSON.stringify(snap));

  const pta = await step(A.cid, 'paperless_tax_authority');
  ok('JF18 · בקשה שהוסרה מברירת המחדל לא נוצרה (חיבור לרשות המסים, עוסק מורשה)', !pta, JSON.stringify(pta));

  const docs = await step(A.cid, 'client_documents');
  ok('JF18 · dueInDays מהצילום ⇒ due_date = היום + 5', docs?.due_date === plusDays(5), `${docs?.due_date} vs ${plusDays(5)}`);
  ok('JF18 · requiredForClose=false מהצילום ⇒ רשות', docs?.required_for_close === false, String(docs?.required_for_close));
  ok('JF18 · מקום מהצילום (sort_order=10)', docs?.sort_order === 10, String(docs?.sort_order));

  const conn = await step(A.cid, 'paperless_connection');
  const ret = await step(A.cid, 'retainer_authorization');
  ok('הכנה: החיבור לפייפרלס נולד נעול על ההרשמה', conn?.status === 'locked' && conn?.depends_on_step_id === (await step(A.cid, 'paperless_invite'))?.id,
    `${conn?.status}`);
  ok('JF18 · dependsOn=null בצילום ⇒ הרשאת התשלום נולדה בלי תלות ופתוחה (ולא נעולה על החיבור)',
    ret?.status === 'pending' && ret?.depends_on_step_id === null
    && (await one(`select count(*)::int as n from public.onboarding_step_dependencies where step_id = ${q(ret?.id)}`)).n === 0,
    `${ret?.status} dep=${ret?.depends_on_step_id}`);

  const mats = await step(A.cid, 'materials_received');
  const rel = await step(A.cid, 'release_letter');
  ok('JF18 · dependsOn מהצילום ⇒ קבלת החומרים נעולה על המכתב', mats?.status === 'locked' && mats?.depends_on_step_id === rel?.id,
    `${mats?.status} dep=${mats?.depends_on_step_id} rel=${rel?.id}`);
  ok('JF25 · המחולל מוליד 9 פריטים בקבלת החומרים', (mats?.payload?.checklist ?? []).length === 9);

  const intake = await step(A.cid, 'intake_questionnaire');
  ok('JF18 · «עדכון סטטוס מס» נולד לפי הצילום: מקום 95, נדרש, טיוטה',
    intake?.sort_order === 95 && intake?.required_for_close === true && intake?.published_at === null,
    JSON.stringify({ so: intake?.sort_order, rq: intake?.required_for_close, pub: intake?.published_at }));

  const fee = await one(`select id, status, due_date, published_at, sort_order from public.onboarding_steps
    where client_id = ${q(A.cid)} and step_type = 'custom_request'
      and payload->'defaultOrigin'->>'key' = 'fee_terms'`);
  ok('בקשת משרד מברירת המחדל נוצרה גם באישור ציבורי (בלי auth.uid), עם יעד ומקום',
    !!fee && fee.due_date === plusDays(3) && fee.sort_order === 100 && fee.published_at !== null, JSON.stringify(fee));

  const order = await sqlq(`select step_type, sort_order from public.onboarding_steps
    where client_id = ${q(A.cid)} and step_type in ('client_documents','prev_accountant_details','release_letter','materials_received','paperless_invite','paperless_connection','retainer_authorization')
    order by sort_order`);
  ok('JF21 · המקום נקבע בלידה לכל בקשת קטלוג (אין 0)',
    order.length === 7 && order.every((r) => r.sort_order > 0)
    && order.map((r) => r.step_type).join(',') === 'client_documents,prev_accountant_details,release_letter,materials_received,paperless_invite,paperless_connection,retainer_authorization',
    JSON.stringify(order));
  ok('JF4 · לקוח בקליטה: הבקשות נולדו מפורסמות (שער התהליך מסתיר), לא מוחזקות',
    docs?.published_at !== null && !docs?.payload?.heldUntilApproval
    && (await one(`select public.requests_held_until_approval(${q(A.cid)}) as h`)).h === false);

  // ═══ JF18 · «עדכון סטטוס מס» שהוסר מברירת המחדל אינו נולד ══════════════════
  console.log('\n— JF18 · סוג לקוח אחר: intake_questionnaire הוסר —');
  await setDefaults('company', companySeed.filter((e) => e.stepType !== 'intake_questionnaire'));
  const C = await makeApprovedClient('c1', { dealer: 'company', hasPrev: false });
  ok('JF18 · «עדכון סטטוס מס» לא נוצר לחברה שהמשרד הסיר אותו אצלה', !(await step(C.cid, 'intake_questionnaire')));
  ok('הכנה: שאר המסלול של החברה נולד', !!(await step(C.cid, 'client_documents')) && !!(await step(C.cid, 'paperless_invite')));

  // ═══ JF19 · סוג לקוח לא ניתן להכרעה ⇒ עדיין יש צילום ═══════════════════════
  console.log('\n— JF19 · צילום גם כשסוג הלקוח לא ידוע —');
  const B = await makeApprovedClient('b1', { dealer: null, hasPrev: false });
  const snapB = await one(`select journey_default_snapshot is not null as has_snap,
                                  journey_default_facts->>'kindFallback' as kf,
                                  journey_default_facts->>'kind' as kind,
                                  public.resolve_client_kind(quotation_id, client_id) as resolved
                             from public.engagements where id = ${q(B.eng)}`);
  ok('JF19 · resolve_client_kind ריק ⇒ צילום מסוג הנופל-אחורה ועובדה kindFallback',
    snapB.resolved === null && snapB.has_snap === true && snapB.kf === 'true' && snapB.kind === 'licensed_dealer', JSON.stringify(snapB));
  ok('JF19 · ברירת המחדל הערוכה של המשרד חלה גם עליו (יעד 5 ימים על המסמכים)',
    (await step(B.cid, 'client_documents'))?.due_date === plusDays(5));

  // ═══ JF12 · הוסרה ⇒ לא נולדת מחדש, לכל סוג בנפרד ═══════════════════════════
  console.log('\n— JF12 · הסרה לפי סוג —');
  const inv = await step(A.cid, 'paperless_invite');
  const cancelInv = await advance(inv.id, 'cancel', { note: 'JDEF הסרה' });
  ok('הכנה: ההרשמה לפייפרלס הוסרה', cancelInv.data?.ok === true, JSON.stringify(cancelInv.data ?? cancelInv.error?.message));
  const relCancel = await advance(rel.id, 'cancel', { note: 'JDEF הסרה' });
  ok('הכנה: מכתב ההעברה הוסר (השאלה ללקוח וקבלת החומרים נשארות)', relCancel.data?.ok === true);
  const before = (await one(`select count(*)::int as n from public.onboarding_steps where client_id = ${q(A.cid)}`)).n;
  const regen = await one(`select public.generate_onboarding_steps(${q(A.eng)}, false) as r`);
  const after = (await one(`select count(*)::int as n from public.onboarding_steps where client_id = ${q(A.cid)}`)).n;
  ok('JF12 · הרצה חוזרת אינה נופלת ואינה מולידה דבר', regen?.r?.ok === true && after === before && regen.r.created === 0,
    JSON.stringify({ before, after, created: regen?.r?.created, planned: regen?.r?.planned }));
  ok('JF12 · ההרשמה נשארה מוסרת', !(await step(A.cid, 'paperless_invite')));
  ok('JF12 · המכתב נשאר מוסר, והשאלה ללקוח (סוג אחר באותו מסלול) עדיין חיה',
    !(await step(A.cid, 'release_letter')) && !!(await step(A.cid, 'prev_accountant_details')));
  ok('JF12 · step_removed_by_office אומר את זה',
    (await one(`select public.step_removed_by_office(${q(A.cid)}, 'paperless_invite') as a,
                       public.step_removed_by_office(${q(A.cid)}, 'prev_accountant_details') as b`)).a === true
    && (await one(`select public.step_removed_by_office(${q(A.cid)}, 'prev_accountant_details') as b`)).b === false);
  const revived = (await user.rpc('create_onboarding_request', {
    p_client_id: A.cid, p_step_type: 'paperless_invite', p_payload: {},
    p_due_date: null, p_depends_on: null, p_published: true, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  ok('117 · חזרה = הוספה ידנית מ«+ בקשה» (החייאה של השורה המבוטלת)', revived?.ok === true && revived?.revived === true, JSON.stringify(revived));

  // ═══ JF25 · «קבלת חומרים» מ«+ בקשה» — הרשימה מהשרת ═════════════════════════
  console.log('\n— JF25 · רשימת החומרים מקור אחד —');
  const D = await makeManualClient('d');
  const matsD = (await user.rpc('create_onboarding_request', {
    p_client_id: D, p_step_type: 'materials_received', p_payload: { checklist: [] },
    p_due_date: null, p_depends_on: null, p_published: true, p_required_for_close: true, p_owner: 'me', p_stage_id: null,
  })).data;
  const matsRow = await stepById(matsD?.stepId);
  const matsKeys = (matsRow?.payload?.checklist ?? []).map((x) => x.key);
  ok('JF25 · רשימה ריקה מהדפדפן ⇒ 9 הפריטים של הקטלוג',
    matsD?.ok === true && matsKeys.length === 9 && matsKeys[0] === 'uniform_file' && matsKeys.includes('trial_balance'), matsKeys.join(','));
  ok('JF25 · זהה לרשימה שהמחולל מוליד',
    JSON.stringify(matsKeys) === JSON.stringify((mats?.payload?.checklist ?? []).map((x) => x.key)));
  const E = await makeManualClient('e');
  const matsE = (await user.rpc('create_onboarding_request', {
    p_client_id: E, p_step_type: 'materials_received', p_payload: { checklist: [{ key: 'last_return', label: 'דוח אחרון', done: false }] },
    p_due_date: null, p_depends_on: null, p_published: true, p_required_for_close: true, p_owner: 'me', p_stage_id: null,
  })).data;
  ok('JF25 · רשימה מפורשת נשמרת כמות שהיא', ((await stepById(matsE?.stepId))?.payload?.checklist ?? []).length === 1);

  // ═══ JF4 · לקוח quoted: הבקשה מוחזקת — אותו פרדיקט ═══════════════════════
  console.log('\n— JF4 · מוחזק עד אישור —');
  const Q = await makeApprovedClient('q1', { approve: false });
  const held = (await user.rpc('create_onboarding_request', {
    p_client_id: Q.cid, p_step_type: 'client_documents', p_payload: { checklist: [{ key: 'id', label: 'ת"ז', done: false }] },
    p_due_date: null, p_depends_on: null, p_published: true, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  })).data;
  const heldRow = await stepById(held?.stepId);
  ok('JF4 · לקוח quoted: בקשה שנוצרת «מפורסמת» נולדת מוחזקת (published_at ריק, heldUntilApproval)',
    held?.heldUntilApproval === true && heldRow?.published_at === null && heldRow?.payload?.heldUntilApproval === true
    && (await one(`select public.requests_held_until_approval(${q(Q.cid)}) as h`)).h === true, JSON.stringify(held));

  // ═══ JF2 · «בטל שינויים» מנקה טיוטת עריכה גם על בקשה שטרם פורסמה ═══════════
  console.log('\n— JF2 · בטל שינויים —');
  await sqlq(`update public.onboarding_steps set draft_payload = '{"clientTitle":"JDEF טיוטה על טיוטה"}'::jsonb where id = ${q(intake.id)};
              update public.onboarding_steps set draft_payload = '{"clientTitle":"JDEF טיוטה על מפורסמת"}'::jsonb where id = ${q(docs.id)};`);
  const discard = (await user.rpc('discard_case_changes', { p_client_id: A.cid })).data;
  ok('JF2 · הביטול מדווח על שתי העריכות', discard?.ok === true && Number(discard?.editsReverted) === 2, JSON.stringify(discard));
  ok('JF2 · draft_payload נוקה גם על הבקשה שטרם פורסמה (intake) וגם על המפורסמת',
    (await stepById(intake.id)).draft_payload === null && (await stepById(docs.id)).draft_payload === null);
  ok('JF2 · הבקשה שטרם פורסמה עצמה לא נמחקה', (await stepById(intake.id)).status !== 'cancelled');

  // ═══ JF14 · תבנית מסע: נוסח אפקטיבי, סוגים לא ניתנים ליצירה, דיווח דילוגים ═
  console.log('\n— JF14 · תבניות —');
  await sqlq(`update public.onboarding_steps set draft_payload = '{"clientTitle":"JDEF נוסח ערוך"}'::jsonb where id = ${q(docs.id)};
              -- שיחת פתיחה נולדת כבר באישור ההצעה (163); מוסיפים רק אם חסרה.
              insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball)
              select '${USER_ID}', ${q(A.eng)}, ${q(A.cid)}, 'opening_call', 'internal', 'person', 'pending', 'me'
              where not exists (select 1 from public.onboarding_steps
                                 where client_id = ${q(A.cid)} and step_type = 'opening_call' and status <> 'cancelled');`);
  const liveCount = (await one(`select count(*)::int as n from public.onboarding_steps
    where client_id = ${q(A.cid)} and status <> 'cancelled'
      and step_type = any (public.request_creatable_step_types())`)).n;
  const savedT = (await user.rpc('save_journey_template', { p_client_id: A.cid, p_name: 'JDEF תבנית', p_description: null })).data;
  ok('JF14 · התבנית סופרת רק סוגים שהיוצר יודע ליצור, ומדווחת מה נשאר בחוץ',
    savedT?.ok === true && savedT?.count === liveCount
    && (savedT?.skippedEntries ?? []).some((s) => s.stepType === 'opening_call' && s.reason === 'not_creatable'),
    JSON.stringify(savedT));
  const tplEntries = (await one(`select entries from public.journey_templates where id = ${q(savedT?.templateId)}`)).entries;
  const docsEntry = (tplEntries ?? []).find((e) => e.stepType === 'client_documents');
  ok('JF14 · הנוסח בתבנית הוא הנוסח האפקטיבי (הטיוטה מעל הפרסום)',
    docsEntry?.payload?.clientTitle === 'JDEF נוסח ערוך', JSON.stringify(docsEntry?.payload));
  ok('JF14 · אף סוג לא-ניתן-ליצירה לא נכנס לתבנית', !(tplEntries ?? []).some((e) => e.stepType === 'opening_call'));

  const F = await makeManualClient('f');
  await user.rpc('create_onboarding_request', {
    p_client_id: F, p_step_type: 'client_documents', p_payload: { checklist: [{ key: 'id', label: 'ת"ז', done: false }] },
    p_due_date: null, p_depends_on: null, p_published: false, p_required_for_close: true, p_owner: 'client', p_stage_id: null,
  });
  const applied = (await user.rpc('apply_journey_template', { p_client_id: F, p_template_id: savedT?.templateId })).data;
  ok('JF14 · ההחלה מדווחת כל דילוג עם סיבה (client_documents כבר קיימת ⇒ exists)',
    applied?.ok === true && applied?.skipped === (applied?.skippedEntries ?? []).length
    && (applied?.skippedEntries ?? []).some((s) => s.stepType === 'client_documents' && s.reason === 'exists' && !!s.stepId),
    JSON.stringify(applied));
  ok('JF14 · סבב שמירה⇐החלה שומר על המניין: נוספו + דולגו = מה שנשמר',
    applied?.added + applied?.skipped === savedT?.count, `${applied?.added}+${applied?.skipped} vs ${savedT?.count}`);

  // ═══ JF22/JF23 · «דורש טיפול» — בעלים אחד ══════════════════════════════════
  console.log('\n— JF22/23 · דורש טיפול —');
  const setup = await step(A.cid, 'internal_setup');
  const manualOn = (await user.rpc('set_step_attention', { p_step_id: setup.id, p_on: true })).data;
  ok('הכנה: סימון ידני', manualOn?.ok === true && (await stepById(setup.id)).payload?.attentionSource === 'manual');
  await sqlq(`select public.refresh_onboarding_attention()`);
  ok('JF22 · דגל ידני על שלב פתוח שורד את המשימה הלילית',
    (await stepById(setup.id)).needs_attention === true && (await stepById(setup.id)).payload?.attentionSource === 'manual');

  // דגל נגזר: חודש חיוב קרוב ⇒ ההרשאה מסומנת
  const month = today.slice(0, 7);
  await sqlq(`update public.engagements set billing_start_month = ${q(month)} where id = ${q(A.eng)}`);
  await sqlq(`select public.refresh_onboarding_attention()`);
  const ret1 = await stepById(ret.id);
  ok('הכנה: המשימה הלילית מסמנת את ההרשאה (חודש חיוב קרוב) כנגזר',
    ret1.needs_attention === true && ret1.payload?.attentionSource === 'derived', JSON.stringify({ n: ret1.needs_attention, s: ret1.payload?.attentionSource }));
  const dismissed = (await user.rpc('set_step_attention', { p_step_id: ret.id, p_on: false })).data;
  ok('הכנה: המשרד כיבה', dismissed?.ok === true && (await stepById(ret.id)).needs_attention === false);
  await sqlq(`select public.refresh_onboarding_attention()`);
  const ret2 = await stepById(ret.id);
  ok('JF23 · המשימה הלילית אינה מדליקה שוב דגל שהמשרד כיבה, כל עוד השלב לא השתנה',
    ret2.needs_attention === false && !!ret2.payload?.attentionDismissedAt, JSON.stringify({ n: ret2.needs_attention }));
  await new Promise((r) => setTimeout(r, 1100));
  await advance(ret.id, 'note', { note: 'JDEF שינוי אחרי כיבוי' });
  await sqlq(`select public.refresh_onboarding_attention()`);
  ok('JF23 · אחרי שהשלב השתנה — התנאי נבדק מחדש והדגל חוזר',
    (await stepById(ret.id)).needs_attention === true, JSON.stringify(await stepById(ret.id)));
  await advance(setup.id, 'complete', { note: 'JDEF סגירה' });
  await sqlq(`select public.refresh_onboarding_attention()`);
  ok('JF22 · שלב שנסגר אינו דורש טיפול (גם ידני) — כמו advance', (await stepById(setup.id)).needs_attention === false);

  // ═══ שומר הקבועים ═══════════════════════════════════════════════════════════
  ok('assert_domain_function_invariants', (await one(`select public.assert_domain_function_invariants() as r`)).r === 'ok');
} catch (e) {
  // ‼ בלי זה process.exit שב-finally בולע את החריגה והמבחן נראה כאילו נגמר.
  fail++;
  console.error('✋ המבחן נעצר בחריגה:', e?.message ?? e, e?.stack ?? '');
} finally {
  await restoreDefaults();
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}
