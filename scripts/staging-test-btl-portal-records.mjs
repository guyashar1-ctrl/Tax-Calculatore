#!/usr/bin/env node
/**
 * staging-test-btl-portal-records.mjs — מה ב"ל רושם (207) מול המסד.
 *
 * מה נבדק: קליטה אוטומטית ממשימת btl.sync_file שהצליחה; ערך זהה ⇒ רק «נקרא
 * לאחרונה»; ערך שהשתנה ⇒ היסטוריה; מקטע שנכשל / אדם שנכשל ⇒ שום דבר לא נמחק;
 * סינון הודעות בשרת; קלט פגום ⇒ כשל נרשם על המשימה ולא נשמר חלקית; מסמכים בלי
 * כפילויות; מועמדים לראיית קליטה ל-6101 (אחד / כמה / אין) ואישור הרו"ח עם
 * הראיה; בידוד בין משרדים ו-anon.
 *
 * ‼ לקוח סינתטי בלבד ('btlrec-…'), וכל הנתונים סינתטיים. מוחק הכול בסוף.
 *   node scripts/staging-test-btl-portal-records.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, writeStaging } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);

async function signIn(email, password) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`signIn ${email}: ${error?.message}`);
  return {
    id: data.session.user.id,
    db: createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      ...opts, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }),
  };
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 300) : ''}`); }
};
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const rpc = async (db, fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  return error ? { ok: false, error: error.message, pgError: true } : data;
};

const TAG = Date.now().toString(36);
const CLIENT = `btlrec-${TAG}`;
const OTHER_EMAIL = `btlrec-other-${TAG}@pivo.test`;
const OTHER_PASS = `Pw-${TAG}-x9!`;

const office = await signIn(env.VITE_DEV_USER_EMAIL, env.VITE_DEV_USER_PASSWORD);
let otherId = null;
let jobSeq = 0;

/** משימה סינתטית: נוצרת כ-running ומסומנת succeeded — בדיוק כמו שהעובד מסיים. */
async function finishJob(persons, finishedAt) {
  const id = `btlrec-${TAG}-j${++jobSeq}`;
  await writeStaging(`
    insert into public.automation_jobs (id, user_id, client_id, action_type, input, status)
    values (${q(id)}, ${q(office.id)}, ${q(CLIENT)}, 'btl.sync_file', '{}'::jsonb, 'running');
    update public.automation_jobs
       set status = 'succeeded', finished_at = ${q(finishedAt)}::timestamptz,
           result = ${q(JSON.stringify({ system: 'btl', area: 'insured_file', persons }))}::jsonb
     where id = ${q(id)};`);
  return id;
}
const facts = (key, role = 'client') => writeStaging(`select value, source_screen, first_seen_at, last_seen_at, first_job_id, last_job_id
  from public.btl_portal_facts where client_id = ${q(CLIENT)} and person_role = ${q(role)} and fact_key = ${q(key)} order by first_seen_at, id`);

const SUMMARY = (paymentObligation, familyRaw = 'רווק', familyCode = 'single') => ({
  ok: true, value: {
    familyStatus: { raw: familyRaw, code: familyCode }, residency: { raw: 'כן' }, paymentObligation: { raw: paymentObligation },
    coverage: { raw: 'זו"ש מ- 06/25', sinceMonth: '2025-06' }, enforcement: { raw: null }, paymentArrangement: { raw: null },
    collectionAudit: { raw: '01/24-12/24' }, withholdingFile: { raw: null },
  },
});
const DOCS = (items) => ({ ok: true, value: { items } });
const person = (sections, extra = {}) => ({
  role: 'client', ok: true,
  representation: { found: true, type: 'מבוטח', receivedDate: '2026-08-04', debitAuthorization: 'חשבון בנק' },
  sections, ...extra,
});

async function cleanup() {
  await writeStaging(`
    delete from public.smart_form_filings where client_id = ${q(CLIENT)};
    delete from public.automation_jobs where client_id = ${q(CLIENT)};
    delete from public.onboarding_steps where client_id = ${q(CLIENT)};
    delete from public.clients where id = ${q(CLIENT)};
    delete from public.authorized_users where email = ${q(OTHER_EMAIL)};`);
  if (otherId) await admin.auth.admin.deleteUser(otherId);
}

try {
  await writeStaging(`
    insert into public.clients (id, user_id, first_name, last_name, id_number, family_status, phone, email, city, address, lifecycle_stage)
    values (${q(CLIENT)}, ${q(office.id)}, 'בדיקה', 'רשום-בבל', '012345674', 'married', '0524491120', 'qa-btlrec@example.test',
            'חיפה', 'הנביאים 5', 'active');`);

  // ── 1 · קליטה ראשונה ──
  const j1 = await finishJob([person({
    summary: { ok: true }, summaryFacts: SUMMARY('עצמאי'),
    documents: DOCS([
      { description: 'דין וחשבון', date: '2026-09-15', pages: 3, scanRef: 'aaaa1111bbbb2222' },
      { description: 'יפויי כוח', date: '2026-09-16', pages: 2, scanRef: 'cccc3333dddd4444' },
      { description: 'דין וחשבון', date: '2026-08-01', pages: 3 },
    ]),
    notices: { ok: true, value: { items: [
      { date: '2026-09-10', type: 'הודעת יפוי כח למייצג(מ)', category: 'representation', state: 'הודעה נש(מ)' },
      { date: '2026-09-01', type: 'דף תשלומים לעצמאי(מ)', category: 'payment' },
    ], otherCount: 3 } },
    reserveDuty: { ok: true, value: { rows: [{ year: 2025, benefit: 'מילואים', gross: 18450, taxWithheld: 2210, debtRepaymentGross: null, taxRefund: null }], otherBenefitsCount: 1 } },
    annualContributions: { ok: true, value: { years: [{ year: 2025, byAssessment: false, total: 12400,
      classes: [{ classification: 'עצמאי', charge: 'חלקי', annualBase: 120000, annualContribution: 12000 }] }] } },
    correspondence: { ok: true, value: { count: 0 } }, benefitDebt: { ok: true, value: { count: 0 } },
  })], '2026-09-20T08:00:00Z');
  const fam = await facts('familyStatus');
  ok('קליטה: מצב משפחתי נשמר כפי שב"ל רושם, עם מסך, משימה ומועד', fam.length === 1 && fam[0].value.raw === 'רווק' && fam[0].value.code === 'single'
    && fam[0].source_screen === 'summary' && fam[0].first_job_id === j1 && fam[0].first_seen_at.startsWith('2026-09-20'), fam);
  const [card] = await writeStaging(`select family_status from public.clients where id = ${q(CLIENT)}`);
  ok('הכרטיס לא נדרס (נשוי בכרטיס, רווק בב"ל)', card.family_status === 'married', card);
  const rep = await facts('representation');
  ok('ייצוג ואמצעי חיוב מתוצאות החיפוש', rep[0]?.value?.receivedDate === '2026-08-04' && (await facts('debitMethod'))[0]?.value?.raw === 'חשבון בנק', rep);
  const nts = await facts('notices');
  ok('הודעות: רק קטגוריה רלוונטית נשמרה (השרת מסנן גם הוא)', nts[0]?.value?.items?.length === 1 && nts[0].value.items[0].category === 'representation'
    && nts[0].value.otherCount === 3, nts[0]?.value);
  const rd = await facts('reserveDuty');
  ok('מילואים: שורה עם ברוטו וניכוי מס; גמלאות אחרות — ספירה', rd[0]?.value?.rows?.[0]?.gross === 18450 && rd[0].value.otherBenefitsCount === 1, rd[0]?.value);
  const docs = await writeStaging(`select description, doc_date::text as d, pages, scan_ref from public.btl_portal_documents where client_id = ${q(CLIENT)} order by doc_date`);
  ok('תיק מסמכים: שלושה מסמכים עם טביעת סריקה', docs.length === 3 && docs.some(d => d.scan_ref === 'aaaa1111bbbb2222'), docs);

  // ── 2 · אותם ערכים שוב ⇒ אין היסטוריה חדשה ──
  const j2 = await finishJob([person({ summary: { ok: true }, summaryFacts: SUMMARY('עצמאי'),
    documents: DOCS([{ description: 'דין וחשבון', date: '2026-09-15', pages: 3, scanRef: 'aaaa1111bbbb2222' }]) })], '2026-09-21T08:00:00Z');
  const fam2 = await facts('familyStatus');
  ok('ערך זהה ⇒ שורה אחת, «נקרא לאחרונה» התקדם', fam2.length === 1 && fam2[0].last_seen_at.startsWith('2026-09-21') && fam2[0].last_job_id === j2, fam2);
  const [dcount] = await writeStaging(`select count(*)::int as n from public.btl_portal_documents where client_id = ${q(CLIENT)}`);
  ok('מסמך שנקרא שוב — בלי כפילות; מסמך שלא הופיע נשאר כהיסטוריה', dcount.n === 3, dcount);

  // ── 3 · חובת תשלום השתנתה ⇒ היסטוריה ──
  await finishJob([person({ summary: { ok: true }, summaryFacts: SUMMARY('עובד (+)') })], '2026-09-25T08:00:00Z');
  const po = await facts('paymentObligation');
  ok('חובת תשלום השתנתה ⇒ שתי שורות (עצמאי עד 21.09, עובד (+) מ-25.09)', po.length === 2 && po[0].value.raw === 'עצמאי'
    && po[0].last_seen_at.startsWith('2026-09-21') && po[1].value.raw === 'עובד (+)' && po[1].first_seen_at.startsWith('2026-09-25'), po.map(r => [r.value.raw, r.first_seen_at, r.last_seen_at]));
  const rec = await rpc(office.db, 'get_btl_portal_record', { p_client_id: CLIENT });
  const cp = rec?.persons?.client?.facts?.paymentObligation;
  ok('תצוגה: הערך הנוכחי + ההיסטוריה', rec?.ok && cp?.value?.raw === 'עובד (+)' && cp.history?.[0]?.value?.raw === 'עצמאי', cp);

  // ── 4 · כשל קריאה אינו מוחק ──
  await finishJob([person({ summary: { ok: false, reason: 'summary_screen_not_reached' }, summaryFacts: { ok: false, reason: 'summary_unavailable' },
    notices: { ok: false, reason: 'side_link_failed' } })], '2026-09-26T08:00:00Z');
  await finishJob([{ role: 'client', ok: false, errorCode: 'navigation_failed' }], '2026-09-27T08:00:00Z');
  const po2 = await facts('paymentObligation');
  const nts2 = await facts('notices');
  ok('מקטע שנכשל / אדם שנכשל ⇒ הערך האחרון שאומת נשאר, בלי «נקרא» חדש', po2.length === 2 && po2[1].last_seen_at.startsWith('2026-09-25')
    && nts2.length === 1 && nts2[0].last_seen_at.startsWith('2026-09-20'), { po: po2.map(r => r.last_seen_at), n: nts2.map(r => r.last_seen_at) });

  // ── 5 · קלט פגום ⇒ נרשם על המשימה, בלי שמירה חלקית ──
  const jBad = await finishJob([person({ summary: { ok: true }, summaryFacts: SUMMARY('מינימליסט'),
    documents: DOCS([{ description: 'דין וחשבון', date: '2026-13-45', pages: 1 }]) })], '2026-09-28T08:00:00Z');
  const [bad] = await writeStaging(`select status, progress->>'portalIngestError' as err from public.automation_jobs where id = ${q(jBad)}`);
  const po3 = await facts('paymentObligation');
  ok('קלט פגום: המשימה נשארת «הצליחה», השגיאה נרשמת עליה', bad.status === 'succeeded' && !!bad.err, bad);
  ok('…ושום עובדה מאותה קליטה לא נשמרה (לא חלקי)', po3.length === 2 && !po3.some(r => r.value.raw === 'מינימליסט'), po3.map(r => r.value.raw));

  // ── 6 · 6101: ראיית קליטה ──
  const st = await rpc(office.db, 'smart_form_start', { p_client_id: CLIENT, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: ['start'] });
  const F = st.filingId;
  const early = await rpc(office.db, 'smart_form_receipt_candidates', { p_filing_id: F });
  ok('לפני הגשה ⇒ «לא הוגש», בלי מועמדים', early?.state === 'not_submitted', early);
  const draftConfirm = await rpc(office.db, 'smart_form_confirm_receipt', { p_filing_id: F, p_document_id: docs[0].id ?? 'x' });
  ok('אישור קליטה על טיוטה נדחה', draftConfirm?.error === 'not_submitted', draftConfirm);
  // הכנת מצב «הוגש» (הגשה עם ראיה נבדקה ב-staging-test-smart-form-6101) — כאן רק ההקשר.
  await writeStaging(`update public.smart_form_filings set state = 'submitted',
    submission = '{"channel":"representatives_portal","submittedAt":"2026-09-10","reference":"QA-REC-1"}'::jsonb where id = ${q(F)};`);
  const one = await rpc(office.db, 'smart_form_receipt_candidates', { p_filing_id: F });
  ok('«דין וחשבון» אחד אחרי ההגשה ⇒ מועמד יחיד (לא «יפויי כוח», לא דוח שקדם להגשה)', one?.state === 'single'
    && one.candidates.length === 1 && one.candidates[0].docDate === '2026-09-15', one);
  await finishJob([person({ documents: DOCS([{ description: 'דין וחשבון', date: '2026-09-22', pages: 2 }]) })], '2026-09-28T09:00:00Z');
  const two = await rpc(office.db, 'smart_form_receipt_candidates', { p_filing_id: F });
  ok('שני «דין וחשבון» ⇒ כמה מועמדים, נדרשת בחירה', two?.state === 'multiple' && two.candidates.length === 2, two?.state);
  const [poa] = await writeStaging(`select id from public.btl_portal_documents where client_id = ${q(CLIENT)} and description = 'יפויי כוח'`);
  const wrong = await rpc(office.db, 'smart_form_confirm_receipt', { p_filing_id: F, p_document_id: poa.id });
  ok('מסמך שאינו מועמד נדחה', wrong?.error === 'not_a_candidate', wrong);

  const { data: cu, error: cuErr } = await admin.auth.admin.createUser({ email: OTHER_EMAIL, password: OTHER_PASS, email_confirm: true });
  if (cuErr) throw new Error('createUser: ' + cuErr.message);
  otherId = cu.user.id;
  await writeStaging(`insert into public.authorized_users (email, role, active, note) values (${q(OTHER_EMAIL)}, 'owner', true, 'btlrec isolation test — temporary')`);
  const other = await signIn(OTHER_EMAIL, OTHER_PASS);
  const pick = two.candidates.find(c => c.docDate === '2026-09-15');
  const oConfirm = await rpc(other.db, 'smart_form_confirm_receipt', { p_filing_id: F, p_document_id: pick.id });
  ok('משרד אחר אינו מאשר קליטה', oConfirm?.error === 'forbidden', oConfirm);

  const conf = await rpc(office.db, 'smart_form_confirm_receipt', { p_filing_id: F, p_document_id: pick.id, p_note: 'תואם לתאריך ההגשה בפורטל' });
  ok('הרו"ח מאשר את ההתאמה', conf?.ok === true, conf);
  const [fr] = await writeStaging(`select receipt from public.smart_form_filings where id = ${q(F)}`);
  ok('הראיה נשמרה כפי שהייתה באישור (תאריך, עמודים, טביעה, מועמדים, מי)', fr.receipt?.docDate === '2026-09-15' && fr.receipt.pages === 3
    && fr.receipt.scanRef === 'aaaa1111bbbb2222' && fr.receipt.candidatesAtConfirmation === 2 && fr.receipt.confirmedBy === office.id
    && fr.receipt.source && fr.receipt.observedJobId, fr.receipt);
  const [ev] = await writeStaging(`select detail from public.smart_form_events where filing_id = ${q(F)} and kind = 'receipt_confirmed'`);
  ok('ביומן: מזהה, תאריך וכמות — בלי ההערה החופשית', ev?.detail?.candidates === 2 && !JSON.stringify(ev.detail).includes('תואם'), ev?.detail);
  const [stp] = await writeStaging(`select payload->'smartForm'->>'stateLabel' as l, payload->'smartForm'->>'receivedAt' as r from public.onboarding_steps where id = ${q(st.stepId)}`);
  ok('השורה ב«בקשות»: «הוגש ונקלט» רק אחרי האישור', stp.l === 'הוגש ונקלט בביטוח לאומי — ממתין לתשובה' && stp.r === '2026-09-15', stp);
  const again = await rpc(office.db, 'smart_form_confirm_receipt', { p_filing_id: F, p_document_id: pick.id });
  const other2 = await rpc(office.db, 'smart_form_confirm_receipt', { p_filing_id: F, p_document_id: two.candidates.find(c => c.id !== pick.id).id });
  ok('אישור חוזר — אידמפוטנטי; מסמך אחר — נדחה', again?.existing === true && other2?.error === 'already_confirmed', { again, other2 });
  const after = await rpc(office.db, 'smart_form_receipt_candidates', { p_filing_id: F });
  ok('אחרי אישור ⇒ «אושר» עם הראיה', after?.state === 'confirmed' && after.receipt?.documentId === pick.id, after?.state);

  // ── 7 · בידוד ו-anon ──
  const { data: oFacts } = await other.db.from('btl_portal_facts').select('id').eq('client_id', CLIENT);
  const { data: oDocs } = await other.db.from('btl_portal_documents').select('id').eq('client_id', CLIENT);
  ok('משרד אחר אינו רואה עובדות/מסמכים', (oFacts ?? []).length === 0 && (oDocs ?? []).length === 0, { oFacts, oDocs });
  const oRec = await rpc(other.db, 'get_btl_portal_record', { p_client_id: CLIENT });
  const oCand = await rpc(other.db, 'smart_form_receipt_candidates', { p_filing_id: F });
  ok('משרד אחר — forbidden בקריאה ובמועמדים', oRec?.error === 'forbidden' && oCand?.error === 'forbidden', { oRec, oCand });
  const { error: insErr } = await office.db.from('btl_portal_facts').insert({ user_id: office.id, client_id: CLIENT, person_role: 'client',
    fact_key: 'familyStatus', value: { raw: 'נשוי' }, source_screen: 'summary', first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
  ok('גם הבעלים אינו כותב ישירות (רק הקליטה בשרת)', !!insErr, insErr?.message);
  const aRec = await rpc(anon, 'get_btl_portal_record', { p_client_id: CLIENT });
  ok('anon — אין גישה', aRec?.pgError === true || aRec?.error === 'forbidden', aRec);
} catch (e) {
  fail++;
  console.error('✗ חריגה:', e.message);
} finally {
  await cleanup();
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
