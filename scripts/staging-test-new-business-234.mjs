#!/usr/bin/env node
/**
 * staging-test-new-business-234.mjs — שער הרגרסיה של מיגרציה 234 (עסק חדש שהמשרד פותח).
 *
 *  N1  עסק חדש מסומן בליד ⇒ עובר לכרטיס, «פתיחת תיקים» נוצרת, המסמכים = אישור בנק בלבד
 *      (בלי «תעודת עוסק», בלי ת.ז. — הייצוג אוסף אותה), פייפרלס נעול על פתיחת התיקים,
 *      «פרטי העסק» פתוחה, וטופס הייצוג יודע שזה עסק חדש (prefill.newBusiness).
 *  N2  «פתח עכשיו» פותח את ההרשמה לפייפרלס ביד, עם שורה ביומן; החיבור ממשיך לחכות לה.
 *  N3  השלמת פתיחת התיקים פותחת את ההרשמה לפייפרלס מעצמה.
 *  N4  ליד שלא סומן (ברירת המחדל «אין רו"ח קודם») ⇒ לא עסק חדש: אין פתיחת תיקים.
 *  N5  עסק קיים בלי רו"ח קודם ⇒ אין פתיחת תיקים ואין מסלול רו"ח קודם.
 *  N6  עסק חדש בלי ייצוג ⇒ ת.ז. נשארת ברשימת המסמכים (אין מי שיאסוף אותה).
 *  N7  «האם תעבוד גם מהבית?» — לא ⇒ תקין בלי שאלת החדר, ונשמר works_from_home=false.
 *  N8  «אין לי רישיון נהיגה» — נשמר על הבקשה וחוזר ב-get_onboarding.
 *
 * ‼ לקוחות דמה בלבד (שם משפחה NB234, הצעות nb234-*), נמחקים בהתחלה ובסוף.
 * הרצה:  node scripts/staging-test-new-business-234.mjs
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
const pure = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
async function sqlq(query) {
  for (let attempt = 0; ; attempt++) {
    try { return await writeStaging(query); }
    catch (e) {
      if (e.http !== 429 || attempt >= 10) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
}
const one = async (query) => (await sqlq(query))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const step = async (cid, type) => await one(
  `select id, status, ball, depends_on_step_id, payload, published_at
     from public.onboarding_steps
    where client_id = ${q(cid)} and step_type = ${q(type)} and status <> 'cancelled'
    order by created_at desc limit 1`);

async function cleanup() {
  await sqlq(`
    delete from public.onboarding_events where engagement_id in
      (select id from public.engagements where quotation_id like 'nb234-%');
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'NB234'));
    delete from public.client_home_office_approvals where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.client_home_office_answers where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.flow_runs where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.journey_stages where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.engagements where quotation_id like 'nb234-%';
    delete from public.engagements where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.additional_charges where source_quotation_id like 'nb234-%';
    delete from public.tax_fact_changes where client_id in (select id from public.clients where last_name = 'NB234');
    delete from public.email_messages where client_id in (select id from public.clients where last_name = 'NB234');
    update public.clients set representation_request_id = null where last_name = 'NB234';
    delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name = 'NB234')
       or id in (select representation_request_id from public.quotations where id like 'nb234-%');
    delete from public.clients where last_name = 'NB234';
    delete from public.quotations where id like 'nb234-%';
    delete from public.leads where id like 'nb234-lead-%';`);
}
await cleanup();

/** הצעה עם הנהלת חשבונות (⇒ פייפרלס), ועם ייצוג במ"ה ומע"מ לפי הצורך. אישור כמו בדפדפן הלקוח. */
async function makeApprovedClient(key, { bt = null, hasPrev = false, rep = true, dealer = 'exempt' } = {}) {
  const token = randomBytes(16).toString('hex');
  const items = [{ id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly',
    billingType: 'monthly', catalogPrice: 200, clientPrice: 200, quantity: 1, vatFlag: true }];
  const representation = rep
    ? { enabled: true, spouse: null,
        areas: { incomeTax: { status: 'in_process', level: 'primary' }, vat: { status: 'in_process', level: 'primary' } },
        prefill: { firstName: 'עסק', lastName: 'NB234', email: 'delivered@resend.dev' } }
    : { enabled: false, areas: {}, spouse: null, prefill: { firstName: 'עסק', lastName: 'NB234', email: 'delivered@resend.dev' } };
  await sqlq(`
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant, business_transfer)
    values (${q('nb234-lead-' + key)}, '${USER_ID}', 'עסק NB234', 'delivered@resend.dev', '050-0002${key}', 'new', ${hasPrev}, ${bt === null ? 'null' : bt});
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
    values (${q('nb234-' + key)}, '${USER_ID}', ${q('nb234-lead-' + key)}, ${q('NB234-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb, ${q(JSON.stringify(representation))}::jsonb, 18, now());`);
  const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'nb234-' + key });
  if (ens?.ok === false) throw new Error(`ensure_client: ${JSON.stringify(ens)}`);
  const cid = (await one(`select client_id from public.quotations where id = ${q('nb234-' + key)}`)).client_id;
  await sqlq(`update public.clients set last_name = 'NB234', dealer_type = ${q(dealer)} where id = ${q(cid)};`);
  const { error } = await pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: 'NB234' });
  if (error) throw new Error(`approve: ${error.message}`);
  return { cid };
}
const docKeys = (s) => (s?.payload?.checklist ?? []).map((i) => i.key).join(',');

console.log(`סביבה: ${STAGING_REF}\n`);
try {
  // ═══ N1 ═══════════════════════════════════════════════════════════════════
  console.log('— N1 · עסק חדש שהמשרד פותח —');
  const A = await makeApprovedClient('a1', { bt: false });
  const card = await one(`select business_transfer from public.clients where id = ${q(A.cid)}`);
  ok('N1 · «עסק חדש» מהליד עבר לכרטיס (business_transfer=false)', card.business_transfer === false, JSON.stringify(card));
  const fo = await step(A.cid, 'file_opening');
  ok('N1 · פתיחת תיקים נוצרה', !!fo && fo.status !== 'completed', JSON.stringify(fo?.status));
  const docs = await step(A.cid, 'client_documents');
  ok('N1 · מסמכים = אישור ניהול חשבון בלבד (בלי תעודת עוסק, בלי ת.ז.)', docKeys(docs) === 'bank_confirm', docKeys(docs));
  ok('N1 · הכותרת נגזרת מהרשימה («להעלות מסמך אחד»/1)', /1|אחד/.test(docs?.payload?.clientTitle ?? ''), docs?.payload?.clientTitle);
  const inv = await step(A.cid, 'paperless_invite');
  ok('N1 · הרשמה לפייפרלס נעולה על פתיחת התיקים', inv?.status === 'locked' && inv?.depends_on_step_id === fo?.id,
    `${inv?.status} ${inv?.depends_on_step_id} vs ${fo?.id}`);
  const arc = await one(`select count(*)::int n from public.onboarding_step_dependencies where step_id = ${q(inv?.id)} and depends_on_step_id = ${q(fo?.id)}`);
  ok('N1 · הקשת נרשמה בטבלת התלויות', arc.n === 1, String(arc.n));
  const reason = await one(`select public.portal_lock_reason(${q(inv?.id)}) r`);
  ok('N1 · בדף: «ייפתח אחרי פתיחת התיקים ברשויות»', reason.r === 'ייפתח אחרי פתיחת התיקים ברשויות', reason.r);
  const conn = await step(A.cid, 'paperless_connection');
  ok('N1 · החיבור לפייפרלס נעול (אחרי ההרשמה)', conn?.status === 'locked', conn?.status);
  const bd = await step(A.cid, 'business_details');
  ok('N1 · «פרטי העסק» פתוחה עכשיו', bd?.status === 'pending', bd?.status);
  const nbf = await one(`select public._client_is_new_business(${q(A.cid)}) v`);
  ok('N1 · _client_is_new_business = true', nbf.v === true);
  const tok = await one(`select r.onboarding_token t from public.representation_requests r join public.clients c on c.representation_request_id = r.id where c.id = ${q(A.cid)}`);
  const { data: gob, error: goErr } = await pure.rpc('get_onboarding', { p_token: tok?.t });
  ok('N1 · טופס הייצוג: prefill.newBusiness = true', !goErr && gob?.[0]?.prefill?.newBusiness === true, goErr?.message ?? JSON.stringify(gob?.[0]?.prefill));

  // ═══ N2 ═══════════════════════════════════════════════════════════════════
  console.log('— N2 · «פתח עכשיו» —');
  const { data: op, error: opErr } = await user.rpc('office_open_locked_step', { p_step_id: inv.id });
  ok('N2 · office_open_locked_step מחזיר ok', !opErr && op?.ok === true, opErr?.message ?? JSON.stringify(op));
  const inv2 = await step(A.cid, 'paperless_invite');
  ok('N2 · ההרשמה פתוחה ובלי תלות', inv2?.status === 'pending' && inv2?.depends_on_step_id === null, `${inv2?.status} ${inv2?.depends_on_step_id}`);
  const ev2 = await one(`select note from public.onboarding_events where step_id = ${q(inv.id)} and meta->>'openedEarly' = 'true' order by at desc limit 1`);
  ok('N2 · שורה ביומן: «המשרד פתח את הבקשה עכשיו - בלי לחכות ל…»', /המשרד פתח את הבקשה עכשיו/.test(ev2?.note ?? ''), ev2?.note);
  const conn2 = await step(A.cid, 'paperless_connection');
  ok('N2 · החיבור עדיין ממתין להרשמה', conn2?.status === 'locked', conn2?.status);
  const { data: op2 } = await user.rpc('office_open_locked_step', { p_step_id: inv.id });
  ok('N2 · לחיצה שנייה = noop', op2?.ok === true && op2?.noop === true, JSON.stringify(op2));
  const { data: forb } = await pure.rpc('office_open_locked_step', { p_step_id: conn.id }).then((r) => r, (e) => ({ data: { error: e.message } }));
  ok('N2 · anon לא יכול לפתוח', !forb?.ok, JSON.stringify(forb));

  // ═══ N3 ═══════════════════════════════════════════════════════════════════
  console.log('— N3 · השלמת פתיחת התיקים פותחת את הפייפרלס —');
  const B = await makeApprovedClient('b1', { bt: false });
  const foB = await step(B.cid, 'file_opening');
  const { data: adv, error: advErr } = await user.rpc('advance_onboarding_step', { p_step_id: foB.id, p_action: 'complete', p_payload: {} });
  ok('N3 · פתיחת התיקים הושלמה', !advErr && adv?.ok !== false, advErr?.message ?? JSON.stringify(adv));
  const invB = await step(B.cid, 'paperless_invite');
  ok('N3 · ההרשמה לפייפרלס נפתחה מעצמה', invB?.status === 'pending', invB?.status);

  // ═══ N4 ═══════════════════════════════════════════════════════════════════
  console.log('— N4 · ליד שלא סומן —');
  const C = await makeApprovedClient('c1', { bt: null, hasPrev: false });
  ok('N4 · אין פתיחת תיקים', !(await step(C.cid, 'file_opening')));
  const docsC = await step(C.cid, 'client_documents');
  ok('N4 · מסמכים = אישור בנק (ת.ז. — בייצוג)', docKeys(docsC) === 'bank_confirm', docKeys(docsC));
  ok('N4 · ההרשמה לפייפרלס לא נעולה', (await step(C.cid, 'paperless_invite'))?.status === 'pending');
  const cardC = await one(`select business_transfer from public.clients where id = ${q(C.cid)}`);
  ok('N4 · הכרטיס נשאר «לא סומן»', cardC.business_transfer === null, String(cardC.business_transfer));

  // ═══ N5 ═══════════════════════════════════════════════════════════════════
  console.log('— N5 · עסק קיים בלי רו"ח קודם —');
  const D = await makeApprovedClient('d1', { bt: true, hasPrev: false });
  ok('N5 · אין פתיחת תיקים', !(await step(D.cid, 'file_opening')));
  ok('N5 · אין מכתב העברה / פרטי רו"ח קודם', !(await step(D.cid, 'release_letter')) && !(await step(D.cid, 'prev_accountant_details')));
  const cardD = await one(`select business_transfer from public.clients where id = ${q(D.cid)}`);
  ok('N5 · הכרטיס: business_transfer=true', cardD.business_transfer === true, String(cardD.business_transfer));

  // ═══ N6 ═══════════════════════════════════════════════════════════════════
  console.log('— N6 · עסק חדש בלי ייצוג —');
  const E = await makeApprovedClient('e1', { bt: false, rep: false });
  const docsE = await step(E.cid, 'client_documents');
  ok('N6 · ת.ז. ואישור בנק (בלי תעודת עוסק)', docKeys(docsE) === 'id_card,bank_confirm', docKeys(docsE));

  // ═══ N7 ═══════════════════════════════════════════════════════════════════
  console.log('— N7 · עבודה מהבית —');
  const e1 = await one(`select public._home_office_answers_error('{"worksFromHome":"false"}'::jsonb) e`);
  ok('N7 · «לא עובד מהבית» תקין בלי שאלת החדר', e1.e === null, String(e1.e));
  const e2 = await one(`select public._home_office_answers_error('{"worksFromHome":"true"}'::jsonb) e`);
  ok('N7 · «עובד מהבית» ⇒ חייב לענות על החדר', e2.e === 'missing_has_room', String(e2.e));
  const e3 = await one(`select public._home_office_answers_error('{"worksFromHome":"maybe"}'::jsonb) e`);
  ok('N7 · ערך לא תקין נדחה', e3.e === 'missing_works_from_home', String(e3.e));
  const e4 = await one(`select public._home_office_answers_error('{"hasDedicatedRoom":"false"}'::jsonb) e`);
  ok('N7 · תשובה בלי השאלה החדשה (מסך ישן) עדיין תקינה', e4.e === null, String(e4.e));
  await sqlq(`update public.clients set business_name = 'שליחויות NB234' where id = ${q(A.cid)}`);
  const { data: sv, error: svErr } = await user.rpc('save_home_office_answers', { p_client_id: A.cid, p_data: { worksFromHome: false } });
  ok('N7 · המשרד שומר «לא עובד מהבית»', !svErr && sv?.ok === true, svErr?.message ?? JSON.stringify(sv));
  const ans = await one(`select works_from_home, has_dedicated_room from public.client_home_office_answers where client_id = ${q(A.cid)} order by seq desc limit 1`);
  ok('N7 · נשמר works_from_home=false, has_dedicated_room=false', ans?.works_from_home === false && ans?.has_dedicated_room === false, JSON.stringify(ans));
  ok('N7 · «פרטי העסק» הושלמה (שם + תשובה)', (await step(A.cid, 'business_details'))?.status === 'completed');
  const askName = await one(`select public._paperless_asks_business_name(${q(A.cid)}) v`);
  ok('N7 · הרשמה לפייפרלס לא שואלת שוב את שם העסק', askName.v === false);

  // ═══ N8 ═══════════════════════════════════════════════════════════════════
  console.log('— N8 · «אין לי רישיון נהיגה» —');
  const { data: nl, error: nlErr } = await pure.rpc('onboarding_set_no_license', { p_token: tok.t, p_person: 'client', p_value: true });
  ok('N8 · נשמר', !nlErr && nl?.ok === true, nlErr?.message ?? JSON.stringify(nl));
  const { data: gob2 } = await pure.rpc('get_onboarding', { p_token: tok.t });
  ok('N8 · חוזר ב-prefill.noDriverLicense.client', gob2?.[0]?.prefill?.noDriverLicense?.client === true, JSON.stringify(gob2?.[0]?.prefill));
  const { data: nlBad } = await pure.rpc('onboarding_set_no_license', { p_token: 'nope', p_person: 'client', p_value: true });
  ok('N8 · טוקן לא קיים נדחה', nlBad?.ok === false);
} catch (e) {
  fail++;
  console.error('✗ חריגה:', e.message);
} finally {
  // NB234_KEEP=1 — משאיר את לקוחות הדמה לבדיקה בדפדפן (לנקות בהרצה רגילה אחר כך).
  if (!process.env.NB234_KEEP) await cleanup();
}
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
